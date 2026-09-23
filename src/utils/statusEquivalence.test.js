import { describe, it, expect } from 'vitest';
import { normalizeProject } from './normalizeProject';
import { isSettled, rowRemaining, projectReceivedTotal, hasAnyReceipt } from './paymentStatus';

// A spread of stored projects, including the shapes that actually caused
// trouble: an underpaid confirmed row, a zero-amount row, a row confirmed for
// more than its tagihan, and a project nobody has paid.
const projects = [
  { id: 'all-paid', payments: [
    { no: 1, expectedAmount: 5_500_000, receivedAmount: 5_500_000, type: 'interest' },
    { no: 2, expectedAmount: 100_000_000, receivedAmount: 100_000_000, type: 'final' },
  ] },
  { id: 'part-paid', payments: [
    { no: 1, expectedAmount: 5_500_000, receivedAmount: 5_500_000, type: 'interest' },
    { no: 2, expectedAmount: 5_500_000, receivedAmount: null, type: 'interest' },
  ] },
  { id: 'underpaid-row', payments: [
    { no: 1, expectedAmount: 5_500_000, receivedAmount: 3_000_000, type: 'interest' },
    { no: 2, expectedAmount: 5_500_000, receivedAmount: null, type: 'interest' },
  ] },
  { id: 'overpaid-row', payments: [
    { no: 1, expectedAmount: 5_000_000, receivedAmount: 6_000_000, type: 'interest' },
  ] },
  { id: 'zero-row', payments: [
    { no: 1, expectedAmount: 0, receivedAmount: 0, type: 'interest' },
  ] },
  { id: 'nothing-paid', payments: [
    { no: 1, expectedAmount: 5_500_000, receivedAmount: null, type: 'interest' },
  ] },
  { id: 'no-payments', payments: [] },
];

describe('the new rule reproduces the old one for stored data', () => {
  it('agrees row by row on whether a tagihan is settled', () => {
    for (const stored of projects) {
      const p = normalizeProject(stored);
      for (const row of stored.payments) {
        const oldAnswer = row.receivedAmount != null;
        const newRow = p.payments.find((r) => r.no === row.no);
        expect(
          isSettled(p, newRow),
          `${stored.id} row ${row.no}: settled`
        ).toBe(oldAnswer);
      }
    }
  });

  it('agrees on the total received per project', () => {
    for (const stored of projects) {
      const oldTotal = (stored.payments || []).reduce((s, p) => s + (p.receivedAmount || 0), 0);
      expect(projectReceivedTotal(normalizeProject(stored)), stored.id).toBe(oldTotal);
    }
  });

  it('agrees on whether any money has arrived', () => {
    for (const stored of projects) {
      const oldAnswer = (stored.payments || []).some((p) => p.receivedAmount != null);
      expect(hasAnyReceipt(normalizeProject(stored)), stored.id).toBe(oldAnswer);
    }
  });

  it('agrees on the sum still expected', () => {
    for (const stored of projects) {
      const oldRemaining = (stored.payments || [])
        .filter((p) => p.receivedAmount == null)
        .reduce((s, p) => s + p.expectedAmount, 0);
      const p = normalizeProject(stored);
      const newRemaining = p.payments.reduce((s, row) => s + rowRemaining(p, row), 0);
      expect(newRemaining, stored.id).toBe(oldRemaining);
    }
  });

  it('agrees on whether every tagihan is settled, which is what auto-completes a project', () => {
    for (const stored of projects) {
      const rows = stored.payments || [];
      const oldAllPaid = rows.length > 0 && rows.every((p) => p.receivedAmount != null);
      const p = normalizeProject(stored);
      const newAllPaid = p.payments.length > 0 && p.payments.every((row) => isSettled(p, row));
      expect(newAllPaid, stored.id).toBe(oldAllPaid);
    }
  });
});
