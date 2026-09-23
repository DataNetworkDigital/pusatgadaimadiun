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
