import { describe, it, expect } from 'vitest';
import { anakBagiHasil, anakFromReceipt, anakFromRow, anakRatio, anakSummary, cleanAnak } from './anakShare';

const due = (month) => new Date(2026, month, 5);
// Nilai 100jt, 5,5% for months 1-3 and 6,5% after; the son took 50jt.
const project = (over = {}) => ({
  principalAmount: 100_000_000,
  monthlyReturnPct: 5.5,
  returnPctTier1: 5.5,
  returnPctTier2: 6.5,
  anak: { amount: 50_000_000, feePct: 0.5 },
  payments: [
    { no: 1, type: 'interest', dueDate: due(6), expectedAmount: 5_500_000, ratePct: 5.5 },
    { no: 2, type: 'interest', dueDate: due(7), expectedAmount: 5_500_000, ratePct: 5.5 },
    { no: 3, type: 'interest', dueDate: due(8), expectedAmount: 6_500_000, ratePct: 6.5 },
    { no: 4, type: 'final', dueDate: due(9), expectedAmount: 100_000_000, ratePct: null },
  ],
  receipts: [],
  ...over,
});
const receipt = (id, allocations) => ({
  id,
  amount: allocations.reduce((s, a) => s + a.amount, 0),
  date: due(6),
  accountId: 'bca',
  transactionId: id,
  allocations,
});

describe('anakRatio', () => {
  it('is the part of Nilai Project the son took', () => {
    expect(anakRatio(project())).toBe(0.5);
    expect(anakRatio(project({ anak: null }))).toBe(0);
    expect(anakRatio(project({ anak: { amount: 150_000_000, feePct: 0.5 } }))).toBe(1);
  });
});

describe('anakBagiHasil', () => {
  it('gives the son his part less Mas Hena 0,5% of it a month (Gde, 28-29 Sep 2026)', () => {
    const p = project();
    expect(anakBagiHasil(p, p.payments[0], 5_500_000)).toEqual({ net: 2_500_000, fee: 250_000 });
    expect(anakBagiHasil(p, p.payments[2], 6_500_000)).toEqual({ net: 3_000_000, fee: 250_000 });
  });

  it('keeps the proportion on a partial payment', () => {
    const p = project();
    expect(anakBagiHasil(p, p.payments[0], 2_750_000)).toEqual({ net: 1_250_000, fee: 125_000 });
  });

  it('reads the rate an old row implies', () => {
    const p = project({ principalAmount: 60_000_000, anak: { amount: 60_000_000, feePct: 0.5 } });
    const old = { no: 1, type: 'interest', expectedAmount: 3_000_000, ratePct: null };
    expect(anakBagiHasil(p, old, 3_000_000)).toEqual({ net: 2_700_000, fee: 300_000 });
  });
});

describe('anakFromReceipt', () => {
  it('splits one arrival over bagi hasil and the pelunasan', () => {
    const p = project();
    const r = receipt('r1', [{ no: 3, amount: 6_500_000 }, { no: 4, amount: 100_000_000 }]);
    expect(anakFromReceipt({ ...p, receipts: [r] }, r)).toEqual({
      bagiHasil: 3_000_000, fee: 250_000, pokok: 50_000_000, total: 53_000_000,
    });
  });

  it('counts a tunggakan carried onto the pelunasan as bagi hasil, paid first', () => {
    const p = project();
    p.payments[2] = { ...p.payments[2], closure: { kind: 'carry', amount: 6_500_000, toNo: 4 } };
    const first = receipt('a', [{ no: 4, amount: 5_000_000 }]);
    const second = receipt('b', [{ no: 4, amount: 101_500_000 }]);
    const q = { ...p, receipts: [first, second] };
    expect(anakFromReceipt(q, first)).toEqual({ bagiHasil: 2_272_727, fee: 227_273, pokok: 0, total: 2_272_727 });
    expect(anakFromReceipt(q, second)).toEqual({
      bagiHasil: 681_818, fee: 68_182, pokok: 50_000_000, total: 50_681_818,
    });
  });

  it('gives the son his part of principal paid back early, without fee', () => {
    const p = project({ principalPayments: [{ id: 'pk', amount: 20_000_000, fromNo: 3, at: due(7) }] });
    const r = receipt('pk', [{ no: 4, amount: 20_000_000 }]);
    expect(anakFromReceipt({ ...p, receipts: [r] }, r)).toEqual({ bagiHasil: 0, fee: 0, pokok: 10_000_000, total: 10_000_000 });
  });

  it('gives nothing on a project not taken by the son', () => {
    const p = project({ anak: null });
    const r = receipt('r1', [{ no: 1, amount: 5_500_000 }]);
    expect(anakFromReceipt({ ...p, receipts: [r] }, r).total).toBe(0);
  });
});

describe('anakFromRow', () => {
  it('plans the son part of what is still owed', () => {
    const p = project({ receipts: [receipt('r1', [{ no: 1, amount: 2_750_000 }])] });
    expect(anakFromRow(p, p.payments[0])).toEqual({ bagiHasil: 1_250_000, fee: 125_000, pokok: 0, total: 1_250_000 });
    expect(anakFromRow(p, p.payments[3]).pokok).toBe(50_000_000);
  });
});

describe('cleanAnak', () => {
  it('keeps a valid part and refuses the rest', () => {
    expect(cleanAnak(project(), { amount: 50_000_000.4, feePct: 0.5 })).toEqual({ amount: 50_000_000, feePct: 0.5 });
    expect(cleanAnak(project(), null)).toBe(null);
    expect(() => cleanAnak(project(), { amount: 0, feePct: 0.5 })).toThrow('lebih dari 0');
    expect(() => cleanAnak(project(), { amount: 120_000_000, feePct: 0.5 })).toThrow('nilai project');
    expect(() => cleanAnak(project(), { amount: 50_000_000, feePct: NaN })).toThrow('Fee Mas Hena');
  });
});

describe('anakSummary', () => {
  it('shows a month at each rate and the principal share', () => {
    expect(anakSummary(project())).toEqual({
      ratio: 0.5,
      first: { net: 2_500_000, fee: 250_000 },
      later: { net: 3_000_000, fee: 250_000 },
      pokok: 50_000_000,
    });
  });
});
