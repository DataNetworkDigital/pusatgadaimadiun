import { Timestamp } from 'firebase/firestore';

const ONE_RUPIAH = 1;

export function calcMonthlyInterest(principalAmount, monthlyReturnPct) {
  return Math.round((Number(principalAmount) * Number(monthlyReturnPct)) / 100);
}

function pickPaymentDate(year, month, dayOfMonth) {
  const last = new Date(year, month + 1, 0).getDate();
  const day = Math.min(dayOfMonth, last);
  return new Date(year, month, day);
}

export function generateProjectSchedule({
  principalAmount,
  monthlyReturnPct,
  durationMonths,
  startDate,
  paymentDayOfMonth,
}) {
  const principal = Number(principalAmount) || 0;
  const interest = calcMonthlyInterest(principal, monthlyReturnPct);
  const start = startDate instanceof Date ? startDate : startDate.toDate();
  const day = Number(paymentDayOfMonth) || start.getDate();
  const months = Number(durationMonths) || 1;

  const payments = [];
  for (let i = 1; i <= months; i++) {
    const due = pickPaymentDate(start.getFullYear(), start.getMonth() + i, day);
    const isLast = i === months;
    payments.push({
      no: i,
      dueDate: Timestamp.fromDate(due),
      type: isLast ? 'final' : 'interest',
      expectedAmount: isLast ? interest + principal : interest,
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
