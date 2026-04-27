import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import {
  collection, addDoc, updateDoc, deleteDoc, doc, onSnapshot,
  query, orderBy, serverTimestamp, writeBatch, getDocs, increment, Timestamp,
} from 'firebase/firestore';
import { db } from '../firebase';
import { useAuth } from './AuthContext';
import { useDemo } from './DemoContext';

const DataContext = createContext(null);

export function DataProvider({ children }) {
  const { isUnlocked } = useAuth();
  const { collectionPrefix, isDemo } = useDemo();
  const C = (name) => `${collectionPrefix}${name}`;
  const [accounts, setAccounts] = useState([]);
  const [transactions, setTransactions] = useState([]);
  const [debts, setDebts] = useState([]);
  const [reminders, setReminders] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!isDemo && !isUnlocked) return;
    setLoading(true);
    const loaded = { a: false, t: false, d: false, r: false };
    const markLoaded = (k) => {
      loaded[k] = true;
      if (loaded.a && loaded.t && loaded.d && loaded.r) setLoading(false);
    };

    const unsubA = onSnapshot(query(collection(db, C('accounts')), orderBy('createdAt', 'asc')), (snap) => {
      setAccounts(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
      markLoaded('a');
    });
    const unsubT = onSnapshot(query(collection(db, C('transactions')), orderBy('date', 'desc')), (snap) => {
      setTransactions(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
      markLoaded('t');
    });
    const unsubD = onSnapshot(query(collection(db, C('debts')), orderBy('createdAt', 'desc')), (snap) => {
      setDebts(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
      markLoaded('d');
    });
    const unsubR = onSnapshot(query(collection(db, C('reminders')), orderBy('createdAt', 'desc')), (snap) => {
      setReminders(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
      markLoaded('r');
    });

    return () => { unsubA(); unsubT(); unsubD(); unsubR(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isUnlocked, isDemo, collectionPrefix]);

  // ===== Accounts =====
  async function addAccount(data) {
    return addDoc(collection(db, C('accounts')), {
      name: data.name,
      accountNumber: data.accountNumber || '',
      balance: Number(data.balance) || 0,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  }

  async function updateAccount(id, data) {
    const update = { updatedAt: serverTimestamp() };
    if (data.name !== undefined) update.name = data.name;
    if (data.accountNumber !== undefined) update.accountNumber = data.accountNumber;
    if (data.balance !== undefined) update.balance = Number(data.balance);
    return updateDoc(doc(db, C('accounts'), id), update);
  }

  async function deleteAccount(id) {
    return deleteDoc(doc(db, C('accounts'), id));
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
  }

  // ===== Debts =====
  async function addDebt(data) {
    const totalAmount = Number(data.totalAmount);
    return addDoc(collection(db, C('debts')), {
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
    return updateDoc(doc(db, C('debts'), id), update);
  }

  async function deleteDebt(id) {
    return deleteDoc(doc(db, C('debts'), id));
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
  }

  // ===== Reminders =====
  async function addReminder(data) {
    return addDoc(collection(db, C('reminders')), {
      title: data.title,
      dayOfMonth: Number(data.dayOfMonth),
      amount: data.amount ? Number(data.amount) : null,
      accountId: data.accountId || null,
      isActive: data.isActive !== false,
      createdAt: serverTimestamp(),
    });
  }

  async function updateReminder(id, data) {
    return updateDoc(doc(db, C('reminders'), id), data);
  }

  async function deleteReminder(id) {
    return deleteDoc(doc(db, C('reminders'), id));
  }

  // ===== Reset =====
  async function resetAllData() {
    const collections = ['accounts', 'transactions', 'debts', 'reminders'];
    for (const col of collections) {
      const snap = await getDocs(collection(db, C(col)));
      const batch = writeBatch(db);
      snap.docs.forEach((d) => batch.delete(d.ref));
      await batch.commit();
    }
  }

  const totalBalance = useMemo(
    () => accounts.reduce((sum, a) => sum + (Number(a.balance) || 0), 0),
    [accounts]
  );

  const value = {
    accounts, transactions, debts, reminders, loading, totalBalance,
    addAccount, updateAccount, deleteAccount,
    addTransaction, updateTransaction, deleteTransaction,
    addDebt, updateDebt, deleteDebt, payInstallment,
    addReminder, updateReminder, deleteReminder,
    resetAllData,
  };

  return <DataContext.Provider value={value}>{children}</DataContext.Provider>;
}

export function useData() {
  const ctx = useContext(DataContext);
  if (!ctx) throw new Error('useData must be used within DataProvider');
  return ctx;
}
