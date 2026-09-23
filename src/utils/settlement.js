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

  const current = rows.find((r) => r.type === 'interest' && !isSettled(project, r)) || null;
  // With no bagi hasil left, "this month" is the month taken up front.
  const currentInterest = current ? rowRemaining(project, current) : Math.max(0, principal - disbursed);
  const currentPaid = current ? rowReceived(project, current) : 0;

  const shortfall = rows
    .filter((r) => {
      if (r === current || r.type !== 'interest' || rowState(project, r) !== 'kurang') return false;
      const due = toDate(r.dueDate);
      return !!due && due <= today;
    })
    .reduce((s, r) => s + rowRemaining(project, r), 0);

  const final = rows.find((r) => r.type === 'final' && !isSettled(project, r));
  const principalPaid = final ? rowReceived(project, final) : 0;

  const laterDropped = rows.filter((r) => r !== current && !keptOnSettlement(project, r)).length;

  return {
    disbursed,
    currentInterest,
    currentPaid,
    shortfall,
    principalPaid,
    laterDropped,
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
