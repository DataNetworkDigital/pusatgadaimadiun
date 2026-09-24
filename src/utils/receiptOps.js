import { allocateReceipt } from './allocation';
import { isSettled, rowRemaining } from './paymentStatus';
import { formatCurrency } from './formatCurrency';
import { normalizeProject } from './normalizeProject';
import { toDate } from './formatDate';

/**
 * Correcting one arrival of money, decided as data. DataContext moves the
 * money and writes the result.
 *
 * Three corrections, each touching exactly one receipt; other receipts never
 * move (spec 6.3):
 * - Edit: new amount, account, or date. The receipt is re-allocated from the
 *   first tagihan it paid, oldest first, the same way new money is.
 * - Move: the same amount re-allocated from another tagihan ("salah bulan").
 * - Cancel: the receipt is removed and the tagihan it paid open again.
 *
 * What a correction does to "is this tagihan settled":
 * - A payment confirmed before partial payments existed (a `legacy-`
 *   receipt) closed its tagihan whatever amount was typed, and the owner
 *   decided those stay settled and get listed. An Edit keeps that meaning for
 *   the tagihan it was confirmed for: its gap is re-measured as an
 *   old-shortfall waiver. Moving or cancelling it undoes the confirmation, so
 *   its waiver goes with it and the tagihan opens honestly.
 * - On a project closed by pelunasan dipercepat, the pelunasan closed
 *   everything by agreement: after an Edit every gap is closed by the
 *   pelunasan again, and the pelunasan row's tagihan is simply what was paid.
 *   Moving and cancelling are not offered there (spec 6.4).
 * - Otherwise the new rules apply and a gap shows as Kurang.
 * A project completed by its payments goes back to active when a correction
 * leaves a tagihan open, and an active one that a correction finishes is
 * completed.
 *
 * Every function returns `update`: exactly the fields to write onto the
 * project document, with the whole receipts array and the per-row fields
 * recomputed, never a partial array.
 */

const isLegacy = (receipt) => String(receipt?.id ?? '').startsWith('legacy-');
const time = (value) => toDate(value)?.getTime() ?? 0;
const nosOf = (receipt) => new Set((receipt?.allocations || []).map((a) => a.no));

// The waivers a correction of this receipt knows how to take back and
// re-measure. Anything else on its tagihan blocks the correction.
function ownedBy(project, receipt, closure) {
  if (closure?.kind !== 'waive') return false;
  if (closure.reason === 'legacy') return isLegacy(receipt);
  if (closure.reason === 'settlement') return !!project.settledEarly;
  return false;
}

/** Which corrections this project allows at all, and why not when it does not. */
export function correctionRules(project) {
  if (project?.status === 'default') {
    return { edit: false, move: false, cancel: false, why: 'Project macet: pembayarannya tidak bisa diubah.' };
  }
  if (project?.settledEarly) {
    return {
      edit: true,
      move: false,
      cancel: false,
      why: 'Project ini ditutup lewat pelunasan dipercepat. Pembayarannya bisa diedit, tapi tidak bisa dipindah atau dibatalkan.',
    };
  }
  return { edit: true, move: true, cancel: true, why: null };
}

/**
 * A tagihan this receipt paid that was closed some other way (gabung, anggap
 * lunas, perpanjangan: later stages) blocks correcting the receipt until that
 * closure is reopened, or the stored closure amount would go stale and could
 * silently forgive or double-count money. Returns the message, or null.
 */
export function receiptBlock(project, receipt) {
  const nos = nosOf(receipt);
  const blocked = (project?.payments || []).find(
    (row) => nos.has(row.no) && row.closure && !ownedBy(project, receipt, row.closure)
  );
  return blocked
    ? `Tagihan bulan ${blocked.no} sudah ditutup dengan cara lain. Buka dulu penutupnya sebelum mengubah pembayaran ini.`
    : null;
}

/**
 * The per-row fields older screens and exports still read, recomputed from
 * the receipts: the total received on the tagihan, and the date, transaction
 * and account of the latest arrival that paid it. A tagihan no receipt pays
 * goes back to "not received".
 */
export function deriveRowFields(payments, receipts) {
  return (payments || []).map((row) => {
    let sum = 0;
    let latest = null;
    for (const r of receipts || []) {
      for (const a of r.allocations || []) {
        if (a.no !== row.no) continue;
        sum += Number(a.amount) || 0;
        if (!latest || time(r.date) >= time(latest.date)) latest = r;
      }
    }
    if (!latest) {
      return { ...row, receivedAmount: null, receivedDate: null, transactionId: null, accountId: null };
    }
    return {
      ...row,
      receivedAmount: sum,
      receivedDate: latest.date ?? null,
      transactionId: latest.transactionId ?? null,
      accountId: latest.accountId ?? null,
    };
  });
}

function findReceipt(project, receiptId) {
  const receipt = (project.receipts || []).find((r) => r.id === receiptId);
  if (!receipt) throw new Error('Pembayaran tidak ditemukan');
  if (!(receipt.allocations || []).length) {
    throw new Error('Pembayaran ini tidak lengkap, jadi belum bisa diubah.');
  }
  return receipt;
}

function guardCorrection(project, receipt, action) {
  const rules = correctionRules(project);
  if (!rules[action]) throw new Error(rules.why);
  const block = receiptBlock(project, receipt);
  if (block) throw new Error(block);
}

// The project as if this receipt had never arrived: the receipt is gone, and
// so are the waivers that belonged to it.
function withoutReceipt(project, receipt) {
  const nos = nosOf(receipt);
  const payments = (project.payments || []).map((row) => {
    if (!nos.has(row.no) || !ownedBy(project, receipt, row.closure)) return row;
    const next = { ...row };
    delete next.closure;
    return next;
  });
  return { ...project, payments, receipts: (project.receipts || []).filter((r) => r.id !== receipt.id) };
}

function statusChange(project, payments, receipts, at) {
  if (project.settledEarly || project.status === 'default') return {};
  const after = { ...project, payments, receipts };
  const allSettled = payments.length > 0 && payments.every((row) => isSettled(after, row));
  if (project.status === 'completed' && !allSettled) return { status: 'active', closedAt: null };
  if (project.status === 'active' && allSettled) return { status: 'completed', closedAt: at ?? null };
  return {};
}

// The update to write: rows with their derived fields recomputed, the whole
// receipts array, and the status change the correction causes, if any.
function finish(project, payments, receipts, at) {
  const derived = deriveRowFields(payments, receipts);
  return { payments: derived, receipts, ...statusChange(project, derived, receipts, at) };
}

/** Cancel one arrival. @returns {{ update }} */
export function applyReceiptCancel(project, receiptId) {
  const p = normalizeProject(project);
  const receipt = findReceipt(p, receiptId);
  guardCorrection(p, receipt, 'cancel');
  const base = withoutReceipt(p, receipt);
  return { update: finish(p, base.payments, base.receipts, null) };
}

/**
 * Edit one arrival: its amount, account, or date. It is re-allocated from the
 * first tagihan it paid; changing the month is Move.
 * `at` is the arrival's date in the shape stored (a Timestamp in the app).
 * @returns {{ update, allocations }}
 */
export function applyReceiptEdit(project, receiptId, { amount, at, accountId }) {
  const p = normalizeProject(project);
  const receipt = findReceipt(p, receiptId);
  guardCorrection(p, receipt, 'edit');
  const amt = Math.round(Number(amount) || 0);
  if (amt <= 0) throw new Error('Jumlah harus lebih dari 0');

  const firstNo = receipt.allocations[0].no;
  let base = withoutReceipt(p, receipt);
  // On a project closed by pelunasan dipercepat, the pelunasan row's tagihan
  // is simply what was paid, so it follows the corrected amount.
  if (p.settledEarly) {
    base = {
      ...base,
      payments: base.payments.map((r) =>
        r.settledEarly && r.no === firstNo ? { ...r, expectedAmount: amt } : r
      ),
    };
  }

  const { allocations, leftover } = allocateReceipt(base, amt, firstNo);
  if (!allocations.length || leftover > 0) {
    throw new Error(`Jumlah melebihi sisa tagihan sebesar ${formatCurrency(leftover)}`);
  }

  const edited = { ...receipt, amount: amt, date: at, accountId, allocations };
  const receipts = (p.receipts || []).map((r) => (r.id === receipt.id ? edited : r));
  const measured = { ...base, receipts };

  const payments = base.payments.map((row) => {
    const gap = rowRemaining(measured, row);
    if (gap <= 0) return row;
    if (isLegacy(receipt) && row.no === firstNo) {
      return { ...row, closure: { kind: 'waive', amount: gap, reason: 'legacy' } };
    }
    if (p.settledEarly && !row.settledEarly) {
      return { ...row, closure: { kind: 'waive', amount: gap, reason: 'settlement', at: p.closedAt ?? null } };
    }
    return row;
  });

  return { update: finish(p, payments, receipts, at), allocations };
}
