import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import {
  collection, addDoc, updateDoc, deleteDoc, doc, onSnapshot,
  query, orderBy, serverTimestamp, writeBatch, getDocs, increment, Timestamp,
} from 'firebase/firestore';
import { db } from '../firebase';
import { useAuth } from './AuthContext';
import { useDemo } from './DemoContext';
import { useToast } from './ToastContext';
import { generateProjectSchedule, recomputeUnpaidSchedule } from '../utils/projectSchedule';
import { notifyTelegram, syncToDanaTrack } from '../utils/telegram';

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
        setProjects(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
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
    const monthlyReturnPct = Number(data.monthlyReturnPct) || 0;
    const durationMonths = Number(data.durationMonths) || 0;
    const startDate = data.startDate instanceof Date ? data.startDate : data.startDate?.toDate?.() || new Date();
    const paymentDayOfMonth = Number(data.paymentDayOfMonth) || startDate.getDate();
    if (!data.sourceAccountId) throw new Error('Pilih rekening sumber pendanaan');
    if (principalAmount <= 0) throw new Error('Nilai project harus lebih dari 0');
    if (disbursedAmount <= 0) throw new Error('Modal keluar harus lebih dari 0');
    if (durationMonths <= 0) throw new Error('Durasi project minimal 1 bulan');

    const payments = generateProjectSchedule({
      principalAmount,
      monthlyReturnPct,
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
      description: data.description || '',
      principalAmount,
      disbursedAmount,
      monthlyReturnPct,
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
    notifyTelegram(
      `🆕 <b>Project Baru</b>\n` +
      `Nama: ${data.name}\n` +
      `Pemilik: ${data.ownerName || '-'}\n` +
      `Nilai: Rp ${Number(principalAmount).toLocaleString('id-ID')}\n` +
      `Modal keluar: Rp ${Number(disbursedAmount).toLocaleString('id-ID')}\n` +
      `Return: ${monthlyReturnPct}%/bln × ${durationMonths} bln\n` +
      `Rekening: ${acct?.name || '-'}`
    );

    syncToDanaTrack({ name: data.name, principalAmount, disbursedAmount, monthlyReturnPct, durationMonths, startDate });

    return projectRef.id;
  }

  async function updateProject(id, data) {
    const project = projects.find((p) => p.id === id);
    if (!project) throw new Error('Project tidak ditemukan');
    const hasReceived = (project.payments || []).some((p) => p.receivedAmount != null);

    const update = {};
    // Text/metadata fields — always editable
    if (data.name !== undefined) update.name = data.name;
    if (data.ownerName !== undefined) update.ownerName = data.ownerName;
    if (data.contractNumber !== undefined) update.contractNumber = data.contractNumber;
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
      data.durationMonths !== undefined ||
      data.paymentDayOfMonth !== undefined ||
      data.principalAmount !== undefined ||
      data.startDate !== undefined;

    if (scheduleChange) {
      const newPrincipal = data.principalAmount !== undefined ? Number(data.principalAmount) : project.principalAmount;
      const newPct = data.monthlyReturnPct !== undefined ? Number(data.monthlyReturnPct) : project.monthlyReturnPct;
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
        monthlyReturnPct: newPct,
        durationMonths: newDuration,
        startDate: newStart,
        paymentDayOfMonth: newDay,
      });
      if (data.principalAmount !== undefined) update.principalAmount = newPrincipal;
      if (data.monthlyReturnPct !== undefined) update.monthlyReturnPct = newPct;
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

  async function recordProjectPayment(projectId, paymentNo, { accountId, amount, date }) {
    const project = projects.find((p) => p.id === projectId);
    if (!project) throw new Error('Project tidak ditemukan');
    const payment = (project.payments || []).find((p) => p.no === paymentNo);
    if (!payment) throw new Error('Pembayaran tidak ditemukan');
    if (payment.receivedAmount != null) throw new Error('Pembayaran sudah dikonfirmasi');
    const amt = Number(amount);
    if (amt <= 0) throw new Error('Jumlah harus lebih dari 0');
    if (!accountId) throw new Error('Pilih rekening tujuan');

    const recvDate = date instanceof Date ? date : new Date();
    const batch = writeBatch(db);
    const txRef = doc(collection(db, C('transactions')));

    batch.set(txRef, {
      type: 'income',
      amount: amt,
      description:
        payment.type === 'final'
          ? `Pelunasan project: ${project.name}`
          : `Return bulanan project: ${project.name}`,
      date: Timestamp.fromDate(recvDate),
      fromAccount: null,
      toAccount: accountId,
      debtId: null,
      projectId,
      paymentNo,
      createdAt: serverTimestamp(),
    });
    batch.update(doc(db, C('accounts'), accountId), {
      balance: increment(amt),
      updatedAt: serverTimestamp(),
    });

    const updatedPayments = (project.payments || []).map((p) =>
      p.no === paymentNo
        ? {
            ...p,
            receivedAmount: amt,
            receivedDate: Timestamp.fromDate(recvDate),
            transactionId: txRef.id,
            accountId,
          }
        : p
    );
    const allPaid =
      updatedPayments.length > 0 && updatedPayments.every((p) => p.receivedAmount != null);
    const update = { payments: updatedPayments };
    if (allPaid && project.status === 'active') {
      update.status = 'completed';
      update.closedAt = Timestamp.fromDate(recvDate);
    }
    batch.update(doc(db, C('projects'), projectId), update);

    await batch.commit();
    toast(payment.type === 'final' ? 'Pelunasan project tercatat' : 'Pembayaran tercatat');
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
    const newAmt = Number(amount);
    if (newAmt <= 0) throw new Error('Jumlah harus lebih dari 0');
    if (!accountId) throw new Error('Pilih rekening tujuan');

    const oldAmt = Number(payment.receivedAmount) || 0;
    const oldAccountId = payment.accountId;
    const recvDate = date instanceof Date
      ? date
      : (payment.receivedDate?.toDate?.() || new Date());

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

    // Update the payment record
    const updatedPayments = (project.payments || []).map((p) =>
      p.no === paymentNo
        ? { ...p, receivedAmount: newAmt, receivedDate: Timestamp.fromDate(recvDate), accountId }
        : p
    );
    batch.update(doc(db, C('projects'), projectId), { payments: updatedPayments });

    await batch.commit();
    toast('Pembayaran diperbarui');
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
      const txRef = doc(collection(db, C('transactions')));
      recoveryTxId = txRef.id;
      batch.set(txRef, {
        type: 'income',
        amount: recv,
        description: `Pengembalian sisa project: ${project.name}`,
        date: Timestamp.fromDate(closeDate),
        fromAccount: null,
        toAccount: accountId,
        debtId: null,
        projectId,
        createdAt: serverTimestamp(),
      });
      batch.update(doc(db, C('accounts'), accountId), {
        balance: increment(recv),
        updatedAt: serverTimestamp(),
      });
    }

    const totalReceived =
      (project.payments || []).reduce((s, p) => s + (p.receivedAmount || 0), 0) + recv;
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

    // 2. Claw back every received return from the account it was deposited to
    for (const p of project.payments || []) {
      if (p.receivedAmount != null) {
        if (p.transactionId) {
          batch.delete(doc(db, C('transactions'), p.transactionId));
        }
        if (p.accountId && p.receivedAmount) {
          batch.update(doc(db, C('accounts'), p.accountId), {
            balance: increment(-(p.receivedAmount || 0)),
            updatedAt: serverTimestamp(),
          });
        }
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
    const clawedBack = (project.payments || []).reduce((s, p) => s + (p.receivedAmount || 0), 0);
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
    addProject, updateProject, recordProjectPayment, updateProjectPayment, closeProjectAsDefault, deleteProject,
    resetAllData,
  };

  return <DataContext.Provider value={value}>{children}</DataContext.Provider>;
}

export function useData() {
  const ctx = useContext(DataContext);
  if (!ctx) throw new Error('useData must be used within DataProvider');
  return ctx;
}
