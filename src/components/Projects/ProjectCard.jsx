import { Link } from 'react-router-dom';
import { useDemo } from '../../contexts/DemoContext';
import { formatCurrency } from '../../utils/formatCurrency';
import { formatDate, daysBetween, toDate } from '../../utils/formatDate';
import { projectSummary, findNextDuePayment } from '../../utils/projectSchedule';
import Pill from '../common/Pill';
import { IcCalendar, IcChevronRight } from '../common/icons';

export default function ProjectCard({ project, index }) {
  const { isDemo } = useDemo();
  const base = isDemo ? '/demo' : '';
  const summary = projectSummary(project);
  const next = findNextDuePayment(project);
  const isActive = project.status === 'active';
  const isDefault = project.status === 'default';
  const isCompleted = project.status === 'completed';

  let dueText = null;
  let dueColor = 'text-ink-soft';
  if (isActive && next) {
    const days = daysBetween(new Date(), next.dueDate);
    if (days < 0) {
      dueText = `Telat ${Math.abs(days)} hari`;
      dueColor = 'text-terra';
    } else if (days === 0) {
      dueText = 'Jatuh tempo hari ini';
      dueColor = 'text-emas';
    } else if (days <= 7) {
      dueText = `${days} hari lagi`;
      dueColor = 'text-emas';
    } else {
      dueText = `Jatuh tempo ${formatDate(next.dueDate, { short: true })}`;
    }
  } else if (isCompleted) {
    dueText = `Selesai ${project.closedAt ? formatDate(project.closedAt, { short: true }) : ''}`.trim();
  } else if (isDefault) {
    dueText = `Macet${project.lossAmount ? ` · rugi ${formatCurrency(project.lossAmount)}` : ''}`;
    dueColor = 'text-terra';
  }

  const pct =
    summary.totalCount > 0 ? Math.round((summary.paidCount / summary.totalCount) * 100) : 0;
  const overdue = isActive && next && daysBetween(new Date(), next.dueDate) < 0;
  const dueSoon =
    isActive && next && (() => {
      const d = daysBetween(new Date(), next.dueDate);
      return d >= 0 && d <= 7;
    })();
  const borderClass = isDefault
    ? 'border-terra/60'
    : overdue
    ? 'border-terra/60'
    : dueSoon
    ? 'border-emas/60'
    : 'border-line';

  return (
    <Link
      to={`${base}/project/${project.id}`}
      className={`block bg-paper rounded-2xl border ${borderClass} shadow-card p-4 active:bg-cream-deep/40 transition`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 flex-wrap">
            {index != null && (
              <span className="inline-flex items-center justify-center min-w-[20px] h-5 px-1 rounded-md bg-cream-deep text-ink-soft text-[11px] font-bold flex-shrink-0 tabular-nums">
                {index}
              </span>
            )}
            <span className="font-display text-[16px] font-semibold text-ink leading-tight truncate">
              {project.name}
            </span>
            {isActive && <Pill tone="indigo">Aktif</Pill>}
            {isCompleted && <Pill tone="daun">Selesai</Pill>}
            {isDefault && <Pill tone="terra">Macet</Pill>}
          </div>
          <div className="text-[12px] text-ink-mute mt-0.5">
            Modal {formatCurrency(project.disbursedAmount)} · {project.monthlyReturnPct}%/bulan ·{' '}
            {project.durationMonths} bulan
          </div>
        </div>
        <IcChevronRight size={18} stroke="#8B7558" className="flex-shrink-0 mt-1" />
      </div>

      <div className="mt-3.5">
        <div className="flex justify-between text-[12px] text-ink-soft mb-1.5">
          <span>
            {summary.paidCount}/{summary.totalCount} pembayaran diterima
          </span>
          <span className="font-semibold">{pct}%</span>
        </div>
        <div className="h-1.5 bg-cream-deep rounded-full overflow-hidden">
          <div className="h-full bg-indigo rounded-full" style={{ width: `${pct}%` }} />
        </div>
      </div>

      <div className={`mt-3 flex items-center gap-1.5 text-[12px] font-medium ${dueColor}`}>
        <IcCalendar size={13} stroke="currentColor" />
        {dueText || '—'}
      </div>

      {isActive && next && (
        <div className="mt-2 flex justify-between text-[13px]">
          <span className="text-ink-mute">Sisa diharapkan</span>
          <span
            className="font-num font-semibold text-ink"
            style={{ fontVariantNumeric: 'tabular-nums' }}
          >
            {formatCurrency(summary.expectedRemaining)}
          </span>
        </div>
      )}
    </Link>
  );
}
