# Bagian B3 — Koreksi Pembayaran Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let the owner correct any single arrival of money (its amount, account, or date), move it to the month it was really for, or cancel it, and stop project money being edited from the Transaksi page.

**Architecture:** Every correction touches exactly one receipt and is decided as data by a pure module, `src/utils/receiptOps.js`, which returns the project update to write. `DataContext` moves the money (account balances, the receipt's transaction) and writes that update inside a Firestore transaction that reads the project fresh from the server. A new sheet, `ReceiptManageSheet`, opens from any arrival listed on the schedule and previews each correction with the same decision the save makes.

**Tech Stack:** React 19, Vite 8, Firebase Firestore (12.x), Vitest (163 tests currently green).

**Spec:** `docs/superpowers/specs/2026-09-22-pembayaran-jadwal-download-design.md`, sections 6.3, 6.4, 6.6 and 6.8.

**Branch:** `feat/b3-koreksi`, cut from `main` at `c1224ab` (B2, live since 24 Sep). Do **not** push to `main`: every push deploys the live app.

---

## What B2 left, and the rules a correction follows

B2 (live) lets the owner receive money in parts and edit a tagihan that was paid by exactly **one** arrival that paid nothing else (`applyPaymentEdit` in `src/utils/paymentEdit.js`, called by `updateProjectPayment`). It refuses a tagihan paid in several arrivals and an arrival that also paid another tagihan, and it has no way to move or cancel a payment. B3 replaces that row-level edit with corrections per arrival and deletes `paymentEdit.js`, `updateProjectPayment` and `PaymentConfirmSheet.jsx`.

**The rule that must not break (the B2 trap, still live).** Once a project document stores a `receipts` array, `normalizeProject` stops deriving anything for it and every reader trusts `receipts` completely. Every correction therefore writes the **whole** receipts array back (all other receipts untouched, byte for byte) and keeps the per-row fields (`receivedAmount`, `receivedDate`, `transactionId`, `accountId`) in step with it. `deriveRowFields` in Task 1 recomputes those fields from the receipts after every correction so they cannot drift.

**What a correction does to "is this tagihan settled".** These carry B2's decisions over and extend them to Move and Cancel:

- **A payment confirmed before partial payments existed** (a receipt whose id starts with `legacy-`) closed its tagihan whatever amount was typed; the owner decided those stay settled and get listed in B4. An **Edit** keeps that meaning for the tagihan it was confirmed for: the gap is re-measured as an old-shortfall waiver (`closure: { kind: 'waive', reason: 'legacy' }`), and dropped once the amount covers the tagihan. **Moving or cancelling** it undoes that confirmation, so its waiver goes with it and the tagihan opens honestly.
- **On a project closed by pelunasan dipercepat** (`settledEarly`), the pelunasan closed everything by agreement. After an **Edit**, every gap is closed by the pelunasan again (`reason: 'settlement'`), and the pelunasan row's tagihan is simply what was paid. **Moving and cancelling are not offered there**: spec 6.4 says so, and undoing a settlement would mean restoring the rows it dropped, which this stage does not do. Edit stays allowed because it is live in B2 and the owner already relies on it to fix a typo.
- **Otherwise** the new rules apply: a gap shows as Kurang.
- **Macet projects** allow no correction (as today: the schedule shows no Edit there).
- **Status:** a project completed by its payments goes back to `active` (and `closedAt: null`) when a correction leaves a tagihan open, so the owner can collect the rest; an active project that a correction finishes becomes `completed`.
- **Closures from later stages** (Gabung ke bulan depan and Anggap lunas in B4, perpanjangan in C) block corrections of the receipts on that tagihan until the closure is reopened (spec 6.4), or the stored closure would go stale. None exist yet; `receiptBlock` makes B4 safe by default.
- **Edit re-allocates from the first tagihan the receipt paid**, oldest first, spilling forward exactly like new money, and never pays backwards. Changing which month is Move. Other receipts never move (spec 6.3).

**Why the money writers move into a Firestore transaction (Tasks 4 and 8).** The B2 review found (M1) that a writer reading `project` from React state can start from a stale receipts array: two devices saving within the snapshot delay would each append to the same old array, and the second write would erase the first receipt while its transaction and balance change survive. Reading the project inside `runTransaction` makes Firestore retry with the fresh document instead. It also changes one visible behaviour, deliberately: without a connection a save now fails at once with "Koneksi internet terputus. Tidak ada yang tersimpan, coba lagi." instead of showing a change on screen that is not stored yet (the app keeps no offline cache, so such a change is lost if the app is closed). Task 8 applies this to the writers B2 already had; it is the last task and can be reverted on its own if the review finds a problem with it.

---

## File Structure

| File | Responsibility |
|---|---|
| `src/utils/receiptOps.js` (create) | Decides each correction as data: `deriveRowFields`, `correctionRules`, `receiptBlock`, `applyReceiptCancel`, `applyReceiptEdit`, `moveTargets`, `applyReceiptMove`. Pure. |
| `src/utils/receiptOps.test.js` (create) | Unit tests for all of the above. |
| `src/utils/paymentEdit.js`, `paymentEdit.test.js` (delete) | Replaced by `applyReceiptEdit`; its cases are carried into `receiptOps.test.js`. |
| `src/contexts/DataContext.jsx` (modify) | `inProjectTransaction`, `resolveMoneyIn`, `updateReceipt`, `moveReceipt`, `cancelReceipt` (new); `updateProjectPayment` (deleted); `deleteTransaction`/`updateTransaction` refuse project money; `recordReceipt`, `settleProjectEarly`, `closeProjectAsDefault`, `deleteProject` read the project inside a transaction. |
| `src/utils/normalizeProject.js` (modify) | Doc comment: the list of writers that store receipts. |
| `src/components/Projects/ReceiptManageSheet.jsx` (create) | One arrival: details, then Edit / Pindah ke bulan lain / Batalkan, each previewed before saving. |
| `src/components/Projects/ProjectDetail.jsx` (modify) | Arrivals listed with account and "sebagian dari Rp X", tappable; row Edit opens the arrival; Konfirmasi only on active projects. |
| `src/components/Projects/PaymentConfirmSheet.jsx` (delete) | No longer used. |
| `src/components/Transactions/TransactionDetail.jsx` (modify) | For project money: no Edit/Hapus, a note and a link to the project instead. |

---

### Task 1: The shared parts of a correction, and Cancel

**Files:** create `src/utils/receiptOps.js`, `src/utils/receiptOps.test.js`.

- [ ] **Step 1: Write the failing test**

Create `src/utils/receiptOps.test.js`:

```js
import { describe, it, expect } from 'vitest';
import { deriveRowFields, correctionRules, receiptBlock, applyReceiptCancel } from './receiptOps';
import { isSettled, rowRemaining, rowState, projectReceivedTotal } from './paymentStatus';
import { normalizeProject } from './normalizeProject';

const due = (month) => new Date(2026, month, 5);

// Three monthly bagi hasil of 5,5jt and the pelunasan (100jt) in month four.
const schedule = () => [
  { no: 1, type: 'interest', expectedAmount: 5_500_000, dueDate: due(6), receivedAmount: null },
  { no: 2, type: 'interest', expectedAmount: 5_500_000, dueDate: due(7), receivedAmount: null },
  { no: 3, type: 'interest', expectedAmount: 5_500_000, dueDate: due(8), receivedAmount: null },
  { no: 4, type: 'final', expectedAmount: 100_000_000, dueDate: due(9), receivedAmount: null },
];

// One arrival of money; `pays` maps tagihan number to the amount it put there.
const arrival = (id, pays, { date = due(8), accountId = 'bca' } = {}) => {
  const allocations = Object.entries(pays).map(([no, amount]) => ({ no: Number(no), amount }));
  return {
    id,
    amount: allocations.reduce((s, a) => s + a.amount, 0),
    date,
    accountId,
    transactionId: `tx-${id}`,
    allocations,
  };
};

// A project that stores receipts, as B2 writes it.
const stored = (receipts, over = {}) => ({ status: 'active', payments: schedule(), receipts, ...over });

// A project stored before receipts existed: money only on the rows. The
// corrections receive it normalized, exactly as the screens do.
const legacy = (paid, over = {}) =>
  normalizeProject({
    status: 'active',
    payments: schedule().map((r) =>
      paid[r.no] != null
        ? { ...r, receivedAmount: paid[r.no], receivedDate: due(r.no + 5), accountId: 'bca', transactionId: `tx-${r.no}` }
        : r
    ),
    ...over,
  });

const row = (out, no) => out.update.payments.find((r) => r.no === no);
const after = (p, out) => ({ ...p, ...out.update });

describe('deriveRowFields', () => {
  it('sums what every arrival put on a tagihan and takes the latest arrival for the rest', () => {
    const receipts = [
      arrival('a', { 2: 3_000_000 }, { date: due(7), accountId: 'bca' }),
      arrival('b', { 2: 2_500_000, 3: 1_000_000 }, { date: due(8), accountId: 'bri' }),
    ];
    const rows = deriveRowFields(schedule(), receipts);
    expect(rows[1]).toMatchObject({ receivedAmount: 5_500_000, receivedDate: due(8), transactionId: 'tx-b', accountId: 'bri' });
    expect(rows[2]).toMatchObject({ receivedAmount: 1_000_000, receivedDate: due(8), transactionId: 'tx-b' });
  });

  it('clears the fields on a tagihan no arrival pays any more', () => {
    const rows = schedule();
    rows[0] = { ...rows[0], receivedAmount: 5_500_000, receivedDate: due(6), transactionId: 'tx-old', accountId: 'bca' };
    expect(deriveRowFields(rows, [])[0]).toMatchObject({
      receivedAmount: null,
      receivedDate: null,
      transactionId: null,
      accountId: null,
    });
  });
});

describe('correctionRules', () => {
  it('allows every correction on an active or completed project', () => {
    expect(correctionRules({ status: 'active' })).toEqual({ edit: true, move: true, cancel: true, why: null });
    expect(correctionRules({ status: 'completed' })).toEqual({ edit: true, move: true, cancel: true, why: null });
  });

  it('only allows editing on a project closed by pelunasan dipercepat, and says why', () => {
    const rules = correctionRules({ status: 'completed', settledEarly: true });
    expect(rules).toMatchObject({ edit: true, move: false, cancel: false });
    expect(rules.why).toMatch(/pelunasan dipercepat/);
  });

  it('allows nothing on a macet project', () => {
    expect(correctionRules({ status: 'default' })).toMatchObject({ edit: false, move: false, cancel: false });
  });
});

describe('receiptBlock', () => {
  it('does not block an old payment because of its own old-shortfall waiver', () => {
    const p = legacy({ 2: 5_000_000 });
    expect(receiptBlock(p, p.receipts.find((r) => r.id === 'legacy-2'))).toBeNull();
  });

  it('blocks when a tagihan it paid was closed another way', () => {
    const p = stored([arrival('a', { 2: 3_000_000 })]);
    p.payments[1] = { ...p.payments[1], closure: { kind: 'carry', amount: 2_500_000, toNo: 3 } };
    expect(receiptBlock(p, p.receipts[0])).toMatch(/bulan 2 sudah ditutup/);
  });
});

describe('applyReceiptCancel', () => {
  it('removes the arrival and opens the tagihan it paid again', () => {
    const p = stored([arrival('a', { 1: 5_500_000 }), arrival('b', { 2: 5_500_000 })]);
    const out = applyReceiptCancel(p, 'b');
    expect(out.update.receipts.map((r) => r.id)).toEqual(['a']);
    expect(out.update.receipts[0]).toEqual(p.receipts[0]);
    expect(rowState(after(p, out), row(out, 2))).toBe('belum');
    expect(row(out, 2)).toMatchObject({ receivedAmount: null, transactionId: null });
    expect(projectReceivedTotal(after(p, out))).toBe(5_500_000);
  });

  it('opens every tagihan a split arrival paid', () => {
    const p = stored([arrival('a', { 2: 5_500_000, 3: 1_500_000 })]);
    const out = applyReceiptCancel(p, 'a');
    expect(rowRemaining(after(p, out), row(out, 2))).toBe(5_500_000);
    expect(rowRemaining(after(p, out), row(out, 3))).toBe(5_500_000);
  });

  it("takes an old payment's shortfall waiver with it", () => {
    const p = legacy({ 1: 5_500_000, 2: 5_000_000 });
    const out = applyReceiptCancel(p, 'legacy-2');
    expect(row(out, 2)).not.toHaveProperty('closure');
    expect(rowRemaining(after(p, out), row(out, 2))).toBe(5_500_000);
    expect(isSettled(after(p, out), row(out, 1))).toBe(true);
  });

  it('puts a project completed by its payments back to active', () => {
    const p = stored(
      [arrival('a', { 1: 5_500_000, 2: 5_500_000, 3: 5_500_000 }), arrival('b', { 4: 100_000_000 })],
      { status: 'completed', closedAt: due(9) }
    );
    const out = applyReceiptCancel(p, 'b');
    expect(out.update.status).toBe('active');
    expect(out.update.closedAt).toBeNull();
  });

  it('is refused on a project closed by pelunasan dipercepat, and on a macet one', () => {
    const settled = stored([arrival('a', { 1: 5_500_000 })], { status: 'completed', settledEarly: true });
    expect(() => applyReceiptCancel(settled, 'a')).toThrow(/pelunasan dipercepat/);
    const macet = stored([arrival('a', { 1: 5_500_000 })], { status: 'default' });
    expect(() => applyReceiptCancel(macet, 'a')).toThrow(/macet/);
  });

  it('is refused for an arrival that does not exist', () => {
    expect(() => applyReceiptCancel(stored([]), 'nope')).toThrow(/tidak ditemukan/);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run src/utils/receiptOps.test.js`
Expected: FAIL, "Failed to resolve import ./receiptOps".

- [ ] **Step 3: Write the implementation**

Create `src/utils/receiptOps.js`:

```js
import { isSettled } from './paymentStatus';
import { normalizeProject } from './normalizeProject';
import { toDate } from './formatDate';

/**
 * Correcting one arrival of money, decided as data. DataContext moves the
 * money and writes the result.
 *
 * Three corrections, each touching exactly one receipt; other receipts never
 * move (spec 6.3):
 * - Edit: new amount, account, or date. The receipt is re-allocated from the
 *   first tagihan it paid, oldest first, the same way new money is.
 * - Move: the same amount re-allocated from another tagihan ("salah bulan").
 * - Cancel: the receipt is removed and the tagihan it paid open again.
 *
 * What a correction does to "is this tagihan settled":
 * - A payment confirmed before partial payments existed (a `legacy-`
 *   receipt) closed its tagihan whatever amount was typed, and the owner
 *   decided those stay settled and get listed. An Edit keeps that meaning for
 *   the tagihan it was confirmed for: its gap is re-measured as an
 *   old-shortfall waiver. Moving or cancelling it undoes the confirmation, so
 *   its waiver goes with it and the tagihan opens honestly.
 * - On a project closed by pelunasan dipercepat, the pelunasan closed
 *   everything by agreement: after an Edit every gap is closed by the
 *   pelunasan again, and the pelunasan row's tagihan is simply what was paid.
 *   Moving and cancelling are not offered there (spec 6.4).
 * - Otherwise the new rules apply and a gap shows as Kurang.
 * A project completed by its payments goes back to active when a correction
 * leaves a tagihan open, and an active one that a correction finishes is
 * completed.
 *
 * Every function returns `update`: exactly the fields to write onto the
 * project document, with the whole receipts array and the per-row fields
 * recomputed, never a partial array.
 */

const isLegacy = (receipt) => String(receipt?.id ?? '').startsWith('legacy-');
const time = (value) => toDate(value)?.getTime() ?? 0;
const nosOf = (receipt) => new Set((receipt?.allocations || []).map((a) => a.no));

// The waivers a correction of this receipt knows how to take back and
// re-measure. Anything else on its tagihan blocks the correction.
function ownedBy(project, receipt, closure) {
  if (closure?.kind !== 'waive') return false;
  if (closure.reason === 'legacy') return isLegacy(receipt);
  if (closure.reason === 'settlement') return !!project.settledEarly;
  return false;
}

/** Which corrections this project allows at all, and why not when it does not. */
export function correctionRules(project) {
  if (project?.status === 'default') {
    return { edit: false, move: false, cancel: false, why: 'Project macet: pembayarannya tidak bisa diubah.' };
  }
  if (project?.settledEarly) {
    return {
      edit: true,
      move: false,
      cancel: false,
      why: 'Project ini ditutup lewat pelunasan dipercepat. Pembayarannya bisa diedit, tapi tidak bisa dipindah atau dibatalkan.',
    };
  }
  return { edit: true, move: true, cancel: true, why: null };
}

/**
 * A tagihan this receipt paid that was closed some other way (gabung, anggap
 * lunas, perpanjangan: later stages) blocks correcting the receipt until that
 * closure is reopened, or the stored closure amount would go stale and could
 * silently forgive or double-count money. Returns the message, or null.
 */
export function receiptBlock(project, receipt) {
  const nos = nosOf(receipt);
  const blocked = (project?.payments || []).find(
    (row) => nos.has(row.no) && row.closure && !ownedBy(project, receipt, row.closure)
  );
  return blocked
    ? `Tagihan bulan ${blocked.no} sudah ditutup dengan cara lain. Buka dulu penutupnya sebelum mengubah pembayaran ini.`
    : null;
}

/**
 * The per-row fields older screens and exports still read, recomputed from
 * the receipts: the total received on the tagihan, and the date, transaction
 * and account of the latest arrival that paid it. A tagihan no receipt pays
 * goes back to "not received".
 */
export function deriveRowFields(payments, receipts) {
  return (payments || []).map((row) => {
    let sum = 0;
    let latest = null;
    for (const r of receipts || []) {
      for (const a of r.allocations || []) {
        if (a.no !== row.no) continue;
        sum += Number(a.amount) || 0;
        if (!latest || time(r.date) >= time(latest.date)) latest = r;
      }
    }
    if (!latest) {
      return { ...row, receivedAmount: null, receivedDate: null, transactionId: null, accountId: null };
    }
    return {
      ...row,
      receivedAmount: sum,
      receivedDate: latest.date ?? null,
      transactionId: latest.transactionId ?? null,
      accountId: latest.accountId ?? null,
    };
  });
}

function findReceipt(project, receiptId) {
  const receipt = (project.receipts || []).find((r) => r.id === receiptId);
  if (!receipt) throw new Error('Pembayaran tidak ditemukan');
  if (!(receipt.allocations || []).length) {
    throw new Error('Pembayaran ini tidak lengkap, jadi belum bisa diubah.');
  }
  return receipt;
}

function guardCorrection(project, receipt, action) {
  const rules = correctionRules(project);
  if (!rules[action]) throw new Error(rules.why);
  const block = receiptBlock(project, receipt);
  if (block) throw new Error(block);
}

// The project as if this receipt had never arrived: the receipt is gone, and
// so are the waivers that belonged to it.
function withoutReceipt(project, receipt) {
  const nos = nosOf(receipt);
  const payments = (project.payments || []).map((row) => {
    if (!nos.has(row.no) || !ownedBy(project, receipt, row.closure)) return row;
    const next = { ...row };
    delete next.closure;
    return next;
  });
  return { ...project, payments, receipts: (project.receipts || []).filter((r) => r.id !== receipt.id) };
}

function statusChange(project, payments, receipts, at) {
  if (project.settledEarly || project.status === 'default') return {};
  const after = { ...project, payments, receipts };
  const allSettled = payments.length > 0 && payments.every((row) => isSettled(after, row));
  if (project.status === 'completed' && !allSettled) return { status: 'active', closedAt: null };
  if (project.status === 'active' && allSettled) return { status: 'completed', closedAt: at ?? null };
  return {};
}

// The update to write: rows with their derived fields recomputed, the whole
// receipts array, and the status change the correction causes, if any.
function finish(project, payments, receipts, at) {
  const derived = deriveRowFields(payments, receipts);
  return { payments: derived, receipts, ...statusChange(project, derived, receipts, at) };
}

/** Cancel one arrival. @returns {{ update }} */
export function applyReceiptCancel(project, receiptId) {
  const p = normalizeProject(project);
  const receipt = findReceipt(p, receiptId);
  guardCorrection(p, receipt, 'cancel');
  const base = withoutReceipt(p, receipt);
  return { update: finish(p, base.payments, base.receipts, null) };
}
```

- [ ] **Step 4: Run it to verify it passes**

Run: `npx vitest run src/utils/receiptOps.test.js`
Expected: PASS, 13 tests.

- [ ] **Step 5: Commit**

```bash
git add src/utils/receiptOps.js src/utils/receiptOps.test.js
git commit -m "feat: decide cancelling one arrival of money as data"
```

---

### Task 2: Edit one arrival

**Files:** modify `src/utils/receiptOps.js`, `src/utils/receiptOps.test.js`.

- [ ] **Step 1: Write the failing test**

In `src/utils/receiptOps.test.js`, change the first import line to:

```js
import { deriveRowFields, correctionRules, receiptBlock, applyReceiptCancel, applyReceiptEdit } from './receiptOps';
```

and append:

```js
const at = new Date(2026, 8, 20);
const edit = (p, id, amount, accountId = 'bca') => applyReceiptEdit(p, id, { amount, at, accountId });

describe('applyReceiptEdit: payments confirmed before this feature', () => {
  it('stays settled when corrected down, the gap kept as an old shortfall', () => {
    const p = legacy({ 1: 5_500_000 });
    const out = edit(p, 'legacy-1', 5_000_000);
    expect(row(out, 1).closure).toEqual({ kind: 'waive', amount: 500_000, reason: 'legacy' });
    expect(isSettled(after(p, out), row(out, 1))).toBe(true);
    expect(out.update.receipts.find((r) => r.id === 'legacy-1')).toMatchObject({
      amount: 5_000_000,
      date: at,
      allocations: [{ no: 1, amount: 5_000_000 }],
    });
    expect(out.update.status).toBeUndefined();
  });

  it('drops the old shortfall once corrected up to the full tagihan', () => {
    const p = legacy({ 2: 5_000_000 });
    expect(p.payments[1].closure).toEqual({ kind: 'waive', amount: 500_000, reason: 'legacy' });
    const out = edit(p, 'legacy-2', 5_500_000);
    expect(row(out, 2)).not.toHaveProperty('closure');
    expect(isSettled(after(p, out), row(out, 2))).toBe(true);
  });

  it('re-measures the old shortfall when corrected further down', () => {
    const p = legacy({ 2: 5_000_000 });
    const out = edit(p, 'legacy-2', 4_000_000);
    expect(row(out, 2).closure).toEqual({ kind: 'waive', amount: 1_500_000, reason: 'legacy' });
  });
});

describe('applyReceiptEdit: payments under the new rules', () => {
  it('lets a gap show as Kurang instead of hiding it', () => {
    const p = stored([arrival('a', { 1: 5_500_000 }), arrival('b', { 2: 5_500_000 })]);
    const out = edit(p, 'b', 5_000_000);
    expect(row(out, 2)).not.toHaveProperty('closure');
    expect(rowRemaining(after(p, out), row(out, 2))).toBe(500_000);
    expect(out.update.status).toBeUndefined();
  });

  it('re-splits an arrival that paid two tagihan, starting from the first one', () => {
    const p = stored([arrival('a', { 1: 5_500_000 }), arrival('b', { 2: 5_500_000, 3: 1_500_000 })]);
    expect(edit(p, 'b', 6_000_000).allocations).toEqual([
      { no: 2, amount: 5_500_000 },
      { no: 3, amount: 500_000 },
    ]);
    expect(edit(p, 'b', 12_000_000).allocations).toEqual([
      { no: 2, amount: 5_500_000 },
      { no: 3, amount: 5_500_000 },
      { no: 4, amount: 1_000_000 },
    ]);
  });

  it('edits one of several arrivals on the same tagihan and leaves the others alone', () => {
    const p = stored([arrival('a', { 2: 3_000_000 }), arrival('b', { 2: 2_500_000 })]);
    const out = edit(p, 'b', 2_000_000, 'bri');
    expect(out.update.receipts[0]).toEqual(p.receipts[0]);
    expect(out.update.receipts[1]).toMatchObject({ id: 'b', amount: 2_000_000, accountId: 'bri', date: at });
    expect(rowRemaining(after(p, out), row(out, 2))).toBe(500_000);
    expect(row(out, 2)).toMatchObject({ receivedAmount: 5_000_000 });
  });

  it('refuses an amount above what is still owed', () => {
    const p = stored(
      [arrival('a', { 1: 5_500_000, 2: 5_500_000, 3: 5_500_000 }), arrival('b', { 4: 100_000_000 })],
      { status: 'completed' }
    );
    expect(() => edit(p, 'b', 100_500_000)).toThrow('Jumlah melebihi sisa tagihan sebesar Rp 500.000');
  });

  it('puts a project completed by its payments back to active when a correction leaves a tagihan short', () => {
    const p = stored(
      [arrival('a', { 1: 5_500_000, 2: 5_500_000, 3: 5_500_000 }), arrival('b', { 4: 100_000_000 })],
      { status: 'completed', closedAt: due(9) }
    );
    const out = edit(p, 'b', 99_500_000);
    expect(out.update.status).toBe('active');
    expect(out.update.closedAt).toBeNull();
  });

  it('completes an active project when a correction pays its last tagihan in full', () => {
    const p = stored([arrival('a', { 1: 5_500_000, 2: 5_500_000, 3: 5_500_000 }), arrival('b', { 4: 99_500_000 })]);
    const out = edit(p, 'b', 100_000_000);
    expect(out.update.status).toBe('completed');
    expect(out.update.closedAt).toBe(at);
  });
});

describe('applyReceiptEdit: project closed by pelunasan dipercepat', () => {
  // Bulan 1 and 2 paid, then settled early for 100jt on a new pelunasan row 3.
  const settled = (paid2 = 5_500_000, closure2 = null) => ({
    status: 'completed',
    settledEarly: true,
    closedAt: due(8),
    payments: [
      { no: 1, type: 'interest', expectedAmount: 5_500_000, dueDate: due(6) },
      { no: 2, type: 'interest', expectedAmount: 5_500_000, dueDate: due(7), ...(closure2 ? { closure: closure2 } : {}) },
      { no: 3, type: 'final', expectedAmount: 100_000_000, dueDate: due(8), settledEarly: true },
    ],
    receipts: [arrival('a', { 1: 5_500_000 }), arrival('b', { 2: paid2 }), arrival('s', { 3: 100_000_000 })],
  });

  it('lets the pelunasan tagihan follow the corrected amount', () => {
    const p = settled();
    const out = edit(p, 's', 99_000_000);
    expect(row(out, 3).expectedAmount).toBe(99_000_000);
    expect(isSettled(after(p, out), row(out, 3))).toBe(true);
    expect(out.update.status).toBeUndefined();
  });

  it('keeps an earlier tagihan closed by the pelunasan when corrected down', () => {
    const p = settled();
    const out = edit(p, 'b', 5_000_000);
    expect(row(out, 2).closure).toEqual({ kind: 'waive', amount: 500_000, reason: 'settlement', at: due(8) });
    expect(isSettled(after(p, out), row(out, 2))).toBe(true);
    expect(out.update.status).toBeUndefined();
  });

  it('drops the pelunasan waiver once the tagihan is corrected up to full', () => {
    const p = settled(3_000_000, { kind: 'waive', amount: 2_500_000, reason: 'settlement', at: due(8) });
    const out = edit(p, 'b', 5_500_000);
    expect(row(out, 2)).not.toHaveProperty('closure');
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run src/utils/receiptOps.test.js`
Expected: FAIL, "applyReceiptEdit is not a function" (the 12 new tests); the 13 from Task 1 still pass.

- [ ] **Step 3: Write the implementation**

In `src/utils/receiptOps.js`, replace the first import line:

```js
import { isSettled } from './paymentStatus';
```

with:

```js
import { allocateReceipt } from './allocation';
import { isSettled, rowRemaining } from './paymentStatus';
import { formatCurrency } from './formatCurrency';
```

and append:

```js
/**
 * Edit one arrival: its amount, account, or date. It is re-allocated from the
 * first tagihan it paid; changing the month is Move.
 * `at` is the arrival's date in the shape stored (a Timestamp in the app).
 * @returns {{ update, allocations }}
 */
export function applyReceiptEdit(project, receiptId, { amount, at, accountId }) {
  const p = normalizeProject(project);
  const receipt = findReceipt(p, receiptId);
  guardCorrection(p, receipt, 'edit');
  const amt = Math.round(Number(amount) || 0);
  if (amt <= 0) throw new Error('Jumlah harus lebih dari 0');

  const firstNo = receipt.allocations[0].no;
  let base = withoutReceipt(p, receipt);
  // On a project closed by pelunasan dipercepat, the pelunasan row's tagihan
  // is simply what was paid, so it follows the corrected amount.
  if (p.settledEarly) {
    base = {
      ...base,
      payments: base.payments.map((r) =>
        r.settledEarly && r.no === firstNo ? { ...r, expectedAmount: amt } : r
      ),
    };
  }

  const { allocations, leftover } = allocateReceipt(base, amt, firstNo);
  if (!allocations.length || leftover > 0) {
    throw new Error(`Jumlah melebihi sisa tagihan sebesar ${formatCurrency(leftover)}`);
  }

  const edited = { ...receipt, amount: amt, date: at, accountId, allocations };
  const receipts = (p.receipts || []).map((r) => (r.id === receipt.id ? edited : r));
  const measured = { ...base, receipts };

  const payments = base.payments.map((row) => {
    const gap = rowRemaining(measured, row);
    if (gap <= 0) return row;
    if (isLegacy(receipt) && row.no === firstNo) {
      return { ...row, closure: { kind: 'waive', amount: gap, reason: 'legacy' } };
    }
    if (p.settledEarly && !row.settledEarly) {
      return { ...row, closure: { kind: 'waive', amount: gap, reason: 'settlement', at: p.closedAt ?? null } };
    }
    return row;
  });

  return { update: finish(p, payments, receipts, at), allocations };
}
```

- [ ] **Step 4: Run it to verify it passes**

Run: `npx vitest run src/utils/receiptOps.test.js`
Expected: PASS, 25 tests.

- [ ] **Step 5: Commit**

```bash
git add src/utils/receiptOps.js src/utils/receiptOps.test.js
git commit -m "feat: decide editing one arrival of money as data"
```

---

### Task 3: Move one arrival to another month

**Files:** modify `src/utils/receiptOps.js`, `src/utils/receiptOps.test.js`.

- [ ] **Step 1: Write the failing test**

Change the first import line of `src/utils/receiptOps.test.js` to:

```js
import {
  deriveRowFields, correctionRules, receiptBlock, applyReceiptCancel, applyReceiptEdit,
  applyReceiptMove, moveTargets,
} from './receiptOps';
```

and append:

```js
describe('applyReceiptMove', () => {
  it('moves an arrival to the month it was really for', () => {
    const p = stored([arrival('a', { 1: 5_500_000 }), arrival('b', { 2: 5_500_000 })]);
    const out = applyReceiptMove(p, 'b', 3);
    expect(out.allocations).toEqual([{ no: 3, amount: 5_500_000 }]);
    expect(rowState(after(p, out), row(out, 2))).toBe('belum');
    expect(isSettled(after(p, out), row(out, 3))).toBe(true);
    expect(projectReceivedTotal(after(p, out))).toBe(11_000_000);
    expect(out.update.receipts[0]).toEqual(p.receipts[0]);
  });

  it('spills forward from the new month the way new money does', () => {
    const p = stored([arrival('a', { 1: 5_500_000, 2: 1_500_000 })]);
    const out = applyReceiptMove(p, 'a', 2);
    expect(out.allocations).toEqual([{ no: 2, amount: 5_500_000 }, { no: 3, amount: 1_500_000 }]);
    expect(rowRemaining(after(p, out), row(out, 1))).toBe(5_500_000);
  });

  it('refuses a month that is already paid', () => {
    const p = stored([arrival('a', { 1: 5_500_000 }), arrival('b', { 2: 5_500_000 })]);
    expect(() => applyReceiptMove(p, 'b', 1)).toThrow('Tagihan bulan 1 sudah lunas. Pilih bulan lain.');
  });

  it('refuses the month it already starts from', () => {
    const p = stored([arrival('b', { 2: 5_500_000 })]);
    expect(() => applyReceiptMove(p, 'b', 2)).toThrow(/Pilih bulan lain/);
  });

  it('refuses a move the tagihan from that month on cannot hold', () => {
    const p = stored([arrival('a', { 3: 5_500_000, 4: 95_500_000 })]);
    expect(() => applyReceiptMove(p, 'a', 4)).toThrow(
      'Mulai bulan 4, sisa tagihan kurang Rp 1.000.000 untuk menampung pembayaran ini.'
    );
  });

  it('leaves the month an old payment was confirmed for open, with no waiver anywhere', () => {
    const p = legacy({ 2: 5_000_000 });
    const out = applyReceiptMove(p, 'legacy-2', 3);
    expect(row(out, 2)).not.toHaveProperty('closure');
    expect(rowState(after(p, out), row(out, 2))).toBe('belum');
    expect(row(out, 3)).not.toHaveProperty('closure');
    expect(rowRemaining(after(p, out), row(out, 3))).toBe(500_000);
  });

  it('is refused on a project closed by pelunasan dipercepat', () => {
    const p = stored([arrival('a', { 1: 5_500_000 })], { status: 'completed', settledEarly: true });
    expect(() => applyReceiptMove(p, 'a', 2)).toThrow(/pelunasan dipercepat/);
  });
});

describe('moveTargets', () => {
  it('lists the open tagihan as they would be without this arrival, minus where it starts now', () => {
    const p = stored([arrival('a', { 1: 5_500_000 }), arrival('b', { 2: 5_500_000, 3: 1_500_000 })]);
    expect(moveTargets(p, 'b')).toEqual([
      { no: 3, dueDate: due(8), remaining: 5_500_000 },
      { no: 4, dueDate: due(9), remaining: 100_000_000 },
    ]);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run src/utils/receiptOps.test.js`
Expected: FAIL on the 8 new tests ("applyReceiptMove is not a function").

- [ ] **Step 3: Write the implementation**

In `src/utils/receiptOps.js`, change `import { allocateReceipt } from './allocation';` to:

```js
import { allocateReceipt, openRows } from './allocation';
```

and append:

```js
/**
 * The open tagihan this arrival could move to: as they would be without it,
 * minus the one it starts at now. @returns [{ no, dueDate, remaining }]
 */
export function moveTargets(project, receiptId) {
  const p = normalizeProject(project);
  const receipt = (p.receipts || []).find((r) => r.id === receiptId);
  if (!receipt) return [];
  const firstNo = receipt.allocations?.[0]?.no;
  const base = withoutReceipt(p, receipt);
  return openRows(base)
    .filter((r) => r.no !== firstNo)
    .map((r) => ({ no: r.no, dueDate: r.dueDate, remaining: rowRemaining(base, r) }));
}

/**
 * Move one arrival to another month ("salah bulan"): the same amount,
 * re-allocated from `startNo`. No money moves between accounts.
 * @returns {{ update, allocations }}
 */
export function applyReceiptMove(project, receiptId, startNo) {
  const p = normalizeProject(project);
  const receipt = findReceipt(p, receiptId);
  guardCorrection(p, receipt, 'move');
  if (startNo === receipt.allocations[0].no) {
    throw new Error('Pembayaran ini sudah dimulai dari bulan itu. Pilih bulan lain.');
  }
  const amt = Math.round(Number(receipt.amount) || 0);
  if (amt <= 0) throw new Error('Pembayaran Rp 0 tidak bisa dipindah.');

  const base = withoutReceipt(p, receipt);
  if (!openRows(base).some((r) => r.no === startNo)) {
    throw new Error(`Tagihan bulan ${startNo} sudah lunas. Pilih bulan lain.`);
  }
  const { allocations, leftover } = allocateReceipt(base, amt, startNo);
  if (leftover > 0) {
    throw new Error(
      `Mulai bulan ${startNo}, sisa tagihan kurang ${formatCurrency(leftover)} untuk menampung pembayaran ini.`
    );
  }
  const moved = { ...receipt, allocations };
  const receipts = (p.receipts || []).map((r) => (r.id === receipt.id ? moved : r));
  return { update: finish(p, base.payments, receipts, receipt.date), allocations };
}
```

- [ ] **Step 4: Run it to verify it passes**

Run: `npx vitest run src/utils/receiptOps.test.js`
Expected: PASS, 33 tests. Then `npx vitest run`: all green.

- [ ] **Step 5: Commit**

```bash
git add src/utils/receiptOps.js src/utils/receiptOps.test.js
git commit -m "feat: decide moving one arrival to another month as data"
```

---

### Task 4: The three corrections in DataContext

**Files:** modify `src/contexts/DataContext.jsx`, `src/utils/normalizeProject.js`; delete `src/utils/paymentEdit.js`, `src/utils/paymentEdit.test.js`.

There is no unit test for `DataContext` in this repo (it needs Firestore). The decisions are tested in Tasks 1-3; this task only moves money and writes what they return. It is verified in the browser in Task 9 and by the independent review.

- [ ] **Step 1: Imports**

In `src/contexts/DataContext.jsx`:
- add `runTransaction` to the `firebase/firestore` import;
- delete `import { applyPaymentEdit } from '../utils/paymentEdit';`;
- add:

```js
import { applyReceiptCancel, applyReceiptEdit, applyReceiptMove } from '../utils/receiptOps';
import { toDate } from '../utils/formatDate';
```

- [ ] **Step 2: Split resolving an account from crediting it**

Replace the whole `creditMoneyIn` function (and its comment) with:

```js
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
  // the fresh document instead. It needs a connection: offline it fails at
  // once, which beats showing a change that is not stored (the app keeps no
  // offline cache, so such a change is lost when the app closes).
  async function inProjectTransaction(projectId, work) {
    try {
      return await runTransaction(db, async (t) => {
        const ref = doc(db, C('projects'), projectId);
        const snap = await t.get(ref);
        if (!snap.exists()) throw new Error('Project tidak ditemukan');
        return work(t, normalizeProject({ id: snap.id, ...snap.data() }), ref);
      });
    } catch (e) {
      if (e?.code === 'unavailable' || /offline/i.test(e?.message || '')) {
        throw new Error('Koneksi internet terputus. Tidak ada yang tersimpan, coba lagi.', { cause: e });
      }
      throw e;
    }
  }

  function receiptDescription(project, allocations) {
    return `Pembayaran project: ${project.name} (bln ${allocations.map((a) => a.no).join(', ')})`;
  }
```

- [ ] **Step 3: Replace `updateProjectPayment` with the three corrections**

Delete the whole `updateProjectPayment` function, from its comment `// Edit an already-received payment.` to its closing brace, and put in its place:

```js
  // ===== Corrections to one arrival of money =====
  // Each reads the project inside a transaction and decides the correction
  // with receiptOps, which refuses before anything is written; then it moves
  // the money and writes the whole update receiptOps returned.

  async function updateReceipt(projectId, receiptId, { amount, date, account }) {
    if (!account) throw new Error('Pilih rekening tujuan');
    const status = await inProjectTransaction(projectId, async (t, project, ref) => {
      const receipt = (project.receipts || []).find((r) => r.id === receiptId);
      if (!receipt) throw new Error('Pembayaran tidak ditemukan');
      // Reads before writes: a legacy receipt's transaction may be missing.
      const txRef = receipt.transactionId ? doc(db, C('transactions'), receipt.transactionId) : null;
      const txSnap = txRef ? await t.get(txRef) : null;

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

      if (txSnap?.exists()) {
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
      }
      t.update(ref, update);
      return update.status;
    });
    toast(
      status === 'active'
        ? 'Pembayaran diperbarui, project aktif lagi'
        : status === 'completed'
          ? 'Pembayaran diperbarui, project selesai'
          : 'Pembayaran diperbarui'
    );
  }

  async function moveReceipt(projectId, receiptId, startNo) {
    const status = await inProjectTransaction(projectId, async (t, project, ref) => {
      const receipt = (project.receipts || []).find((r) => r.id === receiptId);
      if (!receipt) throw new Error('Pembayaran tidak ditemukan');
      const txRef = receipt.transactionId ? doc(db, C('transactions'), receipt.transactionId) : null;
      const txSnap = txRef ? await t.get(txRef) : null;

      const { update, allocations } = applyReceiptMove(project, receiptId, Number(startNo));
      if (txSnap?.exists()) {
        t.update(txRef, {
          paymentNo: allocations[0].no,
          description: receiptDescription(project, allocations),
          receiptId: receipt.id,
        });
      }
      t.update(ref, update);
      return update.status;
    });
    toast(status === 'active' ? 'Pembayaran dipindah, project aktif lagi' : 'Pembayaran dipindah');
  }

  async function cancelReceipt(projectId, receiptId) {
    const status = await inProjectTransaction(projectId, (t, project, ref) => {
      const receipt = (project.receipts || []).find((r) => r.id === receiptId);
      if (!receipt) throw new Error('Pembayaran tidak ditemukan');
      const { update } = applyReceiptCancel(project, receiptId);
      const amt = Number(receipt.amount) || 0;
      if (receipt.accountId && amt) {
        t.update(doc(db, C('accounts'), receipt.accountId), {
          balance: increment(-amt),
          updatedAt: serverTimestamp(),
        });
      }
      if (receipt.transactionId) t.delete(doc(db, C('transactions'), receipt.transactionId));
      t.update(ref, update);
      return update.status;
    });
    toast(status === 'active' ? 'Pembayaran dibatalkan, project aktif lagi' : 'Pembayaran dibatalkan');
  }
```

- [ ] **Step 4: Expose them**

In the context `value`, replace `updateProjectPayment` with `updateReceipt, moveReceipt, cancelReceipt`.

- [ ] **Step 5: Keep the normalizeProject comment true**

In `src/utils/normalizeProject.js`, replace the first bullet of the doc comment:

```js
 * - recordReceipt, updateProjectPayment and settleProjectEarly write the whole
 *   `receipts` array back, derived entries included. From that write on the
```

with:

```js
 * - recordReceipt, updateReceipt, moveReceipt, cancelReceipt and
 *   settleProjectEarly write the whole `receipts` array back, derived entries
 *   included. From that write on the
```

(keep the rest of that bullet as it is).

- [ ] **Step 6: Delete the B2 row-level edit**

```bash
git rm src/utils/paymentEdit.js src/utils/paymentEdit.test.js
grep -rn "paymentEdit\|applyPaymentEdit\|updateProjectPayment" src
```

Expected: the only hits left are in `src/components/Projects/ProjectDetail.jsx` (fixed in Task 6).

- [ ] **Step 7: Check and commit**

Run: `npx vitest run` (expected: all green; the 13 `paymentEdit` tests are gone, their cases live on in `receiptOps.test.js`).

```bash
git add src/contexts/DataContext.jsx src/utils/normalizeProject.js
git commit -m "feat: edit, move or cancel one arrival of money"
```

The build still fails at this point because `ProjectDetail` imports `updateProjectPayment`; Task 6 fixes it. Do not stop here.

---

### Task 5: The sheet for one arrival

**Files:** create `src/components/Projects/ReceiptManageSheet.jsx`.

- [ ] **Step 1: Write the component**

```jsx
import { useMemo, useState } from 'react';
import Modal from '../common/Modal';
import CurrencyInput from '../common/CurrencyInput';
import DateField from '../common/DateField';
import { formatDate, formatDateInput, fromDateInput, toDate } from '../../utils/formatDate';
import { formatCurrency } from '../../utils/formatCurrency';
import {
  applyReceiptEdit,
  applyReceiptMove,
  correctionRules,
  moveTargets,
  receiptBlock,
} from '../../utils/receiptOps';

// One arrival of money: what it paid, and the three ways to correct it. Each
// correction previews what it will do with the same decision the save makes,
// so the owner sees the result before committing.
export default function ReceiptManageSheet({
  open,
  onClose,
  project,
  receiptId,
  accounts,
  onEdit,
  onMove,
  onCancel,
}) {
  const receipt = (project?.receipts || []).find((r) => r.id === receiptId);
  if (!open || !project || !receipt) return null;
  // Mounts fresh for each arrival opened, and only then, so a snapshot
  // arriving while the owner types does not reset what he entered.
  return (
    <ManageForm
      key={receipt.id}
      onClose={onClose}
      project={project}
      receipt={receipt}
      accounts={accounts}
      onEdit={onEdit}
      onMove={onMove}
      onCancel={onCancel}
    />
  );
}

function Allocations({ allocations }) {
  return (
    <div className="rounded-xl border border-line bg-paper p-3 text-[13px]">
      <div className="font-semibold text-ink mb-1">Menutup tagihan:</div>
      {allocations.map((a) => (
        <div key={a.no} className="flex justify-between text-ink-soft">
          <span>Bulan {a.no}</span>
          <span className="font-num">{formatCurrency(a.amount)}</span>
        </div>
      ))}
    </div>
  );
}

const TITLES = {
  menu: 'Uang masuk',
  edit: 'Edit uang masuk',
  move: 'Pindah ke bulan lain',
  cancel: 'Batalkan pembayaran?',
};

function ManageForm({ onClose, project, receipt, accounts, onEdit, onMove, onCancel }) {
  const [step, setStep] = useState('menu');
  const [amount, setAmount] = useState(() => Number(receipt.amount) || 0);
  const [account, setAccount] = useState(() => receipt.accountId || 'cash');
  const [date, setDate] = useState(() => formatDateInput(toDate(receipt.date) || new Date()));
  const [startNo, setStartNo] = useState(() => {
    const first = moveTargets(project, receipt.id)[0];
    return first ? String(first.no) : '';
  });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const rules = correctionRules(project);
  const block = receiptBlock(project, receipt);
  const targets = useMemo(() => moveTargets(project, receipt.id), [project, receipt.id]);
  const accountName = accounts?.find((a) => a.id === receipt.accountId)?.name || '—';

  const editPreview = useMemo(() => {
    try {
      return applyReceiptEdit(project, receipt.id, { amount, at: new Date(), accountId: account });
    } catch (e) {
      return { error: e.message };
    }
  }, [project, receipt.id, amount, account]);

  const movePreview = useMemo(() => {
    if (!startNo) return { error: 'Tidak ada tagihan lain yang masih terbuka.' };
    try {
      return applyReceiptMove(project, receipt.id, Number(startNo));
    } catch (e) {
      return { error: e.message };
    }
  }, [project, receipt.id, startNo]);

  function go(next) {
    setError('');
    setStep(next);
  }

  async function run(action) {
    setError('');
    setSubmitting(true);
    try {
      await action();
      onClose();
    } catch (e) {
      setError(e.message || 'Gagal menyimpan');
    } finally {
      setSubmitting(false);
    }
  }

  const back = (
    <button type="button" onClick={() => go('menu')} className="text-[13px] font-semibold text-indigo mb-3">
      ← Kembali
    </button>
  );
  const errorLine = error && <p className="text-[13px] text-terra">{error}</p>;

  let body;
  let footer = null;

  if (step === 'menu') {
    body = (
      <div className="space-y-3">
        <div className="bg-cream-deep rounded-xl p-3 text-[13px] text-ink-soft space-y-1">
          <div className="flex justify-between">
            <span>Tanggal</span>
            <span className="font-semibold text-ink">{formatDate(receipt.date)}</span>
          </div>
          <div className="flex justify-between">
            <span>Rekening</span>
            <span className="font-semibold text-ink">{accountName}</span>
          </div>
          <div className="flex justify-between">
            <span>Jumlah</span>
            <span className="font-num font-semibold text-ink">{formatCurrency(receipt.amount)}</span>
          </div>
        </div>
        <Allocations allocations={receipt.allocations || []} />
        {(block || rules.why) && (
          <p className="text-[12px] text-ink-mute leading-snug">{block || rules.why}</p>
        )}
        {!block && (
          <div className="space-y-2 pt-1">
            {rules.edit && (
              <button type="button" className="btn-secondary w-full" onClick={() => go('edit')}>
                Edit jumlah, rekening, atau tanggal
              </button>
            )}
            {rules.move && (
              <button type="button" className="btn-secondary w-full" onClick={() => go('move')}>
                Pindah ke bulan lain
              </button>
            )}
            {rules.cancel && (
              <button type="button" className="btn-danger w-full" onClick={() => go('cancel')}>
                Batalkan pembayaran ini
              </button>
            )}
          </div>
        )}
      </div>
    );
  } else if (step === 'edit') {
    body = (
      <form
        id="receipt-edit-form"
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          run(() => onEdit({ amount: Number(amount), account, date: fromDateInput(date) }));
        }}
      >
        {back}
        <div>
          <label className="label-text">Jumlah diterima</label>
          <CurrencyInput value={amount} onChange={setAmount} />
        </div>
        <div>
          <label className="label-text">Masuk ke</label>
          <select className="input-field" value={account} onChange={(e) => setAccount(e.target.value)}>
            <option value="cash">Tunai (Kas)</option>
            {accounts?.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name} ({formatCurrency(a.balance)})
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="label-text">Tanggal diterima</label>
          <DateField value={date} onChange={setDate} />
        </div>
        {editPreview.error ? (
          <p className="text-[13px] text-terra">{editPreview.error}</p>
        ) : (
          <Allocations allocations={editPreview.allocations} />
        )}
        {errorLine}
      </form>
    );
    footer = (
      <button
        type="submit"
        form="receipt-edit-form"
        className="btn-primary w-full"
        disabled={submitting || !!editPreview.error}
      >
        {submitting ? 'Menyimpan…' : 'Simpan perubahan'}
      </button>
    );
  } else if (step === 'move') {
    body = (
      <form
        id="receipt-move-form"
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          run(() => onMove(Number(startNo)));
        }}
      >
        {back}
        <p className="text-[13px] text-ink-soft leading-snug">
          Uangnya tetap di rekening yang sama. Yang berubah hanya tagihan yang ditutup.
        </p>
        {targets.length > 0 && (
          <div>
            <label className="label-text">Pindah ke tagihan</label>
            <select className="input-field" value={startNo} onChange={(e) => setStartNo(e.target.value)}>
              {targets.map((r) => (
                <option key={r.no} value={r.no}>
                  Bulan {r.no} · jatuh tempo {formatDate(r.dueDate, { short: true })} · sisa{' '}
                  {formatCurrency(r.remaining)}
                </option>
              ))}
            </select>
          </div>
        )}
        {movePreview.error ? (
          <p className="text-[13px] text-terra">{movePreview.error}</p>
        ) : (
          <Allocations allocations={movePreview.allocations} />
        )}
        {errorLine}
      </form>
    );
    footer = (
      <button
        type="submit"
        form="receipt-move-form"
        className="btn-primary w-full"
        disabled={submitting || !!movePreview.error}
      >
        {submitting ? 'Memindahkan…' : 'Pindahkan'}
      </button>
    );
  } else {
    body = (
      <div className="space-y-3">
        {back}
        <p className="text-ink-soft text-[14px] leading-relaxed">
          Pembayaran {formatCurrency(receipt.amount)} tanggal {formatDate(receipt.date)} dibatalkan. Saldo{' '}
          {accountName} berkurang {formatCurrency(receipt.amount)} dan transaksinya ikut dihapus. Tagihan yang
          ditutup pembayaran ini terbuka lagi.
        </p>
        {errorLine}
      </div>
    );
    footer = (
      <button type="button" className="btn-danger w-full" disabled={submitting} onClick={() => run(onCancel)}>
        {submitting ? 'Membatalkan…' : 'Ya, batalkan'}
      </button>
    );
  }

  return (
    <Modal open onClose={onClose} title={TITLES[step]} subtitle={project.name} footer={footer}>
      {body}
    </Modal>
  );
}
```

- [ ] **Step 2: Lint and commit**

Run: `npx eslint src/components/Projects/ReceiptManageSheet.jsx`
Expected: no problems.

```bash
git add src/components/Projects/ReceiptManageSheet.jsx
git commit -m "feat: sheet to edit, move or cancel one arrival of money"
```

---

### Task 6: Open an arrival from the schedule

**Files:** modify `src/components/Projects/ProjectDetail.jsx`; delete `src/components/Projects/PaymentConfirmSheet.jsx`.

- [ ] **Step 1: Replace `PaymentRow`**

Replace the whole `PaymentRow` function with:

```jsx
function PaymentRow({ project, payment, onReceive, onManage, canReceive, editable, accountName, isLast }) {
  const due = toDate(payment.dueDate);
  const recv = toDate(payment.receivedDate);
  const isPaid = isSettled(project, payment);
  const isFinal = payment.type === 'final';
  const days = due ? daysBetween(new Date(), due) : 0;
  const overdue = !isPaid && days < 0;
  const dueSoon = !isPaid && days >= 0 && days <= 7;
  const state = rowState(project, payment);
  const short = rowRemaining(project, payment);
  const arrivals = (project.receipts || [])
    .map((r) => ({ r, part: (r.allocations || []).find((a) => a.no === payment.no) }))
    .filter((x) => x.part);
  // A settled tagihan paid in one arrival already shows it on its own line and
  // opens it from Edit. Otherwise every arrival is listed and opens on tap.
  const showArrivals = arrivals.length > 1 || (arrivals.length === 1 && !isPaid);

  // The row's own border-b lives on this outer wrapper, not on the flex row
  // below, so it falls after the arrivals list instead of cutting between a
  // row and its own arrivals.
  return (
    <div className={isLast ? '' : 'border-b border-line-soft'}>
      <div className="flex items-center gap-3 py-3">
        <div
          className={`w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 ${
            isPaid ? 'bg-daun text-cream' : isFinal ? 'bg-indigo text-cream' : 'bg-cream-deep text-ink-soft'
          }`}
        >
          {isPaid ? (
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
          </div>
          <div className="text-[12px] text-ink-mute mt-0.5">
            {isPaid
              ? `Diterima ${recv ? formatDate(recv, { short: true }) : '—'}`
              : `Jatuh tempo ${due ? formatDate(due, { short: true }) : '—'}`}
          </div>
        </div>
        <div className="text-right">
          <div
            className={`font-num text-[15px] font-semibold ${
              isPaid ? 'text-daun' : 'text-ink'
            }`}
            style={{ fontVariantNumeric: 'tabular-nums' }}
          >
            {formatCurrency(isPaid ? rowReceived(project, payment) : payment.expectedAmount, false)}
          </div>
          {!isPaid && canReceive && (
            <button
              type="button"
              onClick={() => onReceive(payment)}
              className="mt-1 text-[12px] font-semibold text-indigo active:opacity-70"
            >
              Konfirmasi →
            </button>
          )}
          {isPaid && editable && arrivals.length === 1 && (
            <button
              type="button"
              onClick={() => onManage(arrivals[0].r.id)}
              className="mt-1 text-[12px] font-semibold text-indigo active:opacity-70"
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

- [ ] **Step 2: Wire the sheet into `ProjectDetail`**

In the same file:

1. Replace `import PaymentConfirmSheet from './PaymentConfirmSheet';` with `import ReceiptManageSheet from './ReceiptManageSheet';`.
2. In the `useData()` destructuring, replace `updateProjectPayment` with `updateReceipt, moveReceipt, cancelReceipt`.
3. Replace `const [paying, setPaying] = useState(null);` with:

```jsx
  const [managing, setManaging] = useState(null); // a receipt id, or null when closed
```

4. Delete the `handleConfirmPayment` function.
5. Replace the `<PaymentRow ... />` element inside `project.payments.map` with:

```jsx
          <PaymentRow
            key={p.no}
            project={project}
            payment={p}
            onReceive={(pay) => setReceiving(pay.no)}
            onManage={(receiptId) => setManaging(receiptId)}
            canReceive={isActive}
            editable={isActive || isCompleted}
            accountName={accountName}
            isLast={i === project.payments.length - 1}
          />
```

6. Replace the whole `<PaymentConfirmSheet ... />` element with:

```jsx
      <ReceiptManageSheet
        open={managing !== null}
        onClose={() => setManaging(null)}
        project={project}
        receiptId={managing}
        accounts={accounts}
        onEdit={(data) => updateReceipt(project.id, managing, data)}
        onMove={(startNo) => moveReceipt(project.id, managing, startNo)}
        onCancel={() => cancelReceipt(project.id, managing)}
      />
```

- [ ] **Step 3: Delete the old sheet**

```bash
git rm src/components/Projects/PaymentConfirmSheet.jsx
grep -rn "PaymentConfirmSheet\|updateProjectPayment\|paymentEdit" src
```

Expected: no output.

- [ ] **Step 4: Check and commit**

Run: `npx vitest run` (all green), `npm run build` (exit 0), `npx eslint src/components/Projects/ProjectDetail.jsx` (no problems beyond the 4 already on `main`: unused `IcCalendar`, `IcArrowDown`, `IcArrowUp`, `totalReturnExpected`).

```bash
git add src/components/Projects/ProjectDetail.jsx
git commit -m "feat: open any arrival of money from the schedule to correct it"
```

---

### Task 7: Project money is changed from the project

**Files:** create `src/utils/projectMoney.js`, `src/utils/projectMoney.test.js`; modify `src/components/Transactions/TransactionDetail.jsx`, `src/contexts/DataContext.jsx`.

Today a project transaction can be edited or deleted from the Transaksi page. That moves the account balance but leaves the receipt and the schedule as they were, so the project keeps showing money that is gone (spec 6.8). The production audit on 23 Sep found no damage from it yet.

- [ ] **Step 1: Write the failing test**

Create `src/utils/projectMoney.test.js`:

```js
import { describe, it, expect } from 'vitest';
import { projectOfTransaction } from './projectMoney';

const projects = [{ id: 'p1', name: 'Toko Budi' }];

describe('projectOfTransaction', () => {
  it('returns the project a transaction belongs to', () => {
    expect(projectOfTransaction({ id: 't', projectId: 'p1' }, projects)).toEqual(projects[0]);
  });

  it('returns null for ordinary money', () => {
    expect(projectOfTransaction({ id: 't', projectId: null }, projects)).toBeNull();
    expect(projectOfTransaction({ id: 't' }, projects)).toBeNull();
  });

  it('returns null for an orphan whose project no longer exists, so it can still be tidied up', () => {
    expect(projectOfTransaction({ id: 't', projectId: 'gone' }, projects)).toBeNull();
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run src/utils/projectMoney.test.js`
Expected: FAIL, "Failed to resolve import ./projectMoney".

- [ ] **Step 3: Write the helper**

Create `src/utils/projectMoney.js`:

```js
// A transaction that belongs to a project (its modal, a receipt, a pelunasan,
// a macet recovery) is changed from the project, where the receipt, the
// schedule and the balance move together. Changing it from the Transaksi page
// would move only the balance. Returns that project, or null for ordinary
// money and for an orphan whose project no longer exists.
export function projectOfTransaction(tx, projects) {
  if (!tx?.projectId) return null;
  return (projects || []).find((p) => p.id === tx.projectId) || null;
}
```

Run: `npx vitest run src/utils/projectMoney.test.js`
Expected: PASS, 3 tests.

- [ ] **Step 4: The Transaksi detail sheet**

Replace `src/components/Transactions/TransactionDetail.jsx` with:

```jsx
import { Link } from 'react-router-dom';
import Modal from '../common/Modal';
import { useData } from '../../contexts/DataContext';
import { useDemo } from '../../contexts/DemoContext';
import { formatCurrency } from '../../utils/formatCurrency';
import { formatDate } from '../../utils/formatDate';
import { projectOfTransaction } from '../../utils/projectMoney';

const TYPE_LABEL = { income: 'Pemasukan', expense: 'Pengeluaran', transfer: 'Transfer' };

export default function TransactionDetail({ tx, accounts, open, onClose, onEdit, onDelete }) {
  const { projects } = useData();
  const { isDemo } = useDemo();
  if (!tx) return null;
  const accountName = (id) => accounts.find((a) => a.id === id)?.name || '-';
  const color = tx.type === 'income' ? 'text-income' : tx.type === 'transfer' ? 'text-transfer' : 'text-expense';
  const sign = tx.type === 'income' ? '+' : tx.type === 'transfer' ? '' : '-';
  const project = projectOfTransaction(tx, projects);

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Detail Transaksi"
      footer={
        project ? (
          <Link
            to={`${isDemo ? '/demo' : ''}/project/${project.id}`}
            onClick={onClose}
            className="btn-primary w-full block text-center"
          >
            Buka project
          </Link>
        ) : (
          <div className="flex gap-2">
            <button className="btn-secondary flex-1" onClick={() => onEdit(tx)}>Edit</button>
            <button className="btn-danger flex-1" onClick={() => onDelete(tx)}>Hapus</button>
          </div>
        )
      }
    >
      <div className="text-center mb-4">
        <div className="text-xs text-gray-500">{TYPE_LABEL[tx.type]}</div>
        <div className={`text-3xl font-extrabold mt-1 ${color}`}>
          {sign}{formatCurrency(tx.amount, false)}
        </div>
      </div>
      <dl className="space-y-3 text-sm">
        <div className="flex justify-between gap-4">
          <dt className="text-gray-500">Tanggal</dt>
          <dd className="font-medium text-right">{formatDate(tx.date)}</dd>
        </div>
        {tx.description && (
          <div className="flex justify-between gap-4">
            <dt className="text-gray-500">Keterangan</dt>
            <dd className="font-medium text-right">{tx.description}</dd>
          </div>
        )}
        {tx.fromAccount && (
          <div className="flex justify-between gap-4">
            <dt className="text-gray-500">Dari</dt>
            <dd className="font-medium text-right">{accountName(tx.fromAccount)}</dd>
          </div>
        )}
        {tx.toAccount && (
          <div className="flex justify-between gap-4">
            <dt className="text-gray-500">Ke</dt>
            <dd className="font-medium text-right">{accountName(tx.toAccount)}</dd>
          </div>
        )}
      </dl>
      {project && (
        <p className="mt-4 text-[13px] text-ink-soft leading-snug">
          Transaksi ini milik project {project.name}. Ubah atau batalkan dari halaman project.
        </p>
      )}
    </Modal>
  );
}
```

- [ ] **Step 5: Refuse it in DataContext too**

In `src/contexts/DataContext.jsx`, add `import { projectOfTransaction } from '../utils/projectMoney';` and a constant just above `deleteTransaction`:

```js
  // Defence in depth for the Transaksi page, which hides Edit and Hapus for
  // project money: see projectOfTransaction.
  const PROJECT_TX_MESSAGE = 'Transaksi ini milik project. Ubah atau batalkan dari halaman project.';
```

In `deleteTransaction`, right after `if (!tx) return;`, add:

```js
    if (projectOfTransaction(tx, projects)) throw new Error(PROJECT_TX_MESSAGE);
```

In `updateTransaction`, right after `if (!old) return;`, add:

```js
    if (projectOfTransaction(old, projects)) throw new Error(PROJECT_TX_MESSAGE);
```

- [ ] **Step 6: Check and commit**

Run: `npx vitest run` (all green), `npm run build` (exit 0).

```bash
git add src/utils/projectMoney.js src/utils/projectMoney.test.js src/components/Transactions/TransactionDetail.jsx src/contexts/DataContext.jsx
git commit -m "feat: project money is changed from the project, not the Transaksi page"
```

---

### Task 8: The existing money writers read the project fresh

**Files:** modify `src/contexts/DataContext.jsx`.

Tasks 4-7 already read inside a transaction. This task moves the four writers B2 left on `writeBatch` + React state onto `inProjectTransaction`, so none of them can start from a stale project (review finding M1). Behaviour is otherwise unchanged. It is the last task on purpose: if the review finds a problem with transactions, this commit can be reverted on its own.

- [ ] **Step 1: `recordReceipt`**

Replace the whole function with:

```js
  // One arrival of money: allocated across the tagihan it covers, oldest first,
  // and stored as a receipt that carries its own transaction.
  async function recordReceipt(projectId, { amount, date, account, startNo = null }) {
    const amt = Math.round(Number(amount) || 0);
    if (amt <= 0) throw new Error('Jumlah harus lebih dari 0');
    if (!account) throw new Error('Pilih rekening tujuan');
    const recvDate = date instanceof Date ? date : new Date();

    const count = await inProjectTransaction(projectId, (t, project, ref) => {
      const { allocations, leftover } = allocateReceipt(project, amt, startNo);
      if (!allocations.length) {
        throw new Error('Tidak ada tagihan yang masih terbuka untuk dibayar');
      }
      if (leftover > 0) {
        throw new Error(`Jumlah melebihi sisa tagihan sebesar ${formatCurrency(leftover)}`);
      }

      const accountId = creditMoneyIn(t, account, amt);

      const txRef = doc(collection(db, C('transactions')));
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
      const update = { payments: updatedPayments, receipts };
      if (allSettled && project.status === 'active') {
        update.status = 'completed';
        update.closedAt = Timestamp.fromDate(recvDate);
      }
      t.update(ref, update);
      return allocations.length;
    });
    toast(count > 1 ? `Pembayaran tercatat untuk ${count} tagihan` : 'Pembayaran tercatat');
  }
```

- [ ] **Step 2: `closeProjectAsDefault`**

Replace the whole function with:

```js
  async function closeProjectAsDefault(projectId, { recoveredAmount = 0, accountId, date } = {}) {
    const recv = Number(recoveredAmount) || 0;
    if (recv > 0 && !accountId) throw new Error('Pilih rekening tujuan untuk pengembalian');
    const closeDate = date instanceof Date ? date : new Date();

    const lossAmount = await inProjectTransaction(projectId, (t, project, ref) => {
      let recoveryTxId = null;
      if (recv > 0) {
        const creditedTo = creditMoneyIn(t, accountId, recv);
        const txRef = doc(collection(db, C('transactions')));
        recoveryTxId = txRef.id;
        t.set(txRef, {
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
      });
      return loss;
    });
    toast(lossAmount > 0 ? 'Project ditutup, kerugian dicatat' : 'Project ditutup (BEP)');
  }
```

- [ ] **Step 3: `settleProjectEarly`**

Replace the whole function (keep its comment above it) with:

```js
  async function settleProjectEarly(projectId, { accountId, amount, date } = {}) {
    const amt = Math.round(Number(amount) || 0);
    if (amt <= 0) throw new Error('Jumlah pelunasan harus lebih dari 0');
    if (!accountId) throw new Error('Pilih rekening tujuan');
    const settleDate = date instanceof Date ? date : new Date();
    const at = Timestamp.fromDate(settleDate);

    await inProjectTransaction(projectId, (t, project, ref) => {
      const creditedTo = creditMoneyIn(t, accountId, amt);
      const txRef = doc(collection(db, C('transactions')));

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
      });
    });
    toast('Project dilunasi lebih cepat');
  }
```

- [ ] **Step 4: `deleteProject`**

Replace the whole function (keep its comment above it) with:

```js
  async function deleteProject(id) {
    if (!projects.some((p) => p.id === id)) return;
    const clawedBack = await inProjectTransaction(id, async (t, project, ref) => {
      // Reads first (a transaction allows no read after a write): the recovery
      // transaction says which account the macet recovery landed in.
      const recoveryRef = project.finalRecoveryTransactionId
        ? doc(db, C('transactions'), project.finalRecoveryTransactionId)
        : null;
      const recoverySnap = recoveryRef ? await t.get(recoveryRef) : null;

      // One balance change per account, however many arrivals landed there.
      const deltas = new Map();
      const move = (accountId, amount) => {
        if (!accountId || !amount) return;
        deltas.set(accountId, (deltas.get(accountId) || 0) + amount);
      };

      // 1. Return the funding to the source account, delete its transaction.
      if (project.fundingTransactionId) {
        t.delete(doc(db, C('transactions'), project.fundingTransactionId));
      }
      move(project.sourceAccountId, Number(project.disbursedAmount) || 0);

      // 2. Claw back every arrival from the account it landed in. Walks
      // receipts, not rows: a tagihan paid several times has several.
      for (const r of project.receipts || []) {
        if (r?.transactionId) t.delete(doc(db, C('transactions'), r.transactionId));
        move(r?.accountId, -(Number(r?.amount) || 0));
      }

      // 3. Reverse any recovery booked when the project was closed as macet.
      if (recoveryRef) {
        t.delete(recoveryRef);
        const to = recoverySnap?.exists() ? recoverySnap.data().toAccount : null;
        move(to, -(Number(project.finalRecovery) || 0));
      }

      for (const [accountId, amount] of deltas) {
        if (amount !== 0) {
          t.update(doc(db, C('accounts'), accountId), {
            balance: increment(amount),
            updatedAt: serverTimestamp(),
          });
        }
      }
      t.delete(ref);
      return projectReceivedTotal(project);
    });
    toast(clawedBack > 0 ? 'Project dibatalkan, modal & return dikembalikan' : 'Project dibatalkan, modal dikembalikan');
  }
```

- [ ] **Step 5: Check and commit**

```bash
grep -n "projects.find" src/contexts/DataContext.jsx
```

Expected: only `updateProject` (schedule edits, which write no money) and nothing in the functions above.

Run: `npx vitest run` (all green), `npm run build` (exit 0), `npx eslint src/contexts/DataContext.jsx` (only the 2 problems already on `main`: `setLoading` in an effect, and the fast-refresh export warning).

```bash
git add src/contexts/DataContext.jsx
git commit -m "fix: money writers read the project inside a Firestore transaction"
```

---

### Task 9: Verify in the browser, on demo data

**Files:** none (verification only).

- [ ] **Step 1:** Start the dev server with `preview_start` (config `pusat-gadai-madiun`, port 5174), enter demo mode, and navigate by clicking (hash routing; typing a URL returns to the PIN screen). Demo data is shared with the live site's demo and reseeded daily.

- [ ] **Step 2: Walk the corrections**

1. Receive a payment on the active demo project that covers one tagihan and part of the next (the preview shows two months).
2. On the fully paid tagihan, tap **Edit →**. The sheet shows date, account, amount and "Menutup tagihan" for **both** months, with Edit / Pindah ke bulan lain / Batalkan.
3. **Edit** the amount down by 100.000 and save. The second tagihan's remainder grows by 100.000, Total Diterima drops by 100.000, the account balance drops by 100.000.
4. Open the partly paid tagihan's arrival line (it reads "… · sebagian dari …"). **Pindah ke bulan lain** to a later month: the preview shows where it lands; after saving, the months change, and Total Diterima and every balance stay exactly the same.
5. **Batalkan** an arrival: the tagihan it paid opens again, Total Diterima and the account balance drop by its amount, and its transaction is gone from the Transaksi page.
6. On a project completed by its payments, cancel or lower the last payment: the project reads **Aktif** again and Konfirmasi is back.
7. On the Transaksi page, open any project transaction: no Edit or Hapus, the note names the project, and **Buka project** opens it. An ordinary transaction still has Edit and Hapus.
8. On a project closed by pelunasan dipercepat, open an arrival: only Edit is offered, with the explanation. On a macet project there is no Konfirmasi and nothing opens.

- [ ] **Step 3: Confirm the trap is not live**

After every correction above, every tagihan that was paid before and was not touched must still read the same (Lunas stays Lunas). If one flips, a correction wrote a receipts array missing entries: stop and fix before going further.

- [ ] **Step 4: Report** what you exercised and what you saw. Do **not** merge to `main`.

---

## Deliberately left out of B3

- **Undoing a pelunasan dipercepat** (restoring the rows it dropped). Edit is allowed on those projects, Move and Cancel are not, and the sheet says so.
- **Corrections on macet projects.** Unchanged from today.
- **Gabung sisa ke bulan depan, Anggap lunas, the Kurang Bayar column and the migration.** Bagian B4.
- **The Pelunasan and Tutup Macet sheets resetting the typed amount when a snapshot arrives** (review Minor, same as `main`). Same keyed-form fix as `ReceiptSheet` when those sheets are next touched.
- **Crediting money paid ahead into a later month in the pelunasan suggestion** (review Minor, rare; the amount is editable).
- **Two devices creating two Kas accounts** (review M2): `resolveMoneyIn` still reads the accounts list from React state; a transaction cannot query.
- **Writers that do not touch project money** (`addTransaction`, `addProject`, `updateProject` and the like) stay on write batches.

## Notes for B4

- A tagihan closed by Gabung or Anggap lunas blocks corrections of the receipts on it through `receiptBlock` until the closure is reopened, so B4 must ship `reopenRemainder` together with those closures, and its closures must use kinds other than `waive` with reasons `legacy` / `settlement` (or teach `ownedBy` about them deliberately).
- The migration still has to treat a project that already stores receipts as unfinished: its `legacy-` receipts need `receiptId` on their transactions (corrections in B3 set it on the ones they touch), and its legacy shortfalls belong in the report.

## Execution

Same process as B2, in three groups: **Tasks 1-3** (pure, TDD), **Tasks 4-7** (wiring and screens), **Task 8** (transactions), each reviewed before the next; then Task 9 in the browser, then one independent review of the whole branch before asking Gde to merge.
