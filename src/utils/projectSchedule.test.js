import { describe, it, expect } from 'vitest';
import {
  projectEndFromDuration, projectEndDate, generateProjectSchedule, recomputeUnpaidSchedule,
} from './projectSchedule';

describe('projectEndFromDuration', () => {
  it('lands on the payment day, duration months after the start', () => {
    const p = {
      startDate: new Date(2026, 0, 10),
      durationMonths: 6,
      paymentDayOfMonth: 5,
    };
    const end = projectEndFromDuration(p);
    expect(end.getFullYear()).toBe(2026);
    expect(end.getMonth()).toBe(6); // Juli
    expect(end.getDate()).toBe(5);
  });

  it('clamps the payment day to the length of the month', () => {
    const p = {
      startDate: new Date(2026, 0, 31),
      durationMonths: 1,
      paymentDayOfMonth: 31,
    };
    const end = projectEndFromDuration(p);
    expect(end.getMonth()).toBe(1); // Februari
    expect(end.getDate()).toBe(28);
  });

  it('falls back to the last due date when duration is missing', () => {
    const p = {
      startDate: new Date(2026, 0, 10),
      payments: [
        { dueDate: new Date(2026, 1, 10) },
        { dueDate: new Date(2026, 3, 10) },
      ],
    };
    expect(projectEndFromDuration(p).getMonth()).toBe(3);
  });

  it('falls back to the start date\'s own day when paymentDayOfMonth is missing', () => {
    const p = {
      startDate: new Date(2026, 2, 17),
      durationMonths: 4,
    };
    const end = projectEndFromDuration(p);
    expect(end.getFullYear()).toBe(2026);
    expect(end.getMonth()).toBe(6); // Juli
    expect(end.getDate()).toBe(17);
  });

  it('rolls over into the next calendar year', () => {
    const p = {
      startDate: new Date(2026, 9, 10),
      durationMonths: 5,
      paymentDayOfMonth: 3,
    };
    const end = projectEndFromDuration(p);
    expect(end.getFullYear()).toBe(2027);
    expect(end.getMonth()).toBe(2); // Maret
    expect(end.getDate()).toBe(3);
  });
});

describe('projectEndDate', () => {
  it('returns null when there are no payments', () => {
    expect(projectEndDate({ payments: [] })).toBe(null);
  });

  it('returns the full date of the latest due date', () => {
    const p = {
      payments: [
        { dueDate: new Date(2026, 1, 10) },
        { dueDate: new Date(2026, 5, 22) },
        { dueDate: new Date(2026, 3, 5) },
      ],
    };
    const end = projectEndDate(p);
    expect(end.getFullYear()).toBe(2026);
    expect(end.getMonth()).toBe(5); // Juni
    expect(end.getDate()).toBe(22);
  });
});

describe('recomputeUnpaidSchedule when money has already arrived', () => {
  const terms = (durationMonths) => ({
    principalAmount: 100_000_000,
    returnPctTier1: 5.5,
    returnPctTier2: 6.5,
    durationMonths,
    startDate: new Date(2026, 0, 5),
    paymentDayOfMonth: 5,
  });
  const withPaid = (months, paid) =>
    generateProjectSchedule(terms(months)).map((r) =>
      paid[r.no] != null ? { ...r, receivedAmount: paid[r.no], receivedDate: new Date(2026, r.no, 5) } : r
    );

  it('still extends a project whose paid rows are all bagi hasil', () => {
    const rows = withPaid(3, { 1: 5_500_000, 2: 5_500_000 });
    const next = recomputeUnpaidSchedule(rows, terms(5));
    expect(next.map((r) => r.type)).toEqual(['interest', 'interest', 'interest', 'interest', 'final']);
    expect(next[0].receivedAmount).toBe(5_500_000);
    expect(next[4].expectedAmount).toBe(100_000_000);
  });

  it('refuses to extend once the pelunasan has received money', () => {
    const rows = withPaid(3, { 1: 5_500_000, 2: 5_500_000, 3: 40_000_000 });
    expect(() => recomputeUnpaidSchedule(rows, terms(5))).toThrow(/pelunasan \(bulan 3\)/);
  });

  it('refuses to shorten so that a paid bagi hasil becomes the pelunasan', () => {
    const rows = withPaid(6, { 1: 5_500_000, 2: 5_500_000, 3: 5_500_000 });
    expect(() => recomputeUnpaidSchedule(rows, terms(3))).toThrow(/bulan 3/);
  });

  it('refuses to shorten past a month that has received money', () => {
    const rows = withPaid(6, { 1: 5_500_000, 5: 1_500_000 });
    expect(() => recomputeUnpaidSchedule(rows, terms(4))).toThrow(/bulan 5/);
  });
});
