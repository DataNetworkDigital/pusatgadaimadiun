import { Timestamp } from 'firebase/firestore';
import { toDate } from './formatDate';
import { generateProjectSchedule, resolveTiers } from './projectSchedule';
import { isSettled, rowReceived, rowRemaining } from './paymentStatus';
import { normalizeProject } from './normalizeProject';
import { currentFinal } from './extension';

/**
 * Kontrak baru (spec 7.3), decided as data; DataContext writes it.
 * What is left of a partly paid pelunasan becomes a new project whose modal
 * is that remainder, carried over: `fundingMode: 'rollover'`, no funding
 * transaction, no account touched. The old pelunasan is closed by the
 * rollover and the old project is completed. Deleting the new project undoes
 * it (applyRolloverUndo). No money moves either way.
 */

/** What a new contract would start from, or why it cannot. */
export function rolloverSource(project) {
  const p = normalizeProject(project);
  if (p?.status !== 'active') {
    return { ok: false, why: 'Hanya project aktif yang bisa dilanjutkan ke kontrak baru.' };
  }
  const final = currentFinal(p);
  if (!final || final.closure) return { ok: false, why: 'Pelunasan project ini sudah ditutup.' };
  if (rowReceived(p, final) <= 0) {
    return { ok: false, why: 'Pelunasan belum dibayar sama sekali. Pakai "Mundurkan pelunasan".' };
  }
  const amount = rowRemaining(p, final);
  if (amount <= 0) return { ok: false, why: 'Pelunasan sudah lunas.' };
  // The old project must end settled: only its pelunasan's remainder moves.
  const open = p.payments.find((r) => r.no !== final.no && !isSettled(p, r));
  if (open) {
    return { ok: false, why: `Tagihan bulan ${open.no} belum lunas. Selesaikan dulu sebelum membuat kontrak baru.` };
  }
  // The contract day defaults to the day the latest part of the pelunasan arrived.
  const startDate = (p.receipts || [])
    .filter((r) => (r.allocations || []).some((a) => a.no === final.no))
    .map((r) => toDate(r.date))
    .filter(Boolean)
    .reduce((latest, d) => (!latest || d > latest ? d : latest), null);
  return { ok: true, why: null, amount, final, startDate };
}

/**
 * The new contract's schedule. With `firstMonthCharge` (an amount above 0)
 * it starts with one more bagi hasil due on the contract day itself, standing
 * in for the month a normal project takes up front from the modal; the usual
 * months follow with their usual rates, numbered after it.
 */
export function rolloverSchedule({
  principalAmount, returnPctTier1, returnPctTier2, durationMonths, startDate, paymentDayOfMonth, firstMonthCharge,
}) {
  const rows = generateProjectSchedule({
    principalAmount, returnPctTier1, returnPctTier2, durationMonths, startDate, paymentDayOfMonth,
  });
  const charge = Math.round(Number(firstMonthCharge) || 0);
  if (charge <= 0) return rows;
  const start = startDate instanceof Date ? startDate : toDate(startDate);
  const { tier1 } = resolveTiers({ returnPctTier1, returnPctTier2 });
  const lead = {
    no: 1,
    dueDate: Timestamp.fromDate(start),
    type: 'interest',
    expectedAmount: charge,
    ratePct: tier1,
    leadCharge: true,
    receivedAmount: null,
    receivedDate: null,
    transactionId: null,
    accountId: null,
  };
  return [lead, ...rows.map((r) => ({ ...r, no: r.no + 1 }))];
}

/** The old project's side. @returns {{ update, amount }} */
export function applyRolloverClose(project, { newProjectId, at }) {
  const src = rolloverSource(project);
  if (!src.ok) throw new Error(src.why);
  if (!newProjectId) throw new Error('Project baru belum ada.');
  if (!at) throw new Error('Tanggal wajib diisi');
  const p = normalizeProject(project);
  const closure = { kind: 'rollover', amount: src.amount, projectId: newProjectId, at };
  const payments = p.payments.map((r) => (r.no === src.final.no ? { ...r, closure } : r));
  return {
    update: { payments, status: 'completed', closedAt: at, rolledOverToProjectId: newProjectId },
    amount: src.amount,
  };
}

/**
 * Undo, when the new contract is deleted: the old pelunasan opens again and
 * the old project is active. @returns {{ update }}, null when nothing to undo.
 */
export function applyRolloverUndo(project, newProjectId) {
  const p = normalizeProject(project);
  const target = (p?.payments || []).find(
    (r) => r.closure?.kind === 'rollover' && r.closure.projectId === newProjectId
  );
  if (!target) return { update: null };
  const payments = p.payments.map((r) => {
    if (r !== target) return r;
    const next = { ...r };
    delete next.closure;
    return next;
  });
  return { update: { payments, status: 'active', closedAt: null, rolledOverToProjectId: null } };
}
