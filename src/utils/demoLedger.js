/**
 * The transactions a demo project would have had if it had been recorded
 * through the app: the modal leaving its source account, and one income per
 * paid tagihan. Without them the demo's payments point at no transaction, and
 * the correction sheet, which checks the ledger, refuses to edit them.
 * `newId()` gives a fresh document id; `accountIdOf(key)` maps a seed key.
 * @returns {{ fundingTransactionId, payments, transactions }}
 */
export function demoProjectLedger(project, { projectId, newId, accountIdOf }) {
  const transactions = [];
  const fundingTransactionId = newId();
  transactions.push({
    id: fundingTransactionId,
    type: 'expense',
    amount: project.disbursedAmount,
    description: `Pendanaan project: ${project.name}`,
    date: project.startDate,
    fromAccount: accountIdOf(project.sourceKey),
    toAccount: null,
    debtId: null,
    projectId,
  });
  const payments = (project.payments || []).map((pay) => {
    if (pay.receivedAmount == null) return { ...pay, transactionId: null };
    const id = newId();
    transactions.push({
      id,
      type: 'income',
      amount: pay.receivedAmount,
      description: `Pembayaran project: ${project.name} (bln ${pay.no})`,
      date: pay.receivedDate,
      fromAccount: null,
      toAccount: accountIdOf(pay.accountKey),
      debtId: null,
      projectId,
      paymentNo: pay.no,
    });
    return { ...pay, transactionId: id };
  });
  return { fundingTransactionId, payments, transactions };
}
