import { describe, it, expect } from 'vitest';
import { openRows, allocateReceipt } from './allocation';

const project = (rows, receipts) => (receipts ? { payments: rows, receipts } : { payments: rows });
const row = (no, amount, due) => ({ no, expectedAmount: amount, dueDate: due, type: 'interest' });

const threeMonths = () => [
  row(1, 5_500_000, new Date(2026, 7, 5)),
  row(2, 5_500_000, new Date(2026, 8, 5)),
  row(3, 5_500_000, new Date(2026, 9, 5)),
];

describe('openRows', () => {
  it('lists only rows that still owe something, oldest first', () => {
    const rows = threeMonths();
    const p = project(rows, [
      { id: 'a', amount: 5_500_000, allocations: [{ no: 1, amount: 5_500_000 }] },
    ]);
    expect(openRows(p).map((r) => r.no)).toEqual([2, 3]);
  });

  it('orders by due date, not by the order rows happen to sit in', () => {
    const rows = [row(3, 1_000_000, new Date(2026, 9, 5)), row(1, 1_000_000, new Date(2026, 7, 5))];
    expect(openRows(project(rows)).map((r) => r.no)).toEqual([1, 3]);
  });

  it('breaks a tie on the same due date by number', () => {
    const d = new Date(2026, 7, 5);
    const rows = [row(2, 1_000_000, d), row(1, 1_000_000, d)];
    expect(openRows(project(rows)).map((r) => r.no)).toEqual([1, 2]);
  });
});

describe('allocateReceipt', () => {
  it('fills the oldest open tagihan first', () => {
    const p = project(threeMonths());
    expect(allocateReceipt(p, 3_000_000)).toEqual({
      allocations: [{ no: 1, amount: 3_000_000 }],
      leftover: 0,
    });
  });

  it('spills into the next tagihan when more arrives than one owes', () => {
    const p = project(threeMonths());
    expect(allocateReceipt(p, 7_000_000)).toEqual({
      allocations: [{ no: 1, amount: 5_500_000 }, { no: 2, amount: 1_500_000 }],
      leftover: 0,
    });
  });

  it('only fills what is still short on a partly paid tagihan', () => {
    const p = project(threeMonths(), [
      { id: 'a', amount: 3_000_000, allocations: [{ no: 1, amount: 3_000_000 }] },
    ]);
    expect(allocateReceipt(p, 2_500_000)).toEqual({
      allocations: [{ no: 1, amount: 2_500_000 }],
      leftover: 0,
    });
  });

  it('starts at the chosen tagihan and never pays an earlier one', () => {
    const p = project(threeMonths());
    expect(allocateReceipt(p, 6_000_000, 2)).toEqual({
      allocations: [{ no: 2, amount: 5_500_000 }, { no: 3, amount: 500_000 }],
      leftover: 0,
    });
  });

  it('reports what is left over when more arrives than the whole project owes', () => {
    const p = project([row(1, 5_500_000, new Date(2026, 7, 5))]);
    expect(allocateReceipt(p, 9_000_000)).toEqual({
      allocations: [{ no: 1, amount: 5_500_000 }],
      leftover: 3_500_000,
    });
  });

  it('allocates nothing when no tagihan is open', () => {
    const p = project(threeMonths(), [
      { id: 'a', amount: 16_500_000, allocations: [
        { no: 1, amount: 5_500_000 }, { no: 2, amount: 5_500_000 }, { no: 3, amount: 5_500_000 },
      ] },
    ]);
    expect(allocateReceipt(p, 1_000_000)).toEqual({ allocations: [], leftover: 1_000_000 });
  });

  it('allocates nothing for an amount of zero or less', () => {
    const p = project(threeMonths());
    expect(allocateReceipt(p, 0)).toEqual({ allocations: [], leftover: 0 });
    expect(allocateReceipt(p, -5)).toEqual({ allocations: [], leftover: 0 });
  });

  it('reports the whole amount as leftover when the chosen tagihan is not open', () => {
    const p = project(threeMonths(), [
      { id: 'a', amount: 5_500_000, allocations: [{ no: 1, amount: 5_500_000 }] },
    ]);
    expect(allocateReceipt(p, 1_000_000, 1)).toEqual({ allocations: [], leftover: 1_000_000 });
  });

  it('rounds to whole rupiah so no fraction of a cent is ever stored', () => {
    const p = project(threeMonths());
    expect(allocateReceipt(p, 1_000_000.4).allocations).toEqual([{ no: 1, amount: 1_000_000 }]);
  });
});
