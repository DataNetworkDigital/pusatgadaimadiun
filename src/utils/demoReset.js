import {
  collection, doc, getDocs, runTransaction, writeBatch, serverTimestamp,
} from 'firebase/firestore';
import { db } from '../firebase';
import { buildDemoSeed } from './demoSeedData';

const COLLECTIONS = ['demo_accounts', 'demo_transactions', 'demo_debts', 'demo_reminders'];
const SETTINGS_PATH = ['demo_config', 'settings'];

export function getWIBDateString(date = new Date()) {
  const utcMs = date.getTime() + (date.getTimezoneOffset() * 60000);
  const wib = new Date(utcMs + (7 * 3600000));
  const yyyy = wib.getFullYear();
  const mm = String(wib.getMonth() + 1).padStart(2, '0');
  const dd = String(wib.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

async function clearCollection(name) {
  const snap = await getDocs(collection(db, name));
  const chunks = [];
  for (let i = 0; i < snap.docs.length; i += 400) {
    chunks.push(snap.docs.slice(i, i + 400));
  }
  for (const chunk of chunks) {
    const batch = writeBatch(db);
    chunk.forEach((d) => batch.delete(d.ref));
    await batch.commit();
  }
}

async function seed() {
  const { accounts, transactions, debts, reminders } = buildDemoSeed();
  const batch = writeBatch(db);

  const accountKeyToId = {};
  for (const acc of accounts) {
    const ref = doc(collection(db, 'demo_accounts'));
    accountKeyToId[acc.key] = ref.id;
    batch.set(ref, {
      name: acc.name,
      accountNumber: acc.accountNumber,
      balance: acc.balance,
      createdAt: acc.createdAt,
      updatedAt: acc.updatedAt,
    });
  }

  for (const tx of transactions) {
    const ref = doc(collection(db, 'demo_transactions'));
    batch.set(ref, {
      type: tx.type,
      amount: tx.amount,
      description: tx.description,
      date: tx.dateRef,
      fromAccount: tx.fromKey ? accountKeyToId[tx.fromKey] : null,
      toAccount: tx.toKey ? accountKeyToId[tx.toKey] : null,
      debtId: null,
      createdAt: serverTimestamp(),
    });
  }

  for (const d of debts) {
    const ref = doc(collection(db, 'demo_debts'));
    batch.set(ref, {
      type: d.type,
      personName: d.personName,
      totalAmount: d.totalAmount,
      remainingAmount: d.remainingAmount,
      startDate: d.startDate,
      dueDate: d.dueDate,
      description: d.description,
      status: d.status,
      installments: d.installments,
      createdAt: serverTimestamp(),
    });
  }

  for (const r of reminders) {
    const ref = doc(collection(db, 'demo_reminders'));
    batch.set(ref, {
      title: r.title,
      dayOfMonth: r.dayOfMonth,
      amount: r.amount,
      accountId: r.accountKey ? accountKeyToId[r.accountKey] : null,
      isActive: r.isActive,
      createdAt: serverTimestamp(),
    });
  }

  await batch.commit();
}

export async function ensureDemoFresh() {
  const todayStr = getWIBDateString();
  const settingsRef = doc(db, ...SETTINGS_PATH);

  const decision = await runTransaction(db, async (txn) => {
    const snap = await txn.get(settingsRef);
    if (!snap.exists()) {
      txn.set(settingsRef, {
        lastResetDate: todayStr,
        visitorCount: 0,
        dailyVisitors: 0,
        resetInProgress: true,
        resetStartedAt: serverTimestamp(),
      });
      return 'seed';
    }
    const data = snap.data();
    if (data.lastResetDate !== todayStr) {
      txn.update(settingsRef, {
        resetInProgress: true,
        resetStartedAt: serverTimestamp(),
      });
      return 'reset';
    }
    return 'ready';
  });

  if (decision === 'reset' || decision === 'seed') {
    if (decision === 'reset') {
      for (const c of COLLECTIONS) await clearCollection(c);
    }
    await seed();
    await runTransaction(db, async (txn) => {
      txn.update(settingsRef, {
        lastResetDate: todayStr,
        dailyVisitors: 0,
        resetInProgress: false,
      });
    });
  }
}

let countedThisSession = false;

export async function incrementVisitor() {
  if (countedThisSession) return;
  countedThisSession = true;
  const settingsRef = doc(db, ...SETTINGS_PATH);
  try {
    await runTransaction(db, async (txn) => {
      const snap = await txn.get(settingsRef);
      if (!snap.exists()) return;
      const data = snap.data();
      txn.update(settingsRef, {
        visitorCount: (data.visitorCount || 0) + 1,
        dailyVisitors: (data.dailyVisitors || 0) + 1,
      });
    });
  } catch {
    countedThisSession = false;
  }
}
