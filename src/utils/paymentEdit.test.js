import { describe, it, expect } from 'vitest';
import { applyPaymentEdit } from './paymentEdit';
import { isSettled, rowRemaining } from './paymentStatus';
import { normalizeProject } from './normalizeProject';

const due = (month) => new Date(2026, month, 5);
const at = new Date(2026, 8, 20);
const schedule = () => [
  { no: 1, type: 'interest', expectedAmount: 5_500_000, dueDate: due(6), receivedAmount: null },
  { no: 2, type: 'interest', expectedAmount: 5_500_000, dueDate: due(7), receivedAmount: null },
  { no: 3, type: 'interest', expectedAmount: 5_500_000, dueDate: due(8), receivedAmount: null },
  { no: 4, type: 'final', expectedAmount: 100_000_000, dueDate: due(9), receivedAmount: null },
];

// A project exactly as the screens see it: normalized on read.
function project({ status = 'active', settledEarly, rows = schedule(), paidRows = [], stored = true } = {}) {
  const payments = rows.map((r) => {
    const e = paidRows.find((x) => x.no === r.no);
    return e
      ? { ...r, receivedAmount: e.amount, receivedDate: due(r.no + 5), accountId: 'bca', transactionId: `tx-${r.no}` }
      : r;
  });
  const p = { status, payments, closedAt: status === 'completed' ? due(10) : undefined };
  if (settledEarly) p.settledEarly = true;
  if (stored) {
    p.receipts = paidRows.map((e) => ({
      id: e.id || `tx-${e.no}`,
      amount: e.amount,
      date: due(e.no + 5),
      accountId: 'bca',
      transactionId: `tx-${e.no}`,
      allocations: e.allocations || [{ no: e.no, amount: e.amount }],
    }));
  }
  return normalizeProject(p);
}

const edit = (p, no, amount, accountId = 'bca') => {
  const out = applyPaymentEdit(p, no, { amount, at, accountId });
  return { out, after: { ...p, ...out } };
};
const rowOf = (out, no) => out.payments.find((r) => r.no === no);

describe('applyPaymentEdit: tagihan confirmed before partial payments existed', () => {
  it('stays settled when corrected down, and the gap is kept as an old shortfall', () => {
    const p = project({ stored: false, paidRows: [{ no: 1, amount: 5_500_000 }] });
    const { out, after } = edit(p, 1, 5_000_000);
    expect(rowOf(out, 1).closure).toEqual({ kind: 'waive', amount: 500_000, reason: 'legacy' });
    expect(isSettled(after, rowOf(out, 1))).toBe(true);
    expect(out.receipts.find((r) => r.id === 'legacy-1')).toMatchObject({
      amount: 5_000_000,
      allocations: [{ no: 1, amount: 5_000_000 }],
    });
    expect(out.status).toBeUndefined();
  });

  it('drops the old shortfall once the amount is corrected up to the full tagihan', () => {
    const p = project({ stored: false, paidRows: [{ no: 2, amount: 5_000_000 }] });
    expect(rowOf(p, 2).closure).toEqual({ kind: 'waive', amount: 500_000, reason: 'legacy' });
    const { out, after } = edit(p, 2, 5_500_000);
    expect(rowOf(out, 2)).not.toHaveProperty('closure');
    expect(isSettled(after, rowOf(out, 2))).toBe(true);
  });

  it('resizes the old shortfall when the amount goes further down', () => {
    const p = project({ stored: false, paidRows: [{ no: 2, amount: 5_000_000 }] });
    const { out } = edit(p, 2, 4_000_000);
    expect(rowOf(out, 2).closure).toEqual({ kind: 'waive', amount: 1_500_000, reason: 'legacy' });
  });
});

describe('applyPaymentEdit: tagihan paid under the new rules', () => {
  it('lets a shortfall show instead of hiding it', () => {
    const p = project({ paidRows: [{ no: 1, amount: 5_500_000 }, { no: 2, amount: 5_500_000 }] });
    const { out, after } = edit(p, 2, 5_000_000);
    expect(rowOf(out, 2)).not.toHaveProperty('closure');
    expect(rowRemaining(after, rowOf(out, 2))).toBe(500_000);
    expect(isSettled(after, rowOf(out, 2))).toBe(false);
    expect(out.status).toBeUndefined();
  });

  it('reopens a project completed by payments when a correction leaves a tagihan short', () => {
    const p = project({
      status: 'completed',
      paidRows: [
        { no: 1, amount: 5_500_000 },
        { no: 2, amount: 5_500_000 },
        { no: 3, amount: 5_500_000 },
        { no: 4, amount: 100_000_000 },
      ],
    });
    const { out } = edit(p, 4, 99_500_000);
    expect(out.status).toBe('active');
    expect(out.closedAt).toBeNull();
  });

  it('leaves a completed project alone when the correction keeps everything paid', () => {
    const p = project({
      status: 'completed',
      paidRows: [
        { no: 1, amount: 5_500_000 },
        { no: 2, amount: 5_500_000 },
        { no: 3, amount: 5_500_000 },
        { no: 4, amount: 100_000_000 },
      ],
    });
    const { out } = edit(p, 4, 100_000_000, 'bri');
    expect(out.status).toBeUndefined();
    expect(out).not.toHaveProperty('closedAt');
    expect(rowOf(out, 4).accountId).toBe('bri');
  });

  it('rewrites only the one receipt behind the row', () => {
    const p = project({ paidRows: [{ no: 1, amount: 5_500_000 }, { no: 2, amount: 5_500_000 }] });
    const { out } = edit(p, 2, 5_000_000, 'bri');
    expect(out.receipts[0]).toEqual(p.receipts[0]);
    expect(out.receipts[1]).toMatchObject({
      id: 'tx-2',
      amount: 5_000_000,
      date: at,
      accountId: 'bri',
      allocations: [{ no: 2, amount: 5_000_000 }],
    });
    expect(rowOf(out, 2)).toMatchObject({ receivedAmount: 5_000_000, receivedDate: at, accountId: 'bri' });
  });

  it('refuses a tagihan paid in more than one arrival', () => {
    const p = project({ paidRows: [{ no: 1, amount: 5_500_000 }] });
    p.receipts = [
      { id: 'a', amount: 3_000_000, allocations: [{ no: 1, amount: 3_000_000 }] },
      { id: 'b', amount: 2_500_000, allocations: [{ no: 1, amount: 2_500_000 }] },
    ];
    expect(() => edit(p, 1, 5_000_000)).toThrow(/beberapa kali bayar/);
  });

  it('refuses a row with money but no receipt behind it, rather than half-editing it', () => {
    const p = project({ paidRows: [{ no: 1, amount: 5_500_000 }] });
    p.receipts = [];
    expect(() => edit(p, 1, 5_000_000)).toThrow(/belum tercatat lengkap/);
  });

  it('refuses one arrival that also paid another tagihan', () => {
    const p = project({
      paidRows: [{ no: 1, amount: 7_000_000, allocations: [{ no: 1, amount: 5_500_000 }, { no: 2, amount: 1_500_000 }] }],
    });
    expect(() => edit(p, 1, 5_000_000)).toThrow(/menutup tagihan lain/);
  });
});

describe('applyPaymentEdit: project closed by pelunasan dipercepat', () => {
  const settledRows = () => [
    { no: 1, type: 'interest', expectedAmount: 5_500_000, dueDate: due(6), receivedAmount: null },
    { no: 2, type: 'interest', expectedAmount: 5_500_000, dueDate: due(7), receivedAmount: null },
    { no: 3, type: 'final', expectedAmount: 100_000_000, dueDate: due(8), receivedAmount: null, settledEarly: true },
  ];

  it('lets the pelunasan tagihan follow the corrected amount', () => {
    const p = project({
      status: 'completed',
      settledEarly: true,
      rows: settledRows(),
      paidRows: [{ no: 1, amount: 5_500_000 }, { no: 2, amount: 5_500_000 }, { no: 3, amount: 100_000_000 }],
    });
    const { out, after } = edit(p, 3, 99_000_000);
    expect(rowOf(out, 3).expectedAmount).toBe(99_000_000);
    expect(isSettled(after, rowOf(out, 3))).toBe(true);
    expect(out.status).toBeUndefined();
  });

  it('keeps an earlier tagihan closed by the pelunasan when corrected down', () => {
    const p = project({
      status: 'completed',
      settledEarly: true,
      rows: settledRows(),
      paidRows: [{ no: 1, amount: 5_500_000 }, { no: 2, amount: 5_500_000 }, { no: 3, amount: 100_000_000 }],
    });
    const { out, after } = edit(p, 2, 5_000_000);
    expect(rowOf(out, 2).closure).toMatchObject({ kind: 'waive', amount: 500_000, reason: 'settlement' });
    expect(isSettled(after, rowOf(out, 2))).toBe(true);
    expect(out.status).toBeUndefined();
  });

  it('drops the pelunasan closure once the tagihan is corrected up to full', () => {
    const rows = settledRows();
    rows[1] = { ...rows[1], closure: { kind: 'waive', amount: 2_500_000, reason: 'settlement', at: due(9) } };
    const p = project({
      status: 'completed',
      settledEarly: true,
      rows,
      paidRows: [{ no: 1, amount: 5_500_000 }, { no: 2, amount: 3_000_000 }, { no: 3, amount: 97_000_000 }],
    });
    const { out } = edit(p, 2, 5_500_000);
    expect(rowOf(out, 2)).not.toHaveProperty('closure');
  });
});
