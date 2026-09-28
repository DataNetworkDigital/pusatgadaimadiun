import { describe, it, expect } from 'vitest';
import {
  applyPrincipalPayment,
  applyPrincipalPaymentUndo,
  defaultStepMonth,
  principalPaymentRules,
  principalUndoCheck,
  stepBase,
} from './principalPayment';
import { rowRemaining } from './paymentStatus';
import { receiptBlock } from './receiptOps';
import { applyCapitalCorrection } from './capitalCorrection';
import { settlementSuggestion } from './settlement';

const due = (month) => new Date(2026, month, 5);
// Nilai 100jt at 5,5% for five months: four bagi hasil of 5,5jt and the pelunasan.
const project = (over = {}) => ({
  id: 'p1',
  name: 'Pak Budi',
  status: 'active',
  principalAmount: 100_000_000,
  disbursedAmount: 94_500_000,
  sourceAccountId: 'bca',
  payments: [
    ...[1, 2, 3, 4].map((no) => ({
      no, type: 'interest', dueDate: due(5 + no), expectedAmount: 5_500_000, ratePct: 5.5, receivedAmount: null,
    })),
    { no: 5, type: 'final', dueDate: due(10), expectedAmount: 100_000_000, ratePct: null, receivedAmount: null },
  ],
  receipts: [],
  ...over,
});
const receipt = (id, amount, allocations, date = due(6)) => ({
  id, amount, date, accountId: 'bca', transactionId: id, allocations,
});
// Bulan 1 and 2 paid.
const paidTwo = (over = {}) =>
  project({
    receipts: [
      receipt('r1', 5_500_000, [{ no: 1, amount: 5_500_000 }]),
      receipt('r2', 5_500_000, [{ no: 2, amount: 5_500_000 }], due(7)),
    ],
    ...over,
  });
const pay = (p, over = {}) =>
  applyPrincipalPayment(p, { amount: 20_000_000, at: due(7), accountId: 'bca', transactionId: 'pk1', fromNo: 3, ...over });
const row = (update, no) => update.payments.find((r) => r.no === no);
const merged = (p, update) => ({ ...p, ...update });

describe('principalPaymentRules', () => {
  it('offers the untouched bagi hasil months and the pelunasan left', () => {
    const rules = principalPaymentRules(paidTwo());
    expect(rules.ok).toBe(true);
    expect(rules.remaining).toBe(100_000_000);
    expect(rules.final.no).toBe(5);
    expect(rules.months.map((r) => r.no)).toEqual([3, 4]);
  });

  it.each([
    [{ status: 'completed' }, 'masih aktif'],
    [{ extensions: [{ id: 'e1' }] }, 'Mundur/Diperpanjang'],
  ])('refuses on %o', (over, words) => {
    const rules = principalPaymentRules(paidTwo(over));
    expect(rules.ok).toBe(false);
    expect(rules.why).toContain(words);
  });

  it('refuses while a tunggakan sits on the pelunasan', () => {
    const p = paidTwo();
    p.payments[3] = { ...p.payments[3], closure: { kind: 'carry', amount: 5_500_000, toNo: 5 } };
    expect(principalPaymentRules(p).why).toContain('tunggakan');
  });

  it('starts by default at the first open month due after the payment', () => {
    const { months } = principalPaymentRules(paidTwo());
    expect(defaultStepMonth(months, due(7))).toBe(3);
    expect(defaultStepMonth(months, new Date(2026, 8, 10))).toBe(4);
    expect(defaultStepMonth(months, due(11))).toBe(null);
  });
});

describe('applyPrincipalPayment', () => {
  it('lands the money on the pelunasan and lowers the later bagi hasil (Gde, 28 Sep 2026)', () => {
    // Kontrak 5 bulan; in bulan 2, 20% of the principal came back.
    const p = paidTwo();
    const { update, finalNo } = pay(p);
    expect(finalNo).toBe(5);
    expect(update.payments.map((r) => r.expectedAmount)).toEqual([5_500_000, 5_500_000, 4_400_000, 4_400_000, 100_000_000]);
    expect(rowRemaining(merged(p, update), row(update, 5))).toBe(80_000_000);
    expect(update.receipts.at(-1)).toEqual(receipt('pk1', 20_000_000, [{ no: 5, amount: 20_000_000 }], due(7)));
    expect(update.principalPayments).toEqual([{ id: 'pk1', at: due(7), amount: 20_000_000, fromNo: 3 }]);
  });

  it('can leave the bagi hasil as they are', () => {
    const { update } = pay(paidTwo(), { fromNo: null });
    expect(update.payments.map((r) => r.expectedAmount)).toEqual([5_500_000, 5_500_000, 5_500_000, 5_500_000, 100_000_000]);
    expect(update.principalPayments[0].fromNo).toBe(null);
  });

  it('stacks a second payment on the first', () => {
    const p = paidTwo();
    const first = merged(p, pay(p).update);
    const { update } = pay(first, { amount: 10_000_000, transactionId: 'pk2', fromNo: 4 });
    expect(update.payments.map((r) => r.expectedAmount)).toEqual([5_500_000, 5_500_000, 4_400_000, 3_850_000, 100_000_000]);
    expect(rowRemaining(merged(first, update), row(update, 5))).toBe(70_000_000);
  });

  it('keeps the rate an old row implies, and stores it', () => {
    const p = paidTwo({ principalAmount: 60_000_000 });
    p.payments = p.payments.map((r) =>
      r.type === 'interest' ? { ...r, expectedAmount: 3_000_000, ratePct: null } : { ...r, expectedAmount: 60_000_000 }
    );
    const { update } = pay(p, { amount: 10_000_000 });
    expect(row(update, 3)).toMatchObject({ expectedAmount: 2_500_000, ratePct: 5 });
  });

  it('refuses paying the whole pelunasan, or starting at a month already paid', () => {
    expect(() => pay(paidTwo(), { amount: 100_000_000 })).toThrow('Tutup: Pelunasan');
    expect(() => pay(paidTwo(), { fromNo: 2 })).toThrow('sudah dibayar atau ditutup');
  });
});

describe('undoing the latest principal payment', () => {
  it('puts the bagi hasil and the pelunasan back and gives the money back', () => {
    const p = paidTwo();
    const after = merged(p, pay(p).update);
    const { update, receipt: gone } = applyPrincipalPaymentUndo(after, 'pk1');
    expect(gone.id).toBe('pk1');
    expect(update.payments.map((r) => r.expectedAmount)).toEqual([5_500_000, 5_500_000, 5_500_000, 5_500_000, 100_000_000]);
    expect(update.receipts.map((r) => r.id)).toEqual(['r1', 'r2']);
    expect(update.principalPayments).toEqual([]);
  });

  it('is refused once a month it changed has been paid', () => {
    const p = paidTwo();
    const after = merged(p, pay(p).update);
    const touched = { ...after, receipts: [...after.receipts, receipt('r3', 4_400_000, [{ no: 3, amount: 4_400_000 }])] };
    expect(principalUndoCheck(touched).why).toContain('bulan 3');
    expect(() => applyPrincipalPaymentUndo(touched, 'pk1')).toThrow('bulan 3');
  });

  it('only undoes the latest one', () => {
    const p = paidTwo();
    const first = merged(p, pay(p).update);
    const second = merged(first, pay(first, { amount: 10_000_000, transactionId: 'pk2', fromNo: 4 }).update);
    expect(() => applyPrincipalPaymentUndo(second, 'pk1')).toThrow('terakhir');
    expect(applyPrincipalPaymentUndo(second, 'pk2').update.payments.map((r) => r.expectedAmount)).toEqual([
      5_500_000, 5_500_000, 4_400_000, 4_400_000, 100_000_000,
    ]);
  });

  it('names the principal each step leaves', () => {
    const p = paidTwo();
    const first = merged(p, pay(p).update);
    const second = merged(first, pay(first, { amount: 10_000_000, transactionId: 'pk2', fromNo: 4 }).update);
    expect(stepBase(second, 0)).toBe(80_000_000);
    expect(stepBase(second, 1)).toBe(70_000_000);
  });
});

describe('a principal payment elsewhere in the app', () => {
  const stepped = () => {
    const p = paidTwo();
    return merged(p, pay(p).update);
  };

  it('is not corrected piecemeal', () => {
    const p = stepped();
    expect(receiptBlock(p, p.receipts.find((r) => r.id === 'pk1'))).toContain('Batalkan bayar pokok');
    expect(receiptBlock(p, p.receipts.find((r) => r.id === 'r1'))).toBe(null);
  });

  it('keeps its effect through a Koreksi modal', () => {
    const p = stepped();
    const { update } = applyCapitalCorrection(p, {
      principalAmount: 110_000_000, disbursedAmount: 94_500_000, sourceAccountId: 'bca', at: due(8),
    });
    expect(update.payments.map((r) => r.expectedAmount)).toEqual([6_050_000, 6_050_000, 4_950_000, 4_950_000, 110_000_000]);
    expect(rowRemaining(merged(p, update), row(update, 5))).toBe(90_000_000);
    expect(() =>
      applyCapitalCorrection(p, { principalAmount: 20_000_000, disbursedAmount: 94_500_000, sourceAccountId: 'bca', at: due(8) })
    ).toThrow('pokok yang sudah dibayar');
  });

  it('is taken off the pelunasan dipercepat suggestion', () => {
    // Modal keluar 94,5jt + bagi hasil bulan ini 4,4jt − pokok 20jt yang sudah masuk.
    expect(settlementSuggestion(stepped(), due(7)).amount).toBe(78_900_000);
  });
});
