import { describe, it, expect } from 'vitest';
import { projectEndFromDuration, projectEndDate } from './projectSchedule';

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
});

describe('projectEndDate', () => {
  it('returns null when there are no payments', () => {
    expect(projectEndDate({ payments: [] })).toBe(null);
  });
});
