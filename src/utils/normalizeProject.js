/**
 * Presents a stored project in the shape the rest of the app now reads:
 * a `receipts` array, where each entry is one arrival of money carrying its own
 * transaction, allocated to the schedule rows it covers.
 *
 * Applied on read, at the Firestore snapshot, so screens never see two shapes.
 *
 * This does not itself write anything. It does, however, reach stored documents
 * indirectly, because what React state holds is the normalized shape:
 *
 * - recordReceipt, updateProjectPayment and settleProjectEarly write the whole
 *   `receipts` array back, derived entries included. From that write on the
 *   document stores receipts, this function returns it untouched, and nothing
 *   is derived for that project ever again. Every writer that moves money must
 *   therefore keep `receipts` complete: an arrival written only onto a row
 *   reads as unpaid.
 * - updateProject, when a schedule change runs recomputeUnpaidSchedule, writes
 *   `payments` back and so persists the derived `closure` on rows it did not
 *   otherwise touch, without storing receipts.
 *
 * Both are harmless in themselves (the values are exactly what the Bagian B4
 * migration would write, and no amount changes), but the migration has to
 * expect them. It must be idempotent; it must find historical shortfalls by
 * `closure.reason === 'legacy'` rather than by the absence of a closure; and a
 * project that already stores receipts is not finished: its `legacy-`
 * receipts still need `receiptId` on their transactions, and its legacy
 * shortfalls still belong in the report to the owner.
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
