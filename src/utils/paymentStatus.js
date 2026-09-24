import { toDate } from './formatDate';
import { normalizeProject } from './normalizeProject';

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

// Forgiveness only: a 'waive' closure. Carry, extend and rollover move the
// remainder somewhere else instead; rowRemaining counts all of them through
// rowClosed, and this one stays for code that must tell forgiveness apart.
export function rowWaived(row) {
  const c = row?.closure;
  return c && c.kind === 'waive' ? Number(c.amount) || 0 : 0;
}

const CLOSING_KINDS = new Set(['waive', 'carry', 'extend', 'rollover']);

// The part of this row's remainder a closure dealt with without money:
// forgiven (waive), moved onto a later tagihan (carry), into an extension
// (extend) or into a new contract (rollover). Whatever the kind, it is no
// longer owed on this row.
export function rowClosed(row) {
  const c = row?.closure;
  if (!c || !CLOSING_KINDS.has(c.kind)) return 0;
  return Number(c.amount) || 0;
}

// What earlier tagihan carried onto this one ("Gabung sisa ke bulan depan"):
// the target of a carry asks for its own tagihan plus these.
export function rowCarriedIn(project, row) {
  let sum = 0;
  for (const other of project?.payments || []) {
    const c = other?.closure;
    if (c?.kind === 'carry' && c.toNo === row?.no) sum += Number(c.amount) || 0;
  }
  return sum;
}

// A row with an unknown or zero due still reports a remaining of 0 here,
// the same number a row that truly owes nothing and has been dealt with
// would report. That is deliberate for the unknown case: we genuinely do
// not know what is owed, and inventing a number would be worse than
// reporting none. Do not "fix" this into a guessed amount -- isSettled
// below does not read this 0 as "nothing owed" on its own; see hasActivity.
export function rowRemaining(project, row) {
  return Math.max(
    0,
    rowDue(row) + rowCarriedIn(project, row) - rowReceived(project, row) - rowClosed(row)
  );
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
  return touched || rowClosed(row) > 0;
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

// Partly paid AND due: the case the owner should chase. A tagihan paid partly
// ahead of its due date is in state 'kurang' too, but there the borrower is
// early, not behind, so warnings (the card badge, the Kurang pill, Kurang in
// the collector's list) read this instead of rowState.
export function isShort(project, row, today = new Date()) {
  if (rowState(project, row) !== 'kurang') return false;
  const due = toDate(row?.dueDate);
  return !!due && due <= today;
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

// The arrivals of money that landed inside a period, judged by the day each
// one arrived. A tagihan paid in two instalments in two months belongs partly
// to each; reading the row's last payment date instead would move the first
// instalment into the later month after the fact.
// `inRange` receives the arrival's date as a Date.
export function receiptsWithin(project, inRange) {
  const receipts = receiptsOf(project) || normalizeProject(project)?.receipts || [];
  return receipts.filter((r) => {
    const d = toDate(r?.date);
    return !!d && inRange(d);
  });
}

export function receivedWithin(project, inRange) {
  const list = receiptsWithin(project, inRange);
  return {
    amount: list.reduce((s, r) => s + (Number(r?.amount) || 0), 0),
    count: list.length,
  };
}

export function hasAnyReceipt(project) {
  const receipts = receiptsOf(project);
  if (receipts) return receipts.length > 0;
  return (project?.payments || []).some((p) => p?.receivedAmount != null);
}
