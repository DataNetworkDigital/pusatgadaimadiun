import { isSettled, rowReceived, rowRemaining, rowState } from './paymentStatus';
import { normalizeProject } from './normalizeProject';
import { toDate } from './formatDate';

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
  const principalPaid = finals.reduce((s, r) => s + rowReceived(project, r), 0);

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

  const shortfall = rows
    .filter((r) => r !== current && r.type === 'interest' && rowState(project, r) === 'kurang' && isDue(r))
    .reduce((s, r) => s + rowRemaining(project, r), 0);

  return {
    disbursed,
    currentInterest,
    currentPaid,
    shortfall,
    principalPaid,
    laterDropped,
    pelunasanDone,
    dueLeft: 0,
    amount: Math.max(0, disbursed + currentInterest + shortfall - principalPaid),
  };
}

/**
 * @param at  the settlement date, already in the shape stored (a Timestamp in
 *            the app, a Date in tests).
 * @returns { payments, receipts, settleNo }
 */
export function applySettlement(project, { amount, at, accountId, transactionId }) {
  const p = normalizeProject(project);

  const kept = (p.payments || [])
    .filter((row) => keptOnSettlement(p, row))
    .map((row) => {
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
