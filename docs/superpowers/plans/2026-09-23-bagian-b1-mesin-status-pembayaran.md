# Bagian B1 — One Shared Payment-Status Rule Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the 20-plus scattered `receivedAmount != null` checks with one shared rule that can express a partly paid tagihan, without changing a single thing the owner sees.

**Architecture:** Two new pure modules. `paymentStatus.js` answers "is this tagihan settled, how much is still owed" from a project plus a schedule row, tolerating both the current data shape and the receipts shape Bagian B2 will introduce. `normalizeProject.js` presents today's stored rows as receipts on read, and marks historical underpayments as deliberately waived so they keep reading as settled. It is wired in at the single Firestore snapshot in `DataContext`, so every screen sees one shape. Then every **reading** site switches to the shared helpers. **No writing site changes in B1** — the stored documents keep exactly today's shape.

**Tech Stack:** React 19, Vite 8, Firebase Firestore, Vitest (60 tests currently green).

**Spec:** `docs/superpowers/specs/2026-09-22-pembayaran-jadwal-download-design.md`, section 6.2 and 6.7.

**Branch:** `feat/b1-status-pembayaran`, cut from `main`. Do **not** push to `main`: every push to `main` deploys the live app.

---

## Why this stage exists, and the one trap in it

Today twenty-something places each decide "paid" for themselves with `receivedAmount != null`. That expression has no way to say "5,5jt was owed and 3jt arrived". Bagian B2 introduces partial payments; if the screens still each hold their own opinion, Beranda, Kalender, daftar proyek and the exports will disagree about the same project. So this stage centralises the question first and proves the answers did not move.

**The trap.** `recordProjectPayment` and friends build a local `updatedPayments` array and then ask "are they all paid now?" to decide whether the project becomes `Selesai`. Under the new rule, a final payment confirmed for less than the tagihan would leave a remainder, so the project would **stop** auto-completing — a silent behaviour change on a real business rule. The fix is in Task 5: those call sites normalize the local array first, which applies the legacy waiver and reproduces today's answer exactly.

---

## File Structure

| File | Responsibility |
|---|---|
| `src/utils/paymentStatus.js` (create) | The single rule: received, waived, remaining, state, overdue. Pure. Knows nothing about React or Firestore. |
| `src/utils/normalizeProject.js` (create) | Presents a stored project in the receipts shape, waiving historical shortfalls. Pure. |
| `src/utils/paymentStatus.test.js`, `normalizeProject.test.js`, `statusEquivalence.test.js` (create) | Unit tests plus the characterisation net that proves nothing moved. |
| `src/contexts/DataContext.jsx` (modify) | Normalize at the snapshot; switch its own reading sites. |
| `src/utils/projectSchedule.js` (modify) | `projectSummary`, `findNextDuePayment`, `recomputeUnpaidSchedule` use the shared rule. |
| `src/utils/projectExport.js` (modify) | `paymentRow`, `collectionRows`, the in-range received total use the shared rule. |
| 7 component files (modify) | Calendar x2, Dashboard, ProjectList, ProjectDetail, ProjectForm, SettleProjectSheet, PaymentConfirmSheet. |

---

### Task 1: The shared rule

**Files:**
- Create: `src/utils/paymentStatus.js`
- Create: `src/utils/paymentStatus.test.js`

- [ ] **Step 1: Write the failing test**

Create `src/utils/paymentStatus.test.js`:

```js
import { describe, it, expect } from 'vitest';
import {
  rowReceived, rowWaived, rowDue, rowRemaining, rowState,
  isSettled, isOverdue, projectReceivedTotal, hasAnyReceipt,
} from './paymentStatus';

const row = (over = {}) => ({ no: 1, type: 'interest', expectedAmount: 5_500_000, dueDate: new Date(2026, 9, 5), ...over });

// The receipts shape Bagian B2 will store.
const withReceipts = (rows, receipts) => ({ payments: rows, receipts });
// Today's stored shape: no receipts array at all.
const legacy = (rows) => ({ payments: rows });

describe('rowReceived', () => {
  it('sums the allocations pointed at that row', () => {
    const r = row();
    const p = withReceipts([r], [
      { id: 'a', amount: 3_000_000, allocations: [{ no: 1, amount: 3_000_000 }] },
      { id: 'b', amount: 1_000_000, allocations: [{ no: 1, amount: 1_000_000 }] },
    ]);
    expect(rowReceived(p, r)).toBe(4_000_000);
  });

  it('counts only the part of a split receipt that belongs to the row', () => {
    const r1 = row({ no: 1 });
    const r2 = row({ no: 2 });
    const p = withReceipts([r1, r2], [
      { id: 'a', amount: 7_000_000, allocations: [{ no: 1, amount: 1_500_000 }, { no: 2, amount: 5_500_000 }] },
    ]);
    expect(rowReceived(p, r1)).toBe(1_500_000);
    expect(rowReceived(p, r2)).toBe(5_500_000);
  });

  it('falls back to the stored receivedAmount when the project has no receipts array', () => {
    const r = row({ receivedAmount: 5_500_000 });
    expect(rowReceived(legacy([r]), r)).toBe(5_500_000);
  });

  it('reads an unpaid legacy row as zero, not NaN', () => {
    const r = row({ receivedAmount: null });
    expect(rowReceived(legacy([r]), r)).toBe(0);
  });
});

describe('rowWaived', () => {
  it('counts a waive closure', () => {
    expect(rowWaived(row({ closure: { kind: 'waive', amount: 100_000 } }))).toBe(100_000);
  });

  it('ignores closures of other kinds', () => {
    expect(rowWaived(row({ closure: { kind: 'carry', amount: 100_000, toNo: 2 } }))).toBe(0);
  });

  it('is zero when there is no closure', () => {
    expect(rowWaived(row())).toBe(0);
  });
});

describe('rowRemaining and rowState', () => {
  it('reports the shortfall of a partly paid row', () => {
    const r = row();
    const p = withReceipts([r], [{ id: 'a', amount: 3_000_000, allocations: [{ no: 1, amount: 3_000_000 }] }]);
    expect(rowRemaining(p, r)).toBe(2_500_000);
    expect(rowState(p, r)).toBe('kurang');
  });

  it('is settled when payments cover the tagihan exactly', () => {
    const r = row();
    const p = withReceipts([r], [{ id: 'a', amount: 5_500_000, allocations: [{ no: 1, amount: 5_500_000 }] }]);
    expect(rowRemaining(p, r)).toBe(0);
    expect(rowState(p, r)).toBe('lunas');
    expect(isSettled(p, r)).toBe(true);
  });

  it('treats a waived shortfall as settled', () => {
    const r = row({ closure: { kind: 'waive', amount: 2_500_000 } });
    const p = withReceipts([r], [{ id: 'a', amount: 3_000_000, allocations: [{ no: 1, amount: 3_000_000 }] }]);
    expect(rowRemaining(p, r)).toBe(0);
    expect(rowState(p, r)).toBe('lunas');
  });

  it('never reports a negative remainder when more arrived than was owed', () => {
    const r = row();
    const p = withReceipts([r], [{ id: 'a', amount: 9_000_000, allocations: [{ no: 1, amount: 9_000_000 }] }]);
    expect(rowRemaining(p, r)).toBe(0);
    expect(rowState(p, r)).toBe('lunas');
  });

  it('calls an untouched row belum, not kurang', () => {
    const r = row();
    expect(rowState(legacy([r]), r)).toBe('belum');
    expect(isSettled(legacy([r]), r)).toBe(false);
  });
});

describe('isOverdue', () => {
  const r = row({ dueDate: new Date(2026, 9, 5) });

  it('is true when the due date has passed and money is still owed', () => {
    expect(isOverdue(legacy([r]), r, new Date(2026, 9, 20))).toBe(true);
  });

  it('is false once the row is settled', () => {
    const p = withReceipts([r], [{ id: 'a', amount: 5_500_000, allocations: [{ no: 1, amount: 5_500_000 }] }]);
    expect(isOverdue(p, r, new Date(2026, 9, 20))).toBe(false);
  });

  it('is false before the due date', () => {
    expect(isOverdue(legacy([r]), r, new Date(2026, 9, 1))).toBe(false);
  });
});

describe('projectReceivedTotal and hasAnyReceipt', () => {
  it('totals every receipt of the project', () => {
    const p = withReceipts([row()], [
      { id: 'a', amount: 3_000_000, allocations: [{ no: 1, amount: 3_000_000 }] },
      { id: 'b', amount: 1_000_000, allocations: [{ no: 1, amount: 1_000_000 }] },
    ]);
    expect(projectReceivedTotal(p)).toBe(4_000_000);
    expect(hasAnyReceipt(p)).toBe(true);
  });

  it('totals the stored amounts for a legacy project', () => {
    const p = legacy([row({ receivedAmount: 5_500_000 }), row({ no: 2, receivedAmount: null })]);
    expect(projectReceivedTotal(p)).toBe(5_500_000);
    expect(hasAnyReceipt(p)).toBe(true);
  });

  it('is zero and false for a project nobody has paid', () => {
    const p = legacy([row({ receivedAmount: null })]);
    expect(projectReceivedTotal(p)).toBe(0);
    expect(hasAnyReceipt(p)).toBe(false);
  });

  it('survives a missing project or missing payments', () => {
    expect(projectReceivedTotal(null)).toBe(0);
    expect(projectReceivedTotal({})).toBe(0);
    expect(hasAnyReceipt(null)).toBe(false);
  });
});

describe('rowDue', () => {
  it('is the tagihan amount, coerced', () => {
    expect(rowDue(row({ expectedAmount: '5500000' }))).toBe(5_500_000);
    expect(rowDue(row({ expectedAmount: undefined }))).toBe(0);
  });
});
```

- [ ] **Step 2: Run the test and watch it fail**

Run: `npm test`
Expected: FAIL — cannot resolve `./paymentStatus`.

- [ ] **Step 3: Write the module**

Create `src/utils/paymentStatus.js`:

```js
import { toDate } from './formatDate';

/**
 * The single answer to "is this tagihan settled, and how much is still owed".
 *
 * Before this module every screen asked `receivedAmount != null` for itself,
 * which cannot express a tagihan that was only partly paid. Bagian B2 makes
 * partial payments real, so the question has to be asked in one place or the
 * screens will disagree with each other about the same project.
 *
 * Every helper takes the project and one of its schedule rows, and works on
 * BOTH shapes: the receipts array Bagian B2 stores, and the single
 * `receivedAmount` field stored today. That dual support is what lets the
 * writing side change later without touching the readers again.
 */

function receiptsOf(project) {
  return Array.isArray(project?.receipts) ? project.receipts : null;
}

export function rowDue(row) {
  return Number(row?.expectedAmount) || 0;
}

export function rowReceived(project, row) {
  if (!row) return 0;
  const receipts = receiptsOf(project);
  if (receipts) {
    let sum = 0;
    for (const r of receipts) {
      for (const a of r?.allocations || []) {
        if (a?.no === row.no) sum += Number(a.amount) || 0;
      }
    }
    return sum;
  }
  return Number(row.receivedAmount) || 0;
}

// Only a 'waive' closure reduces what is owed on this row. Other closure kinds
// (carry, extend, rollover) move the remainder somewhere else and are handled
// by the stages that introduce them.
export function rowWaived(row) {
  const c = row?.closure;
  return c && c.kind === 'waive' ? Number(c.amount) || 0 : 0;
}

export function rowRemaining(project, row) {
  return Math.max(0, rowDue(row) - rowReceived(project, row) - rowWaived(row));
}

export function isSettled(project, row) {
  return rowRemaining(project, row) === 0;
}

export function rowState(project, row) {
  if (rowRemaining(project, row) === 0) return 'lunas';
  return rowReceived(project, row) > 0 ? 'kurang' : 'belum';
}

export function isOverdue(project, row, today = new Date()) {
  if (isSettled(project, row)) return false;
  const due = toDate(row?.dueDate);
  return !!due && due < today;
}

export function projectReceivedTotal(project) {
  const receipts = receiptsOf(project);
  if (receipts) return receipts.reduce((s, r) => s + (Number(r?.amount) || 0), 0);
  return (project?.payments || []).reduce((s, p) => s + (Number(p?.receivedAmount) || 0), 0);
}

export function hasAnyReceipt(project) {
  const receipts = receiptsOf(project);
  if (receipts) return receipts.length > 0;
  return (project?.payments || []).some((p) => p?.receivedAmount != null);
}
```

- [ ] **Step 4: Run the tests**

Run: `npm test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/utils/paymentStatus.js src/utils/paymentStatus.test.js
git commit -m "feat: one shared rule for payment status"
```

---

### Task 2: Present stored projects in the receipts shape

**Files:**
- Create: `src/utils/normalizeProject.js`
- Create: `src/utils/normalizeProject.test.js`

- [ ] **Step 1: Write the failing test**

Create `src/utils/normalizeProject.test.js`:

```js
import { describe, it, expect } from 'vitest';
import { normalizeProject } from './normalizeProject';
import { rowState, rowRemaining, projectReceivedTotal } from './paymentStatus';

const legacyProject = () => ({
  id: 'p1',
  name: 'PINDANG',
  status: 'active',
  payments: [
    { no: 1, type: 'interest', expectedAmount: 5_500_000, receivedAmount: 5_500_000,
      receivedDate: new Date(2026, 4, 5), accountId: 'acc-bca', transactionId: 'tx-1' },
    { no: 2, type: 'interest', expectedAmount: 5_500_000, receivedAmount: 3_000_000,
      receivedDate: new Date(2026, 5, 5), accountId: 'acc-bca', transactionId: 'tx-2' },
    { no: 3, type: 'final', expectedAmount: 100_000_000, receivedAmount: null },
  ],
});

describe('normalizeProject', () => {
  it('turns each confirmed row into one receipt carrying its own transaction', () => {
    const p = normalizeProject(legacyProject());
    expect(p.receipts).toHaveLength(2);
    expect(p.receipts[0]).toMatchObject({
      amount: 5_500_000, accountId: 'acc-bca', transactionId: 'tx-1',
      allocations: [{ no: 1, amount: 5_500_000 }],
    });
    expect(projectReceivedTotal(p)).toBe(8_500_000);
  });

  it('waives a historical shortfall so it keeps reading as settled', () => {
    const p = normalizeProject(legacyProject());
    const short = p.payments.find((r) => r.no === 2);
    expect(short.closure).toEqual({ kind: 'waive', amount: 2_500_000, reason: 'legacy' });
    expect(rowState(p, short)).toBe('lunas');
    expect(rowRemaining(p, short)).toBe(0);
  });

  it('leaves untouched rows alone', () => {
    const p = normalizeProject(legacyProject());
    const last = p.payments.find((r) => r.no === 3);
    expect(last.closure).toBeUndefined();
    expect(rowState(p, last)).toBe('belum');
  });

  it('does not waive when the exact amount arrived', () => {
    const p = normalizeProject(legacyProject());
    expect(p.payments.find((r) => r.no === 1).closure).toBeUndefined();
  });

  it('does not waive when more arrived than was owed', () => {
    const p = normalizeProject({ payments: [
      { no: 1, expectedAmount: 5_000_000, receivedAmount: 6_000_000 },
    ] });
    expect(p.payments[0].closure).toBeUndefined();
  });

  it('leaves a project that already has receipts completely alone', () => {
    const already = {
      payments: [{ no: 1, expectedAmount: 5_500_000 }],
      receipts: [{ id: 'r1', amount: 3_000_000, allocations: [{ no: 1, amount: 3_000_000 }] }],
    };
    expect(normalizeProject(already)).toBe(already);
  });

  it('never mutates the project it was given', () => {
    const original = legacyProject();
    const snapshot = JSON.stringify(original);
    normalizeProject(original);
    expect(JSON.stringify(original)).toBe(snapshot);
  });

  it('survives a project with no payments at all', () => {
    expect(normalizeProject({ id: 'x' }).receipts).toEqual([]);
    expect(normalizeProject(null)).toBe(null);
  });
});
```

- [ ] **Step 2: Run the test and watch it fail**

Run: `npm test`
Expected: FAIL — cannot resolve `./normalizeProject`.

- [ ] **Step 3: Write the module**

Create `src/utils/normalizeProject.js`:

```js
/**
 * Presents a stored project in the shape the rest of the app now reads:
 * a `receipts` array, where each entry is one arrival of money carrying its own
 * transaction, allocated to the schedule rows it covers.
 *
 * Applied on read, at the Firestore snapshot, so screens never see two shapes.
 * Stored documents are NOT changed by this — that is the migration in Bagian B4.
 *
 * The waiver matters. Before partial payments existed, confirming a tagihan
 * closed it whatever amount was typed, so the business has history where less
 * arrived than was owed and the row was considered done. Without marking that
 * shortfall as deliberately waived, every one of those rows would light up as
 * "Kurang" the day the new rule ships. The owner decided they stay settled and
 * that he gets a list of them instead (Bagian B4).
 */
export function normalizeProject(project) {
  if (!project) return project;
  if (Array.isArray(project.receipts)) return project;

  const receipts = [];
  const payments = (project.payments || []).map((row) => {
    const amount = Number(row?.receivedAmount) || 0;
    if (row?.receivedAmount == null) return row;

    receipts.push({
      id: `legacy-${row.no}`,
      amount,
      date: row.receivedDate || null,
      accountId: row.accountId || null,
      transactionId: row.transactionId || null,
      allocations: [{ no: row.no, amount }],
    });

    const short = (Number(row.expectedAmount) || 0) - amount;
    if (short > 0 && !row.closure) {
      return { ...row, closure: { kind: 'waive', amount: short, reason: 'legacy' } };
    }
    return row;
  });

  return { ...project, payments, receipts };
}
```

- [ ] **Step 4: Run the tests**

Run: `npm test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/utils/normalizeProject.js src/utils/normalizeProject.test.js
git commit -m "feat: read stored projects in the receipts shape"
```

---

### Task 3: The characterisation net

This is the proof that B1 changes nothing. It pins the OLD expressions against the NEW helpers over a spread of projects, including the awkward ones. Write it **before** touching any call site, so it fails loudly if a later task drifts.

**Files:**
- Create: `src/utils/statusEquivalence.test.js`

- [ ] **Step 1: Write the test**

Create `src/utils/statusEquivalence.test.js`:

```js
import { describe, it, expect } from 'vitest';
import { normalizeProject } from './normalizeProject';
import { isSettled, rowRemaining, projectReceivedTotal, hasAnyReceipt } from './paymentStatus';

// A spread of stored projects, including the shapes that actually caused
// trouble: an underpaid confirmed row, a zero-amount row, a row confirmed for
// more than its tagihan, and a project nobody has paid.
const projects = [
  { id: 'all-paid', payments: [
    { no: 1, expectedAmount: 5_500_000, receivedAmount: 5_500_000, type: 'interest' },
    { no: 2, expectedAmount: 100_000_000, receivedAmount: 100_000_000, type: 'final' },
  ] },
  { id: 'part-paid', payments: [
    { no: 1, expectedAmount: 5_500_000, receivedAmount: 5_500_000, type: 'interest' },
    { no: 2, expectedAmount: 5_500_000, receivedAmount: null, type: 'interest' },
  ] },
  { id: 'underpaid-row', payments: [
    { no: 1, expectedAmount: 5_500_000, receivedAmount: 3_000_000, type: 'interest' },
    { no: 2, expectedAmount: 5_500_000, receivedAmount: null, type: 'interest' },
  ] },
  { id: 'overpaid-row', payments: [
    { no: 1, expectedAmount: 5_000_000, receivedAmount: 6_000_000, type: 'interest' },
  ] },
  { id: 'zero-row', payments: [
    { no: 1, expectedAmount: 0, receivedAmount: 0, type: 'interest' },
  ] },
  { id: 'nothing-paid', payments: [
    { no: 1, expectedAmount: 5_500_000, receivedAmount: null, type: 'interest' },
  ] },
  { id: 'no-payments', payments: [] },
];

describe('the new rule reproduces the old one for stored data', () => {
  it('agrees row by row on whether a tagihan is settled', () => {
    for (const stored of projects) {
      const p = normalizeProject(stored);
      for (const row of stored.payments) {
        const oldAnswer = row.receivedAmount != null;
        const newRow = p.payments.find((r) => r.no === row.no);
        expect(
          isSettled(p, newRow),
          `${stored.id} row ${row.no}: settled`
        ).toBe(oldAnswer);
      }
    }
  });

  it('agrees on the total received per project', () => {
    for (const stored of projects) {
      const oldTotal = (stored.payments || []).reduce((s, p) => s + (p.receivedAmount || 0), 0);
      expect(projectReceivedTotal(normalizeProject(stored)), stored.id).toBe(oldTotal);
    }
  });

  it('agrees on whether any money has arrived', () => {
    for (const stored of projects) {
      const oldAnswer = (stored.payments || []).some((p) => p.receivedAmount != null);
      expect(hasAnyReceipt(normalizeProject(stored)), stored.id).toBe(oldAnswer);
    }
  });

  it('agrees on the sum still expected', () => {
    for (const stored of projects) {
      const oldRemaining = (stored.payments || [])
        .filter((p) => p.receivedAmount == null)
        .reduce((s, p) => s + p.expectedAmount, 0);
      const p = normalizeProject(stored);
      const newRemaining = p.payments.reduce((s, row) => s + rowRemaining(p, row), 0);
      expect(newRemaining, stored.id).toBe(oldRemaining);
    }
  });

  it('agrees on whether every tagihan is settled, which is what auto-completes a project', () => {
    for (const stored of projects) {
      const rows = stored.payments || [];
      const oldAllPaid = rows.length > 0 && rows.every((p) => p.receivedAmount != null);
      const p = normalizeProject(stored);
      const newAllPaid = p.payments.length > 0 && p.payments.every((row) => isSettled(p, row));
      expect(newAllPaid, stored.id).toBe(oldAllPaid);
    }
  });
});
```

- [ ] **Step 2: Run the tests**

Run: `npm test`
Expected: PASS. If the `underpaid-row` case fails, the legacy waiver in Task 2 is wrong — fix `normalizeProject`, not the test.

- [ ] **Step 3: Commit**

```bash
git add src/utils/statusEquivalence.test.js
git commit -m "test: pin the new payment rule against the old one"
```

---

### Task 4: Wire it in at the snapshot

**Files:**
- Modify: `src/contexts/DataContext.jsx:77`

- [ ] **Step 1: Import the normalizer**

At the top of `src/contexts/DataContext.jsx`, alongside the other `../utils/` imports, add:

```js
import { normalizeProject } from '../utils/normalizeProject';
```

- [ ] **Step 2: Normalize every project as it arrives**

Replace line 77:

```js
        setProjects(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
```

with:

```js
        // One shape for every screen. Stored documents are untouched; the
        // receipts view is derived on read until the Bagian B4 migration.
        setProjects(snap.docs.map((d) => normalizeProject({ id: d.id, ...d.data() })));
```

- [ ] **Step 3: Build and run the app**

Run: `npm test && npm run build`
Expected: 60-plus tests pass, build succeeds.

- [ ] **Step 4: Commit**

```bash
git add src/contexts/DataContext.jsx
git commit -m "feat: normalize projects at the firestore snapshot"
```

---

### Task 5: Switch DataContext's own reading sites

Only reads change. The write guards at lines 589 and 650 (`sudah dikonfirmasi` / `belum diterima`) stay exactly as they are — Bagian B3 owns those.

**Files:**
- Modify: `src/contexts/DataContext.jsx` lines 441, 630, 737, 782, 831-837, 858

- [ ] **Step 1: Extend the import**

```js
import { normalizeProject } from '../utils/normalizeProject';
import { hasAnyReceipt, isSettled, projectReceivedTotal } from '../utils/paymentStatus';
```

- [ ] **Step 2: `updateProject`'s capital lock (line 441)**

Replace:

```js
    const hasReceived = (project.payments || []).some((p) => p.receivedAmount != null);
```

with:

```js
    const hasReceived = hasAnyReceipt(project);
```

- [ ] **Step 3: auto-completion in `recordProjectPayment` (line 630)**

This is the trap described at the top of this plan. `updatedPayments` is a locally built array with no receipts, so it must be normalized before being asked — that applies the legacy waiver and reproduces today's answer for an under-confirmed final payment.

Replace:

```js
    const allPaid =
      updatedPayments.length > 0 && updatedPayments.every((p) => p.receivedAmount != null);
```

with:

```js
    // Normalize first: on a locally built array the waiver for an
    // under-confirmed row is what keeps this answering as it does today.
    const afterWrite = normalizeProject({ payments: updatedPayments });
    const allPaid =
      afterWrite.payments.length > 0 && afterWrite.payments.every((row) => isSettled(afterWrite, row));
```

- [ ] **Step 4: `closeProjectAsDefault`'s total (line 737)**

Replace:

```js
    const totalReceived =
      (project.payments || []).reduce((s, p) => s + (p.receivedAmount || 0), 0) + recv;
```

with:

```js
    const totalReceived = projectReceivedTotal(project) + recv;
```

- [ ] **Step 5: `settleProjectEarly`'s kept rows (line 782)**

Replace:

```js
    const keptPaid = (project.payments || []).filter((p) => p.receivedAmount != null);
```

with:

```js
    const keptPaid = (project.payments || []).filter((p) => p.receivedAmount != null || isSettled(project, p));
```

Keeping the original clause as well is deliberate: a row settled only by a waiver has no `receivedAmount`, and dropping it would lose the waiver record.

- [ ] **Step 6: `deleteProject`'s claw-back (lines 831-837, 858)**

The claw-back reverses real money, so it must follow the receipts, which is where the money actually is. Replace this whole block:

```js
    // 2. Claw back every received return from the account it was deposited to
    for (const p of project.payments || []) {
      if (p.receivedAmount != null) {
        if (p.transactionId) {
          batch.delete(doc(db, C('transactions'), p.transactionId));
        }
        if (p.accountId && p.receivedAmount) {
          batch.update(doc(db, C('accounts'), p.accountId), {
            balance: increment(-(p.receivedAmount || 0)),
            updatedAt: serverTimestamp(),
          });
        }
      }
    }
```

with:

```js
    // 2. Claw back every received return from the account it was deposited to.
    // Walks receipts, not rows: once one tagihan can be paid several times, the
    // money lives on the receipts and a row-based loop would refund only one of
    // them.
    for (const r of project.receipts || []) {
      const amt = Number(r?.amount) || 0;
      if (r?.transactionId) {
        batch.delete(doc(db, C('transactions'), r.transactionId));
      }
      if (r?.accountId && amt) {
        batch.update(doc(db, C('accounts'), r.accountId), {
          balance: increment(-amt),
          updatedAt: serverTimestamp(),
        });
      }
    }
```

and replace line 858:

```js
    const clawedBack = (project.payments || []).reduce((s, p) => s + (p.receivedAmount || 0), 0);
```

with:

```js
    const clawedBack = projectReceivedTotal(project);
```

Read the surrounding lines before editing; keep every other statement in that function exactly as it is.

- [ ] **Step 7: Verify**

Run: `npm test && npm run build`
Expected: all pass.

- [ ] **Step 8: Commit**

```bash
git add src/contexts/DataContext.jsx
git commit -m "refactor: DataContext reads payment status from the shared rule"
```

---

### Task 6: Switch `projectSchedule.js`

**Files:**
- Modify: `src/utils/projectSchedule.js` lines 72, 150-154, 178

- [ ] **Step 1: Import the rule**

```js
import { isSettled, rowRemaining, hasAnyReceipt, projectReceivedTotal } from './paymentStatus';
```

- [ ] **Step 2: `recomputeUnpaidSchedule` keeps settled rows (line 72)**

Replace:

```js
    if (p.receivedAmount != null) paidByNo.set(p.no, p);
```

with:

```js
    // A row is kept when money reached it or a closure settled it; regenerating
    // such a row would throw away the record of what actually happened.
    if (p.receivedAmount != null || p.closure) paidByNo.set(p.no, p);
```

This function receives a bare array, not a project, so it cannot use the project-aware helpers. The condition above is the equivalent test on a bare row.

- [ ] **Step 3: `projectSummary` (lines 149-154)**

Replace:

```js
  const receivedSoFar = payments.reduce((s, p) => s + (p.receivedAmount || 0), 0);
  const expectedRemaining = payments
    .filter((p) => p.receivedAmount == null)
    .reduce((s, p) => s + p.expectedAmount, 0);
  const paidCount = payments.filter((p) => p.receivedAmount != null).length;
```

with:

```js
  const receivedSoFar = projectReceivedTotal(project);
  const expectedRemaining = payments.reduce((s, p) => s + rowRemaining(project, p), 0);
  const paidCount = payments.filter((p) => isSettled(project, p)).length;
```

- [ ] **Step 4: `findNextDuePayment` (line 178)**

Replace:

```js
      .filter((p) => p.receivedAmount == null)
```

with:

```js
      .filter((p) => !isSettled(project, p))
```

- [ ] **Step 5: Verify**

Run: `npm test && npm run build`
Expected: all pass, including `statusEquivalence.test.js`.

- [ ] **Step 6: Commit**

```bash
git add src/utils/projectSchedule.js
git commit -m "refactor: project summary and next-due use the shared rule"
```

---

### Task 7: Switch `projectExport.js`

**Files:**
- Modify: `src/utils/projectExport.js` lines 30, 33, 177, 211, 225

- [ ] **Step 1: Import the rule**

```js
import { isSettled, rowRemaining, rowReceived } from './paymentStatus';
```

- [ ] **Step 2: `paymentRow` (lines 28-34)**

`paymentRow(p, payment, accountName)` already receives the project as `p`. Replace:

```js
    'Diterima (Rp)': payment.receivedAmount ?? '',
```

with:

```js
    'Diterima (Rp)': rowReceived(p, payment) || '',
```

and replace:

```js
    Status: payment.receivedAmount != null ? 'Diterima' : 'Belum',
```

with:

```js
    Status: isSettled(p, payment) ? 'Diterima' : 'Belum',
```

- [ ] **Step 3: the in-range received total (line 177)**

Replace:

```js
          totalReceived += pay.receivedAmount || 0;
```

with:

```js
          totalReceived += rowReceived(p, pay);
```

The enclosing loop is `sourceList.forEach((p) => { (p.payments || []).forEach((pay) => {`, so `p` is the project and `pay` is the row.

- [ ] **Step 4: `collectionRows` (lines 211, 225)**

Replace:

```js
      const paid = pay.receivedAmount != null;
```

with:

```js
      const paid = isSettled(p, pay);
```

and replace:

```js
        amount: paid ? (pay.receivedAmount || 0) : (pay.expectedAmount || 0),
```

with:

```js
        amount: paid ? rowReceived(p, pay) : rowRemaining(p, pay),
```

For stored data this is identical to today: an unsettled row has received nothing, so its remainder equals its tagihan. It is also already correct once partial payments exist, which is what the debt collector needs — Bagian B4 only has to change the label.

- [ ] **Step 5: Verify**

Run: `npm test && npm run build`
Expected: all pass, including the 13 tests in `projectExport.test.js`.

- [ ] **Step 6: Commit**

```bash
git add src/utils/projectExport.js
git commit -m "refactor: exports read payment status from the shared rule"
```

---

### Task 8: Switch the seven components

Each edit is mechanical. The project object is in scope at every one of these sites.

**Files:**
- Modify: `src/components/Calendar/CalendarGrid.jsx:49`
- Modify: `src/components/Calendar/DayDetail.jsx:34`
- Modify: `src/components/Dashboard/DashboardPage.jsx:131`
- Modify: `src/components/Projects/ProjectList.jsx:106,109`
- Modify: `src/components/Projects/ProjectDetail.jsx:48,91,163`
- Modify: `src/components/Projects/ProjectForm.jsx:26`
- Modify: `src/components/Projects/SettleProjectSheet.jsx:25,32`
- Modify: `src/components/Projects/PaymentConfirmSheet.jsx:9,18,20`

- [ ] **Step 1: Calendar**

In both `CalendarGrid.jsx` and `DayDetail.jsx`, add `import { isSettled } from '../../utils/paymentStatus';` and replace

```js
        if (pay.receivedAmount == null && isSameDay(toDate(pay.dueDate), date)) {
```

with

```js
        if (!isSettled(p, pay) && isSameDay(toDate(pay.dueDate), date)) {
```

- [ ] **Step 2: Dashboard (line 131)**

Add `import { isSettled } from '../../utils/paymentStatus';` and replace

```js
        if (pay.receivedAmount != null) return;
```

with

```js
        if (isSettled(p, pay)) return;
```

- [ ] **Step 3: ProjectList (lines 106, 109)**

Add `import { rowReceived, isSettled } from '../../utils/paymentStatus';` and replace

```js
          received += pay.receivedAmount || 0;
```

with

```js
          received += rowReceived(p, pay);
```

and replace

```js
        if (inRangeDue && pay.receivedAmount == null) {
```

with

```js
        if (inRangeDue && !isSettled(p, pay)) {
```

- [ ] **Step 4: ProjectDetail (lines 48, 91, 163)**

`PaymentRow` receives only `payment`, so the project has to be passed in. Change the signature:

```js
function PaymentRow({ payment, onConfirm, onEdit, editable, isLast }) {
```

to:

```js
function PaymentRow({ project, payment, onConfirm, onEdit, editable, isLast }) {
```

and at the render site add the prop:

```jsx
        {project.payments.map((p, i) => (
          <PaymentRow
            key={p.no}
            project={project}
            payment={p}
            onConfirm={(pay) => isActive && setPaying(pay)}
            onEdit={(pay) => (isActive || isCompleted) && setPaying(pay)}
            editable={isActive || isCompleted}
            isLast={i === project.payments.length - 1}
          />
        ))}
```

Add `import { isSettled, rowReceived } from '../../utils/paymentStatus';` and replace

```js
  const isPaid = payment.receivedAmount != null;
```

with

```js
  const isPaid = isSettled(project, payment);
```

and replace

```js
          {formatCurrency(isPaid ? payment.receivedAmount : payment.expectedAmount, false)}
```

with

```js
          {formatCurrency(isPaid ? rowReceived(project, payment) : payment.expectedAmount, false)}
```

Line 163 decides whether tapping a row opens Edit or Confirm. That is a write path, so keep its meaning exactly: replace

```js
    if (paying.receivedAmount != null) {
```

with

```js
    if (rowReceived(project, paying) > 0) {
```

- [ ] **Step 5: ProjectForm (line 26)**

Add `import { hasAnyReceipt } from '../../utils/paymentStatus';` and replace

```js
  const hasReceived = isEdit && (initial.payments || []).some((p) => p.receivedAmount != null);
```

with

```js
  const hasReceived = isEdit && hasAnyReceipt(initial);
```

- [ ] **Step 6: SettleProjectSheet (lines 25, 32)**

Add `import { isSettled } from '../../utils/paymentStatus';` and replace

```js
    const nextInterest = payments.find(
      (p) => p.receivedAmount == null && p.type === 'interest'
    );
```

with

```js
    const nextInterest = payments.find(
      (p) => !isSettled(project, p) && p.type === 'interest'
    );
```

and replace

```js
    const unpaid = payments.filter((p) => p.receivedAmount == null).length;
```

with

```js
    const unpaid = payments.filter((p) => !isSettled(project, p)).length;
```

- [ ] **Step 7: PaymentConfirmSheet (lines 9, 18, 20)**

This sheet decides Edit versus Confirm and prefills the amount. Keep today's meaning: it is in Edit mode when money has already reached the row. Add `import { rowReceived } from '../../utils/paymentStatus';` and replace

```js
  const isEdit = payment?.receivedAmount != null;
```

with

```js
  const isEdit = !!payment && rowReceived(project, payment) > 0;
```

and inside the effect replace

```js
      if (payment.receivedAmount != null) {
```

with

```js
      if (rowReceived(project, payment) > 0) {
```

and replace

```js
        setAmount(payment.receivedAmount || 0);
```

with

```js
        setAmount(rowReceived(project, payment));
```

- [ ] **Step 8: Verify**

Run: `npm test && npm run build && npx eslint src/components src/utils src/contexts`
Expected: tests and build pass. ESLint will still report the repo's pre-existing errors in unrelated files; none of your changed files may add a new one.

- [ ] **Step 9: Commit**

```bash
git add src/components src/contexts src/utils
git commit -m "refactor: every screen reads payment status from the shared rule"
```

---

### Task 9: Prove nothing moved, in the app

**Files:** none (verification only)

- [ ] **Step 1: Start the dev server**

Use the Browser pane: `preview_start` with the `pusat-gadai-madiun` launch config (port 5174). The app uses hash routing, so navigate by clicking inside it, not by typing a URL — a plain URL navigation reloads and drops you back at the PIN screen. Enter demo mode.

- [ ] **Step 2: Walk the screens that read payment status**

On demo data, confirm each still shows exactly what it showed before this branch:
1. Beranda: the total balance, Masuk and Keluar for the month, the "Lewat jatuh tempo" count and amount, and the active-project summary.
2. Project list: modal aktif, ekspektasi belum cair, the per-card progress ("2/6 pembayaran diterima"), and the next due date.
3. A project's detail: every row's Lunas / Belum pill, the Telat and Segera pills, and the amounts shown per row.
4. Kalender: the days marked as having a project payment due, and a day's detail list.
5. Download a PDF and an Excel with the default columns and confirm the numbers match what the same download produced on `main`.

- [ ] **Step 3: Compare against `main` rather than trusting memory**

Generate the same PDF from `main` (`git stash` is not needed — use a second checkout or simply note the numbers before switching) and compare the totals side by side. Any difference is a bug in this branch, not an improvement.

- [ ] **Step 4: Report**

Report what you compared and what matched. Do **not** merge to `main`; Bagian B1 ships together with B2 or on its own only with Gde's explicit go-ahead.

---

## Deliberately not touched in B1

- **`ProjectCard.jsx` and `CloseProjectSheet.jsx`** read `projectSummary(project)` and `findNextDuePayment(project)` rather than `receivedAmount` directly, so Task 6 fixes them for free. Confirm by grepping for `receivedAmount` in both: there should be no hits.
- **`demoSeedData.js` and `demoReset.js`** do mention `receivedAmount`, but as *writers* — they build the demo documents in today's stored shape. B1 changes no writers, and `normalizeProject` reads that shape correctly, so they stay exactly as they are. Bagian B2 updates them alongside the real writers.
- **The write guards in `DataContext` at lines 589 and 650** (`Pembayaran sudah dikonfirmasi` / `Pembayaran ini belum diterima`) stay untouched. Bagian B3 replaces them when receipts become editable.

## Notes for the stages after this

- **B2** changes the writers: `recordProjectPayment` becomes `recordReceipt`, storing a real `receipts` array. From that moment `normalizeProject` passes those projects straight through, and the readers built here need no further change.
- **B4** adds the `Kurang Bayar` column and relabels the Daftar Tagihan amount. The amount itself is already the remainder as of Task 7.
- **`rowDue` will need extending in B4.** Here it is simply the row's own `expectedAmount`. Once "Gabung sisa ke bulan depan" exists, a row's real due is its own tagihan plus every remainder carried into it, so `rowDue` becomes `expectedAmount + Σ (closure.amount of rows whose closure is { kind: 'carry', toNo: row.no })`. That is why `rowDue` takes the row today but should take the project as well then, and why `rowWaived` deliberately ignores non-waive closures instead of treating every closure as forgiveness.
- The legacy waiver written by `normalizeProject` is derived on read. The B4 migration writes the same waiver into the stored documents, and its dry-run report lists exactly those rows for Gde.
