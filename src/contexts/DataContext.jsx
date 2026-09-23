import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import {
  collection, addDoc, updateDoc, deleteDoc, doc, onSnapshot,
  query, orderBy, serverTimestamp, writeBatch, getDocs, increment, Timestamp,
} from 'firebase/firestore';
import { db } from '../firebase';
import { useAuth } from './AuthContext';
import { useDemo } from './DemoContext';
import { useToast } from './ToastContext';
import { normalizeProject } from '../utils/normalizeProject';
import { hasAnyReceipt, isSettled, projectReceivedTotal } from '../utils/paymentStatus';
import { generateProjectSchedule, recomputeUnpaidSchedule } from '../utils/projectSchedule';
import { notifyTelegram, syncToDanaTrack } from '../utils/telegram';
import { allocateReceipt } from '../utils/allocation';
import { findCashAccount, CASH_ACCOUNT_NAME } from '../utils/cashAccount';
import { applySettlement } from '../utils/settlement';
import { applyPaymentEdit } from '../utils/paymentEdit';
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

  async function deleteTransaction(id) {
    const tx = transactions.find((t) => t.id === id);
    if (!tx) return;
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

  // Resolves where money that just came in should land, and credits it.
  // `account` is either an account id or the string 'cash'. Cash uses the Kas
  // account when the owner has one and creates it otherwise, so cash on hand
  // still counts in the dashboard total instead of vanishing.
  function creditMoneyIn(batch, account, amount) {
    if (account !== 'cash') {
      batch.update(doc(db, C('accounts'), account), {
        balance: increment(amount),
        updatedAt: serverTimestamp(),
      });
      return account;
    }
    const existing = findCashAccount(accounts);
    if (existing) {
      batch.update(doc(db, C('accounts'), existing.id), {
        balance: increment(amount),
        updatedAt: serverTimestamp(),
      });
      return existing.id;
    }
    const accRef = doc(collection(db, C('accounts')));
    batch.set(accRef, {
      name: CASH_ACCOUNT_NAME,
      accountNumber: '',
      kind: 'cash',
      balance: amount,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    return accRef.id;
  }

  // One arrival of money: allocated across the tagihan it covers, oldest first,
  // and stored as a receipt that carries its own transaction.
  async function recordReceipt(projectId, { amount, date, account, startNo = null }) {
    const project = projects.find((p) => p.id === projectId);
    if (!project) throw new Error('Project tidak ditemukan');
    const amt = Math.round(Number(amount) || 0);
    if (amt <= 0) throw new Error('Jumlah harus lebih dari 0');
    if (!account) throw new Error('Pilih rekening tujuan');

    const { allocations, leftover } = allocateReceipt(project, amt, startNo);
    if (!allocations.length) {
      throw new Error('Tidak ada tagihan yang masih terbuka untuk dibayar');
    }
    if (leftover > 0) {
      throw new Error(`Jumlah melebihi sisa tagihan sebesar ${formatCurrency(leftover)}`);
    }

    const recvDate = date instanceof Date ? date : new Date();
    const batch = writeBatch(db);

    const accountId = creditMoneyIn(batch, account, amt);

    const txRef = doc(collection(db, C('transactions')));
    const months = allocations.map((a) => a.no).join(', ');
    batch.set(txRef, {
      type: 'income',
      amount: amt,
      description: `Pembayaran project: ${project.name} (bln ${months})`,
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
    // before this feature existed, because DataContext normalizes on read.
    // Writing only the new one would store a receipts array that omits them,
    // and since the reader switches to the receipts branch as soon as that
    // array exists, every one of those older payments would read as unpaid.
    const receipts = [...(project.receipts || []), receipt];

    // Keep the per-row fields in step: the received date is still read directly
    // when a row is rendered and in the collector's Tgl Bayar column.
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
    const update = { payments: updatedPayments, receipts };
    if (allSettled && project.status === 'active') {
      update.status = 'completed';
      update.closedAt = Timestamp.fromDate(recvDate);
    }
    batch.update(doc(db, C('projects'), projectId), update);

    await batch.commit();
    toast(
      allocations.length > 1
        ? `Pembayaran tercatat untuk ${allocations.length} tagihan`
        : 'Pembayaran tercatat'
    );
  }

  // Edit an already-received payment. Re-syncs the recorded income transaction
  // and the account balance: old effect is reversed, new effect applied.
  // Amount, target account, and date can all change.
  async function updateProjectPayment(projectId, paymentNo, { accountId, amount, date }) {
    const project = projects.find((p) => p.id === projectId);
    if (!project) throw new Error('Project tidak ditemukan');
    const payment = (project.payments || []).find((p) => p.no === paymentNo);
    if (!payment) throw new Error('Pembayaran tidak ditemukan');
    if (payment.receivedAmount == null) throw new Error('Pembayaran ini belum diterima');
    const newAmt = Math.round(Number(amount) || 0);
    if (newAmt <= 0) throw new Error('Jumlah harus lebih dari 0');
    if (!accountId) throw new Error('Pilih rekening tujuan');

    const oldAmt = Number(payment.receivedAmount) || 0;
    const oldAccountId = payment.accountId;
    const recvDate = date instanceof Date
      ? date
      : (payment.receivedDate?.toDate?.() || new Date());

    // Decided before anything is written: refuses the cases this stage cannot
    // edit yet, and says what the correction does to the tagihan's status.
    const edited = applyPaymentEdit(project, paymentNo, {
      amount: newAmt,
      at: Timestamp.fromDate(recvDate),
      accountId,
    });

    const batch = writeBatch(db);

    // Adjust balances. If the account is unchanged, apply a single net delta
    // (two increments on the same doc in one batch would not stack reliably).
    if (oldAccountId && oldAccountId === accountId) {
      const delta = newAmt - oldAmt;
      if (delta !== 0) {
        batch.update(doc(db, C('accounts'), accountId), {
          balance: increment(delta),
          updatedAt: serverTimestamp(),
        });
      }
    } else {
      if (oldAccountId) {
        batch.update(doc(db, C('accounts'), oldAccountId), {
          balance: increment(-oldAmt),
          updatedAt: serverTimestamp(),
        });
      }
      batch.update(doc(db, C('accounts'), accountId), {
        balance: increment(newAmt),
        updatedAt: serverTimestamp(),
      });
    }

    // Re-sync the recorded income transaction
    if (payment.transactionId) {
      batch.update(doc(db, C('transactions'), payment.transactionId), {
        amount: newAmt,
        toAccount: accountId,
        date: Timestamp.fromDate(recvDate),
      });
    }

    batch.update(doc(db, C('projects'), projectId), edited);

    await batch.commit();
    toast(edited.status === 'active' ? 'Pembayaran diperbarui, project aktif lagi' : 'Pembayaran diperbarui');
  }

  async function closeProjectAsDefault(projectId, { recoveredAmount = 0, accountId, date } = {}) {
    const project = projects.find((p) => p.id === projectId);
    if (!project) throw new Error('Project tidak ditemukan');
    const recv = Number(recoveredAmount) || 0;
    const closeDate = date instanceof Date ? date : new Date();

    const batch = writeBatch(db);
    let recoveryTxId = null;
    if (recv > 0) {
      if (!accountId) throw new Error('Pilih rekening tujuan untuk pengembalian');
      const creditedTo = creditMoneyIn(batch, accountId, recv);
      const txRef = doc(collection(db, C('transactions')));
      recoveryTxId = txRef.id;
      batch.set(txRef, {
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
    const lossAmount = Math.max(0, (project.disbursedAmount || 0) - totalReceived);

    batch.update(doc(db, C('projects'), projectId), {
      status: 'default',
      closedAt: Timestamp.fromDate(closeDate),
      finalRecovery: recv,
      finalRecoveryTransactionId: recoveryTxId,
      lossAmount,
    });

    await batch.commit();
    toast(lossAmount > 0 ? 'Project ditutup, kerugian dicatat' : 'Project ditutup (BEP)');
  }

  // Close a project early as fully settled (pelunasan dipercepat).
  // Records the settlement as income, keeps already-received payments, and
  // DROPS every remaining unpaid scheduled payment so the future income
  // projection disappears. The settlement becomes the new final payment.
  async function settleProjectEarly(projectId, { accountId, amount, date } = {}) {
    const project = projects.find((p) => p.id === projectId);
    if (!project) throw new Error('Project tidak ditemukan');
    const amt = Math.round(Number(amount) || 0);
    if (amt <= 0) throw new Error('Jumlah pelunasan harus lebih dari 0');
    if (!accountId) throw new Error('Pilih rekening tujuan');
    const settleDate = date instanceof Date ? date : new Date();
    const at = Timestamp.fromDate(settleDate);

    const batch = writeBatch(db);
    const creditedTo = creditMoneyIn(batch, accountId, amt);
    const txRef = doc(collection(db, C('transactions')));

    // The settlement is an arrival of money like any other, so it goes into
    // receipts; see applySettlement for what happens when it does not.
    const { payments, receipts, settleNo } = applySettlement(project, {
      amount: amt,
      at,
      accountId: creditedTo,
      transactionId: txRef.id,
    });

    batch.set(txRef, {
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

    batch.update(doc(db, C('projects'), projectId), {
      payments,
      receipts,
      status: 'completed',
      closedAt: at,
      settledEarly: true,
    });

    await batch.commit();
    toast('Project dilunasi lebih cepat');
  }

  // Full cancel/undo: reverse ALL cash effects as if the project never existed.
  // - Return the disbursed funding to the source account
  // - Claw back every received return from the account it landed in
  // - Reverse any recovery recorded when closing as macet
  // - Delete the project and all its related transactions
  async function deleteProject(id) {
    const project = projects.find((p) => p.id === id);
    if (!project) return;
    const batch = writeBatch(db);

    // 1. Return funding money to the source account, delete the funding transaction
    if (project.fundingTransactionId) {
      batch.delete(doc(db, C('transactions'), project.fundingTransactionId));
    }
    if (project.sourceAccountId && project.disbursedAmount) {
      batch.update(doc(db, C('accounts'), project.sourceAccountId), {
        balance: increment(project.disbursedAmount || 0),
        updatedAt: serverTimestamp(),
      });
    }

    // 2. Claw back every received return from the account it was deposited to.
    // Walks receipts, not rows: once one tagihan can be paid several times, the
    // money lives on the receipts and a row-based loop would refund only one of
    // them.
    for (const r of project.receipts || []) {
      const amt = Number(r?.amount) || 0;
      if (r?.transactionId) {
        batch.delete(doc(db, C('transactions'), r.transactionId));
      }
      if (r?.accountId && amt) {
        batch.update(doc(db, C('accounts'), r.accountId), {
          balance: increment(-amt),
          updatedAt: serverTimestamp(),
        });
      }
    }

    // 3. Reverse any recovery booked when the project was closed as macet
    if (project.finalRecoveryTransactionId) {
      batch.delete(doc(db, C('transactions'), project.finalRecoveryTransactionId));
      const recoveryTx = transactions.find((t) => t.id === project.finalRecoveryTransactionId);
      if (recoveryTx?.toAccount && project.finalRecovery) {
        batch.update(doc(db, C('accounts'), recoveryTx.toAccount), {
          balance: increment(-(project.finalRecovery || 0)),
          updatedAt: serverTimestamp(),
        });
      }
    }

    batch.delete(doc(db, C('projects'), id));
    await batch.commit();
    const clawedBack = projectReceivedTotal(project);
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
    addProject, updateProject, recordReceipt, updateProjectPayment, closeProjectAsDefault, settleProjectEarly, deleteProject,
    resetAllData,
  };

  return <DataContext.Provider value={value}>{children}</DataContext.Provider>;
}

export function useData() {
  const ctx = useContext(DataContext);
  if (!ctx) throw new Error('useData must be used within DataProvider');
  return ctx;
}
