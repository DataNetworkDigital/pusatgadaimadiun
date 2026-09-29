import { describe, it, expect } from 'vitest';
import { anakBagiHasil, anakFromReceipt, anakFromRow, anakRatio, anakSummary, cleanAnak } from './anakShare';
import { applySettlement, settlementSuggestion } from './settlement';
import { applyReceiptEdit, deriveRowFields } from './receiptOps';
import { applyExtension } from './extension';

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

  it('counts a tunggakan carried onto the pelunasan as bagi hasil, paid first, at the rate of its month', () => {
    // Bulan 3 (6,5%) carried: the fee stays 0,5% of the son's 50jt a month.
    const p = project();
    p.payments[2] = { ...p.payments[2], closure: { kind: 'carry', amount: 6_500_000, toNo: 4 } };
    const first = receipt('a', [{ no: 4, amount: 5_000_000 }]);
    const second = receipt('b', [{ no: 4, amount: 101_500_000 }]);
    const q = { ...p, receipts: [first, second] };
    expect(anakFromReceipt(q, first)).toEqual({ bagiHasil: 2_307_692, fee: 192_308, pokok: 0, total: 2_307_692 });
    expect(anakFromReceipt(q, second)).toEqual({
      bagiHasil: 692_308, fee: 57_692, pokok: 50_000_000, total: 50_692_308,
    });
    const whole = receipt('c', [{ no: 4, amount: 106_500_000 }]);
    expect(anakFromReceipt({ ...p, receipts: [whole] }, whole)).toEqual({
      bagiHasil: 3_000_000, fee: 250_000, pokok: 50_000_000, total: 53_000_000,
    });
  });

  it('weights the months a tunggakan came from by what each left', () => {
    // 5,5jt from a 5,5% month and 6,5jt from a 6,5% month: two months of fee.
    const p = project();
    p.payments[1] = { ...p.payments[1], closure: { kind: 'carry', amount: 5_500_000, toNo: 4 } };
    p.payments[2] = { ...p.payments[2], closure: { kind: 'carry', amount: 6_500_000, toNo: 4 } };
    const r = receipt('all', [{ no: 4, amount: 112_000_000 }]);
    expect(anakFromReceipt({ ...p, receipts: [r] }, r)).toEqual({
      bagiHasil: 5_500_000, fee: 500_000, pokok: 50_000_000, total: 55_500_000,
    });
  });

  it('lets the money that arrived first pay the tunggakan, whatever order it was typed in', () => {
    const p = project();
    p.payments[2] = { ...p.payments[2], closure: { kind: 'carry', amount: 6_500_000, toNo: 4 } };
    const early = { ...receipt('a', [{ no: 4, amount: 5_000_000 }]), date: due(8) };
    const late = { ...receipt('b', [{ no: 4, amount: 101_500_000 }]), date: due(9) };
    const typedLate = { ...p, receipts: [late, early] };
    expect(anakFromReceipt(typedLate, early)).toEqual({ bagiHasil: 2_307_692, fee: 192_308, pokok: 0, total: 2_307_692 });
    expect(anakFromReceipt(typedLate, late)).toEqual({
      bagiHasil: 692_308, fee: 57_692, pokok: 50_000_000, total: 50_692_308,
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

describe('a pelunasan dipercepat on a project taken by the son', () => {
  // Gde's example (29 Sep 2026): 100jt, 50jt of it the son's, 5,5% every month,
  // modal keluar 94,5jt.
  const flat = () =>
    project({
      disbursedAmount: 94_500_000,
      status: 'active',
      returnPctTier2: 5.5,
      payments: [
        { no: 1, type: 'interest', dueDate: due(6), expectedAmount: 5_500_000, ratePct: 5.5 },
        { no: 2, type: 'interest', dueDate: due(7), expectedAmount: 5_500_000, ratePct: 5.5 },
        { no: 3, type: 'interest', dueDate: due(8), expectedAmount: 5_500_000, ratePct: 5.5 },
        { no: 4, type: 'final', dueDate: due(9), expectedAmount: 100_000_000, ratePct: null },
      ],
    });
  // Bulan 2 paid 3,3jt, the 2,2jt short carried onto bulan 3.
  const shortCarried = () => {
    const p = flat();
    return {
      ...p,
      receipts: [receipt('b1', [{ no: 1, amount: 5_500_000 }]), receipt('b2', [{ no: 2, amount: 3_300_000 }])],
      payments: p.payments.map((r) => (r.no === 2 ? { ...r, closure: { kind: 'carry', amount: 2_200_000, toNo: 3 } } : r)),
    };
  };
  const settled = (p, amount) => {
    const out = applySettlement(p, { amount, at: due(8), accountId: 'bca', transactionId: 'tx-s' });
    const q = { ...p, payments: out.payments, receipts: out.receipts, settledEarly: true, status: 'completed' };
    return { q, r: q.receipts.find((x) => x.id === 'tx-s') };
  };

  it('takes Mas Hena\'s fee from a tunggakan it paid, and gives the principal whole', () => {
    const p = shortCarried();
    expect(settlementSuggestion(p, due(8)).amount).toBe(102_200_000);
    const { q, r } = settled(p, 102_200_000);
    expect(anakFromReceipt(q, r)).toEqual({ bagiHasil: 1_000_000, fee: 100_000, pokok: 50_000_000, total: 51_000_000 });
  });

  it('takes the fee from a tunggakan that rode on the pelunasan it replaced', () => {
    const p0 = flat();
    const p = {
      ...p0,
      receipts: [receipt('b1', [{ no: 1, amount: 5_500_000 }]), receipt('b2', [{ no: 2, amount: 5_500_000 }])],
      payments: p0.payments.map((r) => (r.no === 3 ? { ...r, closure: { kind: 'carry', amount: 5_500_000, toNo: 4 } } : r)),
    };
    expect(settlementSuggestion(p, due(8)).amount).toBe(105_500_000);
    const { q, r } = settled(p, 105_500_000);
    expect(anakFromReceipt(q, r)).toEqual({ bagiHasil: 2_500_000, fee: 250_000, pokok: 50_000_000, total: 52_500_000 });
  });

  it('charges a 6,5% month\'s tunggakan the same 0,5% of the son\'s part a month', () => {
    // Nilai 100jt at 5,5% then 6,5%: bulan 3 (6,5jt) carried onto the pelunasan.
    const p0 = project({ disbursedAmount: 94_500_000, status: 'active' });
    const p = {
      ...p0,
      receipts: [receipt('b1', [{ no: 1, amount: 5_500_000 }]), receipt('b2', [{ no: 2, amount: 5_500_000 }])],
      payments: p0.payments.map((r) => (r.no === 3 ? { ...r, closure: { kind: 'carry', amount: 6_500_000, toNo: 4 } } : r)),
    };
    expect(settlementSuggestion(p, due(8)).amount).toBe(106_500_000);
    const { q, r } = settled(p, 106_500_000);
    expect(anakFromReceipt(q, r)).toEqual({ bagiHasil: 3_000_000, fee: 250_000, pokok: 50_000_000, total: 53_000_000 });
  });

  // Tiered 5,5 / 5,5 / 6,5, rows left as the writers leave them.
  const tiered = (receipts, closures) => {
    const p0 = project({ disbursedAmount: 94_500_000, status: 'active', paymentDayOfMonth: 5 });
    const payments = p0.payments.map((r) => (closures[r.no] ? { ...r, closure: closures[r.no] } : r));
    return { ...p0, receipts, payments: deriveRowFields(payments, receipts) };
  };
  const bulan3Carried = { kind: 'carry', amount: 6_500_000, toNo: 4 };

  it('leaves out an old shortfall forgiven under the old rule', () => {
    const p = tiered(
      [receipt('legacy-1', [{ no: 1, amount: 5_000_000 }]), receipt('b2', [{ no: 2, amount: 5_500_000 }])],
      { 1: { kind: 'waive', amount: 500_000, reason: 'legacy' }, 3: bulan3Carried }
    );
    expect(settlementSuggestion(p, due(8)).amount).toBe(106_500_000);
    const { q, r } = settled(p, 106_500_000);
    expect(anakFromReceipt(q, r)).toEqual({ bagiHasil: 3_000_000, fee: 250_000, pokok: 50_000_000, total: 53_000_000 });
  });

  it('counts a tunggakan still riding on the pelunasan it kept', () => {
    const f1 = { ...receipt('f1', [{ no: 4, amount: 2_000_000 }]), date: due(8) };
    const p = tiered(
      [receipt('b1', [{ no: 1, amount: 5_500_000 }]), receipt('b2', [{ no: 2, amount: 5_500_000 }]), f1],
      { 3: bulan3Carried }
    );
    expect(settlementSuggestion(p, due(8)).amount).toBe(104_500_000);
    const { q, r } = settled(p, 104_500_000);
    expect(anakFromReceipt(q, r)).toEqual({ bagiHasil: 2_076_923, fee: 173_077, pokok: 50_000_000, total: 52_076_923 });
    // With the 2jt that paid part of it earlier, the month's fee comes to 250rb.
    expect(anakFromReceipt(q, q.receipts.find((x) => x.id === 'f1')).fee).toBe(76_923);
  });

  it('leaves out a tunggakan that Diperpanjang took into its principal', () => {
    const at = new Date(2026, 9, 5);
    const p1 = tiered(
      [
        receipt('b1', [{ no: 1, amount: 5_500_000 }]),
        receipt('b2', [{ no: 2, amount: 5_500_000 }]),
        { ...receipt('f1', [{ no: 4, amount: 2_000_000 }]), date: due(8) },
      ],
      { 3: bulan3Carried }
    );
    // The 104,5jt left, 4,5jt of tunggakan in it, extended two months at 7%.
    const p2 = { ...p1, ...applyExtension(p1, { kind: 'sisa', months: 2, ratePct: 7, startMode: 'today', at, id: 'e1' }).update };
    const month1 = p2.payments.find((r) => r.extensionId === 'e1' && r.type === 'interest');
    const x1 = { ...receipt('x1', [{ no: month1.no, amount: 3_000_000 }]), date: at };
    const receipts = [...p2.receipts, x1];
    const p3 = { ...p2, receipts, payments: deriveRowFields(p2.payments, receipts) };
    const out = applySettlement(p3, { amount: 109_500_000, at: new Date(2026, 9, 20), accountId: 'bca', transactionId: 'tx-s' });
    const q = { ...p3, payments: out.payments, receipts: out.receipts, settledEarly: true, status: 'completed' };
    // 5jt above the 104,5jt principal, all of it at the extension's 7%.
    expect(anakFromReceipt(q, q.receipts.find((x) => x.id === 'tx-s'))).toEqual({
      bagiHasil: 2_321_429, fee: 178_571, pokok: 52_250_000, total: 54_571_429,
    });
  });

  it('counts a pelunasan dipercepat of just the principal as principal', () => {
    const p = { ...flat(), receipts: [receipt('b1', [{ no: 1, amount: 5_500_000 }])] };
    const { q, r } = settled(p, 100_000_000);
    expect(anakFromReceipt(q, r)).toEqual({ bagiHasil: 0, fee: 0, pokok: 50_000_000, total: 50_000_000 });
  });

  it('counts it all as bagi hasil once the pelunasan had come back in full', () => {
    const p = {
      ...flat(),
      receipts: [receipt('b1', [{ no: 1, amount: 5_500_000 }]), receipt('f', [{ no: 4, amount: 100_000_000 }])],
    };
    const { q, r } = settled(p, 5_500_000);
    expect(anakFromReceipt(q, r)).toEqual({ bagiHasil: 2_500_000, fee: 250_000, pokok: 0, total: 2_500_000 });
  });

  it('follows an edit of the pelunasan money', () => {
    const { q } = settled(shortCarried(), 102_200_000);
    const { update } = applyReceiptEdit(q, 'tx-s', { amount: 101_100_000, at: due(8), accountId: 'bca' });
    const edited = { ...q, ...update };
    const r = edited.receipts.find((x) => x.id === 'tx-s');
    expect(anakFromReceipt(edited, r)).toEqual({ bagiHasil: 500_000, fee: 50_000, pokok: 50_000_000, total: 50_500_000 });
  });

  it('keeps counting as principal a pelunasan dipercepat recorded before it kept the principal left', () => {
    const { q, r } = settled(shortCarried(), 102_200_000);
    const old = {
      ...q,
      payments: q.payments.map((row) => {
        if (!row.settledEarly) return row;
        const rest = { ...row };
        delete rest.principalLeft;
        return rest;
      }),
    };
    expect(anakFromReceipt(old, r)).toEqual({ bagiHasil: 0, fee: 0, pokok: 51_100_000, total: 51_100_000 });
  });
});

describe('anakFromRow', () => {
  it('plans the son part of what is still owed', () => {
    const p = project({ receipts: [receipt('r1', [{ no: 1, amount: 2_750_000 }])] });
    expect(anakFromRow(p, p.payments[0])).toEqual({ bagiHasil: 1_250_000, fee: 125_000, pokok: 0, total: 1_250_000 });
    expect(anakFromRow(p, p.payments[3]).pokok).toBe(50_000_000);
  });

  it('plans a tunggakan riding on the pelunasan at the rate of its month', () => {
    const p = project();
    p.payments[2] = { ...p.payments[2], closure: { kind: 'carry', amount: 6_500_000, toNo: 4 } };
    expect(anakFromRow(p, p.payments[3])).toEqual({ bagiHasil: 3_000_000, fee: 250_000, pokok: 50_000_000, total: 53_000_000 });
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
