import { describe, it, expect } from 'vitest';
import {
  buildExtensionRows, extensionDue, currentFinal, extensionOptions, applyExtension, applyUndoExtension, undoCheck,
} from './extension';
import { isSettled, rowCarriedIn, rowRemaining, rowState } from './paymentStatus';
import { normalizeProject } from './normalizeProject';

const d = (y, m, day) => new Date(y, m, day);
const shape = (rows) =>
  rows.map((r) => ({ no: r.no, type: r.type, amount: r.expectedAmount, due: r.dueDate.toDate().toDateString() }));
const base = {
  firstNo: 4, anchorDue: d(2026, 9, 5), paymentDay: 5, months: 2, ratePct: 6.5,
  baseAmount: 100_000_000, startMode: 'today', extensionId: 'e1',
};

describe('buildExtensionRows', () => {
  it('Mundur from the pelunasan month itself (spec 7.1)', () => {
    const rows = buildExtensionRows(base);
    expect(shape(rows)).toEqual([
      { no: 4, type: 'interest', amount: 6_500_000, due: d(2026, 9, 5).toDateString() },
      { no: 5, type: 'interest', amount: 6_500_000, due: d(2026, 10, 5).toDateString() },
      { no: 6, type: 'final', amount: 100_000_000, due: d(2026, 11, 5).toDateString() },
    ]);
    for (const r of rows) {
      expect(r).toMatchObject({ extensionId: 'e1', baseAmount: 100_000_000, receivedAmount: null, transactionId: null });
    }
    expect(rows[0].ratePct).toBe(6.5);
    expect(rows[2].ratePct).toBeNull();
  });

  it('starting next month moves every row one month later', () => {
    const rows = buildExtensionRows({ ...base, startMode: 'nextMonth' });
    expect(shape(rows).map((r) => r.due)).toEqual(
      [d(2026, 10, 5), d(2026, 11, 5), d(2027, 0, 5)].map((x) => x.toDateString())
    );
  });

  it('asks 4.550.000 a month on a 70jt remainder at 6,5% (spec 7.2)', () => {
    const rows = buildExtensionRows({ ...base, firstNo: 5, baseAmount: 70_000_000 });
    expect(shape(rows).map((r) => [r.no, r.amount])).toEqual([[5, 4_550_000], [6, 4_550_000], [7, 70_000_000]]);
  });

  it('keeps the payment day, clamped to short months', () => {
    const rows = buildExtensionRows({ ...base, anchorDue: d(2026, 0, 31), paymentDay: 31, months: 1, startMode: 'nextMonth' });
    expect(rows[0].dueDate.toDate().getDate()).toBe(28); // Februari 2026
    expect(rows[1].dueDate.toDate().getDate()).toBe(31); // Maret
    expect(extensionDue(d(2026, 0, 31), 31, 'today').getDate()).toBe(31);
  });

  it('refuses what cannot be a schedule', () => {
    expect(() => buildExtensionRows({ ...base, months: 0 })).toThrow('Jumlah bulan');
    expect(() => buildExtensionRows({ ...base, months: 1.5 })).toThrow('Jumlah bulan');
    expect(() => buildExtensionRows({ ...base, ratePct: NaN })).toThrow('Persen');
    expect(() => buildExtensionRows({ ...base, ratePct: -1 })).toThrow('Persen');
    expect(() => buildExtensionRows({ ...base, baseAmount: 0 })).toThrow('Nilai');
    expect(() => buildExtensionRows({ ...base, anchorDue: null })).toThrow('Tanggal');
    expect(() => buildExtensionRows({ ...base, extensionId: '' })).toThrow('Id');
  });
});

const due = (m) => new Date(2026, m, 5);
const at = new Date(2026, 9, 5);

// Three monthly bagi hasil of 5,5jt and the pelunasan (100jt) on 5 Okt 2026.
const schedule = () => [
  { no: 1, type: 'interest', expectedAmount: 5_500_000, dueDate: due(6), receivedAmount: null },
  { no: 2, type: 'interest', expectedAmount: 5_500_000, dueDate: due(7), receivedAmount: null },
  { no: 3, type: 'interest', expectedAmount: 5_500_000, dueDate: due(8), receivedAmount: null },
  { no: 4, type: 'final', expectedAmount: 100_000_000, dueDate: due(9), receivedAmount: null },
];
const arrival = (id, pays) => {
  const allocations = Object.entries(pays).map(([no, amount]) => ({ no: Number(no), amount }));
  return { id, amount: allocations.reduce((s, a) => s + a.amount, 0), date: due(9), accountId: 'bca', transactionId: `tx-${id}`, allocations };
};
const bagiHasil = () => arrival('bh', { 1: 5_500_000, 2: 5_500_000, 3: 5_500_000 });
const project = (receipts, over = {}) => ({
  status: 'active', principalAmount: 100_000_000, paymentDayOfMonth: 5, payments: schedule(), receipts, ...over,
});
const after = (p, out) => ({ ...p, ...out.update });
const row = (out, no) => out.update.payments.find((r) => r.no === no);
const opts = (kind, over = {}) => ({ kind, months: 2, ratePct: 6.5, startMode: 'today', at, id: 'e1', ...over });

describe('what the pelunasan allows now', () => {
  it('offers Mundur on an untouched pelunasan and Diperpanjang on a partly paid one', () => {
    const untouched = extensionOptions(project([bagiHasil()]));
    expect(untouched.mundur.ok).toBe(true);
    expect(untouched.sisa.ok).toBe(false);
    expect(untouched.final.no).toBe(4);

    const partly = extensionOptions(project([bagiHasil(), arrival('p', { 4: 30_000_000 })]));
    expect(partly.mundur.ok).toBe(false);
    expect(partly.mundur.why).toMatch(/Atur sisa pelunasan/);
    expect(partly.sisa.ok).toBe(true);
    expect(partly.remainder).toBe(70_000_000);
  });

  it('offers nothing on a paid or closed pelunasan, or a project that is not active', () => {
    const paid = extensionOptions(project([bagiHasil(), arrival('p', { 4: 100_000_000 })]));
    expect([paid.mundur.ok, paid.sisa.ok]).toEqual([false, false]);
    const done = extensionOptions(project([], { status: 'completed' }));
    expect(done.mundur.why).toMatch(/masih aktif/);
    const closed = project([]);
    closed.payments[3] = { ...closed.payments[3], closure: { kind: 'waive', amount: 100_000_000, reason: 'manual' } };
    expect(extensionOptions(closed).mundur.ok).toBe(false);
  });

  it('finds the pelunasan the schedule ends with, after an earlier extension too', () => {
    const p = project([bagiHasil(), arrival('p', { 4: 30_000_000 })]);
    const out = applyExtension(p, opts('sisa'));
    expect(currentFinal(after(p, out)).no).toBe(7);
  });
});

describe('applyExtension: Mundur', () => {
  it('replaces the pelunasan with bagi hasil months and a later pelunasan', () => {
    const p = project([bagiHasil()]);
    const out = applyExtension(p, opts('mundur'));
    expect(out.update.payments.map((r) => [r.no, r.type, r.expectedAmount])).toEqual([
      [1, 'interest', 5_500_000], [2, 'interest', 5_500_000], [3, 'interest', 5_500_000],
      [4, 'interest', 6_500_000], [5, 'interest', 6_500_000], [6, 'final', 100_000_000],
    ]);
    expect(row(out, 4).dueDate.toDate().toDateString()).toBe(due(9).toDateString());
    expect(out.extension).toEqual({
      id: 'e1', at, kind: 'mundur', months: 2, ratePct: 6.5, startMode: 'today',
      baseAmount: 100_000_000, firstNo: 4, replacedRows: [schedule()[3]],
    });
    expect(out.update.extensions).toEqual([out.extension]);
    expect(out.update.status).toBeUndefined();
    expect(out.update.receipts).toBeUndefined();
  });

  it('stores the note only when there is one', () => {
    expect(applyExtension(project([]), opts('mundur')).extension.note).toBeUndefined();
    expect(applyExtension(project([]), opts('mundur', { note: 'panen telat' })).extension.note).toBe('panen telat');
  });

  it('moves a pelunasan an earlier Diperpanjang created, on its own base', () => {
    const p = project([bagiHasil(), arrival('p', { 4: 30_000_000 })]);
    const first = after(p, applyExtension(p, opts('sisa', { id: 'e1' })));
    const paid = { ...first, receipts: [...first.receipts, arrival('q', { 5: 4_550_000, 6: 4_550_000 })] };
    const out = applyExtension(paid, opts('mundur', { id: 'e2', months: 1 }));
    expect(out.update.payments.filter((r) => r.no >= 7).map((r) => [r.no, r.type, r.expectedAmount])).toEqual([
      [7, 'interest', 4_550_000], [8, 'final', 70_000_000],
    ]);
  });

  it('lets a tunggakan carried onto the pelunasan ride on the first new month', () => {
    const p = project([bagiHasil()]);
    p.payments[2] = { ...p.payments[2], closure: { kind: 'carry', amount: 2_000_000, toNo: 4 } };
    const next = after(p, applyExtension(p, opts('mundur')));
    const first = next.payments.find((r) => r.no === 4);
    expect(rowCarriedIn(next, first)).toBe(2_000_000);
    expect(rowRemaining(next, first)).toBe(8_500_000);
  });

  it('works on a project stored before receipts existed and writes no receipts', () => {
    const legacy = {
      status: 'active', principalAmount: 100_000_000, paymentDayOfMonth: 5,
      payments: schedule().map((r) => (r.no < 4 ? { ...r, receivedAmount: 5_500_000, receivedDate: due(r.no + 5) } : r)),
    };
    const out = applyExtension(legacy, opts('mundur'));
    expect(out.update.receipts).toBeUndefined();
    const next = normalizeProject({ ...legacy, ...out.update });
    expect(next.payments.filter((r) => isSettled(next, r)).map((r) => r.no)).toEqual([1, 2, 3]);
  });
});

describe('applyExtension: Diperpanjang', () => {
  it('closes the pelunasan with the extension and adds bagi hasil on the remainder (spec 7.2)', () => {
    const p = project([bagiHasil(), arrival('p', { 4: 30_000_000 })]);
    const out = applyExtension(p, opts('sisa'));
    expect(row(out, 4).closure).toEqual({ kind: 'extend', amount: 70_000_000, extensionId: 'e1', at });
    expect(out.update.payments.filter((r) => r.no > 4).map((r) => [r.no, r.type, r.expectedAmount])).toEqual([
      [5, 'interest', 4_550_000], [6, 'interest', 4_550_000], [7, 'final', 70_000_000],
    ]);
    const next = after(p, out);
    expect(isSettled(next, row(out, 4))).toBe(true);
    expect(rowState(next, row(out, 7))).toBe('belum');
    expect(out.extension).toMatchObject({ kind: 'sisa', baseAmount: 70_000_000, firstNo: 5, replacedRows: [] });
  });

  it('refuses what the pelunasan does not allow, an unknown choice and a missing start', () => {
    const untouched = project([bagiHasil()]);
    expect(() => applyExtension(untouched, opts('sisa'))).toThrow(/belum dibayar/);
    const partly = project([bagiHasil(), arrival('p', { 4: 30_000_000 })]);
    expect(() => applyExtension(partly, opts('mundur'))).toThrow(/Atur sisa pelunasan/);
    expect(() => applyExtension(partly, opts('lain'))).toThrow('Pilihan tidak dikenal');
    expect(() => applyExtension(partly, opts('sisa', { startMode: 'kemarin' }))).toThrow(/mulai/);
    expect(() => applyExtension(partly, opts('sisa', { id: '' }))).toThrow('Id');
  });
});

describe('applyUndoExtension', () => {
  it('brings a Mundur pelunasan back exactly as it was', () => {
    const p = project([bagiHasil()]);
    const extended = after(p, applyExtension(p, opts('mundur')));
    const out = applyUndoExtension(extended, 'e1');
    expect(out.update.payments).toEqual(p.payments);
    expect(out.update.extensions).toEqual([]);
  });

  it('opens a Diperpanjang pelunasan again', () => {
    const p = project([bagiHasil(), arrival('p', { 4: 30_000_000 })]);
    const extended = after(p, applyExtension(p, opts('sisa')));
    const out = applyUndoExtension(extended, 'e1');
    expect(out.update.payments).toEqual(p.payments);
    expect(rowState(after(extended, out), row(out, 4))).toBe('kurang');
  });

  it('refuses once a new month has money or a closure', () => {
    const p = project([bagiHasil()]);
    const extended = after(p, applyExtension(p, opts('mundur')));
    const paid = { ...extended, receipts: [...extended.receipts, arrival('x', { 5: 1_000_000 })] };
    expect(() => applyUndoExtension(paid, 'e1')).toThrow(/Bulan 5/);
    const closed = {
      ...extended,
      payments: extended.payments.map((r) => (r.no === 4 ? { ...r, closure: { kind: 'waive', amount: 6_500_000, reason: 'manual' } } : r)),
    };
    expect(() => applyUndoExtension(closed, 'e1')).toThrow(/Bulan 4/);
  });

  it('refuses while a tunggakan sits on one of its months, except a Mundur first month', () => {
    const p = project([bagiHasil()]);
    const extended = after(p, applyExtension(p, opts('mundur')));
    const carryTo = (toNo) => ({
      ...extended,
      payments: extended.payments.map((r) => (r.no === 3 ? { ...r, closure: { kind: 'carry', amount: 1, toNo } } : r)),
    });
    expect(() => applyUndoExtension(carryTo(4), 'e1')).not.toThrow();
    expect(() => applyUndoExtension(carryTo(5), 'e1')).toThrow(/Tunggakan bulan 3/);
  });

  it('undoes only the latest extension, and only the one the owner saw', () => {
    const p = project([bagiHasil()]);
    const once = after(p, applyExtension(p, opts('mundur', { id: 'e1' })));
    const twice = after(once, applyExtension(once, opts('mundur', { id: 'e2', months: 1 })));
    expect(() => applyUndoExtension(twice, 'e1')).toThrow(/terakhir/);
    expect(applyUndoExtension(twice, 'e2').update.extensions.map((e) => e.id)).toEqual(['e1']);
    expect(() => applyUndoExtension(p)).toThrow(/Tidak ada/);
    expect(undoCheck(twice)).toEqual({ ok: true, why: null });
    expect(undoCheck({ ...twice, status: 'completed' }).ok).toBe(false);
  });
});
