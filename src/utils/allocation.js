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
