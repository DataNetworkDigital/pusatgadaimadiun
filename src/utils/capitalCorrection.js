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
