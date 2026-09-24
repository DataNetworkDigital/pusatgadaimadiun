import { isSettled } from './paymentStatus';

/**
 * The status change a write to a project's schedule causes, if any. A project
 * completed by its payments goes back to active when a tagihan opens again,
 * and an active one whose last tagihan closes is completed. Projects closed
 * by pelunasan dipercepat or as macet never change here.
 * @returns {} or { status, closedAt }
 */
export function statusChange(project, payments, receipts, at) {
  if (project.settledEarly || project.status === 'default') return {};
  const after = { ...project, payments, receipts };
  const allSettled = payments.length > 0 && payments.every((row) => isSettled(after, row));
  if (project.status === 'completed' && !allSettled) return { status: 'active', closedAt: null };
  if (project.status === 'active' && allSettled) return { status: 'completed', closedAt: at ?? null };
  return {};
}
