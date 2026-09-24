# Bagian C — Perubahan Jadwal Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let the owner move a pelunasan later (Mundur X bulan), decide what happens to what is left of a partly paid pelunasan (Ditagih menyusul / Diperpanjang / Kontrak baru), undo the latest extension, and keep every total honest: no money moves, and a new contract's modal is never counted as cash that left.

**Architecture:** Two pure modules decide everything as data: `src/utils/extension.js` (rows an extension adds, what the pelunasan allows now, apply and undo) and `src/utils/rollover.js` (what a new contract starts from, its schedule, closing and reopening the old pelunasan). `DataContext` writes their results through `inProjectTransaction` (fresh read, `lastWriteId`, `alreadyDone`, `seenWriteId`), exactly like every money writer since B3. `paymentStatus.js` already treats `extend` and `rollover` closures as closing a row (B4), so allocation, status, calendar and the Kurang column follow without changes; readers that need more (summary, end date, exports, correction rules) are adjusted and tested.

**Tech Stack:** React 19, Vite 8, Firebase Firestore 12, Vitest.

**Spec:** `docs/superpowers/specs/2026-09-22-pembayaran-jadwal-download-design.md`, section 7 (7.1 Mundur/Perpanjang, 7.2 partial pelunasan, 7.3 rollover, 7.4 accounting invariants) and the guard rails in section 8.

**Branch:** `feat/c-jadwal`, cut from `main` after B4 is merged.

---

## Context

**Rules that already hold and must keep holding.**
- A project document that stores `receipts` is trusted completely; every write keeps the whole array or leaves it alone. Extensions and rollovers change no receipts, so they write `payments` (and their own fields) only, which is safe on documents with or without stored receipts.
- Every project write runs in `inProjectTransaction`, stores `lastWriteId`, and refuses a save from an outdated screen (`seenWriteId`). Ids that let a rerun recognise its own write are made before the transaction (`alreadyDone`).
- A closure on a row takes its amount off that row (`rowClosed`); kinds `waive`, `carry`, `extend`, `rollover`. A closed row counts as settled. Corrections of a receipt on a row closed some other way are refused (`receiptBlock`) until that closure is undone.
- `updateProject` rebuilds unpaid rows from `durationMonths` whenever the form saves schedule fields (`recomputeUnpaidSchedule`). That would silently destroy an extension's rows, so schedule fields lock once a project has an extension.

**Decisions made here (how the spec lands; reported to Gde).**
- *Mundur* is offered while nobody has paid toward the pelunasan; *Atur sisa pelunasan* (Ditagih menyusul / Diperpanjang / Kontrak baru) while it is partly paid. The base of a Mundur is the pelunasan's own base: the project value, or the remainder an earlier Diperpanjang carried forward.
- A tunggakan carried onto the pelunasan (B4 "Gabung") rides on the first month a Mundur creates (same number). With "mulai bulan depan" it therefore falls due a month later, as the whole schedule does; the sheet says so.
- Only the latest extension can be undone, and only while none of its months has money or a closure and no tunggakan was carried onto one of its months (except onto a Mundur's first month, whose number comes back).
- Kontrak baru needs every other tagihan of the old project settled, so the old project really ends settled. Its contract day defaults to the day the latest part of the pelunasan arrived.
- A new contract with "Tagih bagi hasil bulan pertama di hari kontrak" gets one extra first row (`leadCharge: true`) due on the contract day; the usual months follow, renumbered. Its schedule fields lock like an extended project's, because rebuilding from the duration would drop that row.
- Deleting (Batalkan) a new contract undoes the rollover: the old pelunasan opens again and the old project is active. Deleting an old project that was carried into a new contract is refused.
- Corrections on a project closed by rollover are refused (spec section 8): its remainder is now the new contract's modal.
- The demo never sends Telegram messages or writes to DanaTrack. Today `addProject` does both from the demo too, which puts demo visitors' made-up projects into the owner's real DanaTrack data and Telegram chat. Fixed here because the rollover adds a second notification.

**Accounting (spec 7.4).** No extension or rollover creates, changes or deletes a transaction or a balance. Per project, net = cash received + amount carried into a new contract − modal. Summed over a rollover chain this equals the real cash movement, because the new contract's modal is the carried amount. "Total Modal Keluar" in exports counts cash only (leaves out `fundingMode: 'rollover'`).

**Worked examples from the spec (tests use them).**
- Mundur, 100jt, pelunasan 5 Okt, 2 bulan, 6,5%: *mulai hari itu* → 5 Okt bagi hasil 6,5jt, 5 Nov bagi hasil 6,5jt, 5 Des pelunasan 100jt. *Mulai bulan depan* → 5 Nov, 5 Des bagi hasil, 5 Jan pelunasan.
- Diperpanjang, 30 of 100jt paid on 5 Okt, 2 bulan, 6,5%: *hari itu* → 5 Okt bagi hasil 4,55jt, 5 Nov 4,55jt, 5 Des pelunasan 70jt. *Bulan depan* → 5 Nov, 5 Des, 5 Jan pelunasan 70jt.

---

## File Structure

| File | Responsibility |
|---|---|
| `src/utils/extension.js` (create) | `extensionDue`, `buildExtensionRows`, `currentFinal`, `extensionOptions`, `applyExtension`, `applyUndoExtension`, `undoCheck`. |
| `src/utils/rollover.js` (create) | `rolloverSource`, `rolloverSchedule`, `applyRolloverClose`, `applyRolloverUndo`. |
| `src/utils/projectSchedule.js` (modify) | `projectSummary`: pelunasan return against its own base, `rolledOut` in net; `projectEnd`. |
| `src/utils/exportColumns.js`, `src/utils/projectExport.js` (modify) | End date follows extensions; status labels Diperpanjang / Kontrak baru; such rows left out of Daftar Tagihan; Total Modal Keluar counts cash only. |
| `src/utils/receiptOps.js` (modify) | No corrections on a project closed by rollover; the block message names an extension. |
| `src/contexts/DataContext.jsx` (modify) | `extendProject`, `undoExtension`, `rolloverProject`; `deleteProject` undoes a rollover; `updateProject` locks; `recordReceipt` reports a partly paid pelunasan; demo sends no Telegram/DanaTrack. |
| `src/components/Projects/ExtensionSheet.jsx` (create) | Mundur / Perpanjang: months, rate, start, note, preview. |
| `src/components/Projects/PelunasanRestSheet.jsx` (create) | "Sisa pelunasan Rp X mau diapakan?" with the three choices. |
| `src/components/Projects/ProjectDetail.jsx` (modify) | Pills and actions on the pelunasan, Mundur button, list of schedule changes with undo, links between contracts, rollover wording. |
| `src/components/Projects/ProjectForm.jsx` (modify) | Kontrak baru mode (prefill, modal dialihkan, first-month toggle); locked schedule fields; rollover projects keep their modal. |
| `src/utils/demoReset.js` (modify) | A demo refill lands only while its claim holds (B4 review follow-up). |

---
### Task 1: The rows an extension adds

**Files:**
- Create: `src/utils/extension.js`
- Test: `src/utils/extension.test.js`

- [ ] **Step 1: Write the failing tests**

Create `src/utils/extension.test.js`:

```js
import { describe, it, expect } from 'vitest';
import { buildExtensionRows, extensionDue } from './extension';

const d = (y, m, day) => new Date(y, m, day);
const shape = (rows) =>
  rows.map((r) => ({ no: r.no, type: r.type, amount: r.expectedAmount, due: r.dueDate.toDate().toDateString() }));
const base = {
  firstNo: 4, anchorDue: d(2026, 9, 5), paymentDay: 5, months: 2, ratePct: 6.5,
  baseAmount: 100_000_000, startMode: 'today', extensionId: 'e1',
};

describe('buildExtensionRows', () => {
  it('Mundur from the pelunasan month itself (spec 7.1)', () => {
    const rows = buildExtensionRows(base);
    expect(shape(rows)).toEqual([
      { no: 4, type: 'interest', amount: 6_500_000, due: d(2026, 9, 5).toDateString() },
      { no: 5, type: 'interest', amount: 6_500_000, due: d(2026, 10, 5).toDateString() },
      { no: 6, type: 'final', amount: 100_000_000, due: d(2026, 11, 5).toDateString() },
    ]);
    for (const r of rows) {
      expect(r).toMatchObject({ extensionId: 'e1', baseAmount: 100_000_000, receivedAmount: null, transactionId: null });
    }
    expect(rows[0].ratePct).toBe(6.5);
    expect(rows[2].ratePct).toBeNull();
  });

  it('starting next month moves every row one month later', () => {
    const rows = buildExtensionRows({ ...base, startMode: 'nextMonth' });
    expect(shape(rows).map((r) => r.due)).toEqual(
      [d(2026, 10, 5), d(2026, 11, 5), d(2027, 0, 5)].map((x) => x.toDateString())
    );
  });

  it('asks 4.550.000 a month on a 70jt remainder at 6,5% (spec 7.2)', () => {
    const rows = buildExtensionRows({ ...base, firstNo: 5, baseAmount: 70_000_000 });
    expect(shape(rows).map((r) => [r.no, r.amount])).toEqual([[5, 4_550_000], [6, 4_550_000], [7, 70_000_000]]);
  });

  it('keeps the payment day, clamped to short months', () => {
    const rows = buildExtensionRows({ ...base, anchorDue: d(2026, 0, 31), paymentDay: 31, months: 1, startMode: 'nextMonth' });
    expect(rows[0].dueDate.toDate().getDate()).toBe(28); // Februari 2026
    expect(rows[1].dueDate.toDate().getDate()).toBe(31); // Maret
    expect(extensionDue(d(2026, 0, 31), 31, 'today').getDate()).toBe(31);
  });

  it('refuses what cannot be a schedule', () => {
    expect(() => buildExtensionRows({ ...base, months: 0 })).toThrow('Jumlah bulan');
    expect(() => buildExtensionRows({ ...base, months: 1.5 })).toThrow('Jumlah bulan');
    expect(() => buildExtensionRows({ ...base, ratePct: NaN })).toThrow('Persen');
    expect(() => buildExtensionRows({ ...base, ratePct: -1 })).toThrow('Persen');
    expect(() => buildExtensionRows({ ...base, baseAmount: 0 })).toThrow('Nilai');
    expect(() => buildExtensionRows({ ...base, anchorDue: null })).toThrow('Tanggal');
    expect(() => buildExtensionRows({ ...base, extensionId: '' })).toThrow('Id');
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/utils/extension.test.js`
Expected: FAIL, "Cannot find module './extension'".

- [ ] **Step 3: Implement**

Create `src/utils/extension.js`:

```js
import { Timestamp } from 'firebase/firestore';
import { toDate } from './formatDate';
import { calcMonthlyInterest, pickPaymentDate } from './projectSchedule';

/**
 * Moving a pelunasan later (spec 7.1, 7.2), decided as data; DataContext
 * writes it.
 * - Mundur X bulan: a pelunasan nobody has paid toward is replaced by
 *   `months` bagi hasil on its base and a new pelunasan after them.
 * - Diperpanjang: what is left of a partly paid pelunasan becomes the base of
 *   `months` bagi hasil and a pelunasan of that remainder, added after it;
 *   the old pelunasan is closed by the extension.
 * No money moves. Each extension is recorded on the project, and the latest
 * one can be undone while none of its tagihan has been touched.
 */

const byNo = (a, b) => (Number(a.no) || 0) - (Number(b.no) || 0);

// Due date `k` months into an extension: counted from the pelunasan's month
// ('today') or the month after ('nextMonth'), on the payment day.
export function extensionDue(anchorDue, paymentDay, startMode, k = 0) {
  const anchor = toDate(anchorDue);
  if (!anchor) return null;
  const day = Number(paymentDay) || anchor.getDate();
  const offset = startMode === 'nextMonth' ? 1 : 0;
  return pickPaymentDate(anchor.getFullYear(), anchor.getMonth() + offset + k, day);
}

/**
 * The rows an extension adds: `months` monthly bagi hasil of
 * round(baseAmount × ratePct / 100), then the pelunasan of `baseAmount` one
 * month after the last of them.
 */
export function buildExtensionRows({
  firstNo, anchorDue, paymentDay, months, ratePct, baseAmount, startMode, extensionId,
}) {
  const count = Number(months);
  const rate = Number(ratePct);
  const base = Math.round(Number(baseAmount) || 0);
  if (!extensionId) throw new Error('Id perpanjangan wajib ada');
  if (!toDate(anchorDue)) throw new Error('Tanggal jatuh tempo pelunasan tidak diketahui.');
  if (!Number.isInteger(count) || count < 1 || count > 60) throw new Error('Jumlah bulan harus 1 sampai 60.');
  if (!Number.isFinite(rate) || rate < 0 || rate > 100) throw new Error('Persen bagi hasil tidak valid.');
  if (base <= 0) throw new Error('Nilai yang diperpanjang harus lebih dari 0.');

  const due = (k) => Timestamp.fromDate(extensionDue(anchorDue, paymentDay, startMode, k));
  const blank = { receivedAmount: null, receivedDate: null, transactionId: null, accountId: null };
  const rows = [];
  for (let k = 0; k < count; k++) {
    rows.push({
      no: firstNo + k,
      dueDate: due(k),
      type: 'interest',
      expectedAmount: calcMonthlyInterest(base, rate),
      ratePct: rate,
      baseAmount: base,
      extensionId,
      ...blank,
    });
  }
  rows.push({
    no: firstNo + count,
    dueDate: due(count),
    type: 'final',
    expectedAmount: base,
    ratePct: null,
    baseAmount: base,
    extensionId,
    ...blank,
  });
  return rows;
}
```

Note: `byNo` is used by Task 2's functions in the same file.

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run src/utils/extension.test.js`
Expected: PASS (5 tests). `npx eslint src/utils/extension.js` may report `byNo` unused until Task 2; that is fine only between these two tasks.

- [ ] **Step 5: Commit** (together with Task 2, so no commit leaves an unused helper)

### Task 2: What the pelunasan allows, applying and undoing an extension

**Files:**
- Modify: `src/utils/extension.js`
- Test: `src/utils/extension.test.js`

- [ ] **Step 1: Write the failing tests**

Add these imports at the top of `src/utils/extension.test.js`, replacing its first two import lines:

```js
import { describe, it, expect } from 'vitest';
import {
  buildExtensionRows, extensionDue, currentFinal, extensionOptions, applyExtension, applyUndoExtension, undoCheck,
} from './extension';
import { isSettled, rowCarriedIn, rowRemaining, rowState } from './paymentStatus';
import { normalizeProject } from './normalizeProject';
```

Append to the end of `src/utils/extension.test.js`:

```js
const due = (m) => new Date(2026, m, 5);
const at = new Date(2026, 9, 5);

// Three monthly bagi hasil of 5,5jt and the pelunasan (100jt) on 5 Okt 2026.
const schedule = () => [
  { no: 1, type: 'interest', expectedAmount: 5_500_000, dueDate: due(6), receivedAmount: null },
  { no: 2, type: 'interest', expectedAmount: 5_500_000, dueDate: due(7), receivedAmount: null },
  { no: 3, type: 'interest', expectedAmount: 5_500_000, dueDate: due(8), receivedAmount: null },
  { no: 4, type: 'final', expectedAmount: 100_000_000, dueDate: due(9), receivedAmount: null },
];
const arrival = (id, pays) => {
  const allocations = Object.entries(pays).map(([no, amount]) => ({ no: Number(no), amount }));
  return { id, amount: allocations.reduce((s, a) => s + a.amount, 0), date: due(9), accountId: 'bca', transactionId: `tx-${id}`, allocations };
};
const bagiHasil = () => arrival('bh', { 1: 5_500_000, 2: 5_500_000, 3: 5_500_000 });
const project = (receipts, over = {}) => ({
  status: 'active', principalAmount: 100_000_000, paymentDayOfMonth: 5, payments: schedule(), receipts, ...over,
});
const after = (p, out) => ({ ...p, ...out.update });
const row = (out, no) => out.update.payments.find((r) => r.no === no);
const opts = (kind, over = {}) => ({ kind, months: 2, ratePct: 6.5, startMode: 'today', at, id: 'e1', ...over });

describe('what the pelunasan allows now', () => {
  it('offers Mundur on an untouched pelunasan and Diperpanjang on a partly paid one', () => {
    const untouched = extensionOptions(project([bagiHasil()]));
    expect(untouched.mundur.ok).toBe(true);
    expect(untouched.sisa.ok).toBe(false);
    expect(untouched.final.no).toBe(4);

    const partly = extensionOptions(project([bagiHasil(), arrival('p', { 4: 30_000_000 })]));
    expect(partly.mundur.ok).toBe(false);
    expect(partly.mundur.why).toMatch(/Atur sisa pelunasan/);
    expect(partly.sisa.ok).toBe(true);
    expect(partly.remainder).toBe(70_000_000);
  });

  it('offers nothing on a paid or closed pelunasan, or a project that is not active', () => {
    const paid = extensionOptions(project([bagiHasil(), arrival('p', { 4: 100_000_000 })]));
    expect([paid.mundur.ok, paid.sisa.ok]).toEqual([false, false]);
    const done = extensionOptions(project([], { status: 'completed' }));
    expect(done.mundur.why).toMatch(/masih aktif/);
    const closed = project([]);
    closed.payments[3] = { ...closed.payments[3], closure: { kind: 'waive', amount: 100_000_000, reason: 'manual' } };
    expect(extensionOptions(closed).mundur.ok).toBe(false);
  });

  it('finds the pelunasan the schedule ends with, after an earlier extension too', () => {
    const p = project([bagiHasil(), arrival('p', { 4: 30_000_000 })]);
    const out = applyExtension(p, opts('sisa'));
    expect(currentFinal(after(p, out)).no).toBe(7);
  });
});

describe('applyExtension: Mundur', () => {
  it('replaces the pelunasan with bagi hasil months and a later pelunasan', () => {
    const p = project([bagiHasil()]);
    const out = applyExtension(p, opts('mundur'));
    expect(out.update.payments.map((r) => [r.no, r.type, r.expectedAmount])).toEqual([
      [1, 'interest', 5_500_000], [2, 'interest', 5_500_000], [3, 'interest', 5_500_000],
      [4, 'interest', 6_500_000], [5, 'interest', 6_500_000], [6, 'final', 100_000_000],
    ]);
    expect(row(out, 4).dueDate.toDate().toDateString()).toBe(due(9).toDateString());
    expect(out.extension).toEqual({
      id: 'e1', at, kind: 'mundur', months: 2, ratePct: 6.5, startMode: 'today',
      baseAmount: 100_000_000, firstNo: 4, replacedRows: [schedule()[3]],
    });
    expect(out.update.extensions).toEqual([out.extension]);
    expect(out.update.status).toBeUndefined();
    expect(out.update.receipts).toBeUndefined();
  });

  it('stores the note only when there is one', () => {
    expect(applyExtension(project([]), opts('mundur')).extension.note).toBeUndefined();
    expect(applyExtension(project([]), opts('mundur', { note: 'panen telat' })).extension.note).toBe('panen telat');
  });

  it('moves a pelunasan an earlier Diperpanjang created, on its own base', () => {
    const p = project([bagiHasil(), arrival('p', { 4: 30_000_000 })]);
    const first = after(p, applyExtension(p, opts('sisa', { id: 'e1' })));
    const paid = { ...first, receipts: [...first.receipts, arrival('q', { 5: 4_550_000, 6: 4_550_000 })] };
    const out = applyExtension(paid, opts('mundur', { id: 'e2', months: 1 }));
    expect(out.update.payments.filter((r) => r.no >= 7).map((r) => [r.no, r.type, r.expectedAmount])).toEqual([
      [7, 'interest', 4_550_000], [8, 'final', 70_000_000],
    ]);
  });

  it('lets a tunggakan carried onto the pelunasan ride on the first new month', () => {
    const p = project([bagiHasil()]);
    p.payments[2] = { ...p.payments[2], closure: { kind: 'carry', amount: 2_000_000, toNo: 4 } };
    const next = after(p, applyExtension(p, opts('mundur')));
    const first = next.payments.find((r) => r.no === 4);
    expect(rowCarriedIn(next, first)).toBe(2_000_000);
    expect(rowRemaining(next, first)).toBe(8_500_000);
  });

  it('works on a project stored before receipts existed and writes no receipts', () => {
    const legacy = {
      status: 'active', principalAmount: 100_000_000, paymentDayOfMonth: 5,
      payments: schedule().map((r) => (r.no < 4 ? { ...r, receivedAmount: 5_500_000, receivedDate: due(r.no + 5) } : r)),
    };
    const out = applyExtension(legacy, opts('mundur'));
    expect(out.update.receipts).toBeUndefined();
    const next = normalizeProject({ ...legacy, ...out.update });
    expect(next.payments.filter((r) => isSettled(next, r)).map((r) => r.no)).toEqual([1, 2, 3]);
  });
});

describe('applyExtension: Diperpanjang', () => {
  it('closes the pelunasan with the extension and adds bagi hasil on the remainder (spec 7.2)', () => {
    const p = project([bagiHasil(), arrival('p', { 4: 30_000_000 })]);
    const out = applyExtension(p, opts('sisa'));
    expect(row(out, 4).closure).toEqual({ kind: 'extend', amount: 70_000_000, extensionId: 'e1', at });
    expect(out.update.payments.filter((r) => r.no > 4).map((r) => [r.no, r.type, r.expectedAmount])).toEqual([
      [5, 'interest', 4_550_000], [6, 'interest', 4_550_000], [7, 'final', 70_000_000],
    ]);
    const next = after(p, out);
    expect(isSettled(next, row(out, 4))).toBe(true);
    expect(rowState(next, row(out, 7))).toBe('belum');
    expect(out.extension).toMatchObject({ kind: 'sisa', baseAmount: 70_000_000, firstNo: 5, replacedRows: [] });
  });

  it('refuses what the pelunasan does not allow, an unknown choice and a missing start', () => {
    const untouched = project([bagiHasil()]);
    expect(() => applyExtension(untouched, opts('sisa'))).toThrow(/belum dibayar/);
    const partly = project([bagiHasil(), arrival('p', { 4: 30_000_000 })]);
    expect(() => applyExtension(partly, opts('mundur'))).toThrow(/Atur sisa pelunasan/);
    expect(() => applyExtension(partly, opts('lain'))).toThrow('Pilihan tidak dikenal');
    expect(() => applyExtension(partly, opts('sisa', { startMode: 'kemarin' }))).toThrow(/mulai/);
    expect(() => applyExtension(partly, opts('sisa', { id: '' }))).toThrow('Id');
  });
});

describe('applyUndoExtension', () => {
  it('brings a Mundur pelunasan back exactly as it was', () => {
    const p = project([bagiHasil()]);
    const extended = after(p, applyExtension(p, opts('mundur')));
    const out = applyUndoExtension(extended, 'e1');
    expect(out.update.payments).toEqual(p.payments);
    expect(out.update.extensions).toEqual([]);
  });

  it('opens a Diperpanjang pelunasan again', () => {
    const p = project([bagiHasil(), arrival('p', { 4: 30_000_000 })]);
    const extended = after(p, applyExtension(p, opts('sisa')));
    const out = applyUndoExtension(extended, 'e1');
    expect(out.update.payments).toEqual(p.payments);
    expect(rowState(after(extended, out), row(out, 4))).toBe('kurang');
  });

  it('refuses once a new month has money or a closure', () => {
    const p = project([bagiHasil()]);
    const extended = after(p, applyExtension(p, opts('mundur')));
    const paid = { ...extended, receipts: [...extended.receipts, arrival('x', { 5: 1_000_000 })] };
    expect(() => applyUndoExtension(paid, 'e1')).toThrow(/Bulan 5/);
    const closed = {
      ...extended,
      payments: extended.payments.map((r) => (r.no === 4 ? { ...r, closure: { kind: 'waive', amount: 6_500_000, reason: 'manual' } } : r)),
    };
    expect(() => applyUndoExtension(closed, 'e1')).toThrow(/Bulan 4/);
  });

  it('refuses while a tunggakan sits on one of its months, except a Mundur first month', () => {
    const p = project([bagiHasil()]);
    const extended = after(p, applyExtension(p, opts('mundur')));
    const carryTo = (toNo) => ({
      ...extended,
      payments: extended.payments.map((r) => (r.no === 3 ? { ...r, closure: { kind: 'carry', amount: 1, toNo } } : r)),
    });
    expect(() => applyUndoExtension(carryTo(4), 'e1')).not.toThrow();
    expect(() => applyUndoExtension(carryTo(5), 'e1')).toThrow(/Tunggakan bulan 3/);
  });

  it('undoes only the latest extension, and only the one the owner saw', () => {
    const p = project([bagiHasil()]);
    const once = after(p, applyExtension(p, opts('mundur', { id: 'e1' })));
    const twice = after(once, applyExtension(once, opts('mundur', { id: 'e2', months: 1 })));
    expect(() => applyUndoExtension(twice, 'e1')).toThrow(/terakhir/);
    expect(applyUndoExtension(twice, 'e2').update.extensions.map((e) => e.id)).toEqual(['e1']);
    expect(() => applyUndoExtension(p)).toThrow(/Tidak ada/);
    expect(undoCheck(twice)).toEqual({ ok: true, why: null });
    expect(undoCheck({ ...twice, status: 'completed' }).ok).toBe(false);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/utils/extension.test.js`
Expected: FAIL on the new tests ("currentFinal is not a function" or similar); Task 1's five still pass.

- [ ] **Step 3: Implement**

In `src/utils/extension.js`, add two imports after the existing three:

```js
import { rowDue, rowReceived, rowRemaining } from './paymentStatus';
import { normalizeProject } from './normalizeProject';
```

Append to the end of `src/utils/extension.js`:

```js
// The pelunasan the schedule ends with now. Diperpanjang leaves the old one
// in place, closed, with the new one after it.
export function currentFinal(project) {
  return (project?.payments || [])
    .filter((r) => r.type === 'final')
    .reduce((last, r) => (!last || (Number(r.no) || 0) > (Number(last.no) || 0) ? r : last), null);
}

const refuse = (why) => ({ ok: false, why });
const allow = { ok: true, why: null };

/**
 * What can be done to the pelunasan now: Mundur while nobody has paid toward
 * it, Diperpanjang while it is partly paid. `remainder` is what is left on it.
 */
export function extensionOptions(project) {
  const p = normalizeProject(project);
  const final = currentFinal(p);
  if (p?.status !== 'active') {
    const why = 'Jadwal hanya bisa diubah di project yang masih aktif.';
    return { mundur: refuse(why), sisa: refuse(why), final, remainder: 0 };
  }
  if (!final) {
    const why = 'Project ini tidak punya pelunasan.';
    return { mundur: refuse(why), sisa: refuse(why), final, remainder: 0 };
  }
  const received = rowReceived(p, final);
  const remainder = rowRemaining(p, final);
  let mundur = allow;
  let sisa = allow;
  if (final.closure) {
    mundur = sisa = refuse('Pelunasan ini sudah ditutup.');
  } else if (remainder <= 0) {
    mundur = sisa = refuse('Pelunasan sudah lunas.');
  } else if (received > 0) {
    mundur = refuse('Pelunasan sudah dibayar sebagian. Atur sisanya lewat "Atur sisa pelunasan".');
  } else {
    sisa = refuse('Pelunasan belum dibayar sama sekali. Pakai "Mundurkan pelunasan".');
  }
  return { mundur, sisa, final, remainder };
}

/**
 * Mundur (`kind: 'mundur'`) or Diperpanjang (`kind: 'sisa'`).
 * `at` is when it is recorded, in the shape stored; `id` names the extension
 * and is made before the write, so a rerun recognises its own extension.
 * @returns {{ update, extension }}
 */
export function applyExtension(project, { kind, months, ratePct, startMode, note = '', at, id }) {
  const p = normalizeProject(project);
  if (!id) throw new Error('Id perpanjangan wajib ada');
  if (!at) throw new Error('Tanggal wajib diisi');
  if (startMode !== 'today' && startMode !== 'nextMonth') {
    throw new Error('Pilih mulai hari itu atau mulai bulan depan.');
  }
  const opts = extensionOptions(p);
  const check = kind === 'mundur' ? opts.mundur : kind === 'sisa' ? opts.sisa : null;
  if (!check) throw new Error('Pilihan tidak dikenal');
  if (!check.ok) throw new Error(check.why);

  const final = opts.final;
  const lastNo = Math.max(...p.payments.map((r) => Number(r.no) || 0));
  const common = {
    anchorDue: final.dueDate,
    paymentDay: p.paymentDayOfMonth,
    months: Number(months),
    ratePct: Number(ratePct),
    startMode,
    extensionId: id,
  };

  let payments;
  let extension;
  if (kind === 'mundur') {
    // The pelunasan's own base: the project value, or the remainder an
    // earlier Diperpanjang carried forward.
    const baseAmount = Number(final.baseAmount ?? p.principalAmount) || rowDue(final);
    const rows = buildExtensionRows({ ...common, firstNo: final.no, baseAmount });
    payments = [...p.payments.filter((r) => r.no !== final.no), ...rows];
    extension = {
      id, at, kind, months: common.months, ratePct: common.ratePct, startMode,
      baseAmount, firstNo: final.no, replacedRows: [final],
    };
  } else {
    const baseAmount = opts.remainder;
    const rows = buildExtensionRows({ ...common, firstNo: lastNo + 1, baseAmount });
    const closure = { kind: 'extend', amount: baseAmount, extensionId: id, at };
    payments = [...p.payments.map((r) => (r.no === final.no ? { ...r, closure } : r)), ...rows];
    extension = {
      id, at, kind, months: common.months, ratePct: common.ratePct, startMode,
      baseAmount, firstNo: lastNo + 1, replacedRows: [],
    };
  }
  if (note) extension.note = note;
  payments.sort(byNo);
  return { update: { payments, extensions: [...(p.extensions || []), extension] }, extension };
}

/**
 * Undo the latest extension while none of its months has money or a
 * closure: its rows go, a Mundur's pelunasan comes back, a Diperpanjang's
 * pelunasan opens again. `extensionId` is the one the owner saw, so a
 * repeated tap never undoes an earlier one.
 * @returns {{ update, extension }}
 */
export function applyUndoExtension(project, extensionId = null) {
  const p = normalizeProject(project);
  const list = p.extensions || [];
  const ext = list[list.length - 1];
  if (!ext) throw new Error('Tidak ada perpanjangan untuk dibatalkan.');
  if (extensionId && ext.id !== extensionId) throw new Error('Hanya perpanjangan terakhir yang bisa dibatalkan.');
  if (p.status !== 'active') throw new Error('Perpanjangan hanya bisa dibatalkan di project yang masih aktif.');

  const mine = new Set(p.payments.filter((r) => r.extensionId === ext.id).map((r) => r.no));
  const touched = p.payments.find((r) => mine.has(r.no) && (rowReceived(p, r) > 0 || r.closure));
  if (touched) {
    throw new Error(`Bulan ${touched.no} dari perpanjangan ini sudah dibayar atau ditutup. Batalkan itu dulu.`);
  }
  // A tunggakan carried onto one of its months would lose its month. A
  // Mundur's first month has the old pelunasan's number, which comes back.
  const keep = ext.kind === 'mundur' ? ext.firstNo : null;
  const carried = p.payments.find(
    (r) => r.closure?.kind === 'carry' && mine.has(r.closure.toNo) && r.closure.toNo !== keep
  );
  if (carried) {
    throw new Error(`Tunggakan bulan ${carried.no} digabung ke bulan ${carried.closure.toNo}. Buka dulu penggabungannya.`);
  }

  let payments = p.payments.filter((r) => !mine.has(r.no));
  if (ext.kind === 'mundur') {
    payments = [...payments, ...(ext.replacedRows || [])];
  } else {
    payments = payments.map((r) => {
      if (r.closure?.kind !== 'extend' || r.closure.extensionId !== ext.id) return r;
      const next = { ...r };
      delete next.closure;
      return next;
    });
  }
  payments.sort(byNo);
  return { update: { payments, extensions: list.slice(0, -1) }, extension: ext };
}

/** Whether the latest extension can be undone now, and why not. */
export function undoCheck(project) {
  try {
    applyUndoExtension(project);
    return allow;
  } catch (e) {
    return refuse(e.message);
  }
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run src/utils/extension.test.js && npx eslint src/utils/extension.js src/utils/extension.test.js`
Expected: PASS (all tests in the file), no lint errors.

- [ ] **Step 5: Commit**

```bash
git add src/utils/extension.js src/utils/extension.test.js
git commit -m "feat: decide Mundur and Perpanjang, and undoing them, as data"
```

### Task 3: The summary and the end date follow extensions and rollovers

**Files:**
- Modify: `src/utils/projectSchedule.js` (`projectSummary`, new `projectEnd`)
- Test: `src/utils/projectSchedule.test.js`

- [ ] **Step 1: Write the failing tests**

In `src/utils/projectSchedule.test.js`, change the import to:

```js
import {
  projectEndFromDuration, projectEndDate, generateProjectSchedule, recomputeUnpaidSchedule,
  projectSummary, projectEnd,
} from './projectSchedule';
```

Append:

```js
describe('projectSummary with extensions and rollovers', () => {
  const extended = {
    principalAmount: 100_000_000,
    disbursedAmount: 94_500_000,
    payments: [
      { no: 1, type: 'interest', expectedAmount: 5_500_000 },
      { no: 2, type: 'final', expectedAmount: 100_000_000, closure: { kind: 'extend', amount: 70_000_000 } },
      { no: 3, type: 'interest', expectedAmount: 4_550_000, baseAmount: 70_000_000 },
      { no: 4, type: 'final', expectedAmount: 70_000_000, baseAmount: 70_000_000 },
    ],
    receipts: [
      { id: 'a', amount: 35_500_000, allocations: [{ no: 1, amount: 5_500_000 }, { no: 2, amount: 30_000_000 }] },
    ],
  };

  it("counts a pelunasan's return against its own base", () => {
    expect(projectSummary(extended).expectedTotalReturn).toBe(10_050_000);
  });

  it('counts what went into a new contract as having come back', () => {
    const rolled = {
      ...extended,
      payments: [
        extended.payments[0],
        { ...extended.payments[1], closure: { kind: 'rollover', amount: 70_000_000, projectId: 'n' } },
      ],
    };
    const s = projectSummary(rolled);
    expect(s.rolledOut).toBe(70_000_000);
    expect(s.netCashChange).toBe(35_500_000 + 70_000_000 - 94_500_000);
    expect(s.expectedRemaining).toBe(0);
    expect(projectSummary(extended).rolledOut).toBe(0);
  });
});

describe('projectEnd', () => {
  it('follows the schedule once an extension moved the pelunasan, the contract otherwise', () => {
    const p = {
      startDate: new Date(2026, 0, 10), durationMonths: 2, paymentDayOfMonth: 5, extensions: [{ id: 'e' }],
      payments: [{ no: 1, dueDate: new Date(2026, 1, 5) }, { no: 2, dueDate: new Date(2026, 5, 5) }],
    };
    expect(projectEnd(p).toDateString()).toBe(new Date(2026, 5, 5).toDateString());
    expect(projectEnd({ ...p, extensions: [] }).toDateString()).toBe(new Date(2026, 2, 5).toDateString());
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/utils/projectSchedule.test.js`
Expected: FAIL (`projectEnd` is not exported; the return is -19.950.000; `rolledOut` undefined).

- [ ] **Step 3: Implement**

In `src/utils/projectSchedule.js`, replace the body of `projectSummary` from `const payments = project.payments || [];` down to its `return { ... };` with:

```js
  const payments = project.payments || [];
  const principal = Number(project.principalAmount) || 0;
  const expectedTotalReturn = payments.reduce((s, p) => {
    if (p.type === 'interest') return s + p.expectedAmount;
    // A pelunasan returns its own base (the project value, or what an
    // extension carried forward); only what it asks above that is return.
    if (p.type === 'final') return s + (p.expectedAmount - (p.baseAmount ?? principal));
    return s;
  }, 0);
  const receivedSoFar = projectReceivedTotal(project);
  const expectedRemaining = payments.reduce((s, p) => s + rowRemaining(project, p), 0);
  const paidCount = payments.filter((p) => isSettled(project, p)).length;
  const allPaid = paidCount === payments.length && payments.length > 0;

  // What went into a new contract came back as that contract's modal (spec
  // 7.4): counted here so net stays true across a rollover chain.
  const rolledOut = payments.reduce(
    (s, p) => s + (p.closure?.kind === 'rollover' ? Number(p.closure.amount) || 0 : 0),
    0
  );
  // Net position: received (and carried into a new contract) minus modal.
  const disbursed = Number(project.disbursedAmount) || 0;
  const netCashChange = receivedSoFar + rolledOut - disbursed;

  return {
    expectedTotalReturn,
    receivedSoFar,
    expectedRemaining,
    paidCount,
    totalCount: payments.length,
    allPaid,
    rolledOut,
    netCashChange,
  };
```

Append to the end of `src/utils/projectSchedule.js`:

```js
// When the project really ends: the last due date on the schedule once
// Mundur or Perpanjang moved the pelunasan, the contract's own end otherwise.
export function projectEnd(p) {
  return (p?.extensions || []).length ? projectEndDate(p) : projectEndFromDuration(p);
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run src/utils/projectSchedule.test.js && npx vitest run`
Expected: PASS, whole suite green.

- [ ] **Step 5: Commit**

```bash
git add src/utils/projectSchedule.js src/utils/projectSchedule.test.js
git commit -m "feat: summary and end date follow extensions and rollovers"
```

### Task 4: Kontrak baru (rollover), decided as data

**Files:**
- Create: `src/utils/rollover.js`
- Test: `src/utils/rollover.test.js`

- [ ] **Step 1: Write the failing tests**

Create `src/utils/rollover.test.js`:

```js
import { describe, it, expect } from 'vitest';
import { rolloverSource, rolloverSchedule, applyRolloverClose, applyRolloverUndo } from './rollover';
import { isSettled, rowState } from './paymentStatus';
import { projectSummary } from './projectSchedule';

const due = (m) => new Date(2026, m, 5);
const at = new Date(2026, 9, 5);

const schedule = () => [
  { no: 1, type: 'interest', expectedAmount: 5_500_000, dueDate: due(6), receivedAmount: null },
  { no: 2, type: 'interest', expectedAmount: 5_500_000, dueDate: due(7), receivedAmount: null },
  { no: 3, type: 'interest', expectedAmount: 5_500_000, dueDate: due(8), receivedAmount: null },
  { no: 4, type: 'final', expectedAmount: 100_000_000, dueDate: due(9), receivedAmount: null },
];
const arrival = (id, pays, date) => {
  const allocations = Object.entries(pays).map(([no, amount]) => ({ no: Number(no), amount }));
  return { id, amount: allocations.reduce((s, a) => s + a.amount, 0), date, accountId: 'bca', transactionId: `tx-${id}`, allocations };
};
const bagiHasil = () => arrival('bh', { 1: 5_500_000, 2: 5_500_000, 3: 5_500_000 }, due(8));
const project = (receipts, over = {}) => ({
  status: 'active', principalAmount: 100_000_000, disbursedAmount: 94_500_000, paymentDayOfMonth: 5,
  payments: schedule(), receipts, ...over,
});
// 30 of the 100jt pelunasan paid in two parts, the latest on 7 Okt.
const partly = () => project([
  bagiHasil(),
  arrival('p1', { 4: 20_000_000 }, due(9)),
  arrival('p2', { 4: 10_000_000 }, new Date(2026, 9, 7)),
]);

describe('rolloverSource', () => {
  it('starts from what is left of a partly paid pelunasan, on the day its latest part arrived', () => {
    const src = rolloverSource(partly());
    expect(src).toMatchObject({ ok: true, amount: 70_000_000 });
    expect(src.final.no).toBe(4);
    expect(src.startDate.toDateString()).toBe(new Date(2026, 9, 7).toDateString());
  });

  it('refuses an untouched or paid pelunasan, an open earlier month and a closed project', () => {
    expect(rolloverSource(project([bagiHasil()])).why).toMatch(/belum dibayar/);
    expect(rolloverSource(project([bagiHasil(), arrival('p', { 4: 100_000_000 }, due(9))])).why).toMatch(/lunas/);
    expect(rolloverSource(project([arrival('p', { 4: 30_000_000 }, due(9))])).why).toMatch(/bulan 1 belum lunas/);
    expect(rolloverSource({ ...partly(), status: 'completed' }).ok).toBe(false);
  });
});

describe('rolloverSchedule', () => {
  const terms = {
    principalAmount: 70_000_000, returnPctTier1: 5.5, returnPctTier2: 6.5,
    durationMonths: 6, startDate: at, paymentDayOfMonth: 5,
  };

  it('is a normal schedule without the first-month charge', () => {
    const rows = rolloverSchedule({ ...terms, firstMonthCharge: 0 });
    expect(rows.map((r) => [r.no, r.type, r.expectedAmount])).toEqual([
      [1, 'interest', 3_850_000], [2, 'interest', 3_850_000], [3, 'interest', 3_850_000],
      [4, 'interest', 4_550_000], [5, 'interest', 4_550_000], [6, 'final', 70_000_000],
    ]);
    expect(rows.some((r) => r.leadCharge)).toBe(false);
  });

  it('adds a bagi hasil due on the contract day, then the usual months renumbered', () => {
    const rows = rolloverSchedule({ ...terms, firstMonthCharge: 3_850_000 });
    expect(rows[0]).toMatchObject({ no: 1, type: 'interest', expectedAmount: 3_850_000, leadCharge: true, receivedAmount: null });
    expect(rows[0].dueDate.toDate().toDateString()).toBe(at.toDateString());
    expect(rows.slice(1).map((r) => [r.no, r.expectedAmount])).toEqual([
      [2, 3_850_000], [3, 3_850_000], [4, 3_850_000], [5, 4_550_000], [6, 4_550_000], [7, 70_000_000],
    ]);
    expect(rows[1].dueDate.toDate().toDateString()).toBe(new Date(2026, 10, 5).toDateString());
  });
});

describe('closing the old project into the new contract, and undoing it', () => {
  it('closes the pelunasan with the rollover and completes the old project', () => {
    const p = partly();
    const out = applyRolloverClose(p, { newProjectId: 'n1', at });
    const final = out.update.payments.find((r) => r.no === 4);
    expect(final.closure).toEqual({ kind: 'rollover', amount: 70_000_000, projectId: 'n1', at });
    expect(out.update).toMatchObject({ status: 'completed', closedAt: at, rolledOverToProjectId: 'n1' });
    expect(out.amount).toBe(70_000_000);
    const next = { ...p, ...out.update };
    expect(next.payments.every((r) => isSettled(next, r))).toBe(true);
    // 46,5jt received + 70jt carried into the new contract − 94,5jt modal.
    expect(projectSummary(next).netCashChange).toBe(22_000_000);
  });

  it('opens the pelunasan again when the new contract is deleted', () => {
    const p = partly();
    const closed = { ...p, ...applyRolloverClose(p, { newProjectId: 'n1', at }).update };
    const out = applyRolloverUndo(closed, 'n1');
    expect(out.update).toMatchObject({ status: 'active', closedAt: null, rolledOverToProjectId: null });
    const reopened = { ...closed, ...out.update };
    expect(reopened.payments[3].closure).toBeUndefined();
    expect(rowState(reopened, reopened.payments[3])).toBe('kurang');
    expect(applyRolloverUndo(closed, 'lain').update).toBeNull();
  });

  it('refuses what rolloverSource refuses, and a missing new project', () => {
    expect(() => applyRolloverClose(project([bagiHasil()]), { newProjectId: 'n1', at })).toThrow(/belum dibayar/);
    expect(() => applyRolloverClose(partly(), { newProjectId: '', at })).toThrow(/Project baru/);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/utils/rollover.test.js`
Expected: FAIL, "Cannot find module './rollover'".

- [ ] **Step 3: Implement**

Create `src/utils/rollover.js`:

```js
import { Timestamp } from 'firebase/firestore';
import { toDate } from './formatDate';
import { generateProjectSchedule, resolveTiers } from './projectSchedule';
import { isSettled, rowReceived, rowRemaining } from './paymentStatus';
import { normalizeProject } from './normalizeProject';
import { currentFinal } from './extension';

/**
 * Kontrak baru (spec 7.3), decided as data; DataContext writes it.
 * What is left of a partly paid pelunasan becomes a new project whose modal
 * is that remainder, carried over: `fundingMode: 'rollover'`, no funding
 * transaction, no account touched. The old pelunasan is closed by the
 * rollover and the old project is completed. Deleting the new project undoes
 * it (applyRolloverUndo). No money moves either way.
 */

/** What a new contract would start from, or why it cannot. */
export function rolloverSource(project) {
  const p = normalizeProject(project);
  if (p?.status !== 'active') {
    return { ok: false, why: 'Hanya project aktif yang bisa dilanjutkan ke kontrak baru.' };
  }
  const final = currentFinal(p);
  if (!final || final.closure) return { ok: false, why: 'Pelunasan project ini sudah ditutup.' };
  if (rowReceived(p, final) <= 0) {
    return { ok: false, why: 'Pelunasan belum dibayar sama sekali. Pakai "Mundurkan pelunasan".' };
  }
  const amount = rowRemaining(p, final);
  if (amount <= 0) return { ok: false, why: 'Pelunasan sudah lunas.' };
  // The old project must end settled: only its pelunasan's remainder moves.
  const open = p.payments.find((r) => r.no !== final.no && !isSettled(p, r));
  if (open) {
    return { ok: false, why: `Tagihan bulan ${open.no} belum lunas. Selesaikan dulu sebelum membuat kontrak baru.` };
  }
  // The contract day defaults to the day the latest part of the pelunasan arrived.
  const startDate = (p.receipts || [])
    .filter((r) => (r.allocations || []).some((a) => a.no === final.no))
    .map((r) => toDate(r.date))
    .filter(Boolean)
    .reduce((latest, d) => (!latest || d > latest ? d : latest), null);
  return { ok: true, why: null, amount, final, startDate };
}

/**
 * The new contract's schedule. With `firstMonthCharge` (an amount above 0)
 * it starts with one more bagi hasil due on the contract day itself, standing
 * in for the month a normal project takes up front from the modal; the usual
 * months follow with their usual rates, numbered after it.
 */
export function rolloverSchedule({
  principalAmount, returnPctTier1, returnPctTier2, durationMonths, startDate, paymentDayOfMonth, firstMonthCharge,
}) {
  const rows = generateProjectSchedule({
    principalAmount, returnPctTier1, returnPctTier2, durationMonths, startDate, paymentDayOfMonth,
  });
  const charge = Math.round(Number(firstMonthCharge) || 0);
  if (charge <= 0) return rows;
  const start = startDate instanceof Date ? startDate : toDate(startDate);
  const { tier1 } = resolveTiers({ returnPctTier1, returnPctTier2 });
  const lead = {
    no: 1,
    dueDate: Timestamp.fromDate(start),
    type: 'interest',
    expectedAmount: charge,
    ratePct: tier1,
    leadCharge: true,
    receivedAmount: null,
    receivedDate: null,
    transactionId: null,
    accountId: null,
  };
  return [lead, ...rows.map((r) => ({ ...r, no: r.no + 1 }))];
}

/** The old project's side. @returns {{ update, amount }} */
export function applyRolloverClose(project, { newProjectId, at }) {
  const src = rolloverSource(project);
  if (!src.ok) throw new Error(src.why);
  if (!newProjectId) throw new Error('Project baru belum ada.');
  if (!at) throw new Error('Tanggal wajib diisi');
  const p = normalizeProject(project);
  const closure = { kind: 'rollover', amount: src.amount, projectId: newProjectId, at };
  const payments = p.payments.map((r) => (r.no === src.final.no ? { ...r, closure } : r));
  return {
    update: { payments, status: 'completed', closedAt: at, rolledOverToProjectId: newProjectId },
    amount: src.amount,
  };
}

/**
 * Undo, when the new contract is deleted: the old pelunasan opens again and
 * the old project is active. @returns {{ update }}, null when nothing to undo.
 */
export function applyRolloverUndo(project, newProjectId) {
  const p = normalizeProject(project);
  const target = (p?.payments || []).find(
    (r) => r.closure?.kind === 'rollover' && r.closure.projectId === newProjectId
  );
  if (!target) return { update: null };
  const payments = p.payments.map((r) => {
    if (r !== target) return r;
    const next = { ...r };
    delete next.closure;
    return next;
  });
  return { update: { payments, status: 'active', closedAt: null, rolledOverToProjectId: null } };
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run src/utils/rollover.test.js && npx eslint src/utils/rollover.js src/utils/rollover.test.js`
Expected: PASS, no lint errors.

- [ ] **Step 5: Commit**

```bash
git add src/utils/rollover.js src/utils/rollover.test.js
git commit -m "feat: decide a new contract from a partly paid pelunasan as data"
```

### Task 5: Exports and correction rules know extensions and rollovers

**Files:**
- Modify: `src/utils/projectExport.js`, `src/utils/exportColumns.js`, `src/utils/receiptOps.js`
- Test: `src/utils/projectExport.test.js`, `src/utils/exportColumns.test.js`, `src/utils/receiptOps.test.js`

- [ ] **Step 1: Write the failing tests**

In `src/utils/projectExport.test.js`, add `cashDisbursedTotal` to the import from `./projectExport` (after `collectionRows,`), then append:

```js
describe('extensions and new contracts in the exports', () => {
  const on = (m) => new Date(2026, m, 5);
  const extended = {
    id: 'x', name: 'Kebun', status: 'active', startDate: on(0), durationMonths: 2, paymentDayOfMonth: 5,
    principalAmount: 100_000_000, disbursedAmount: 94_500_000, extensions: [{ id: 'e1', kind: 'sisa' }],
    payments: [
      { no: 1, type: 'interest', expectedAmount: 5_500_000, dueDate: on(1) },
      { no: 2, type: 'final', expectedAmount: 100_000_000, dueDate: on(2), closure: { kind: 'extend', amount: 70_000_000, extensionId: 'e1' } },
      { no: 3, type: 'interest', expectedAmount: 4_550_000, dueDate: on(3), baseAmount: 70_000_000, extensionId: 'e1' },
      { no: 4, type: 'final', expectedAmount: 70_000_000, dueDate: on(4), baseAmount: 70_000_000, extensionId: 'e1' },
    ],
    receipts: [
      { id: 'a', amount: 35_500_000, date: on(2), accountId: 'bca', allocations: [{ no: 1, amount: 5_500_000 }, { no: 2, amount: 30_000_000 }] },
    ],
  };
  const rolledOld = {
    ...extended, id: 'o', name: 'Lama', status: 'completed', extensions: [], rolledOverToProjectId: 'n',
    payments: [
      extended.payments[0],
      { ...extended.payments[1], closure: { kind: 'rollover', amount: 70_000_000, projectId: 'n' } },
    ],
  };
  const rolledNew = {
    id: 'n', name: 'Lama (lanjutan)', status: 'active', fundingMode: 'rollover', startDate: on(2), durationMonths: 3,
    paymentDayOfMonth: 5, principalAmount: 70_000_000, disbursedAmount: 70_000_000, payments: [], receipts: [],
  };

  it('leaves an extended or rolled-over pelunasan out of the Daftar Tagihan', () => {
    const rows = collectionRows([extended, rolledOld], null);
    expect(rows.map((r) => `${r.project} ${r.dueStr} ${r.jenis}`)).toEqual([
      'Kebun 05/02/2026 Cicilan',
      'Lama 05/02/2026 Cicilan',
      'Kebun 05/04/2026 Cicilan',
      'Kebun 05/05/2026 Pelunasan',
    ]);
    expect(rows.find((r) => r.project === 'Kebun').endStr).toBe('05/05/2026');
  });

  it('says how the pelunasan ended on the Jadwal sheet', () => {
    const lines = scheduleSheetRows([extended, rolledOld], () => 'BCA', null);
    const status = (name, no) => lines.find((l) => l.Project === name && l['No. Pembayaran'] === no)?.Status;
    expect(status('Kebun', 2)).toBe('Diperpanjang');
    expect(status('Lama', 2)).toBe('Kontrak baru');
  });

  it('counts only cash in Total Modal Keluar', () => {
    expect(cashDisbursedTotal([extended, rolledOld, rolledNew])).toBe(189_000_000);
  });
});
```

Append to `src/utils/exportColumns.test.js`:

```js
describe('end date after an extension', () => {
  it('shows the pelunasan the schedule now ends with', () => {
    const p = {
      startDate: new Date(2026, 0, 10), durationMonths: 2, paymentDayOfMonth: 5, extensions: [{ id: 'e' }],
      payments: [{ no: 1, dueDate: new Date(2026, 1, 5) }, { no: 2, dueDate: new Date(2026, 5, 5) }],
    };
    const col = PROJECT_COLUMNS.find((c) => c.key === 'endDate');
    expect(cellText(col, p, { index: 0 })).toBe('05/06/2026');
  });
});
```

In `src/utils/receiptOps.test.js`, inside `describe('correctionRules', ...)`, add:

```js
  it('allows no correction on a project carried into a new contract, and says why', () => {
    const rules = correctionRules({ status: 'completed', rolledOverToProjectId: 'n' });
    expect(rules).toMatchObject({ edit: false, move: false, cancel: false });
    expect(rules.why).toMatch(/kontrak baru/);
  });
```

and append at the end of the file:

```js
describe('receiptBlock names an extension', () => {
  it('asks for the extension to be undone first', () => {
    const p = {
      status: 'active',
      payments: [{ no: 4, type: 'final', expectedAmount: 100, closure: { kind: 'extend', amount: 70, extensionId: 'e' } }],
      receipts: [{ id: 'r', amount: 30, allocations: [{ no: 4, amount: 30 }] }],
    };
    expect(receiptBlock(p, p.receipts[0])).toMatch(/Batalkan dulu perpanjangannya/);
  });
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `npx vitest run src/utils/projectExport.test.js src/utils/exportColumns.test.js src/utils/receiptOps.test.js`
Expected: FAIL on the new tests only.

- [ ] **Step 3: Implement**

`src/utils/projectExport.js`:
1. Replace `import { projectSummary, projectEndFromDuration } from './projectSchedule';` with `import { projectSummary, projectEnd } from './projectSchedule';`.
2. In `paymentStatusLabel`, after the `carry` line, add:

```js
  if (c?.kind === 'extend') return 'Diperpanjang';
  if (c?.kind === 'rollover') return 'Kontrak baru';
```

3. In `collectionRows`, replace

```js
      // A carried month is asked for on the month it moved to.
      if (pay.closure?.kind === 'carry') return;
```

with

```js
      // A carried month is asked for on the month it moved to; an extended
      // pelunasan on the extension's months; a rolled-over one in the new
      // contract.
      if (MOVED_ON.has(pay.closure?.kind)) return;
```

and replace `const end = projectEndFromDuration(p);` with `const end = projectEnd(p);`.
4. Just above `export function collectionRows`, add:

```js
const MOVED_ON = new Set(['carry', 'extend', 'rollover']);

// Cash that left the accounts to fund projects. A new contract's modal was
// carried over from the old project, not paid out again (spec 7.4).
export function cashDisbursedTotal(list) {
  return list
    .filter((p) => p.fundingMode !== 'rollover')
    .reduce((s, p) => s + (Number(p.disbursedAmount) || 0), 0);
}
```

5. In `exportProjectsToPdf`, replace `const totalDisbursed = sourceList.reduce((s, p) => s + (p.disbursedAmount || 0), 0);` with `const totalDisbursed = cashDisbursedTotal(sourceList);`.

`src/utils/exportColumns.js`: in the import from `./projectSchedule`, replace `projectEndFromDuration,` with `projectEnd,`; in the `endDate` column replace `projectEndFromDuration(p)` with `projectEnd(p)`.

`src/utils/receiptOps.js`:
1. In `correctionRules`, after the `default` branch, add:

```js
  if (project?.rolledOverToProjectId) {
    return {
      edit: false,
      move: false,
      cancel: false,
      why: 'Project ini sudah dilanjutkan ke kontrak baru. Sisa pelunasannya sekarang modal kontrak baru, jadi pembayarannya tidak bisa diubah.',
    };
  }
```

2. Replace the doc comment and body of `receiptBlock` with:

```js
/**
 * A tagihan this receipt paid that was closed some other way (gabung, anggap
 * lunas, perpanjangan) blocks correcting the receipt until that closure is
 * undone, or the stored closure amount would go stale and could silently
 * forgive or double-count money. Returns the message, or null.
 */
export function receiptBlock(project, receipt) {
  const nos = nosOf(receipt);
  const blocked = (project?.payments || []).find(
    (row) => nos.has(row.no) && row.closure && !ownedBy(project, receipt, row.closure)
  );
  if (!blocked) return null;
  if (blocked.closure.kind === 'extend') {
    return `Pelunasan bulan ${blocked.no} sudah diperpanjang. Batalkan dulu perpanjangannya sebelum mengubah pembayaran ini.`;
  }
  return `Tagihan bulan ${blocked.no} sudah ditutup dengan cara lain. Buka dulu penutupnya sebelum mengubah pembayaran ini.`;
}
```

- [ ] **Step 4: Run to verify they pass**

Run: `npx vitest run && npx eslint src/utils/projectExport.js src/utils/exportColumns.js src/utils/receiptOps.js`
Expected: whole suite PASS, no lint errors. (`grep -n projectEndFromDuration src/utils/projectExport.js src/utils/exportColumns.js` shows only comments.)

- [ ] **Step 5: Commit**

```bash
git add src/utils/projectExport.js src/utils/exportColumns.js src/utils/receiptOps.js src/utils/projectExport.test.js src/utils/exportColumns.test.js src/utils/receiptOps.test.js
git commit -m "feat: exports and correction rules know extensions and new contracts"
```

### Task 6: DataContext writes extensions and new contracts

No unit tests: DataContext is exercised in the browser (Task 10), like every writer before it. Everything it decides comes from the pure modules tested above.

**Files:**
- Modify: `src/contexts/DataContext.jsx`

- [ ] **Step 1: Imports**

Replace

```js
import { hasAnyReceipt, isSettled, projectReceivedTotal } from '../utils/paymentStatus';
```

with

```js
import { hasAnyReceipt, isSettled, projectReceivedTotal, rowState } from '../utils/paymentStatus';
```

and after the `remainderOps` import add:

```js
import { applyExtension, applyUndoExtension, currentFinal } from '../utils/extension';
import { applyRolloverClose, applyRolloverUndo, rolloverSchedule } from '../utils/rollover';
```

- [ ] **Step 2: The demo never reaches Telegram or DanaTrack**

In `addProject`, wrap everything from `const acct = accounts.find((a) => a.id === data.sourceAccountId);` through the `syncToDanaTrack(...)` call in:

```js
    // The demo is for trying the app: it never reaches the owner's Telegram
    // chat or his DanaTrack data.
    if (!isDemo) {
      // (the existing acct / rateLabel / notifyTelegram / syncToDanaTrack lines, unchanged)
    }
```

- [ ] **Step 3: updateProject keeps a new contract's modal and a locked schedule**

In `updateProject`, directly after `const hasReceived = hasAnyReceipt(project);` add:

```js
    // A new contract's modal is the remainder it carried over (spec 7.3): no
    // account paid it out, so it cannot change or be given an account.
    if (project.fundingMode === 'rollover') {
      const modalChange =
        data.disbursedAmount !== undefined && Number(data.disbursedAmount) !== project.disbursedAmount;
      const accountChange =
        data.sourceAccountId !== undefined && (data.sourceAccountId || null) !== (project.sourceAccountId || null);
      if (modalChange || accountChange) {
        throw new Error('Modal kontrak lanjutan dialihkan dari project lama dan tidak bisa diubah.');
      }
    }
```

Inside `if (scheduleChange) {`, after the three validation lines (`Durasi project minimal 1 bulan`, `Nilai project harus lebih dari 0`, `Tanggal pembayaran harus 1-31`), wrap everything from `update.payments = recomputeUnpaidSchedule(` down to the end of that `if (scheduleChange)` block (the `startDate` / `newFundingDate` lines included) like this:

```js
      // An extension's months, or a new contract's contract-day bagi hasil,
      // would be lost if the schedule were rebuilt from the duration: those
      // schedules only change through their own actions. The form still
      // sends every field, so only a real change is refused.
      const locked =
        (project.extensions || []).length > 0 || (project.payments || []).some((r) => r.leadCharge);
      if (locked) {
        const curStart = project.startDate?.toDate?.() || null;
        const curDay = Number(project.paymentDayOfMonth) || curStart?.getDate();
        const unchanged =
          newPrincipal === Number(project.principalAmount) &&
          newTier1 === Number(curTier1) &&
          newTier2 === Number(curTier2) &&
          newDuration === Number(project.durationMonths) &&
          newDay === curDay &&
          sameDay(newStart, curStart);
        if (!unchanged) {
          throw new Error(
            (project.extensions || []).length
              ? 'Jadwal sudah diubah lewat Mundur/Perpanjang.'
              : 'Jadwal kontrak lanjutan ini tidak bisa diubah lewat Edit Project.'
          );
        }
      } else {
        // (the existing lines from `update.payments = recomputeUnpaidSchedule(` to the end of the block, unchanged)
      }
```

- [ ] **Step 4: recordReceipt says when it left the pelunasan partly paid**

In `recordReceipt`, replace

```js
      t.update(ref, update);
      return { count: allocations.length, completed: update.status === 'completed' };
    }, { alreadyDone: (p) => (p.receipts || []).some((r) => r.id === txRef.id), seenWriteId });
    const count = outcome?.count ?? 1;
    const base = count > 1 ? `Pembayaran tercatat untuk ${count} tagihan` : 'Pembayaran tercatat';
    toast(outcome?.completed ? `${base}, project selesai` : base);
  }
```

with

```js
      t.update(ref, update);
      // A pelunasan this payment left partly paid: the screen asks what
      // happens to the rest (spec 7.2).
      const final = currentFinal(after);
      const finalShort =
        !update.status && !!final && byNo.has(final.no) && rowState(after, final) === 'kurang';
      return { count: allocations.length, completed: update.status === 'completed', finalShort };
    }, { alreadyDone: (p) => (p.receipts || []).some((r) => r.id === txRef.id), seenWriteId });
    const count = outcome?.count ?? 1;
    const base = count > 1 ? `Pembayaran tercatat untuk ${count} tagihan` : 'Pembayaran tercatat';
    toast(outcome?.completed ? `${base}, project selesai` : base);
    return { receiptId: txRef.id, finalShort: !!outcome?.finalShort };
  }
```

- [ ] **Step 5: extendProject, undoExtension, rolloverProject**

Directly after `reopenRemainder`, add:

```js
  // ===== When the pelunasan falls due (spec 7) =====
  // No money moves: only the schedule, through the same transaction, write id
  // and screen-version check as every other project write.

  async function extendProject(projectId, { kind, months, ratePct, startMode, note = '', seenWriteId } = {}) {
    // Made before the transaction so a rerun can recognise its own extension.
    const extId = doc(collection(db, C('projects'))).id;
    const extension = await inProjectTransaction(projectId, (t, project, ref, writeId) => {
      const out = applyExtension(project, {
        kind, months, ratePct, startMode, note, at: Timestamp.now(), id: extId,
      });
      t.update(ref, { ...out.update, lastWriteId: writeId });
      return out.extension;
    }, {
      alreadyDone: (p) => (p.extensions || []).some((e) => e.id === extId),
      seenWriteId,
    });
    const n = extension?.months ?? months;
    toast(kind === 'mundur' ? `Pelunasan dimundurkan ${n} bulan` : `Sisa pelunasan diperpanjang ${n} bulan`);
  }

  async function undoExtension(projectId, { extensionId, seenWriteId } = {}) {
    if (!extensionId) throw new Error('Perpanjangan yang dibatalkan tidak diketahui.');
    await inProjectTransaction(projectId, (t, project, ref, writeId) => {
      const { update } = applyUndoExtension(project, extensionId);
      t.update(ref, { ...update, lastWriteId: writeId });
    }, {
      // Gone already: this call's own earlier attempt, or another device.
      alreadyDone: (p) => !(p.extensions || []).some((e) => e.id === extensionId),
      seenWriteId,
    });
    toast('Perpanjangan dibatalkan');
  }

  // Kontrak baru (spec 7.3): the remainder of a partly paid pelunasan becomes
  // a new project in the same write that closes the old pelunasan. No money
  // moves: the new project's modal is that remainder, carried over.
  async function rolloverProject(oldProjectId, data, { seenWriteId } = {}) {
    const name = (data.name || '').trim();
    const principalAmount = Number(data.principalAmount) || 0;
    const returnPctTier1 = Number(data.returnPctTier1) || 0;
    const returnPctTier2 = data.returnPctTier2 != null ? Number(data.returnPctTier2) : returnPctTier1;
    const durationMonths = Number(data.durationMonths) || 0;
    const startDate = toDate(data.startDate) || new Date();
    const paymentDayOfMonth = Number(data.paymentDayOfMonth) || startDate.getDate();
    if (!name) throw new Error('Nama project wajib diisi');
    if (principalAmount <= 0) throw new Error('Nilai project harus lebih dari 0');
    if (durationMonths <= 0) throw new Error('Durasi project minimal 1 bulan');
    if (paymentDayOfMonth < 1 || paymentDayOfMonth > 31) throw new Error('Tanggal pembayaran harus 1-31');

    const payments = rolloverSchedule({
      principalAmount, returnPctTier1, returnPctTier2, durationMonths, startDate, paymentDayOfMonth,
      firstMonthCharge: data.firstMonthCharge,
    });
    // Made before the transaction so a rerun can recognise its own contract.
    const newRef = doc(collection(db, C('projects')));
    const at = Timestamp.fromDate(startDate);
    const outcome = await inProjectTransaction(oldProjectId, (t, old, ref, writeId) => {
      const { update, amount } = applyRolloverClose(old, { newProjectId: newRef.id, at });
      t.set(newRef, {
        name,
        ownerName: data.ownerName || null,
        contractNumber: data.contractNumber || null,
        phone: data.phone || null,
        nik: data.nik || null,
        address: data.address || null,
        collateral: data.collateral || null,
        description: data.description || '',
        principalAmount,
        // The remainder as read now, not the number the form showed.
        disbursedAmount: amount,
        monthlyReturnPct: returnPctTier1,
        returnPctTier1,
        returnPctTier2,
        durationMonths,
        startDate: at,
        paymentDayOfMonth,
        sourceAccountId: null,
        proofUrl: data.proofUrl || null,
        proofFileName: data.proofFileName || null,
        status: 'active',
        payments,
        fundingMode: 'rollover',
        rolledFromProjectId: oldProjectId,
        fundingTransactionId: null,
        lastWriteId: writeId,
        createdAt: serverTimestamp(),
      });
      t.update(ref, { ...update, lastWriteId: writeId });
      return { amount, oldName: old.name };
    }, {
      alreadyDone: (p) => p.rolledOverToProjectId === newRef.id,
      seenWriteId,
    });
    toast('Kontrak lanjutan dibuat');

    // Telegram only: a new contract moves no money, so DanaTrack is not told
    // (spec 7.3). Never from the demo.
    if (!isDemo) {
      const rateLabel = returnPctTier2 !== returnPctTier1
        ? `${returnPctTier1}% (bln 1-3) / ${returnPctTier2}% (bln 4+)`
        : `${returnPctTier1}%/bln`;
      const lead = payments.find((r) => r.leadCharge);
      notifyTelegram(
        `🔁 <b>Kontrak lanjutan dari ${outcome?.oldName || '-'}</b>\n` +
        `Nama: ${name}\n` +
        `Pemilik: ${data.ownerName || '-'}\n` +
        `No HP: ${data.phone || '-'}\n` +
        `NIK: ${data.nik || '-'}\n` +
        `Alamat: ${data.address || '-'}\n` +
        `Agunan: ${data.collateral || '-'}\n` +
        `Nilai: Rp ${principalAmount.toLocaleString('id-ID')}\n` +
        `Modal dialihkan: Rp ${Number(outcome?.amount || 0).toLocaleString('id-ID')} (tanpa uang keluar)\n` +
        `Return: ${rateLabel} × ${durationMonths} bln` +
        (lead ? `\nBagi hasil di hari kontrak: Rp ${lead.expectedAmount.toLocaleString('id-ID')}` : '')
      );
    }
    return newRef.id;
  }
```

- [ ] **Step 6: deleteProject undoes a rollover and refuses to break one**

In `deleteProject`:
1. Rename `const clawedBack = await inProjectTransaction(` to `const outcome = await inProjectTransaction(`.
2. As the first lines of the transaction function (before `// Reads first`), add:

```js
        // Carried into a new contract: that contract's modal is this money.
        if (project.rolledOverToProjectId) {
          throw new Error('Project ini sudah dilanjutkan ke kontrak baru. Batalkan dulu kontrak lanjutannya.');
        }
```

3. Directly after `const recovery = await read('transactions', project.finalRecoveryTransactionId);`, add:

```js
        // A new contract gives its remainder back to the project it came from.
        let restore = null;
        if (project.fundingMode === 'rollover' && project.rolledFromProjectId) {
          const oldRef = doc(db, C('projects'), project.rolledFromProjectId);
          const oldSnap = await t.get(oldRef);
          if (oldSnap.exists()) {
            const { update } = applyRolloverUndo({ id: oldSnap.id, ...oldSnap.data() }, project.id);
            if (update) restore = { ref: oldRef, update, name: oldSnap.data().name };
          }
        }
```

4. Replace

```js
        t.delete(ref);
        return projectReceivedTotal(project);
```

with

```js
        t.delete(ref);
        if (restore) {
          t.update(restore.ref, { ...restore.update, lastWriteId: doc(collection(db, C('projects'))).id });
        }
        return { received: projectReceivedTotal(project), restoredTo: restore?.name ?? null };
```

5. Replace the final toast line with:

```js
    if (outcome?.restoredTo) {
      toast(`Kontrak lanjutan dibatalkan, sisa kembali ditagih di ${outcome.restoredTo}`);
    } else {
      toast((outcome?.received ?? 0) > 0 ? 'Project dibatalkan, modal & return dikembalikan' : 'Project dibatalkan, modal dikembalikan');
    }
```

- [ ] **Step 7: Expose the writers**

In the `value` object, after `reopenRemainder,` add `extendProject, undoExtension, rolloverProject,`.

- [ ] **Step 8: Check**

Run: `npx vitest run && npm run build && npx eslint src/contexts/DataContext.jsx`
Expected: suite PASS, build exit 0, lint shows only the two errors `main` already has in this file.

- [ ] **Step 9: Commit**

```bash
git add src/contexts/DataContext.jsx
git commit -m "feat: write extensions and new contracts; the demo stays out of Telegram and DanaTrack"
```

### Task 7: The two sheets

**Files:**
- Create: `src/components/Projects/ExtensionSheet.jsx`
- Create: `src/components/Projects/PelunasanRestSheet.jsx`

- [ ] **Step 1: ExtensionSheet**

Create `src/components/Projects/ExtensionSheet.jsx`:

```jsx
import { useState } from 'react';
import Modal from '../common/Modal';
import { formatCurrency } from '../../utils/formatCurrency';
import { formatDate } from '../../utils/formatDate';
import { buildExtensionRows, extensionDue, extensionOptions } from '../../utils/extension';
import { resolveTiers } from '../../utils/projectSchedule';
import { rowCarriedIn } from '../../utils/paymentStatus';

// Mundur X bulan (kind 'mundur') or Diperpanjang (kind 'sisa'): how many
// months, at what rate, starting when. The owner sees every new tagihan and
// the new end before saving. No money moves.
export default function ExtensionSheet({ open, onClose, project, kind, onSubmit }) {
  if (!open || !project || !kind) return null;
  // Mounted fresh each time it opens, so a snapshot arriving never wipes
  // what the owner is typing.
  return <ExtensionForm key={kind} onClose={onClose} project={project} kind={kind} onSubmit={onSubmit} />;
}

function ExtensionForm({ onClose, project, kind, onSubmit }) {
  const [months, setMonths] = useState('1');
  const [rate, setRate] = useState(() => String(resolveTiers(project).tier2));
  const [startMode, setStartMode] = useState('today');
  const [note, setNote] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  // The version of the project this sheet showed; the save is refused if the
  // project has been written since.
  const seenWriteId = project.lastWriteId ?? null;

  const opts = extensionOptions(project);
  const check = kind === 'mundur' ? opts.mundur : opts.sisa;
  const final = opts.final;
  const baseAmount = kind === 'mundur'
    ? Number(final?.baseAmount ?? project.principalAmount) || 0
    : opts.remainder;
  const lastNo = Math.max(0, ...(project.payments || []).map((r) => Number(r.no) || 0));
  const carried = kind === 'mundur' && final ? rowCarriedIn(project, final) : 0;

  // The same rows the save will write, so the preview cannot disagree with it.
  let rows = [];
  let problem = check.ok ? '' : check.why;
  if (check.ok) {
    try {
      rows = buildExtensionRows({
        firstNo: kind === 'mundur' ? final.no : lastNo + 1,
        anchorDue: final.dueDate,
        paymentDay: project.paymentDayOfMonth,
        months: Number(months),
        ratePct: rate === '' ? NaN : Number(rate),
        baseAmount,
        startMode,
        extensionId: 'preview',
      });
    } catch (e) {
      problem = e.message;
    }
  }
  const last = rows[rows.length - 1];

  async function submit() {
    setError('');
    setSubmitting(true);
    try {
      await onSubmit({ kind, months: Number(months), ratePct: Number(rate), startMode, note: note.trim(), seenWriteId });
      onClose();
    } catch (e) {
      setError(e.message || 'Gagal menyimpan');
    } finally {
      setSubmitting(false);
    }
  }

  const startCard = (mode, label) => {
    const first = final ? extensionDue(final.dueDate, project.paymentDayOfMonth, mode) : null;
    const active = startMode === mode;
    return (
      <button
        type="button"
        onClick={() => setStartMode(mode)}
        className={`flex-1 text-left rounded-xl border p-3 ${active ? 'border-indigo bg-indigo-soft' : 'border-line bg-paper'}`}
      >
        <div className="text-[14px] font-semibold text-ink">{label}</div>
        <div className="text-[12px] text-ink-soft mt-0.5">Bagi hasil pertama {first ? formatDate(first) : '—'}</div>
      </button>
    );
  };

  return (
    <Modal
      open
      onClose={onClose}
      title={kind === 'mundur' ? 'Mundurkan pelunasan' : 'Perpanjang sisa pelunasan'}
      subtitle={project.name}
      footer={
        <button type="button" className="btn-primary w-full" disabled={submitting || !!problem} onClick={submit}>
          {submitting ? 'Menyimpan…' : 'Simpan'}
        </button>
      }
    >
      <div className="space-y-4">
        <div className="bg-cream-deep rounded-xl p-3 text-[13px] text-ink-soft leading-snug">
          {kind === 'mundur'
            ? `Pelunasan ${formatCurrency(baseAmount)} (jatuh tempo ${final ? formatDate(final.dueDate) : '—'}) dimundurkan. Selama itu dia membayar bagi hasil tiap bulan.`
            : `Sisa pelunasan ${formatCurrency(baseAmount)} diperpanjang. Selama itu dia membayar bagi hasil dari sisa itu tiap bulan, lalu melunasinya.`}
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label-text">Jumlah bulan</label>
            <input
              type="number"
              min="1"
              max="60"
              inputMode="numeric"
              className="input-field"
              value={months}
              onChange={(e) => setMonths(e.target.value)}
            />
          </div>
          <div>
            <label className="label-text">Bagi hasil / bulan (%)</label>
            <input
              type="number"
              step="0.1"
              min="0"
              className="input-field"
              value={rate}
              onChange={(e) => setRate(e.target.value)}
            />
          </div>
        </div>
        <div>
          <label className="label-text">Mulai</label>
          <div className="flex gap-2">
            {startCard('today', 'Mulai hari itu')}
            {startCard('nextMonth', 'Mulai bulan depan')}
          </div>
        </div>
        <div>
          <label className="label-text">Catatan (boleh kosong)</label>
          <input
            className="input-field"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Misalnya: panen mundur"
          />
        </div>
        {rows.length > 0 && (
          <div className="rounded-xl border border-line bg-paper p-3 text-[13px]">
            <div className="font-semibold text-ink mb-1">Jadwal baru:</div>
            {rows.map((r) => (
              <div key={r.no} className="flex justify-between gap-3 text-ink-soft">
                <span>
                  Bulan {r.no} · {formatDate(r.dueDate)} · {r.type === 'final' ? 'Pelunasan' : 'Bagi hasil'}
                </span>
                <span className="font-num">{formatCurrency(r.expectedAmount)}</span>
              </div>
            ))}
            {carried > 0 && (
              <p className="text-[12px] text-emas mt-1">
                Tunggakan {formatCurrency(carried)} yang digabung ke pelunasan ikut ditagih di bulan {final.no}.
              </p>
            )}
            <div className="flex justify-between border-t border-line-soft mt-2 pt-2 text-ink">
              <span>Selesai</span>
              <span className="font-semibold">{last ? formatDate(last.dueDate) : '—'}</span>
            </div>
          </div>
        )}
        {(error || problem) && <p className="text-[13px] text-terra">{error || problem}</p>}
      </div>
    </Modal>
  );
}
```

- [ ] **Step 2: PelunasanRestSheet**

Create `src/components/Projects/PelunasanRestSheet.jsx`:

```jsx
import Modal from '../common/Modal';
import { formatCurrency } from '../../utils/formatCurrency';
import { extensionOptions } from '../../utils/extension';
import { rolloverSource } from '../../utils/rollover';

// What is left of a partly paid pelunasan (spec 7.2): keep asking for it,
// extend it, or turn it into a new contract. Each choice says what it does,
// and one that cannot be done says why.
export default function PelunasanRestSheet({ open, onClose, project, onExtend, onRollover }) {
  if (!open || !project) return null;
  const { sisa, remainder, final } = extensionOptions(project);
  const roll = rolloverSource(project);
  const card =
    'w-full text-left rounded-xl border border-line bg-paper p-3 active:bg-cream-deep disabled:opacity-60';
  return (
    <Modal open onClose={onClose} title={`Sisa pelunasan ${formatCurrency(remainder)}`} subtitle={project.name}>
      <div className="space-y-3">
        <p className="text-[14px] text-ink-soft">Mau diapakan?</p>
        <button type="button" className={card} onClick={onClose}>
          <div className="text-[14px] font-semibold text-ink">Ditagih menyusul</div>
          <div className="text-[12px] text-ink-soft mt-0.5 leading-snug">
            Sisa tetap di pelunasan{final ? ` bulan ${final.no}` : ''} dan terus ditagih.
          </div>
        </button>
        <button type="button" className={card} disabled={!sisa.ok} onClick={onExtend}>
          <div className="text-[14px] font-semibold text-ink">Diperpanjang</div>
          <div className="text-[12px] text-ink-soft mt-0.5 leading-snug">
            {sisa.ok ? 'Sisa jadi pokok baru: dia bayar bagi hasil tiap bulan, lalu melunasi sisanya.' : sisa.why}
          </div>
        </button>
        <button type="button" className={card} disabled={!roll.ok} onClick={onRollover}>
          <div className="text-[14px] font-semibold text-ink">Kontrak baru</div>
          <div className="text-[12px] text-ink-soft mt-0.5 leading-snug">
            {roll.ok
              ? 'Sisa jadi project baru (kontrak lanjutan) tanpa uang keluar. Project ini selesai.'
              : roll.why}
          </div>
        </button>
      </div>
    </Modal>
  );
}
```

- [ ] **Step 3: Check**

Run: `npx eslint src/components/Projects/ExtensionSheet.jsx src/components/Projects/PelunasanRestSheet.jsx && npm run build`
Expected: no lint errors, build exit 0.

- [ ] **Step 4: Commit**

```bash
git add src/components/Projects/ExtensionSheet.jsx src/components/Projects/PelunasanRestSheet.jsx
git commit -m "feat: sheets for Mundur, Perpanjang and what is left of a pelunasan"
```

### Task 8: Project detail offers and shows it all

**Files:**
- Modify: `src/components/Projects/ProjectDetail.jsx`

- [ ] **Step 1: Imports**

After `import ReceiptSheet from './ReceiptSheet';` add:

```js
import ExtensionSheet from './ExtensionSheet';
import PelunasanRestSheet from './PelunasanRestSheet';
```

After `import { applyReopenRemainder } from '../../utils/remainderOps';` add:

```js
import { extensionOptions, undoCheck } from '../../utils/extension';
import { rolloverSource } from '../../utils/rollover';
```

- [ ] **Step 2: PaymentRow shows an extended or rolled-over pelunasan and offers its remainder**

1. Add `onSettleFinal,` to PaymentRow's props, after `onReopen,`.
2. Replace

```js
  const closedBy =
    closure?.kind === 'carry' ? 'carry' : closure?.kind === 'waive' && closure.reason !== 'legacy' ? 'waive' : null;
```

with

```js
  const closedBy = ['carry', 'extend', 'rollover'].includes(closure?.kind)
    ? closure.kind
    : closure?.kind === 'waive' && closure.reason !== 'legacy'
      ? 'waive'
      : null;
```

3. After the `canSettleRest` line add:

```js
  // A pelunasan paid in part: what happens to the rest (spec 7.2).
  const canSettleFinal = canReceive && isFinal && !isPaid && received > 0;
```

4. In the subtitle chain, after the `closedBy === 'waive'` branch and before `} else if (isPaid) {`, add:

```js
  } else if (closedBy === 'extend') {
    subtitle = `Diterima ${recv ? formatDate(recv, { short: true }) : '—'} · sisa ${formatCurrency(closure.amount, false)} diperpanjang`;
  } else if (closedBy === 'rollover') {
    subtitle = `Diterima ${recv ? formatDate(recv, { short: true }) : '—'} · sisa ${formatCurrency(closure.amount, false)} jadi kontrak baru`;
```

5. After `{closedBy === 'waive' && <Pill tone="neutral">Dianggap lunas</Pill>}` add:

```jsx
            {closedBy === 'extend' && <Pill tone="neutral">Diperpanjang</Pill>}
            {closedBy === 'rollover' && <Pill tone="neutral">Kontrak baru</Pill>}
```

6. After the `{canSettleRest && ( ... Atur sisa → ... )}` block add:

```jsx
          {canSettleFinal && (
            <button
              type="button"
              onClick={onSettleFinal}
              className="mt-1 text-[12px] font-semibold text-ink-soft active:opacity-70 block ml-auto"
            >
              Atur sisa pelunasan →
            </button>
          )}
```

- [ ] **Step 3: Two helpers in the owner's words**

Directly above `export default function ProjectDetail() {` add:

```js
// One schedule change, in the owner's words.
function extensionLabel(e) {
  const on = e.at ? ` pada ${formatDate(e.at)}` : '';
  return e.kind === 'mundur'
    ? `Pelunasan dimundurkan ${e.months} bulan${on}`
    : `Sisa pelunasan ${formatCurrency(e.baseAmount)} diperpanjang ${e.months} bulan${on}`;
}

// What undoing the latest schedule change does.
function undoMessage(e) {
  if (!e) return '';
  return e.kind === 'mundur'
    ? 'Bulan-bulan tambahan dihapus dan pelunasan kembali ke jatuh tempo semula.'
    : `Bulan-bulan tambahan dihapus dan sisa pelunasan ${formatCurrency(e.baseAmount)} kembali ditagih di pelunasan lama.`;
}
```

- [ ] **Step 4: State, data and derived values**

1. In the `useData()` destructuring add `extendProject, undoExtension, rolloverProject,` after `reopenRemainder,`.
2. After `const [editing, setEditing] = useState(false);` add:

```js
  const [extending, setExtending] = useState(null); // 'mundur' | 'sisa', or null when closed
  const [restOpen, setRestOpen] = useState(false);
  const [askRestFor, setAskRestFor] = useState(null); // a receipt that left the pelunasan partly paid
  const [rollingOver, setRollingOver] = useState(false);
  const [undoingExtension, setUndoingExtension] = useState(null); // an extension id, or null
```

3. Replace `const profit = totalReturnReceived - (project.disbursedAmount || 0);` with:

```js
  // Received, plus what went into a new contract, minus modal (spec 7.4).
  const profit = summary.netCashChange;
  const extOptions = extensionOptions(project);
  const extensions = project.extensions || [];
  const latestExtension = extensions[extensions.length - 1] || null;
  const canUndoExtension = isActive && !!latestExtension && undoCheck(project).ok;
  const rollover = rolloverSource(project);
  // Asked once the screen shows the payment that left the pelunasan partly
  // paid (spec 7.2).
  const askRest = askRestFor != null && (project.receipts || []).some((r) => r.id === askRestFor);
  const isRolloverProject = project.fundingMode === 'rollover';
  const nextContract = project.rolledOverToProjectId
    ? projects.find((p) => p.id === project.rolledOverToProjectId)
    : null;
  const prevContract = project.rolledFromProjectId
    ? projects.find((p) => p.id === project.rolledFromProjectId)
    : null;
```

4. Replace `handleReceipt` with:

```js
  async function handleReceipt(data) {
    const out = await recordReceipt(project.id, data);
    if (out?.finalShort) setAskRestFor(out.receiptId);
  }
```

- [ ] **Step 5: What the page shows**

1. In the Posisi Kas Bersih card, replace

```jsx
          Sudah terima {formatCurrency(summary.receivedSoFar)} dari modal{' '}
          {formatCurrency(project.disbursedAmount)}
```

with

```jsx
          Sudah terima {formatCurrency(summary.receivedSoFar)} dari modal{' '}
          {formatCurrency(project.disbursedAmount)}
          {summary.rolledOut > 0 && ` · ${formatCurrency(summary.rolledOut)} dialihkan ke kontrak baru`}
```

2. Change the `Modal Keluar` StatRow's label to `label={isRolloverProject ? 'Modal Dialihkan' : 'Modal Keluar'}`, and the `Rekening Sumber` StatRow's value to `value={isRolloverProject ? 'Tidak ada (dialihkan)' : accountName(project.sourceAccountId)}`.

3. Directly after the proof link block (`{project.proofUrl && ( ... )}`), add:

```jsx
      {project.rolledOverToProjectId && (
        <Link
          to={`${base}/project/${project.rolledOverToProjectId}`}
          className="flex items-center gap-2 px-4 py-3 mb-3.5 bg-paper border border-line rounded-2xl text-[13px] text-indigo font-semibold active:bg-cream-deep"
        >
          <IcInfo size={16} sw={1.9} />
          <span className="flex-1 truncate">Dilanjutkan ke kontrak baru: {nextContract?.name || 'project baru'}</span>
          <span>→</span>
        </Link>
      )}
      {project.rolledFromProjectId && (
        <Link
          to={`${base}/project/${project.rolledFromProjectId}`}
          className="flex items-center gap-2 px-4 py-3 mb-3.5 bg-paper border border-line rounded-2xl text-[13px] text-indigo font-semibold active:bg-cream-deep"
        >
          <IcInfo size={16} sw={1.9} />
          <span className="flex-1 truncate">Lanjutan dari: {prevContract?.name || 'project lama'}</span>
          <span>→</span>
        </Link>
      )}
```

4. On the `<PaymentRow` element add `onSettleFinal={() => setRestOpen(true)}` after `onReopen=...`.

5. Directly after the schedule `</Card>` (the one wrapping the PaymentRows), add:

```jsx
      {extensions.length > 0 && (
        <>
          <SectionTitle>Perubahan Jadwal</SectionTitle>
          <Card className="mb-3.5 !px-4 !py-1">
            {extensions.map((e, i) => (
              <div key={e.id} className={`py-2.5 ${i < extensions.length - 1 ? 'border-b border-line-soft' : ''}`}>
                <div className="text-[13px] text-ink">{extensionLabel(e)}</div>
                {e.note && <div className="text-[12px] text-ink-mute mt-0.5">{e.note}</div>}
                {e === latestExtension && canUndoExtension && (
                  <button
                    type="button"
                    onClick={() => setUndoingExtension(e.id)}
                    className="mt-1 text-[12px] font-semibold text-terra active:opacity-70"
                  >
                    Batalkan perpanjangan
                  </button>
                )}
              </div>
            ))}
          </Card>
        </>
      )}
```

6. In the active-project actions, after the `<div className="flex gap-2">` holding `Tutup: Pelunasan` / `Tutup: Macet` closes, add:

```jsx
          {extOptions.mundur.ok && (
            <button
              type="button"
              onClick={() => setExtending('mundur')}
              className="w-full py-3 rounded-xl bg-emas-soft text-ink font-semibold text-[14px] active:opacity-80"
            >
              Mundurkan pelunasan
            </button>
          )}
```

7. Replace the `Batalkan Project?` ConfirmDialog's `message={ ... }` with:

```jsx
        message={
          isRolloverProject
            ? `Kontrak lanjutan ini dihapus dan sisa pelunasan ${formatCurrency(project.disbursedAmount)} kembali ditagih di ${
                prevContract?.name || 'project lama'
              }.${
                totalReturnReceived > 0
                  ? ` Pembayaran ${formatCurrency(totalReturnReceived)} yang sudah masuk ditarik kembali dari rekening.`
                  : ''
              } Transaksi terkait dihapus permanen.`
            : totalReturnReceived > 0
              ? `Modal ${formatCurrency(project.disbursedAmount)} dikembalikan ke ${accountName(
                  project.sourceAccountId
                )}, dan return ${formatCurrency(
                  totalReturnReceived
                )} yang sudah diterima ditarik kembali dari rekening. Project & semua transaksi terkait dihapus permanen.`
              : `Modal ${formatCurrency(project.disbursedAmount)} dikembalikan ke ${accountName(
                  project.sourceAccountId
                )}. Project & semua transaksi terkait dihapus permanen.`
        }
```

- [ ] **Step 6: The sheets**

Directly before the `Batalkan Project?` ConfirmDialog, add:

```jsx
      <PelunasanRestSheet
        open={restOpen || askRest}
        onClose={() => {
          setRestOpen(false);
          setAskRestFor(null);
        }}
        project={project}
        onExtend={() => {
          setRestOpen(false);
          setAskRestFor(null);
          setExtending('sisa');
        }}
        onRollover={() => {
          setRestOpen(false);
          setAskRestFor(null);
          setRollingOver(true);
        }}
      />
      <ExtensionSheet
        open={extending !== null}
        onClose={() => setExtending(null)}
        project={project}
        kind={extending}
        onSubmit={(data) => extendProject(project.id, data)}
      />
      <ConfirmDialog
        open={undoingExtension !== null}
        onClose={() => setUndoingExtension(null)}
        onConfirm={async () => {
          try {
            await undoExtension(project.id, {
              extensionId: undoingExtension,
              seenWriteId: project.lastWriteId ?? null,
            });
          } catch (e) {
            showToast(e.message || 'Gagal membatalkan perpanjangan');
          }
        }}
        title="Batalkan perpanjangan?"
        message={undoMessage(latestExtension)}
        confirmLabel="Ya, batalkan"
      />
      {rollover.ok && (
        <ProjectForm
          key={`rollover-${project.id}`}
          open={rollingOver}
          onClose={() => setRollingOver(false)}
          onSubmit={async (data) => {
            const newId = await rolloverProject(project.id, data, { seenWriteId: project.lastWriteId ?? null });
            setRollingOver(false);
            if (newId) navigate(`${base}/project/${newId}`);
          }}
          accounts={accounts}
          rollover={{ from: project, amount: rollover.amount, startDate: rollover.startDate }}
        />
      )}
```

- [ ] **Step 7: Check**

Run: `npx eslint src/components/Projects/ProjectDetail.jsx && npm run build`
Expected: lint shows only the four errors `main` already has in this file; build exit 0.

- [ ] **Step 8: Commit**

```bash
git add src/components/Projects/ProjectDetail.jsx
git commit -m "feat: project detail offers Mundur, what is left of a pelunasan, undo and contract links"
```

### Task 9: Project form: Kontrak baru mode and locked schedules

**Files:**
- Modify: `src/components/Projects/ProjectForm.jsx`

- [ ] **Step 1: Props and modes**

Change the signature to:

```js
export default function ProjectForm({ open, onClose, onSubmit, accounts, initial, rollover = null }) {
```

After the `capitalLocked` line add:

```js
  // Kontrak baru: a new project prefilled from the old one, whose modal is
  // the remainder carried over (spec 7.3). `rollover` = { from, amount, startDate }.
  const isRollover = !isEdit && !!rollover;
  // A new contract being edited keeps its carried-over modal and no account.
  const rolloverEdit = isEdit && initial.fundingMode === 'rollover';
  const noAccount = isRollover || rolloverEdit;
  // Rebuilding the schedule from the duration would drop an extension's
  // months or a new contract's contract-day bagi hasil (DataContext refuses
  // it too).
  const scheduleLocked =
    isEdit && ((initial.extensions || []).length > 0 || (initial.payments || []).some((r) => r.leadCharge));
  const scheduleLockMessage = (initial?.extensions || []).length
    ? 'Jadwal sudah diubah lewat Mundur/Perpanjang. Durasi, return, dan tanggal tidak bisa diubah di sini.'
    : 'Jadwal kontrak lanjutan ini dimulai dengan bagi hasil di hari kontrak. Durasi, return, dan tanggal tidak bisa diubah di sini.';
```

After the `disbursedTouched` state add:

```js
  // Kontrak baru: charge the first month's bagi hasil on the contract day
  // (default on). Its amount follows nilai project × return bulan 1 until
  // the owner types one.
  const [leadOn, setLeadOn] = useState(true);
  const [leadAmount, setLeadAmount] = useState(0);
  const [leadTouched, setLeadTouched] = useState(false);
```

- [ ] **Step 2: Prefill a Kontrak baru**

In the `useEffect`, change `} else {` (the new-project branch) to:

```js
      } else if (rollover) {
        const src = rollover.from;
        const start = rollover.startDate || new Date();
        const t1 = src.returnPctTier1 != null ? src.returnPctTier1 : src.monthlyReturnPct;
        const t2 = src.returnPctTier2 != null ? src.returnPctTier2 : t1;
        setName(`${src.name} (lanjutan)`);
        setOwnerName(src.ownerName || '');
        setContractNumber('');
        setPhone(src.phone || '');
        setNik(src.nik || '');
        setAddress(src.address || '');
        setCollateral(src.collateral || '');
        setDescription('');
        setPrincipalAmount(rollover.amount);
        setDisbursedAmount(rollover.amount);
        setReturnPctTier1(t1 != null ? String(t1) : '');
        setReturnPctTier2(t2 != null ? String(t2) : '');
        setDurationMonths(src.durationMonths || 6);
        setStartDate(formatDateInput(start));
        setPaymentDayOfMonth(src.paymentDayOfMonth || start.getDate());
        setSourceAccountId('');
        setProofUrl('');
        setDisbursedTouched(true); // the modal is the remainder, never recomputed
        setLeadOn(true);
        setLeadAmount(0);
        setLeadTouched(false);
      } else {
```

- [ ] **Step 3: The first-month amount**

After the line `const upfrontDiscount = ...;` add:

```js
  const leadValue = leadTouched ? leadAmount : calcMonthlyInterest(principalAmount || 0, tier1Pct);
```

- [ ] **Step 4: Submit**

In `handleSubmit`:
1. Replace

```js
    if (!sourceAccountId) {
      setError('Pilih rekening sumber');
      return;
    }
```

with

```js
    if (!noAccount && !sourceAccountId) {
      setError('Pilih rekening sumber');
      return;
    }
    if (isRollover && leadOn && !(Number(leadValue) > 0)) {
      setError('Bagi hasil hari kontrak harus lebih dari 0');
      return;
    }
```

2. In the object passed to `onSubmit`, replace `disbursedAmount,` with `disbursedAmount: rolloverEdit ? undefined : disbursedAmount,`, replace `sourceAccountId,` with `sourceAccountId: noAccount ? undefined : sourceAccountId,`, and after `proofFileName: null,` add:

```js
        ...(isRollover ? { firstMonthCharge: leadOn ? Number(leadValue) : 0 } : {}),
```

- [ ] **Step 5: What the form shows**

1. Title, subtitle and button:

```jsx
      title={isRollover ? 'Kontrak baru' : isEdit ? 'Edit Project' : 'Tambah Project'}
      subtitle={
        isRollover
          ? `Lanjutan dari ${rollover.from.name}. Tidak ada uang keluar.`
          : isEdit
            ? 'Update detail project (jadwal pembayaran disesuaikan otomatis)'
            : 'Catat investasi project bisnis dengan jadwal pembayaran terstruktur'
      }
```

and the submit label `{submitting ? 'Menyimpan…' : isRollover ? 'Buat kontrak baru' : isEdit ? 'Simpan Perubahan' : 'Simpan Project'}`.

2. Show the capital banner only when the schedule is not locked (`{capitalLocked && !scheduleLocked && (`), and right after it add:

```jsx
        {scheduleLocked && (
          <div className="bg-emas-soft border border-emas/30 rounded-xl p-3 text-[12px] text-ink-soft leading-snug">
            {scheduleLockMessage}
          </div>
        )}
```

3. Nilai Project: `disabled={capitalLocked || scheduleLocked}`.
4. Modal field: label `{noAccount ? 'Modal dialihkan (tidak ada uang keluar)' : 'Modal Keluar dari Rekening'}`, `disabled={capitalLocked || noAccount}`, and the "Terisi otomatis" hint only when `!capitalLocked && !noAccount`.
5. Return bln 1-3, Durasi, Return bln 4+, Tanggal Pembayaran: add `disabled={scheduleLocked}`. Tanggal Mulai: `disabled={capitalLocked || scheduleLocked}`.
6. After the indigo return summary box add:

```jsx
        {isRollover && (
          <div className="rounded-xl border border-line bg-paper p-3 space-y-2">
            <label className="flex items-center gap-2 text-[14px] text-ink">
              <input type="checkbox" checked={leadOn} onChange={(e) => setLeadOn(e.target.checked)} />
              Tagih bagi hasil bulan pertama di hari kontrak
            </label>
            {leadOn && (
              <div>
                <CurrencyInput
                  value={leadValue}
                  onChange={(v) => {
                    setLeadAmount(v);
                    setLeadTouched(true);
                  }}
                />
                <p className="text-[11px] text-ink-mute mt-1">
                  Jatuh tempo di tanggal mulai. Bawaannya {tier1Pct}% dari nilai project; bulan berikutnya tetap seperti biasa.
                </p>
              </div>
            )}
          </div>
        )}
```

7. Wrap the "Rekening Sumber Pendanaan" block in `{!noAccount && ( ... )}`, and show the "Belum ada rekening" warning only when `accounts?.length === 0 && !noAccount`.

- [ ] **Step 6: Check**

Run: `npx eslint src/components/Projects/ProjectForm.jsx && npm run build`
Expected: lint shows only the one error `main` already has in this file (setState inside the effect); build exit 0.

- [ ] **Step 7: Commit**

```bash
git add src/components/Projects/ProjectForm.jsx
git commit -m "feat: project form makes a Kontrak baru and locks rebuilt-proof schedules"
```

### Task 10: A demo refill lands only while its claim holds

The B4 review found one path left to a double seed: a refill still alive but slower than `RESET_WAIT_MS` is taken over, and then both finish. The fix: a refill empties collections only while its claim is current. It writes the seed and the "done" flag in one transaction that checks the claim first. So a refill that was taken over stops, and a slow commit loses to the newer claim.

**Files:**
- Modify: `src/utils/demoReset.js`

- [ ] **Step 1: Implement**

1. Add `getDoc` to the `firebase/firestore` import and remove `updateDoc` (no longer used).
2. Rename the existing `async function seed() {` to `function writeSeed(writer) {`. Inside it, delete `const batch = writeBatch(db);` and the final `await batch.commit();`, and replace every `batch.set(` with `writer.set(`. It now only writes, through whatever `writer` it is given.
3. After `writeSeed`, add:

```js
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
```

4. In `claimReset`, keep the new claim's id and return it. Replace `resetId: doc(collection(db, 'demo_config')).id,` with `resetId: claimedId,`. Declare `const claimedId = doc(collection(db, 'demo_config')).id;` as the first line of the transaction function. Replace `return { decision, runningId: data?.resetId ?? '' };` with `return { decision, runningId: data?.resetId ?? '', claimedId: decision === 'reset' ? claimedId : null };`.
5. In `ensureDemoFresh`, capture the claim everywhere it decides. Replace `let { decision, runningId } = await claimReset(settingsRef, todayStr);` with `let { decision, runningId, claimedId } = await claimReset(settingsRef, todayStr);`. Replace both `({ decision } = await claimReset(` with `({ decision, claimedId } = await claimReset(`. Then replace everything from `try {` to the end of the function with:

```js
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
```

- [ ] **Step 2: Check**

Run: `npx vitest run && npx eslint src/utils/demoReset.js && npm run build`
Expected: suite PASS (the decision tests are unchanged), no lint errors, build exit 0. `grep -n "writeBatch\|batch\." src/utils/demoReset.js` shows only `clearCollection`'s own batch.

- [ ] **Step 3: Commit**

```bash
git add src/utils/demoReset.js
git commit -m "fix: a demo refill lands only while its claim holds"
```

### Task 11: Verify in the demo

Dev server (`preview_start` name from `.claude/launch.json`), demo mode, fresh demo data (mark `demo_config/settings.lastResetDate` stale with the scratchpad helper, then reload once). The browser pane is usually hidden: read the DOM, finish animations with `document.getAnimations().forEach(a => a.finish())` before clicking inside a modal, and count errors with a `window` error listener installed after load. Pak Budi's project: 6 months, pelunasan Rp 10.000.000 in bulan 6, 4,5% flat.

- [ ] **Mundur:** "Mundurkan pelunasan" is offered. The sheet prefills 4,5% and 1 bulan. The preview reads bulan 6 bagi hasil 450.000 and bulan 7 pelunasan 10.000.000 with the right dates. Switching to 2 bulan and "Mulai bulan depan" moves every date one month later. Save. The schedule shows bulan 6 to 8 and "Perubahan Jadwal: Pelunasan dimundurkan 2 bulan pada …". Edit Project shows the lock message with the schedule fields disabled; changing only the name saves. Undo it with "Batalkan perpanjangan": the schedule is back to 6 rows exactly.
- [ ] **Partial pelunasan:** pay bulan 2 to 5 in full, then 3.000.000 on bulan 6. "Sisa pelunasan Rp 7.000.000" opens by itself once the payment shows. "Ditagih menyusul" closes it, and bulan 6 shows "Atur sisa pelunasan →".
- [ ] **Diperpanjang:** from that button, extend 2 bulan at the default rate. Bulan 6 shows "Diperpanjang" with "Diterima … · sisa 7.000.000 diperpanjang". Bulan 7 and 8 are bagi hasil of 315.000 and bulan 9 a pelunasan of 7.000.000. Opening bulan 6's payment explains "Batalkan dulu perpanjangannya" and offers no edit. Undo the extension: bulan 6 is Kurang 7.000.000 again.
- [ ] **Kontrak baru:** from "Atur sisa pelunasan →", pick Kontrak baru. The form is prefilled: name "(lanjutan)", owner details copied, modal 7.000.000 locked as "Modal dialihkan", no account field, the first-month toggle on with 315.000. Save. The app opens the new project with "Lanjutan dari", Modal Dialihkan and "Tidak ada (dialihkan)". Its schedule starts with a bagi hasil due on the contract day. The old project is Selesai, bulan 6 reads "Kontrak baru", and it links to the new one. TOTAL SALDO on Beranda is unchanged and no transaction was added.
- [ ] **Exports** (call the modules from the page as in B4): the Daftar Tagihan leaves out the old bulan 6. Total Modal Keluar leaves out the new contract's 7.000.000. The old project's Net includes the 7.000.000.
- [ ] **Batalkan the new contract:** the confirm text names the old project. After it the old project is Aktif again with bulan 6 Kurang 7.000.000, and the new project is gone.
- [ ] **Demo stays private:** no request goes to `api.telegram.org` or to the DanaTrack Firestore (`read_network_requests`) while creating the contract.
- [ ] **Demo reset:** mark the demo stale, then open it in two tabs at once. It seeds once: TOTAL SALDO Rp 27.100.000 and 1 Project Aktif in both tabs, and no record appears twice.
- [ ] Error counter 0; `npx vitest run`, `npm run build` green.

---

## Deliberately out of scope

- Moving `updateProject` into a transaction: it still writes from React state (pre-existing pattern). Since B4 it stores a new `lastWriteId`, so sheets on other devices see its edits.
- Changing the duration of an extended project or of a new contract that starts with a contract-day row: refused with a clear message. Undo the extension (or delete and recreate the new contract) instead.
- A Mundur for a pelunasan that already received money, or a Kontrak baru while earlier months are open: refused with the reason; the owner settles those first.
