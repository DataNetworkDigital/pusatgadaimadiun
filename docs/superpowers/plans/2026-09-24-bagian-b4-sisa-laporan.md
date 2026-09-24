# Bagian B4 — Sisa Tagihan & Laporan Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let the owner close what is left on a bagi hasil without money (move it onto next month, or forgive it), undo that again, and reopen an old shortfall; add the Kurang Bayar column; ship the one-time receipts migration as a dry-run-first script; and give the demo real transactions so every feature can be tried there.

**Architecture:** A closure on a schedule row (`{ kind: 'carry' | 'waive', amount, … }`) takes that amount off the row; a carry adds it to the target row's due. `paymentStatus.js` learns both, so every screen, export and allocation follows without further changes. Closing and reopening are decided as data in `src/utils/remainderOps.js` and written by `DataContext` through the same `inProjectTransaction` (fresh read, `lastWriteId`, `alreadyDone`, `seenWriteId`) every money writer uses since B3. The migration is a standalone Node script that reads, backs up and reports by default.

**Tech Stack:** React 19, Vite 8, Firebase Firestore (12.x), Vitest (194 tests currently green), Node for the script.

**Spec:** `docs/superpowers/specs/2026-09-22-pembayaran-jadwal-download-design.md`, sections 6.2, 6.4 (`closeRemainder`, `reopenRemainder`), 6.6 (row actions, display, Daftar Tagihan, exports) and 6.9 (migration).

**Branch:** `feat/b4-sisa-laporan`, cut from `main` at `4c95ed7` (B3, live since 24 Sep 13.18 WIB).

---

## Context

**Rules that already hold and must keep holding.**
- A project document that stores `receipts` is trusted completely; every write keeps the whole array. Closing or reopening a remainder does not change receipts (except reopening an old shortfall, below), so those writes store `payments` and the status only, which is safe on documents with or without stored receipts.
- Every write of project money runs in `inProjectTransaction` and stores `lastWriteId`; forms send `seenWriteId` (the version they showed) so a save from an outdated screen is refused.
- Corrections of a receipt on a row that carries a closure other than its own (`receiptBlock`) are refused until the closure is reopened. Carry and manual waivers are exactly such closures: B3 already blocks them, B4 provides the way to reopen.

**The closure model (spec 6.2).**
- `rowRemaining(row) = rowDue(row) + carried into this row − received − closed on this row`, never below 0.
- *Closed on this row* is the closure amount for kinds `waive`, `carry`, `extend`, `rollover` (the last two arrive in Part C). `rowWaived` keeps meaning forgiveness only.
- *Carried into this row* sums the `carry` closures elsewhere whose `toNo` is this row.
- A closed row counts as settled (its remainder was dealt with); the screen says how: "Digabung ke bulan j" or "Dianggap lunas". An old shortfall (`reason: 'legacy'`) still reads as plain Lunas.

**Decisions made here (not new business rules, just how the spec's rules land).**
- Carry is for bagi hasil rows only; the target is the next open row after it, which may be the pelunasan (the tunggakan is then collected with it). A pelunasan's own remainder gets "Atur sisa pelunasan" in Part C.
- "Atur sisa" is offered on a bagi hasil that is already due or already partly paid; a future, untouched month offers nothing yet.
- Reopening is refused where it would make stored amounts wrong: a carry whose target month has already been paid for the carried part, or whose target has its own closure; closures made by pelunasan dipercepat, extensions or rollovers.
- Reopening an old shortfall (the owner's list: "reopen any that were truly short") marks the payment that confirmed it `reopened: true`, so a later Edit follows the new rules instead of forgiving the gap again (same treatment as `moved`).

**Production facts (read-only audit, 24 Sep 2026, Gde's permission).** 51 projects, 237 rows, 123 paid, none storing receipts yet, no `lastWriteId`, no cash account, no orphan or mismatched transaction. Old shortfalls: DANU ATK-NZ bulan 3 (kurang Rp 2.500.000), INDRA HP SECOND PO bulan 2 (kurang Rp 950.000). Old overpayments: NOVI KAMBING IEDUL ADHA bulan 4 (+Rp 300.000), ALFRIDO RIAS MANTEN bulan 3 (Rp 11.650.000 on a Rp 2.200.000 tagihan; the pelunasan of Rp 40.000.000 is still open).

**The migration is optional hygiene, not a dependency.** The app derives receipts on read and persists them on the first write, so every feature works without it. `--apply` on production runs only after Gde has read the dry-run report and said yes.

---

## File Structure

| File | Responsibility |
|---|---|
| `src/utils/paymentStatus.js` (modify) | `rowCarriedIn`, `rowClosed`; `rowRemaining` and activity use them. |
| `src/utils/projectStatus.js` (create) | `statusChange`: the status a schedule write causes. Shared by receipts and remainders. |
| `src/utils/receiptOps.js` (modify) | Uses `statusChange`; a `reopened` old payment follows the new rules. |
| `src/utils/remainderOps.js` (create) | `carryTarget`, `remainderOptions`, `applyCloseRemainder`, `applyReopenRemainder`. |
| `src/contexts/DataContext.jsx` (modify) | `closeRemainder`, `reopenRemainder`. |
| `src/components/Projects/RemainderSheet.jsx` (create) | Gabung ke bulan depan / Anggap lunas, with what each does. |
| `src/components/Projects/ProjectDetail.jsx` (modify) | Closure pills, "+ tunggakan bulan k", "Atur sisa →", "Buka lagi →". |
| `src/components/Projects/ReceiptManageSheet.jsx` (modify) | "Tagih lagi kekurangan lama" on an old shortfall. |
| `src/components/Calendar/DayDetail.jsx` (modify) | Says when a day's amount includes a tunggakan. |
| `src/utils/exportColumns.js`, `src/utils/projectExport.js` (modify) | Kurang Bayar column; status labels for closed rows; carried rows left out of Daftar Tagihan. |
| `src/utils/projectSchedule.js` (modify) | A duration change may not drop a month that holds a tunggakan. |
| `scripts/migrate-receipts.mjs` (create), `.gitignore` (modify) | The migration: dry run by default, backup, report; `--apply`. |
| `src/utils/demoLedger.js` (create), `src/utils/demoReset.js`, `src/utils/demoSeedData.js` (modify) | Demo projects get their funding and payment transactions, and one old shortfall. |

---

### Task 1: The status rule learns carry and the other closures

**Files:** modify `src/utils/paymentStatus.js`, `src/utils/paymentStatus.test.js`.

- [ ] **Step 1: Write the failing test**

In `src/utils/paymentStatus.test.js`, add `rowCarriedIn` to the import from `./paymentStatus`, and append:

```js
describe('carry and the other closures', () => {
  const two = () => [row({ no: 1 }), row({ no: 2, dueDate: new Date(2026, 10, 5) })];

  it('moves a carried remainder off its own row and onto the target', () => {
    const [r1, r2] = two();
    r1.closure = { kind: 'carry', amount: 2_500_000, toNo: 2 };
    const p = withReceipts([r1, r2], [{ id: 'a', amount: 3_000_000, allocations: [{ no: 1, amount: 3_000_000 }] }]);
    expect(rowRemaining(p, r1)).toBe(0);
    expect(isSettled(p, r1)).toBe(true);
    expect(rowCarriedIn(p, r2)).toBe(2_500_000);
    expect(rowRemaining(p, r2)).toBe(8_000_000);
  });

  it('treats a month carried whole as dealt with, and doubles the next one', () => {
    const [r1, r2] = two();
    r1.closure = { kind: 'carry', amount: 5_500_000, toNo: 2 };
    const p = withReceipts([r1, r2], []);
    expect(isSettled(p, r1)).toBe(true);
    expect(rowState(p, r2)).toBe('belum');
    expect(rowRemaining(p, r2)).toBe(11_000_000);
  });

  it('takes an extension or rollover closure off the row too', () => {
    const e = row({ closure: { kind: 'extend', amount: 5_500_000, extensionId: 'x' } });
    expect(rowRemaining(withReceipts([e], []), e)).toBe(0);
    const r = row({ closure: { kind: 'rollover', amount: 5_500_000, projectId: 'p2' } });
    expect(rowRemaining(withReceipts([r], []), r)).toBe(0);
  });

  it('keeps rowWaived meaning forgiveness only', () => {
    expect(rowWaived(row({ closure: { kind: 'carry', amount: 1, toNo: 2 } }))).toBe(0);
    expect(rowWaived(row({ closure: { kind: 'waive', amount: 7, reason: 'manual' } }))).toBe(7);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run src/utils/paymentStatus.test.js`
Expected: FAIL ("rowCarriedIn is not a function", and the extend/rollover case).

- [ ] **Step 3: Write the implementation**

In `src/utils/paymentStatus.js`, replace the comment and body of `rowWaived` and the whole of `rowRemaining` (keep `rowRemaining`'s leading comment) with:

```js
// Forgiveness only: a 'waive' closure. Carry, extend and rollover move the
// remainder somewhere else instead; rowRemaining counts all of them through
// rowClosed, and this one stays for code that must tell forgiveness apart.
export function rowWaived(row) {
  const c = row?.closure;
  return c && c.kind === 'waive' ? Number(c.amount) || 0 : 0;
}

const CLOSING_KINDS = new Set(['waive', 'carry', 'extend', 'rollover']);

// The part of this row's remainder a closure dealt with without money:
// forgiven (waive), moved onto a later tagihan (carry), into an extension
// (extend) or into a new contract (rollover). Whatever the kind, it is no
// longer owed on this row.
export function rowClosed(row) {
  const c = row?.closure;
  if (!c || !CLOSING_KINDS.has(c.kind)) return 0;
  return Number(c.amount) || 0;
}

// What earlier tagihan carried onto this one ("Gabung sisa ke bulan depan"):
// the target of a carry asks for its own tagihan plus these.
export function rowCarriedIn(project, row) {
  let sum = 0;
  for (const other of project?.payments || []) {
    const c = other?.closure;
    if (c?.kind === 'carry' && c.toNo === row?.no) sum += Number(c.amount) || 0;
  }
  return sum;
}
```

and:

```js
export function rowRemaining(project, row) {
  return Math.max(
    0,
    rowDue(row) + rowCarriedIn(project, row) - rowReceived(project, row) - rowClosed(row)
  );
}
```

In `hasActivity`, change `return touched || rowWaived(row) > 0;` to `return touched || rowClosed(row) > 0;`.

- [ ] **Step 4: Run it to verify it passes**

Run: `npx vitest run`
Expected: all green (the new tests plus every existing one).

- [ ] **Step 5: Commit**

```bash
git add src/utils/paymentStatus.js src/utils/paymentStatus.test.js
git commit -m "feat: the status rule follows carried and closed remainders"
```

---

### Task 2: One rule for a project's status after a schedule write

**Files:** create `src/utils/projectStatus.js`, `src/utils/projectStatus.test.js`; modify `src/utils/receiptOps.js`.

- [ ] **Step 1: Write the failing test**

Create `src/utils/projectStatus.test.js`:

```js
import { describe, it, expect } from 'vitest';
import { statusChange } from './projectStatus';

const at = new Date(2026, 8, 20);
const rows = () => [
  { no: 1, type: 'interest', expectedAmount: 100, dueDate: new Date(2026, 7, 5) },
  { no: 2, type: 'final', expectedAmount: 1000, dueDate: new Date(2026, 8, 5) },
];
const receipts = (pairs) => pairs.map(([no, amount], i) => ({ id: `r${i}`, amount, allocations: [{ no, amount }] }));

describe('statusChange', () => {
  it('completes an active project whose last tagihan closes', () => {
    expect(statusChange({ status: 'active' }, rows(), receipts([[1, 100], [2, 1000]]), at)).toEqual({
      status: 'completed',
      closedAt: at,
    });
  });

  it('reopens a project completed by its payments when a tagihan opens again', () => {
    expect(statusChange({ status: 'completed' }, rows(), receipts([[1, 100]]), at)).toEqual({
      status: 'active',
      closedAt: null,
    });
  });

  it('leaves projects closed by pelunasan dipercepat or as macet alone', () => {
    expect(statusChange({ status: 'completed', settledEarly: true }, rows(), [], at)).toEqual({});
    expect(statusChange({ status: 'default' }, rows(), [], at)).toEqual({});
  });

  it('changes nothing when the status already fits', () => {
    expect(statusChange({ status: 'active' }, rows(), receipts([[1, 100]]), at)).toEqual({});
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run src/utils/projectStatus.test.js`
Expected: FAIL, "Failed to resolve import ./projectStatus".

- [ ] **Step 3: Write the module and use it**

Create `src/utils/projectStatus.js`:

```js
import { isSettled } from './paymentStatus';

/**
 * The status change a write to a project's schedule causes, if any. A project
 * completed by its payments goes back to active when a tagihan opens again,
 * and an active one whose last tagihan closes is completed. Projects closed
 * by pelunasan dipercepat or as macet never change here.
 * @returns {} or { status, closedAt }
 */
export function statusChange(project, payments, receipts, at) {
  if (project.settledEarly || project.status === 'default') return {};
  const after = { ...project, payments, receipts };
  const allSettled = payments.length > 0 && payments.every((row) => isSettled(after, row));
  if (project.status === 'completed' && !allSettled) return { status: 'active', closedAt: null };
  if (project.status === 'active' && allSettled) return { status: 'completed', closedAt: at ?? null };
  return {};
}
```

In `src/utils/receiptOps.js`: delete the whole local `function statusChange(…) { … }`; change `import { isSettled, rowRemaining } from './paymentStatus';` to `import { rowRemaining } from './paymentStatus';`; and add `import { statusChange } from './projectStatus';` below it.

- [ ] **Step 4: Run all tests**

Run: `npx vitest run` and `npx eslint src/utils/receiptOps.js src/utils/projectStatus.js src/utils/projectStatus.test.js`
Expected: all green, no lint problems.

- [ ] **Step 5: Commit**

```bash
git add src/utils/projectStatus.js src/utils/projectStatus.test.js src/utils/receiptOps.js
git commit -m "refactor: one rule for a project's status after a schedule write"
```

---

### Task 3: Closing and reopening a remainder, decided as data

**Files:** create `src/utils/remainderOps.js`, `src/utils/remainderOps.test.js`; modify `src/utils/receiptOps.js`, `src/utils/receiptOps.test.js`.

- [ ] **Step 1: Write the failing tests**

Create `src/utils/remainderOps.test.js`:

```js
import { describe, it, expect } from 'vitest';
import { carryTarget, remainderOptions, applyCloseRemainder, applyReopenRemainder } from './remainderOps';
import { isSettled, rowRemaining, rowState } from './paymentStatus';
import { allocateReceipt } from './allocation';
import { normalizeProject } from './normalizeProject';

const due = (month) => new Date(2026, month, 5);
const at = new Date(2026, 8, 20);

// Three monthly bagi hasil of 5,5jt and the pelunasan (100jt) in month four.
const schedule = () => [
  { no: 1, type: 'interest', expectedAmount: 5_500_000, dueDate: due(6), receivedAmount: null },
  { no: 2, type: 'interest', expectedAmount: 5_500_000, dueDate: due(7), receivedAmount: null },
  { no: 3, type: 'interest', expectedAmount: 5_500_000, dueDate: due(8), receivedAmount: null },
  { no: 4, type: 'final', expectedAmount: 100_000_000, dueDate: due(9), receivedAmount: null },
];
const arrival = (id, pays) => {
  const allocations = Object.entries(pays).map(([no, amount]) => ({ no: Number(no), amount }));
  return { id, amount: allocations.reduce((s, a) => s + a.amount, 0), date: due(8), accountId: 'bca', transactionId: `tx-${id}`, allocations };
};
const stored = (receipts, over = {}) => ({ status: 'active', payments: schedule(), receipts, ...over });
const legacy = (paid, over = {}) =>
  normalizeProject({
    status: 'active',
    payments: schedule().map((r) =>
      paid[r.no] != null ? { ...r, receivedAmount: paid[r.no], receivedDate: due(r.no + 5), accountId: 'bca', transactionId: `tx-${r.no}` } : r
    ),
    ...over,
  });
const row = (out, no) => out.update.payments.find((r) => r.no === no);
const after = (p, out) => ({ ...p, ...out.update });

describe('carryTarget and remainderOptions', () => {
  it('points at the next open tagihan, skipping paid ones', () => {
    const p = stored([arrival('a', { 2: 3_000_000 }), arrival('b', { 3: 5_500_000 })]);
    expect(carryTarget(p, 2).no).toBe(4);
    expect(carryTarget(p, 4)).toBeNull();
  });

  it('offers both closings on a partly paid bagi hasil, only forgiveness on the pelunasan', () => {
    const p = stored([arrival('a', { 2: 3_000_000 })]);
    expect(remainderOptions(p, 2)).toMatchObject({ amount: 2_500_000, carry: true, waive: true });
    expect(remainderOptions(p, 2).target.no).toBe(3);
    expect(remainderOptions(p, 4)).toMatchObject({ amount: 100_000_000, carry: false, waive: true });
  });

  it('offers nothing on a closed row or a project that is not active', () => {
    const p = stored([arrival('a', { 2: 3_000_000 })]);
    p.payments[1] = { ...p.payments[1], closure: { kind: 'waive', amount: 2_500_000, reason: 'manual' } };
    expect(remainderOptions(p, 2)).toMatchObject({ carry: false, waive: false });
    expect(remainderOptions(stored([], { status: 'default' }), 1)).toMatchObject({ carry: false, waive: false });
  });
});

describe('applyCloseRemainder', () => {
  it('moves what is left onto the next tagihan, which then asks for both', () => {
    const p = stored([arrival('a', { 2: 3_000_000 })]);
    const out = applyCloseRemainder(p, 2, { kind: 'carry', at, id: 'c1' });
    expect(row(out, 2).closure).toEqual({ kind: 'carry', toNo: 3, amount: 2_500_000, at, id: 'c1' });
    expect(isSettled(after(p, out), row(out, 2))).toBe(true);
    expect(rowRemaining(after(p, out), row(out, 3))).toBe(8_000_000);
    expect(allocateReceipt(after(p, out), 8_000_000, 3)).toEqual({ allocations: [{ no: 3, amount: 8_000_000 }], leftover: 0 });
    expect(out.update).not.toHaveProperty('receipts');
  });

  it('doubles next month when a month is carried whole', () => {
    const p = stored([]);
    const out = applyCloseRemainder(p, 1, { kind: 'carry', at });
    expect(rowRemaining(after(p, out), row(out, 2))).toBe(11_000_000);
    expect(rowState(after(p, out), row(out, 2))).toBe('belum');
  });

  it('can carry the last bagi hasil onto the pelunasan', () => {
    const p = stored([arrival('a', { 1: 5_500_000, 2: 5_500_000 })]);
    const out = applyCloseRemainder(p, 3, { kind: 'carry', at });
    expect(row(out, 3).closure.toNo).toBe(4);
    expect(rowRemaining(after(p, out), row(out, 4))).toBe(105_500_000);
  });

  it('forgives what is left, with the note, and completes a project with nothing else open', () => {
    const p = stored([arrival('a', { 1: 5_500_000, 2: 5_500_000, 3: 3_000_000 }), arrival('b', { 4: 100_000_000 })]);
    const out = applyCloseRemainder(p, 3, { kind: 'waive', note: 'diskon', at });
    expect(row(out, 3).closure).toEqual({ kind: 'waive', reason: 'manual', amount: 2_500_000, at, note: 'diskon' });
    expect(out.update.status).toBe('completed');
    expect(out.update.closedAt).toBe(at);
  });

  it('refuses a pelunasan carry, a row with nothing after it, a closed or paid row, and a closed project', () => {
    const p = stored([arrival('a', { 2: 3_000_000 })]);
    expect(() => applyCloseRemainder(p, 4, { kind: 'carry', at })).toThrow(/pelunasan/);
    const noNext = stored([arrival('a', { 4: 100_000_000 })]);
    expect(() => applyCloseRemainder(noNext, 3, { kind: 'carry', at })).toThrow(/Tidak ada tagihan berikutnya/);
    const closed = stored([]);
    closed.payments[0] = { ...closed.payments[0], closure: { kind: 'waive', amount: 5_500_000, reason: 'manual' } };
    expect(() => applyCloseRemainder(closed, 1, { kind: 'waive', at })).toThrow(/sudah ditutup/);
    expect(() => applyCloseRemainder(stored([arrival('a', { 1: 5_500_000 })]), 1, { kind: 'waive', at })).toThrow(/sudah lunas/);
    expect(() => applyCloseRemainder(stored([], { status: 'default' }), 1, { kind: 'waive', at })).toThrow(/masih aktif/);
  });
});

describe('applyReopenRemainder', () => {
  const carried = () => {
    const p = stored([arrival('a', { 2: 3_000_000 })]);
    return after(p, applyCloseRemainder(p, 2, { kind: 'carry', at }));
  };

  it('undoes a carry: the month owes its rest again and the next one only its own', () => {
    const p = carried();
    const out = applyReopenRemainder(p, 2);
    expect(row(out, 2)).not.toHaveProperty('closure');
    expect(rowRemaining(after(p, out), row(out, 2))).toBe(2_500_000);
    expect(rowRemaining(after(p, out), row(out, 3))).toBe(5_500_000);
  });

  it('refuses when the next month has already been paid for the carried part', () => {
    const p = carried();
    p.receipts = [...p.receipts, arrival('b', { 3: 6_000_000 })];
    expect(() => applyReopenRemainder(p, 2)).toThrow(/sudah ikut dibayar di bulan 3/);
  });

  it('refuses when the next month has a closure of its own', () => {
    const p = carried();
    p.payments = p.payments.map((r) => (r.no === 3 ? { ...r, closure: { kind: 'waive', amount: 8_000_000, reason: 'manual' } } : r));
    expect(() => applyReopenRemainder(p, 2)).toThrow(/bulan 3 sudah ditutup/);
  });

  it('reopens an old shortfall and marks the payment that confirmed it', () => {
    const p = legacy({ 1: 5_500_000, 2: 5_000_000, 3: 5_500_000, 4: 100_000_000 }, { status: 'completed' });
    const out = applyReopenRemainder(p, 2);
    expect(row(out, 2)).not.toHaveProperty('closure');
    expect(rowRemaining(after(p, out), row(out, 2))).toBe(500_000);
    expect(out.update.receipts.find((r) => r.id === 'legacy-2').reopened).toBe(true);
    expect(out.update.receipts.filter((r) => r.reopened)).toHaveLength(1);
    expect(out.update.status).toBe('active');
  });

  it('refuses closures made by pelunasan dipercepat, extensions and rollovers', () => {
    const settled = stored([], { status: 'completed', settledEarly: true });
    settled.payments[0] = { ...settled.payments[0], closure: { kind: 'waive', amount: 5_500_000, reason: 'settlement' } };
    expect(() => applyReopenRemainder(settled, 1)).toThrow(/sudah ditutup/);
    const extended = stored([]);
    extended.payments[3] = { ...extended.payments[3], closure: { kind: 'extend', amount: 100_000_000, extensionId: 'x' } };
    expect(() => applyReopenRemainder(extended, 4)).toThrow(/perpanjangan atau kontrak baru/);
  });
});
```

In `src/utils/receiptOps.test.js`, add `import { applyReopenRemainder } from './remainderOps';` and append:

```js
describe('applyReceiptEdit: an old shortfall the owner reopened', () => {
  it('follows the new rules, so a correction does not forgive the gap again', () => {
    const p = legacy({ 2: 5_000_000 });
    const p2 = after(p, applyReopenRemainder(p, 2));
    const out = edit(p2, 'legacy-2', 4_500_000);
    expect(row(out, 2)).not.toHaveProperty('closure');
    expect(rowRemaining(after(p2, out), row(out, 2))).toBe(1_000_000);
  });
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `npx vitest run src/utils/remainderOps.test.js src/utils/receiptOps.test.js`
Expected: FAIL, "Failed to resolve import ./remainderOps".

- [ ] **Step 3: Write the implementation**

Create `src/utils/remainderOps.js`:

```js
import { rowDue, rowReceived, rowRemaining } from './paymentStatus';
import { openRows } from './allocation';
import { normalizeProject } from './normalizeProject';
import { statusChange } from './projectStatus';

/**
 * What is left on a tagihan, closed without money (spec 6.4, 6.6), and
 * undone again. Decided as data; DataContext writes it.
 * - Gabung ke bulan depan (carry): the remainder moves onto the next open
 *   tagihan, which then asks for both. Bagi hasil only; a pelunasan's own
 *   remainder is Part C's "Atur sisa pelunasan".
 * - Anggap lunas (waive): the remainder is forgiven.
 * - Buka lagi (reopen): undoes either, and an old shortfall the owner decides
 *   was truly short. Refused where undoing would make stored amounts wrong.
 * No money moves: only the schedule changes (and, when an old shortfall is
 * reopened, the payment that confirmed it).
 */

/** The tagihan a carry from bulan `no` lands on: the next open one after it. */
export function carryTarget(project, no) {
  const rows = openRows(normalizeProject(project));
  const idx = rows.findIndex((r) => r.no === no);
  return idx >= 0 ? rows[idx + 1] || null : null;
}

/** What the "Atur sisa" sheet offers for bulan `no` right now. */
export function remainderOptions(project, no) {
  const p = normalizeProject(project);
  const row = (p.payments || []).find((r) => r.no === no);
  const amount = row ? rowRemaining(p, row) : 0;
  const open = p.status === 'active' && !!row && !row.closure && amount > 0;
  const target = open && row.type === 'interest' ? carryTarget(p, no) : null;
  return { amount, carry: !!target, target, waive: open };
}

/** @returns {{ update, closure }} */
export function applyCloseRemainder(project, no, { kind, note = '', at, id }) {
  const p = normalizeProject(project);
  if (p.status !== 'active') throw new Error('Sisa tagihan hanya bisa diatur di project yang masih aktif.');
  const row = (p.payments || []).find((r) => r.no === no);
  if (!row) throw new Error('Tagihan tidak ditemukan');
  if (row.closure) throw new Error(`Tagihan bulan ${no} sudah ditutup.`);
  const amount = rowRemaining(p, row);
  if (amount <= 0) throw new Error(`Tagihan bulan ${no} sudah lunas.`);
  if (!at) throw new Error('Tanggal wajib diisi');

  const base = { amount, at, ...(id ? { id } : {}), ...(note ? { note } : {}) };
  let closure;
  if (kind === 'carry') {
    if (row.type !== 'interest') throw new Error('Sisa pelunasan tidak bisa digabung ke bulan lain.');
    const target = carryTarget(p, no);
    if (!target) throw new Error('Tidak ada tagihan berikutnya yang masih terbuka untuk menampung sisa ini.');
    closure = { kind: 'carry', toNo: target.no, ...base };
  } else if (kind === 'waive') {
    closure = { kind: 'waive', reason: 'manual', ...base };
  } else {
    throw new Error('Pilihan tidak dikenal');
  }
  const payments = p.payments.map((r) => (r.no === no ? { ...r, closure } : r));
  return { update: { payments, ...statusChange(p, payments, p.receipts, at) }, closure };
}

/** @returns {{ update }} */
export function applyReopenRemainder(project, no) {
  const p = normalizeProject(project);
  if (p.settledEarly || p.status === 'default') {
    throw new Error('Project ini sudah ditutup, jadi sisanya tidak bisa dibuka lagi.');
  }
  const row = (p.payments || []).find((r) => r.no === no);
  if (!row) throw new Error('Tagihan tidak ditemukan');
  const c = row.closure;
  if (!c) throw new Error(`Tagihan bulan ${no} tidak punya sisa yang ditutup.`);
  if (c.kind === 'extend' || c.kind === 'rollover') {
    throw new Error('Sisa ini dipindah ke perpanjangan atau kontrak baru. Batalkan dari sana.');
  }
  if (c.kind === 'waive' && c.reason === 'settlement') {
    throw new Error('Sisa ini ditutup oleh pelunasan dipercepat dan tidak bisa dibuka lagi.');
  }
  if (c.kind === 'carry') {
    const target = p.payments.find((r) => r.no === c.toNo);
    if (target?.closure) {
      throw new Error(`Tagihan bulan ${target.no} sudah ditutup. Buka dulu penutupnya.`);
    }
    if (target && rowReceived(p, target) > rowDue(target)) {
      throw new Error(`Tunggakan ini sudah ikut dibayar di bulan ${target.no}. Batalkan atau edit pembayarannya dulu.`);
    }
  }

  const payments = p.payments.map((r) => {
    if (r.no !== no) return r;
    const next = { ...r };
    delete next.closure;
    return next;
  });
  const update = { payments, ...statusChange(p, payments, p.receipts, null) };
  // An old shortfall the owner now calls truly short: the payment that
  // confirmed it no longer closes its tagihan, so a later correction must not
  // forgive the gap again (receiptOps treats `reopened` like `moved`). The
  // whole receipts array is written, as every receipts write must.
  if (c.kind === 'waive' && c.reason === 'legacy') {
    update.receipts = (p.receipts || []).map((r) =>
      String(r.id).startsWith('legacy-') && (r.allocations || []).some((a) => a.no === no)
        ? { ...r, reopened: true }
        : r
    );
  }
  return { update };
}
```

In `src/utils/receiptOps.js`, change the `isLegacy` line to:

```js
// Confirmed under the old rule and still where, and as, it was confirmed.
const isLegacy = (receipt) =>
  String(receipt?.id ?? '').startsWith('legacy-') && !receipt?.moved && !receipt?.reopened;
```

- [ ] **Step 4: Run all tests and lint**

Run: `npx vitest run` and `npx eslint src/utils/remainderOps.js src/utils/remainderOps.test.js src/utils/receiptOps.js src/utils/receiptOps.test.js`
Expected: all green, no lint problems.

- [ ] **Step 5: Commit**

```bash
git add src/utils/remainderOps.js src/utils/remainderOps.test.js src/utils/receiptOps.js src/utils/receiptOps.test.js
git commit -m "feat: decide carrying, forgiving and reopening a remainder as data"
```

---

### Task 4: Close and reopen in DataContext

**Files:** modify `src/contexts/DataContext.jsx`.

- [ ] **Step 1: Import**

Add below the receiptOps import:

```js
import { applyCloseRemainder, applyReopenRemainder } from '../utils/remainderOps';
```

- [ ] **Step 2: The two writers**

Insert just above `async function closeProjectAsDefault(`:

```js
  // ===== What is left on a tagihan, closed without money =====
  // No money moves, so no balance or transaction changes: only the schedule
  // (and, for an old shortfall, its payment) through the same transaction,
  // write id and screen-version check as every other project write.

  async function closeRemainder(projectId, no, { kind, note = '', seenWriteId } = {}) {
    // Made before the transaction so a rerun can recognise its own closure.
    const closeId = doc(collection(db, C('projects'))).id;
    const outcome = await inProjectTransaction(projectId, (t, project, ref, writeId) => {
      const { update, closure } = applyCloseRemainder(project, no, {
        kind,
        note,
        at: Timestamp.now(),
        id: closeId,
      });
      t.update(ref, { ...update, lastWriteId: writeId });
      return { status: update.status, closure };
    }, {
      alreadyDone: (p) => (p.payments || []).some((r) => r.no === no && r.closure?.id === closeId),
      seenWriteId,
    });
    const done = outcome?.status === 'completed' ? ', project selesai' : '';
    toast(
      kind === 'carry'
        ? `Sisa ${formatCurrency(outcome?.closure?.amount)} digabung ke bulan ${outcome?.closure?.toNo}${done}`
        : `Sisa bulan ${no} dianggap lunas${done}`
    );
  }

  async function reopenRemainder(projectId, no, { seenWriteId } = {}) {
    const status = await inProjectTransaction(projectId, (t, project, ref, writeId) => {
      const { update } = applyReopenRemainder(project, no);
      t.update(ref, { ...update, lastWriteId: writeId });
      return update.status;
    }, {
      // Open already: this call's own earlier attempt, or another device.
      alreadyDone: (p) => !(p.payments || []).find((r) => r.no === no)?.closure,
      seenWriteId,
    });
    toast(status === 'active' ? `Sisa bulan ${no} dibuka lagi, project aktif lagi` : `Sisa bulan ${no} dibuka lagi`);
  }

```

- [ ] **Step 3: Expose them**

In the context `value`, add `closeRemainder, reopenRemainder,` after `cancelReceipt,`.

- [ ] **Step 4: Check and commit**

Run: `npx vitest run`, `npm run build`, `npx eslint src/contexts/DataContext.jsx` (only the 2 problems already on `main`).

```bash
git add src/contexts/DataContext.jsx
git commit -m "feat: carry, forgive or reopen a remainder"
```

---

### Task 5: The sheet for what is left

**Files:** create `src/components/Projects/RemainderSheet.jsx`.

- [ ] **Step 1: Write the component**

```jsx
import { useState } from 'react';
import Modal from '../common/Modal';
import { formatCurrency } from '../../utils/formatCurrency';
import { formatDate } from '../../utils/formatDate';
import { remainderOptions } from '../../utils/remainderOps';

// What is left on a bagi hasil: moved onto the next tagihan, or forgiven. No
// money moves either way, and the owner reads exactly what happens first.
export default function RemainderSheet({ open, onClose, project, no, onCarry, onWaive }) {
  if (!open || !project || no == null) return null;
  return (
    <RemainderForm key={no} onClose={onClose} project={project} no={no} onCarry={onCarry} onWaive={onWaive} />
  );
}

function RemainderForm({ onClose, project, no, onCarry, onWaive }) {
  const options = remainderOptions(project, no);
  const [choice, setChoice] = useState(() => (options.carry ? 'carry' : 'waive'));
  const [note, setNote] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  // The version of the project this sheet showed; the save is refused if the
  // project has been written since.
  const seenWriteId = project.lastWriteId ?? null;
  const canSave = (choice === 'carry' && options.carry) || (choice === 'waive' && options.waive);

  async function submit() {
    setError('');
    setSubmitting(true);
    try {
      if (choice === 'carry') await onCarry({ seenWriteId });
      else await onWaive({ note: note.trim(), seenWriteId });
      onClose();
    } catch (e) {
      setError(e.message || 'Gagal menyimpan');
    } finally {
      setSubmitting(false);
    }
  }

  const card = (active) =>
    `w-full text-left rounded-xl border p-3 ${active ? 'border-indigo bg-indigo-soft' : 'border-line bg-paper'}`;

  return (
    <Modal
      open
      onClose={onClose}
      title={`Sisa tagihan bulan ${no}`}
      subtitle={project.name}
      footer={
        <button type="button" className="btn-primary w-full" disabled={submitting || !canSave} onClick={submit}>
          {submitting
            ? 'Menyimpan…'
            : choice === 'carry'
              ? `Gabung ke bulan ${options.target?.no}`
              : `Anggap lunas ${formatCurrency(options.amount)}`}
        </button>
      }
    >
      <div className="space-y-3">
        <div className="bg-cream-deep rounded-xl p-3 text-[13px] text-ink-soft flex justify-between">
          <span>Belum dibayar</span>
          <span className="font-num font-semibold text-ink">{formatCurrency(options.amount)}</span>
        </div>
        {options.carry && (
          <button type="button" className={card(choice === 'carry')} onClick={() => setChoice('carry')}>
            <div className="text-[14px] font-semibold text-ink">Gabung ke bulan {options.target.no}</div>
            <div className="text-[12px] text-ink-soft mt-0.5 leading-snug">
              {formatCurrency(options.amount)} ditambahkan ke tagihan bulan {options.target.no} (jatuh tempo{' '}
              {formatDate(options.target.dueDate, { short: true })}). Bulan {no} dianggap selesai.
            </div>
          </button>
        )}
        {options.waive && (
          <button type="button" className={card(choice === 'waive')} onClick={() => setChoice('waive')}>
            <div className="text-[14px] font-semibold text-ink">Anggap lunas</div>
            <div className="text-[12px] text-ink-soft mt-0.5 leading-snug">
              {formatCurrency(options.amount)} tidak ditagih lagi.
            </div>
          </button>
        )}
        {choice === 'waive' && options.waive && (
          <div>
            <label className="label-text">Catatan (boleh kosong)</label>
            <input
              className="input-field"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Misalnya: diskon karena selalu tepat waktu"
            />
          </div>
        )}
        {!options.carry && !options.waive && (
          <p className="text-[13px] text-ink-mute">Tagihan ini sudah tidak punya sisa yang bisa diatur.</p>
        )}
        {error && <p className="text-[13px] text-terra">{error}</p>}
      </div>
    </Modal>
  );
}
```

- [ ] **Step 2: Lint and commit**

Run: `npx eslint src/components/Projects/RemainderSheet.jsx` (no problems).

```bash
git add src/components/Projects/RemainderSheet.jsx
git commit -m "feat: sheet to carry or forgive what is left on a bagi hasil"
```

---

### Task 6: The schedule shows and offers it

**Files:** modify `src/components/Projects/ProjectDetail.jsx`, `src/components/Projects/ReceiptManageSheet.jsx`, `src/components/Calendar/DayDetail.jsx`.

- [ ] **Step 1: `PaymentRow`**

In `ProjectDetail.jsx`, change the paymentStatus import to:

```js
import { isSettled, isShort, rowCarriedIn, rowDue, rowReceived, rowRemaining, rowState } from '../../utils/paymentStatus';
```

and replace the whole `PaymentRow` function with:

```jsx
function PaymentRow({
  project,
  payment,
  onReceive,
  onManage,
  onRemainder,
  onReopen,
  canReceive,
  editable,
  accountName,
  isLast,
}) {
  const due = toDate(payment.dueDate);
  const recv = toDate(payment.receivedDate);
  const isPaid = isSettled(project, payment);
  const isFinal = payment.type === 'final';
  const days = due ? daysBetween(new Date(), due) : 0;
  const overdue = !isPaid && days < 0;
  const dueSoon = !isPaid && days >= 0 && days <= 7;
  const state = rowState(project, payment);
  const short = rowRemaining(project, payment);
  const received = rowReceived(project, payment);
  // A remainder closed without money, as the owner reads it. An old
  // shortfall (reason 'legacy') still reads as plain Lunas and is reopened
  // from its payment instead.
  const closure = payment.closure;
  const closedBy =
    closure?.kind === 'carry' ? 'carry' : closure?.kind === 'waive' && closure.reason !== 'legacy' ? 'waive' : null;
  const reopenable =
    editable && (closure?.kind === 'carry' || (closure?.kind === 'waive' && closure.reason === 'manual'));
  // Earlier months carried onto this one ("+ tunggakan bulan k").
  const carriedIn = (project.payments || [])
    .filter((r) => r.closure?.kind === 'carry' && r.closure.toNo === payment.no)
    .map((r) => ({ no: r.no, amount: Number(r.closure.amount) || 0 }));
  const totalDue = rowDue(payment) + rowCarriedIn(project, payment);
  const arrivals = (project.receipts || [])
    .map((r) => ({ r, part: (r.allocations || []).find((a) => a.no === payment.no) }))
    .filter((x) => x.part);
  // What is left on a bagi hasil that is due or already partly paid can be
  // carried or forgiven. The pelunasan gets its own options in Part C.
  const canSettleRest = canReceive && !isPaid && !isFinal && (received > 0 || days <= 0);
  // A settled tagihan paid in one arrival shows it on its own line and opens
  // it from Edit. Otherwise, and on a closed row, every arrival is listed.
  const showArrivals = arrivals.length > 1 || (arrivals.length === 1 && (!isPaid || !!closedBy));

  let subtitle;
  if (closedBy === 'carry') {
    subtitle = `Sisa ${formatCurrency(closure.amount, false)} dipindah ke bulan ${closure.toNo}`;
  } else if (closedBy === 'waive') {
    subtitle =
      received > 0
        ? `Diterima ${recv ? formatDate(recv, { short: true }) : '—'} · sisa ${formatCurrency(closure.amount, false)} tidak ditagih`
        : `${formatCurrency(closure.amount, false)} tidak ditagih lagi`;
  } else if (isPaid) {
    subtitle = `Diterima ${recv ? formatDate(recv, { short: true }) : '—'}`;
  } else {
    subtitle = `Jatuh tempo ${due ? formatDate(due, { short: true }) : '—'}`;
  }

  // The row's own border-b lives on this outer wrapper, not on the flex row
  // below, so it falls after the arrivals list instead of cutting between a
  // row and its own arrivals.
  return (
    <div className={isLast ? '' : 'border-b border-line-soft'}>
      <div className="flex items-center gap-3 py-3">
        <div
          className={`w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 ${
            isPaid && !closedBy
              ? 'bg-daun text-cream'
              : isFinal
                ? 'bg-indigo text-cream'
                : 'bg-cream-deep text-ink-soft'
          }`}
        >
          {isPaid && !closedBy ? (
            <IcCheck size={18} sw={2.4} />
          ) : (
            <span className="text-[13px] font-display font-semibold">{payment.no}</span>
          )}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-[14px] font-semibold text-ink">
              Pembayaran {payment.no}
            </span>
            {isFinal && <Pill tone="indigo">Pelunasan</Pill>}
            {overdue && <Pill tone="terra">Telat</Pill>}
            {dueSoon && !overdue && <Pill tone="emas">Segera</Pill>}
            {state === 'kurang' &&
              (isShort(project, payment) ? (
                <Pill tone="emas">Kurang {formatCurrency(short, false)}</Pill>
              ) : (
                <Pill tone="neutral">Sisa {formatCurrency(short, false)}</Pill>
              ))}
            {closedBy === 'carry' && <Pill tone="neutral">Digabung ke bulan {closure.toNo}</Pill>}
            {closedBy === 'waive' && <Pill tone="neutral">Dianggap lunas</Pill>}
          </div>
          <div className="text-[12px] text-ink-mute mt-0.5">{subtitle}</div>
          {carriedIn.map((c) => (
            <div key={c.no} className="text-[12px] text-emas mt-0.5">
              + tunggakan bulan {c.no} {formatCurrency(c.amount, false)}
            </div>
          ))}
        </div>
        <div className="text-right">
          <div
            className={`font-num text-[15px] font-semibold ${
              isPaid && !closedBy ? 'text-daun' : 'text-ink'
            }`}
            style={{ fontVariantNumeric: 'tabular-nums' }}
          >
            {formatCurrency(isPaid ? received : totalDue, false)}
          </div>
          {!isPaid && canReceive && (
            <button
              type="button"
              onClick={() => onReceive(payment)}
              className="mt-1 text-[12px] font-semibold text-indigo active:opacity-70 block ml-auto"
            >
              Konfirmasi →
            </button>
          )}
          {canSettleRest && (
            <button
              type="button"
              onClick={() => onRemainder(payment.no)}
              className="mt-1 text-[12px] font-semibold text-ink-soft active:opacity-70 block ml-auto"
            >
              Atur sisa →
            </button>
          )}
          {isPaid && reopenable && (
            <button
              type="button"
              onClick={() => onReopen(payment.no)}
              className="mt-1 text-[12px] font-semibold text-indigo active:opacity-70 block ml-auto"
            >
              Buka lagi →
            </button>
          )}
          {isPaid && editable && !closedBy && arrivals.length === 1 && (
            <button
              type="button"
              onClick={() => onManage(arrivals[0].r.id)}
              className="mt-1 text-[12px] font-semibold text-indigo active:opacity-70 block ml-auto"
            >
              Edit →
            </button>
          )}
        </div>
      </div>
      {showArrivals && (
        <div className="pb-2 pl-12 space-y-0.5">
          {arrivals.map(({ r, part }) => {
            const split = (r.allocations || []).length > 1;
            const line = (
              <>
                <span>
                  {formatDate(r.date, { short: true })} · {accountName(r.accountId)}
                </span>
                <span className="font-num">
                  {formatCurrency(part.amount, false)}
                  {split && ` · sebagian dari ${formatCurrency(r.amount, false)}`}
                  {editable && <span className="text-indigo"> ›</span>}
                </span>
              </>
            );
            return editable ? (
              <button
                key={r.id}
                type="button"
                onClick={() => onManage(r.id)}
                className="w-full flex justify-between gap-3 text-left text-[12px] text-ink-mute active:opacity-70"
              >
                {line}
              </button>
            ) : (
              <div key={r.id} className="flex justify-between gap-3 text-[12px] text-ink-mute">
                {line}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Wire the sheets into `ProjectDetail`**

In the same file:
1. Add imports: `import RemainderSheet from './RemainderSheet';` and `import { useToast } from '../../contexts/ToastContext';`.
2. In the `useData()` destructuring, add `closeRemainder, reopenRemainder,` after `cancelReceipt,`.
3. Below `const [managing, setManaging] = useState(null);` add:

```jsx
  const [remainderNo, setRemainderNo] = useState(null); // a tagihan number, or null when closed
  const [reopenNo, setReopenNo] = useState(null); // a tagihan number, or null when closed
  const { showToast } = useToast();
```

4. In the `<PaymentRow … />` element, add after `onManage={…}`:

```jsx
            onRemainder={(no) => setRemainderNo(no)}
            onReopen={(no) => setReopenNo(no)}
```

5. In the `<ReceiptManageSheet … />` element, add after `onCancel={…}`:

```jsx
        onReopenLegacy={(no, opts) => reopenRemainder(project.id, no, opts)}
```

6. After the `<ReceiptManageSheet … />` element, add:

```jsx
      <RemainderSheet
        open={remainderNo !== null}
        onClose={() => setRemainderNo(null)}
        project={project}
        no={remainderNo}
        onCarry={(opts) => closeRemainder(project.id, remainderNo, { kind: 'carry', ...opts })}
        onWaive={(opts) => closeRemainder(project.id, remainderNo, { kind: 'waive', ...opts })}
      />
      <ConfirmDialog
        open={reopenNo !== null}
        onClose={() => setReopenNo(null)}
        onConfirm={async () => {
          try {
            await reopenRemainder(project.id, reopenNo, { seenWriteId: project.lastWriteId ?? null });
          } catch (e) {
            showToast(e.message || 'Gagal membuka lagi');
          }
        }}
        title={`Buka lagi sisa bulan ${reopenNo}?`}
        message={reopenMessage(project, reopenNo)}
        confirmLabel="Buka lagi"
        confirmVariant="primary"
      />
```

7. Above `export default function ProjectDetail()`, add:

```jsx
// What reopening bulan `no` does, in the owner's words.
function reopenMessage(project, no) {
  const c = (project?.payments || []).find((r) => r.no === no)?.closure;
  if (!c) return '';
  if (c.kind === 'carry') {
    return `Sisa ${formatCurrency(c.amount)} kembali ditagih di bulan ${no}, dan tunggakan di bulan ${c.toNo} dihapus.`;
  }
  return `Sisa ${formatCurrency(c.amount)} kembali ditagih di bulan ${no}.`;
}
```

- [ ] **Step 3: An old shortfall reopens from its payment**

In `ReceiptManageSheet.jsx`:
1. Add `onReopenLegacy` to both the exported component's props and `ManageForm`'s props, and pass it through (`onReopenLegacy={onReopenLegacy}` on `<ManageForm … />`).
2. Add `reopen: 'Tagih lagi kekurangan lama?',` to `TITLES`.
3. Below `const seenWriteId = …;` add:

```jsx
  // An old shortfall on the tagihan this payment confirmed: the owner can ask
  // for it again if it was truly short (his list from the migration report).
  const firstNo = receipt.allocations?.[0]?.no;
  const firstRow = (project.payments || []).find((r) => r.no === firstNo);
  const legacyGap =
    String(receipt.id).startsWith('legacy-') &&
    !receipt.moved &&
    !receipt.reopened &&
    firstRow?.closure?.kind === 'waive' &&
    firstRow.closure.reason === 'legacy' &&
    !project.settledEarly &&
    project.status !== 'default'
      ? Number(firstRow.closure.amount) || 0
      : 0;
```

4. In the menu step, after the `Batalkan pembayaran ini` button (still inside the `{!block && ( … )}` block's `div`), add:

```jsx
            {legacyGap > 0 && (
              <button type="button" className="btn-secondary w-full" onClick={() => go('reopen')}>
                Tagih lagi kekurangan lama {formatCurrency(legacyGap)}
              </button>
            )}
```

5. Before the final `} else {` (the cancel step), add a branch:

```jsx
  } else if (step === 'reopen') {
    body = (
      <div className="space-y-3">
        {back}
        <p className="text-ink-soft text-[14px] leading-relaxed">
          Pembayaran bulan {firstNo} dicatat {formatCurrency(receipt.amount)} sebelum ada fitur cicilan, dan
          kekurangan {formatCurrency(legacyGap)} dianggap lunas. Kalau memang masih kurang, kekurangan itu ditagih lagi
          di bulan {firstNo}.
        </p>
        {errorLine}
      </div>
    );
    footer = (
      <button
        type="button"
        className="btn-primary w-full"
        disabled={submitting}
        onClick={() => run(() => onReopenLegacy(firstNo, { seenWriteId }))}
      >
        {submitting ? 'Menyimpan…' : 'Ya, tagih lagi'}
      </button>
    );
```

- [ ] **Step 4: The calendar says when a day includes a tunggakan**

In `DayDetail.jsx`, add `rowCarriedIn` to the paymentStatus import, and after the line `{rowReceived(project, payment) > 0 ? ' · sisa tagihan' : ''}` add:

```jsx
                {rowCarriedIn(project, payment) > 0 ? ' · termasuk tunggakan' : ''}
```

- [ ] **Step 5: Check and commit**

Run: `npx vitest run`, `npm run build`, `npx eslint src/components/Projects/ProjectDetail.jsx src/components/Projects/ReceiptManageSheet.jsx src/components/Calendar/DayDetail.jsx` (ProjectDetail keeps its 4 old problems; nothing new).

```bash
git add src/components/Projects/ProjectDetail.jsx src/components/Projects/ReceiptManageSheet.jsx src/components/Calendar/DayDetail.jsx
git commit -m "feat: the schedule shows carried and forgiven remainders and offers them"
```

---

### Task 7: Exports: Kurang Bayar, and closed rows said plainly

**Files:** modify `src/utils/exportColumns.js`, `src/utils/exportColumns.test.js`, `src/utils/projectExport.js`, `src/utils/projectExport.test.js`.

- [ ] **Step 1: Write the failing tests**

Append to `src/utils/exportColumns.test.js`:

```js
describe('Kurang Bayar column', () => {
  it('exists, is off by default, and sums what due, partly paid tagihan still lack', () => {
    const col = PROJECT_COLUMNS.find((c) => c.key === 'shortfall');
    expect(col.label).toBe('Kurang Bayar');
    expect(col.defaultOn).toBe(false);
    const past = new Date(2020, 0, 5);
    const future = new Date(2099, 0, 5);
    const p = {
      payments: [
        { no: 1, type: 'interest', expectedAmount: 1000, dueDate: past },
        { no: 2, type: 'interest', expectedAmount: 1000, dueDate: future },
        { no: 3, type: 'interest', expectedAmount: 1000, dueDate: past },
      ],
      receipts: [
        { id: 'a', amount: 400, allocations: [{ no: 1, amount: 400 }] },
        { id: 'b', amount: 300, allocations: [{ no: 2, amount: 300 }] },
      ],
    };
    expect(col.value(p, {})).toBe(600);
  });
});
```

In `src/utils/projectExport.test.js`, add `collectionRows` to the import from `./projectExport`, and append:

```js
describe('closed remainders in the exports', () => {
  const past = (m) => new Date(2026, m, 5);
  const project = {
    id: 'p', name: 'Toko', status: 'active',
    payments: [
      { no: 1, type: 'interest', expectedAmount: 5_500_000, dueDate: past(6), closure: { kind: 'carry', amount: 2_500_000, toNo: 2 } },
      { no: 2, type: 'interest', expectedAmount: 5_500_000, dueDate: past(7) },
      { no: 3, type: 'interest', expectedAmount: 5_500_000, dueDate: past(8), closure: { kind: 'waive', amount: 5_500_000, reason: 'manual' } },
    ],
    receipts: [{ id: 'a', amount: 3_000_000, date: past(6), accountId: 'bca', allocations: [{ no: 1, amount: 3_000_000 }] }],
  };

  it('leaves a carried month out of the Daftar Tagihan and asks for it on the month it moved to', () => {
    const rows = collectionRows([project], null);
    expect(rows).toHaveLength(2);
    const second = rows.find((r) => r.status !== 'Dianggap lunas');
    expect(second.amount).toBe(8_000_000);
    expect(rows.some((r) => r.status === 'Dianggap lunas')).toBe(true);
  });

  it('says how a closed month ended on the Jadwal sheet', () => {
    const lines = scheduleSheetRows([project], () => 'BCA', null);
    expect(lines[0].Status).toBe('Digabung ke bln 2');
    expect(lines[2].Status).toBe('Dianggap lunas');
  });
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `npx vitest run src/utils/exportColumns.test.js src/utils/projectExport.test.js`
Expected: FAIL (no `shortfall` column; `collectionRows` not exported).

- [ ] **Step 3: Write the implementation**

In `src/utils/exportColumns.js`, add `import { isShort, rowRemaining } from './paymentStatus';` below the projectSchedule import, add this helper above `export const PROJECT_COLUMNS`:

```js
// What a borrower is short on tagihan he started paying and that are due.
function shortfallOf(p) {
  return (p.payments || [])
    .filter((row) => isShort(p, row))
    .reduce((s, row) => s + rowRemaining(p, row), 0);
}
```

and add, right after the `remaining` column entry:

```js
  { key: 'shortfall', label: 'Kurang Bayar', defaultOn: false, width: 24, align: 'right',
    value: (p) => shortfallOf(p),
    text: (p) => formatCurrency(shortfallOf(p)) },
```

In `src/utils/projectExport.js`:
1. Replace `paymentStatusLabel` with:

```js
// Kurang is a warning, so it is kept for tagihan already due; a tagihan paid
// partly ahead of its due date reads Sebagian. Both still count as not paid.
// A month closed without money says how.
function paymentStatusLabel(p, pay, paidLabel) {
  const c = pay.closure;
  if (c?.kind === 'carry') return `Digabung ke bln ${c.toNo}`;
  if (isSettled(p, pay)) return c?.kind === 'waive' && c.reason !== 'legacy' ? 'Dianggap lunas' : paidLabel;
  if (rowReceived(p, pay) > 0) return isShort(p, pay) ? 'Kurang' : 'Sebagian';
  return 'Belum';
}
```

2. Change `function collectionRows(projects, filter) {` to `export function collectionRows(projects, filter) {`, and inside its `(p.payments || []).forEach((pay) => {`, right after `if (!pay.dueDate) return;`, add:

```js
      // A carried month is asked for on the month it moved to.
      if (pay.closure?.kind === 'carry') return;
```

- [ ] **Step 4: Run them to verify they pass**

Run: `npx vitest run` (all green).

- [ ] **Step 5: Commit**

```bash
git add src/utils/exportColumns.js src/utils/exportColumns.test.js src/utils/projectExport.js src/utils/projectExport.test.js
git commit -m "feat: Kurang Bayar column, and closed months said plainly in exports"
```

---

### Task 8: A duration change keeps the month holding a tunggakan

**Files:** modify `src/utils/projectSchedule.js`, `src/utils/projectSchedule.test.js`.

- [ ] **Step 1: Write the failing test**

Append inside the `describe('recomputeUnpaidSchedule when money has already arrived', …)` block of `src/utils/projectSchedule.test.js`:

```js
  it('refuses to shorten past a month a tunggakan was carried onto', () => {
    const rows = generateProjectSchedule(terms(6)).map((r) =>
      r.no === 2 ? { ...r, closure: { kind: 'carry', amount: 5_500_000, toNo: 5 } } : r
    );
    expect(() => recomputeUnpaidSchedule(rows, terms(4))).toThrow(/tunggakan yang digabung ke bulan 5/);
  });
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run src/utils/projectSchedule.test.js`
Expected: FAIL (no error thrown).

- [ ] **Step 3: Write the guard**

In `recomputeUnpaidSchedule`, directly after the `for (const [no, kept] of paidByNo) { … }` guard loop, add:

```js
  // A tunggakan carried onto a later month lives on that month's number;
  // shortening past it would drop the debt with the row.
  for (const p of existingPayments || []) {
    const c = p?.closure;
    if (c?.kind === 'carry' && c.toNo > months) {
      throw new Error(
        `Durasi tidak bisa dipendekkan ke ${months} bulan karena ada tunggakan yang digabung ke bulan ${c.toNo}.`
      );
    }
  }
```

- [ ] **Step 4: Run it to verify it passes**

Run: `npx vitest run` (all green).

- [ ] **Step 5: Commit**

```bash
git add src/utils/projectSchedule.js src/utils/projectSchedule.test.js
git commit -m "fix: a duration change may not drop a month holding a tunggakan"
```

---

### Task 9: The receipts migration, dry run first

**Files:** create `scripts/migrate-receipts.mjs`; modify `.gitignore`.

The app already derives receipts on read and stores them on a project's first write, so nothing depends on this script. It makes the stored documents say what the screens already show, puts `receiptId` on the payment transactions, and prints the owner's list of old shortfalls. It imports only `src/utils/normalizeProject.js`, which has no imports, so plain Node can run it.

- [ ] **Step 1: Ignore the backups**

Append to `.gitignore`:

```
# Migration backups hold real borrower data; never commit them.
backups/
```

- [ ] **Step 2: Write the script**

Create `scripts/migrate-receipts.mjs`:

```js
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
```

- [ ] **Step 3: Run it on the demo, dry**

Run: `node scripts/migrate-receipts.mjs --demo`
Expected: a report with the demo counts and "Dry run: tidak ada yang ditulis."; a new file under `backups/` that `git status` does not list.

- [ ] **Step 4: Commit**

```bash
git add scripts/migrate-receipts.mjs .gitignore
git commit -m "feat: receipts migration script, dry run by default"
```

- [ ] **Step 5: Dry run on production (read-only; Gde allowed reading production data on 24 Sep)**

Run: `node scripts/migrate-receipts.mjs`
Expected: 51 projects, 51 to store, 123 transactions to receive `receiptId`; the two old shortfalls and two old overpayments from the audit; no problems. Save the printed report for Gde. Do **not** run `--apply` on production without his explicit yes.

---

### Task 10: The demo gets the transactions a real project has

**Files:** create `src/utils/demoLedger.js`, `src/utils/demoLedger.test.js`; modify `src/utils/demoReset.js`, `src/utils/demoSeedData.js`.

Today the demo seed creates paid tagihan that point at no transaction and projects with no funding transaction. Since B3 the correction sheet checks the ledger, so the demo's own payments cannot be edited.

- [ ] **Step 1: Write the failing test**

Create `src/utils/demoLedger.test.js`:

```js
import { describe, it, expect } from 'vitest';
import { demoProjectLedger } from './demoLedger';

const project = {
  name: 'Toko',
  disbursedAmount: 9_500_000,
  startDate: 'start',
  sourceKey: 'BCA',
  payments: [
    { no: 1, expectedAmount: 450_000, receivedAmount: 450_000, receivedDate: 'd1', accountKey: 'BCA' },
    { no: 2, expectedAmount: 450_000, receivedAmount: 400_000, receivedDate: 'd2', accountKey: 'BRI' },
    { no: 3, expectedAmount: 10_000_000, receivedAmount: null, receivedDate: null, accountKey: null },
  ],
};
let n = 0;
const ledger = () =>
  demoProjectLedger(project, {
    projectId: 'p1',
    newId: () => `id${++n}`,
    accountIdOf: (key) => (key ? `acc-${key}` : null),
  });

describe('demoProjectLedger', () => {
  it('records the modal leaving its source account', () => {
    const l = ledger();
    const funding = l.transactions.find((t) => t.id === l.fundingTransactionId);
    expect(funding).toMatchObject({ type: 'expense', amount: 9_500_000, fromAccount: 'acc-BCA', toAccount: null, date: 'start', projectId: 'p1' });
    expect(funding.description).toBe('Pendanaan project: Toko');
  });

  it('gives every paid tagihan an income with its own amount, account and date', () => {
    const l = ledger();
    const incomes = l.transactions.filter((t) => t.type === 'income');
    expect(incomes).toHaveLength(2);
    for (const pay of l.payments.filter((x) => x.receivedAmount != null)) {
      const tx = incomes.find((t) => t.id === pay.transactionId);
      expect(tx).toMatchObject({ amount: pay.receivedAmount, toAccount: `acc-${pay.accountKey}`, date: pay.receivedDate, projectId: 'p1', paymentNo: pay.no });
    }
  });

  it('leaves an unpaid tagihan without a transaction', () => {
    expect(ledger().payments[2].transactionId).toBeNull();
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run src/utils/demoLedger.test.js`
Expected: FAIL, "Failed to resolve import ./demoLedger".

- [ ] **Step 3: Write the helper**

Create `src/utils/demoLedger.js`:

```js
/**
 * The transactions a demo project would have had if it had been recorded
 * through the app: the modal leaving its source account, and one income per
 * paid tagihan. Without them the demo's payments point at no transaction, and
 * the correction sheet, which checks the ledger, refuses to edit them.
 * `newId()` gives a fresh document id; `accountIdOf(key)` maps a seed key.
 * @returns {{ fundingTransactionId, payments, transactions }}
 */
export function demoProjectLedger(project, { projectId, newId, accountIdOf }) {
  const transactions = [];
  const fundingTransactionId = newId();
  transactions.push({
    id: fundingTransactionId,
    type: 'expense',
    amount: project.disbursedAmount,
    description: `Pendanaan project: ${project.name}`,
    date: project.startDate,
    fromAccount: accountIdOf(project.sourceKey),
    toAccount: null,
    debtId: null,
    projectId,
  });
  const payments = (project.payments || []).map((pay) => {
    if (pay.receivedAmount == null) return { ...pay, transactionId: null };
    const id = newId();
    transactions.push({
      id,
      type: 'income',
      amount: pay.receivedAmount,
      description: `Pembayaran project: ${project.name} (bln ${pay.no})`,
      date: pay.receivedDate,
      fromAccount: null,
      toAccount: accountIdOf(pay.accountKey),
      debtId: null,
      projectId,
      paymentNo: pay.no,
    });
    return { ...pay, transactionId: id };
  });
  return { fundingTransactionId, payments, transactions };
}
```

- [ ] **Step 4: Use it when the demo is seeded**

In `src/utils/demoReset.js`, add `import { demoProjectLedger } from './demoLedger';`, and replace the start of the projects loop:

```js
  for (const p of projects || []) {
    const ref = doc(collection(db, 'demo_projects'));
    const payments = (p.payments || []).map((pay) => ({
```

with:

```js
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
      batch.set(doc(db, 'demo_transactions', id), { ...tx, createdAt: serverTimestamp() });
    }
    const payments = ledger.payments.map((pay) => ({
```

and in the `data` object of that loop change `fundingTransactionId: null,` to `fundingTransactionId: ledger.fundingTransactionId,`.

In `src/utils/demoSeedData.js`, give the active project one old shortfall so the demo shows the list feature: in the active project's loop, change `receivedAmount: received ? expected : null,` to:

```js
      // Month 2 was confirmed 50 rb short before partial payments existed:
      // the demo shows an old shortfall the owner can ask for again.
      receivedAmount: received ? (i === 2 ? expected - 50000 : expected) : null,
```

- [ ] **Step 5: Check and commit**

Run: `npx vitest run`, `npm run build`, `npx eslint src/utils/demoLedger.js src/utils/demoLedger.test.js src/utils/demoReset.js src/utils/demoSeedData.js`.

```bash
git add src/utils/demoLedger.js src/utils/demoLedger.test.js src/utils/demoReset.js src/utils/demoSeedData.js
git commit -m "feat: the demo's projects get the transactions a real project has"
```

---

### Task 11: Verify in the browser, on a freshly seeded demo

**Files:** none.

- [ ] **Step 1:** Reseed the demo with the new seed: set `demo_config/settings.lastResetDate` to `'2020-01-01'` (the same thing `forceDemoReseed()` does), start the dev server (`preview_start`, config `pusat-gadai-madiun`, port 5174), enter demo mode. The demo's data is shared with the live site's demo and reseeded daily anyway.
- [ ] **Step 2: Walk it**
  1. Pak Budi: bulan 1 and 2 open their payment from Edit (the ledger now exists). Bulan 2's sheet offers "Tagih lagi kekurangan lama Rp 50.000"; doing it turns bulan 2 into Kurang Rp 50.000 and a later Edit follows the new rules.
  2. Receive part of bulan 3 while it is due (or pick a month already due), then "Atur sisa →": the sheet offers Gabung ke bulan 4 and Anggap lunas. Gabung: bulan 3 reads "Digabung ke bulan 4", bulan 4 shows "+ tunggakan bulan 3" and asks for both; Total Diterima and every balance are unchanged; the Daftar Tagihan leaves bulan 3 out.
  3. "Buka lagi →" on bulan 3 undoes it exactly.
  4. Anggap lunas on a partly paid month: "Dianggap lunas", Edit gone from that row (its payment is locked until reopened), Buka lagi restores it.
  5. Anggap lunas on the last open month of a project completes it; Buka lagi reopens it.
  6. Excel export with "Kurang Bayar" ticked: the column carries what due, partly paid months still lack.
- [ ] **Step 3: Confirm the trap is not live**: after each step, the months paid before and not touched still read the same.
- [ ] **Step 4:** Report; do not merge before the independent review.

---

## Deliberately left out of B4

- **`--apply` on production** until Gde says yes after the dry-run report.
- **The pelunasan's own remainder** (Ditagih menyusul / Diperpanjang / Kontrak baru): Part C.
- **Carrying onto a future month from a month that is not yet due**: not offered; the owner can still receive in advance.

## Notes for Part C

- `rowClosed` already counts `extend` and `rollover` closures, and `applyReopenRemainder` refuses them ("Batalkan dari sana").
- Extension rows replace the pelunasan at its number; a tunggakan carried onto the pelunasan then sits on the first extension row. Keep that in mind in the extension tests.
- Every new writer goes through `inProjectTransaction` with `lastWriteId`, an `alreadyDone` for anything it creates, and `seenWriteId` from its sheet.

## Execution

Inline, in three groups: **Tasks 1-3** (pure, TDD), **Tasks 4-8** (writers, screens, exports), **Tasks 9-10** (script and demo); then Task 11 in the browser, then one independent review of the whole branch before merging.
