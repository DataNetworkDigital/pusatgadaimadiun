import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import {
  collection, addDoc, updateDoc, deleteDoc, doc, onSnapshot,
  query, orderBy, serverTimestamp, writeBatch, getDocs, increment, Timestamp, runTransaction,
} from 'firebase/firestore';
import { db } from '../firebase';
import { useAuth } from './AuthContext';
import { useDemo } from './DemoContext';
import { useToast } from './ToastContext';
import { normalizeProject } from '../utils/normalizeProject';
import { hasAnyReceipt, isSettled, projectReceivedTotal } from '../utils/paymentStatus';
import { generateProjectSchedule, recomputeUnpaidSchedule } from '../utils/projectSchedule';
import { notifyTelegram, syncToDanaTrack } from '../utils/telegram';
import { allocateReceipt, openRows } from '../utils/allocation';
import { findCashAccount, CASH_ACCOUNT_NAME } from '../utils/cashAccount';
import { applySettlement } from '../utils/settlement';
import { applyReceiptCancel, applyReceiptEdit, applyReceiptMove } from '../utils/receiptOps';
import { toDate } from '../utils/formatDate';
import { isProjectMoney } from '../utils/projectMoney';
import { formatCurrency } from '../utils/formatCurrency';

const DataContext = createContext(null);

export function DataProvider({ children }) {
  const { isUnlocked } = useAuth();
  const { collectionPrefix, isDemo } = useDemo();
  const { showToast } = useToast();
  const C = (name) => `${collectionPrefix}${name}`;
  const toast = (msg) => showToast?.(msg);
  const [accounts, setAccounts] = useState([]);
  const [transactions, setTransactions] = useState([]);
  const [debts, setDebts] = useState([]);
  const [reminders, setReminders] = useState([]);
  const [projects, setProjects] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!isDemo && !isUnlocked) return;
    setLoading(true);
    const loaded = { a: false, t: false, d: false, r: false, p: false };
    const markLoaded = (k) => {
      loaded[k] = true;
      if (loaded.a && loaded.t && loaded.d && loaded.r && loaded.p) setLoading(false);
    };

    const onErr = (k) => (err) => {
      console.warn(`Snapshot ${k} failed:`, err?.code || err?.message);
      markLoaded(k);
    };

    const unsubA = onSnapshot(
      query(collection(db, C('accounts')), orderBy('createdAt', 'asc')),
      (snap) => {
        setAccounts(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
        markLoaded('a');
      },
      onErr('a')
    );
    const unsubT = onSnapshot(
      query(collection(db, C('transactions')), orderBy('date', 'desc')),
      (snap) => {
        setTransactions(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
        markLoaded('t');
      },
      onErr('t')
    );
    const unsubD = onSnapshot(
      query(collection(db, C('debts')), orderBy('createdAt', 'desc')),
      (snap) => {
        setDebts(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
        markLoaded('d');
      },
      onErr('d')
    );
    const unsubR = onSnapshot(
      query(collection(db, C('reminders')), orderBy('createdAt', 'desc')),
      (snap) => {
        setReminders(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
        markLoaded('r');
      },
      onErr('r')
    );
    const unsubP = onSnapshot(
      query(collection(db, C('projects')), orderBy('createdAt', 'desc')),
      (snap) => {
        // One shape for every screen. Stored documents are untouched; the
        // receipts view is derived on read until the Bagian B4 migration.
        setProjects(snap.docs.map((d) => normalizeProject({ id: d.id, ...d.data() })));
        markLoaded('p');
      },
      onErr('p')
    );

    return () => { unsubA(); unsubT(); unsubD(); unsubR(); unsubP(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isUnlocked, isDemo, collectionPrefix]);

  // ===== Accounts =====
  async function addAccount(data) {
    const ref = await addDoc(collection(db, C('accounts')), {
      name: data.name,
      accountNumber: data.accountNumber || '',
      balance: Number(data.balance) || 0,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    toast('Rekening berhasil ditambahkan');
    return ref;
  }

  async function updateAccount(id, data) {
    const update = { updatedAt: serverTimestamp() };
    if (data.name !== undefined) update.name = data.name;
    if (data.accountNumber !== undefined) update.accountNumber = data.accountNumber;
    if (data.balance !== undefined) update.balance = Number(data.balance);
    await updateDoc(doc(db, C('accounts'), id), update);
    toast('Rekening tersimpan');
  }

  async function deleteAccount(id) {
    await deleteDoc(doc(db, C('accounts'), id));
    toast('Rekening dihapus');
  }

  // ===== Transactions =====
  async function addTransaction(data) {
    const batch = writeBatch(db);
    const txRef = doc(collection(db, C('transactions')));
    const date = data.date instanceof Date ? Timestamp.fromDate(data.date) : data.date;

    batch.set(txRef, {
      type: data.type,
      amount: Number(data.amount),
      description: data.description || '',
      date,
      fromAccount: data.fromAccount || null,
      toAccount: data.toAccount || null,
      debtId: data.debtId || null,
      createdAt: serverTimestamp(),
    });

    const amt = Number(data.amount);
    if (data.type === 'income' && data.toAccount) {
      batch.update(doc(db, C('accounts'), data.toAccount), { balance: increment(amt), updatedAt: serverTimestamp() });
    } else if (data.type === 'expense' && data.fromAccount) {
      batch.update(doc(db, C('accounts'), data.fromAccount), { balance: increment(-amt), updatedAt: serverTimestamp() });
    } else if (data.type === 'transfer' && data.fromAccount && data.toAccount) {
      batch.update(doc(db, C('accounts'), data.fromAccount), { balance: increment(-amt), updatedAt: serverTimestamp() });
      batch.update(doc(db, C('accounts'), data.toAccount), { balance: increment(amt), updatedAt: serverTimestamp() });
    }
    await batch.commit();
    toast('Transaksi berhasil disimpan');
    return txRef.id;
  }

  // Defence in depth for the Transaksi page, which hides Edit and Hapus for
  // project money: see isProjectMoney.
  const PROJECT_TX_MESSAGE = 'Transaksi ini milik project. Ubah atau batalkan dari halaman project.';

  async function deleteTransaction(id) {
    const tx = transactions.find((t) => t.id === id);
    if (!tx) return;
    if (isProjectMoney(tx, projects, !loading)) throw new Error(PROJECT_TX_MESSAGE);
    const batch = writeBatch(db);
    const amt = Number(tx.amount);
    if (tx.type === 'income' && tx.toAccount) {
      batch.update(doc(db, C('accounts'), tx.toAccount), { balance: increment(-amt), updatedAt: serverTimestamp() });
    } else if (tx.type === 'expense' && tx.fromAccount) {
      batch.update(doc(db, C('accounts'), tx.fromAccount), { balance: increment(amt), updatedAt: serverTimestamp() });
    } else if (tx.type === 'transfer' && tx.fromAccount && tx.toAccount) {
      batch.update(doc(db, C('accounts'), tx.fromAccount), { balance: increment(amt), updatedAt: serverTimestamp() });
      batch.update(doc(db, C('accounts'), tx.toAccount), { balance: increment(-amt), updatedAt: serverTimestamp() });
    }
    if (tx.debtId) {
      const debt = debts.find((d) => d.id === tx.debtId);
      if (debt) {
        const newRemaining = Number(debt.remainingAmount) + amt;
        const newInstallments = (debt.installments || []).filter((ins) => ins.transactionId !== id);
        const total = Number(debt.totalAmount) || 0;
        const newStatus = newRemaining >= total ? 'unpaid' : newInstallments.length > 0 ? 'partial' : 'unpaid';
        batch.update(doc(db, C('debts'), tx.debtId), {
          remainingAmount: newRemaining,
          installments: newInstallments,
          status: newStatus,
        });
      }
    }
    batch.delete(doc(db, C('transactions'), id));
    await batch.commit();
    toast('Transaksi dihapus');
  }

  async function updateTransaction(id, newData) {
    const old = transactions.find((t) => t.id === id);
    if (!old) return;
    if (isProjectMoney(old, projects, !loading)) throw new Error(PROJECT_TX_MESSAGE);
    const batch = writeBatch(db);
    const oldAmt = Number(old.amount);
    if (old.type === 'income' && old.toAccount) {
      batch.update(doc(db, C('accounts'), old.toAccount), { balance: increment(-oldAmt), updatedAt: serverTimestamp() });
    } else if (old.type === 'expense' && old.fromAccount) {
      batch.update(doc(db, C('accounts'), old.fromAccount), { balance: increment(oldAmt), updatedAt: serverTimestamp() });
    } else if (old.type === 'transfer' && old.fromAccount && old.toAccount) {
      batch.update(doc(db, C('accounts'), old.fromAccount), { balance: increment(oldAmt), updatedAt: serverTimestamp() });
      batch.update(doc(db, C('accounts'), old.toAccount), { balance: increment(-oldAmt), updatedAt: serverTimestamp() });
    }
    const newAmt = Number(newData.amount);
    if (newData.type === 'income' && newData.toAccount) {
      batch.update(doc(db, C('accounts'), newData.toAccount), { balance: increment(newAmt), updatedAt: serverTimestamp() });
    } else if (newData.type === 'expense' && newData.fromAccount) {
      batch.update(doc(db, C('accounts'), newData.fromAccount), { balance: increment(-newAmt), updatedAt: serverTimestamp() });
    } else if (newData.type === 'transfer' && newData.fromAccount && newData.toAccount) {
      batch.update(doc(db, C('accounts'), newData.fromAccount), { balance: increment(-newAmt), updatedAt: serverTimestamp() });
      batch.update(doc(db, C('accounts'), newData.toAccount), { balance: increment(newAmt), updatedAt: serverTimestamp() });
    }
    const date = newData.date instanceof Date ? Timestamp.fromDate(newData.date) : newData.date;
    batch.update(doc(db, C('transactions'), id), {
      type: newData.type,
      amount: newAmt,
      description: newData.description || '',
      date,
      fromAccount: newData.fromAccount || null,
      toAccount: newData.toAccount || null,
    });
    if (old.debtId) {
      const debt = debts.find((d) => d.id === old.debtId);
      if (debt) {
        const reverted = Number(debt.remainingAmount) + Number(old.amount);
        const newRemaining = reverted - newAmt;
        const installments = (debt.installments || []).map((ins) =>
          ins.transactionId === id ? { ...ins, amount: newAmt } : ins
        );
        const total = Number(debt.totalAmount) || 0;
        const newStatus = newRemaining <= 0 ? 'paid' : newRemaining >= total ? 'unpaid' : 'partial';
        batch.update(doc(db, C('debts'), old.debtId), {
          remainingAmount: newRemaining,
          installments,
          status: newStatus,
        });
      }
    }
    await batch.commit();
    toast('Transaksi diperbarui');
  }

  // ===== Debts =====
  async function addDebt(data) {
    const totalAmount = Number(data.totalAmount);
    const ref = await addDoc(collection(db, C('debts')), {
      type: data.type,
      personName: data.personName,
      totalAmount,
      remainingAmount: totalAmount,
      startDate: data.startDate instanceof Date ? Timestamp.fromDate(data.startDate) : data.startDate,
      dueDate: data.dueDate instanceof Date ? Timestamp.fromDate(data.dueDate) : data.dueDate,
      description: data.description || '',
      status: 'unpaid',
      installments: [],
      createdAt: serverTimestamp(),
    });
    toast(data.type === 'utang' ? 'Utang ditambahkan' : 'Piutang ditambahkan');
    return ref;
  }

  async function updateDebt(id, data) {
    const update = {};
    if (data.personName !== undefined) update.personName = data.personName;
    if (data.totalAmount !== undefined) update.totalAmount = Number(data.totalAmount);
    if (data.remainingAmount !== undefined) update.remainingAmount = Number(data.remainingAmount);
    if (data.startDate !== undefined) update.startDate = data.startDate instanceof Date ? Timestamp.fromDate(data.startDate) : data.startDate;
    if (data.dueDate !== undefined) update.dueDate = data.dueDate instanceof Date ? Timestamp.fromDate(data.dueDate) : data.dueDate;
    if (data.description !== undefined) update.description = data.description;
    if (data.status !== undefined) update.status = data.status;
    await updateDoc(doc(db, C('debts'), id), update);
    toast('Catatan tersimpan');
  }

  async function deleteDebt(id) {
    await deleteDoc(doc(db, C('debts'), id));
    toast('Catatan dihapus');
  }

  async function payInstallment(debtId, amount, accountId) {
    const debt = debts.find((d) => d.id === debtId);
    if (!debt) throw new Error('Utang/Piutang tidak ditemukan');
    const amt = Number(amount);
    if (amt <= 0) throw new Error('Jumlah harus lebih dari 0');
    if (amt > debt.remainingAmount) throw new Error('Jumlah melebihi sisa');
    if (!accountId) throw new Error('Pilih rekening');

    const txType = debt.type === 'utang' ? 'expense' : 'income';
    const now = new Date();
    const batch = writeBatch(db);
    const txRef = doc(collection(db, C('transactions')));

    batch.set(txRef, {
      type: txType,
      amount: amt,
      description: `${debt.type === 'utang' ? 'Bayar utang' : 'Terima piutang'} ke/dari ${debt.personName}`,
      date: Timestamp.fromDate(now),
      fromAccount: txType === 'expense' ? accountId : null,
      toAccount: txType === 'income' ? accountId : null,
      debtId,
      createdAt: serverTimestamp(),
    });

    if (txType === 'expense') {
      batch.update(doc(db, C('accounts'), accountId), { balance: increment(-amt), updatedAt: serverTimestamp() });
    } else {
      batch.update(doc(db, C('accounts'), accountId), { balance: increment(amt), updatedAt: serverTimestamp() });
    }

    const newRemaining = debt.remainingAmount - amt;
    const newStatus = newRemaining <= 0 ? 'paid' : 'partial';
    const installment = { amount: amt, date: Timestamp.fromDate(now), transactionId: txRef.id };
    batch.update(doc(db, C('debts'), debtId), {
      remainingAmount: newRemaining,
      status: newStatus,
      installments: [...(debt.installments || []), installment],
    });

    await batch.commit();
    toast(debt.type === 'utang' ? 'Cicilan dibayar' : 'Cicilan diterima');
  }

  // ===== Reminders =====
  async function addReminder(data) {
    const ref = await addDoc(collection(db, C('reminders')), {
      type: data.type === 'income' ? 'income' : 'expense',
      title: data.title,
      dayOfMonth: Number(data.dayOfMonth),
      amount: data.amount ? Number(data.amount) : null,
      accountId: data.accountId || null,
      isActive: data.isActive !== false,
      createdAt: serverTimestamp(),
    });
    toast('Pembayaran berulang ditambahkan');
    return ref;
  }

  async function updateReminder(id, data) {
    await updateDoc(doc(db, C('reminders'), id), data);
    if (!('isActive' in data && Object.keys(data).length === 1)) {
      toast('Pembayaran berulang tersimpan');
    }
  }

  async function deleteReminder(id) {
    await deleteDoc(doc(db, C('reminders'), id));
    toast('Pembayaran berulang dihapus');
  }

  // ===== Projects =====
  async function addProject(data) {
    const principalAmount = Number(data.principalAmount) || 0;
    const disbursedAmount = Number(data.disbursedAmount) || 0;
    // Tiered return: tier1 (months 1-3) + tier2 (months 4+). `monthlyReturnPct`
    // is kept in sync with tier1 for backward-compatible reads/exports.
    const returnPctTier1 = data.returnPctTier1 != null
      ? Number(data.returnPctTier1)
      : Number(data.monthlyReturnPct) || 0;
    const returnPctTier2 = data.returnPctTier2 != null
      ? Number(data.returnPctTier2)
      : returnPctTier1;
    const monthlyReturnPct = returnPctTier1;
    const durationMonths = Number(data.durationMonths) || 0;
    const startDate = data.startDate instanceof Date ? data.startDate : data.startDate?.toDate?.() || new Date();
    const paymentDayOfMonth = Number(data.paymentDayOfMonth) || startDate.getDate();
    if (!data.sourceAccountId) throw new Error('Pilih rekening sumber pendanaan');
    if (principalAmount <= 0) throw new Error('Nilai project harus lebih dari 0');
    if (disbursedAmount <= 0) throw new Error('Modal keluar harus lebih dari 0');
    if (durationMonths <= 0) throw new Error('Durasi project minimal 1 bulan');

    const payments = generateProjectSchedule({
      principalAmount,
      returnPctTier1,
      returnPctTier2,
      durationMonths,
      startDate,
      paymentDayOfMonth,
    });

    const batch = writeBatch(db);
    const projectRef = doc(collection(db, C('projects')));
    const fundingTxRef = doc(collection(db, C('transactions')));

    batch.set(fundingTxRef, {
      type: 'expense',
      amount: disbursedAmount,
      description: `Pendanaan project: ${data.name}`,
      date: Timestamp.fromDate(startDate),
      fromAccount: data.sourceAccountId,
      toAccount: null,
      debtId: null,
      projectId: projectRef.id,
      createdAt: serverTimestamp(),
    });
    batch.update(doc(db, C('accounts'), data.sourceAccountId), {
      balance: increment(-disbursedAmount),
      updatedAt: serverTimestamp(),
    });

    batch.set(projectRef, {
      name: data.name,
      ownerName: data.ownerName || null,
      contractNumber: data.contractNumber || null,
      phone: data.phone || null,
      nik: data.nik || null,
      address: data.address || null,
      collateral: data.collateral || null,
      description: data.description || '',
      principalAmount,
      disbursedAmount,
      monthlyReturnPct,
      returnPctTier1,
      returnPctTier2,
      durationMonths,
      startDate: Timestamp.fromDate(startDate),
      paymentDayOfMonth,
      sourceAccountId: data.sourceAccountId,
      proofUrl: data.proofUrl || null,
      proofFileName: data.proofFileName || null,
      status: 'active',
      payments,
      fundingTransactionId: fundingTxRef.id,
      createdAt: serverTimestamp(),
    });

    await batch.commit();
    toast('Project berhasil dibuat');

    const acct = accounts.find((a) => a.id === data.sourceAccountId);
    const rateLabel = returnPctTier2 !== returnPctTier1
      ? `${returnPctTier1}% (bln 1-3) / ${returnPctTier2}% (bln 4+)`
      : `${returnPctTier1}%/bln`;
    notifyTelegram(
      `🆕 <b>Project Baru</b>\n` +
      `Nama: ${data.name}\n` +
      `Pemilik: ${data.ownerName || '-'}\n` +
      `No HP: ${data.phone || '-'}\n` +
      `NIK: ${data.nik || '-'}\n` +
      `Alamat: ${data.address || '-'}\n` +
      `Agunan: ${data.collateral || '-'}\n` +
      `Nilai: Rp ${Number(principalAmount).toLocaleString('id-ID')}\n` +
      `Modal keluar: Rp ${Number(disbursedAmount).toLocaleString('id-ID')}\n` +
      `Return: ${rateLabel} × ${durationMonths} bln\n` +
      `Rekening: ${acct?.name || '-'}`
    );

    syncToDanaTrack({ name: data.name, principalAmount, disbursedAmount, monthlyReturnPct, durationMonths, startDate });

    return projectRef.id;
  }

  async function updateProject(id, data) {
    const project = projects.find((p) => p.id === id);
    if (!project) throw new Error('Project tidak ditemukan');
    const hasReceived = hasAnyReceipt(project);

    const update = {};
    // Text/metadata fields — always editable
    if (data.name !== undefined) update.name = data.name;
    if (data.ownerName !== undefined) update.ownerName = data.ownerName;
    if (data.contractNumber !== undefined) update.contractNumber = data.contractNumber;
    if (data.phone !== undefined) update.phone = data.phone;
    if (data.nik !== undefined) update.nik = data.nik;
    if (data.address !== undefined) update.address = data.address;
    if (data.collateral !== undefined) update.collateral = data.collateral;
    if (data.description !== undefined) update.description = data.description;
    if (data.proofUrl !== undefined) update.proofUrl = data.proofUrl;
    if (data.proofFileName !== undefined) update.proofFileName = data.proofFileName;

    // Capital/funding-flow fields — only safe if no payments received
    const sameDay = (a, b) => {
      if (!a || !b) return a === b;
      return a.getFullYear() === b.getFullYear() &&
             a.getMonth() === b.getMonth() &&
             a.getDate() === b.getDate();
    };
    const capitalChange =
      (data.principalAmount !== undefined && Number(data.principalAmount) !== project.principalAmount) ||
      (data.disbursedAmount !== undefined && Number(data.disbursedAmount) !== project.disbursedAmount) ||
      (data.sourceAccountId !== undefined && data.sourceAccountId !== project.sourceAccountId) ||
      (data.startDate !== undefined && (() => {
        const newD = data.startDate instanceof Date ? data.startDate : data.startDate?.toDate?.();
        const oldD = project.startDate?.toDate?.();
        return !sameDay(newD, oldD);
      })());
    if (capitalChange && hasReceived) {
      throw new Error('Modal/rekening/tanggal mulai tidak bisa diubah karena sudah ada pembayaran masuk.');
    }

    // When the start date changes, the funding transaction must be re-dated too,
    // otherwise it stays attributed to the wrong month (e.g. project input month).
    let newFundingDate = null;

    // Schedule-affecting fields
    const scheduleChange =
      data.monthlyReturnPct !== undefined ||
      data.returnPctTier1 !== undefined ||
      data.returnPctTier2 !== undefined ||
      data.durationMonths !== undefined ||
      data.paymentDayOfMonth !== undefined ||
      data.principalAmount !== undefined ||
      data.startDate !== undefined;

    if (scheduleChange) {
      const newPrincipal = data.principalAmount !== undefined ? Number(data.principalAmount) : project.principalAmount;
      // Resolve tier rates, falling back to the project's existing values (and
      // legacy flat monthlyReturnPct when tiers were never stored).
      const curTier1 = project.returnPctTier1 != null ? project.returnPctTier1 : project.monthlyReturnPct;
      const curTier2 = project.returnPctTier2 != null ? project.returnPctTier2 : curTier1;
      const newTier1 = data.returnPctTier1 !== undefined
        ? Number(data.returnPctTier1)
        : (data.monthlyReturnPct !== undefined ? Number(data.monthlyReturnPct) : curTier1);
      const newTier2 = data.returnPctTier2 !== undefined ? Number(data.returnPctTier2) : curTier2;
      const newDuration = data.durationMonths !== undefined ? Number(data.durationMonths) : project.durationMonths;
      const newDay = data.paymentDayOfMonth !== undefined ? Number(data.paymentDayOfMonth) : project.paymentDayOfMonth;
      const newStart = data.startDate !== undefined
        ? (data.startDate instanceof Date ? data.startDate : data.startDate.toDate())
        : (project.startDate?.toDate?.() || new Date());
      if (newDuration <= 0) throw new Error('Durasi project minimal 1 bulan');
      if (newPrincipal <= 0) throw new Error('Nilai project harus lebih dari 0');
      if (newDay < 1 || newDay > 31) throw new Error('Tanggal pembayaran harus 1-31');

      update.payments = recomputeUnpaidSchedule(project.payments || [], {
        principalAmount: newPrincipal,
        returnPctTier1: newTier1,
        returnPctTier2: newTier2,
        durationMonths: newDuration,
        startDate: newStart,
        paymentDayOfMonth: newDay,
      });
      if (data.principalAmount !== undefined) update.principalAmount = newPrincipal;
      if (data.returnPctTier1 !== undefined || data.monthlyReturnPct !== undefined) {
        update.returnPctTier1 = newTier1;
        update.monthlyReturnPct = newTier1;
      }
      if (data.returnPctTier2 !== undefined) update.returnPctTier2 = newTier2;
      if (data.durationMonths !== undefined) update.durationMonths = newDuration;
      if (data.paymentDayOfMonth !== undefined) update.paymentDayOfMonth = newDay;
      if (data.startDate !== undefined) {
        update.startDate = Timestamp.fromDate(newStart);
        newFundingDate = update.startDate;
      }
    }

    // disbursedAmount and sourceAccountId require batch with account balance adjustment
    const needBatch =
      (data.disbursedAmount !== undefined && Number(data.disbursedAmount) !== project.disbursedAmount) ||
      (data.sourceAccountId !== undefined && data.sourceAccountId !== project.sourceAccountId);

    if (needBatch) {
      const newDisbursed = data.disbursedAmount !== undefined ? Number(data.disbursedAmount) : project.disbursedAmount;
      const newSourceId = data.sourceAccountId !== undefined ? data.sourceAccountId : project.sourceAccountId;
      if (newDisbursed <= 0) throw new Error('Modal keluar harus lebih dari 0');
      if (!newSourceId) throw new Error('Pilih rekening sumber');

      const batch = writeBatch(db);
      // Reverse old funding effect on old account
      if (project.fundingTransactionId) {
        batch.update(doc(db, C('accounts'), project.sourceAccountId), {
          balance: increment(project.disbursedAmount || 0),
          updatedAt: serverTimestamp(),
        });
        // Apply new funding effect on new account (could be same)
        batch.update(doc(db, C('accounts'), newSourceId), {
          balance: increment(-newDisbursed),
          updatedAt: serverTimestamp(),
        });
        // Update funding transaction (re-date it too if the start date changed)
        batch.update(doc(db, C('transactions'), project.fundingTransactionId), {
          amount: newDisbursed,
          fromAccount: newSourceId,
          ...(newFundingDate ? { date: newFundingDate } : {}),
        });
      }
      update.disbursedAmount = newDisbursed;
      update.sourceAccountId = newSourceId;
      if (Object.keys(update).length > 0) {
        batch.update(doc(db, C('projects'), id), update);
      }
      await batch.commit();
      toast('Project tersimpan');
      return;
    }

    if (Object.keys(update).length === 0) return;
    if (newFundingDate && project.fundingTransactionId) {
      // Keep the project doc and its funding transaction date in sync atomically.
      const batch = writeBatch(db);
      batch.update(doc(db, C('projects'), id), update);
      batch.update(doc(db, C('transactions'), project.fundingTransactionId), { date: newFundingDate });
      await batch.commit();
    } else {
      await updateDoc(doc(db, C('projects'), id), update);
    }
    toast('Project tersimpan');
  }

  // Where money that comes in lands. `account` is either an account id or the
  // string 'cash'. Cash uses the Kas account when the owner has one; otherwise
  // it is created in the same write (`createRef`), so cash on hand still counts
  // in the dashboard total instead of vanishing.
  function resolveMoneyIn(account) {
    if (account !== 'cash') return { id: account, createRef: null };
    const existing = findCashAccount(accounts);
    if (existing) return { id: existing.id, createRef: null };
    const createRef = doc(collection(db, C('accounts')));
    return { id: createRef.id, createRef };
  }

  // Credits money to a resolved account. `writer` is a write batch or a
  // Firestore transaction; both have set() and update().
  function creditResolved(writer, target, amount) {
    if (target.createRef) {
      writer.set(target.createRef, {
        name: CASH_ACCOUNT_NAME,
        accountNumber: '',
        kind: 'cash',
        balance: amount,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    } else {
      writer.update(doc(db, C('accounts'), target.id), {
        balance: increment(amount),
        updatedAt: serverTimestamp(),
      });
    }
    return target.id;
  }

  function creditMoneyIn(writer, account, amount) {
    return creditResolved(writer, resolveMoneyIn(account), amount);
  }

  // Writers of a project's money read the project from the server inside a
  // Firestore transaction and write in the same one. Reading React state
  // instead can start from a stale receipts array when two devices save at
  // the same moment, and the second save would erase the first receipt while
  // its transaction and balance change survive; a transaction retries with
  // the fresh document instead.
  //
  // Each call carries a write id that the writer stores on the project as
  // `lastWriteId`. After a connection error the SDK may run the transaction
  // again; if the first commit did land and only its answer was lost, the
  // rerun finds its own id and returns the first result instead of saving the
  // same money twice.
  //
  // It needs a connection. Offline it gives up after a few retries (several
  // seconds of "Menyimpan…") with a message that says whether anything could
  // have been saved. The app keeps no offline cache, so a change shown before
  // the server has it would be lost when the app closes.
  async function inProjectTransaction(projectId, work, { missingOk = false, alreadyDone = null, seenWriteId } = {}) {
    const writeId = doc(collection(db, C('projects'))).id;
    let lastResult;
    // Set once any attempt reaches commit and never cleared: a later attempt
    // that cannot even read does not mean an earlier commit failed to land.
    let reachedCommit = false;
    try {
      return await runTransaction(db, async (t) => {
        const ref = doc(db, C('projects'), projectId);
        const snap = await t.get(ref);
        if (!snap.exists()) {
          // Gone already: deleted by this very call on an earlier attempt, or
          // by another device. Only a delete may treat that as done.
          if (missingOk) return lastResult;
          throw new Error('Project tidak ditemukan');
        }
        const project = normalizeProject({ id: snap.id, ...snap.data() });
        // An earlier attempt of this call landed and only its answer was lost.
        // `alreadyDone` recognises it by an id made before the transaction,
        // which still holds if another device wrote in between.
        if (project.lastWriteId === writeId || alreadyDone?.(project)) return lastResult;
        // The owner decided on what the screen showed. If the project has been
        // written since, that picture is stale: say so rather than save.
        if (seenWriteId !== undefined && (project.lastWriteId ?? null) !== seenWriteId) {
          throw new Error('Data project ini baru saja berubah. Periksa lagi, lalu simpan.');
        }
        lastResult = await work(t, project, ref, writeId);
        reachedCommit = true;
        return lastResult;
      });
    } catch (e) {
      throw friendlyWriteError(e, reachedCommit);
    }
  }

  // What deleting a transaction does to balances, as deleteTransaction would
  // undo it: the money goes back where it came from, whatever the Transaksi
  // page may have turned the transaction into. [accountId, delta] pairs.
  function reversalOf(tx) {
    const amt = Number(tx?.amount) || 0;
    if (!amt) return [];
    if (tx.type === 'income') return [[tx.toAccount, -amt]];
    if (tx.type === 'expense') return [[tx.fromAccount, amt]];
    if (tx.type === 'transfer') return [[tx.fromAccount, amt], [tx.toAccount, -amt]];
    return [];
  }

  // Firestore's own errors are English and technical. The owner gets one that
  // says what happened and whether anything was saved. Errors a writer threw
  // itself are already in Indonesian and pass through unchanged.
  function friendlyWriteError(e, reachedCommit) {
    const code = e?.code;
    if (code === 'unavailable' || code === 'deadline-exceeded' || /offline/i.test(e?.message || '')) {
      return new Error(
        reachedCommit
          ? 'Koneksi internet terputus saat menyimpan. Cek dulu apakah perubahan sudah masuk sebelum mencoba lagi.'
          : 'Koneksi internet terputus. Tidak ada yang tersimpan, coba lagi.',
        { cause: e }
      );
    }
    if (code === 'not-found') {
      return new Error('Data yang dibutuhkan (misalnya rekening) sudah tidak ada. Tidak ada yang tersimpan.', { cause: e });
    }
    if (code === 'aborted' || code === 'failed-precondition') {
      return new Error('Project ini sedang diubah dari perangkat lain. Tidak ada yang tersimpan, coba lagi.', { cause: e });
    }
    if (code === 'permission-denied') {
      return new Error('Tidak punya izin menyimpan. Buka ulang aplikasi, lalu coba lagi.', { cause: e });
    }
    return e;
  }

  function receiptDescription(project, allocations) {
    return `Pembayaran project: ${project.name} (bln ${allocations.map((a) => a.no).join(', ')})`;
  }

  // One arrival of money: allocated across the tagihan it covers, oldest first,
  // and stored as a receipt that carries its own transaction.
  async function recordReceipt(projectId, { amount, date, account, startNo = null, seenWriteId }) {
    const amt = Math.round(Number(amount) || 0);
    if (amt <= 0) throw new Error('Jumlah harus lebih dari 0');
    if (!account) throw new Error('Pilih rekening tujuan');
    const recvDate = date instanceof Date ? date : new Date();

    // Made before the transaction so a rerun can recognise its own receipt.
    const txRef = doc(collection(db, C('transactions')));
    const count = await inProjectTransaction(projectId, (t, project, ref, writeId) => {
      // Checked on the fresh read: another device may have closed it.
      if (project.status !== 'active') throw new Error('Project ini sudah ditutup. Pembayaran tidak dicatat.');
      if (startNo != null && !openRows(project).some((r) => r.no === startNo)) {
        throw new Error(`Tagihan bulan ${startNo} sudah lunas. Pilih tagihan lain.`);
      }
      const { allocations, leftover } = allocateReceipt(project, amt, startNo);
      if (!allocations.length) {
        throw new Error('Tidak ada tagihan yang masih terbuka untuk dibayar');
      }
      if (leftover > 0) {
        throw new Error(`Jumlah melebihi sisa tagihan sebesar ${formatCurrency(leftover)}`);
      }

      const accountId = creditMoneyIn(t, account, amt);

      t.set(txRef, {
        type: 'income',
        amount: amt,
        description: receiptDescription(project, allocations),
        date: Timestamp.fromDate(recvDate),
        fromAccount: null,
        toAccount: accountId,
        debtId: null,
        projectId,
        paymentNo: allocations[0].no,
        receiptId: txRef.id,
        createdAt: serverTimestamp(),
      });

      const receipt = {
        id: txRef.id,
        amount: amt,
        date: Timestamp.fromDate(recvDate),
        accountId,
        transactionId: txRef.id,
        allocations,
      };

      // MUST spread the existing receipts, never write [receipt] alone.
      // project.receipts already holds the entries derived from rows confirmed
      // before this feature existed, because the project is normalized on read.
      // Writing only the new one would store a receipts array that omits them,
      // and since the reader switches to the receipts branch as soon as that
      // array exists, every one of those older payments would read as unpaid.
      const receipts = [...(project.receipts || []), receipt];

      // Keep the per-row fields in step: the received date is still read
      // directly when a row is rendered and in the collector's Tgl Bayar column.
      const byNo = new Map(allocations.map((a) => [a.no, a.amount]));
      const updatedPayments = (project.payments || []).map((row) => {
        const add = byNo.get(row.no);
        if (add == null) return row;
        return {
          ...row,
          receivedAmount: (Number(row.receivedAmount) || 0) + add,
          receivedDate: Timestamp.fromDate(recvDate),
          transactionId: txRef.id,
          accountId,
        };
      });

      const after = { ...project, payments: updatedPayments, receipts };
      const allSettled =
        updatedPayments.length > 0 && updatedPayments.every((row) => isSettled(after, row));
      const update = { payments: updatedPayments, receipts, lastWriteId: writeId };
      if (allSettled && project.status === 'active') {
        update.status = 'completed';
        update.closedAt = Timestamp.fromDate(recvDate);
      }
      t.update(ref, update);
      return allocations.length;
    }, { alreadyDone: (p) => (p.receipts || []).some((r) => r.id === txRef.id), seenWriteId });
    toast(count > 1 ? `Pembayaran tercatat untuk ${count} tagihan` : 'Pembayaran tercatat');
  }

  // ===== Corrections to one arrival of money =====
  // Each reads the project inside a transaction and decides the correction
  // with receiptOps, which refuses before anything is written; then it moves
  // the money and writes the whole update receiptOps returned.

  async function updateReceipt(projectId, receiptId, { amount, date, account, seenWriteId }) {
    if (!account) throw new Error('Pilih rekening tujuan');
    const status = await inProjectTransaction(projectId, async (t, project, ref, writeId) => {
      const receipt = (project.receipts || []).find((r) => r.id === receiptId);
      if (!receipt) throw new Error('Pembayaran tidak ditemukan');
      // Reads before writes. The receipt's transaction must still say what the
      // receipt says: before this stage the Transaksi page could change or
      // delete it, and moving balances by the receipt's figures would then
      // count money twice or take it from the wrong account.
      const txRef = receipt.transactionId ? doc(db, C('transactions'), receipt.transactionId) : null;
      const txSnap = txRef ? await t.get(txRef) : null;
      const tx = txSnap?.exists() ? txSnap.data() : null;
      if (
        !tx ||
        tx.type !== 'income' ||
        (Number(tx.amount) || 0) !== (Number(receipt.amount) || 0) ||
        (tx.toAccount || null) !== (receipt.accountId || null)
      ) {
        throw new Error(
          'Transaksi untuk pembayaran ini tidak ada atau sudah diubah di halaman Transaksi, jadi tidak cocok lagi. Batalkan pembayaran ini, lalu catat ulang.'
        );
      }

      const recvDate = date instanceof Date ? date : toDate(receipt.date) || new Date();
      const at = Timestamp.fromDate(recvDate);
      const amt = Math.round(Number(amount) || 0);
      const target = resolveMoneyIn(account);
      const { update, allocations } = applyReceiptEdit(project, receiptId, {
        amount: amt,
        at,
        accountId: target.id,
      });

      // One net change when the money stays in the same account.
      const oldAmt = Number(receipt.amount) || 0;
      if (!target.createRef && target.id === receipt.accountId) {
        const delta = amt - oldAmt;
        if (delta !== 0) {
          t.update(doc(db, C('accounts'), target.id), {
            balance: increment(delta),
            updatedAt: serverTimestamp(),
          });
        }
      } else {
        if (receipt.accountId && oldAmt) {
          t.update(doc(db, C('accounts'), receipt.accountId), {
            balance: increment(-oldAmt),
            updatedAt: serverTimestamp(),
          });
        }
        creditResolved(t, target, amt);
      }

      const monthsChanged =
        allocations.map((a) => a.no).join() !== (receipt.allocations || []).map((a) => a.no).join();
      t.update(txRef, {
        amount: amt,
        toAccount: target.id,
        date: at,
        paymentNo: allocations[0].no,
        receiptId: receipt.id,
        ...(monthsChanged ? { description: receiptDescription(project, allocations) } : {}),
      });
      t.update(ref, { ...update, lastWriteId: writeId });
      return update.status;
    }, { seenWriteId });
    toast(
      status === 'active'
        ? 'Pembayaran diperbarui, project aktif lagi'
        : status === 'completed'
          ? 'Pembayaran diperbarui, project selesai'
          : 'Pembayaran diperbarui'
    );
  }

  async function moveReceipt(projectId, receiptId, startNo, { seenWriteId } = {}) {
    const status = await inProjectTransaction(projectId, async (t, project, ref, writeId) => {
      const receipt = (project.receipts || []).find((r) => r.id === receiptId);
      if (!receipt) throw new Error('Pembayaran tidak ditemukan');
      const txRef = receipt.transactionId ? doc(db, C('transactions'), receipt.transactionId) : null;
      const txSnap = txRef ? await t.get(txRef) : null;

      const { update, allocations } = applyReceiptMove(project, receiptId, startNo);
      if (txSnap?.exists()) {
        t.update(txRef, {
          paymentNo: allocations[0].no,
          description: receiptDescription(project, allocations),
          receiptId: receipt.id,
        });
      }
      t.update(ref, { ...update, lastWriteId: writeId });
      return update.status;
    }, { seenWriteId });
    // A move can finish a project but never reopens one: on a completed
    // project there is no open month to move to.
    toast(status === 'completed' ? 'Pembayaran dipindah, project selesai' : 'Pembayaran dipindah');
  }

  async function cancelReceipt(projectId, receiptId, { seenWriteId } = {}) {
    const outcome = await inProjectTransaction(projectId, async (t, project, ref, writeId) => {
      const receipt = (project.receipts || []).find((r) => r.id === receiptId);
      if (!receipt) throw new Error('Pembayaran tidak ditemukan');
      // Reads before writes. The transaction, not the receipt, says where the
      // money sits now: before this stage the Transaksi page could change it
      // (its amount, account or even its type) or delete it (then its balance
      // was already reversed). An account deleted since cannot be debited.
      const txRef = receipt.transactionId ? doc(db, C('transactions'), receipt.transactionId) : null;
      const txSnap = txRef ? await t.get(txRef) : null;
      const tx = txSnap?.exists() ? txSnap.data() : null;
      const deltas = new Map();
      for (const [accountId, amount] of tx ? reversalOf(tx) : []) {
        if (accountId) deltas.set(accountId, (deltas.get(accountId) || 0) + amount);
      }
      const accountWrites = [];
      for (const [accountId, amount] of deltas) {
        if (!amount) continue;
        const accRef = doc(db, C('accounts'), accountId);
        const accSnap = await t.get(accRef);
        if (accSnap.exists()) accountWrites.push({ accRef, amount });
      }

      const { update } = applyReceiptCancel(project, receiptId);
      for (const { accRef, amount } of accountWrites) {
        t.update(accRef, { balance: increment(amount), updatedAt: serverTimestamp() });
      }
      if (tx) t.delete(txRef);
      t.update(ref, { ...update, lastWriteId: writeId });
      return { status: update.status, balanceMoved: accountWrites.length > 0 };
    }, {
      // Gone already means cancelled: by this call's own earlier attempt whose
      // answer was lost, or by another device.
      alreadyDone: (p) => !(p.receipts || []).some((r) => r.id === receiptId),
      seenWriteId,
    });
    const base = outcome?.status === 'active' ? 'Pembayaran dibatalkan, project aktif lagi' : 'Pembayaran dibatalkan';
    toast(
      outcome && !outcome.balanceMoved
        ? `${base}. Saldo tidak diubah karena transaksi atau rekeningnya sudah tidak ada`
        : base
    );
  }

  async function closeProjectAsDefault(projectId, { recoveredAmount = 0, accountId, date } = {}) {
    const recv = Number(recoveredAmount) || 0;
    if (recv > 0 && !accountId) throw new Error('Pilih rekening tujuan untuk pengembalian');
    const closeDate = date instanceof Date ? date : new Date();

    // Made before the transaction so a rerun can recognise its own recovery.
    const recoveryRef = recv > 0 ? doc(collection(db, C('transactions'))) : null;
    const lossAmount = await inProjectTransaction(projectId, (t, project, ref, writeId) => {
      // Checked on the fresh read: another device may have closed it.
      if (project.status !== 'active') throw new Error('Project ini sudah ditutup.');
      let recoveryTxId = null;
      if (recv > 0) {
        const creditedTo = creditMoneyIn(t, accountId, recv);
        recoveryTxId = recoveryRef.id;
        t.set(recoveryRef, {
          type: 'income',
          amount: recv,
          description: `Pengembalian sisa project: ${project.name}`,
          date: Timestamp.fromDate(closeDate),
          fromAccount: null,
          toAccount: creditedTo,
          debtId: null,
          projectId,
          createdAt: serverTimestamp(),
        });
      }

      const totalReceived = projectReceivedTotal(project) + recv;
      const loss = Math.max(0, (project.disbursedAmount || 0) - totalReceived);
      t.update(ref, {
        status: 'default',
        closedAt: Timestamp.fromDate(closeDate),
        finalRecovery: recv,
        finalRecoveryTransactionId: recoveryTxId,
        lossAmount: loss,
        lastWriteId: writeId,
      });
      return loss;
    }, { alreadyDone: (p) => !!recoveryRef && p.finalRecoveryTransactionId === recoveryRef.id });
    toast(lossAmount > 0 ? 'Project ditutup, kerugian dicatat' : 'Project ditutup (BEP)');
  }

  // Close a project early as fully settled (pelunasan dipercepat).
  // Records the settlement as income, keeps already-received payments, and
  // DROPS every remaining unpaid scheduled payment so the future income
  // projection disappears. The settlement becomes the new final payment.
  async function settleProjectEarly(projectId, { accountId, amount, date } = {}) {
    const amt = Math.round(Number(amount) || 0);
    if (amt <= 0) throw new Error('Jumlah pelunasan harus lebih dari 0');
    if (!accountId) throw new Error('Pilih rekening tujuan');
    const settleDate = date instanceof Date ? date : new Date();
    const at = Timestamp.fromDate(settleDate);

    // Made before the transaction so a rerun can recognise its own settlement.
    const txRef = doc(collection(db, C('transactions')));
    await inProjectTransaction(projectId, (t, project, ref, writeId) => {
      // Checked on the fresh read: another device may have closed it.
      if (project.status !== 'active') throw new Error('Project ini sudah ditutup. Pelunasan tidak dicatat.');
      const creditedTo = creditMoneyIn(t, accountId, amt);

      // The settlement is an arrival of money like any other, so it goes into
      // receipts; see applySettlement for what happens when it does not.
      const { payments, receipts, settleNo } = applySettlement(project, {
        amount: amt,
        at,
        accountId: creditedTo,
        transactionId: txRef.id,
      });

      t.set(txRef, {
        type: 'income',
        amount: amt,
        description: `Pelunasan dipercepat project: ${project.name}`,
        date: at,
        fromAccount: null,
        toAccount: creditedTo,
        debtId: null,
        projectId,
        paymentNo: settleNo,
        receiptId: txRef.id,
        createdAt: serverTimestamp(),
      });

      t.update(ref, {
        payments,
        receipts,
        status: 'completed',
        closedAt: at,
        settledEarly: true,
        lastWriteId: writeId,
      });
    }, { alreadyDone: (p) => (p.receipts || []).some((r) => r.id === txRef.id) });
    toast('Project dilunasi lebih cepat');
  }

  // Full cancel/undo: reverse ALL cash effects as if the project never existed.
  // - Return the disbursed funding to the source account
  // - Claw back every received return from the account it landed in
  // - Reverse any recovery recorded when closing as macet
  // - Delete the project and all its related transactions
  async function deleteProject(id) {
    if (!projects.some((p) => p.id === id)) return;
    const clawedBack = await inProjectTransaction(
      id,
      async (t, project, ref) => {
        // Reads first (a transaction allows no read after a write). What each
        // transaction says is what actually moved the balances, so that is
        // what gets reversed: before this stage the Transaksi page could
        // change or delete project transactions without the project knowing.
        const read = async (collectionName, docId) => {
          if (!docId) return null;
          const docRef = doc(db, C(collectionName), docId);
          const snap = await t.get(docRef);
          return snap.exists() ? { ref: docRef, data: snap.data() } : null;
        };
        const funding = await read('transactions', project.fundingTransactionId);
        const arrivals = [];
        for (const r of project.receipts || []) {
          const tx = await read('transactions', r?.transactionId);
          if (tx) arrivals.push(tx);
        }
        const recovery = await read('transactions', project.finalRecoveryTransactionId);

        // One balance change per account, however many transactions touched it.
        const deltas = new Map();
        const move = (accountId, amount) => {
          if (!accountId || !amount) return;
          deltas.set(accountId, (deltas.get(accountId) || 0) + amount);
        };
        // Each transaction is undone as deleting it would undo it: the modal
        // goes back to the account it left from, every arrival and a macet
        // recovery come back out of the account they landed in. A project
        // with no funding transaction on record at all falls back to its own
        // fields for the modal.
        for (const tx of [funding, ...arrivals, recovery]) {
          if (tx) for (const [accountId, amount] of reversalOf(tx.data)) move(accountId, amount);
        }
        if (!funding && !project.fundingTransactionId) {
          move(project.sourceAccountId, Number(project.disbursedAmount) || 0);
        }

        // An account deleted since cannot be updated; its share is skipped.
        const accountWrites = [];
        for (const [accountId, amount] of deltas) {
          if (amount === 0) continue;
          const account = await read('accounts', accountId);
          if (account) accountWrites.push({ accRef: account.ref, amount });
        }

        for (const tx of [funding, ...arrivals, recovery]) {
          if (tx) t.delete(tx.ref);
        }
        for (const { accRef, amount } of accountWrites) {
          t.update(accRef, { balance: increment(amount), updatedAt: serverTimestamp() });
        }
        t.delete(ref);
        return projectReceivedTotal(project);
      },
      { missingOk: true }
    );
    toast(clawedBack > 0 ? 'Project dibatalkan, modal & return dikembalikan' : 'Project dibatalkan, modal dikembalikan');
  }

  // ===== Reset =====
  async function resetAllData() {
    const collections = ['accounts', 'transactions', 'debts', 'reminders', 'projects'];
    for (const col of collections) {
      const snap = await getDocs(collection(db, C(col)));
      const batch = writeBatch(db);
      snap.docs.forEach((d) => batch.delete(d.ref));
      await batch.commit();
    }
    toast('Semua data telah direset');
  }

  const totalBalance = useMemo(
    () => accounts.reduce((sum, a) => sum + (Number(a.balance) || 0), 0),
    [accounts]
  );

  const value = {
    accounts, transactions, debts, reminders, projects, loading, totalBalance,
    addAccount, updateAccount, deleteAccount,
    addTransaction, updateTransaction, deleteTransaction,
    addDebt, updateDebt, deleteDebt, payInstallment,
    addReminder, updateReminder, deleteReminder,
    addProject, updateProject, recordReceipt, updateReceipt, moveReceipt, cancelReceipt, closeProjectAsDefault, settleProjectEarly, deleteProject,
    resetAllData,
  };

  return <DataContext.Provider value={value}>{children}</DataContext.Provider>;
}

export function useData() {
  const ctx = useContext(DataContext);
  if (!ctx) throw new Error('useData must be used within DataProvider');
  return ctx;
}
