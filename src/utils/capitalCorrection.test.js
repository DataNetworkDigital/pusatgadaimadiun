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
