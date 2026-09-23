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
