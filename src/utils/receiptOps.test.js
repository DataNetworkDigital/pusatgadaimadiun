import { describe, it, expect } from 'vitest';
import {
  deriveRowFields, correctionRules, receiptBlock, applyReceiptCancel, applyReceiptEdit,
  applyReceiptMove, moveTargets,
} from './receiptOps';
import { isSettled, rowRemaining, rowState, projectReceivedTotal } from './paymentStatus';
import { normalizeProject } from './normalizeProject';

const due = (month) => new Date(2026, month, 5);

// Three monthly bagi hasil of 5,5jt and the pelunasan (100jt) in month four.
const schedule = () => [
  { no: 1, type: 'interest', expectedAmount: 5_500_000, dueDate: due(6), receivedAmount: null },
  { no: 2, type: 'interest', expectedAmount: 5_500_000, dueDate: due(7), receivedAmount: null },
  { no: 3, type: 'interest', expectedAmount: 5_500_000, dueDate: due(8), receivedAmount: null },
  { no: 4, type: 'final', expectedAmount: 100_000_000, dueDate: due(9), receivedAmount: null },
];

// One arrival of money; `pays` maps tagihan number to the amount it put there.
const arrival = (id, pays, { date = due(8), accountId = 'bca' } = {}) => {
  const allocations = Object.entries(pays).map(([no, amount]) => ({ no: Number(no), amount }));
  return {
    id,
    amount: allocations.reduce((s, a) => s + a.amount, 0),
    date,
    accountId,
    transactionId: `tx-${id}`,
    allocations,
  };
};

// A project that stores receipts, as B2 writes it.
const stored = (receipts, over = {}) => ({ status: 'active', payments: schedule(), receipts, ...over });

// A project stored before receipts existed: money only on the rows. The
// corrections receive it normalized, exactly as the screens do.
const legacy = (paid, over = {}) =>
  normalizeProject({
    status: 'active',
    payments: schedule().map((r) =>
      paid[r.no] != null
        ? { ...r, receivedAmount: paid[r.no], receivedDate: due(r.no + 5), accountId: 'bca', transactionId: `tx-${r.no}` }
        : r
    ),
    ...over,
  });

const row = (out, no) => out.update.payments.find((r) => r.no === no);
const after = (p, out) => ({ ...p, ...out.update });

describe('deriveRowFields', () => {
  it('sums what every arrival put on a tagihan and takes the latest arrival for the rest', () => {
    const receipts = [
      arrival('a', { 2: 3_000_000 }, { date: due(7), accountId: 'bca' }),
      arrival('b', { 2: 2_500_000, 3: 1_000_000 }, { date: due(8), accountId: 'bri' }),
    ];
    const rows = deriveRowFields(schedule(), receipts);
    expect(rows[1]).toMatchObject({ receivedAmount: 5_500_000, receivedDate: due(8), transactionId: 'tx-b', accountId: 'bri' });
    expect(rows[2]).toMatchObject({ receivedAmount: 1_000_000, receivedDate: due(8), transactionId: 'tx-b' });
  });

  it('clears the fields on a tagihan no arrival pays any more', () => {
    const rows = schedule();
    rows[0] = { ...rows[0], receivedAmount: 5_500_000, receivedDate: due(6), transactionId: 'tx-old', accountId: 'bca' };
    expect(deriveRowFields(rows, [])[0]).toMatchObject({
      receivedAmount: null,
      receivedDate: null,
      transactionId: null,
      accountId: null,
    });
  });
});

describe('correctionRules', () => {
  it('allows every correction on an active or completed project', () => {
    expect(correctionRules({ status: 'active' })).toEqual({ edit: true, move: true, cancel: true, why: null });
    expect(correctionRules({ status: 'completed' })).toEqual({ edit: true, move: true, cancel: true, why: null });
  });

  it('only allows editing on a project closed by pelunasan dipercepat, and says why', () => {
    const rules = correctionRules({ status: 'completed', settledEarly: true });
    expect(rules).toMatchObject({ edit: true, move: false, cancel: false });
    expect(rules.why).toMatch(/pelunasan dipercepat/);
  });

  it('allows nothing on a macet project', () => {
    expect(correctionRules({ status: 'default' })).toMatchObject({ edit: false, move: false, cancel: false });
  });
});

describe('receiptBlock', () => {
  it('does not block an old payment because of its own old-shortfall waiver', () => {
    const p = legacy({ 2: 5_000_000 });
    expect(receiptBlock(p, p.receipts.find((r) => r.id === 'legacy-2'))).toBeNull();
  });

  it('blocks when a tagihan it paid was closed another way', () => {
    const p = stored([arrival('a', { 2: 3_000_000 })]);
    p.payments[1] = { ...p.payments[1], closure: { kind: 'carry', amount: 2_500_000, toNo: 3 } };
    expect(receiptBlock(p, p.receipts[0])).toMatch(/bulan 2 sudah ditutup/);
  });
});

describe('applyReceiptCancel', () => {
  it('removes the arrival and opens the tagihan it paid again', () => {
    const p = stored([arrival('a', { 1: 5_500_000 }), arrival('b', { 2: 5_500_000 })]);
    const out = applyReceiptCancel(p, 'b');
    expect(out.update.receipts.map((r) => r.id)).toEqual(['a']);
    expect(out.update.receipts[0]).toEqual(p.receipts[0]);
    expect(rowState(after(p, out), row(out, 2))).toBe('belum');
    expect(row(out, 2)).toMatchObject({ receivedAmount: null, transactionId: null });
    expect(projectReceivedTotal(after(p, out))).toBe(5_500_000);
  });

  it('opens every tagihan a split arrival paid', () => {
    const p = stored([arrival('a', { 2: 5_500_000, 3: 1_500_000 })]);
    const out = applyReceiptCancel(p, 'a');
    expect(rowRemaining(after(p, out), row(out, 2))).toBe(5_500_000);
    expect(rowRemaining(after(p, out), row(out, 3))).toBe(5_500_000);
  });

  it("takes an old payment's shortfall waiver with it", () => {
    const p = legacy({ 1: 5_500_000, 2: 5_000_000 });
    const out = applyReceiptCancel(p, 'legacy-2');
    expect(row(out, 2)).not.toHaveProperty('closure');
    expect(rowRemaining(after(p, out), row(out, 2))).toBe(5_500_000);
    expect(isSettled(after(p, out), row(out, 1))).toBe(true);
  });

  it('puts a project completed by its payments back to active', () => {
    const p = stored(
      [arrival('a', { 1: 5_500_000, 2: 5_500_000, 3: 5_500_000 }), arrival('b', { 4: 100_000_000 })],
      { status: 'completed', closedAt: due(9) }
    );
    const out = applyReceiptCancel(p, 'b');
    expect(out.update.status).toBe('active');
    expect(out.update.closedAt).toBeNull();
  });

  it('is refused on a project closed by pelunasan dipercepat, and on a macet one', () => {
    const settled = stored([arrival('a', { 1: 5_500_000 })], { status: 'completed', settledEarly: true });
    expect(() => applyReceiptCancel(settled, 'a')).toThrow(/pelunasan dipercepat/);
    const macet = stored([arrival('a', { 1: 5_500_000 })], { status: 'default' });
    expect(() => applyReceiptCancel(macet, 'a')).toThrow(/macet/);
  });

  it('is refused for an arrival that does not exist', () => {
    expect(() => applyReceiptCancel(stored([]), 'nope')).toThrow(/tidak ditemukan/);
  });
});

const at = new Date(2026, 8, 20);
const edit = (p, id, amount, accountId = 'bca') => applyReceiptEdit(p, id, { amount, at, accountId });

describe('applyReceiptEdit: payments confirmed before this feature', () => {
  it('stays settled when corrected down, the gap kept as an old shortfall', () => {
    const p = legacy({ 1: 5_500_000 });
    const out = edit(p, 'legacy-1', 5_000_000);
    expect(row(out, 1).closure).toEqual({ kind: 'waive', amount: 500_000, reason: 'legacy' });
    expect(isSettled(after(p, out), row(out, 1))).toBe(true);
    expect(out.update.receipts.find((r) => r.id === 'legacy-1')).toMatchObject({
      amount: 5_000_000,
      date: at,
      allocations: [{ no: 1, amount: 5_000_000 }],
    });
    expect(out.update.status).toBeUndefined();
  });

  it('drops the old shortfall once corrected up to the full tagihan', () => {
    const p = legacy({ 2: 5_000_000 });
    expect(p.payments[1].closure).toEqual({ kind: 'waive', amount: 500_000, reason: 'legacy' });
    const out = edit(p, 'legacy-2', 5_500_000);
    expect(row(out, 2)).not.toHaveProperty('closure');
    expect(isSettled(after(p, out), row(out, 2))).toBe(true);
  });

  it('re-measures the old shortfall when corrected further down', () => {
    const p = legacy({ 2: 5_000_000 });
    const out = edit(p, 'legacy-2', 4_000_000);
    expect(row(out, 2).closure).toEqual({ kind: 'waive', amount: 1_500_000, reason: 'legacy' });
  });
});

describe('applyReceiptEdit: payments under the new rules', () => {
  it('lets a gap show as Kurang instead of hiding it', () => {
    const p = stored([arrival('a', { 1: 5_500_000 }), arrival('b', { 2: 5_500_000 })]);
    const out = edit(p, 'b', 5_000_000);
    expect(row(out, 2)).not.toHaveProperty('closure');
    expect(rowRemaining(after(p, out), row(out, 2))).toBe(500_000);
    expect(out.update.status).toBeUndefined();
  });

  it('re-splits an arrival that paid two tagihan, starting from the first one', () => {
    const p = stored([arrival('a', { 1: 5_500_000 }), arrival('b', { 2: 5_500_000, 3: 1_500_000 })]);
    expect(edit(p, 'b', 6_000_000).allocations).toEqual([
      { no: 2, amount: 5_500_000 },
      { no: 3, amount: 500_000 },
    ]);
    expect(edit(p, 'b', 12_000_000).allocations).toEqual([
      { no: 2, amount: 5_500_000 },
      { no: 3, amount: 5_500_000 },
      { no: 4, amount: 1_000_000 },
    ]);
  });

  it('edits one of several arrivals on the same tagihan and leaves the others alone', () => {
    const p = stored([arrival('a', { 2: 3_000_000 }), arrival('b', { 2: 2_500_000 })]);
    const out = edit(p, 'b', 2_000_000, 'bri');
    expect(out.update.receipts[0]).toEqual(p.receipts[0]);
    expect(out.update.receipts[1]).toMatchObject({ id: 'b', amount: 2_000_000, accountId: 'bri', date: at });
    expect(rowRemaining(after(p, out), row(out, 2))).toBe(500_000);
    expect(row(out, 2)).toMatchObject({ receivedAmount: 5_000_000 });
  });

  it('refuses an amount above what is still owed', () => {
    const p = stored(
      [arrival('a', { 1: 5_500_000, 2: 5_500_000, 3: 5_500_000 }), arrival('b', { 4: 100_000_000 })],
      { status: 'completed' }
    );
    expect(() => edit(p, 'b', 100_500_000)).toThrow('Jumlah melebihi sisa tagihan sebesar Rp 500.000');
  });

  it('puts a project completed by its payments back to active when a correction leaves a tagihan short', () => {
    const p = stored(
      [arrival('a', { 1: 5_500_000, 2: 5_500_000, 3: 5_500_000 }), arrival('b', { 4: 100_000_000 })],
      { status: 'completed', closedAt: due(9) }
    );
    const out = edit(p, 'b', 99_500_000);
    expect(out.update.status).toBe('active');
    expect(out.update.closedAt).toBeNull();
  });

  it('completes an active project when a correction pays its last tagihan in full', () => {
    const p = stored([arrival('a', { 1: 5_500_000, 2: 5_500_000, 3: 5_500_000 }), arrival('b', { 4: 99_500_000 })]);
    const out = edit(p, 'b', 100_000_000);
    expect(out.update.status).toBe('completed');
    expect(out.update.closedAt).toBe(at);
  });
});

describe('applyReceiptEdit: project closed by pelunasan dipercepat', () => {
  // Bulan 1 and 2 paid, then settled early for 100jt on a new pelunasan row 3.
  const settled = (paid2 = 5_500_000, closure2 = null) => ({
    status: 'completed',
    settledEarly: true,
    closedAt: due(8),
    payments: [
      { no: 1, type: 'interest', expectedAmount: 5_500_000, dueDate: due(6) },
      { no: 2, type: 'interest', expectedAmount: 5_500_000, dueDate: due(7), ...(closure2 ? { closure: closure2 } : {}) },
      { no: 3, type: 'final', expectedAmount: 100_000_000, dueDate: due(8), settledEarly: true },
    ],
    receipts: [arrival('a', { 1: 5_500_000 }), arrival('b', { 2: paid2 }), arrival('s', { 3: 100_000_000 })],
  });

  it('lets the pelunasan tagihan follow the corrected amount', () => {
    const p = settled();
    const out = edit(p, 's', 99_000_000);
    expect(row(out, 3).expectedAmount).toBe(99_000_000);
    expect(isSettled(after(p, out), row(out, 3))).toBe(true);
    expect(out.update.status).toBeUndefined();
  });

  it('keeps an earlier tagihan closed by the pelunasan when corrected down', () => {
    const p = settled();
    const out = edit(p, 'b', 5_000_000);
    expect(row(out, 2).closure).toEqual({ kind: 'waive', amount: 500_000, reason: 'settlement', at: due(8) });
    expect(isSettled(after(p, out), row(out, 2))).toBe(true);
    expect(out.update.status).toBeUndefined();
  });

  it('drops the pelunasan waiver once the tagihan is corrected up to full', () => {
    const p = settled(3_000_000, { kind: 'waive', amount: 2_500_000, reason: 'settlement', at: due(8) });
    const out = edit(p, 'b', 5_500_000);
    expect(row(out, 2)).not.toHaveProperty('closure');
  });
});

describe('applyReceiptMove', () => {
  it('moves an arrival to the month it was really for', () => {
    const p = stored([arrival('a', { 1: 5_500_000 }), arrival('b', { 2: 5_500_000 })]);
    const out = applyReceiptMove(p, 'b', 3);
    expect(out.allocations).toEqual([{ no: 3, amount: 5_500_000 }]);
    expect(rowState(after(p, out), row(out, 2))).toBe('belum');
    expect(isSettled(after(p, out), row(out, 3))).toBe(true);
    expect(projectReceivedTotal(after(p, out))).toBe(11_000_000);
    expect(out.update.receipts[0]).toEqual(p.receipts[0]);
  });

  it('spills forward from the new month the way new money does', () => {
    const p = stored([arrival('a', { 1: 5_500_000, 2: 1_500_000 })]);
    const out = applyReceiptMove(p, 'a', 2);
    expect(out.allocations).toEqual([{ no: 2, amount: 5_500_000 }, { no: 3, amount: 1_500_000 }]);
    expect(rowRemaining(after(p, out), row(out, 1))).toBe(5_500_000);
  });

  it('refuses a month that is already paid', () => {
    const p = stored([arrival('a', { 1: 5_500_000 }), arrival('b', { 2: 5_500_000 })]);
    expect(() => applyReceiptMove(p, 'b', 1)).toThrow('Tagihan bulan 1 sudah lunas. Pilih bulan lain.');
  });

  it('refuses the month it already starts from', () => {
    const p = stored([arrival('b', { 2: 5_500_000 })]);
    expect(() => applyReceiptMove(p, 'b', 2)).toThrow(/Pilih bulan lain/);
  });

  it('refuses a move the tagihan from that month on cannot hold', () => {
    const p = stored([arrival('a', { 3: 5_500_000, 4: 95_500_000 })]);
    expect(() => applyReceiptMove(p, 'a', 4)).toThrow(
      'Mulai bulan 4, sisa tagihan kurang Rp 1.000.000 untuk menampung pembayaran ini.'
    );
  });

  it('leaves the month an old payment was confirmed for open, with no waiver anywhere', () => {
    const p = legacy({ 2: 5_000_000 });
    const out = applyReceiptMove(p, 'legacy-2', 3);
    expect(row(out, 2)).not.toHaveProperty('closure');
    expect(rowState(after(p, out), row(out, 2))).toBe('belum');
    expect(row(out, 3)).not.toHaveProperty('closure');
    expect(rowRemaining(after(p, out), row(out, 3))).toBe(500_000);
  });

  it('is refused on a project closed by pelunasan dipercepat', () => {
    const p = stored([arrival('a', { 1: 5_500_000 })], { status: 'completed', settledEarly: true });
    expect(() => applyReceiptMove(p, 'a', 2)).toThrow(/pelunasan dipercepat/);
  });
});

describe('moveTargets', () => {
  it('lists the open tagihan as they would be without this arrival, minus where it starts now', () => {
    const p = stored([arrival('a', { 1: 5_500_000 }), arrival('b', { 2: 5_500_000, 3: 1_500_000 })]);
    expect(moveTargets(p, 'b')).toEqual([
      { no: 3, dueDate: due(8), remaining: 5_500_000 },
      { no: 4, dueDate: due(9), remaining: 100_000_000 },
    ]);
  });
});
