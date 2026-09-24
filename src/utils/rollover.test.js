import { describe, it, expect } from 'vitest';
import { rolloverSource, rolloverSchedule, applyRolloverClose, applyRolloverUndo } from './rollover';
import { isSettled, rowState } from './paymentStatus';
import { projectSummary } from './projectSchedule';

const due = (m) => new Date(2026, m, 5);
const at = new Date(2026, 9, 5);

const schedule = () => [
  { no: 1, type: 'interest', expectedAmount: 5_500_000, dueDate: due(6), receivedAmount: null },
  { no: 2, type: 'interest', expectedAmount: 5_500_000, dueDate: due(7), receivedAmount: null },
  { no: 3, type: 'interest', expectedAmount: 5_500_000, dueDate: due(8), receivedAmount: null },
  { no: 4, type: 'final', expectedAmount: 100_000_000, dueDate: due(9), receivedAmount: null },
];
const arrival = (id, pays, date) => {
  const allocations = Object.entries(pays).map(([no, amount]) => ({ no: Number(no), amount }));
  return { id, amount: allocations.reduce((s, a) => s + a.amount, 0), date, accountId: 'bca', transactionId: `tx-${id}`, allocations };
};
const bagiHasil = () => arrival('bh', { 1: 5_500_000, 2: 5_500_000, 3: 5_500_000 }, due(8));
const project = (receipts, over = {}) => ({
  status: 'active', principalAmount: 100_000_000, disbursedAmount: 94_500_000, paymentDayOfMonth: 5,
  payments: schedule(), receipts, ...over,
});
// 30 of the 100jt pelunasan paid in two parts, the latest on 7 Okt.
const partly = () => project([
  bagiHasil(),
  arrival('p1', { 4: 20_000_000 }, due(9)),
  arrival('p2', { 4: 10_000_000 }, new Date(2026, 9, 7)),
]);

describe('rolloverSource', () => {
  it('starts from what is left of a partly paid pelunasan, on the day its latest part arrived', () => {
    const src = rolloverSource(partly());
    expect(src).toMatchObject({ ok: true, amount: 70_000_000 });
    expect(src.final.no).toBe(4);
    expect(src.startDate.toDateString()).toBe(new Date(2026, 9, 7).toDateString());
  });

  it('refuses an untouched or paid pelunasan, an open earlier month and a closed project', () => {
    expect(rolloverSource(project([bagiHasil()])).why).toMatch(/belum dibayar/);
    expect(rolloverSource(project([bagiHasil(), arrival('p', { 4: 100_000_000 }, due(9))])).why).toMatch(/lunas/);
    expect(rolloverSource(project([arrival('p', { 4: 30_000_000 }, due(9))])).why).toMatch(/bulan 1 belum lunas/);
    expect(rolloverSource({ ...partly(), status: 'completed' }).ok).toBe(false);
  });
});

describe('rolloverSchedule', () => {
  const terms = {
    principalAmount: 70_000_000, returnPctTier1: 5.5, returnPctTier2: 6.5,
    durationMonths: 6, startDate: at, paymentDayOfMonth: 5,
  };

  it('is a normal schedule without the first-month charge', () => {
    const rows = rolloverSchedule({ ...terms, firstMonthCharge: 0 });
    expect(rows.map((r) => [r.no, r.type, r.expectedAmount])).toEqual([
      [1, 'interest', 3_850_000], [2, 'interest', 3_850_000], [3, 'interest', 3_850_000],
      [4, 'interest', 4_550_000], [5, 'interest', 4_550_000], [6, 'final', 70_000_000],
    ]);
    expect(rows.some((r) => r.leadCharge)).toBe(false);
  });

  it('adds a bagi hasil due on the contract day, then the usual months renumbered', () => {
    const rows = rolloverSchedule({ ...terms, firstMonthCharge: 3_850_000 });
    expect(rows[0]).toMatchObject({ no: 1, type: 'interest', expectedAmount: 3_850_000, leadCharge: true, receivedAmount: null });
    expect(rows[0].dueDate.toDate().toDateString()).toBe(at.toDateString());
    expect(rows.slice(1).map((r) => [r.no, r.expectedAmount])).toEqual([
      [2, 3_850_000], [3, 3_850_000], [4, 3_850_000], [5, 4_550_000], [6, 4_550_000], [7, 70_000_000],
    ]);
    expect(rows[1].dueDate.toDate().toDateString()).toBe(new Date(2026, 10, 5).toDateString());
  });
});

describe('closing the old project into the new contract, and undoing it', () => {
  it('closes the pelunasan with the rollover and completes the old project', () => {
    const p = partly();
    const out = applyRolloverClose(p, { newProjectId: 'n1', at });
    const final = out.update.payments.find((r) => r.no === 4);
    expect(final.closure).toEqual({ kind: 'rollover', amount: 70_000_000, projectId: 'n1', at });
    expect(out.update).toMatchObject({ status: 'completed', closedAt: at, rolledOverToProjectId: 'n1' });
    expect(out.amount).toBe(70_000_000);
    const next = { ...p, ...out.update };
    expect(next.payments.every((r) => isSettled(next, r))).toBe(true);
    // 46,5jt received + 70jt carried into the new contract − 94,5jt modal.
    expect(projectSummary(next).netCashChange).toBe(22_000_000);
  });

  it('opens the pelunasan again when the new contract is deleted', () => {
    const p = partly();
    const closed = { ...p, ...applyRolloverClose(p, { newProjectId: 'n1', at }).update };
    const out = applyRolloverUndo(closed, 'n1');
    expect(out.update).toMatchObject({ status: 'active', closedAt: null, rolledOverToProjectId: null });
    const reopened = { ...closed, ...out.update };
    expect(reopened.payments[3].closure).toBeUndefined();
    expect(rowState(reopened, reopened.payments[3])).toBe('kurang');
    expect(applyRolloverUndo(closed, 'lain').update).toBeNull();
  });

  it('refuses what rolloverSource refuses, and a missing new project', () => {
    expect(() => applyRolloverClose(project([bagiHasil()]), { newProjectId: 'n1', at })).toThrow(/belum dibayar/);
    expect(() => applyRolloverClose(partly(), { newProjectId: '', at })).toThrow(/Project baru/);
  });
});
