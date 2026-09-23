import { isSettled, rowDue } from './paymentStatus';
import { normalizeProject } from './normalizeProject';

/**
 * Correcting an amount, account, or date on a tagihan paid in one arrival,
 * decided as data. DataContext moves the money and writes the result.
 *
 * What a correction does to "is this tagihan settled" depends on the rule the
 * payment was confirmed under:
 *
 * - Confirmed before partial payments existed (a `legacy-` receipt): back
 *   then, confirming closed the tagihan whatever amount was typed, and the
 *   owner decided those stay settled and get listed. A correction keeps that
 *   meaning; the gap is resized, and dropped once the amount covers the
 *   tagihan in full.
 * - On a project closed by pelunasan dipercepat: the pelunasan closed
 *   everything by agreement. The pelunasan row's tagihan is simply what was
 *   paid, and an earlier tagihan's gap stays closed by the pelunasan.
 * - Otherwise the new rule applies and a gap shows as Kurang. A project that
 *   was completed by its payments goes back to active, so the owner can
 *   collect the rest; left completed it would have no way to receive it.
 *
 * @returns { payments, receipts, status?, closedAt? }
 */
export function applyPaymentEdit(project, no, { amount, at, accountId }) {
  const p = normalizeProject(project);

  // A tagihan can hold several arrivals now. Editing one of them is the next
  // stage (B3); here we handle a tagihan paid exactly once, and say so plainly
  // when we cannot.
  const rowReceipts = (p.receipts || []).filter((r) =>
    (r.allocations || []).some((a) => a.no === no)
  );
  if (rowReceipts.length > 1) {
    throw new Error(
      'Pembayaran ini terdiri dari beberapa kali bayar. Mengubahnya satu per satu akan hadir di pembaruan berikutnya.'
    );
  }
  const target = rowReceipts[0] || null;
  // Money on the row but no receipt for it only happens to a damaged
  // document. Editing it would move the balance and the transaction while
  // the receipts, which the screens read, stayed as they were.
  if (!target) {
    throw new Error('Pembayaran ini belum tercatat lengkap, jadi belum bisa diubah dari sini.');
  }
  // That one receipt can still be a spillover that also pays another tagihan.
  // Rewriting its allocations down to just this row would silently erase the
  // other tagihan's share of the same money.
  if ((target.allocations || []).length > 1) {
    throw new Error(
      'Pembayaran ini bagian dari satu setoran yang juga menutup tagihan lain. Mengubahnya akan hadir di pembaruan berikutnya.'
    );
  }

  const isLegacy = String(target.id).startsWith('legacy-');

  const payments = (p.payments || []).map((row) => {
    if (row.no !== no) return row;
    const next = { ...row, receivedAmount: amount, receivedDate: at, accountId };

    if (row.settledEarly) {
      next.expectedAmount = amount;
      return next;
    }

    const reason = isLegacy ? 'legacy' : p.settledEarly ? 'settlement' : null;
    if (!reason) return next;

    const gap = Math.max(0, rowDue(row) - amount);
    if (gap === 0) {
      delete next.closure;
    } else {
      next.closure =
        reason === 'legacy'
          ? { kind: 'waive', amount: gap, reason }
          : { kind: 'waive', amount: gap, reason, at: row.closure?.at ?? p.closedAt ?? null };
    }
    return next;
  });

  const receipts = (p.receipts || []).map((r) =>
    r.id === target.id
      ? { ...r, amount, date: at, accountId, allocations: [{ no, amount }] }
      : r
  );

  const out = { payments, receipts };
  const after = { ...p, payments, receipts };
  const allSettled = payments.length > 0 && payments.every((row) => isSettled(after, row));
  if (p.status === 'completed' && !p.settledEarly && !allSettled) {
    out.status = 'active';
    out.closedAt = null;
  }
  return out;
}
