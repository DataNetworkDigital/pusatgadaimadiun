# Bagian 3: Bayar Sebagian Pokok Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Part of the principal paid before the pelunasan is recorded as money on the pelunasan, and the bagi hasil from a chosen month follow the principal that is left; the latest such payment can be undone.

**Architecture:** A pure `principalPayment.js` records each early principal payment as a step in `principalPayments[]` ({ id, at, amount, fromNo }) plus a normal receipt on the pelunasan row, and recomputes the untouched bagi hasil rows from `fromNo` on at `principalAmount − steps`. DataContext writes it (`recordPrincipalPayment`, `undoPrincipalPayment`) like any money writer. Corrections of a step's receipt are refused (undo it instead), and Koreksi modal computes bases through the steps.

**Tech Stack:** React 19, Vite 8, Firebase Firestore, Vitest 5. Spec: `docs/superpowers/specs/2026-09-28-koreksi-modal-batal-pelunasan-pokok-design.md` §5. Branch `feat/bayar-pokok`, cut from `feat/koreksi-modal` (Bagian 2).

---

## File Structure

| File | Change |
|---|---|
| `src/utils/principalPayment.js` | New: `principalPaidBefore`, `principalStepMonths`, `principalPaymentRules`, `defaultStepMonth`, `applyPrincipalPayment`, `principalUndoCheck`, `applyPrincipalPaymentUndo`, `stepBase`. |
| `src/utils/principalPayment.test.js` | New tests (including the receiptOps and capitalCorrection interplay). |
| `src/utils/receiptOps.js` | `receiptBlock` refuses a step's receipt. |
| `src/utils/capitalCorrection.js` | Interest bases go through the steps; Nilai Project must stay above the steps. |
| `src/contexts/DataContext.jsx` | `recordPrincipalPayment`, `undoPrincipalPayment`, exported. |
| `src/components/Projects/PrincipalPaymentSheet.jsx` | New sheet. |
| `src/components/Projects/ProjectDetail.jsx` | Button, "Pembayaran Pokok" list, undo dialog. |

### Task 1: Steps as data

**Files:**
- Create: `src/utils/principalPayment.js`, `src/utils/principalPayment.test.js`

- [ ] **Step 1: Write the failing tests**

Create `src/utils/principalPayment.test.js`:

```js
import { describe, it, expect } from 'vitest';
import {
  applyPrincipalPayment,
  applyPrincipalPaymentUndo,
  defaultStepMonth,
  principalPaymentRules,
  principalUndoCheck,
  stepBase,
} from './principalPayment';
import { rowRemaining } from './paymentStatus';

const due = (month) => new Date(2026, month, 5);
// Nilai 100jt at 5,5% for five months: four bagi hasil of 5,5jt and the pelunasan.
const project = (over = {}) => ({
  id: 'p1',
  name: 'Pak Budi',
  status: 'active',
  principalAmount: 100_000_000,
  disbursedAmount: 94_500_000,
  sourceAccountId: 'bca',
  payments: [
    ...[1, 2, 3, 4].map((no) => ({
      no, type: 'interest', dueDate: due(5 + no), expectedAmount: 5_500_000, ratePct: 5.5, receivedAmount: null,
    })),
    { no: 5, type: 'final', dueDate: due(10), expectedAmount: 100_000_000, ratePct: null, receivedAmount: null },
  ],
  receipts: [],
  ...over,
});
const receipt = (id, amount, allocations, date = due(6)) => ({
  id, amount, date, accountId: 'bca', transactionId: id, allocations,
});
// Bulan 1 and 2 paid.
const paidTwo = (over = {}) =>
  project({
    receipts: [
      receipt('r1', 5_500_000, [{ no: 1, amount: 5_500_000 }]),
      receipt('r2', 5_500_000, [{ no: 2, amount: 5_500_000 }], due(7)),
    ],
    ...over,
  });
const pay = (p, over = {}) =>
  applyPrincipalPayment(p, { amount: 20_000_000, at: due(7), accountId: 'bca', transactionId: 'pk1', fromNo: 3, ...over });
const row = (update, no) => update.payments.find((r) => r.no === no);
const merged = (p, update) => ({ ...p, ...update });

describe('principalPaymentRules', () => {
  it('offers the untouched bagi hasil months and the pelunasan left', () => {
    const rules = principalPaymentRules(paidTwo());
    expect(rules.ok).toBe(true);
    expect(rules.remaining).toBe(100_000_000);
    expect(rules.final.no).toBe(5);
    expect(rules.months.map((r) => r.no)).toEqual([3, 4]);
  });

  it.each([
    [{ status: 'completed' }, 'masih aktif'],
    [{ extensions: [{ id: 'e1' }] }, 'Mundur/Diperpanjang'],
  ])('refuses on %o', (over, words) => {
    const rules = principalPaymentRules(paidTwo(over));
    expect(rules.ok).toBe(false);
    expect(rules.why).toContain(words);
  });

  it('refuses while a tunggakan sits on the pelunasan', () => {
    const p = paidTwo();
    p.payments[3] = { ...p.payments[3], closure: { kind: 'carry', amount: 5_500_000, toNo: 5 } };
    expect(principalPaymentRules(p).why).toContain('tunggakan');
  });

  it('starts by default at the first open month due after the payment', () => {
    const { months } = principalPaymentRules(paidTwo());
    expect(defaultStepMonth(months, due(7))).toBe(3);
    expect(defaultStepMonth(months, new Date(2026, 8, 10))).toBe(4);
    expect(defaultStepMonth(months, due(11))).toBe(null);
  });
});

describe('applyPrincipalPayment', () => {
  it('lands the money on the pelunasan and lowers the later bagi hasil (Gde, 28 Sep 2026)', () => {
    // Kontrak 5 bulan; in bulan 2, 20% of the principal came back.
    const p = paidTwo();
    const { update, finalNo } = pay(p);
    expect(finalNo).toBe(5);
    expect(update.payments.map((r) => r.expectedAmount)).toEqual([5_500_000, 5_500_000, 4_400_000, 4_400_000, 100_000_000]);
    expect(rowRemaining(merged(p, update), row(update, 5))).toBe(80_000_000);
    expect(update.receipts.at(-1)).toEqual(receipt('pk1', 20_000_000, [{ no: 5, amount: 20_000_000 }], due(7)));
    expect(update.principalPayments).toEqual([{ id: 'pk1', at: due(7), amount: 20_000_000, fromNo: 3 }]);
  });

  it('can leave the bagi hasil as they are', () => {
    const { update } = pay(paidTwo(), { fromNo: null });
    expect(update.payments.map((r) => r.expectedAmount)).toEqual([5_500_000, 5_500_000, 5_500_000, 5_500_000, 100_000_000]);
    expect(update.principalPayments[0].fromNo).toBe(null);
  });

  it('stacks a second payment on the first', () => {
    const p = paidTwo();
    const first = merged(p, pay(p).update);
    const { update } = pay(first, { amount: 10_000_000, transactionId: 'pk2', fromNo: 4 });
    expect(update.payments.map((r) => r.expectedAmount)).toEqual([5_500_000, 5_500_000, 4_400_000, 3_850_000, 100_000_000]);
    expect(rowRemaining(merged(first, update), row(update, 5))).toBe(70_000_000);
  });

  it('keeps the rate an old row implies, and stores it', () => {
    const p = paidTwo({ principalAmount: 60_000_000 });
    p.payments = p.payments.map((r) =>
      r.type === 'interest' ? { ...r, expectedAmount: 3_000_000, ratePct: null } : { ...r, expectedAmount: 60_000_000 }
    );
    const { update } = pay(p, { amount: 10_000_000 });
    expect(row(update, 3)).toMatchObject({ expectedAmount: 2_500_000, ratePct: 5 });
  });

  it('refuses paying the whole pelunasan, or starting at a month already paid', () => {
    expect(() => pay(paidTwo(), { amount: 100_000_000 })).toThrow('Tutup: Pelunasan');
    expect(() => pay(paidTwo(), { fromNo: 2 })).toThrow('sudah dibayar atau ditutup');
  });
});

describe('undoing the latest principal payment', () => {
  it('puts the bagi hasil and the pelunasan back and gives the money back', () => {
    const p = paidTwo();
    const after = merged(p, pay(p).update);
    const { update, receipt: gone } = applyPrincipalPaymentUndo(after, 'pk1');
    expect(gone.id).toBe('pk1');
    expect(update.payments.map((r) => r.expectedAmount)).toEqual([5_500_000, 5_500_000, 5_500_000, 5_500_000, 100_000_000]);
    expect(update.receipts.map((r) => r.id)).toEqual(['r1', 'r2']);
    expect(update.principalPayments).toEqual([]);
  });

  it('is refused once a month it changed has been paid', () => {
    const p = paidTwo();
    const after = merged(p, pay(p).update);
    const touched = { ...after, receipts: [...after.receipts, receipt('r3', 4_400_000, [{ no: 3, amount: 4_400_000 }])] };
    expect(principalUndoCheck(touched).why).toContain('bulan 3');
    expect(() => applyPrincipalPaymentUndo(touched, 'pk1')).toThrow('bulan 3');
  });

  it('only undoes the latest one', () => {
    const p = paidTwo();
    const first = merged(p, pay(p).update);
    const second = merged(first, pay(first, { amount: 10_000_000, transactionId: 'pk2', fromNo: 4 }).update);
    expect(() => applyPrincipalPaymentUndo(second, 'pk1')).toThrow('terakhir');
    expect(applyPrincipalPaymentUndo(second, 'pk2').update.payments.map((r) => r.expectedAmount)).toEqual([
      5_500_000, 5_500_000, 4_400_000, 4_400_000, 100_000_000,
    ]);
  });

  it('names the principal each step leaves', () => {
    const p = paidTwo();
    const first = merged(p, pay(p).update);
    const second = merged(first, pay(first, { amount: 10_000_000, transactionId: 'pk2', fromNo: 4 }).update);
    expect(stepBase(second, 0)).toBe(80_000_000);
    expect(stepBase(second, 1)).toBe(70_000_000);
  });
});
```

- [ ] **Step 2: Run them to see them fail**

Run: `npx vitest run src/utils/principalPayment.test.js`
Expected: FAIL, the module does not exist.

- [ ] **Step 3: Implement**

Create `src/utils/principalPayment.js`:

```js
import { toDate } from './formatDate';
import { calcMonthlyInterest } from './projectSchedule';
import { rowCarriedIn, rowRemaining } from './paymentStatus';
import { normalizeProject } from './normalizeProject';
import { currentFinal } from './extension';
import { deriveRowFields } from './receiptOps';

/**
 * Pelunasan bertahap (spec 2026-09-28 §5): part of the principal paid before
 * the pelunasan. The money lands on the pelunasan, which then asks only for
 * the rest, and the bagi hasil from a chosen month follow the principal that
 * is left. Each payment is a step in `principalPayments` ({ id, at, amount,
 * fromNo }; `id` is its receipt's id); the latest one can be undone while the
 * months it changed are untouched. Decided as data; DataContext moves the
 * money and writes it.
 */

const stepsOf = (project) => project?.principalPayments || [];

/** Principal the steps took off before the bagi hasil of month `no`. */
export function principalPaidBefore(project, no, steps = stepsOf(project)) {
  return steps
    .filter((s) => s.fromNo != null && s.fromNo <= no)
    .reduce((sum, s) => sum + (Number(s.amount) || 0), 0);
}

const baseOf = (project, no, steps) => (Number(project?.principalAmount) || 0) - principalPaidBefore(project, no, steps);

/** The principal the bagi hasil follow from step `index`'s month on. */
export function stepBase(project, index) {
  const steps = stepsOf(project).slice(0, index + 1);
  const step = steps[index];
  if (!step) return 0;
  return step.fromNo == null
    ? (Number(project?.principalAmount) || 0) - steps.reduce((sum, s) => sum + (Number(s.amount) || 0), 0)
    : baseOf(project, step.fromNo, steps);
}

// Nothing has happened to the row yet: no money, no closure.
function untouched(project, row) {
  const paid = (project.receipts || []).some((r) => (r.allocations || []).some((a) => a.no === row.no));
  return !paid && !row.closure;
}

/** The bagi hasil months a step may start from: the untouched ones only untouched months follow. */
export function principalStepMonths(project) {
  const p = normalizeProject(project);
  const interest = (p.payments || [])
    .filter((r) => r.type === 'interest' && !r.leadCharge)
    .sort((a, b) => (Number(a.no) || 0) - (Number(b.no) || 0));
  let i = interest.length;
  while (i > 0 && untouched(p, interest[i - 1])) i -= 1;
  return interest.slice(i);
}

/** Whether a principal payment can be recorded now, the pelunasan it lands on, and what is left on it. */
export function principalPaymentRules(project) {
  const p = normalizeProject(project);
  const refuse = (why) => ({ ok: false, why, final: null, remaining: 0, months: [] });
  if (!p || p.status !== 'active' || p.settledEarly || p.rolledOverToProjectId) {
    return refuse('Pokok hanya bisa dibayar sebagian di project yang masih aktif.');
  }
  if ((p.extensions || []).length) {
    return refuse('Bayar sebagian pokok belum bisa di project yang sudah Mundur/Diperpanjang.');
  }
  const final = currentFinal(p);
  if (!final) return refuse('Project ini tidak punya pelunasan.');
  if (final.closure) return refuse('Pelunasan project ini sudah ditutup.');
  // Money on a pelunasan pays a tunggakan carried onto it first (see
  // settlementSuggestion), so it could not all count as principal.
  if (rowCarriedIn(p, final) > 0) {
    return refuse('Ada tunggakan yang digabung ke pelunasan. Bayar atau buka dulu tunggakannya.');
  }
  const remaining = rowRemaining(p, final);
  if (remaining <= 0) return refuse('Pelunasan sudah lunas.');
  return { ok: true, why: null, final, remaining, months: principalStepMonths(p) };
}

/** The month a step starts from by default: the first open one due after the payment, or none. */
export function defaultStepMonth(months, date) {
  const d = toDate(date);
  if (!d) return null;
  return months.find((r) => (toDate(r.dueDate)?.getTime() ?? 0) > d.getTime())?.no ?? null;
}

// Bagi hasil rows from `fromNo` on, at the base `steps` leave them. A row
// that never stored its rate keeps the one its amount implies, stored now so
// later changes stay exact.
function rebase(p, oldSteps, newSteps, fromNo) {
  if (fromNo == null) return p.payments || [];
  return (p.payments || []).map((row) => {
    if (row.type !== 'interest' || row.leadCharge || row.no < fromNo) return row;
    const oldBase = baseOf(p, row.no, oldSteps);
    const stored = Number(row.ratePct);
    const rate =
      row.ratePct != null && Number.isFinite(stored)
        ? stored
        : oldBase > 0
          ? ((Number(row.expectedAmount) || 0) * 100) / oldBase
          : 0;
    return { ...row, ratePct: rate, expectedAmount: calcMonthlyInterest(baseOf(p, row.no, newSteps), rate) };
  });
}

/**
 * @param at  the payment date in the shape stored.
 * @returns {{ update, finalNo }} update = { payments, receipts, principalPayments }
 */
export function applyPrincipalPayment(project, { amount, at, accountId, transactionId, fromNo }) {
  const p = normalizeProject(project);
  const rules = principalPaymentRules(p);
  if (!rules.ok) throw new Error(rules.why);
  const amt = Math.round(Number(amount) || 0);
  if (amt <= 0) throw new Error('Jumlah harus lebih dari 0');
  if (amt >= rules.remaining) throw new Error('Kalau pokoknya dibayar semua, pakai Tutup: Pelunasan.');
  if (!at) throw new Error('Tanggal wajib diisi');
  if (!accountId) throw new Error('Pilih rekening tujuan');
  if (!transactionId) throw new Error('Id pembayaran wajib ada');
  const from = fromNo == null || fromNo === '' ? null : Number(fromNo);
  if (from != null && !rules.months.some((r) => r.no === from)) {
    throw new Error(`Bagi hasil bulan ${from} sudah dibayar atau ditutup. Pilih bulan lain.`);
  }

  const oldSteps = stepsOf(p);
  const steps = [...oldSteps, { id: transactionId, at, amount: amt, fromNo: from }];
  const receipt = {
    id: transactionId,
    amount: amt,
    date: at,
    accountId,
    transactionId,
    allocations: [{ no: rules.final.no, amount: amt }],
  };
  // MUST spread the existing receipts: the reader trusts the stored array.
  const receipts = [...(p.receipts || []), receipt];
  const payments = deriveRowFields(rebase(p, oldSteps, steps, from), receipts);
  return { update: { payments, receipts, principalPayments: steps }, finalNo: rules.final.no };
}

/** Whether the latest step can be undone now. */
export function principalUndoCheck(project) {
  const p = normalizeProject(project);
  const steps = stepsOf(p);
  const step = steps[steps.length - 1] || null;
  const refuse = (why) => ({ ok: false, why, step, receipt: null });
  if (!step) return refuse('Belum ada pembayaran pokok.');
  if (p.status !== 'active' || p.settledEarly) {
    return refuse('Project ini sudah ditutup. Batalkan dulu pelunasannya.');
  }
  if ((p.extensions || []).length) return refuse('Batalkan dulu perpanjangannya.');
  const receipt = (p.receipts || []).find((r) => r.id === step.id) || null;
  if (!receipt) return refuse('Uang pembayaran pokok ini tidak ditemukan.');
  if (currentFinal(p)?.closure) return refuse('Pelunasan sudah ditutup. Buka dulu penutupnya.');
  if (step.fromNo != null) {
    const touched = (p.payments || [])
      .filter((r) => r.type === 'interest' && !r.leadCharge && r.no >= step.fromNo)
      .find((r) => !untouched(p, r));
    if (touched) {
      return refuse(
        `Bagi hasil bulan ${touched.no} sudah dibayar atau ditutup, jadi pembayaran pokok ini tidak bisa dibatalkan.`
      );
    }
  }
  return { ok: true, why: null, step, receipt };
}

/**
 * Undo the latest step, named by `stepId` so a stale screen cannot undo
 * another one. @returns {{ update, receipt }} `receipt` is the money to take back.
 */
export function applyPrincipalPaymentUndo(project, stepId) {
  const p = normalizeProject(project);
  const check = principalUndoCheck(p);
  if (check.step && check.step.id !== stepId) {
    throw new Error('Hanya pembayaran pokok yang terakhir yang bisa dibatalkan.');
  }
  if (!check.ok) throw new Error(check.why);
  const oldSteps = stepsOf(p);
  const steps = oldSteps.slice(0, -1);
  const receipts = (p.receipts || []).filter((r) => r.id !== check.step.id);
  const payments = deriveRowFields(rebase(p, oldSteps, steps, check.step.fromNo), receipts);
  return { update: { payments, receipts, principalPayments: steps }, receipt: check.receipt };
}
```

- [ ] **Step 4: Run the tests**

Run: `npx vitest run src/utils/principalPayment.test.js`
Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add src/utils/principalPayment.js src/utils/principalPayment.test.js
git commit -m "feat: an early principal payment lowers the later bagi hasil, and can be undone"
```

### Task 2: Corrections and Koreksi modal go through the steps

**Files:**
- Modify: `src/utils/receiptOps.js`, `src/utils/capitalCorrection.js`, `src/utils/principalPayment.test.js`

- [ ] **Step 1: Write the failing tests**

In `src/utils/principalPayment.test.js`, add to the imports:

```js
import { receiptBlock } from './receiptOps';
import { applyCapitalCorrection } from './capitalCorrection';
import { settlementSuggestion } from './settlement';
```

and append:

```js
describe('a principal payment elsewhere in the app', () => {
  const stepped = () => {
    const p = paidTwo();
    return merged(p, pay(p).update);
  };

  it('is not corrected piecemeal', () => {
    const p = stepped();
    expect(receiptBlock(p, p.receipts.find((r) => r.id === 'pk1'))).toContain('Batalkan bayar pokok');
    expect(receiptBlock(p, p.receipts.find((r) => r.id === 'r1'))).toBe(null);
  });

  it('keeps its effect through a Koreksi modal', () => {
    const p = stepped();
    const { update } = applyCapitalCorrection(p, {
      principalAmount: 110_000_000, disbursedAmount: 94_500_000, sourceAccountId: 'bca', at: due(8),
    });
    expect(update.payments.map((r) => r.expectedAmount)).toEqual([6_050_000, 6_050_000, 4_950_000, 4_950_000, 110_000_000]);
    expect(rowRemaining(merged(p, update), row(update, 5))).toBe(90_000_000);
    expect(() =>
      applyCapitalCorrection(p, { principalAmount: 20_000_000, disbursedAmount: 94_500_000, sourceAccountId: 'bca', at: due(8) })
    ).toThrow('pokok yang sudah dibayar');
  });

  it('is taken off the pelunasan dipercepat suggestion', () => {
    // Modal keluar 94,5jt + bagi hasil bulan ini 4,4jt − pokok 20jt yang sudah masuk.
    expect(settlementSuggestion(stepped(), due(7)).amount).toBe(78_900_000);
  });
});
```

- [ ] **Step 2: Run them to see them fail**

Run: `npx vitest run src/utils/principalPayment.test.js`
Expected: the first two tests fail (no block; bases ignore the step); the suggestion test passes already.

- [ ] **Step 3: Refuse corrections of a step's receipt**

In `src/utils/receiptOps.js`, at the start of `receiptBlock`, before `const nos = nosOf(receipt);`, insert:

```js
  // Bayar sebagian pokok is undone as a whole, never corrected piecemeal:
  // the bagi hasil it lowered would stay low.
  if ((project?.principalPayments || []).some((s) => s.id === receipt?.id)) {
    return 'Ini pembayaran sebagian pokok. Kalau salah, batalkan lewat Batalkan bayar pokok.';
  }
```

- [ ] **Step 4: Bases through the steps in Koreksi modal**

In `src/utils/capitalCorrection.js`:
- add the import `import { principalPaidBefore } from './principalPayment';`
- replace `correctedDue` with:

```js
// A row's tagihan once Nilai Project is corrected, on the base the principal
// payments leave it. A row that stores its rate is computed from it; an older
// row keeps its own rate by scaling.
function correctedDue(row, oldPrincipal, newPrincipal, paidBefore = 0) {
  if (row.type === 'final') return newPrincipal;
  const oldBase = oldPrincipal - paidBefore;
  const newBase = newPrincipal - paidBefore;
  const rate = Number(row.ratePct);
  if (row.ratePct != null && Number.isFinite(rate)) return calcMonthlyInterest(newBase, rate);
  if (!oldBase) return Number(row.expectedAmount) || 0;
  return Math.round(((Number(row.expectedAmount) || 0) * newBase) / oldBase);
}
```

- in `replay`, change `correctedDue(row, oldPrincipal, newPrincipal)` to:

```js
correctedDue(row, oldPrincipal, newPrincipal, principalPaidBefore(p, row.no))
```

- in `applyCapitalCorrection`, right after `if (!rules.principal.ok) throw new Error(rules.principal.why);` add:

```js
    const stepsPaid = (p.principalPayments || []).reduce((sum, s) => sum + (Number(s.amount) || 0), 0);
    if (newPrincipal <= stepsPaid) {
      throw new Error(`Nilai Project harus lebih besar dari pokok yang sudah dibayar (${formatCurrency(stepsPaid)}).`);
    }
```

- [ ] **Step 5: Run everything**

Run: `npx vitest run 2>&1 | tail -4`
Expected: all test files pass.

- [ ] **Step 6: Commit**

```bash
git add src/utils/receiptOps.js src/utils/capitalCorrection.js src/utils/principalPayment.test.js
git commit -m "feat: corrections and Koreksi modal respect early principal payments"
```

### Task 3: Writers

**Files:**
- Modify: `src/contexts/DataContext.jsx`

- [ ] **Step 1: Import**

After `import { applyCapitalCorrection } from '../utils/capitalCorrection';` add:

```js
import { applyPrincipalPayment, applyPrincipalPaymentUndo } from '../utils/principalPayment';
```

- [ ] **Step 2: Add the writers after `recordReceipt`**

Insert after the line `    return { receiptId: txRef.id, finalShort: !!outcome?.finalShort };` and its closing `  }`:

```js

  // Pelunasan bertahap (spec 2026-09-28 §5): part of the principal paid
  // early. The money lands on the pelunasan like any arrival of money, and
  // the bagi hasil from the chosen month follow the principal that is left.
  async function recordPrincipalPayment(projectId, { amount, date, account, fromNo = null, seenWriteId }) {
    const amt = Math.round(Number(amount) || 0);
    if (amt <= 0) throw new Error('Jumlah harus lebih dari 0');
    if (!account) throw new Error('Pilih rekening tujuan');
    const at = Timestamp.fromDate(date instanceof Date ? date : new Date());
    // Made before the transaction so a rerun can recognise its own payment.
    const txRef = doc(collection(db, C('transactions')));
    await inProjectTransaction(projectId, (t, project, ref, writeId) => {
      const target = resolveMoneyIn(account);
      const { update, finalNo } = applyPrincipalPayment(project, {
        amount: amt,
        at,
        accountId: target.id,
        transactionId: txRef.id,
        fromNo,
      });
      creditResolved(t, target, amt);
      t.set(txRef, {
        type: 'income',
        amount: amt,
        description: `Bayar sebagian pokok project: ${project.name}`,
        date: at,
        fromAccount: null,
        toAccount: target.id,
        debtId: null,
        projectId,
        paymentNo: finalNo,
        receiptId: txRef.id,
        createdAt: serverTimestamp(),
      });
      t.update(ref, { ...update, lastWriteId: writeId });
    }, { alreadyDone: (p) => (p.receipts || []).some((r) => r.id === txRef.id), seenWriteId });
    toast('Pembayaran pokok tercatat');
  }

  // Undo the latest early principal payment: its money leaves the account as
  // its transaction says now, and the bagi hasil it lowered go back.
  async function undoPrincipalPayment(projectId, { stepId, seenWriteId } = {}) {
    const outcome = await inProjectTransaction(projectId, async (t, project, ref, writeId) => {
      const { update, receipt } = applyPrincipalPaymentUndo(project, stepId);
      // Reads before writes.
      const txRef = receipt.transactionId ? doc(db, C('transactions'), receipt.transactionId) : null;
      const txSnap = txRef ? await t.get(txRef) : null;
      const tx = txSnap?.exists() ? txSnap.data() : null;
      const deltas = new Map();
      for (const [accountId, amount] of tx ? reversalOf(tx) : []) {
        if (accountId) deltas.set(accountId, (deltas.get(accountId) || 0) + amount);
      }
      const accountWrites = [];
      for (const [accountId, amount] of deltas) {
        if (!amount) continue;
        const accRef = doc(db, C('accounts'), accountId);
        const accSnap = await t.get(accRef);
        if (accSnap.exists()) accountWrites.push({ accRef, amount });
      }

      for (const { accRef, amount } of accountWrites) {
        t.update(accRef, { balance: increment(amount), updatedAt: serverTimestamp() });
      }
      if (tx) t.delete(txRef);
      t.update(ref, { ...update, lastWriteId: writeId });
      return { balanceMoved: accountWrites.length > 0 };
    }, {
      // Gone already: this call's own earlier attempt, or another device.
      alreadyDone: (p) => !(p.principalPayments || []).some((s) => s.id === stepId),
      seenWriteId,
    });
    toast(
      outcome && !outcome.balanceMoved
        ? 'Bayar pokok dibatalkan. Saldo tidak diubah karena transaksi atau rekeningnya sudah tidak ada'
        : 'Bayar pokok dibatalkan'
    );
  }
```

- [ ] **Step 3: Export them**

In `const value = {`, change `recordReceipt,` (in the `addProject, updateProject, correctCapital, recordReceipt,` line) to `recordReceipt, recordPrincipalPayment, undoPrincipalPayment,`.

- [ ] **Step 4: Build**

Run: `npx vite build 2>&1 | tail -1`
Expected: `✓ built in …`

- [ ] **Step 5: Commit**

```bash
git add src/contexts/DataContext.jsx
git commit -m "feat: writers for recording and undoing an early principal payment"
```

### Task 4: Screen

**Files:**
- Create: `src/components/Projects/PrincipalPaymentSheet.jsx`
- Modify: `src/components/Projects/ProjectDetail.jsx`

- [ ] **Step 1: Create the sheet**

```jsx
import { useMemo, useState } from 'react';
import Modal from '../common/Modal';
import CurrencyInput from '../common/CurrencyInput';
import DateField from '../common/DateField';
import { formatDate, formatDateInput, fromDateInput } from '../../utils/formatDate';
import { formatCurrency } from '../../utils/formatCurrency';
import { applyPrincipalPayment, defaultStepMonth, principalPaymentRules } from '../../utils/principalPayment';

// Money comes back to the account the modal left from by default, as in
// Terima pembayaran.
function defaultAccount(project, accounts) {
  const list = accounts || [];
  if (project.sourceAccountId && list.some((a) => a.id === project.sourceAccountId)) {
    return project.sourceAccountId;
  }
  return list[0]?.id || 'cash';
}

// Pelunasan bertahap (spec 2026-09-28 §5): part of the principal paid early.
// The owner sees the bagi hasil that change and what the pelunasan still asks
// before saving.
export default function PrincipalPaymentSheet({ open, onClose, project, accounts, onSubmit }) {
  if (!open || !project) return null;
  return <PrincipalForm key={project.id} onClose={onClose} project={project} accounts={accounts} onSubmit={onSubmit} />;
}

function PrincipalForm({ onClose, project, accounts, onSubmit }) {
  const rules = principalPaymentRules(project);
  const [amount, setAmount] = useState(0);
  const [account, setAccount] = useState(() => defaultAccount(project, accounts));
  const [date, setDate] = useState(() => formatDateInput(new Date()));
  const [fromNo, setFromNo] = useState(() => {
    const no = defaultStepMonth(rules.months, new Date());
    return no == null ? '' : String(no);
  });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const principal = Number(project.principalAmount) || 0;
  const pct = principal > 0 ? Math.round((Number(amount) / principal) * 1000) / 10 : 0;
  const preview = useMemo(() => {
    if (!(Number(amount) > 0)) return null;
    try {
      return applyPrincipalPayment(project, {
        amount,
        at: fromDateInput(date) || new Date(),
        accountId: 'preview',
        transactionId: 'preview',
        fromNo: fromNo === '' ? null : Number(fromNo),
      });
    } catch (e) {
      return { error: e.message };
    }
  }, [project, amount, date, fromNo]);
  const changed = (preview?.update?.payments || [])
    .map((r) => ({ row: r, before: (project.payments || []).find((b) => b.no === r.no) }))
    .filter(({ row, before }) => before && before.expectedAmount !== row.expectedAmount);

  async function submit() {
    setError('');
    setSubmitting(true);
    try {
      await onSubmit({
        amount: Number(amount),
        date: fromDateInput(date),
        account,
        fromNo: fromNo === '' ? null : Number(fromNo),
        seenWriteId: project.lastWriteId ?? null,
      });
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
      title="Bayar sebagian pokok"
      subtitle={project.name}
      footer={
        <button
          type="button"
          className="btn-primary w-full"
          disabled={submitting || !rules.ok || !preview || !!preview.error}
          onClick={submit}
        >
          {submitting ? 'Menyimpan…' : 'Simpan'}
        </button>
      }
    >
      {!rules.ok ? (
        <p className="text-[13px] text-ink-soft leading-snug">{rules.why}</p>
      ) : (
        <div className="space-y-4">
          <div className="bg-cream-deep rounded-xl p-3 text-[13px] text-ink-soft flex justify-between">
            <span>Sisa pelunasan sekarang</span>
            <span className="font-num font-semibold text-ink">{formatCurrency(rules.remaining)}</span>
          </div>
          <div>
            <label className="label-text">Jumlah pokok yang dibayar</label>
            <CurrencyInput value={amount} onChange={setAmount} />
            {Number(amount) > 0 && <p className="text-[12px] text-ink-mute mt-1">{pct}% dari nilai project</p>}
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
          <div>
            <label className="label-text">Bagi hasil ikut pokok baru mulai</label>
            <select className="input-field" value={fromNo} onChange={(e) => setFromNo(e.target.value)}>
              {rules.months.map((r) => (
                <option key={r.no} value={r.no}>
                  Bulan {r.no} · jatuh tempo {formatDate(r.dueDate, { short: true })}
                </option>
              ))}
              <option value="">Tidak ada (bagi hasil tetap)</option>
            </select>
          </div>
          {preview?.error && <p className="text-[13px] text-terra leading-snug">{preview.error}</p>}
          {preview?.update && (
            <div className="bg-cream-deep rounded-xl p-3 text-[13px] text-ink-soft space-y-1.5">
              {changed.map(({ row, before }) => (
                <div key={row.no} className="flex justify-between gap-2">
                  <span>Bagi hasil bulan {row.no}</span>
                  <span className="font-num text-ink">
                    {formatCurrency(before.expectedAmount)} → {formatCurrency(row.expectedAmount)}
                  </span>
                </div>
              ))}
              <div className="flex justify-between gap-2">
                <span>Pelunasan tinggal</span>
                <span className="font-num font-semibold text-ink">
                  {formatCurrency(rules.remaining - Number(amount))}
                </span>
              </div>
            </div>
          )}
          {error && <p className="text-[13px] text-terra">{error}</p>}
        </div>
      )}
    </Modal>
  );
}
```

- [ ] **Step 2: Wire the project page**

In `src/components/Projects/ProjectDetail.jsx`:
- after `import CapitalCorrectionSheet from './CapitalCorrectionSheet';` add:

```js
import PrincipalPaymentSheet from './PrincipalPaymentSheet';
```

- after `import { settlementUndoPreview } from '../../utils/settlement';` add:

```js
import { principalPaymentRules, principalUndoCheck, stepBase } from '../../utils/principalPayment';
import { currentFinal } from '../../utils/extension';
```

(if `currentFinal` is already imported from `../../utils/extension`, add it to that import instead);
- above `export default function ProjectDetail() {` add:

```js
// One line per early principal payment: when, how much, and what the bagi
// hasil follow afterwards.
function principalStepLabel(project, index) {
  const s = (project.principalPayments || [])[index];
  const head = `Pokok dibayar ${formatCurrency(s.amount)} pada ${formatDate(s.at)}.`;
  return s.fromNo == null
    ? `${head} Bagi hasil tetap.`
    : `${head} Bagi hasil mulai bulan ${s.fromNo} dari sisa pokok ${formatCurrency(stepBase(project, index))}.`;
}

// The confirmation for undoing the latest early principal payment.
function principalUndoMessage(project, check, accountName) {
  if (!check.ok) return check.why;
  const final = currentFinal(project);
  const pelunasan = (final ? rowRemaining(project, final) : 0) + (Number(check.step.amount) || 0);
  const months =
    check.step.fromNo == null ? '' : ` Bagi hasil mulai bulan ${check.step.fromNo} kembali seperti sebelumnya.`;
  return `Uang ${formatCurrency(check.step.amount)} ditarik lagi dari ${accountName(check.receipt.accountId)}.${months} Pelunasan kembali ditagih ${formatCurrency(pelunasan)}.`;
}
```

- add `recordPrincipalPayment, undoPrincipalPayment` to the `useData()` destructuring;
- after `const [correctingCapital, setCorrectingCapital] = useState(false);` add:

```js
  const [payingPrincipal, setPayingPrincipal] = useState(false);
  const [undoingPrincipal, setUndoingPrincipal] = useState(null); // a step id, or null
```

- after `const canUndoExtension = isActive && !!latestExtension && undoCheck(project).ok;` add:

```js
  const principalRules = principalPaymentRules(project);
  const principalSteps = project.principalPayments || [];
  const principalUndo = principalSteps.length ? principalUndoCheck(project) : { ok: false, why: '' };
```

- after the `{extensions.length > 0 && ( … )}` block (the "Perubahan Jadwal" section), add:

```jsx
      {principalSteps.length > 0 && (
        <>
          <SectionTitle>Pembayaran Pokok</SectionTitle>
          <Card className="mb-3.5 !px-4 !py-1">
            {principalSteps.map((s, i) => (
              <div key={s.id} className={`py-2.5 ${i < principalSteps.length - 1 ? 'border-b border-line-soft' : ''}`}>
                <div className="text-[13px] text-ink">{principalStepLabel(project, i)}</div>
                {i === principalSteps.length - 1 && principalUndo.ok && (
                  <button
                    type="button"
                    onClick={() => setUndoingPrincipal(s.id)}
                    className="mt-1 text-[12px] font-semibold text-terra active:opacity-70"
                  >
                    Batalkan bayar pokok
                  </button>
                )}
              </div>
            ))}
          </Card>
        </>
      )}
```

- in the active actions, right after the `{extOptions.mundur.ok && ( … )}` button, add:

```jsx
          {principalRules.ok && (
            <button
              type="button"
              onClick={() => setPayingPrincipal(true)}
              className="w-full py-3 rounded-xl bg-daun-soft text-daun font-semibold text-[14px] active:opacity-80"
            >
              Bayar sebagian pokok
            </button>
          )}
```

- after the `<CapitalCorrectionSheet … />` element, add:

```jsx
      <PrincipalPaymentSheet
        open={payingPrincipal}
        onClose={() => setPayingPrincipal(false)}
        project={project}
        accounts={accounts}
        onSubmit={(data) => recordPrincipalPayment(project.id, data)}
      />
      <ConfirmDialog
        open={undoingPrincipal !== null}
        onClose={() => setUndoingPrincipal(null)}
        onConfirm={async () => {
          try {
            await undoPrincipalPayment(project.id, {
              stepId: undoingPrincipal,
              seenWriteId: project.lastWriteId ?? null,
            });
          } catch (e) {
            showToast(e.message || 'Gagal membatalkan bayar pokok');
          }
        }}
        title="Batalkan bayar pokok?"
        message={principalUndoMessage(project, principalUndo, accountName)}
        confirmLabel="Ya, batalkan"
        confirmDisabled={!principalUndo.ok}
      />
```

- [ ] **Step 3: Build and lint**

Run: `npx vite build 2>&1 | tail -1 && npx eslint src/components/Projects/PrincipalPaymentSheet.jsx src/components/Projects/ProjectDetail.jsx src/utils/principalPayment.js`
Expected: build succeeds; the only lint errors are those `main` already has in ProjectDetail.

- [ ] **Step 4: Commit**

```bash
git add src/components/Projects/PrincipalPaymentSheet.jsx src/components/Projects/ProjectDetail.jsx
git commit -m "feat: Bayar sebagian pokok on the project page, with its list and undo"
```

### Task 5: Verify

- [ ] **Step 1: Full suite** — `npx vitest run 2>&1 | tail -4`, all pass.
- [ ] **Step 2: Demo run** (dev server, demo mode, Pak Budi: Nilai 10jt at 4,5%, bulan 1-2 paid, bulan 3-5 open at 450.000, pelunasan 10jt; BCA 15,75jt):
  1. "Bayar sebagian pokok": Rp 2.000.000 (20%), BCA, today, default month = bulan 3. The preview shows bagi hasil bulan 3-5 Rp 450.000 → Rp 360.000 and "Pelunasan tinggal Rp 8.000.000". Save.
  2. Bulan 3-5 show 360.000, the pelunasan shows Sisa 8.000.000, "Pembayaran Pokok" lists the payment with "sisa pokok Rp 8.000.000", BCA is Rp 17.750.000.
  3. Tutup: Pelunasan suggests 9.500.000 + 360.000 − 2.000.000 = Rp 7.860.000 (close the sheet without saving).
  4. The pelunasan payment's sheet (Uang masuk) shows the block "Ini pembayaran sebagian pokok…".
  5. "Batalkan bayar pokok": the dialog says Rp 2.000.000 leaves BCA, bulan 3 onward back, pelunasan Rp 10.000.000; confirm; everything is back (450.000 rows, pelunasan 10jt unpaid, BCA 15,75jt, the list gone).
  6. No console errors from the app.
- [ ] **Step 3: Restore the demo data** (mark `demo_config/settings.lastResetDate` stale and reload; Rp 27.100.000, 1 project aktif).
