import { describe, it, expect } from 'vitest';
import { applySettlement, settlementSuggestion } from './settlement';
import { isSettled, projectReceivedTotal } from './paymentStatus';

// Nilai project 100jt, modal keluar 94,5jt (one month of 5,5% taken up front),
// three monthly bagi hasil of 5,5jt and the pelunasan in month four.
const due = (month) => new Date(2026, month, 5);
const schedule = () => [
  { no: 1, type: 'interest', expectedAmount: 5_500_000, dueDate: due(6), receivedAmount: null },
  { no: 2, type: 'interest', expectedAmount: 5_500_000, dueDate: due(7), receivedAmount: null },
  { no: 3, type: 'interest', expectedAmount: 5_500_000, dueDate: due(8), receivedAmount: null },
  { no: 4, type: 'final', expectedAmount: 100_000_000, dueDate: due(9), receivedAmount: null },
];
const base = (over = {}) => ({
  principalAmount: 100_000_000,
  disbursedAmount: 94_500_000,
  status: 'active',
  payments: schedule(),
  ...over,
});

// Leaves rows the way the writers do: receivedAmount on the row, and, for a
// project that stores receipts, one receipt per arrival.
function paid(project, entries, { stored = true } = {}) {
  const payments = project.payments.map((r) => {
    const e = entries.find((x) => x.no === r.no);
    return e
      ? { ...r, receivedAmount: e.amount, receivedDate: due(r.no + 5), accountId: 'bca', transactionId: `tx-${r.no}` }
      : r;
  });
  if (!stored) return { ...project, payments };
  const receipts = entries.map((e) => ({
    id: e.id || `tx-${e.no}`,
    amount: e.amount,
    date: due(e.no + 5),
    accountId: 'bca',
    transactionId: `tx-${e.no}`,
    allocations: [{ no: e.no, amount: e.amount }],
  }));
  return { ...project, payments, receipts };
}

const at = new Date(2026, 8, 23);
const settle = (project, amount) =>
  applySettlement(project, { amount, at, accountId: 'bca', transactionId: 'tx-s' });

describe('applySettlement', () => {
  it('adds the settlement to receipts, so it counts as received', () => {
    const p = paid(base(), [
      { no: 1, amount: 5_500_000, id: 'legacy-1' },
      { no: 2, amount: 5_500_000 },
      { no: 3, amount: 3_000_000 },
    ]);
    const out = settle(p, 97_000_000);
    const after = { ...p, ...out };

    expect(out.receipts).toHaveLength(4);
    expect(out.receipts[3]).toEqual({
      id: 'tx-s',
      amount: 97_000_000,
      date: at,
      accountId: 'bca',
      transactionId: 'tx-s',
      allocations: [{ no: 4, amount: 97_000_000 }],
    });
    expect(projectReceivedTotal(after)).toBe(5_500_000 + 5_500_000 + 3_000_000 + 97_000_000);
    for (const row of out.payments) expect(isSettled(after, row)).toBe(true);
  });

  it('closes what a kept tagihan still owes as settled by the pelunasan', () => {
    const p = paid(base(), [
      { no: 1, amount: 5_500_000 },
      { no: 2, amount: 5_500_000 },
      { no: 3, amount: 3_000_000 },
    ]);
    const out = settle(p, 97_000_000);
    expect(out.payments.find((r) => r.no === 3).closure).toEqual({
      kind: 'waive',
      amount: 2_500_000,
      reason: 'settlement',
      at,
    });
    expect(out.payments.find((r) => r.no === 2).closure).toBeUndefined();
  });

  it('drops tagihan nothing was paid on, and makes the pelunasan the last row', () => {
    const p = paid(base(), [{ no: 1, amount: 5_500_000 }]);
    const out = settle(p, 100_000_000);
    expect(out.settleNo).toBe(2);
    expect(out.payments.map((r) => r.no)).toEqual([1, 2]);
    expect(out.payments[1]).toEqual({
      no: 2,
      dueDate: at,
      type: 'final',
      expectedAmount: 100_000_000,
      ratePct: null,
      receivedAmount: 100_000_000,
      receivedDate: at,
      transactionId: 'tx-s',
      accountId: 'bca',
      settledEarly: true,
    });
  });

  it('keeps a tagihan paid ahead of time and numbers the pelunasan after it', () => {
    const p = paid(base(), [{ no: 1, amount: 5_500_000 }, { no: 3, amount: 1_500_000 }]);
    const out = settle(p, 100_000_000);
    expect(out.payments.map((r) => r.no)).toEqual([1, 3, 4]);
    expect(out.settleNo).toBe(4);
  });

  it('writes the arrivals of a project that has never stored receipts alongside the settlement', () => {
    const p = paid(base(), [{ no: 1, amount: 5_500_000 }, { no: 2, amount: 5_000_000 }], { stored: false });
    const out = settle(p, 100_000_000);
    const after = { ...p, ...out };

    expect(out.receipts.map((r) => r.id)).toEqual(['legacy-1', 'legacy-2', 'tx-s']);
    // The old shortfall keeps its own reason; the pelunasan does not claim it.
    expect(out.payments.find((r) => r.no === 2).closure).toEqual({
      kind: 'waive',
      amount: 500_000,
      reason: 'legacy',
    });
    expect(projectReceivedTotal(after)).toBe(5_500_000 + 5_000_000 + 100_000_000);
    for (const row of out.payments) expect(isSettled(after, row)).toBe(true);
  });
});

describe('settlementSuggestion', () => {
  const today = new Date(2026, 8, 23); // after bulan 3 fell due (5 Sep)

  it('is modal keluar plus this month\'s bagi hasil when nothing is partly paid', () => {
    const p = paid(base(), [{ no: 1, amount: 5_500_000 }, { no: 2, amount: 5_500_000 }]);
    const s = settlementSuggestion(p, today);
    expect(s.disbursed).toBe(94_500_000);
    expect(s.currentInterest).toBe(5_500_000);
    expect(s.amount).toBe(100_000_000);
  });

  it('asks only for what is left of this month\'s bagi hasil', () => {
    const p = paid(base(), [
      { no: 1, amount: 5_500_000 },
      { no: 2, amount: 5_500_000 },
      { no: 3, amount: 3_000_000 },
    ]);
    const s = settlementSuggestion(p, today);
    expect(s.currentPaid).toBe(3_000_000);
    expect(s.currentInterest).toBe(2_500_000);
    expect(s.amount).toBe(97_000_000);
  });

  it('adds what a later tagihan that is already due is still short', () => {
    // Bulan 2 untouched (this month), bulan 3 paid 3jt on its own and due.
    const p = paid(base(), [{ no: 1, amount: 5_500_000 }, { no: 3, amount: 3_000_000 }]);
    const s = settlementSuggestion(p, today);
    expect(s.currentInterest).toBe(5_500_000);
    expect(s.shortfall).toBe(2_500_000);
    expect(s.amount).toBe(102_500_000);
  });

  it('does not charge a tagihan that is not due yet because part of it was paid early', () => {
    const early = new Date(2026, 7, 20); // before bulan 3 falls due
    const p = paid(base(), [{ no: 1, amount: 5_500_000 }, { no: 3, amount: 3_000_000 }]);
    const s = settlementSuggestion(p, early);
    expect(s.shortfall).toBe(0);
    expect(s.amount).toBe(100_000_000);
  });

  it('takes off pelunasan money that has already arrived', () => {
    const p = paid(base(), [
      { no: 1, amount: 5_500_000 },
      { no: 2, amount: 5_500_000 },
      { no: 3, amount: 5_500_000 },
      { no: 4, amount: 40_000_000 },
    ]);
    const s = settlementSuggestion(p, today);
    expect(s.principalPaid).toBe(40_000_000);
    // 94,5jt + the month taken up front (5,5jt) - 40jt already back
    expect(s.amount).toBe(60_000_000);
  });

  it('asks only for what is still due once the pelunasan has been received in full', () => {
    // Completed by payments, then bagi hasil 2 corrected down to 5jt, which
    // reopened the project 500rb short. The principal is already back.
    const p = paid(base(), [
      { no: 1, amount: 5_500_000 },
      { no: 2, amount: 5_000_000 },
      { no: 3, amount: 5_500_000 },
      { no: 4, amount: 100_000_000 },
    ]);
    const s = settlementSuggestion(p, today);
    expect(s.pelunasanDone).toBe(true);
    expect(s.principalPaid).toBe(100_000_000);
    expect(s.dueLeft).toBe(500_000);
    expect(s.amount).toBe(500_000);
  });

  it('suggests nothing for tagihan not due yet once the pelunasan is in', () => {
    const early = new Date(2026, 7, 20); // bulan 3 not due until 5 Sep
    const p = paid(base(), [
      { no: 1, amount: 5_500_000 },
      { no: 2, amount: 5_500_000 },
      { no: 4, amount: 100_000_000 },
    ]);
    const s = settlementSuggestion(p, early);
    expect(s.pelunasanDone).toBe(true);
    expect(s.amount).toBe(0);
  });

  it('counts the later tagihan the pelunasan will remove', () => {
    const untouched = paid(base(), [{ no: 1, amount: 5_500_000 }, { no: 2, amount: 5_500_000 }]);
    expect(settlementSuggestion(untouched, today).laterDropped).toBe(1);

    const started = paid(base(), [{ no: 1, amount: 5_500_000 }]);
    expect(settlementSuggestion(started, today).laterDropped).toBe(2);
  });
});

describe('settling after a tunggakan was carried', () => {
  const today = new Date(2026, 9, 20);
  const at = new Date(2026, 9, 20);
  const carried = (project, no, toNo, amount) => ({
    ...project,
    payments: project.payments.map((r) => (r.no === no ? { ...r, closure: { kind: 'carry', amount, toNo } } : r)),
  });
  const settle = (p, amount) => {
    const out = applySettlement(p, { amount, at, accountId: 'bca', transactionId: 'tx-s' });
    return { ...p, payments: out.payments, receipts: out.receipts };
  };

  it('charges the carried month and closes it with the pelunasan when its target is dropped', () => {
    // Bulan 1 paid, bulan 2 carried onto bulan 3, nothing else paid.
    const p = carried(paid(base(), [{ no: 1, amount: 5_500_000 }]), 2, 3, 5_500_000);
    const suggestion = settlementSuggestion(p, today);
    expect(suggestion.amount).toBe(105_500_000);
    const after = settle(p, suggestion.amount);
    expect(after.payments.every((r) => isSettled(after, r))).toBe(true);
    expect(after.payments.find((r) => r.no === 2).closure).toMatchObject({
      kind: 'waive', reason: 'settlement', amount: 5_500_000,
    });
    expect(after.payments.some((r) => r.closure?.kind === 'carry')).toBe(false);
  });

  it('charges a tunggakan carried onto the pelunasan, and closes it with the settlement', () => {
    // Bulan 1-2 paid, bulan 3 carried onto the pelunasan.
    const p = carried(paid(base(), [{ no: 1, amount: 5_500_000 }, { no: 2, amount: 5_500_000 }]), 3, 4, 5_500_000);
    const suggestion = settlementSuggestion(p, today);
    expect(suggestion.amount).toBe(105_500_000);
    expect(suggestion.shortfall).toBe(5_500_000);
    const after = settle(p, suggestion.amount);
    expect(after.payments.every((r) => isSettled(after, r))).toBe(true);
  });

  it('does not count money that paid the tunggakan as modal returned', () => {
    // As above, and then 5,5jt arrived on the pelunasan: it paid the tunggakan.
    const p0 = carried(paid(base(), [{ no: 1, amount: 5_500_000 }, { no: 2, amount: 5_500_000 }]), 3, 4, 5_500_000);
    const p = {
      ...p0,
      receipts: [...p0.receipts, {
        id: 'x', amount: 5_500_000, date: due(9), accountId: 'bca', transactionId: 'tx-x',
        allocations: [{ no: 4, amount: 5_500_000 }],
      }],
    };
    const suggestion = settlementSuggestion(p, today);
    expect(suggestion.amount).toBe(100_000_000);
    expect(suggestion.principalPaid).toBe(0);
  });

  it('keeps a carry whose target the pelunasan keeps', () => {
    // Bulan 2 carried onto bulan 3, which was then partly paid.
    const p0 = carried(paid(base(), [{ no: 1, amount: 5_500_000 }, { no: 3, amount: 2_000_000 }]), 2, 3, 5_500_000);
    const after = settle(p0, settlementSuggestion(p0, today).amount);
    expect(after.payments.find((r) => r.no === 2).closure.kind).toBe('carry');
    expect(after.payments.every((r) => isSettled(after, r))).toBe(true);
  });
});
