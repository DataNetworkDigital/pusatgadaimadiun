import { describe, it, expect } from 'vitest';
import { statusChange } from './projectStatus';

const at = new Date(2026, 8, 20);
const rows = () => [
  { no: 1, type: 'interest', expectedAmount: 100, dueDate: new Date(2026, 7, 5) },
  { no: 2, type: 'final', expectedAmount: 1000, dueDate: new Date(2026, 8, 5) },
];
const receipts = (pairs) => pairs.map(([no, amount], i) => ({ id: `r${i}`, amount, allocations: [{ no, amount }] }));

describe('statusChange', () => {
  it('completes an active project whose last tagihan closes', () => {
    expect(statusChange({ status: 'active' }, rows(), receipts([[1, 100], [2, 1000]]), at)).toEqual({
      status: 'completed',
      closedAt: at,
    });
  });

  it('reopens a project completed by its payments when a tagihan opens again', () => {
    expect(statusChange({ status: 'completed' }, rows(), receipts([[1, 100]]), at)).toEqual({
      status: 'active',
      closedAt: null,
    });
  });

  it('leaves projects closed by pelunasan dipercepat or as macet alone', () => {
    expect(statusChange({ status: 'completed', settledEarly: true }, rows(), [], at)).toEqual({});
    expect(statusChange({ status: 'default' }, rows(), [], at)).toEqual({});
  });

  it('changes nothing when the status already fits', () => {
    expect(statusChange({ status: 'active' }, rows(), receipts([[1, 100]]), at)).toEqual({});
  });
});
