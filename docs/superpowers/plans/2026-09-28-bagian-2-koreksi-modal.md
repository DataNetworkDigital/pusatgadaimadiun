# Bagian 2: Koreksi Modal Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Nilai Project, Modal Keluar and Rekening Sumber typed wrong can be corrected after money has arrived, with a preview of what changes.

**Architecture:** A pure `capitalCorrection.js` decides the correction: rules, every tagihan recomputed from the right Nilai Project, and the receipts replayed (old confirmations stay put, newer payments are allocated again from their first month). DataContext's `correctCapital` writes it inside `inProjectTransaction`, moving the funding transaction and balances. A `CapitalCorrectionSheet` on the project page shows the effect before saving.

**Tech Stack:** React 19, Vite 8, Firebase Firestore, Vitest 5. Spec: `docs/superpowers/specs/2026-09-28-koreksi-modal-batal-pelunasan-pokok-design.md` §4. Branch `feat/koreksi-modal`, cut from `feat/koreksi-batal` (Bagian 1) so it can be rebased onto `main` once Bagian 1 ships.

---

## File Structure

| File | Change |
|---|---|
| `src/utils/capitalCorrection.js` | New: `capitalCorrectionRules`, `applyCapitalCorrection`. |
| `src/utils/capitalCorrection.test.js` | New tests. |
| `src/utils/receiptOps.js` | Export `isLegacy`. |
| `src/contexts/DataContext.jsx` | New writer `correctCapital`, exported. |
| `src/components/Projects/CapitalCorrectionSheet.jsx` | New sheet. |
| `src/components/Projects/ProjectDetail.jsx` | Entry link + sheet. |
| `src/components/Projects/ProjectForm.jsx` | Lock note points to Koreksi modal. |

### Task 1: Rules

**Files:**
- Create: `src/utils/capitalCorrection.js`, `src/utils/capitalCorrection.test.js`
- Modify: `src/utils/receiptOps.js`

- [ ] **Step 1: Write the failing tests**

Create `src/utils/capitalCorrection.test.js`:

```js
import { describe, it, expect } from 'vitest';
import { applyCapitalCorrection, capitalCorrectionRules } from './capitalCorrection';
import { rowRemaining, rowState } from './paymentStatus';

const due = (month) => new Date(2026, month, 5);
// Three bagi hasil at 5,5% and the pelunasan, for a given Nilai Project.
const rowsAt = (principal) => [
  ...[1, 2, 3].map((no) => ({
    no,
    type: 'interest',
    dueDate: due(5 + no),
    expectedAmount: Math.round((principal * 5.5) / 100),
    ratePct: 5.5,
    receivedAmount: null,
  })),
  { no: 4, type: 'final', dueDate: due(9), expectedAmount: principal, ratePct: null, receivedAmount: null },
];
const project = (over = {}) => ({
  id: 'p1',
  name: 'Pak Budi',
  status: 'active',
  principalAmount: 100_000_000,
  disbursedAmount: 94_500_000,
  sourceAccountId: 'bca',
  payments: rowsAt(100_000_000),
  receipts: [],
  ...over,
});
const receipt = (id, amount, allocations) => ({
  id, amount, date: due(6), accountId: 'bca', transactionId: `tx-${id}`, allocations,
});
const correct = (p, over = {}) =>
  applyCapitalCorrection(p, {
    principalAmount: p.principalAmount,
    disbursedAmount: p.disbursedAmount,
    sourceAccountId: p.sourceAccountId,
    at: due(10),
    ...over,
  });
const row = (update, no) => update.payments.find((r) => r.no === no);

describe('capitalCorrectionRules', () => {
  it('allows everything on an ordinary project', () => {
    expect(capitalCorrectionRules(project())).toEqual({ ok: true, why: null, principal: { ok: true, why: null } });
  });

  it.each([
    [{ status: 'default' }, 'macet'],
    [{ rolledOverToProjectId: 'p2' }, 'kontrak baru'],
    [{ fundingMode: 'rollover' }, 'dialihkan'],
    [{ settledEarly: true, status: 'completed' }, 'Batalkan dulu pelunasannya'],
  ])('refuses the whole correction on %o', (over, words) => {
    const rules = capitalCorrectionRules(project(over));
    expect(rules.ok).toBe(false);
    expect(rules.why).toContain(words);
  });

  it('keeps Nilai Project locked while an extension or a closed month stands, but not the rest', () => {
    const extended = capitalCorrectionRules(project({ extensions: [{ id: 'e1' }] }));
    expect(extended.ok).toBe(true);
    expect(extended.principal.why).toContain('Mundur/Perpanjang');
    const p = project();
    p.payments[1] = { ...p.payments[1], closure: { kind: 'carry', amount: 5_500_000, toNo: 3 } };
    const carried = capitalCorrectionRules(p);
    expect(carried.ok).toBe(true);
    expect(carried.principal.why).toContain('Bulan 2');
  });

  it('lets an old shortfall stand, since the correction measures it again', () => {
    const p = project();
    p.payments[0] = { ...p.payments[0], closure: { kind: 'waive', amount: 500_000, reason: 'legacy' } };
    expect(capitalCorrectionRules(p).principal.ok).toBe(true);
  });
});
```

- [ ] **Step 2: Run them to see them fail**

Run: `npx vitest run src/utils/capitalCorrection.test.js`
Expected: FAIL, the module does not exist.

- [ ] **Step 3: Export `isLegacy` from receiptOps**

In `src/utils/receiptOps.js`, change `const isLegacy = (receipt) =>` to:

```js
export const isLegacy = (receipt) =>
```

- [ ] **Step 4: Create `src/utils/capitalCorrection.js` with the rules**

```js
import { allocateReceipt, openRows } from './allocation';
import { rowDue, rowRemaining, rowState } from './paymentStatus';
import { normalizeProject } from './normalizeProject';
import { statusChange } from './projectStatus';
import { calcMonthlyInterest } from './projectSchedule';
import { deriveRowFields, isLegacy } from './receiptOps';
import { formatCurrency } from './formatCurrency';
import { formatDate } from './formatDate';

/**
 * Koreksi modal (spec 2026-09-28 §4): Nilai Project, Modal Keluar or
 * Rekening Sumber typed wrong, corrected after money has arrived. Decided as
 * data; DataContext moves the money and writes it.
 *
 * A new Nilai Project corrects a typo, it does not change the contract:
 * every tagihan is recomputed as if the right value had been typed from the
 * start, the months already paid included. The money that arrived never
 * changes; where it lands is decided again, as it would have been.
 */

const refuseAll = (why) => ({ ok: false, why, principal: { ok: false, why } });

/** What this project lets the owner correct, and why not. */
export function capitalCorrectionRules(project) {
  const p = normalizeProject(project);
  if (!p) return refuseAll('Project tidak ditemukan.');
  if (p.status === 'default') return refuseAll('Project macet tidak bisa dikoreksi modalnya.');
  if (p.rolledOverToProjectId) {
    return refuseAll('Project ini sudah dilanjutkan ke kontrak baru, jadi modalnya tidak bisa dikoreksi.');
  }
  if (p.fundingMode === 'rollover') {
    return refuseAll('Modal kontrak lanjutan dialihkan dari project lama dan tidak bisa diubah.');
  }
  if (p.settledEarly) {
    return refuseAll('Project ini ditutup lewat pelunasan dipercepat. Batalkan dulu pelunasannya, lalu koreksi modal.');
  }
  // The schedule changes only with Nilai Project: Modal Keluar and the
  // account stay correctable whatever the schedule holds.
  const principalRefused = (why) => ({ ok: true, why: null, principal: { ok: false, why } });
  if ((p.extensions || []).length) {
    return principalRefused(
      'Jadwal sudah diubah lewat Mundur/Perpanjang. Batalkan dulu perpanjangannya untuk mengubah Nilai Project.'
    );
  }
  // A closure keeps the amount it closed; only an old shortfall is measured
  // again by the correction itself.
  const closed = (p.payments || []).find(
    (r) => r.closure && !(r.closure.kind === 'waive' && r.closure.reason === 'legacy')
  );
  if (closed) {
    return principalRefused(
      `Bulan ${closed.no} sudah digabung atau dianggap lunas. Buka lagi dulu untuk mengubah Nilai Project.`
    );
  }
  return { ok: true, why: null, principal: { ok: true, why: null } };
}
```

- [ ] **Step 5: Run the rule tests**

Run: `npx vitest run src/utils/capitalCorrection.test.js -t capitalCorrectionRules`
Expected: the `capitalCorrectionRules` tests pass.

- [ ] **Step 6: Commit**

```bash
git add src/utils/capitalCorrection.js src/utils/capitalCorrection.test.js src/utils/receiptOps.js
git commit -m "feat: rules for correcting a project's modal after payments"
```

### Task 2: The correction as data

**Files:**
- Modify: `src/utils/capitalCorrection.js`, `src/utils/capitalCorrection.test.js`

- [ ] **Step 1: Write the failing tests**

Append to `src/utils/capitalCorrection.test.js`:

```js
describe('applyCapitalCorrection', () => {
  it('changes nothing when nothing changes', () => {
    expect(correct(project()).update).toEqual({});
  });

  it('corrects Modal Keluar or the account without touching the schedule', () => {
    expect(correct(project(), { disbursedAmount: 90_000_000 }).update).toEqual({ disbursedAmount: 90_000_000 });
    expect(correct(project(), { sourceAccountId: 'bri' }).update).toEqual({ sourceAccountId: 'bri' });
  });

  it('recomputes every tagihan from the right Nilai Project, paid months included', () => {
    // Typed 110jt; the borrower paid the real 5,5jt twice, confirmed the old way.
    const p = project({
      principalAmount: 110_000_000,
      payments: rowsAt(110_000_000).map((r) =>
        r.no <= 2 ? { ...r, closure: { kind: 'waive', amount: 550_000, reason: 'legacy' } } : r
      ),
      receipts: [
        receipt('legacy-1', 5_500_000, [{ no: 1, amount: 5_500_000 }]),
        receipt('legacy-2', 5_500_000, [{ no: 2, amount: 5_500_000 }]),
      ],
    });
    const { update, rows } = correct(p, { principalAmount: 100_000_000 });
    expect(update.principalAmount).toBe(100_000_000);
    expect(update.payments.map((r) => r.expectedAmount)).toEqual([5_500_000, 5_500_000, 5_500_000, 100_000_000]);
    expect(row(update, 1).closure).toBeUndefined();
    expect(row(update, 2).closure).toBeUndefined();
    expect(update.receipts).toEqual(p.receipts);
    expect(rows.find((r) => r.no === 1)).toMatchObject({
      before: 6_050_000, after: 5_500_000, stateBefore: 'lunas', stateAfter: 'lunas',
    });
  });

  it('leaves an old overpayment on the month it was confirmed for', () => {
    const p = project({
      principalAmount: 40_000_000,
      payments: rowsAt(40_000_000),
      receipts: [receipt('legacy-3', 11_650_000, [{ no: 3, amount: 11_650_000 }])],
    });
    const { update } = correct(p, { principalAmount: 50_000_000 });
    expect(update.receipts[0].allocations).toEqual([{ no: 3, amount: 11_650_000 }]);
    const after = { ...p, ...update };
    expect(rowState(after, row(update, 3))).toBe('lunas');
    expect(rowRemaining(after, row(update, 4))).toBe(50_000_000);
  });

  it('measures an old shortfall again on the corrected tagihan', () => {
    const p = project({
      payments: rowsAt(100_000_000).map((r) =>
        r.no === 1 ? { ...r, closure: { kind: 'waive', amount: 1_500_000, reason: 'legacy' } } : r
      ),
      receipts: [receipt('legacy-1', 4_000_000, [{ no: 1, amount: 4_000_000 }])],
    });
    const { update } = correct(p, { principalAmount: 120_000_000 });
    expect(row(update, 1).closure).toEqual({ kind: 'waive', amount: 2_600_000, reason: 'legacy' });
  });

  it('shows a month paid under the new rules as Kurang once its tagihan grows', () => {
    const p = project({ receipts: [receipt('r1', 5_500_000, [{ no: 1, amount: 5_500_000 }])] });
    const { update, rows } = correct(p, { principalAmount: 120_000_000 });
    const after = { ...p, ...update };
    expect(rowRemaining(after, row(update, 1))).toBe(1_100_000);
    expect(rows.find((r) => r.no === 1)).toMatchObject({ stateBefore: 'lunas', stateAfter: 'kurang' });
  });

  it('puts an overpayment that spilled onto the next month back on its own month', () => {
    // Typed 100jt instead of 120jt: 6,6jt paid for bulan 1 spilled 1,1jt onto bulan 2.
    const p = project({
      receipts: [receipt('r1', 6_600_000, [{ no: 1, amount: 5_500_000 }, { no: 2, amount: 1_100_000 }])],
    });
    const { update, moved } = correct(p, { principalAmount: 120_000_000 });
    expect(update.receipts[0].allocations).toEqual([{ no: 1, amount: 6_600_000 }]);
    expect(moved).toEqual([{ receipt: update.receipts[0], allocations: [{ no: 1, amount: 6_600_000 }] }]);
    const after = { ...p, ...update };
    expect(rowState(after, row(update, 2))).toBe('belum');
  });

  it('refuses when a payment no longer fits the corrected tagihan', () => {
    const p = project({
      receipts: [
        receipt('r1', 116_500_000, [
          { no: 1, amount: 5_500_000 },
          { no: 2, amount: 5_500_000 },
          { no: 3, amount: 5_500_000 },
          { no: 4, amount: 100_000_000 },
        ]),
      ],
    });
    expect(() => correct(p, { principalAmount: 50_000_000 })).toThrow('tidak muat');
  });

  it('keeps the rate of an old row that never stored one', () => {
    const p = project({
      principalAmount: 60_000_000,
      payments: [
        { no: 1, type: 'interest', dueDate: due(6), expectedAmount: 3_000_000, ratePct: null, receivedAmount: null },
        { no: 2, type: 'final', dueDate: due(7), expectedAmount: 60_000_000, ratePct: null, receivedAmount: null },
      ],
      receipts: [receipt('legacy-1', 3_000_000, [{ no: 1, amount: 3_000_000 }])],
    });
    const { update } = correct(p, { principalAmount: 66_000_000 });
    expect(update.payments.map((r) => r.expectedAmount)).toEqual([3_300_000, 66_000_000]);
  });

  it('refuses a new Nilai Project while a month is closed, but still corrects Modal Keluar', () => {
    const p = project();
    p.payments[1] = { ...p.payments[1], closure: { kind: 'carry', amount: 5_500_000, toNo: 3 } };
    expect(() => correct(p, { principalAmount: 120_000_000 })).toThrow('Bulan 2');
    expect(correct(p, { disbursedAmount: 90_000_000 }).update).toEqual({ disbursedAmount: 90_000_000 });
  });

  it('opens a completed project again when a tagihan grows past what was paid', () => {
    const p = project({
      status: 'completed',
      closedAt: due(9),
      receipts: [
        receipt('r1', 5_500_000, [{ no: 1, amount: 5_500_000 }]),
        receipt('r2', 5_500_000, [{ no: 2, amount: 5_500_000 }]),
        receipt('r3', 5_500_000, [{ no: 3, amount: 5_500_000 }]),
        receipt('r4', 100_000_000, [{ no: 4, amount: 100_000_000 }]),
      ],
    });
    const { update } = correct(p, { principalAmount: 120_000_000 });
    expect(update).toMatchObject({ status: 'active', closedAt: null });
  });
});
```

- [ ] **Step 2: Run them to see them fail**

Run: `npx vitest run src/utils/capitalCorrection.test.js`
Expected: FAIL, `applyCapitalCorrection` is not exported.

- [ ] **Step 3: Implement**

Append to `src/utils/capitalCorrection.js`:

```js
// A row's tagihan once Nilai Project is corrected. A row that stores its rate
// is computed from it; an older row keeps its own rate by scaling.
function correctedDue(row, oldPrincipal, newPrincipal) {
  if (row.type === 'final') return newPrincipal;
  const rate = Number(row.ratePct);
  if (row.ratePct != null && Number.isFinite(rate)) return calcMonthlyInterest(newPrincipal, rate);
  if (!oldPrincipal) return Number(row.expectedAmount) || 0;
  return Math.round(((Number(row.expectedAmount) || 0) * newPrincipal) / oldPrincipal);
}

const monthsOf = (allocations) => (allocations || []).map((a) => a.no).join();

// Every tagihan at the corrected amount, and every arrival of money placed
// again in the order it was recorded.
function replay(p, oldPrincipal, newPrincipal) {
  let rows = (p.payments || []).map((row) => {
    const next = { ...row, expectedAmount: correctedDue(row, oldPrincipal, newPrincipal) };
    // Measured again below, once the payment that confirmed it is placed.
    if (next.closure?.kind === 'waive' && next.closure.reason === 'legacy') delete next.closure;
    return next;
  });
  const replayed = [];
  const moved = [];
  for (const receipt of p.receipts || []) {
    const firstNo = receipt.allocations?.[0]?.no;
    const amount = Math.round(Number(receipt.amount) || 0);
    if (isLegacy(receipt) || amount <= 0) {
      replayed.push(receipt);
      if (!isLegacy(receipt)) continue;
      // An old confirmation stays on the tagihan it was confirmed for,
      // whatever the amount, and a gap there is an old shortfall again.
      const state = { ...p, payments: rows, receipts: replayed };
      rows = rows.map((row) => {
        if (row.no !== firstNo) return row;
        const gap = rowRemaining(state, row);
        return gap > 0 ? { ...row, closure: { kind: 'waive', amount: gap, reason: 'legacy' } } : row;
      });
      continue;
    }
    // Any other payment is allocated again from the month it started at, or
    // from the next open one when earlier money now covers that month.
    const state = { ...p, payments: rows, receipts: replayed };
    const from = openRows(state).find((r) => r.no >= firstNo);
    const split = from ? allocateReceipt(state, amount, from.no) : { allocations: [], leftover: amount };
    if (!split.allocations.length || split.leftover > 0) {
      throw new Error(
        `Pembayaran ${formatCurrency(amount)} tanggal ${formatDate(receipt.date)} tidak muat di tagihan yang baru. Batalkan atau edit dulu pembayaran itu, lalu koreksi modal.`
      );
    }
    const next = { ...receipt, allocations: split.allocations };
    if (monthsOf(split.allocations) !== monthsOf(receipt.allocations)) {
      moved.push({ receipt: next, allocations: split.allocations });
    }
    replayed.push(next);
  }
  return { payments: deriveRowFields(rows, replayed), receipts: replayed, moved };
}

/**
 * @param at  when the correction is made, in the shape stored; it becomes
 *            closedAt if the correction completes the project.
 * @returns {{ update, rows, moved }}
 *   update: only the fields that change (empty when nothing does)
 *   rows:   [{ no, type, before, after, stateBefore, stateAfter }] for the preview
 *   moved:  [{ receipt, allocations }] receipts whose months changed, so
 *           their transactions can say so
 */
export function applyCapitalCorrection(project, { principalAmount, disbursedAmount, sourceAccountId, at }) {
  const p = normalizeProject(project);
  const rules = capitalCorrectionRules(p);
  if (!rules.ok) throw new Error(rules.why);
  const newPrincipal = Math.round(Number(principalAmount) || 0);
  const newDisbursed = Math.round(Number(disbursedAmount) || 0);
  if (newPrincipal <= 0) throw new Error('Nilai project harus lebih dari 0');
  if (newDisbursed <= 0) throw new Error('Modal keluar harus lebih dari 0');
  if (!sourceAccountId) throw new Error('Pilih rekening sumber');

  const oldPrincipal = Number(p.principalAmount) || 0;
  const update = {};
  if (newDisbursed !== (Number(p.disbursedAmount) || 0)) update.disbursedAmount = newDisbursed;
  if (sourceAccountId !== (p.sourceAccountId ?? null)) update.sourceAccountId = sourceAccountId;

  let moved = [];
  if (newPrincipal !== oldPrincipal) {
    if (!rules.principal.ok) throw new Error(rules.principal.why);
    const out = replay(p, oldPrincipal, newPrincipal);
    moved = out.moved;
    update.principalAmount = newPrincipal;
    update.payments = out.payments;
    update.receipts = out.receipts;
    Object.assign(update, statusChange(p, out.payments, out.receipts, at));
  }

  const after = { ...p, ...update };
  const rows = (p.payments || []).map((before) => {
    const now = (after.payments || []).find((r) => r.no === before.no) || before;
    return {
      no: before.no,
      type: before.type,
      before: rowDue(before),
      after: rowDue(now),
      stateBefore: rowState(p, before),
      stateAfter: rowState(after, now),
    };
  });
  return { update, rows, moved };
}
```

- [ ] **Step 4: Run the tests**

Run: `npx vitest run src/utils/capitalCorrection.test.js`
Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add src/utils/capitalCorrection.js src/utils/capitalCorrection.test.js
git commit -m "feat: correct Nilai Project by recomputing every tagihan and placing each payment again"
```

### Task 3: The writer

**Files:**
- Modify: `src/contexts/DataContext.jsx`

- [ ] **Step 1: Import**

After `import { applySettlement, applySettlementUndo } from '../utils/settlement';` add:

```js
import { applyCapitalCorrection } from '../utils/capitalCorrection';
```

- [ ] **Step 2: Add `correctCapital` right after `updateProject`**

Insert after the closing `}` of `updateProject` (the line after `if (saved) toast('Project tersimpan');`):

```js

  // Koreksi modal (spec 2026-09-28 §4): Nilai Project, Modal Keluar or
  // Rekening Sumber typed wrong, corrected after money has arrived. The
  // funding transaction says where the modal left from; it is reversed as it
  // stands and written again with the corrected amount and account.
  async function correctCapital(projectId, { principalAmount, disbursedAmount, sourceAccountId, seenWriteId } = {}) {
    const changed = await inProjectTransaction(projectId, async (t, project, ref, writeId) => {
      const { update, moved } = applyCapitalCorrection(project, {
        principalAmount,
        disbursedAmount,
        sourceAccountId,
        at: Timestamp.now(),
      });
      if (Object.keys(update).length === 0) return false;
      const moneyChanged = update.disbursedAmount !== undefined || update.sourceAccountId !== undefined;
      const newDisbursed = Math.round(Number(disbursedAmount) || 0);

      // Reads before writes.
      let fundingRef = null;
      let funding = null;
      if (moneyChanged) {
        fundingRef = project.fundingTransactionId ? doc(db, C('transactions'), project.fundingTransactionId) : null;
        const snap = fundingRef ? await t.get(fundingRef) : null;
        funding = snap?.exists() ? snap.data() : null;
        if (!funding) {
          throw new Error(
            'Transaksi pendanaan project ini tidak ditemukan, jadi modal keluar dan rekening sumber tidak bisa dikoreksi.'
          );
        }
      }
      const txWrites = [];
      for (const { receipt, allocations } of moved) {
        const txRef = receipt.transactionId ? doc(db, C('transactions'), receipt.transactionId) : null;
        const snap = txRef ? await t.get(txRef) : null;
        if (snap?.exists()) txWrites.push({ txRef, allocations });
      }
      const deltas = new Map();
      const add = (accountId, amount) => {
        if (accountId) deltas.set(accountId, (deltas.get(accountId) || 0) + amount);
      };
      if (moneyChanged) {
        for (const [accountId, amount] of reversalOf(funding)) add(accountId, amount);
        add(sourceAccountId, -newDisbursed);
      }
      const accountWrites = [];
      for (const [accountId, amount] of deltas) {
        if (!amount) continue;
        const accRef = doc(db, C('accounts'), accountId);
        const accSnap = await t.get(accRef);
        if (!accSnap.exists()) {
          // The modal cannot leave an account that is gone; an old account
          // deleted since simply cannot be given its money back.
          if (accountId === sourceAccountId) throw new Error('Rekening sumber tidak ditemukan.');
          continue;
        }
        accountWrites.push({ accRef, amount });
      }

      for (const { accRef, amount } of accountWrites) {
        t.update(accRef, { balance: increment(amount), updatedAt: serverTimestamp() });
      }
      if (moneyChanged) {
        t.update(fundingRef, { type: 'expense', amount: newDisbursed, fromAccount: sourceAccountId, toAccount: null });
      }
      for (const { txRef, allocations } of txWrites) {
        t.update(txRef, { paymentNo: allocations[0].no, description: receiptDescription(project, allocations) });
      }
      t.update(ref, { ...update, lastWriteId: writeId });
      return true;
    }, { seenWriteId });
    if (changed) toast('Modal dikoreksi');
  }
```

- [ ] **Step 3: Export it**

In `const value = {`, change `addProject, updateProject, recordReceipt,` to `addProject, updateProject, correctCapital, recordReceipt,`.

- [ ] **Step 4: Build**

Run: `npx vite build 2>&1 | tail -1`
Expected: `✓ built in …`

- [ ] **Step 5: Commit**

```bash
git add src/contexts/DataContext.jsx
git commit -m "feat: correctCapital writes a modal correction and moves the funding money"
```

### Task 4: The sheet

**Files:**
- Create: `src/components/Projects/CapitalCorrectionSheet.jsx`
- Modify: `src/components/Projects/ProjectDetail.jsx`, `src/components/Projects/ProjectForm.jsx`

- [ ] **Step 1: Create the sheet**

```jsx
import { useMemo, useState } from 'react';
import Modal from '../common/Modal';
import CurrencyInput from '../common/CurrencyInput';
import { formatCurrency } from '../../utils/formatCurrency';
import { calcMonthlyInterest, resolveTiers } from '../../utils/projectSchedule';
import { applyCapitalCorrection, capitalCorrectionRules } from '../../utils/capitalCorrection';

const STATE_LABEL = { lunas: 'Lunas', kurang: 'Kurang', belum: 'Belum dibayar' };

// What the correction does to balances, one line per account, as the writer
// does it from the funding transaction (which says what the project says).
function moneyMoves(project, disbursed, accountId) {
  const deltas = new Map();
  const add = (id, amount) => {
    if (id) deltas.set(id, (deltas.get(id) || 0) + amount);
  };
  add(project.sourceAccountId, Number(project.disbursedAmount) || 0);
  add(accountId, -(Number(disbursed) || 0));
  return [...deltas].filter(([, amount]) => amount !== 0).map(([id, amount]) => ({ accountId: id, amount }));
}

// Koreksi modal (spec 2026-09-28 §4): for a Nilai Project, Modal Keluar or
// Rekening Sumber typed wrong after money has arrived. The owner sees every
// month and balance that changes before saving.
export default function CapitalCorrectionSheet({ open, onClose, project, accounts, onSubmit }) {
  if (!open || !project) return null;
  return <CorrectionForm key={project.id} onClose={onClose} project={project} accounts={accounts} onSubmit={onSubmit} />;
}

function CorrectionForm({ onClose, project, accounts, onSubmit }) {
  const [principal, setPrincipal] = useState(Number(project.principalAmount) || 0);
  const [disbursed, setDisbursed] = useState(Number(project.disbursedAmount) || 0);
  const [accountId, setAccountId] = useState(project.sourceAccountId || '');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  // The version of the project the preview was made from; the save is
  // refused if the project has been written since.
  const seenWriteId = project.lastWriteId ?? null;

  const rules = capitalCorrectionRules(project);
  const { tier1 } = resolveTiers(project);
  const usual = Math.max(0, principal - calcMonthlyInterest(principal, tier1));
  const preview = useMemo(() => {
    try {
      return applyCapitalCorrection(project, {
        principalAmount: principal,
        disbursedAmount: disbursed,
        sourceAccountId: accountId,
        at: new Date(),
      });
    } catch (e) {
      return { error: e.message };
    }
  }, [project, principal, disbursed, accountId]);
  const changedRows = (preview.rows || []).filter((r) => r.before !== r.after || r.stateBefore !== r.stateAfter);
  const nothing = !preview.error && Object.keys(preview.update || {}).length === 0;
  const money = preview.error ? [] : moneyMoves(project, disbursed, accountId);
  const accountName = (id) => accounts?.find((a) => a.id === id)?.name || 'rekening lama';

  async function submit() {
    setError('');
    setSubmitting(true);
    try {
      await onSubmit({ principalAmount: principal, disbursedAmount: disbursed, sourceAccountId: accountId, seenWriteId });
      onClose();
    } catch (e) {
      setError(e.message || 'Gagal menyimpan');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      title="Koreksi modal"
      subtitle={project.name}
      footer={
        <button
          type="button"
          className="btn-primary w-full"
          disabled={submitting || !rules.ok || !!preview.error || nothing}
          onClick={submit}
        >
          {submitting ? 'Menyimpan…' : 'Simpan koreksi'}
        </button>
      }
    >
      {!rules.ok ? (
        <p className="text-[13px] text-ink-soft leading-snug">{rules.why}</p>
      ) : (
        <div className="space-y-4">
          <p className="text-[12px] text-ink-mute leading-snug">
            Untuk angka yang salah ketik. Uang yang sudah masuk tidak berubah. Tagihan dihitung ulang dari angka yang
            benar.
          </p>
          <div>
            <label className="label-text">Nilai Project (basis return)</label>
            <CurrencyInput value={principal} onChange={setPrincipal} disabled={!rules.principal.ok} />
            {!rules.principal.ok && <p className="text-[12px] text-ink-mute mt-1 leading-snug">{rules.principal.why}</p>}
          </div>
          <div>
            <label className="label-text">Modal Keluar dari Rekening</label>
            <CurrencyInput value={disbursed} onChange={setDisbursed} />
            <p className="text-[11px] text-ink-mute mt-1">
              Biasanya: Nilai project − bagi hasil bulan 1 = {formatCurrency(usual)}
            </p>
          </div>
          <div>
            <label className="label-text">Rekening Sumber</label>
            <select className="input-field" value={accountId} onChange={(e) => setAccountId(e.target.value)}>
              {!accounts?.some((a) => a.id === accountId) && <option value="">Pilih rekening</option>}
              {(accounts || []).map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </select>
          </div>
          {preview.error ? (
            <p className="text-[13px] text-terra leading-snug">{preview.error}</p>
          ) : (
            !nothing && (
              <div className="bg-cream-deep rounded-xl p-3 text-[13px] text-ink-soft space-y-1.5">
                <div className="text-[12px] font-semibold text-ink">Yang berubah</div>
                {changedRows.map((r) => (
                  <div key={r.no} className="flex justify-between gap-2">
                    <span>{r.type === 'final' ? 'Pelunasan' : `Bulan ${r.no}`}</span>
                    <span className="font-num text-ink text-right">
                      {formatCurrency(r.before)} → {formatCurrency(r.after)}
                      {r.stateBefore !== r.stateAfter ? `, jadi ${STATE_LABEL[r.stateAfter]}` : ''}
                    </span>
                  </div>
                ))}
                {money.map((m) => (
                  <div key={m.accountId} className="flex justify-between gap-2">
                    <span>Saldo {accountName(m.accountId)}</span>
                    <span className="font-num text-ink">
                      {m.amount > 0 ? '+' : '−'}
                      {formatCurrency(Math.abs(m.amount))}
                    </span>
                  </div>
                ))}
              </div>
            )
          )}
          {error && <p className="text-[13px] text-terra">{error}</p>}
        </div>
      )}
    </Modal>
  );
}
```

- [ ] **Step 2: The entry on the project page**

In `src/components/Projects/ProjectDetail.jsx`:
- import the sheet after `import ProjectForm from './ProjectForm';`:

```js
import CapitalCorrectionSheet from './CapitalCorrectionSheet';
```

- add `hasAnyReceipt` to the `../../utils/paymentStatus` import;
- add `correctCapital` to the `useData()` destructuring (after `updateProject`);
- after `const [undoingSettlement, setUndoingSettlement] = useState(false);` add:

```js
  const [correctingCapital, setCorrectingCapital] = useState(false);
```

- right after `const isRolloverProject = project.fundingMode === 'rollover';` add:

```js
  // Once money has arrived or a month is closed, Edit Project locks the
  // modal; typos are corrected through Koreksi modal instead.
  const capitalLocked = hasAnyReceipt(project) || (project.payments || []).some((r) => r.closure);
  const canCorrectCapital =
    capitalLocked && !isDefault && !isRolloverProject && !project.rolledOverToProjectId;
```


- right after the Detail `</Card>` (before `{project.proofUrl && (`), add:

```jsx
      {canCorrectCapital && (
        <button
          type="button"
          onClick={() => setCorrectingCapital(true)}
          className="flex items-center gap-2 w-full px-4 py-3 mb-3.5 bg-paper border border-line rounded-2xl text-[13px] text-indigo font-semibold active:bg-cream-deep"
        >
          <IcEdit size={16} sw={1.9} />
          <span className="flex-1 text-left">Salah ketik modal? Koreksi modal</span>
          <span>→</span>
        </button>
      )}
```

- after the `<ProjectForm key={`edit-${project.id}`} … />` element, add:

```jsx
      <CapitalCorrectionSheet
        open={correctingCapital}
        onClose={() => setCorrectingCapital(false)}
        project={project}
        accounts={accounts}
        onSubmit={(data) => correctCapital(project.id, data)}
      />
```

- [ ] **Step 3: The lock note in Edit Project**

In `src/components/Projects/ProjectForm.jsx`, replace the text of the `capitalLocked && !scheduleLocked` note with:

```jsx
            ⚠️ Sudah ada pembayaran masuk atau tagihan yang ditutup. Nilai project, modal keluar, dan rekening sumber dibetulkan lewat tombol Koreksi modal di halaman project. Tanggal mulai tidak bisa diubah. Durasi, return %, dan tanggal pembayaran masih bisa disesuaikan (jadwal pembayaran yang belum diterima akan dihitung ulang).
```

- [ ] **Step 4: Build and lint**

Run: `npx vite build 2>&1 | tail -1 && npx eslint src/components/Projects/CapitalCorrectionSheet.jsx src/components/Projects/ProjectDetail.jsx src/components/Projects/ProjectForm.jsx src/utils/capitalCorrection.js`
Expected: build succeeds; the only lint errors are the ones `main` already has in ProjectDetail/ProjectForm.

- [ ] **Step 5: Commit**

```bash
git add src/components/Projects/CapitalCorrectionSheet.jsx src/components/Projects/ProjectDetail.jsx src/components/Projects/ProjectForm.jsx
git commit -m "feat: Koreksi modal sheet with a preview on the project page"
```

### Task 5: Verify

- [ ] **Step 1: Full suite** — `npx vitest run 2>&1 | tail -4`, all pass.
- [ ] **Step 2: Demo run** (dev server, demo mode, Pak Budi: Nilai 10jt, Modal 9,5jt, 4,5%, two old confirmations, BCA 15,75jt):
  1. The link "Salah ketik modal? Koreksi modal" shows on Pak Budi.
  2. Nilai 10jt → 12jt: the preview lists bulan 1-5 Rp 450.000 → Rp 540.000 and Pelunasan Rp 10.000.000 → Rp 12.000.000, no state changes (old confirmations stay Lunas). Save: the rows show the new amounts, bulan 1-2 still Lunas.
  3. Modal Keluar 9,5jt → 9jt: the preview shows "Saldo BCA +Rp 500.000"; save; BCA is Rp 16.250.000 and the funding transaction says 9.000.000.
  4. Pay Rp 600.000 for bulan 3 (tagihan 540.000): 60.000 spills onto bulan 4. Correct Nilai back to 10jt: bulan 3 Rp 450.000 is Lunas, the 600.000 now covers bulan 3 and 150.000 of bulan 4; its transaction description says "(bln 3, 4)".
  5. Rekening Sumber BCA → BRI with Modal 9jt: BCA +9jt, BRI −9jt in the preview; save; balances match.
  6. No console errors from the app.
- [ ] **Step 3: Restore the demo data** (mark `demo_config/settings.lastResetDate` stale and reload; Rp 27.100.000, 1 project aktif).
