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
 *
 * A row whose due is unknown (expectedAmount is null, undefined, or not a
 * finite number) reports a rowRemaining of 0, same as a row that truly owes
 * nothing -- see the comment on rowRemaining for why. That 0 feeds straight
 * into a SUM if a caller adds rowRemaining across a project's rows to get
 * "how much is still owed" overall: an unknown-due row silently contributes
 * nothing to that total, so the total undercounts by exactly that row's
 * real, unrecorded amount. This is the same thing the old
 * `receivedAmount != null` code did with such a row, so it is not a
 * regression -- but do not treat a summed remainder as trustworthy proof
 * that nothing more is owed on a project that has a row with an unknown
 * amount.
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
      for (const a of Array.isArray(r?.allocations) ? r.allocations : []) {
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

// A row with an unknown or zero due still reports a remaining of 0 here,
// the same number a row that truly owes nothing and has been dealt with
// would report. That is deliberate for the unknown case: we genuinely do
// not know what is owed, and inventing a number would be worse than
// reporting none. Do not "fix" this into a guessed amount -- isSettled
// below does not read this 0 as "nothing owed" on its own; see hasActivity.
export function rowRemaining(project, row) {
  return Math.max(0, rowDue(row) - rowReceived(project, row) - rowWaived(row));
}

// True when something has actually happened to this row, as opposed to a
// remainder of 0 that only means "the due happens to be 0 or unknown, and
// nobody has touched it yet": a receipt has an allocation naming this row
// (whatever that allocation's amount -- an allocation of exactly 0 still
// means someone recorded a receipt against this row, which real confirmed
// data can contain, see the zero-row fixture in statusEquivalence.test.js),
// or, for a project stored in the pre-receipts shape, the row's raw
// receivedAmount is not null, or the row has been waived.
function hasActivity(project, row) {
  const receipts = receiptsOf(project);
  const touched = receipts
    ? receipts.some((r) => (Array.isArray(r?.allocations) ? r.allocations : []).some((a) => a?.no === row?.no))
    : row?.receivedAmount != null;
  return touched || rowWaived(row) > 0;
}

// Settled means the remainder is zero AND something actually happened to
// this row. The remainder alone is not enough: ProjectForm allows a 0%
// return rate, and rounding can take a small instalment to 0, so an
// untouched Rp0 row is a real, reachable shape, not just an edge case --
// and rowRemaining reads that same 0 whether the row was ever touched or
// not (see the comment on rowRemaining above). Without hasActivity, such a
// row would read as settled the instant it is created, and
// recordReceipt's completion check could flip an active project to
// completed with nothing ever having been received or waived.
export function isSettled(project, row) {
  return rowRemaining(project, row) === 0 && hasActivity(project, row);
}

export function rowState(project, row) {
  if (isSettled(project, row)) return 'lunas';
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
