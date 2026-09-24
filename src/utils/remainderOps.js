import { rowDue, rowReceived, rowRemaining } from './paymentStatus';
import { openRows } from './allocation';
import { normalizeProject } from './normalizeProject';
import { statusChange } from './projectStatus';

/**
 * What is left on a tagihan, closed without money (spec 6.4, 6.6), and
 * undone again. Decided as data; DataContext writes it.
 * - Gabung ke bulan depan (carry): the remainder moves onto the next open
 *   tagihan, which then asks for both. Bagi hasil only; a pelunasan's own
 *   remainder is Part C's "Atur sisa pelunasan".
 * - Anggap lunas (waive): the remainder is forgiven.
 * - Buka lagi (reopen): undoes either, and an old shortfall the owner decides
 *   was truly short. Refused where undoing would make stored amounts wrong.
 * No money moves: only the schedule changes (and, when an old shortfall is
 * reopened, the payment that confirmed it).
 */

/** The tagihan a carry from bulan `no` lands on: the next open one after it. */
export function carryTarget(project, no) {
  const rows = openRows(normalizeProject(project));
  const idx = rows.findIndex((r) => r.no === no);
  return idx >= 0 ? rows[idx + 1] || null : null;
}

/** What the "Atur sisa" sheet offers for bulan `no` right now. */
export function remainderOptions(project, no) {
  const p = normalizeProject(project);
  const row = (p.payments || []).find((r) => r.no === no);
  const amount = row ? rowRemaining(p, row) : 0;
  const open = p.status === 'active' && !!row && !row.closure && amount > 0;
  const target = open && row.type === 'interest' ? carryTarget(p, no) : null;
  return { amount, carry: !!target, target, waive: open };
}

/** @returns {{ update, closure }} */
export function applyCloseRemainder(project, no, { kind, note = '', at, id }) {
  const p = normalizeProject(project);
  if (p.status !== 'active') throw new Error('Sisa tagihan hanya bisa diatur di project yang masih aktif.');
  const row = (p.payments || []).find((r) => r.no === no);
  if (!row) throw new Error('Tagihan tidak ditemukan');
  if (row.closure) throw new Error(`Tagihan bulan ${no} sudah ditutup.`);
  const amount = rowRemaining(p, row);
  if (amount <= 0) throw new Error(`Tagihan bulan ${no} sudah lunas.`);
  if (!at) throw new Error('Tanggal wajib diisi');

  const base = { amount, at, ...(id ? { id } : {}), ...(note ? { note } : {}) };
  let closure;
  if (kind === 'carry') {
    if (row.type !== 'interest') throw new Error('Sisa pelunasan tidak bisa digabung ke bulan lain.');
    const target = carryTarget(p, no);
    if (!target) throw new Error('Tidak ada tagihan berikutnya yang masih terbuka untuk menampung sisa ini.');
    closure = { kind: 'carry', toNo: target.no, ...base };
  } else if (kind === 'waive') {
    closure = { kind: 'waive', reason: 'manual', ...base };
  } else {
    throw new Error('Pilihan tidak dikenal');
  }
  const payments = p.payments.map((r) => (r.no === no ? { ...r, closure } : r));
  return { update: { payments, ...statusChange(p, payments, p.receipts, at) }, closure };
}

/** @returns {{ update }} */
export function applyReopenRemainder(project, no) {
  const p = normalizeProject(project);
  if (p.settledEarly || p.status === 'default') {
    throw new Error('Project ini sudah ditutup, jadi sisanya tidak bisa dibuka lagi.');
  }
  // Its pelunasan is the new contract's modal now; reopening a month would
  // make it active again next to that contract.
  if (p.rolledOverToProjectId) {
    throw new Error('Project ini sudah dilanjutkan ke kontrak baru, jadi sisanya tidak bisa dibuka lagi.');
  }
  const row = (p.payments || []).find((r) => r.no === no);
  if (!row) throw new Error('Tagihan tidak ditemukan');
  const c = row.closure;
  if (!c) throw new Error(`Tagihan bulan ${no} tidak punya sisa yang ditutup.`);
  if (c.kind === 'extend' || c.kind === 'rollover') {
    throw new Error('Sisa ini dipindah ke perpanjangan atau kontrak baru. Batalkan dari sana.');
  }
  if (c.kind === 'waive' && c.reason === 'settlement') {
    throw new Error('Sisa ini ditutup oleh pelunasan dipercepat dan tidak bisa dibuka lagi.');
  }
  if (c.kind === 'carry') {
    const target = p.payments.find((r) => r.no === c.toNo);
    if (target?.closure) {
      throw new Error(`Tagihan bulan ${target.no} sudah ditutup. Buka dulu penutupnya.`);
    }
    if (target && rowReceived(p, target) > rowDue(target)) {
      throw new Error(`Tunggakan ini sudah ikut dibayar di bulan ${target.no}. Batalkan atau edit pembayarannya dulu.`);
    }
  }

  const payments = p.payments.map((r) => {
    if (r.no !== no) return r;
    const next = { ...r };
    delete next.closure;
    return next;
  });
  const update = { payments, ...statusChange(p, payments, p.receipts, null) };
  // An old shortfall the owner now calls truly short: the payment that
  // confirmed it no longer closes its tagihan, so a later correction must not
  // forgive the gap again (receiptOps treats `reopened` like `moved`). The
  // whole receipts array is written, as every receipts write must.
  if (c.kind === 'waive' && c.reason === 'legacy') {
    update.receipts = (p.receipts || []).map((r) =>
      String(r.id).startsWith('legacy-') && (r.allocations || []).some((a) => a.no === no)
        ? { ...r, reopened: true }
        : r
    );
  }
  return { update };
}
