#!/usr/bin/env node
// One-time migration (spec 6.9). Writes into each stored project the receipts
// the app already shows (derived on read from the old per-row fields), and
// puts receiptId on their transactions. No balance changes.
//
// Dry run by default: it reads, writes a JSON backup of every project into
// backups/, and prints a report. It writes to Firestore only with --apply, and
// --apply on production runs only after Gde has read the dry-run report.
//
//   node scripts/migrate-receipts.mjs            production, dry run
//   node scripts/migrate-receipts.mjs --demo     the demo_* collections
//   node scripts/migrate-receipts.mjs --apply    write
//
// Idempotent: a project that already stores receipts is not rewritten, and a
// transaction that already has receiptId is left alone.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { initializeApp } from 'firebase/app';
import { getFirestore, collection, getDocs, doc, runTransaction, updateDoc } from 'firebase/firestore';
import { getAuth, signInAnonymously } from 'firebase/auth';
import { normalizeProject } from '../src/utils/normalizeProject.js';

const args = new Set(process.argv.slice(2));
const APPLY = args.has('--apply');
const PREFIX = args.has('--demo') ? 'demo_' : '';
const C = (name) => `${PREFIX}${name}`;

const env = Object.fromEntries(
  readFileSync('.env', 'utf8')
    .split('\n')
    .filter((line) => line.includes('='))
    .map((line) => {
      const i = line.indexOf('=');
      return [line.slice(0, i).trim(), line.slice(i + 1).trim().replace(/^"|"$/g, '')];
    })
);
const app = initializeApp({
  apiKey: env.VITE_FIREBASE_API_KEY,
  authDomain: env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: env.VITE_FIREBASE_APP_ID,
});
await signInAnonymously(getAuth(app));
const db = getFirestore(app);

const readAll = async (name) =>
  (await getDocs(collection(db, C(name)))).docs.map((d) => ({ id: d.id, ...d.data() }));
const rp = (n) => `Rp ${Math.round(Number(n) || 0).toLocaleString('id-ID')}`;
const day = (v) => {
  const d = v?.toDate ? v.toDate() : v ? new Date(v) : null;
  return d ? d.toLocaleDateString('id-ID', { timeZone: 'Asia/Jakarta' }) : '-';
};

const [projects, transactions] = await Promise.all([readAll('projects'), readAll('transactions')]);
const txById = new Map(transactions.map((t) => [t.id, t]));

mkdirSync('backups', { recursive: true });
const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const backupFile = `backups/${PREFIX || 'prod_'}projects-${stamp}.json`;
writeFileSync(backupFile, JSON.stringify(projects, null, 1));

const plan = { projects: [], transactions: [], underpaid: [], overpaid: [], problems: [] };
for (const raw of projects) {
  const p = normalizeProject(raw);
  if (!Array.isArray(raw.receipts)) plan.projects.push({ id: p.id, name: p.name, receipts: p.receipts.length });
  for (const r of p.receipts || []) {
    const firstNo = r.allocations?.[0]?.no;
    const row = (p.payments || []).find((x) => x.no === firstNo);
    if (String(r.id).startsWith('legacy-') && row && !r.moved && !r.reopened) {
      const due = Number(row.expectedAmount) || 0;
      const got = Number(r.amount) || 0;
      const line = { project: p.name, bulan: firstNo, jatuhTempo: day(row.dueDate), diterima: day(r.date), tagihan: rp(due), dibayar: rp(got) };
      if (got < due) plan.underpaid.push({ ...line, kurang: rp(due - got), masihDianggapLunas: row.closure?.reason === 'legacy' });
      if (got > due) plan.overpaid.push({ ...line, lebih: rp(got - due) });
    }
    const tx = r.transactionId ? txById.get(r.transactionId) : null;
    if (!tx) {
      plan.problems.push({ project: p.name, bulan: firstNo, masalah: r.transactionId ? 'transaksi hilang' : 'tanpa transaksi' });
      continue;
    }
    const issues = [];
    if (tx.type !== 'income') issues.push(`jenis ${tx.type}`);
    if ((Number(tx.amount) || 0) !== (Number(r.amount) || 0)) issues.push(`jumlah ${rp(tx.amount)} vs ${rp(r.amount)}`);
    if ((tx.toAccount || null) !== (r.accountId || null)) issues.push('rekening beda');
    if (issues.length) plan.problems.push({ project: p.name, bulan: firstNo, masalah: issues.join(', ') });
    if (!tx.receiptId) plan.transactions.push({ id: tx.id, receiptId: r.id });
  }
}

console.log(`Koleksi: ${PREFIX ? 'DEMO' : 'PRODUKSI'}   Mode: ${APPLY ? 'APPLY (menulis)' : 'DRY RUN (hanya membaca)'}`);
console.log(`Backup: ${backupFile}`);
console.log(`Project: ${projects.length}, akan disimpan receipts-nya: ${plan.projects.length}`);
console.log(`Transaksi yang akan diberi receiptId: ${plan.transactions.length}`);
console.log(`\nPembayaran lama yang KURANG (tetap lunas sampai dibuka lagi di aplikasi): ${plan.underpaid.length}`);
for (const u of plan.underpaid) console.log('  -', JSON.stringify(u));
console.log(`\nPembayaran lama yang LEBIH dari tagihannya: ${plan.overpaid.length}`);
for (const o of plan.overpaid) console.log('  -', JSON.stringify(o));
console.log(`\nPembayaran yang transaksinya hilang atau tidak cocok: ${plan.problems.length}`);
for (const x of plan.problems) console.log('  -', JSON.stringify(x));

if (!APPLY) {
  console.log('\nDry run: tidak ada yang ditulis.');
  process.exit(0);
}

let wrote = 0;
for (const item of plan.projects) {
  const didWrite = await runTransaction(db, async (t) => {
    const ref = doc(db, C('projects'), item.id);
    const snap = await t.get(ref);
    if (!snap.exists()) return false;
    const raw = snap.data();
    if (Array.isArray(raw.receipts)) return false; // stored by the app since the report
    const p = normalizeProject({ id: snap.id, ...raw });
    t.update(ref, { receipts: p.receipts, payments: p.payments });
    return true;
  });
  if (didWrite) wrote += 1;
}
for (const item of plan.transactions) {
  await updateDoc(doc(db, C('transactions'), item.id), { receiptId: item.receiptId });
}
console.log(`\nSelesai: ${wrote} project disimpan receipts-nya, ${plan.transactions.length} transaksi diberi receiptId.`);
process.exit(0);
