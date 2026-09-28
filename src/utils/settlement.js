import { isSettled, rowCarriedIn, rowDue, rowReceived, rowRemaining, rowState } from './paymentStatus';
import { normalizeProject } from './normalizeProject';
import { toDate } from './formatDate';
import { currentFinal } from './extension';
import { generateProjectSchedule } from './projectSchedule';
import { deriveRowFields } from './receiptOps';

/**
 * Pelunasan dipercepat, decided as data. DataContext writes the result.
 *
 * The settlement is one more arrival of money, so it must land in `receipts`
 * like every other arrival. Once a project stores a receipts array the reader
 * trusts it completely (see normalizeProject), and a settlement written only
 * onto the rows would read as unpaid: Total Diterima short by the whole
 * pelunasan, the collector sent after money already in the bank.
 */

// Rows the pelunasan leaves in place: anything money reached, and anything
// already closed. The rest of the schedule is dropped.
export function keptOnSettlement(project, row) {
  return row?.receivedAmount != null || isSettled(project, row);
}

// The owner's rule: modal keluar plus this month's bagi hasil. On top of that,
// what a tagihan he has started paying and that is already due is still short,
// and less any pelunasan money that has already come back. The sheet shows the
// parts so the owner can see where the number comes from; he can still type
// another amount.
export function settlementSuggestion(project, today = new Date()) {
  const disbursed = Number(project?.disbursedAmount) || 0;
  const principal = Number(project?.principalAmount) || 0;
  const rows = project?.payments || [];

  const isDue = (r) => {
    const due = toDate(r.dueDate);
    return !!due && due <= today;
  };

  const current = rows.find((r) => r.type === 'interest' && !isSettled(project, r)) || null;
  const laterDropped = rows.filter((r) => r !== current && !keptOnSettlement(project, r)).length;
  const finals = rows.filter((r) => r.type === 'final');
  // Money on a pelunasan pays a tunggakan carried onto it first (Gabung ke
  // bulan depan); only the rest is modal coming back, and a tunggakan not yet
  // paid is still owed on top of the modal.
  const principalPaid = finals.reduce(
    (s, r) => s + Math.max(0, rowReceived(project, r) - rowCarriedIn(project, r)),
    0
  );
  // Only a pelunasan still open: a closed one (Diperpanjang) took its
  // tunggakan into the extension's principal.
  const carriedOntoPelunasan = finals
    .filter((r) => !r.closure)
    .reduce((s, r) => s + Math.max(0, rowCarriedIn(project, r) - rowReceived(project, r)), 0);

  // The pelunasan has already come back in full: a project completed by its
  // payments and reopened by a correction, or a pelunasan paid before the last
  // bagi hasil. There is nothing to settle early, and the owner's rule would
  // ask for the whole modal keluar again. Only what is still owed on tagihan
  // already due is suggested.
  const pelunasanDone = finals.length > 0 && finals.every((r) => isSettled(project, r));
  if (pelunasanDone) {
    const dueLeft = rows
      .filter((r) => !isSettled(project, r) && isDue(r))
      .reduce((s, r) => s + rowRemaining(project, r), 0);
    return {
      disbursed,
      currentInterest: 0,
      currentPaid: 0,
      shortfall: 0,
      principalPaid,
      laterDropped,
      pelunasanDone,
      dueLeft,
      amount: dueLeft,
    };
  }

  // With no bagi hasil left, "this month" is the month taken up front.
  const currentInterest = current ? rowRemaining(project, current) : Math.max(0, principal - disbursed);
  const currentPaid = current ? rowReceived(project, current) : 0;

  const shortfall =
    rows
      .filter((r) => r !== current && r.type === 'interest' && rowState(project, r) === 'kurang' && isDue(r))
      .reduce((s, r) => s + rowRemaining(project, r), 0) + carriedOntoPelunasan;

  const byRule = disbursed + currentInterest + shortfall - principalPaid;

  // After a Mundur or Diperpanjang the owner's rule, which works from modal
  // keluar, can fall below what is left of the principal; the suggestion is
  // then at least that principal, plus what the rule counts as short (Gde,
  // 25 Sep 2026). Like the rule, it leaves out later months nobody has
  // started paying, a tunggakan riding on one included. A project never
  // extended keeps the rule alone.
  const final = currentFinal(project);
  const principalLeft = final
    ? Math.max(
        0,
        rowRemaining(project, final) - Math.max(0, rowCarriedIn(project, final) - rowReceived(project, final))
      )
    : 0;
  const extended = (project?.extensions || []).length > 0;
  const minimum = extended ? principalLeft + shortfall : 0;

  return {
    disbursed,
    currentInterest,
    currentPaid,
    shortfall,
    principalPaid,
    laterDropped,
    pelunasanDone,
    dueLeft: 0,
    principalLeft,
    minimum,
    raisedToMinimum: extended && minimum > byRule,
    amount: Math.max(0, byRule, minimum),
  };
}

/**
 * @param at  the settlement date, already in the shape stored (a Timestamp in
 *            the app, a Date in tests).
 * @returns { payments, receipts, settleNo }
 */
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
    // A tagihan he had started paying is closed by the pelunasan, which is
    // what the suggestion charged for. A row that already carries a closure
    // (an old shortfall) keeps its own.
    const left = rowRemaining(p, row);
    if (left <= 0 || row.closure) return row;
    return { ...row, closure: { kind: 'waive', amount: left, reason: 'settlement', at } };
  });

  const settleNo = kept.reduce((max, row) => Math.max(max, Number(row.no) || 0), 0) + 1;

  const settlementRow = {
    no: settleNo,
    dueDate: at,
    type: 'final',
    expectedAmount: amount,
    ratePct: null,
    receivedAmount: amount,
    receivedDate: at,
    transactionId,
    accountId,
    settledEarly: true,
    dropped,
  };

  const receipt = {
    id: transactionId,
    amount,
    date: at,
    accountId,
    transactionId,
    allocations: [{ no: settleNo, amount }],
  };

  return {
    payments: [...kept, settlementRow],
    receipts: [...(p.receipts || []), receipt],
    settleNo,
  };
}

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
