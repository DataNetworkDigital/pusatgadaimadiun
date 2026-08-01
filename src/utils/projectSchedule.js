import { Timestamp } from 'firebase/firestore';

const ONE_RUPIAH = 1;

// Tiered default return: months 1-3 use the lower rate, month 4 onward the
// higher rate. Both are editable per project; these are only the defaults.
export const DEFAULT_TIER1_PCT = 5.5;
export const DEFAULT_TIER2_PCT = 6.5;
export const TIER1_MAX_MONTH = 3; // months ≤ 3 → tier 1, months > 3 → tier 2

export function calcMonthlyInterest(principalAmount, monthlyReturnPct) {
  return Math.round((Number(principalAmount) * Number(monthlyReturnPct)) / 100);
}

// Which return % applies to a given 1-based month index, given the two tiers.
// Falls back to tier1 when tier2 is not set (flat rate / legacy projects).
export function rateForMonth(monthNo, tier1Pct, tier2Pct) {
  const t1 = Number(tier1Pct) || 0;
  const t2 = tier2Pct == null || tier2Pct === '' ? t1 : Number(tier2Pct);
  return monthNo <= TIER1_MAX_MONTH ? t1 : t2;
}

// Resolve the effective tier rates from a project/data object, tolerating
// legacy projects that only have a single flat `monthlyReturnPct`.
export function resolveTiers({ returnPctTier1, returnPctTier2, monthlyReturnPct }) {
  const t1 = returnPctTier1 != null ? Number(returnPctTier1) : (Number(monthlyReturnPct) || 0);
  const t2 = returnPctTier2 != null ? Number(returnPctTier2) : t1;
  return { tier1: t1, tier2: t2 };
}

// Total interest across a full-term project (final month is principal-only).
export function totalTieredInterest(principal, durationMonths, tier1, tier2) {
  const months = Number(durationMonths) || 0;
  let sum = 0;
  for (let i = 1; i < months; i++) {
    sum += calcMonthlyInterest(principal, rateForMonth(i, tier1, tier2));
  }
  return sum;
}

export function pickPaymentDate(year, month, dayOfMonth) {
  const last = new Date(year, month + 1, 0).getDate();
  const day = Math.min(dayOfMonth, last);
  return new Date(year, month, day);
}

/**
 * Recompute schedule preserving already-received payments.
 * Used when editing an active project's durationMonths / monthlyReturnPct /
 * paymentDayOfMonth / principalAmount. Paid payments keep their existing
 * receivedAmount/receivedDate/transactionId/accountId. Their `no`, `dueDate`,
 * and `type` (interest vs final) are aligned to the new schedule. Unpaid
 * payments are regenerated fresh.
 */
export function recomputeUnpaidSchedule(existingPayments, {
  principalAmount,
  monthlyReturnPct,
  returnPctTier1,
  returnPctTier2,
  durationMonths,
  startDate,
  paymentDayOfMonth,
}) {
  const principal = Number(principalAmount) || 0;
  const { tier1, tier2 } = resolveTiers({ returnPctTier1, returnPctTier2, monthlyReturnPct });
  const start = startDate instanceof Date ? startDate : startDate.toDate();
  const day = Number(paymentDayOfMonth) || start.getDate();
  const months = Number(durationMonths) || 1;
  const paidByNo = new Map();
  for (const p of existingPayments || []) {
    if (p.receivedAmount != null) paidByNo.set(p.no, p);
  }

  const payments = [];
  for (let i = 1; i <= months; i++) {
    const isLast = i === months;
    const due = pickPaymentDate(start.getFullYear(), start.getMonth() + i, day);
    const ratePct = rateForMonth(i, tier1, tier2);
    const interest = calcMonthlyInterest(principal, ratePct);
    const existingPaid = paidByNo.get(i);
    if (existingPaid) {
      payments.push({
        ...existingPaid,
        no: i,
        // Keep original received fields; align type to new position
        type: isLast ? 'final' : 'interest',
      });
    } else {
      payments.push({
        no: i,
        dueDate: Timestamp.fromDate(due),
        type: isLast ? 'final' : 'interest',
        // Final payment (pelunasan) returns the project value (principal) only.
        expectedAmount: isLast ? principal : interest,
        ratePct: isLast ? null : ratePct,
        receivedAmount: null,
        receivedDate: null,
        transactionId: null,
        accountId: null,
      });
    }
  }
  return payments;
}

export function generateProjectSchedule({
  principalAmount,
  monthlyReturnPct,
  returnPctTier1,
  returnPctTier2,
  durationMonths,
  startDate,
  paymentDayOfMonth,
}) {
  const principal = Number(principalAmount) || 0;
  const { tier1, tier2 } = resolveTiers({ returnPctTier1, returnPctTier2, monthlyReturnPct });
  const start = startDate instanceof Date ? startDate : startDate.toDate();
  const day = Number(paymentDayOfMonth) || start.getDate();
  const months = Number(durationMonths) || 1;

  const payments = [];
  for (let i = 1; i <= months; i++) {
    const due = pickPaymentDate(start.getFullYear(), start.getMonth() + i, day);
    const isLast = i === months;
    const ratePct = rateForMonth(i, tier1, tier2);
    payments.push({
      no: i,
      dueDate: Timestamp.fromDate(due),
      type: isLast ? 'final' : 'interest',
      // Final payment (pelunasan) returns the project value (principal) only.
      expectedAmount: isLast ? principal : calcMonthlyInterest(principal, ratePct),
      ratePct: isLast ? null : ratePct,
      receivedAmount: null,
      receivedDate: null,
      transactionId: null,
      accountId: null,
    });
  }
  return payments;
}

export function projectSummary(project) {
  const payments = project.payments || [];
  const expectedTotalReturn = payments.reduce((s, p) => {
    if (p.type === 'interest') return s + p.expectedAmount;
    if (p.type === 'final') return s + (p.expectedAmount - (project.principalAmount || 0));
    return s;
  }, 0);
  const receivedSoFar = payments.reduce((s, p) => s + (p.receivedAmount || 0), 0);
  const expectedRemaining = payments
    .filter((p) => p.receivedAmount == null)
    .reduce((s, p) => s + p.expectedAmount, 0);
  const paidCount = payments.filter((p) => p.receivedAmount != null).length;
  const allPaid = paidCount === payments.length && payments.length > 0;

  // Profit so far = receivedSoFar - principal contribution recovered
  // For interest-only model, principal only returns at the final payment
  // Net cash position: received - disbursed
  const disbursed = Number(project.disbursedAmount) || 0;
  const netCashChange = receivedSoFar - disbursed;

  return {
    expectedTotalReturn,
    receivedSoFar,
    expectedRemaining,
    paidCount,
    totalCount: payments.length,
    allPaid,
    netCashChange,
  };
}

export function findNextDuePayment(project, today = new Date()) {
  const payments = project.payments || [];
  return (
    payments
      .filter((p) => p.receivedAmount == null)
      .map((p) => ({ ...p, dueDate: p.dueDate?.toDate ? p.dueDate.toDate() : new Date(p.dueDate) }))
      .sort((a, b) => a.dueDate - b.dueDate)[0] || null
  );
}

export const ONE_RUPIAH_GUARD = ONE_RUPIAH;
