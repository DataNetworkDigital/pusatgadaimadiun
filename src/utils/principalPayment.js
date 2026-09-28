import { toDate } from './formatDate';
import { calcMonthlyInterest } from './projectSchedule';
import { rowCarriedIn, rowRemaining } from './paymentStatus';
import { normalizeProject } from './normalizeProject';
import { currentFinal } from './extension';
import { deriveRowFields } from './receiptOps';

/**
 * Pelunasan bertahap (spec 2026-09-28 §5): part of the principal paid before
 * the pelunasan. The money lands on the pelunasan, which then asks only for
 * the rest, and the bagi hasil from a chosen month follow the principal that
 * is left. Each payment is a step in `principalPayments` ({ id, at, amount,
 * fromNo }; `id` is its receipt's id); the latest one can be undone while the
 * months it changed are untouched. Decided as data; DataContext moves the
 * money and writes it.
 */

const stepsOf = (project) => project?.principalPayments || [];

/** Principal the steps took off before the bagi hasil of month `no`. */
export function principalPaidBefore(project, no, steps = stepsOf(project)) {
  return steps
    .filter((s) => s.fromNo != null && s.fromNo <= no)
    .reduce((sum, s) => sum + (Number(s.amount) || 0), 0);
}

const baseOf = (project, no, steps) => (Number(project?.principalAmount) || 0) - principalPaidBefore(project, no, steps);

/** The principal the bagi hasil follow from step `index`'s month on. */
export function stepBase(project, index) {
  const steps = stepsOf(project).slice(0, index + 1);
  const step = steps[index];
  if (!step) return 0;
  return step.fromNo == null
    ? (Number(project?.principalAmount) || 0) - steps.reduce((sum, s) => sum + (Number(s.amount) || 0), 0)
    : baseOf(project, step.fromNo, steps);
}

// Nothing has happened to the row yet: no money, no closure.
function untouched(project, row) {
  const paid = (project.receipts || []).some((r) => (r.allocations || []).some((a) => a.no === row.no));
  return !paid && !row.closure;
}

/** The bagi hasil months a step may start from: the untouched ones only untouched months follow. */
export function principalStepMonths(project) {
  const p = normalizeProject(project);
  const interest = (p.payments || [])
    .filter((r) => r.type === 'interest' && !r.leadCharge)
    .sort((a, b) => (Number(a.no) || 0) - (Number(b.no) || 0));
  let i = interest.length;
  while (i > 0 && untouched(p, interest[i - 1])) i -= 1;
  return interest.slice(i);
}

/** Whether a principal payment can be recorded now, the pelunasan it lands on, and what is left on it. */
export function principalPaymentRules(project) {
  const p = normalizeProject(project);
  const refuse = (why) => ({ ok: false, why, final: null, remaining: 0, months: [] });
  if (!p || p.status !== 'active' || p.settledEarly || p.rolledOverToProjectId) {
    return refuse('Pokok hanya bisa dibayar sebagian di project yang masih aktif.');
  }
  if ((p.extensions || []).length) {
    return refuse('Bayar sebagian pokok belum bisa di project yang sudah Mundur/Diperpanjang.');
  }
  const final = currentFinal(p);
  if (!final) return refuse('Project ini tidak punya pelunasan.');
  if (final.closure) return refuse('Pelunasan project ini sudah ditutup.');
  // Money on a pelunasan pays a tunggakan carried onto it first (see
  // settlementSuggestion), so it could not all count as principal.
  if (rowCarriedIn(p, final) > 0) {
    return refuse('Ada tunggakan yang digabung ke pelunasan. Bayar atau buka dulu tunggakannya.');
  }
  const remaining = rowRemaining(p, final);
  if (remaining <= 0) return refuse('Pelunasan sudah lunas.');
  return { ok: true, why: null, final, remaining, months: principalStepMonths(p) };
}

/** The month a step starts from by default: the first open one due after the payment, or none. */
export function defaultStepMonth(months, date) {
  const d = toDate(date);
  if (!d) return null;
  return months.find((r) => (toDate(r.dueDate)?.getTime() ?? 0) > d.getTime())?.no ?? null;
}

// Bagi hasil rows from `fromNo` on, at the base `steps` leave them. A row
// that never stored its rate keeps the one its amount implies, stored now so
// later changes stay exact.
function rebase(p, oldSteps, newSteps, fromNo) {
  if (fromNo == null) return p.payments || [];
  return (p.payments || []).map((row) => {
    if (row.type !== 'interest' || row.leadCharge || row.no < fromNo) return row;
    const oldBase = baseOf(p, row.no, oldSteps);
    const stored = Number(row.ratePct);
    const rate =
      row.ratePct != null && Number.isFinite(stored)
        ? stored
        : oldBase > 0
          ? Number((((Number(row.expectedAmount) || 0) * 100) / oldBase).toFixed(10))
          : 0;
    return { ...row, ratePct: rate, expectedAmount: calcMonthlyInterest(baseOf(p, row.no, newSteps), rate) };
  });
}

/**
 * @param at  the payment date in the shape stored.
 * @returns {{ update, finalNo }} update = { payments, receipts, principalPayments }
 */
export function applyPrincipalPayment(project, { amount, at, accountId, transactionId, fromNo }) {
  const p = normalizeProject(project);
  const rules = principalPaymentRules(p);
  if (!rules.ok) throw new Error(rules.why);
  const amt = Math.round(Number(amount) || 0);
  if (amt <= 0) throw new Error('Jumlah harus lebih dari 0');
  if (amt >= rules.remaining) throw new Error('Kalau pokoknya dibayar semua, pakai Tutup: Pelunasan.');
  if (!at) throw new Error('Tanggal wajib diisi');
  if (!accountId) throw new Error('Pilih rekening tujuan');
  if (!transactionId) throw new Error('Id pembayaran wajib ada');
  const from = fromNo == null || fromNo === '' ? null : Number(fromNo);
  if (from != null && !rules.months.some((r) => r.no === from)) {
    throw new Error(`Bagi hasil bulan ${from} sudah dibayar atau ditutup. Pilih bulan lain.`);
  }

  const oldSteps = stepsOf(p);
  const steps = [...oldSteps, { id: transactionId, at, amount: amt, fromNo: from }];
  const receipt = {
    id: transactionId,
    amount: amt,
    date: at,
    accountId,
    transactionId,
    allocations: [{ no: rules.final.no, amount: amt }],
  };
  // MUST spread the existing receipts: the reader trusts the stored array.
  const receipts = [...(p.receipts || []), receipt];
  const payments = deriveRowFields(rebase(p, oldSteps, steps, from), receipts);
  return { update: { payments, receipts, principalPayments: steps }, finalNo: rules.final.no };
}

/** Whether the latest step can be undone now. */
export function principalUndoCheck(project) {
  const p = normalizeProject(project);
  const steps = stepsOf(p);
  const step = steps[steps.length - 1] || null;
  const refuse = (why) => ({ ok: false, why, step, receipt: null });
  if (!step) return refuse('Belum ada pembayaran pokok.');
  if (p.status !== 'active' || p.settledEarly) {
    return refuse('Project ini sudah ditutup. Batalkan dulu pelunasannya.');
  }
  if ((p.extensions || []).length) return refuse('Batalkan dulu perpanjangannya.');
  const receipt = (p.receipts || []).find((r) => r.id === step.id) || null;
  if (!receipt) return refuse('Uang pembayaran pokok ini tidak ditemukan.');
  if (currentFinal(p)?.closure) return refuse('Pelunasan sudah ditutup. Buka dulu penutupnya.');
  if (step.fromNo != null) {
    const touched = (p.payments || [])
      .filter((r) => r.type === 'interest' && !r.leadCharge && r.no >= step.fromNo)
      .find((r) => !untouched(p, r));
    if (touched) {
      return refuse(
        `Bagi hasil bulan ${touched.no} sudah dibayar atau ditutup, jadi pembayaran pokok ini tidak bisa dibatalkan.`
      );
    }
  }
  return { ok: true, why: null, step, receipt };
}

/**
 * Undo the latest step, named by `stepId` so a stale screen cannot undo
 * another one. @returns {{ update, receipt }} `receipt` is the money to take back.
 */
export function applyPrincipalPaymentUndo(project, stepId) {
  const p = normalizeProject(project);
  const check = principalUndoCheck(p);
  if (check.step && check.step.id !== stepId) {
    throw new Error('Hanya pembayaran pokok yang terakhir yang bisa dibatalkan.');
  }
  if (!check.ok) throw new Error(check.why);
  const oldSteps = stepsOf(p);
  const steps = oldSteps.slice(0, -1);
  const receipts = (p.receipts || []).filter((r) => r.id !== check.step.id);
  const payments = deriveRowFields(rebase(p, oldSteps, steps, check.step.fromNo), receipts);
  return { update: { payments, receipts, principalPayments: steps }, receipt: check.receipt };
}
