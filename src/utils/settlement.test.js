import { describe, it, expect } from 'vitest';
import { applySettlement, applySettlementUndo, settlementSuggestion, settlementUndoPreview } from './settlement';
import { applyExtension } from './extension';
import { isSettled, projectReceivedTotal, rowRemaining } from './paymentStatus';
import { deriveRowFields } from './receiptOps';
import { toDate } from './formatDate';

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
      dropped: p.payments.filter((r) => r.no !== 1),
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

  it('keeps the carry it closes, so an undo can give it back', () => {
    const p = carried(paid(base(), [{ no: 1, amount: 5_500_000 }]), 2, 3, 5_500_000);
    const out = applySettlement(p, { amount: 105_500_000, at, accountId: 'bca', transactionId: 'tx-s' });
    expect(out.payments.find((r) => r.no === 2).closure).toEqual({
      kind: 'waive',
      amount: 5_500_000,
      reason: 'settlement',
      at,
      replaced: { kind: 'carry', amount: 5_500_000, toNo: 3 },
    });
    expect(out.payments.find((r) => r.settledEarly).dropped.map((r) => r.no)).toEqual([3, 4]);
  });
});

describe('settling early after the pelunasan was extended', () => {
  const today = new Date(2026, 9, 20);
  const at = new Date(2026, 9, 5);
  const extend = (p, kind, over = {}) => {
    const out = applyExtension(p, { kind, months: 2, ratePct: 6.5, startMode: 'today', at, id: 'e1', ...over });
    return { ...p, ...out.update };
  };
  const bagiHasil = [{ no: 1, amount: 5_500_000 }, { no: 2, amount: 5_500_000 }, { no: 3, amount: 5_500_000 }];

  it('never suggests less than what is left of the principal after Diperpanjang (Gde, 25 Sep 2026)', () => {
    // 30 of the 100jt pelunasan paid, the 70jt left extended two months at 6,5%.
    const p = extend(paid(base({ paymentDayOfMonth: 5 }), [...bagiHasil, { no: 4, amount: 30_000_000 }]), 'sisa');
    const s = settlementSuggestion(p, today);
    // The owner's rule alone: 94,5jt + 4,55jt this month - 30jt already back = 69,05jt.
    expect(s.amount).toBe(70_000_000);
    expect(s.principalLeft).toBe(70_000_000);
    expect(s.minimum).toBe(70_000_000);
    expect(s.raisedToMinimum).toBe(true);
  });

  it('keeps the owner\'s rule when it asks for more, as after a Mundur', () => {
    const p = extend(paid(base({ paymentDayOfMonth: 5 }), bagiHasil), 'mundur');
    const s = settlementSuggestion(p, today);
    expect(s.amount).toBe(94_500_000 + 6_500_000);
    expect(s.principalLeft).toBe(100_000_000);
    expect(s.raisedToMinimum).toBe(false);
  });

  it('leaves a project that was never extended on the owner\'s rule alone', () => {
    // Modal keluar typed lower by hand: the rule asks 90jt + 5,5jt, below the 100jt principal.
    const p = paid(base({ disbursedAmount: 90_000_000 }), [{ no: 1, amount: 5_500_000 }]);
    const s = settlementSuggestion(p, today);
    expect(s.amount).toBe(95_500_000);
    expect(s.raisedToMinimum).toBe(false);
    // Even when the rule itself goes below zero there is no minimum to show.
    const low = paid(base({ disbursedAmount: 1_000_000 }), [{ no: 4, amount: 20_000_000 }]);
    expect(settlementSuggestion(low, today)).toMatchObject({ amount: 0, minimum: 0, raisedToMinimum: false });
  });

  it('does not charge twice a tunggakan the extension already took into its principal', () => {
    // Bulan 3 carried onto the pelunasan, 3jt paid on it, then the 102,5jt left extended.
    const p0 = paid(base({ paymentDayOfMonth: 5 }), [{ no: 1, amount: 5_500_000 }, { no: 2, amount: 5_500_000 }, { no: 4, amount: 3_000_000 }]);
    const carried = {
      ...p0,
      payments: p0.payments.map((r) => (r.no === 3 ? { ...r, closure: { kind: 'carry', amount: 5_500_000, toNo: 4 } } : r)),
    };
    const p = extend(carried, 'sisa');
    const s = settlementSuggestion(p, today);
    expect(s.shortfall).toBe(0);
    expect(s.principalLeft).toBe(102_500_000);
    expect(s.amount).toBe(102_500_000);
  });
});

describe('applySettlementUndo', () => {
  const at = new Date(2026, 8, 23);
  const carriedOnto = (project, no, toNo, amount) => ({
    ...project,
    payments: project.payments.map((r) => (r.no === no ? { ...r, closure: { kind: 'carry', amount, toNo } } : r)),
  });
  // The project as the writer leaves it after a pelunasan dipercepat.
  const settledWith = (p, amount) => {
    const out = applySettlement(p, { amount, at, accountId: 'bca', transactionId: 'tx-s' });
    return { ...p, payments: out.payments, receipts: out.receipts, status: 'completed', closedAt: at, settledEarly: true };
  };
  // Rows compared the way the writers store them.
  const asStored = (p) => deriveRowFields(p.payments, p.receipts);

  it('puts back the rows it removed and takes its money out of receipts', () => {
    const p = paid(base(), [{ no: 1, amount: 5_500_000 }]);
    const { update, removed } = applySettlementUndo(settledWith(p, 100_000_000));
    expect(removed.map((r) => r.id)).toEqual(['tx-s']);
    expect(update.payments).toEqual(asStored(p));
    expect(update.receipts).toEqual(p.receipts);
    expect(update).toMatchObject({ status: 'active', closedAt: null, settledEarly: false });
  });

  it('opens again a month it closed, which is billed its remainder', () => {
    const p = paid(base(), [
      { no: 1, amount: 5_500_000 },
      { no: 2, amount: 5_500_000 },
      { no: 3, amount: 3_000_000 },
    ]);
    const settled = settledWith(p, 97_000_000);
    const { update } = applySettlementUndo(settled);
    expect(update.payments).toEqual(asStored(p));
    const after = { ...settled, ...update };
    expect(rowRemaining(after, after.payments.find((r) => r.no === 3))).toBe(2_500_000);
  });

  it('gives a tunggakan back to the month it was carried onto', () => {
    const p = carriedOnto(paid(base(), [{ no: 1, amount: 5_500_000 }]), 2, 3, 5_500_000);
    const { update } = applySettlementUndo(settledWith(p, 105_500_000));
    expect(update.payments).toEqual(asStored(p));
  });

  it('removes an edited pelunasan whole', () => {
    const p = paid(base(), [{ no: 1, amount: 5_500_000 }]);
    const settled = settledWith(p, 100_000_000);
    const edited = {
      ...settled,
      receipts: settled.receipts.map((r) =>
        r.id === 'tx-s' ? { ...r, amount: 90_000_000, allocations: [{ no: 2, amount: 90_000_000 }] } : r
      ),
    };
    const { update, removed } = applySettlementUndo(edited);
    expect(removed.map((r) => r.amount)).toEqual([90_000_000]);
    expect(update.payments).toEqual(asStored(p));
  });

  it('rebuilds from the contract a pelunasan recorded before it kept its rows (SAWAH KOTA SISWATI 2)', () => {
    const d = (month, day) => new Date(2026, month, day);
    const project = {
      principalAmount: 320_000_000,
      disbursedAmount: 302_400_000,
      monthlyReturnPct: 5.5,
      returnPctTier1: 5.5,
      returnPctTier2: 6.5,
      durationMonths: 3,
      startDate: d(6, 17),
      paymentDayOfMonth: 17,
      status: 'completed',
      settledEarly: true,
      closedAt: d(8, 25),
      payments: [
        { no: 1, type: 'interest', dueDate: d(7, 17), expectedAmount: 17_600_000, ratePct: 5.5, receivedAmount: 17_600_000 },
        {
          no: 3, type: 'final', dueDate: d(9, 17), expectedAmount: 320_000_000, ratePct: null, receivedAmount: 38_000_000,
          closure: { kind: 'waive', amount: 282_000_000, reason: 'settlement', at: d(8, 25) },
        },
        {
          no: 4, type: 'final', dueDate: d(8, 25), expectedAmount: 282_000_000, ratePct: null,
          receivedAmount: 282_000_000, settledEarly: true,
        },
      ],
      receipts: [
        { id: 'legacy-1', amount: 17_600_000, date: d(7, 17), accountId: 'bca', transactionId: 't1', allocations: [{ no: 1, amount: 17_600_000 }] },
        { id: 'r38', amount: 38_000_000, date: d(8, 20), accountId: 'bca', transactionId: 't38', allocations: [{ no: 3, amount: 38_000_000 }] },
        { id: 'ts', amount: 282_000_000, date: d(8, 25), accountId: 'bca', transactionId: 'ts', allocations: [{ no: 4, amount: 282_000_000 }] },
      ],
    };
    const { update, removed } = applySettlementUndo(project);
    expect(removed.map((r) => r.id)).toEqual(['ts']);
    expect(update.payments.map((r) => r.no)).toEqual([1, 2, 3]);
    expect(update.payments[1]).toMatchObject({ type: 'interest', expectedAmount: 17_600_000, ratePct: 5.5, receivedAmount: null });
    expect(toDate(update.payments[1].dueDate)).toEqual(d(8, 17));
    expect(update.payments[2].closure).toBeUndefined();
    const after = { ...project, ...update };
    expect(rowRemaining(after, update.payments[2])).toBe(282_000_000);
    expect(update).toMatchObject({ status: 'active', closedAt: null, settledEarly: false });
  });

  it('refuses a project that was not closed by pelunasan dipercepat', () => {
    expect(() => applySettlementUndo(paid(base(), [{ no: 1, amount: 5_500_000 }]))).toThrow(
      'tidak ditutup lewat pelunasan dipercepat'
    );
  });

  it('refuses to rebuild an old pelunasan once the schedule was extended', () => {
    const settled = settledWith(paid(base(), [{ no: 1, amount: 5_500_000 }]), 100_000_000);
    const old = {
      ...settled,
      extensions: [{ id: 'e1' }],
      payments: settled.payments.map((r) => {
        const row = { ...r };
        delete row.dropped;
        return row;
      }),
    };
    expect(() => applySettlementUndo(old)).toThrow('tidak bisa dibatalkan otomatis');
  });

  it('refuses when the pelunasan money also paid another month', () => {
    const settled = settledWith(paid(base(), [{ no: 1, amount: 5_500_000 }]), 100_000_000);
    const odd = {
      ...settled,
      receipts: settled.receipts.map((r) =>
        r.id === 'tx-s' ? { ...r, allocations: [...r.allocations, { no: 1, amount: 1 }] } : r
      ),
    };
    expect(() => applySettlementUndo(odd)).toThrow('juga membayar tagihan lain');
  });
});

describe('settlementUndoPreview', () => {
  const at = new Date(2026, 8, 23);

  it('says what comes back, what is billed again and where the money leaves from', () => {
    const p = paid(base(), [{ no: 1, amount: 5_500_000 }, { no: 2, amount: 2_000_000 }]);
    const out = applySettlement(p, { amount: 100_000_000, at, accountId: 'bca', transactionId: 'tx-s' });
    const settled = { ...p, ...out, status: 'completed', closedAt: at, settledEarly: true };
    expect(settlementUndoPreview(settled)).toEqual({
      ok: true,
      why: null,
      amount: 100_000_000,
      accountId: 'bca',
      status: 'active',
      restored: [
        { no: 3, type: 'interest', amount: 5_500_000 },
        { no: 4, type: 'final', amount: 100_000_000 },
      ],
      reopened: [{ no: 2, amount: 3_500_000 }],
    });
  });

  it('explains instead of throwing', () => {
    expect(settlementUndoPreview(base())).toMatchObject({
      ok: false,
      why: expect.stringContaining('pelunasan dipercepat'),
    });
  });
});
