import { describe, it, expect } from 'vitest';
import { demoProjectLedger } from './demoLedger';

const project = {
  name: 'Toko',
  disbursedAmount: 9_500_000,
  startDate: 'start',
  sourceKey: 'BCA',
  payments: [
    { no: 1, expectedAmount: 450_000, receivedAmount: 450_000, receivedDate: 'd1', accountKey: 'BCA' },
    { no: 2, expectedAmount: 450_000, receivedAmount: 400_000, receivedDate: 'd2', accountKey: 'BRI' },
    { no: 3, expectedAmount: 10_000_000, receivedAmount: null, receivedDate: null, accountKey: null },
  ],
};
let n = 0;
const ledger = () =>
  demoProjectLedger(project, {
    projectId: 'p1',
    newId: () => `id${++n}`,
    accountIdOf: (key) => (key ? `acc-${key}` : null),
  });

describe('demoProjectLedger', () => {
  it('records the modal leaving its source account', () => {
    const l = ledger();
    const funding = l.transactions.find((t) => t.id === l.fundingTransactionId);
    expect(funding).toMatchObject({ type: 'expense', amount: 9_500_000, fromAccount: 'acc-BCA', toAccount: null, date: 'start', projectId: 'p1' });
    expect(funding.description).toBe('Pendanaan project: Toko');
  });

  it('gives every paid tagihan an income with its own amount, account and date', () => {
    const l = ledger();
    const incomes = l.transactions.filter((t) => t.type === 'income');
    expect(incomes).toHaveLength(2);
    for (const pay of l.payments.filter((x) => x.receivedAmount != null)) {
      const tx = incomes.find((t) => t.id === pay.transactionId);
      expect(tx).toMatchObject({ amount: pay.receivedAmount, toAccount: `acc-${pay.accountKey}`, date: pay.receivedDate, projectId: 'p1', paymentNo: pay.no });
    }
  });

  it('leaves an unpaid tagihan without a transaction', () => {
    expect(ledger().payments[2].transactionId).toBeNull();
  });
});
