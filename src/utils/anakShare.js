import { rowCarriedIn, rowDue, rowReceived, rowRemaining } from './paymentStatus';
import { toDate } from './formatDate';
import { normalizeProject } from './normalizeProject';
import { principalPaidBefore } from './principalPayment';
import { calcMonthlyInterest, resolveTiers } from './projectSchedule';

/**
 * Diambil anak (spec 2026-09-29): part of a project, or all of it, belongs to
 * the owner's son. Of every bagi hasil he gets that part, less Mas Hena's fee
 * of `feePct` % a month on it; of every rupiah of principal that comes back,
 * that part. Mas Hena's fee is shared in proportion, so the son bears it only
 * on his part (Gde, 29 Sep 2026). Pure: it only says how much; the transfer
 * happens outside the app.
 */

export const DEFAULT_ANAK_FEE_PCT = 0.5;

/** The son's part as a fraction of Nilai Project; 0 when the project is not his. */
export function anakRatio(project) {
  const amount = Number(project?.anak?.amount) || 0;
  const principal = Number(project?.principalAmount) || 0;
  if (amount <= 0 || principal <= 0) return 0;
  return Math.min(1, amount / principal);
}

function feePctOf(project) {
  const fee = Number(project?.anak?.feePct);
  return Number.isFinite(fee) && fee >= 0 ? fee : DEFAULT_ANAK_FEE_PCT;
}

// The monthly rate a bagi hasil is asked at, in percent of its principal. A
// tunggakan carried onto a pelunasan was the bagi hasil of a normal month.
function rateOf(project, row) {
  if (row?.type === 'final') return resolveTiers(project).tier1;
  const stored = Number(row?.ratePct);
  if (row?.ratePct != null && Number.isFinite(stored)) return stored;
  const base =
    row?.baseAmount ?? (Number(project?.principalAmount) || 0) - principalPaidBefore(project, row?.no ?? 0);
  return base > 0 ? (rowDue(row) * 100) / base : 0;
}

/** The son's part of `amount` of bagi hasil on `row`, and Mas Hena's fee taken from it. */
export function anakBagiHasil(project, row, amount) {
  const gross = Math.round((Number(amount) || 0) * anakRatio(project));
  if (gross <= 0) return { net: 0, fee: 0 };
  const rate = rateOf(project, row);
  const fee = rate > 0 ? Math.min(gross, Math.round((gross * feePctOf(project)) / rate)) : gross;
  return { net: gross - fee, fee };
}

const empty = () => ({ bagiHasil: 0, fee: 0, pokok: 0, total: 0 });

// The bagi hasil a pelunasan asks before its principal: a tunggakan carried
// onto it and, on a pelunasan dipercepat, whatever it asked above the principal
// that was left (a tunggakan it closed, or a later month's higher rate). One
// recorded before the pelunasan kept that number counts as principal only.
function tunggakanOn(p, row) {
  const left = Number(row.principalLeft);
  const above = row.settledEarly && row.principalLeft != null && Number.isFinite(left)
    ? Math.max(0, rowDue(row) - left)
    : 0;
  return rowCarriedIn(p, row) + above;
}

// Adds the son's part of `amount` on `row` to `out`. On a pelunasan the first
// `tunggakanLeft` rupiah pay bagi hasil (tunggakanOn), the rest principal.
function addShare(p, row, amount, tunggakanLeft, out) {
  if (row.type === 'final') {
    const tunggakan = Math.max(0, Math.min(amount, tunggakanLeft));
    const bh = anakBagiHasil(p, row, tunggakan);
    out.bagiHasil += bh.net;
    out.fee += bh.fee;
    out.pokok += Math.round((amount - tunggakan) * anakRatio(p));
  } else {
    const bh = anakBagiHasil(p, row, amount);
    out.bagiHasil += bh.net;
    out.fee += bh.fee;
  }
}

/**
 * What goes to the son from one arrival of money: his part of the bagi hasil
 * it paid (less the fee) and of the principal it brought back.
 * @returns {{ bagiHasil, fee, pokok, total }}
 */
export function anakFromReceipt(project, receipt) {
  const p = normalizeProject(project);
  const out = empty();
  if (!anakRatio(p) || !receipt) return out;
  // Money already on each tagihan before this arrival, in the order the money
  // arrived (a payment typed in late still paid when it came), then recorded.
  const time = (r) => toDate(r?.date)?.getTime() ?? 0;
  const arrived = (p.receipts || [])
    .map((r, i) => ({ r, i }))
    .sort((a, b) => time(a.r) - time(b.r) || a.i - b.i)
    .map(({ r }) => r);
  const before = new Map();
  for (const r of arrived) {
    if (r.id === receipt.id) break;
    for (const a of r.allocations || []) before.set(a.no, (before.get(a.no) || 0) + (Number(a.amount) || 0));
  }
  for (const a of receipt.allocations || []) {
    const row = (p.payments || []).find((r) => r.no === a.no);
    if (!row) continue;
    const tunggakanLeft = row.type === 'final' ? tunggakanOn(p, row) - (before.get(a.no) || 0) : 0;
    addShare(p, row, Number(a.amount) || 0, tunggakanLeft, out);
  }
  out.total = out.bagiHasil + out.pokok;
  return out;
}

/** What the son is due from what is still owed on `row` (the calendar's plan). */
export function anakFromRow(project, row) {
  const p = normalizeProject(project);
  const out = empty();
  if (!anakRatio(p) || !row) return out;
  const tunggakanLeft = row.type === 'final' ? tunggakanOn(p, row) - rowReceived(p, row) : 0;
  addShare(p, row, rowRemaining(p, row), tunggakanLeft, out);
  out.total = out.bagiHasil + out.pokok;
  return out;
}

/** The son's part checked for saving, or null to stop marking the project. */
export function cleanAnak(project, anak) {
  if (!anak) return null;
  const principal = Number(project?.principalAmount) || 0;
  const amount = Math.round(Number(anak.amount) || 0);
  const feePct = Number(anak.feePct);
  if (amount <= 0) throw new Error('Bagian anak harus lebih dari 0');
  if (amount > principal) throw new Error('Bagian anak tidak boleh lebih dari nilai project');
  if (!Number.isFinite(feePct) || feePct < 0 || feePct >= 100) {
    throw new Error('Fee Mas Hena harus 0 sampai di bawah 100%');
  }
  return { amount, feePct };
}

/**
 * For the project page: the son's part, a month at each rate (on the
 * principal the bagi hasil follow now) and his share of the principal still
 * to come back. Null when the project is not his.
 */
export function anakSummary(project, anak = project?.anak) {
  const withAnak = { ...project, anak };
  const ratio = anakRatio(withAnak);
  if (!ratio) return null;
  const { tier1, tier2 } = resolveTiers(project);
  const principal = Number(project.principalAmount) || 0;
  const base = principal - principalPaidBefore(project, Infinity);
  const month = (rate) => anakBagiHasil(withAnak, { type: 'interest', ratePct: rate }, calcMonthlyInterest(base, rate));
  const paidBack = (project.principalPayments || []).reduce((s, x) => s + (Number(x.amount) || 0), 0);
  return {
    ratio,
    first: month(tier1),
    later: tier2 !== tier1 ? month(tier2) : null,
    pokok: Math.round((principal - paidBack) * ratio),
  };
}
