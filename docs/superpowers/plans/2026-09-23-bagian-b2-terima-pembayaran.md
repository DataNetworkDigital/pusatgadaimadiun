# Bagian B2 — Terima Pembayaran Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let one tagihan be paid several times, show what is still short, and allow the money to arrive as cash.

**Architecture:** Money stops being a field on a schedule row and becomes a `receipt`: one arrival, one transaction, allocated across the tagihan it covers, oldest first. `allocation.js` decides the split as a pure function. `recordReceipt` in `DataContext` writes the receipt, its transaction, and the account balance in one batch. The screens already read through the shared rule from Bagian B1, so they only need to gain the new signals: a "Kurang Rp X" pill, the list of arrivals under each tagihan, and a Tunai option.

**Tech Stack:** React 19, Vite 8, Firebase Firestore, Vitest (106 tests currently green).

**Spec:** `docs/superpowers/specs/2026-09-22-pembayaran-jadwal-download-design.md`, section 6.

**Branch:** `feat/b2-terima-pembayaran`, cut from `main` (at `4bf075d`). Do **not** push to `main`: every push deploys the live app.

---

## The trap in this stage, and a scope decision

**The trap.** `rowReceived` reads from `project.receipts` as soon as that array exists, and falls back to the stored `receivedAmount` only when it does not. Bagian B1 derives receipts on read, so React state always has them, but **stored documents still have none**. The moment `recordReceipt` writes a `receipts` array containing only the new arrival, every payment confirmed before this feature existed would read as unpaid, because the reader has switched branches and those rows have no allocation. Money the owner actually received would vanish from every screen at once.

The fix is in Task 3 and is not optional: write `[...project.receipts, newReceipt]`, never `[newReceipt]`. `project.receipts` already holds the entries derived from the legacy rows, so writing the whole array is what persists them. The production audit on 23 Sep found 122 confirmed rows across 51 projects, so this would be a large, silent loss.

**Scope decision, deliberately different from the original split.** The original plan put Edit in Bagian B3. But once a row can hold a receipt, today's `updateProjectPayment` would change `receivedAmount` without touching `receipts`, leaving the two out of step. Shipping partial payments while removing the ability to fix a typo is worse than today. So B2 keeps Edit working for the ordinary case — a row paid by exactly one receipt — by making that function receipt-aware (Task 4). Rows the owner has deliberately split across several arrivals show no Edit button and say so; per-receipt editing, moving a payment to another month, and cancelling one all remain in Bagian B3.

---

## File Structure

| File | Responsibility |
|---|---|
| `src/utils/allocation.js` (create) | Decides how one arrival of money is split across open tagihan. Pure. |
| `src/utils/cashAccount.js` (create) | Finds the existing Kas account among the owner's accounts. Pure. |
| `src/utils/allocation.test.js`, `cashAccount.test.js` (create) | Unit tests for both. |
| `src/contexts/DataContext.jsx` (modify) | `recordReceipt` (new), `updateProjectPayment` (receipt-aware), `recordProjectPayment` (deleted). |
| `src/components/Projects/ReceiptSheet.jsx` (create) | The money-in sheet: amount, Tunai or an account, date, which tagihan, live preview of the split. |
| `src/components/Projects/ProjectDetail.jsx` (modify) | "Kurang Rp X" pill, the arrivals listed under each tagihan, wiring the new sheet. |
| `src/components/Projects/ProjectCard.jsx` (modify) | "Kurang Rp X" badge. |
| `src/utils/projectExport.js` (modify) | Daftar Tagihan says "Kurang" for a partly paid tagihan. |
| `src/utils/demoSeedData.js` (modify) | One demo project that is partly paid, so the feature is visible in demo. |

---

### Task 1: How one arrival of money is split

**Files:** create `src/utils/allocation.js`, `src/utils/allocation.test.js`.

- [ ] **Step 1: Write the failing test**

```js
import { describe, it, expect } from 'vitest';
import { openRows, allocateReceipt } from './allocation';

const project = (rows, receipts) => (receipts ? { payments: rows, receipts } : { payments: rows });
const row = (no, amount, due) => ({ no, expectedAmount: amount, dueDate: due, type: 'interest' });

const threeMonths = () => [
  row(1, 5_500_000, new Date(2026, 7, 5)),
  row(2, 5_500_000, new Date(2026, 8, 5)),
  row(3, 5_500_000, new Date(2026, 9, 5)),
];

describe('openRows', () => {
  it('lists only rows that still owe something, oldest first', () => {
    const rows = threeMonths();
    const p = project(rows, [
      { id: 'a', amount: 5_500_000, allocations: [{ no: 1, amount: 5_500_000 }] },
    ]);
    expect(openRows(p).map((r) => r.no)).toEqual([2, 3]);
  });

  it('orders by due date, not by the order rows happen to sit in', () => {
    const rows = [row(3, 1_000_000, new Date(2026, 9, 5)), row(1, 1_000_000, new Date(2026, 7, 5))];
    expect(openRows(project(rows)).map((r) => r.no)).toEqual([1, 3]);
  });

  it('breaks a tie on the same due date by number', () => {
    const d = new Date(2026, 7, 5);
    const rows = [row(2, 1_000_000, d), row(1, 1_000_000, d)];
    expect(openRows(project(rows)).map((r) => r.no)).toEqual([1, 2]);
  });
});

describe('allocateReceipt', () => {
  it('fills the oldest open tagihan first', () => {
    const p = project(threeMonths());
    expect(allocateReceipt(p, 3_000_000)).toEqual({
      allocations: [{ no: 1, amount: 3_000_000 }],
      leftover: 0,
    });
  });

  it('spills into the next tagihan when more arrives than one owes', () => {
    const p = project(threeMonths());
    expect(allocateReceipt(p, 7_000_000)).toEqual({
      allocations: [{ no: 1, amount: 5_500_000 }, { no: 2, amount: 1_500_000 }],
      leftover: 0,
    });
  });

  it('only fills what is still short on a partly paid tagihan', () => {
    const p = project(threeMonths(), [
      { id: 'a', amount: 3_000_000, allocations: [{ no: 1, amount: 3_000_000 }] },
    ]);
    expect(allocateReceipt(p, 2_500_000)).toEqual({
      allocations: [{ no: 1, amount: 2_500_000 }],
      leftover: 0,
    });
  });

  it('starts at the chosen tagihan and never pays an earlier one', () => {
    const p = project(threeMonths());
    expect(allocateReceipt(p, 6_000_000, 2)).toEqual({
      allocations: [{ no: 2, amount: 5_500_000 }, { no: 3, amount: 500_000 }],
      leftover: 0,
    });
  });

  it('reports what is left over when more arrives than the whole project owes', () => {
    const p = project([row(1, 5_500_000, new Date(2026, 7, 5))]);
    expect(allocateReceipt(p, 9_000_000)).toEqual({
      allocations: [{ no: 1, amount: 5_500_000 }],
      leftover: 3_500_000,
    });
  });

  it('allocates nothing when no tagihan is open', () => {
    const p = project(threeMonths(), [
      { id: 'a', amount: 16_500_000, allocations: [
        { no: 1, amount: 5_500_000 }, { no: 2, amount: 5_500_000 }, { no: 3, amount: 5_500_000 },
      ] },
    ]);
    expect(allocateReceipt(p, 1_000_000)).toEqual({ allocations: [], leftover: 1_000_000 });
  });

  it('allocates nothing for an amount of zero or less', () => {
    const p = project(threeMonths());
    expect(allocateReceipt(p, 0)).toEqual({ allocations: [], leftover: 0 });
    expect(allocateReceipt(p, -5)).toEqual({ allocations: [], leftover: 0 });
  });

  it('reports the whole amount as leftover when the chosen tagihan is not open', () => {
    const p = project(threeMonths(), [
      { id: 'a', amount: 5_500_000, allocations: [{ no: 1, amount: 5_500_000 }] },
    ]);
    expect(allocateReceipt(p, 1_000_000, 1)).toEqual({ allocations: [], leftover: 1_000_000 });
  });

  it('rounds to whole rupiah so no fraction of a cent is ever stored', () => {
    const p = project(threeMonths());
    expect(allocateReceipt(p, 1_000_000.4).allocations).toEqual([{ no: 1, amount: 1_000_000 }]);
  });
});
```

- [ ] **Step 2: Run the test and watch it fail**

Run: `npm test`
Expected: FAIL — cannot resolve `./allocation`.

- [ ] **Step 3: Write the module**

Create `src/utils/allocation.js`:

```js
import { rowRemaining } from './paymentStatus';
import { toDate } from './formatDate';

/**
 * Splits one arrival of money across the tagihan it covers.
 *
 * The owner's rule: money pays off the oldest thing still owed first, and
 * anything above that rolls onto the next month. That is what makes "he paid
 * double this month" work without the owner doing any arithmetic.
 *
 * Pure: it decides the split and nothing else. Writing it down is DataContext's
 * job.
 */

export function openRows(project) {
  return (project?.payments || [])
    .filter((row) => rowRemaining(project, row) > 0)
    .sort((a, b) => {
      const da = toDate(a?.dueDate)?.getTime() ?? 0;
      const db = toDate(b?.dueDate)?.getTime() ?? 0;
      if (da !== db) return da - db;
      return (Number(a?.no) || 0) - (Number(b?.no) || 0);
    });
}

/**
 * @param startNo  when given, the split starts at that tagihan and never pays
 *                 an earlier one. The owner picks this when the payment is
 *                 explicitly for a particular month.
 * @returns { allocations: [{ no, amount }], leftover }
 *          `leftover` above zero means the caller must refuse the payment:
 *          more money arrived than this project still owes.
 */
export function allocateReceipt(project, amount, startNo = null) {
  let left = Math.round(Number(amount) || 0);
  if (left <= 0) return { allocations: [], leftover: 0 };

  const rows = openRows(project);
  const startIdx = startNo == null ? 0 : rows.findIndex((r) => r.no === startNo);
  if (startIdx < 0) return { allocations: [], leftover: left };

  const allocations = [];
  for (const row of rows.slice(startIdx)) {
    if (left <= 0) break;
    const take = Math.min(left, rowRemaining(project, row));
    if (take > 0) {
      allocations.push({ no: row.no, amount: take });
      left -= take;
    }
  }
  return { allocations, leftover: left };
}
```

- [ ] **Step 4: Run the tests** — `npm test` → PASS.

- [ ] **Step 5: Commit**

```bash
git add src/utils/allocation.js src/utils/allocation.test.js
git commit -m "feat: split one arrival of money across open tagihan"
```

---

### Task 2: Finding the Kas account

**Files:** create `src/utils/cashAccount.js`, `src/utils/cashAccount.test.js`.

- [ ] **Step 1: Write the failing test**

```js
import { describe, it, expect } from 'vitest';
import { findCashAccount, CASH_ACCOUNT_NAME } from './cashAccount';

describe('findCashAccount', () => {
  it('prefers an account explicitly marked as cash', () => {
    const accounts = [{ id: 'a', name: 'BCA' }, { id: 'b', name: 'Dompet', kind: 'cash' }];
    expect(findCashAccount(accounts).id).toBe('b');
  });

  it('falls back to the usual names, ignoring case and spacing', () => {
    expect(findCashAccount([{ id: 'x', name: 'Kas/Tunai' }]).id).toBe('x');
    expect(findCashAccount([{ id: 'x', name: ' kas ' }]).id).toBe('x');
    expect(findCashAccount([{ id: 'x', name: 'TUNAI' }]).id).toBe('x');
  });

  it('does not mistake another account for the cash one', () => {
    expect(findCashAccount([{ id: 'a', name: 'BCA' }, { id: 'b', name: 'Kaspro' }])).toBe(null);
  });

  it('survives an empty or missing list', () => {
    expect(findCashAccount([])).toBe(null);
    expect(findCashAccount(null)).toBe(null);
  });

  it('exposes the name used when one has to be created', () => {
    expect(CASH_ACCOUNT_NAME).toBe('Kas/Tunai');
  });
});
```

- [ ] **Step 2: Run the test and watch it fail** — `npm test` → cannot resolve `./cashAccount`.

- [ ] **Step 3: Write the module**

Create `src/utils/cashAccount.js`:

```js
/**
 * Cash the owner receives by hand is still money he holds, so it belongs in an
 * account like any other — otherwise the dashboard total would be smaller than
 * what is actually in his pocket. This finds the account that represents it.
 *
 * `Kas/Tunai` is one of the preset names in AccountForm, so most owners already
 * have one; the alternatives are here because people rename things.
 */
export const CASH_ACCOUNT_NAME = 'Kas/Tunai';

const CASH_NAMES = new Set(['kas/tunai', 'kas', 'tunai']);

export function findCashAccount(accounts) {
  const list = Array.isArray(accounts) ? accounts : [];
  return (
    list.find((a) => a?.kind === 'cash') ||
    list.find((a) => CASH_NAMES.has(String(a?.name || '').trim().toLowerCase())) ||
    null
  );
}
```

- [ ] **Step 4: Run the tests** — `npm test` → PASS.

- [ ] **Step 5: Commit**

```bash
git add src/utils/cashAccount.js src/utils/cashAccount.test.js
git commit -m "feat: find the account that holds cash on hand"
```

---

### Task 3: Recording an arrival of money

**Files:** modify `src/contexts/DataContext.jsx`.

- [ ] **Step 1: Add the imports**

Alongside the existing `../utils/` imports:

```js
import { allocateReceipt } from '../utils/allocation';
import { findCashAccount, CASH_ACCOUNT_NAME } from '../utils/cashAccount';
import { formatCurrency } from '../utils/formatCurrency';
```

- [ ] **Step 2: Replace `recordProjectPayment` with `recordReceipt`**

Delete the whole `recordProjectPayment` function and put this in its place:

```js
  // One arrival of money: allocated across the tagihan it covers, oldest first,
  // and stored as a receipt that carries its own transaction.
  async function recordReceipt(projectId, { amount, date, account, startNo = null }) {
    const project = projects.find((p) => p.id === projectId);
    if (!project) throw new Error('Project tidak ditemukan');
    const amt = Math.round(Number(amount) || 0);
    if (amt <= 0) throw new Error('Jumlah harus lebih dari 0');
    if (!account) throw new Error('Pilih rekening tujuan');

    const { allocations, leftover } = allocateReceipt(project, amt, startNo);
    if (!allocations.length) {
      throw new Error('Tidak ada tagihan yang masih terbuka untuk dibayar');
    }
    if (leftover > 0) {
      throw new Error(`Jumlah melebihi sisa tagihan sebesar ${formatCurrency(leftover)}`);
    }

    const recvDate = date instanceof Date ? date : new Date();
    const batch = writeBatch(db);

    // 'cash' means Tunai. Use the Kas account when the owner has one, otherwise
    // create it here, so cash on hand still counts in the dashboard total.
    let accountId = account;
    if (account === 'cash') {
      const existing = findCashAccount(accounts);
      if (existing) {
        accountId = existing.id;
        batch.update(doc(db, C('accounts'), accountId), {
          balance: increment(amt),
          updatedAt: serverTimestamp(),
        });
      } else {
        const accRef = doc(collection(db, C('accounts')));
        accountId = accRef.id;
        batch.set(accRef, {
          name: CASH_ACCOUNT_NAME,
          accountNumber: '',
          kind: 'cash',
          balance: amt,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      }
    } else {
      batch.update(doc(db, C('accounts'), accountId), {
        balance: increment(amt),
        updatedAt: serverTimestamp(),
      });
    }

    const txRef = doc(collection(db, C('transactions')));
    const months = allocations.map((a) => a.no).join(', ');
    batch.set(txRef, {
      type: 'income',
      amount: amt,
      description: `Pembayaran project: ${project.name} (bln ${months})`,
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
    // before this feature existed, because DataContext normalizes on read.
    // Writing only the new one would store a receipts array that omits them,
    // and since the reader switches to the receipts branch as soon as that
    // array exists, every one of those older payments would read as unpaid.
    const receipts = [...(project.receipts || []), receipt];

    // Keep the per-row fields in step: the received date is still read directly
    // when a row is rendered and in the collector's Tgl Bayar column.
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
    batch.update(doc(db, C('projects'), projectId), update);

    await batch.commit();
    toast(
      allocations.length > 1
        ? `Pembayaran tercatat untuk ${allocations.length} tagihan`
        : 'Pembayaran tercatat'
    );
  }
```

- [ ] **Step 3: Export it**

In the provider's value object, replace `recordProjectPayment` with `recordReceipt`. Leave `updateProjectPayment` exported; Task 4 changes it.

- [ ] **Step 4: Do Task 5 before building**

Deleting `recordProjectPayment` breaks `ProjectDetail.jsx`, which still calls it. **Treat Tasks 3 and 5 as one unit:** go and do Task 5 now, then come back and build. Do not add a temporary shim to make this file compile on its own — a shim for one commit is code nobody removes.

- [ ] **Step 5: Build and commit, together with Task 5**

Run: `npm run build` (after Task 5 is applied)
Expected: succeeds.

```bash
git add src/contexts/DataContext.jsx src/components/Projects/ReceiptSheet.jsx src/components/Projects/ProjectDetail.jsx
git commit -m "feat: record an arrival of money as a receipt"
```

---

### Task 4: Keep Edit working for a tagihan paid once

**Files:** modify `src/contexts/DataContext.jsx` (`updateProjectPayment`).

Today this function rewrites `receivedAmount` on the row. After Task 3 a row also has a receipt, and changing one without the other puts them out of step. Make it edit the receipt too, and refuse the case it cannot express.

- [ ] **Step 1: Make it receipt-aware**

Inside `updateProjectPayment`, after the existing guards, add:

```js
    // A row can now hold several arrivals. Editing one of them is Bagian B3;
    // here we handle the ordinary case of a row paid exactly once, and say so
    // plainly when we cannot.
    const rowReceipts = (project.receipts || []).filter((r) =>
      (r.allocations || []).some((a) => a.no === paymentNo)
    );
    if (rowReceipts.length > 1) {
      throw new Error(
        'Pembayaran ini terdiri dari beberapa kali bayar. Mengubahnya satu per satu akan hadir di pembaruan berikutnya.'
      );
    }
    const target = rowReceipts[0] || null;
```

- [ ] **Step 2: Write the receipt back alongside the row**

Where the function builds `updatedPayments` and calls `batch.update` on the project, also rewrite the matching receipt. Replace the existing project update line:

```js
    batch.update(doc(db, C('projects'), projectId), { payments: updatedPayments });
```

with:

```js
    const updatedReceipts = (project.receipts || []).map((r) =>
      target && r.id === target.id
        ? {
            ...r,
            amount: newAmt,
            date: Timestamp.fromDate(recvDate),
            accountId,
            allocations: [{ no: paymentNo, amount: newAmt }],
          }
        : r
    );
    batch.update(doc(db, C('projects'), projectId), {
      payments: updatedPayments,
      receipts: updatedReceipts,
    });
```

- [ ] **Step 3: Build** — `npm run build` must succeed once Task 5 is done; if you are running tasks in order, expect the same wiring gap as Task 3 Step 4.

- [ ] **Step 4: Commit**

```bash
git add src/contexts/DataContext.jsx
git commit -m "fix: editing a payment keeps its receipt in step"
```

---

### Task 5: The money-in sheet

**Files:** create `src/components/Projects/ReceiptSheet.jsx`; modify `src/components/Projects/ProjectDetail.jsx`.

- [ ] **Step 1: Create the sheet**

```jsx
import { useEffect, useMemo, useState } from 'react';
import Modal from '../common/Modal';
import CurrencyInput from '../common/CurrencyInput';
import DateField from '../common/DateField';
import { formatDateInput, fromDateInput, formatDate } from '../../utils/formatDate';
import { formatCurrency } from '../../utils/formatCurrency';
import { allocateReceipt, openRows } from '../../utils/allocation';
import { rowRemaining } from '../../utils/paymentStatus';

// Receiving money. The owner types what arrived; the sheet shows which tagihan
// it will close before he commits, so a split payment is never a surprise.
export default function ReceiptSheet({ open, onClose, project, accounts, defaultNo, onSubmit }) {
  const [amount, setAmount] = useState(0);
  const [account, setAccount] = useState('cash');
  const [date, setDate] = useState(formatDateInput(new Date()));
  const [startNo, setStartNo] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const rows = useMemo(() => (project ? openRows(project) : []), [project]);

  useEffect(() => {
    if (!open || !project) return;
    const target = defaultNo != null ? rows.find((r) => r.no === defaultNo) : rows[0];
    setStartNo(target ? String(target.no) : '');
    setAmount(target ? rowRemaining(project, target) : 0);
    setAccount(accounts?.[0]?.id ? accounts[0].id : 'cash');
    setDate(formatDateInput(new Date()));
    setError('');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, defaultNo, project]);

  const preview = useMemo(() => {
    if (!project) return { allocations: [], leftover: 0 };
    return allocateReceipt(project, amount, startNo ? Number(startNo) : null);
  }, [project, amount, startNo]);

  if (!open || !project) return null;

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    if (!amount || amount <= 0) return setError('Jumlah harus lebih dari 0');
    if (preview.leftover > 0) {
      return setError(`Jumlah melebihi sisa tagihan sebesar ${formatCurrency(preview.leftover)}`);
    }
    setSubmitting(true);
    try {
      await onSubmit({
        amount: Number(amount),
        date: fromDateInput(date),
        account,
        startNo: startNo ? Number(startNo) : null,
      });
      onClose();
    } catch (err) {
      setError(err.message || 'Gagal menyimpan');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Terima pembayaran"
      subtitle={project.name}
      footer={
        <button type="submit" form="receipt-form" className="btn-primary w-full" disabled={submitting}>
          {submitting ? 'Menyimpan…' : 'Simpan'}
        </button>
      }
    >
      <form id="receipt-form" onSubmit={handleSubmit} className="space-y-4">
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

        <div>
          <label className="label-text">Untuk tagihan</label>
          <select className="input-field" value={startNo} onChange={(e) => setStartNo(e.target.value)}>
            {rows.map((r) => (
              <option key={r.no} value={r.no}>
                Bulan {r.no} · jatuh tempo {formatDate(r.dueDate, { short: true })} · sisa{' '}
                {formatCurrency(rowRemaining(project, r))}
              </option>
            ))}
          </select>
          <p className="text-[12px] text-ink-mute mt-1">
            Kelebihannya otomatis lanjut ke tagihan berikutnya.
          </p>
        </div>

        {preview.allocations.length > 0 && (
          <div className="rounded-xl border border-line bg-paper p-3 text-[13px]">
            <div className="font-semibold text-ink mb-1">Menutup tagihan:</div>
            {preview.allocations.map((a) => (
              <div key={a.no} className="flex justify-between text-ink-soft">
                <span>Bulan {a.no}</span>
                <span className="font-num">{formatCurrency(a.amount)}</span>
              </div>
            ))}
          </div>
        )}

        {error && <p className="text-[13px] text-terra">{error}</p>}
      </form>
    </Modal>
  );
}
```

- [ ] **Step 2: Wire it into ProjectDetail**

Add the import:

```jsx
import ReceiptSheet from './ReceiptSheet';
```

Replace `handleConfirmPayment` with:

```jsx
  async function handleConfirmPayment(data) {
    if (!paying) return;
    await updateProjectPayment(project.id, paying.no, data);
  }

  async function handleReceipt(data) {
    await recordReceipt(project.id, data);
  }
```

Take `recordReceipt` from `useData()` in place of `recordProjectPayment`, add state for the new sheet next to the existing `paying` state:

```jsx
  const [receiving, setReceiving] = useState(null); // the tagihan number, or 0 for "any"
```

and render the sheet next to the existing ones:

```jsx
      <ReceiptSheet
        open={receiving !== null}
        onClose={() => setReceiving(null)}
        project={project}
        accounts={accounts}
        defaultNo={receiving || null}
        onSubmit={handleReceipt}
      />
```

- [ ] **Step 3: Build** — `npm run build` must succeed. **Step 4: Commit**

```bash
git add src/components/Projects/ReceiptSheet.jsx src/components/Projects/ProjectDetail.jsx
git commit -m "feat: a sheet for receiving money, with Tunai and a live split preview"
```

---

### Task 6: Show what is still short

**Files:** modify `src/components/Projects/ProjectDetail.jsx`, `src/components/Projects/ProjectCard.jsx`, `src/utils/projectExport.js`.

- [ ] **Step 1: The tagihan row gains a Kurang pill and its arrivals**

In `ProjectDetail.jsx`, extend the imports:

```jsx
import { isSettled, rowReceived, rowRemaining, rowState } from '../../utils/paymentStatus';
```

In `PaymentRow`, after `const isPaid = isSettled(project, payment);` add:

```jsx
  const state = rowState(project, payment);
  const short = rowRemaining(project, payment);
  const arrivals = (project.receipts || [])
    .map((r) => ({ r, part: (r.allocations || []).find((a) => a.no === payment.no) }))
    .filter((x) => x.part);
```

Add the pill next to the existing ones:

```jsx
          {state === 'kurang' && <Pill tone="emas">Kurang {formatCurrency(short, false)}</Pill>}
```

and change the confirm button so it opens the new sheet for this tagihan. Replace the `{!isPaid && (` block's `onClick={() => onConfirm(payment)}` with `onClick={() => onReceive(payment)}`, rename the prop in the signature from `onConfirm` to `onReceive`, and at the render site pass `onReceive={(pay) => isActive && setReceiving(pay.no)}` in place of the old `onConfirm`.

Below the row's main line, list the arrivals when there is more than one, so a split payment is visible:

```jsx
      {arrivals.length > 1 && (
        <div className="mt-1 pl-12 space-y-0.5">
          {arrivals.map(({ r, part }) => (
            <div key={r.id} className="flex justify-between text-[12px] text-ink-mute">
              <span>{formatDate(r.date, { short: true })}</span>
              <span className="font-num">{formatCurrency(part.amount, false)}</span>
            </div>
          ))}
        </div>
      )}
```

`PaymentRow` currently returns a single `<div>`. Wrap it so the arrivals list can sit underneath: change the `return (` to return a fragment, keep the existing `<div className={...flex items-center gap-3...}>` unchanged as the first child, and put the block above as the second child:

```jsx
  return (
    <>
      <div className={`flex items-center gap-3 py-3 ${isLast ? '' : 'border-b border-line-soft'}`}>
        {/* everything already in this row stays exactly as it is */}
      </div>
      {arrivals.length > 1 && (
        <div className="pb-2 pl-12 space-y-0.5">
          {arrivals.map(({ r, part }) => (
            <div key={r.id} className="flex justify-between text-[12px] text-ink-mute">
              <span>{formatDate(r.date, { short: true })}</span>
              <span className="font-num">{formatCurrency(part.amount, false)}</span>
            </div>
          ))}
        </div>
      )}
    </>
  );
```

Move the `border-b` from the row div onto the fragment's last visible child if the divider ends up above the arrivals list rather than below it; check this in the browser in Task 9 rather than guessing.

Hide the Edit button when `arrivals.length > 1`, since Task 4 refuses that case:

```jsx
        {isPaid && editable && arrivals.length <= 1 && (
```

- [ ] **Step 2: The card gains a badge**

In `ProjectCard.jsx` add:

```jsx
import { rowRemaining, rowState } from '../../utils/paymentStatus';
```

and after `const summary = projectSummary(project);`:

```jsx
  // What the borrower is short on tagihan he has already started paying. Not
  // the same as "not yet due", which is the normal state of a young project.
  const shortfall = (project.payments || [])
    .filter((row) => rowState(project, row) === 'kurang')
    .reduce((s, row) => s + rowRemaining(project, row), 0);
```

Render it next to the existing pills in the card header:

```jsx
      {shortfall > 0 && <Pill tone="emas">Kurang {formatCurrency(shortfall, false)}</Pill>}
```

- [ ] **Step 3: The collector's list says Kurang**

In `src/utils/projectExport.js`, inside `collectionRows`, replace:

```js
        status: paid ? 'Lunas' : 'Belum',
```

with:

```js
        status: paid ? 'Lunas' : rowReceived(p, pay) > 0 ? 'Kurang' : 'Belum',
```

The amount column already shows the remainder, so the collector now sees both that something arrived and exactly what is still owed.

- [ ] **Step 4: Verify**

Run: `npm test && npm run build`
Expected: both pass. The existing `projectExport.test.js` does not assert the status string for a partial row, so nothing should break; if something does, read it before changing it.

- [ ] **Step 5: Commit**

```bash
git add src/components/Projects/ProjectDetail.jsx src/components/Projects/ProjectCard.jsx src/utils/projectExport.js
git commit -m "feat: show what a tagihan is still short"
```

---

### Task 7: Tunai everywhere money comes in

**Files:** modify `src/contexts/DataContext.jsx`, `src/components/Projects/SettleProjectSheet.jsx`, `src/components/Projects/CloseProjectSheet.jsx`.

The spec asks for Tunai on **every** money-in sheet, not just the new one. Without this, the owner can receive a monthly instalment in cash but not a pelunasan dipercepat or a recovery on a macet project, which are exactly the ones most likely to arrive as cash.

- [ ] **Step 1: Factor the cash resolution out of `recordReceipt`**

In `DataContext.jsx`, add this above `recordReceipt`:

```js
  // Resolves where money that just came in should land, and credits it.
  // `account` is either an account id or the string 'cash'. Cash uses the Kas
  // account when the owner has one and creates it otherwise, so cash on hand
  // still counts in the dashboard total instead of vanishing.
  function creditMoneyIn(batch, account, amount) {
    if (account !== 'cash') {
      batch.update(doc(db, C('accounts'), account), {
        balance: increment(amount),
        updatedAt: serverTimestamp(),
      });
      return account;
    }
    const existing = findCashAccount(accounts);
    if (existing) {
      batch.update(doc(db, C('accounts'), existing.id), {
        balance: increment(amount),
        updatedAt: serverTimestamp(),
      });
      return existing.id;
    }
    const accRef = doc(collection(db, C('accounts')));
    batch.set(accRef, {
      name: CASH_ACCOUNT_NAME,
      accountNumber: '',
      kind: 'cash',
      balance: amount,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    return accRef.id;
  }
```

Then in `recordReceipt`, delete the whole inline `let accountId = account; if (account === 'cash') { ... } else { ... }` block and replace it with:

```js
    const accountId = creditMoneyIn(batch, account, amt);
```

- [ ] **Step 2: Let `settleProjectEarly` take cash**

It currently does `if (!accountId) throw ...` and then `batch.update(doc(db, C('accounts'), accountId), { balance: increment(amt), ... })`. Keep the guard, and replace that balance update with:

```js
    const creditedTo = creditMoneyIn(batch, accountId, amt);
```

Then use `creditedTo` in place of `accountId` in the transaction's `toAccount` and in the settlement row's `accountId`, so a settlement paid in cash points at the Kas account rather than the literal string.

- [ ] **Step 3: Let `closeProjectAsDefault` take cash**

Same change: inside the `if (recv > 0)` block, replace the account balance update with `const creditedTo = creditMoneyIn(batch, accountId, recv);` and use `creditedTo` for the transaction's `toAccount`.

- [ ] **Step 4: Offer Tunai in both sheets**

In `SettleProjectSheet.jsx`, the account select is initialised with `setAccountId(project.sourceAccountId || accounts?.[0]?.id || '')` and rendered from `accounts?.map(...)`. Add Tunai as the first option in the rendered list:

```jsx
              <option value="cash">Tunai (Kas)</option>
```

placed immediately before the `{accounts?.map((a) => (` line. Do the same in `CloseProjectSheet.jsx`. Leave the existing default selection alone: an owner who normally receives by transfer should not silently start booking cash.

- [ ] **Step 5: Verify** — `npm test && npm run build`, both pass.

- [ ] **Step 6: Commit**

```bash
git add src/contexts/DataContext.jsx src/components/Projects/SettleProjectSheet.jsx src/components/Projects/CloseProjectSheet.jsx
git commit -m "feat: cash is an option wherever money comes in"
```

---

### Task 8: Verify in the browser, on demo data

**Files:** none (verification only).

- [ ] **Step 1: Start the dev server** with `preview_start` (config `pusat-gadai-madiun`, port 5174). The app uses hash routing, so navigate by clicking inside it. Enter demo mode.

- [ ] **Step 2: Walk the new behaviour**

1. Open a project, tap Konfirmasi on the next tagihan. The sheet opens with the full remaining amount, **Tunai (Kas)** available at the top of the account list, and the tagihan preselected.
2. Enter **less** than the tagihan and save. The row shows **Kurang Rp X**, the amount shown is what arrived, and the project does not complete.
3. Receive money again on the same tagihan, enough to finish it. The row turns Lunas and now lists **both arrivals** underneath.
4. Enter **more** than one tagihan owes. The preview lists two months before saving, and after saving both are covered.
5. Enter more than the whole project owes. It must refuse with the exact excess named, and write nothing.
6. Choose **Tunai** on a project when no Kas account exists. Check Rekening: a `Kas/Tunai` account now exists holding exactly that amount, and the dashboard total went up by it.
7. Open Daftar Tagihan for a period containing the partly paid tagihan. Its status reads **Kurang** and its amount is the remainder, not the full tagihan.
8. Open **Pelunasan dipercepat** on an active project. **Tunai (Kas)** appears in its account list, and the preselected account is still the one it always was, not Tunai. Settle in cash and confirm the Kas balance rose by exactly that amount.
9. Open **Tutup: Macet** with a recovery amount, paid in cash. Same check.

- [ ] **Step 3: Confirm the trap is not live**

Open a project that was fully paid **before** this branch, and receive a new payment on it (or, if none is open, check the project after any write). Every previously confirmed tagihan must still read Lunas. If any of them flips to Belum, the receipts array was written without spreading the existing entries — stop and fix Task 3 before going further.

- [ ] **Step 4: Report**

Report what you exercised and what you saw. Do **not** merge to `main`.

---

## Deliberately left out of B2

- **Seeding a partly paid tagihan into the demo data.** It was in an earlier draft of this plan and was dropped: the demo seed maps accounts through an `accountKey` indirection in `demoReset.js`, so seeding a receipts array correctly means changing two files and guessing at that mapping, for something purely cosmetic. Task 8 creates the state through the app itself, which is better evidence anyway. Worth doing later if the public demo should show the feature without the visitor trying it.
- **Per-receipt Edit, Pindah ke bulan lain, Batalkan, and the Transaksi-page guard.** Bagian B3.
- **Gabung sisa ke bulan depan, Anggap lunas, the `Kurang Bayar` export column, and the migration.** Bagian B4.

## Notes for the stages after this

- **B3** adds per-receipt Edit, Pindah ke bulan lain, and Batalkan, and the guard that stops project transactions being edited or deleted from the Transaksi page. It also removes the "beberapa kali bayar" refusal added in Task 4.
- **B4** adds Gabung sisa ke bulan depan, Anggap lunas, the `Kurang Bayar` export column, and the migration that writes receipts into every stored document. The migration must stay idempotent: projects touched by `recordReceipt` already carry a real receipts array, and projects touched by any write already carry derived `closure` markers.
