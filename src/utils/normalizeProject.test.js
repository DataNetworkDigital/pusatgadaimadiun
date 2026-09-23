import { describe, it, expect } from 'vitest';
import { normalizeProject } from './normalizeProject';
import { rowState, rowRemaining, projectReceivedTotal } from './paymentStatus';

const legacyProject = () => ({
  id: 'p1',
  name: 'PINDANG',
  status: 'active',
  payments: [
    { no: 1, type: 'interest', expectedAmount: 5_500_000, receivedAmount: 5_500_000,
      receivedDate: new Date(2026, 4, 5), accountId: 'acc-bca', transactionId: 'tx-1' },
    { no: 2, type: 'interest', expectedAmount: 5_500_000, receivedAmount: 3_000_000,
      receivedDate: new Date(2026, 5, 5), accountId: 'acc-bca', transactionId: 'tx-2' },
    { no: 3, type: 'final', expectedAmount: 100_000_000, receivedAmount: null },
  ],
});

describe('normalizeProject', () => {
  it('turns each confirmed row into one receipt carrying its own transaction', () => {
    const p = normalizeProject(legacyProject());
    expect(p.receipts).toHaveLength(2);
    expect(p.receipts[0]).toMatchObject({
      amount: 5_500_000, accountId: 'acc-bca', transactionId: 'tx-1',
      allocations: [{ no: 1, amount: 5_500_000 }],
    });
    expect(projectReceivedTotal(p)).toBe(8_500_000);
  });

  it('waives a historical shortfall so it keeps reading as settled', () => {
    const p = normalizeProject(legacyProject());
    const short = p.payments.find((r) => r.no === 2);
    expect(short.closure).toEqual({ kind: 'waive', amount: 2_500_000, reason: 'legacy' });
    expect(rowState(p, short)).toBe('lunas');
    expect(rowRemaining(p, short)).toBe(0);
  });

  it('leaves untouched rows alone', () => {
    const p = normalizeProject(legacyProject());
    const last = p.payments.find((r) => r.no === 3);
    expect(last.closure).toBeUndefined();
    expect(rowState(p, last)).toBe('belum');
  });

  it('does not waive when the exact amount arrived', () => {
    const p = normalizeProject(legacyProject());
    expect(p.payments.find((r) => r.no === 1).closure).toBeUndefined();
  });

  it('does not waive when more arrived than was owed', () => {
    const p = normalizeProject({ payments: [
      { no: 1, expectedAmount: 5_000_000, receivedAmount: 6_000_000 },
    ] });
    expect(p.payments[0].closure).toBeUndefined();
  });

  it('leaves a project that already has receipts completely alone', () => {
    const already = {
      payments: [{ no: 1, expectedAmount: 5_500_000 }],
      receipts: [{ id: 'r1', amount: 3_000_000, allocations: [{ no: 1, amount: 3_000_000 }] }],
    };
    expect(normalizeProject(already)).toBe(already);
  });

  it('never mutates the project it was given', () => {
    const original = legacyProject();
    const snapshot = JSON.stringify(original);
    normalizeProject(original);
    expect(JSON.stringify(original)).toBe(snapshot);
  });

  it('survives a project with no payments at all', () => {
    expect(normalizeProject({ id: 'x' }).receipts).toEqual([]);
    expect(normalizeProject(null)).toBe(null);
  });
});
