import { describe, it, expect } from 'vitest';
import {
  projectEndFromDuration, projectEndDate, generateProjectSchedule, recomputeUnpaidSchedule,
  projectSummary, projectEnd,
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

  it('refuses to shorten past a month a tunggakan was carried onto', () => {
    const rows = generateProjectSchedule(terms(6)).map((r) =>
      r.no === 2 ? { ...r, closure: { kind: 'carry', amount: 5_500_000, toNo: 5 } } : r
    );
    expect(() => recomputeUnpaidSchedule(rows, terms(4))).toThrow(/tunggakan yang digabung ke bulan 5/);
  });

  it('says a carried month was carried, not paid, when a shorter duration would drop its tunggakan', () => {
    const rows = generateProjectSchedule(terms(6)).map((r) =>
      r.no === 5 ? { ...r, closure: { kind: 'carry', amount: 5_500_000, toNo: 6 } } : r
    );
    expect(() => recomputeUnpaidSchedule(rows, terms(5))).toThrow(/tunggakan yang digabung ke bulan 6/);
  });

  it('names a closed month as closed, not as paid', () => {
    const rows = generateProjectSchedule(terms(6)).map((r) =>
      r.no === 5 ? { ...r, closure: { kind: 'waive', amount: 5_500_000, reason: 'manual' } } : r
    );
    expect(() => recomputeUnpaidSchedule(rows, terms(4))).toThrow(/bulan 5 sudah dibayar atau ditutup/);
  });
});

describe('projectSummary with extensions and rollovers', () => {
  const extended = {
    principalAmount: 100_000_000,
    disbursedAmount: 94_500_000,
    payments: [
      { no: 1, type: 'interest', expectedAmount: 5_500_000 },
      { no: 2, type: 'final', expectedAmount: 100_000_000, closure: { kind: 'extend', amount: 70_000_000 } },
      { no: 3, type: 'interest', expectedAmount: 4_550_000, baseAmount: 70_000_000 },
      { no: 4, type: 'final', expectedAmount: 70_000_000, baseAmount: 70_000_000 },
    ],
    receipts: [
      { id: 'a', amount: 35_500_000, allocations: [{ no: 1, amount: 5_500_000 }, { no: 2, amount: 30_000_000 }] },
    ],
  };

  it("counts a pelunasan's return against its own base", () => {
    expect(projectSummary(extended).expectedTotalReturn).toBe(10_050_000);
  });

  it('counts what went into a new contract as having come back', () => {
    const rolled = {
      ...extended,
      payments: [
        extended.payments[0],
        { ...extended.payments[1], closure: { kind: 'rollover', amount: 70_000_000, projectId: 'n' } },
      ],
    };
    const s = projectSummary(rolled);
    expect(s.rolledOut).toBe(70_000_000);
    expect(s.netCashChange).toBe(35_500_000 + 70_000_000 - 94_500_000);
    expect(s.expectedRemaining).toBe(0);
    expect(projectSummary(extended).rolledOut).toBe(0);
  });
});

describe('projectEnd', () => {
  it('follows the schedule once an extension moved the pelunasan, the contract otherwise', () => {
    const p = {
      startDate: new Date(2026, 0, 10), durationMonths: 2, paymentDayOfMonth: 5, extensions: [{ id: 'e' }],
      payments: [{ no: 1, dueDate: new Date(2026, 1, 5) }, { no: 2, dueDate: new Date(2026, 5, 5) }],
    };
    expect(projectEnd(p).toDateString()).toBe(new Date(2026, 5, 5).toDateString());
    expect(projectEnd({ ...p, extensions: [] }).toDateString()).toBe(new Date(2026, 2, 5).toDateString());
  });
});
