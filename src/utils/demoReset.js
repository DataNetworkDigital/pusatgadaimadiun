import {
  collection, doc, getDoc, getDocs, runTransaction, writeBatch, serverTimestamp,
} from 'firebase/firestore';
import { db } from '../firebase';
import { buildDemoSeed } from './demoSeedData';
import { demoProjectLedger } from './demoLedger';
import { demoResetDecision, RESET_WAIT_MS } from './demoResetDecision';

const COLLECTIONS = [
  'demo_accounts',
  'demo_transactions',
  'demo_debts',
  'demo_reminders',
  'demo_projects',
];
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

// Writes today's demo records through `writer` (the refill's transaction).
function writeSeed(writer) {
  const { accounts, transactions, debts, reminders, projects } = buildDemoSeed();

  const accountKeyToId = {};
  for (const acc of accounts) {
    const ref = doc(collection(db, 'demo_accounts'));
    accountKeyToId[acc.key] = ref.id;
    writer.set(ref, {
      name: acc.name,
      accountNumber: acc.accountNumber,
      balance: acc.balance,
      createdAt: acc.createdAt,
      updatedAt: acc.updatedAt,
    });
  }

  for (const tx of transactions) {
    const ref = doc(collection(db, 'demo_transactions'));
    writer.set(ref, {
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
    writer.set(ref, {
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
    writer.set(ref, {
      type: r.type === 'income' ? 'income' : 'expense',
      title: r.title,
      dayOfMonth: r.dayOfMonth,
      amount: r.amount,
      accountId: r.accountKey ? accountKeyToId[r.accountKey] : null,
      isActive: r.isActive,
      createdAt: serverTimestamp(),
    });
  }

  for (const p of projects || []) {
    const ref = doc(collection(db, 'demo_projects'));
    // The funding and payment transactions a real project has, so the demo's
    // payments can be corrected like real ones.
    const ledger = demoProjectLedger(p, {
      projectId: ref.id,
      newId: () => doc(collection(db, 'demo_transactions')).id,
      accountIdOf: (key) => (key ? accountKeyToId[key] : null),
    });
    for (const { id, ...tx } of ledger.transactions) {
      writer.set(doc(db, 'demo_transactions', id), { ...tx, createdAt: serverTimestamp() });
    }
    const payments = ledger.payments.map((pay) => ({
      no: pay.no,
      dueDate: pay.dueDate,
      type: pay.type,
      expectedAmount: pay.expectedAmount,
      receivedAmount: pay.receivedAmount ?? null,
      receivedDate: pay.receivedDate ?? null,
      transactionId: pay.transactionId ?? null,
      accountId: pay.accountKey ? accountKeyToId[pay.accountKey] : null,
    }));
    const data = {
      name: p.name,
      ownerName: p.ownerName || null,
      contractNumber: p.contractNumber || null,
      phone: p.phone || null,
      nik: p.nik || null,
      address: p.address || null,
      collateral: p.collateral || null,
      description: p.description || '',
      principalAmount: p.principalAmount,
      disbursedAmount: p.disbursedAmount,
      monthlyReturnPct: p.monthlyReturnPct,
      returnPctTier1: p.returnPctTier1 ?? null,
      returnPctTier2: p.returnPctTier2 ?? null,
      durationMonths: p.durationMonths,
      startDate: p.startDate,
      paymentDayOfMonth: p.paymentDayOfMonth,
      sourceAccountId: p.sourceKey ? accountKeyToId[p.sourceKey] : null,
      proofUrl: p.proofUrl || null,
      proofFileName: null,
      status: p.status,
      payments,
      fundingTransactionId: ledger.fundingTransactionId,
      createdAt: p.createdAt || serverTimestamp(),
    };
    if (p.closedAt) data.closedAt = p.closedAt;
    writer.set(ref, data);
  }

}

// A refill that was taken over (see ensureDemoFresh) stops instead of
// landing next to the newer one.
class TakenOver extends Error {}

// Whether this visit's claim on today's refill is still the current one.
async function stillMine(settingsRef, resetId) {
  const snap = await getDoc(settingsRef);
  return snap.exists() && snap.data().resetId === resetId;
}

// The seed and the "done" flag land together, and only while this visit's
// claim is current: if a slow refill was taken over meanwhile, the newer one
// alone fills the demo.
async function seed(settingsRef, resetId) {
  await runTransaction(db, async (txn) => {
    const snap = await txn.get(settingsRef);
    if (!snap.exists() || snap.data().resetId !== resetId) throw new TakenOver();
    writeSeed(txn);
    txn.update(settingsRef, { resetInProgress: false });
  });
}

// Give the day back after a failed refill, unless another visit has taken it.
async function releaseClaim(settingsRef, resetId) {
  await runTransaction(db, async (txn) => {
    const snap = await txn.get(settingsRef);
    if (snap.exists() && snap.data().resetId === resetId) {
      txn.update(settingsRef, { lastResetDate: '2020-01-01', resetInProgress: false });
    }
  });
}

// Today's claim on the reset, or what to do instead (see demoResetDecision).
// Returns the decision and the id of the claim it saw running, if any.
async function claimReset(settingsRef, todayStr, stalledId) {
  return runTransaction(db, async (txn) => {
    const claimedId = doc(collection(db, 'demo_config')).id;
    const snap = await txn.get(settingsRef);
    const data = snap.exists() ? snap.data() : null;
    const decision = demoResetDecision(data, todayStr, stalledId);
    if (decision === 'reset') {
      const claim = {
        lastResetDate: todayStr,
        dailyVisitors: 0,
        resetInProgress: true,
        resetId: claimedId,
        resetStartedAt: serverTimestamp(),
      };
      if (data) txn.update(settingsRef, claim);
      else txn.set(settingsRef, { ...claim, visitorCount: 0 });
    }
    return { decision, runningId: data?.resetId ?? '', claimedId: decision === 'reset' ? claimedId : null };
  });
}

export async function ensureDemoFresh() {
  const todayStr = getWIBDateString();
  const settingsRef = doc(db, ...SETTINGS_PATH);

  let { decision, runningId, claimedId } = await claimReset(settingsRef, todayStr);
  // Another visit is refilling the demo: keep the loading screen up until it
  // is done rather than show a demo being emptied and refilled.
  const watched = runningId;
  const waitUntil = Date.now() + RESET_WAIT_MS;
  while (decision === 'wait' && Date.now() < waitUntil) {
    await new Promise((resolve) => setTimeout(resolve, 1500));
    ({ decision, claimedId } = await claimReset(settingsRef, todayStr));
  }
  // Still running after a whole wait on this visitor's own clock: that refill
  // died partway. Take over exactly that one; a newer claim is left alone.
  if (decision === 'wait') ({ decision, claimedId } = await claimReset(settingsRef, todayStr, watched));
  if (decision !== 'reset') return;

  try {
    // Emptied even on a first seed: records left behind a deleted settings
    // document would otherwise be seeded twice. A refill taken over meanwhile
    // stops before it touches the next collection; it only ever deletes
    // records it listed itself, never the newer refill's.
    for (const c of COLLECTIONS) {
      if (!(await stillMine(settingsRef, claimedId))) return;
      await clearCollection(c);
    }
    await seed(settingsRef, claimedId);
  } catch (e) {
    if (e instanceof TakenOver) return;
    // Give the day back so the next visit tries again, instead of leaving a
    // half-built demo marked as today's.
    await releaseClaim(settingsRef, claimedId).catch(() => {});
    throw e;
  }
}

// Dev helper: clear lastResetDate so the next /demo visit reseeds.
// Called via preview_eval after rules are updated; not used in production UI.
export async function forceDemoReseed() {
  const settingsRef = doc(db, ...SETTINGS_PATH);
  await runTransaction(db, async (txn) => {
    const snap = await txn.get(settingsRef);
    if (snap.exists()) {
      txn.update(settingsRef, { lastResetDate: '2020-01-01' });
    } else {
      txn.set(settingsRef, {
        lastResetDate: '2020-01-01',
        visitorCount: 0,
        dailyVisitors: 0,
      });
    }
  });
  return 'lastResetDate cleared — reload /demo to trigger reseed';
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
