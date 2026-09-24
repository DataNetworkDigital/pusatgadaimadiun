import { describe, it, expect } from 'vitest';
import { carryTarget, remainderOptions, applyCloseRemainder, applyReopenRemainder } from './remainderOps';
import { isSettled, rowRemaining, rowState } from './paymentStatus';
import { allocateReceipt } from './allocation';
import { normalizeProject } from './normalizeProject';

const due = (month) => new Date(2026, month, 5);
const at = new Date(2026, 8, 20);

// Three monthly bagi hasil of 5,5jt and the pelunasan (100jt) in month four.
const schedule = () => [
  { no: 1, type: 'interest', expectedAmount: 5_500_000, dueDate: due(6), receivedAmount: null },
  { no: 2, type: 'interest', expectedAmount: 5_500_000, dueDate: due(7), receivedAmount: null },
  { no: 3, type: 'interest', expectedAmount: 5_500_000, dueDate: due(8), receivedAmount: null },
  { no: 4, type: 'final', expectedAmount: 100_000_000, dueDate: due(9), receivedAmount: null },
];
const arrival = (id, pays) => {
  const allocations = Object.entries(pays).map(([no, amount]) => ({ no: Number(no), amount }));
  return { id, amount: allocations.reduce((s, a) => s + a.amount, 0), date: due(8), accountId: 'bca', transactionId: `tx-${id}`, allocations };
};
const stored = (receipts, over = {}) => ({ status: 'active', payments: schedule(), receipts, ...over });
const legacy = (paid, over = {}) =>
  normalizeProject({
    status: 'active',
    payments: schedule().map((r) =>
      paid[r.no] != null ? { ...r, receivedAmount: paid[r.no], receivedDate: due(r.no + 5), accountId: 'bca', transactionId: `tx-${r.no}` } : r
    ),
    ...over,
  });
const row = (out, no) => out.update.payments.find((r) => r.no === no);
const after = (p, out) => ({ ...p, ...out.update });

describe('carryTarget and remainderOptions', () => {
  it('points at the next open tagihan, skipping paid ones', () => {
    const p = stored([arrival('a', { 2: 3_000_000 }), arrival('b', { 3: 5_500_000 })]);
    expect(carryTarget(p, 2).no).toBe(4);
    expect(carryTarget(p, 4)).toBeNull();
  });

  it('offers both closings on a partly paid bagi hasil, only forgiveness on the pelunasan', () => {
    const p = stored([arrival('a', { 2: 3_000_000 })]);
    expect(remainderOptions(p, 2)).toMatchObject({ amount: 2_500_000, carry: true, waive: true });
    expect(remainderOptions(p, 2).target.no).toBe(3);
    expect(remainderOptions(p, 4)).toMatchObject({ amount: 100_000_000, carry: false, waive: true });
  });

  it('offers nothing on a closed row or a project that is not active', () => {
    const p = stored([arrival('a', { 2: 3_000_000 })]);
    p.payments[1] = { ...p.payments[1], closure: { kind: 'waive', amount: 2_500_000, reason: 'manual' } };
    expect(remainderOptions(p, 2)).toMatchObject({ carry: false, waive: false });
    expect(remainderOptions(stored([], { status: 'default' }), 1)).toMatchObject({ carry: false, waive: false });
  });
});

describe('applyCloseRemainder', () => {
  it('moves what is left onto the next tagihan, which then asks for both', () => {
    const p = stored([arrival('a', { 2: 3_000_000 })]);
    const out = applyCloseRemainder(p, 2, { kind: 'carry', at, id: 'c1' });
    expect(row(out, 2).closure).toEqual({ kind: 'carry', toNo: 3, amount: 2_500_000, at, id: 'c1' });
    expect(isSettled(after(p, out), row(out, 2))).toBe(true);
    expect(rowRemaining(after(p, out), row(out, 3))).toBe(8_000_000);
    expect(allocateReceipt(after(p, out), 8_000_000, 3)).toEqual({ allocations: [{ no: 3, amount: 8_000_000 }], leftover: 0 });
    expect(out.update).not.toHaveProperty('receipts');
  });

  it('doubles next month when a month is carried whole', () => {
    const p = stored([]);
    const out = applyCloseRemainder(p, 1, { kind: 'carry', at });
    expect(rowRemaining(after(p, out), row(out, 2))).toBe(11_000_000);
    expect(rowState(after(p, out), row(out, 2))).toBe('belum');
  });

  it('can carry the last bagi hasil onto the pelunasan', () => {
    const p = stored([arrival('a', { 1: 5_500_000, 2: 5_500_000 })]);
    const out = applyCloseRemainder(p, 3, { kind: 'carry', at });
    expect(row(out, 3).closure.toNo).toBe(4);
    expect(rowRemaining(after(p, out), row(out, 4))).toBe(105_500_000);
  });

  it('forgives what is left, with the note, and completes a project with nothing else open', () => {
    const p = stored([arrival('a', { 1: 5_500_000, 2: 5_500_000, 3: 3_000_000 }), arrival('b', { 4: 100_000_000 })]);
    const out = applyCloseRemainder(p, 3, { kind: 'waive', note: 'diskon', at });
    expect(row(out, 3).closure).toEqual({ kind: 'waive', reason: 'manual', amount: 2_500_000, at, note: 'diskon' });
    expect(out.update.status).toBe('completed');
    expect(out.update.closedAt).toBe(at);
  });

  it('refuses a pelunasan carry, a row with nothing after it, a closed or paid row, and a closed project', () => {
    const p = stored([arrival('a', { 2: 3_000_000 })]);
    expect(() => applyCloseRemainder(p, 4, { kind: 'carry', at })).toThrow(/pelunasan/);
    const noNext = stored([arrival('a', { 4: 100_000_000 })]);
    expect(() => applyCloseRemainder(noNext, 3, { kind: 'carry', at })).toThrow(/Tidak ada tagihan berikutnya/);
    const closed = stored([]);
    closed.payments[0] = { ...closed.payments[0], closure: { kind: 'waive', amount: 5_500_000, reason: 'manual' } };
    expect(() => applyCloseRemainder(closed, 1, { kind: 'waive', at })).toThrow(/sudah ditutup/);
    expect(() => applyCloseRemainder(stored([arrival('a', { 1: 5_500_000 })]), 1, { kind: 'waive', at })).toThrow(/sudah lunas/);
    expect(() => applyCloseRemainder(stored([], { status: 'default' }), 1, { kind: 'waive', at })).toThrow(/masih aktif/);
  });
});

describe('applyReopenRemainder', () => {
  const carried = () => {
    const p = stored([arrival('a', { 2: 3_000_000 })]);
    return after(p, applyCloseRemainder(p, 2, { kind: 'carry', at }));
  };

  it('undoes a carry: the month owes its rest again and the next one only its own', () => {
    const p = carried();
    const out = applyReopenRemainder(p, 2);
    expect(row(out, 2)).not.toHaveProperty('closure');
    expect(rowRemaining(after(p, out), row(out, 2))).toBe(2_500_000);
    expect(rowRemaining(after(p, out), row(out, 3))).toBe(5_500_000);
  });

  it('refuses when the next month has already been paid for the carried part', () => {
    const p = carried();
    p.receipts = [...p.receipts, arrival('b', { 3: 6_000_000 })];
    expect(() => applyReopenRemainder(p, 2)).toThrow(/sudah ikut dibayar di bulan 3/);
  });

  it('refuses when the next month has a closure of its own', () => {
    const p = carried();
    p.payments = p.payments.map((r) => (r.no === 3 ? { ...r, closure: { kind: 'waive', amount: 8_000_000, reason: 'manual' } } : r));
    expect(() => applyReopenRemainder(p, 2)).toThrow(/bulan 3 sudah ditutup/);
  });

  it('reopens an old shortfall and marks the payment that confirmed it', () => {
    const p = legacy({ 1: 5_500_000, 2: 5_000_000, 3: 5_500_000, 4: 100_000_000 }, { status: 'completed' });
    const out = applyReopenRemainder(p, 2);
    expect(row(out, 2)).not.toHaveProperty('closure');
    expect(rowRemaining(after(p, out), row(out, 2))).toBe(500_000);
    expect(out.update.receipts.find((r) => r.id === 'legacy-2').reopened).toBe(true);
    expect(out.update.receipts.filter((r) => r.reopened)).toHaveLength(1);
    expect(out.update.status).toBe('active');
  });

  it('refuses closures made by pelunasan dipercepat, extensions and rollovers', () => {
    const settled = stored([], { status: 'completed', settledEarly: true });
    settled.payments[0] = { ...settled.payments[0], closure: { kind: 'waive', amount: 5_500_000, reason: 'settlement' } };
    expect(() => applyReopenRemainder(settled, 1)).toThrow(/sudah ditutup/);
    const extended = stored([]);
    extended.payments[3] = { ...extended.payments[3], closure: { kind: 'extend', amount: 100_000_000, extensionId: 'x' } };
    expect(() => applyReopenRemainder(extended, 4)).toThrow(/perpanjangan atau kontrak baru/);
  });
});

describe('reopening on a project carried into a new contract', () => {
  it('is refused, so the old project cannot become active again', () => {
    const p = stored([arrival('a', { 1: 5_000_000 })], { status: 'completed', rolledOverToProjectId: 'n1' });
    p.payments[0] = { ...p.payments[0], closure: { kind: 'waive', amount: 500_000, reason: 'manual' } };
    expect(() => applyReopenRemainder(p, 1)).toThrow(/kontrak baru/);
  });
});
