import { allocateReceipt, openRows } from './allocation';
import { rowDue, rowRemaining, rowState } from './paymentStatus';
import { normalizeProject } from './normalizeProject';
import { statusChange } from './projectStatus';
import { calcMonthlyInterest } from './projectSchedule';
import { deriveRowFields, isLegacy } from './receiptOps';
import { formatCurrency } from './formatCurrency';
import { formatDate } from './formatDate';

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

// A row's tagihan once Nilai Project is corrected. A row that stores its rate
// is computed from it; an older row keeps its own rate by scaling.
function correctedDue(row, oldPrincipal, newPrincipal) {
  if (row.type === 'final') return newPrincipal;
  const rate = Number(row.ratePct);
  if (row.ratePct != null && Number.isFinite(rate)) return calcMonthlyInterest(newPrincipal, rate);
  if (!oldPrincipal) return Number(row.expectedAmount) || 0;
  return Math.round(((Number(row.expectedAmount) || 0) * newPrincipal) / oldPrincipal);
}

const monthsOf = (allocations) => (allocations || []).map((a) => a.no).join();

// Every tagihan at the corrected amount, and every arrival of money placed
// again in the order it was recorded.
function replay(p, oldPrincipal, newPrincipal) {
  let rows = (p.payments || []).map((row) => {
    const next = { ...row, expectedAmount: correctedDue(row, oldPrincipal, newPrincipal) };
    // Measured again below, once the payment that confirmed it is placed.
    if (next.closure?.kind === 'waive' && next.closure.reason === 'legacy') delete next.closure;
    return next;
  });
  const replayed = [];
  const moved = [];
  for (const receipt of p.receipts || []) {
    const firstNo = receipt.allocations?.[0]?.no;
    const amount = Math.round(Number(receipt.amount) || 0);
    if (isLegacy(receipt) || amount <= 0) {
      replayed.push(receipt);
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
    // Any other payment is allocated again from the month it started at, or
    // from the next open one when earlier money now covers that month.
    const state = { ...p, payments: rows, receipts: replayed };
    const from = openRows(state).find((r) => r.no >= firstNo);
    const split = from ? allocateReceipt(state, amount, from.no) : { allocations: [], leftover: amount };
    if (!split.allocations.length || split.leftover > 0) {
      throw new Error(
        `Pembayaran ${formatCurrency(amount)} tanggal ${formatDate(receipt.date)} tidak muat di tagihan yang baru. Batalkan atau edit dulu pembayaran itu, lalu koreksi modal.`
      );
    }
    const next = { ...receipt, allocations: split.allocations };
    if (monthsOf(split.allocations) !== monthsOf(receipt.allocations)) {
      moved.push({ receipt: next, allocations: split.allocations });
    }
    replayed.push(next);
  }
  return { payments: deriveRowFields(rows, replayed), receipts: replayed, moved };
}

/**
 * @param at  when the correction is made, in the shape stored; it becomes
 *            closedAt if the correction completes the project.
 * @returns {{ update, rows, moved }}
 *   update: only the fields that change (empty when nothing does)
 *   rows:   [{ no, type, before, after, stateBefore, stateAfter }] for the preview
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
    const out = replay(p, oldPrincipal, newPrincipal);
    moved = out.moved;
    update.principalAmount = newPrincipal;
    update.payments = out.payments;
    update.receipts = out.receipts;
    Object.assign(update, statusChange(p, out.payments, out.receipts, at));
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
    };
  });
  return { update, rows, moved };
}
