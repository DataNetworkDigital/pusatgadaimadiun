import { describe, it, expect } from 'vitest';
import {
  rowReceived, rowWaived, rowDue, rowRemaining, rowState,
  isSettled, isOverdue, projectReceivedTotal, hasAnyReceipt,
} from './paymentStatus';
import { generateProjectSchedule } from './projectSchedule';

const row = (over = {}) => ({ no: 1, type: 'interest', expectedAmount: 5_500_000, dueDate: new Date(2026, 9, 5), ...over });

// The receipts shape Bagian B2 will store.
const withReceipts = (rows, receipts) => ({ payments: rows, receipts });
// Today's stored shape: no receipts array at all.
const legacy = (rows) => ({ payments: rows });

describe('rowReceived', () => {
  it('sums the allocations pointed at that row', () => {
    const r = row();
    const p = withReceipts([r], [
      { id: 'a', amount: 3_000_000, allocations: [{ no: 1, amount: 3_000_000 }] },
      { id: 'b', amount: 1_000_000, allocations: [{ no: 1, amount: 1_000_000 }] },
    ]);
    expect(rowReceived(p, r)).toBe(4_000_000);
  });

  it('counts only the part of a split receipt that belongs to the row', () => {
    const r1 = row({ no: 1 });
    const r2 = row({ no: 2 });
    const p = withReceipts([r1, r2], [
      { id: 'a', amount: 7_000_000, allocations: [{ no: 1, amount: 1_500_000 }, { no: 2, amount: 5_500_000 }] },
    ]);
    expect(rowReceived(p, r1)).toBe(1_500_000);
    expect(rowReceived(p, r2)).toBe(5_500_000);
  });

  it('falls back to the stored receivedAmount when the project has no receipts array', () => {
    const r = row({ receivedAmount: 5_500_000 });
    expect(rowReceived(legacy([r]), r)).toBe(5_500_000);
  });

  it('reads an unpaid legacy row as zero, not NaN', () => {
    const r = row({ receivedAmount: null });
    expect(rowReceived(legacy([r]), r)).toBe(0);
  });
});

// None of these invariants are enforced here on purpose: rowReceived must stay
// a fast, total read helper, not a validator. The receipts writer Bagian B2
// builds is where a malformed or dishonest receipt should be rejected. These
// tests pin exactly what happens today so that (a) B2 cannot change this
// module's read behaviour by accident while building the writer, and (b)
// whoever builds the writer can see precisely which shapes it must prevent
// from ever reaching Firestore in the first place.
describe('allocation invariants nothing here enforces (the write boundary is B2\'s job)', () => {
  it('KNOWN GAP, not desired behaviour: two allocations in one receipt pointing at the same row double-count it, so a tagihan reads as paid when only half of it actually arrived', () => {
    const r = row(); // expectedAmount 5_500_000
    const p = withReceipts([r], [
      { id: 'a', amount: 5_500_000, allocations: [{ no: 1, amount: 5_500_000 }, { no: 1, amount: 5_500_000 }] },
    ]);
    expect(rowReceived(p, r)).toBe(11_000_000);
    expect(isSettled(p, r)).toBe(true); // dangerous: only 5.5jt (the receipt's own amount) ever arrived
  });

  it('KNOWN GAP, not desired behaviour: a negative allocation makes rowReceived and projectReceivedTotal disagree on how much money arrived', () => {
    const r = row();
    const p = withReceipts([r], [
      { id: 'a', amount: 5_500_000, allocations: [{ no: 1, amount: -5_500_000 }] },
    ]);
    expect(rowReceived(p, r)).toBe(-5_500_000);
    expect(projectReceivedTotal(p)).toBe(5_500_000);
  });

  it('a receipt with no allocations key at all contributes 0 to the row, not a crash', () => {
    const r = row();
    const p = withReceipts([r], [{ id: 'a', amount: 5_500_000 }]);
    expect(rowReceived(p, r)).toBe(0);
  });

  it('a receipt whose allocations is an object, not an array, contributes 0 to the row instead of throwing', () => {
    const r = row();
    const p = withReceipts([r], [{ id: 'a', amount: 5_500_000, allocations: { no: 1, amount: 5_500_000 } }]);
    expect(rowReceived(p, r)).toBe(0);
  });
});

describe('rowWaived', () => {
  it('counts a waive closure', () => {
    expect(rowWaived(row({ closure: { kind: 'waive', amount: 100_000 } }))).toBe(100_000);
  });

  it('ignores closures of other kinds', () => {
    expect(rowWaived(row({ closure: { kind: 'carry', amount: 100_000, toNo: 2 } }))).toBe(0);
  });

  it('is zero when there is no closure', () => {
    expect(rowWaived(row())).toBe(0);
  });
});

describe('rowRemaining and rowState', () => {
  it('reports the shortfall of a partly paid row', () => {
    const r = row();
    const p = withReceipts([r], [{ id: 'a', amount: 3_000_000, allocations: [{ no: 1, amount: 3_000_000 }] }]);
    expect(rowRemaining(p, r)).toBe(2_500_000);
    expect(rowState(p, r)).toBe('kurang');
  });

  it('is settled when payments cover the tagihan exactly', () => {
    const r = row();
    const p = withReceipts([r], [{ id: 'a', amount: 5_500_000, allocations: [{ no: 1, amount: 5_500_000 }] }]);
    expect(rowRemaining(p, r)).toBe(0);
    expect(rowState(p, r)).toBe('lunas');
    expect(isSettled(p, r)).toBe(true);
  });

  it('treats a waived shortfall as settled', () => {
    const r = row({ closure: { kind: 'waive', amount: 2_500_000 } });
    const p = withReceipts([r], [{ id: 'a', amount: 3_000_000, allocations: [{ no: 1, amount: 3_000_000 }] }]);
    expect(rowRemaining(p, r)).toBe(0);
    expect(rowState(p, r)).toBe('lunas');
  });

  it('never reports a negative remainder when more arrived than was owed', () => {
    const r = row();
    const p = withReceipts([r], [{ id: 'a', amount: 9_000_000, allocations: [{ no: 1, amount: 9_000_000 }] }]);
    expect(rowRemaining(p, r)).toBe(0);
    expect(rowState(p, r)).toBe('lunas');
  });

  it('calls an untouched row belum, not kurang', () => {
    const r = row();
    expect(rowState(legacy([r]), r)).toBe('belum');
    expect(isSettled(legacy([r]), r)).toBe(false);
  });
});

describe('unknown due (expectedAmount missing or not a number)', () => {
  it('a null expectedAmount with nothing received is not settled', () => {
    const r = row({ expectedAmount: null });
    const p = legacy([r]);
    expect(isSettled(p, r)).toBe(false);
    expect(rowState(p, r)).toBe('belum');
  });

  it('a row with no expectedAmount field at all, with nothing received, is not settled', () => {
    const r = { no: 1, type: 'interest', dueDate: new Date(2026, 9, 5) };
    const p = legacy([r]);
    expect(isSettled(p, r)).toBe(false);
    expect(rowState(p, r)).toBe('belum');
  });

  it('a non-numeric expectedAmount with nothing received is not settled', () => {
    const r = row({ expectedAmount: 'bukan angka' });
    const p = legacy([r]);
    expect(isSettled(p, r)).toBe(false);
    expect(rowState(p, r)).toBe('belum');
  });

  it('a genuinely zero expectedAmount, unlike an unknown one, is settled', () => {
    const r = row({ expectedAmount: 0 });
    const p = legacy([r]);
    expect(isSettled(p, r)).toBe(true);
    expect(rowState(p, r)).toBe('lunas');
  });

  it('stays settled once money has arrived, even with an unknown expectedAmount', () => {
    const r = row({ expectedAmount: null, receivedAmount: 1_000_000 });
    const p = legacy([r]);
    expect(isSettled(p, r)).toBe(true);
  });

  it('stays settled once waived, even with an unknown expectedAmount', () => {
    const r = row({ expectedAmount: null, closure: { kind: 'waive', amount: 100_000 } });
    const p = legacy([r]);
    expect(isSettled(p, r)).toBe(true);
  });
});

describe('isOverdue', () => {
  const r = row({ dueDate: new Date(2026, 9, 5) });

  it('is true when the due date has passed and money is still owed', () => {
    expect(isOverdue(legacy([r]), r, new Date(2026, 9, 20))).toBe(true);
  });

  it('is false once the row is settled', () => {
    const p = withReceipts([r], [{ id: 'a', amount: 5_500_000, allocations: [{ no: 1, amount: 5_500_000 }] }]);
    expect(isOverdue(p, r, new Date(2026, 9, 20))).toBe(false);
  });

  it('is false before the due date', () => {
    expect(isOverdue(legacy([r]), r, new Date(2026, 9, 1))).toBe(false);
  });
});

describe('projectReceivedTotal and hasAnyReceipt', () => {
  it('totals every receipt of the project', () => {
    const p = withReceipts([row()], [
      { id: 'a', amount: 3_000_000, allocations: [{ no: 1, amount: 3_000_000 }] },
      { id: 'b', amount: 1_000_000, allocations: [{ no: 1, amount: 1_000_000 }] },
    ]);
    expect(projectReceivedTotal(p)).toBe(4_000_000);
    expect(hasAnyReceipt(p)).toBe(true);
  });

  it('totals the stored amounts for a legacy project', () => {
    const p = legacy([row({ receivedAmount: 5_500_000 }), row({ no: 2, receivedAmount: null })]);
    expect(projectReceivedTotal(p)).toBe(5_500_000);
    expect(hasAnyReceipt(p)).toBe(true);
  });

  it('is zero and false for a project nobody has paid', () => {
    const p = legacy([row({ receivedAmount: null })]);
    expect(projectReceivedTotal(p)).toBe(0);
    expect(hasAnyReceipt(p)).toBe(false);
  });

  it('survives a missing project or missing payments', () => {
    expect(projectReceivedTotal(null)).toBe(0);
    expect(projectReceivedTotal({})).toBe(0);
    expect(hasAnyReceipt(null)).toBe(false);
  });
});

describe('rowDue', () => {
  it('is the tagihan amount, coerced', () => {
    expect(rowDue(row({ expectedAmount: '5500000' }))).toBe(5_500_000);
    expect(rowDue(row({ expectedAmount: undefined }))).toBe(0);
  });
});

// rowReceived matches allocations to a row with `a?.no === row.no`, a strict
// comparison: 1 !== '1'. Every writer of `no` in the repo (generateProjectSchedule,
// recomputeUnpaidSchedule, demoSeedData, demoReset, settleProjectEarly) produces a
// number, so the strict comparison is correct today. This pins that contract for
// the schedule generator specifically, so a future writer that starts producing a
// string trips this test instead of silently failing to match any allocation.
describe('generateProjectSchedule produces a numeric no', () => {
  it('every row of a generated schedule has a numeric no', () => {
    const schedule = generateProjectSchedule({
      principalAmount: 100_000_000,
      returnPctTier1: 5.5,
      returnPctTier2: 6.5,
      durationMonths: 3,
      startDate: new Date(2026, 0, 5),
      paymentDayOfMonth: 5,
    });
    expect(schedule.length).toBeGreaterThan(0);
    for (const p of schedule) {
      expect(typeof p.no).toBe('number');
    }
  });
});
