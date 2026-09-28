import { allocateReceipt, openRows } from './allocation';
import { rowDue, rowRemaining, rowState, rowWaived } from './paymentStatus';
import { normalizeProject } from './normalizeProject';
import { statusChange } from './projectStatus';
import { calcMonthlyInterest } from './projectSchedule';
import { deriveRowFields, isLegacy } from './receiptOps';
import { principalPaidBefore } from './principalPayment';
import { formatCurrency } from './formatCurrency';
import { formatDate, toDate } from './formatDate';
import { reversalOf } from './projectMoney';

/**
 * Koreksi modal (spec 2026-09-28 §4): Nilai Project, Modal Keluar or
 * Rekening Sumber typed wrong, corrected after money has arrived. Decided as
 * data; DataContext moves the money and writes it.
 *
 * A new Nilai Project corrects a typo, it does not change the contract:
 * every tagihan is recomputed as if the right value had been typed from the
 * start, the months already paid included. The money that arrived never
 * changes; where it lands is decided again, as it would have been.
 */

const refuseAll = (why) => ({ ok: false, why, principal: { ok: false, why } });

/** What this project lets the owner correct, and why not. */
export function capitalCorrectionRules(project) {
  const p = normalizeProject(project);
  if (!p) return refuseAll('Project tidak ditemukan.');
  if (p.status === 'default') return refuseAll('Project macet tidak bisa dikoreksi modalnya.');
  if (p.rolledOverToProjectId) {
    return refuseAll('Project ini sudah dilanjutkan ke kontrak baru, jadi modalnya tidak bisa dikoreksi.');
  }
  if (p.fundingMode === 'rollover') {
    return refuseAll('Modal kontrak lanjutan dialihkan dari project lama dan tidak bisa diubah.');
  }
  if (p.settledEarly) {
    return refuseAll('Project ini ditutup lewat pelunasan dipercepat. Batalkan dulu pelunasannya, lalu koreksi modal.');
  }
  // The schedule changes only with Nilai Project: Modal Keluar and the
  // account stay correctable whatever the schedule holds.
  const principalRefused = (why) => ({ ok: true, why: null, principal: { ok: false, why } });
  if ((p.extensions || []).length) {
    return principalRefused(
      'Jadwal sudah diubah lewat Mundur/Perpanjang. Batalkan dulu perpanjangannya untuk mengubah Nilai Project.'
    );
  }
  // A closure keeps the amount it closed; only an old shortfall is measured
  // again by the correction itself.
  const closed = (p.payments || []).find(
    (r) => r.closure && !(r.closure.kind === 'waive' && r.closure.reason === 'legacy')
  );
  if (closed) {
    return principalRefused(
      `Bulan ${closed.no} sudah digabung atau dianggap lunas. Buka lagi dulu untuk mengubah Nilai Project.`
    );
  }
  return { ok: true, why: null, principal: { ok: true, why: null } };
}

// A row once Nilai Project is corrected, on the base the principal payments
// before it leave (`paidBefore`). A row that stores its rate is computed from
// it; an older row keeps the rate its amount implies, stored now so that a
// later correction, or a correction back, gives exactly the same amounts.
function corrected(row, oldPrincipal, newPrincipal, paidBefore = 0) {
  if (row.type === 'final') return { ...row, expectedAmount: newPrincipal };
  const oldBase = oldPrincipal - paidBefore;
  const newBase = newPrincipal - paidBefore;
  const stored = Number(row.ratePct);
  let rate = null;
  if (row.ratePct != null && Number.isFinite(stored)) rate = stored;
  else if (oldBase > 0) rate = Number((((Number(row.expectedAmount) || 0) * 100) / oldBase).toFixed(10));
  if (rate == null) return row;
  return { ...row, ratePct: rate, expectedAmount: calcMonthlyInterest(newBase, rate) };
}

const monthsOf = (allocations) => (allocations || []).map((a) => a.no).join();
const time = (value) => toDate(value)?.getTime() ?? 0;

// The latest arrival of money, in the shape stored.
function lastArrival(receipts) {
  return (receipts || []).reduce((latest, r) => (!latest || time(r.date) >= time(latest) ? r.date : latest), null);
}

// Every tagihan at the corrected amount, and every arrival of money placed
// again. Old confirmations go first, whatever their place in the list: each
// keeps its tagihan and closes it again, so no later payment can spill onto a
// month an old confirmation already paid. The other payments follow in the
// order they were recorded, each from the month it was for (`forNo`, kept
// while a correction has pushed it elsewhere) so that correcting back puts it
// where it was.
function replay(p, oldPrincipal, newPrincipal, paidBefore = () => 0) {
  let rows = (p.payments || []).map((row) => {
    const next = corrected(row, oldPrincipal, newPrincipal, paidBefore(row.no));
    // Measured again below, once the payment that confirmed it is placed.
    if (next.closure?.kind === 'waive' && next.closure.reason === 'legacy') delete next.closure;
    return next;
  });
  const all = p.receipts || [];
  const ordered = [...all.filter((r) => isLegacy(r)), ...all.filter((r) => !isLegacy(r))];
  const replayed = [];
  const moved = [];
  // Each stored receipt and what it became, matched by the receipt itself,
  // not its id, so the list is written back exactly as it was stored.
  const placed = new Map();
  for (const receipt of ordered) {
    const firstNo = receipt.allocations?.[0]?.no;
    const amount = Math.round(Number(receipt.amount) || 0);
    if (isLegacy(receipt) || amount <= 0) {
      replayed.push(receipt);
      placed.set(receipt, receipt);
      if (!isLegacy(receipt)) continue;
      // An old confirmation stays on the tagihan it was confirmed for,
      // whatever the amount, and a gap there is an old shortfall again.
      const state = { ...p, payments: rows, receipts: replayed };
      rows = rows.map((row) => {
        if (row.no !== firstNo) return row;
        const gap = rowRemaining(state, row);
        return gap > 0 ? { ...row, closure: { kind: 'waive', amount: gap, reason: 'legacy' } } : row;
      });
      continue;
    }
    const where = `Pembayaran ${formatCurrency(amount)} tanggal ${formatDate(receipt.date)}`;
    if (firstNo == null) {
      throw new Error(`${where} tidak tercatat di bulan mana pun, jadi Nilai Project tidak bisa dikoreksi.`);
    }
    // Allocated again from the month it was for, or from the next open one
    // when earlier money now covers that month.
    const forNo = receipt.forNo ?? firstNo;
    const state = { ...p, payments: rows, receipts: replayed };
    const from = openRows(state).find((r) => r.no >= forNo);
    const split = from ? allocateReceipt(state, amount, from.no) : { allocations: [], leftover: amount };
    if (!split.allocations.length || split.leftover > 0) {
      throw new Error(`${where} tidak muat di tagihan yang baru. Batalkan atau edit dulu pembayaran itu, lalu koreksi modal.`);
    }
    const next = { ...receipt, allocations: split.allocations };
    if (split.allocations[0].no === forNo) delete next.forNo;
    else next.forNo = forNo;
    if (monthsOf(split.allocations) !== monthsOf(receipt.allocations)) {
      moved.push({ receipt: next, allocations: split.allocations });
    }
    replayed.push(next);
    placed.set(receipt, next);
  }
  // Written back in the order they were recorded.
  const receipts = all.map((r) => placed.get(r) ?? r);
  return { payments: deriveRowFields(rows, receipts), receipts, moved };
}

/**
 * The balance changes a correction of Modal Keluar or Rekening Sumber makes,
 * one per account: the funding transaction reversed as it stands now, then
 * the corrected modal out of the chosen account. The screen and the writer
 * both use it, so what the preview shows is what is saved. `exists` leaves
 * out an account that is gone (it cannot be given its money back).
 * @returns [{ accountId, amount }]
 */
export function fundingMoves(funding, { disbursedAmount, sourceAccountId }, exists = () => true) {
  const deltas = new Map();
  const add = (id, amount) => {
    if (id) deltas.set(id, (deltas.get(id) || 0) + amount);
  };
  for (const [id, amount] of reversalOf(funding)) add(id, amount);
  add(sourceAccountId, -Math.round(Number(disbursedAmount) || 0));
  return [...deltas]
    .filter(([id, amount]) => amount !== 0 && exists(id))
    .map(([accountId, amount]) => ({ accountId, amount }));
}

/**
 * @param at  when the correction is made, in the shape stored; used as
 *            closedAt only when no money has arrived at all.
 * @returns {{ update, rows, moved }}
 *   update: only the fields that change (empty when nothing does)
 *   rows:   [{ no, type, before, after, stateBefore, stateAfter, waivedBefore, waivedAfter }]
 *           for the preview
 *   moved:  [{ receipt, allocations }] receipts whose months changed, so
 *           their transactions can say so
 */
export function applyCapitalCorrection(project, { principalAmount, disbursedAmount, sourceAccountId, at }) {
  const p = normalizeProject(project);
  const rules = capitalCorrectionRules(p);
  if (!rules.ok) throw new Error(rules.why);
  const newPrincipal = Math.round(Number(principalAmount) || 0);
  const newDisbursed = Math.round(Number(disbursedAmount) || 0);
  if (newPrincipal <= 0) throw new Error('Nilai project harus lebih dari 0');
  if (newDisbursed <= 0) throw new Error('Modal keluar harus lebih dari 0');
  if (!sourceAccountId) throw new Error('Pilih rekening sumber');

  const oldPrincipal = Number(p.principalAmount) || 0;
  const update = {};
  if (newDisbursed !== (Number(p.disbursedAmount) || 0)) update.disbursedAmount = newDisbursed;
  if (sourceAccountId !== (p.sourceAccountId ?? null)) update.sourceAccountId = sourceAccountId;

  let moved = [];
  if (newPrincipal !== oldPrincipal) {
    if (!rules.principal.ok) throw new Error(rules.principal.why);
    const stepsPaid = (p.principalPayments || []).reduce((sum, s) => sum + (Number(s.amount) || 0), 0);
    if (newPrincipal <= stepsPaid) {
      throw new Error(`Nilai Project harus lebih besar dari pokok yang sudah dibayar (${formatCurrency(stepsPaid)}).`);
    }
    const out = replay(p, oldPrincipal, newPrincipal, (no) => principalPaidBefore(p, no));
    moved = out.moved;
    update.principalAmount = newPrincipal;
    update.payments = out.payments;
    update.receipts = out.receipts;
    // A project the correction completes is dated by its last money, not by
    // the day of the correction.
    Object.assign(update, statusChange(p, out.payments, out.receipts, lastArrival(out.receipts) ?? at));
  }

  const after = { ...p, ...update };
  const rows = (p.payments || []).map((before) => {
    const now = (after.payments || []).find((r) => r.no === before.no) || before;
    return {
      no: before.no,
      type: before.type,
      before: rowDue(before),
      after: rowDue(now),
      stateBefore: rowState(p, before),
      stateAfter: rowState(after, now),
      waivedBefore: rowWaived(before),
      waivedAfter: rowWaived(now),
    };
  });
  return { update, rows, moved };
}
