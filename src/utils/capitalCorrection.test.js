import { describe, it, expect } from 'vitest';
import { applyCapitalCorrection, capitalCorrectionRules } from './capitalCorrection';
import { rowRemaining, rowState } from './paymentStatus';

const due = (month) => new Date(2026, month, 5);
// Three bagi hasil at 5,5% and the pelunasan, for a given Nilai Project.
const rowsAt = (principal) => [
  ...[1, 2, 3].map((no) => ({
    no,
    type: 'interest',
    dueDate: due(5 + no),
    expectedAmount: Math.round((principal * 5.5) / 100),
    ratePct: 5.5,
    receivedAmount: null,
  })),
  { no: 4, type: 'final', dueDate: due(9), expectedAmount: principal, ratePct: null, receivedAmount: null },
];
const project = (over = {}) => ({
  id: 'p1',
  name: 'Pak Budi',
  status: 'active',
  principalAmount: 100_000_000,
  disbursedAmount: 94_500_000,
  sourceAccountId: 'bca',
  payments: rowsAt(100_000_000),
  receipts: [],
  ...over,
});
const receipt = (id, amount, allocations) => ({
  id, amount, date: due(6), accountId: 'bca', transactionId: `tx-${id}`, allocations,
});
const correct = (p, over = {}) =>
  applyCapitalCorrection(p, {
    principalAmount: p.principalAmount,
    disbursedAmount: p.disbursedAmount,
    sourceAccountId: p.sourceAccountId,
    at: due(10),
    ...over,
  });
const row = (update, no) => update.payments.find((r) => r.no === no);

describe('capitalCorrectionRules', () => {
  it('allows everything on an ordinary project', () => {
    expect(capitalCorrectionRules(project())).toEqual({ ok: true, why: null, principal: { ok: true, why: null } });
  });

  it.each([
    [{ status: 'default' }, 'macet'],
    [{ rolledOverToProjectId: 'p2' }, 'kontrak baru'],
    [{ fundingMode: 'rollover' }, 'dialihkan'],
    [{ settledEarly: true, status: 'completed' }, 'Batalkan dulu pelunasannya'],
  ])('refuses the whole correction on %o', (over, words) => {
    const rules = capitalCorrectionRules(project(over));
    expect(rules.ok).toBe(false);
    expect(rules.why).toContain(words);
  });

  it('keeps Nilai Project locked while an extension or a closed month stands, but not the rest', () => {
    const extended = capitalCorrectionRules(project({ extensions: [{ id: 'e1' }] }));
    expect(extended.ok).toBe(true);
    expect(extended.principal.why).toContain('Mundur/Perpanjang');
    const p = project();
    p.payments[1] = { ...p.payments[1], closure: { kind: 'carry', amount: 5_500_000, toNo: 3 } };
    const carried = capitalCorrectionRules(p);
    expect(carried.ok).toBe(true);
    expect(carried.principal.why).toContain('Bulan 2');
  });

  it('lets an old shortfall stand, since the correction measures it again', () => {
    const p = project();
    p.payments[0] = { ...p.payments[0], closure: { kind: 'waive', amount: 500_000, reason: 'legacy' } };
    expect(capitalCorrectionRules(p).principal.ok).toBe(true);
  });
});

describe('applyCapitalCorrection', () => {
  it('changes nothing when nothing changes', () => {
    expect(correct(project()).update).toEqual({});
  });

  it('corrects Modal Keluar or the account without touching the schedule', () => {
    expect(correct(project(), { disbursedAmount: 90_000_000 }).update).toEqual({ disbursedAmount: 90_000_000 });
    expect(correct(project(), { sourceAccountId: 'bri' }).update).toEqual({ sourceAccountId: 'bri' });
  });

  it('recomputes every tagihan from the right Nilai Project, paid months included', () => {
    // Typed 110jt; the borrower paid the real 5,5jt twice, confirmed the old way.
    const p = project({
      principalAmount: 110_000_000,
      payments: rowsAt(110_000_000).map((r) =>
        r.no <= 2 ? { ...r, closure: { kind: 'waive', amount: 550_000, reason: 'legacy' } } : r
      ),
      receipts: [
        receipt('legacy-1', 5_500_000, [{ no: 1, amount: 5_500_000 }]),
        receipt('legacy-2', 5_500_000, [{ no: 2, amount: 5_500_000 }]),
      ],
    });
    const { update, rows } = correct(p, { principalAmount: 100_000_000 });
    expect(update.principalAmount).toBe(100_000_000);
    expect(update.payments.map((r) => r.expectedAmount)).toEqual([5_500_000, 5_500_000, 5_500_000, 100_000_000]);
    expect(row(update, 1).closure).toBeUndefined();
    expect(row(update, 2).closure).toBeUndefined();
    expect(update.receipts).toEqual(p.receipts);
    expect(rows.find((r) => r.no === 1)).toMatchObject({
      before: 6_050_000, after: 5_500_000, stateBefore: 'lunas', stateAfter: 'lunas',
    });
  });

  it('leaves an old overpayment on the month it was confirmed for', () => {
    const p = project({
      principalAmount: 40_000_000,
      payments: rowsAt(40_000_000),
      receipts: [receipt('legacy-3', 11_650_000, [{ no: 3, amount: 11_650_000 }])],
    });
    const { update } = correct(p, { principalAmount: 50_000_000 });
    expect(update.receipts[0].allocations).toEqual([{ no: 3, amount: 11_650_000 }]);
    const after = { ...p, ...update };
    expect(rowState(after, row(update, 3))).toBe('lunas');
    expect(rowRemaining(after, row(update, 4))).toBe(50_000_000);
  });

  it('measures an old shortfall again on the corrected tagihan', () => {
    const p = project({
      payments: rowsAt(100_000_000).map((r) =>
        r.no === 1 ? { ...r, closure: { kind: 'waive', amount: 1_500_000, reason: 'legacy' } } : r
      ),
      receipts: [receipt('legacy-1', 4_000_000, [{ no: 1, amount: 4_000_000 }])],
    });
    const { update } = correct(p, { principalAmount: 120_000_000 });
    expect(row(update, 1).closure).toEqual({ kind: 'waive', amount: 2_600_000, reason: 'legacy' });
  });

  it('shows a month paid under the new rules as Kurang once its tagihan grows', () => {
    const p = project({ receipts: [receipt('r1', 5_500_000, [{ no: 1, amount: 5_500_000 }])] });
    const { update, rows } = correct(p, { principalAmount: 120_000_000 });
    const after = { ...p, ...update };
    expect(rowRemaining(after, row(update, 1))).toBe(1_100_000);
    expect(rows.find((r) => r.no === 1)).toMatchObject({ stateBefore: 'lunas', stateAfter: 'kurang' });
  });

  it('puts an overpayment that spilled onto the next month back on its own month', () => {
    // Typed 100jt instead of 120jt: 6,6jt paid for bulan 1 spilled 1,1jt onto bulan 2.
    const p = project({
      receipts: [receipt('r1', 6_600_000, [{ no: 1, amount: 5_500_000 }, { no: 2, amount: 1_100_000 }])],
    });
    const { update, moved } = correct(p, { principalAmount: 120_000_000 });
    expect(update.receipts[0].allocations).toEqual([{ no: 1, amount: 6_600_000 }]);
    expect(moved).toEqual([{ receipt: update.receipts[0], allocations: [{ no: 1, amount: 6_600_000 }] }]);
    const after = { ...p, ...update };
    expect(rowState(after, row(update, 2))).toBe('belum');
  });

  it('refuses when a payment no longer fits the corrected tagihan', () => {
    const p = project({
      receipts: [
        receipt('r1', 116_500_000, [
          { no: 1, amount: 5_500_000 },
          { no: 2, amount: 5_500_000 },
          { no: 3, amount: 5_500_000 },
          { no: 4, amount: 100_000_000 },
        ]),
      ],
    });
    expect(() => correct(p, { principalAmount: 50_000_000 })).toThrow('tidak muat');
  });

  it('keeps the rate of an old row that never stored one', () => {
    const p = project({
      principalAmount: 60_000_000,
      payments: [
        { no: 1, type: 'interest', dueDate: due(6), expectedAmount: 3_000_000, ratePct: null, receivedAmount: null },
        { no: 2, type: 'final', dueDate: due(7), expectedAmount: 60_000_000, ratePct: null, receivedAmount: null },
      ],
      receipts: [receipt('legacy-1', 3_000_000, [{ no: 1, amount: 3_000_000 }])],
    });
    const { update } = correct(p, { principalAmount: 66_000_000 });
    expect(update.payments.map((r) => r.expectedAmount)).toEqual([3_300_000, 66_000_000]);
  });

  it('refuses a new Nilai Project while a month is closed, but still corrects Modal Keluar', () => {
    const p = project();
    p.payments[1] = { ...p.payments[1], closure: { kind: 'carry', amount: 5_500_000, toNo: 3 } };
    expect(() => correct(p, { principalAmount: 120_000_000 })).toThrow('Bulan 2');
    expect(correct(p, { disbursedAmount: 90_000_000 }).update).toEqual({ disbursedAmount: 90_000_000 });
  });

  it('opens a completed project again when a tagihan grows past what was paid', () => {
    const p = project({
      status: 'completed',
      closedAt: due(9),
      receipts: [
        receipt('r1', 5_500_000, [{ no: 1, amount: 5_500_000 }]),
        receipt('r2', 5_500_000, [{ no: 2, amount: 5_500_000 }]),
        receipt('r3', 5_500_000, [{ no: 3, amount: 5_500_000 }]),
        receipt('r4', 100_000_000, [{ no: 4, amount: 100_000_000 }]),
      ],
    });
    const { update } = correct(p, { principalAmount: 120_000_000 });
    expect(update).toMatchObject({ status: 'active', closedAt: null });
  });
});
