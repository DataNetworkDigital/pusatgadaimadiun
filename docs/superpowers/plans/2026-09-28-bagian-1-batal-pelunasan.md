# Bagian 1: Batalkan Pelunasan Dipercepat Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A project closed by pelunasan dipercepat can be put back exactly as it was before the pelunasan: its money leaves the account, the tagihan it removed come back, and the project is active again.

**Architecture:** `applySettlement` starts recording what it removes (`dropped` on the settlement row, `replaced` on a carry it turns into a waive). A pure `applySettlementUndo` in `settlement.js` reverses a settlement from that record, or rebuilds the removed rows from the contract for a settlement recorded before this change. DataContext's `undoSettlement` reverses the settlement transaction inside `inProjectTransaction`, and ProjectDetail offers the undo behind a ConfirmDialog that explains the effect.

**Tech Stack:** React 19, Vite 8, Firebase Firestore, Vitest 5. Spec: `docs/superpowers/specs/2026-09-28-koreksi-modal-batal-pelunasan-pokok-design.md` §3.

---

## File Structure

| File | Change |
|---|---|
| `src/utils/settlement.js` | `applySettlement` records `dropped` and `replaced`; new `applySettlementUndo`, `settlementUndoPreview`. |
| `src/utils/settlement.test.js` | One existing expectation gains `dropped`; new tests for the record, the undo and the preview. |
| `src/contexts/DataContext.jsx` | New writer `undoSettlement`, exported in `value`. |
| `src/components/Projects/ProjectDetail.jsx` | Button "Batalkan pelunasan dipercepat" and its ConfirmDialog. |

### Task 1: A settlement keeps what it removes

**Files:**
- Modify: `src/utils/settlement.js` (`applySettlement`)
- Test: `src/utils/settlement.test.js`

- [ ] **Step 1: Write the failing tests**

In `src/utils/settlement.test.js`, the test `'drops tagihan nothing was paid on, and makes the pelunasan the last row'` expects the settlement row exactly. Add `dropped` to that expectation, so the object ends:

```js
      accountId: 'bca',
      settledEarly: true,
      dropped: p.payments.filter((r) => r.no !== 1),
    });
```

Inside `describe('settling after a tunggakan was carried', ...)`, after the test `'keeps a carry whose target the pelunasan keeps'`, add:

```js
  it('keeps the carry it closes, so an undo can give it back', () => {
    const p = carried(paid(base(), [{ no: 1, amount: 5_500_000 }]), 2, 3, 5_500_000);
    const out = applySettlement(p, { amount: 105_500_000, at, accountId: 'bca', transactionId: 'tx-s' });
    expect(out.payments.find((r) => r.no === 2).closure).toEqual({
      kind: 'waive',
      amount: 5_500_000,
      reason: 'settlement',
      at,
      replaced: { kind: 'carry', amount: 5_500_000, toNo: 3 },
    });
    expect(out.payments.find((r) => r.settledEarly).dropped.map((r) => r.no)).toEqual([3, 4]);
  });
```

- [ ] **Step 2: Run the tests to see them fail**

Run: `npx vitest run src/utils/settlement.test.js`
Expected: 2 failures (no `dropped` on the settlement row, no `replaced` on the waive).

- [ ] **Step 3: Record them in `applySettlement`**

In `src/utils/settlement.js`, replace the start of `applySettlement` up to the carry conversion:

```js
export function applySettlement(project, { amount, at, accountId, transactionId }) {
  const p = normalizeProject(project);

  const keptRows = (p.payments || []).filter((row) => keptOnSettlement(p, row));
  // What the pelunasan removes stays on its own row, so it can be undone.
  const dropped = (p.payments || []).filter((row) => !keptOnSettlement(p, row));
  const keptNos = new Set(keptRows.map((row) => row.no));
  const kept = keptRows.map((row) => {
    // A tunggakan carried onto a tagihan the pelunasan drops is closed by the
    // pelunasan, like the tagihan itself: the suggestion charges it when it
    // sits on this month or on the pelunasan, and drops it with a later month
    // otherwise (the owner's rule never charges a later untouched month).
    // Left as a carry it would point at a row that is gone, and the
    // pelunasan, numbered after the kept rows, could take that number and ask
    // for the tunggakan again. The carry is kept for an undo.
    if (row.closure?.kind === 'carry' && !keptNos.has(row.closure.toNo)) {
      return {
        ...row,
        closure: { kind: 'waive', amount: row.closure.amount, reason: 'settlement', at, replaced: row.closure },
      };
    }
```

and in the same function add `dropped` to `settlementRow`, after `settledEarly: true,`:

```js
    settledEarly: true,
    dropped,
  };
```

- [ ] **Step 4: Run the tests to see them pass**

Run: `npx vitest run src/utils/settlement.test.js`
Expected: all tests in the file pass.

- [ ] **Step 5: Commit**

```bash
git add src/utils/settlement.js src/utils/settlement.test.js
git commit -m "feat: a pelunasan dipercepat keeps the rows and carries it removes"
```

### Task 2: Undo a settlement as data

**Files:**
- Modify: `src/utils/settlement.js`
- Test: `src/utils/settlement.test.js`

- [ ] **Step 1: Write the failing tests**

Change the imports at the top of `src/utils/settlement.test.js` to:

```js
import { describe, it, expect } from 'vitest';
import { applySettlement, applySettlementUndo, settlementSuggestion, settlementUndoPreview } from './settlement';
import { applyExtension } from './extension';
import { isSettled, projectReceivedTotal, rowRemaining } from './paymentStatus';
import { deriveRowFields } from './receiptOps';
import { toDate } from './formatDate';
```

Append at the end of the file:

```js
describe('applySettlementUndo', () => {
  const at = new Date(2026, 8, 23);
  const carriedOnto = (project, no, toNo, amount) => ({
    ...project,
    payments: project.payments.map((r) => (r.no === no ? { ...r, closure: { kind: 'carry', amount, toNo } } : r)),
  });
  // The project as the writer leaves it after a pelunasan dipercepat.
  const settledWith = (p, amount) => {
    const out = applySettlement(p, { amount, at, accountId: 'bca', transactionId: 'tx-s' });
    return { ...p, payments: out.payments, receipts: out.receipts, status: 'completed', closedAt: at, settledEarly: true };
  };
  // Rows compared the way the writers store them.
  const asStored = (p) => deriveRowFields(p.payments, p.receipts);

  it('puts back the rows it removed and takes its money out of receipts', () => {
    const p = paid(base(), [{ no: 1, amount: 5_500_000 }]);
    const { update, removed } = applySettlementUndo(settledWith(p, 100_000_000));
    expect(removed.map((r) => r.id)).toEqual(['tx-s']);
    expect(update.payments).toEqual(asStored(p));
    expect(update.receipts).toEqual(p.receipts);
    expect(update).toMatchObject({ status: 'active', closedAt: null, settledEarly: false });
  });

  it('opens again a month it closed, which is billed its remainder', () => {
    const p = paid(base(), [
      { no: 1, amount: 5_500_000 },
      { no: 2, amount: 5_500_000 },
      { no: 3, amount: 3_000_000 },
    ]);
    const settled = settledWith(p, 97_000_000);
    const { update } = applySettlementUndo(settled);
    expect(update.payments).toEqual(asStored(p));
    const after = { ...settled, ...update };
    expect(rowRemaining(after, after.payments.find((r) => r.no === 3))).toBe(2_500_000);
  });

  it('gives a tunggakan back to the month it was carried onto', () => {
    const p = carriedOnto(paid(base(), [{ no: 1, amount: 5_500_000 }]), 2, 3, 5_500_000);
    const { update } = applySettlementUndo(settledWith(p, 105_500_000));
    expect(update.payments).toEqual(asStored(p));
  });

  it('removes an edited pelunasan whole', () => {
    const p = paid(base(), [{ no: 1, amount: 5_500_000 }]);
    const settled = settledWith(p, 100_000_000);
    const edited = {
      ...settled,
      receipts: settled.receipts.map((r) =>
        r.id === 'tx-s' ? { ...r, amount: 90_000_000, allocations: [{ no: 2, amount: 90_000_000 }] } : r
      ),
    };
    const { update, removed } = applySettlementUndo(edited);
    expect(removed.map((r) => r.amount)).toEqual([90_000_000]);
    expect(update.payments).toEqual(asStored(p));
  });

  it('rebuilds from the contract a pelunasan recorded before it kept its rows (SAWAH KOTA SISWATI 2)', () => {
    const d = (month, day) => new Date(2026, month, day);
    const project = {
      principalAmount: 320_000_000,
      disbursedAmount: 302_400_000,
      monthlyReturnPct: 5.5,
      returnPctTier1: 5.5,
      returnPctTier2: 6.5,
      durationMonths: 3,
      startDate: d(6, 17),
      paymentDayOfMonth: 17,
      status: 'completed',
      settledEarly: true,
      closedAt: d(8, 25),
      payments: [
        { no: 1, type: 'interest', dueDate: d(7, 17), expectedAmount: 17_600_000, ratePct: 5.5, receivedAmount: 17_600_000 },
        {
          no: 3, type: 'final', dueDate: d(9, 17), expectedAmount: 320_000_000, ratePct: null, receivedAmount: 38_000_000,
          closure: { kind: 'waive', amount: 282_000_000, reason: 'settlement', at: d(8, 25) },
        },
        {
          no: 4, type: 'final', dueDate: d(8, 25), expectedAmount: 282_000_000, ratePct: null,
          receivedAmount: 282_000_000, settledEarly: true,
        },
      ],
      receipts: [
        { id: 'legacy-1', amount: 17_600_000, date: d(7, 17), accountId: 'bca', transactionId: 't1', allocations: [{ no: 1, amount: 17_600_000 }] },
        { id: 'r38', amount: 38_000_000, date: d(8, 20), accountId: 'bca', transactionId: 't38', allocations: [{ no: 3, amount: 38_000_000 }] },
        { id: 'ts', amount: 282_000_000, date: d(8, 25), accountId: 'bca', transactionId: 'ts', allocations: [{ no: 4, amount: 282_000_000 }] },
      ],
    };
    const { update, removed } = applySettlementUndo(project);
    expect(removed.map((r) => r.id)).toEqual(['ts']);
    expect(update.payments.map((r) => r.no)).toEqual([1, 2, 3]);
    expect(update.payments[1]).toMatchObject({ type: 'interest', expectedAmount: 17_600_000, ratePct: 5.5, receivedAmount: null });
    expect(toDate(update.payments[1].dueDate)).toEqual(d(8, 17));
    expect(update.payments[2].closure).toBeUndefined();
    const after = { ...project, ...update };
    expect(rowRemaining(after, update.payments[2])).toBe(282_000_000);
    expect(update).toMatchObject({ status: 'active', closedAt: null, settledEarly: false });
  });

  it('refuses a project that was not closed by pelunasan dipercepat', () => {
    expect(() => applySettlementUndo(paid(base(), [{ no: 1, amount: 5_500_000 }]))).toThrow(
      'tidak ditutup lewat pelunasan dipercepat'
    );
  });

  it('refuses to rebuild an old pelunasan once the schedule was extended', () => {
    const settled = settledWith(paid(base(), [{ no: 1, amount: 5_500_000 }]), 100_000_000);
    const old = {
      ...settled,
      extensions: [{ id: 'e1' }],
      payments: settled.payments.map((r) => {
        const row = { ...r };
        delete row.dropped;
        return row;
      }),
    };
    expect(() => applySettlementUndo(old)).toThrow('tidak bisa dibatalkan otomatis');
  });

  it('refuses when the pelunasan money also paid another month', () => {
    const settled = settledWith(paid(base(), [{ no: 1, amount: 5_500_000 }]), 100_000_000);
    const odd = {
      ...settled,
      receipts: settled.receipts.map((r) =>
        r.id === 'tx-s' ? { ...r, allocations: [...r.allocations, { no: 1, amount: 1 }] } : r
      ),
    };
    expect(() => applySettlementUndo(odd)).toThrow('juga membayar tagihan lain');
  });
});

describe('settlementUndoPreview', () => {
  const at = new Date(2026, 8, 23);

  it('says what comes back, what is billed again and where the money leaves from', () => {
    const p = paid(base(), [{ no: 1, amount: 5_500_000 }, { no: 2, amount: 2_000_000 }]);
    const out = applySettlement(p, { amount: 100_000_000, at, accountId: 'bca', transactionId: 'tx-s' });
    const settled = { ...p, ...out, status: 'completed', closedAt: at, settledEarly: true };
    expect(settlementUndoPreview(settled)).toEqual({
      ok: true,
      why: null,
      amount: 100_000_000,
      accountId: 'bca',
      status: 'active',
      restored: [
        { no: 3, type: 'interest', amount: 5_500_000 },
        { no: 4, type: 'final', amount: 100_000_000 },
      ],
      reopened: [{ no: 2, amount: 3_500_000 }],
    });
  });

  it('explains instead of throwing', () => {
    expect(settlementUndoPreview(base())).toMatchObject({
      ok: false,
      why: expect.stringContaining('pelunasan dipercepat'),
    });
  });
});
```

- [ ] **Step 2: Run the tests to see them fail**

Run: `npx vitest run src/utils/settlement.test.js`
Expected: FAIL, `applySettlementUndo` and `settlementUndoPreview` are not exported.

- [ ] **Step 3: Implement**

In `src/utils/settlement.js`, change the imports to:

```js
import { isSettled, rowCarriedIn, rowDue, rowReceived, rowRemaining, rowState } from './paymentStatus';
import { normalizeProject } from './normalizeProject';
import { toDate } from './formatDate';
import { currentFinal } from './extension';
import { generateProjectSchedule } from './projectSchedule';
import { deriveRowFields } from './receiptOps';
```

Append at the end of the file:

```js
const byNo = (a, b) => (Number(a.no) || 0) - (Number(b.no) || 0);

// The rows a pelunasan removed. Kept on its row since 28 Sep 2026; before
// that they are rebuilt from the contract, which only works while no
// extension or contract-day row has changed the schedule.
function droppedRows(project, settleRow, left) {
  if (Array.isArray(settleRow.dropped)) return settleRow.dropped;
  const changed = (project.extensions || []).length > 0 || left.some((r) => r.leadCharge);
  if (changed || !project.startDate) {
    throw new Error(
      'Pelunasan ini dicatat sebelum ada tombol batal dan jadwalnya pernah diubah, jadi tidak bisa dibatalkan otomatis.'
    );
  }
  const leftNos = new Set(left.map((r) => r.no));
  return generateProjectSchedule(project).filter((r) => !leftNos.has(r.no));
}

/**
 * Undoing a pelunasan dipercepat, decided as data (spec 2026-09-28 §3).
 * Everything the pelunasan changed goes back: its money leaves receipts, the
 * rows it removed return, and what it closed opens again. Reversing its
 * transaction is DataContext's job.
 * @returns {{ update, removed, restored }} `removed` are the pelunasan's
 *          receipts, `restored` the rows brought back.
 */
export function applySettlementUndo(project) {
  const p = normalizeProject(project);
  if (!p?.settledEarly || p.status !== 'completed') {
    throw new Error('Project ini tidak ditutup lewat pelunasan dipercepat.');
  }
  const settleRow = (p.payments || []).find((r) => r.settledEarly);
  if (!settleRow) throw new Error('Baris pelunasan dipercepat tidak ditemukan.');

  const removed = (p.receipts || []).filter((r) => (r.allocations || []).some((a) => a.no === settleRow.no));
  if (!removed.length) throw new Error('Uang pelunasan dipercepat tidak ditemukan.');
  if (removed.some((r) => r.allocations.some((a) => a.no !== settleRow.no))) {
    throw new Error('Uang pelunasan dipercepat juga membayar tagihan lain, jadi tidak bisa dibatalkan otomatis.');
  }

  const left = p.payments.filter((r) => r !== settleRow);
  const restored = droppedRows(p, settleRow, left);
  const receipts = (p.receipts || []).filter((r) => !removed.includes(r));
  const rows = [...left, ...restored].sort(byNo);
  const measured = { ...p, payments: rows, receipts };

  // What the pelunasan closed opens again. A carry it had turned into a waive
  // comes back, measured again: a correction since may have changed what the
  // month lacks.
  const payments = rows.map((row) => {
    const c = row.closure;
    if (c?.kind !== 'waive' || c.reason !== 'settlement') return row;
    const next = { ...row };
    delete next.closure;
    const carry = c.replaced;
    if (carry?.kind === 'carry' && rows.some((r) => r.no === carry.toNo)) {
      const lacking = rowDue(row) + rowCarriedIn(measured, row) - rowReceived(measured, row);
      if (lacking > 0) next.closure = { ...carry, amount: lacking };
    }
    return next;
  });

  const derived = deriveRowFields(payments, receipts);
  const after = { ...p, payments: derived, receipts };
  const allSettled = derived.length > 0 && derived.every((row) => isSettled(after, row));
  return {
    update: {
      payments: derived,
      receipts,
      status: allSettled ? 'completed' : 'active',
      closedAt: allSettled ? p.closedAt ?? null : null,
      settledEarly: false,
    },
    removed,
    restored,
  };
}

/**
 * What undoing the pelunasan would do, for the confirmation. Never throws.
 * @returns {{ ok, why, amount, accountId, status, restored: [{ no, type, amount }], reopened: [{ no, amount }] }}
 */
export function settlementUndoPreview(project) {
  try {
    const { update, removed, restored } = applySettlementUndo(project);
    const after = { ...normalizeProject(project), ...update };
    const restoredNos = new Set(restored.map((r) => r.no));
    const left = (row) => rowRemaining(after, row);
    return {
      ok: true,
      why: null,
      amount: removed.reduce((s, r) => s + (Number(r.amount) || 0), 0),
      accountId: removed[0].accountId ?? null,
      status: update.status,
      restored: update.payments
        .filter((r) => restoredNos.has(r.no))
        .map((r) => ({ no: r.no, type: r.type, amount: left(r) })),
      reopened: update.payments
        .filter((r) => !restoredNos.has(r.no) && left(r) > 0)
        .map((r) => ({ no: r.no, amount: left(r) })),
    };
  } catch (e) {
    return { ok: false, why: e.message, amount: 0, accountId: null, status: null, restored: [], reopened: [] };
  }
}
```

- [ ] **Step 4: Run the tests to see them pass**

Run: `npx vitest run src/utils/settlement.test.js`
Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add src/utils/settlement.js src/utils/settlement.test.js
git commit -m "feat: undo a pelunasan dipercepat as data, rebuilding old ones from the contract"
```

### Task 3: The writer

**Files:**
- Modify: `src/contexts/DataContext.jsx`

- [ ] **Step 1: Import**

Change `import { applySettlement } from '../utils/settlement';` to:

```js
import { applySettlement, applySettlementUndo } from '../utils/settlement';
```

- [ ] **Step 2: Add `undoSettlement` after `settleProjectEarly`**

Insert right after the closing `}` of `settleProjectEarly`:

```js

  // Undo a pelunasan dipercepat (spec 2026-09-28 §3): its money leaves the
  // account as its transaction says now, and the schedule goes back to what
  // it was before the pelunasan.
  async function undoSettlement(projectId, { seenWriteId } = {}) {
    const outcome = await inProjectTransaction(projectId, async (t, project, ref, writeId) => {
      const { update, removed } = applySettlementUndo(project);
      // Reads before writes: the transactions, then the accounts they touch.
      // A transaction or account deleted since cannot be reversed.
      const found = [];
      for (const receipt of removed) {
        const txRef = receipt.transactionId ? doc(db, C('transactions'), receipt.transactionId) : null;
        const txSnap = txRef ? await t.get(txRef) : null;
        if (txSnap?.exists()) found.push({ txRef, tx: txSnap.data() });
      }
      const deltas = new Map();
      for (const { tx } of found) {
        for (const [accountId, amount] of reversalOf(tx)) {
          if (accountId) deltas.set(accountId, (deltas.get(accountId) || 0) + amount);
        }
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
      for (const { txRef } of found) t.delete(txRef);
      t.update(ref, { ...update, lastWriteId: writeId });
      return { status: update.status, balanceMoved: accountWrites.length > 0 };
    }, {
      // Undone already: by this call's own earlier attempt whose answer was
      // lost, or by another device.
      alreadyDone: (p) => !p.settledEarly,
      seenWriteId,
    });
    const base =
      outcome?.status === 'completed'
        ? 'Pelunasan dipercepat dibatalkan'
        : 'Pelunasan dipercepat dibatalkan, project aktif lagi';
    toast(
      outcome && !outcome.balanceMoved
        ? `${base}. Saldo tidak diubah karena transaksi atau rekeningnya sudah tidak ada`
        : base
    );
  }
```

- [ ] **Step 3: Export it**

In `const value = {`, change `closeProjectAsDefault, settleProjectEarly, deleteProject,` to:

```js
    addProject, updateProject, recordReceipt, updateReceipt, moveReceipt, cancelReceipt, closeRemainder, reopenRemainder, extendProject, undoExtension, rolloverProject, closeProjectAsDefault, settleProjectEarly, undoSettlement, deleteProject,
```

- [ ] **Step 4: Build**

Run: `npx vite build 2>&1 | tail -3`
Expected: `✓ built in …`

- [ ] **Step 5: Commit**

```bash
git add src/contexts/DataContext.jsx
git commit -m "feat: undoSettlement reverses a pelunasan dipercepat and its money"
```

### Task 4: The button

**Files:**
- Modify: `src/components/Projects/ProjectDetail.jsx`

- [ ] **Step 1: Import the preview**

Add after the other `../../utils/` imports:

```js
import { settlementUndoPreview } from '../../utils/settlement';
```

- [ ] **Step 2: The confirmation text**

Add above `export default function ProjectDetail()`:

```js
// The confirmation for undoing a pelunasan dipercepat, from its preview.
function settleUndoMessage(preview, accountName) {
  if (!preview.ok) return preview.why;
  const label = (r) => (r.type === 'final' ? `pelunasan bulan ${r.no}` : `bulan ${r.no}`);
  const parts = [
    `Uang pelunasan ${formatCurrency(preview.amount)} ditarik lagi dari ${accountName(preview.accountId)}.`,
  ];
  if (preview.restored.length) {
    parts.push(
      `Tagihan yang terhapus waktu pelunasan muncul lagi: ${preview.restored
        .map((r) => `${label(r)} (${formatCurrency(r.amount)})`)
        .join(', ')}.`
    );
  }
  if (preview.reopened.length) {
    parts.push(
      `${preview.reopened.map((r) => `Sisa bulan ${r.no} (${formatCurrency(r.amount)})`).join(', ')} ditagih lagi.`
    );
  }
  parts.push(preview.status === 'active' ? 'Project aktif lagi.' : 'Project tetap selesai.');
  return parts.join(' ');
}
```

- [ ] **Step 3: State and writer**

Add `undoSettlement` to the `useData()` destructuring (after `settleProjectEarly,`), and after `const [undoingExtension, setUndoingExtension] = useState(null);` add:

```js
  const [undoingSettlement, setUndoingSettlement] = useState(false);
```

After `const reopen = reopenNo !== null ? reopenPreview(project, reopenNo) : { ok: false, message: '' };` add:

```js
  const settleUndo = undoingSettlement ? settlementUndoPreview(project) : null;
```

- [ ] **Step 4: Button and dialog**

After the `{isActive && ( <div className="space-y-2 mb-3.5"> … </div> )}` block, add:

```jsx
      {isCompleted && project.settledEarly && (
        <button
          type="button"
          onClick={() => setUndoingSettlement(true)}
          className="w-full py-3 mb-3.5 rounded-xl bg-terra-soft text-terra font-semibold text-[14px] active:opacity-80"
        >
          Batalkan pelunasan dipercepat
        </button>
      )}
```

After the ConfirmDialog for `undoingExtension`, add:

```jsx
      <ConfirmDialog
        open={undoingSettlement}
        onClose={() => setUndoingSettlement(false)}
        onConfirm={async () => {
          try {
            await undoSettlement(project.id, { seenWriteId: project.lastWriteId ?? null });
          } catch (e) {
            showToast(e.message || 'Gagal membatalkan pelunasan');
          }
        }}
        title="Batalkan pelunasan dipercepat?"
        message={settleUndo ? settleUndoMessage(settleUndo, accountName) : ''}
        confirmLabel="Ya, batalkan"
        confirmDisabled={!settleUndo?.ok}
      />
```

- [ ] **Step 5: Build and lint**

Run: `npx vite build 2>&1 | tail -2 && npx eslint src/components/Projects/ProjectDetail.jsx src/utils/settlement.js src/contexts/DataContext.jsx`
Expected: build succeeds; no new lint errors in these files (compare with `git stash` if unsure).

- [ ] **Step 6: Commit**

```bash
git add src/components/Projects/ProjectDetail.jsx
git commit -m "feat: Batalkan pelunasan dipercepat on the project page"
```

### Task 5: Verify

- [ ] **Step 1: Full suite**

Run: `npx vitest run 2>&1 | tail -4`
Expected: all test files pass.

- [ ] **Step 2: Dry run on the real settlement (read-only)**

Copy a vitest script into `src/` that reads `projects/1kejP7g2KZeynkkadp6V` (SAWAH KOTA SISWATI 2) from production, runs `settlementUndoPreview` on it and prints the result; never writes. Expected: `ok: true`, amount 282.000.000, restored bulan 2 Rp 17.600.000, reopened bulan 3 Rp 282.000.000, status active. Delete the script afterwards; `git status` must be clean.

- [ ] **Step 3: Demo run in the browser**

Dev server (`preview_start` "pusat-gadai-madiun"), demo mode. On the active demo project: note Total Diterima and the account balances; pay part of a month; Tutup: Pelunasan with the suggested amount into one account; project SELESAI and the button "Batalkan pelunasan dipercepat" shows; the dialog names the account, the months coming back and the month billed again; confirm; the project is AKTIF, its rows are back, Total Diterima and the account balance equal the values before the pelunasan, and the Transaksi page no longer lists the pelunasan. No console errors.

- [ ] **Step 4: Restore the demo data**

Mark `demo_config/settings.lastResetDate` stale and reload the demo once; it reseeds (Rp 27.100.000, 1 project aktif).
