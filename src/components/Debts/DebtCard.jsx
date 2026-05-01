import { formatCurrency } from '../../utils/formatCurrency';
import { formatDate, daysBetween, toDate } from '../../utils/formatDate';
import Pill from '../common/Pill';
import { IcCalendar, IcEdit, IcTrash } from '../common/icons';

function StatusPill({ status }) {
  if (status === 'paid') return <Pill tone="daun">Lunas</Pill>;
  if (status === 'partial') return <Pill tone="emas">Sebagian</Pill>;
  return <Pill tone="neutral">Belum Lunas</Pill>;
}

export default function DebtCard({ debt, onPay, onEdit, onDelete }) {
  const paid = (debt.totalAmount || 0) - (debt.remainingAmount || 0);
  const pct = debt.totalAmount > 0 ? Math.min(100, Math.round((paid / debt.totalAmount) * 100)) : 0;
  const days = daysBetween(new Date(), toDate(debt.dueDate));
  const overdue = debt.status !== 'paid' && days < 0;
  const dueSoon = debt.status !== 'paid' && days >= 0 && days <= 7;
  const isUtang = debt.type === 'utang';
  const accentText = isUtang ? 'text-terra' : 'text-daun';
  const accentBar = isUtang ? 'bg-terra' : 'bg-daun';
  const borderClass = overdue
    ? 'border-terra/60'
    : dueSoon
    ? 'border-emas/60'
    : 'border-line';

  const dueText = overdue
    ? `Telat ${Math.abs(days)} hari`
    : dueSoon
    ? `${days} hari lagi`
    : `Jatuh tempo ${formatDate(debt.dueDate, { short: true })}`;
  const dueColor = overdue ? 'text-terra' : dueSoon ? 'text-emas' : 'text-ink-soft';

  return (
    <div className={`bg-paper rounded-2xl border ${borderClass} shadow-card p-4`}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="font-display text-[16px] font-semibold text-ink leading-tight">
              {debt.personName}
            </span>
            <StatusPill status={debt.status} />
          </div>
          {debt.description && (
            <p className="text-[13px] text-ink-soft mt-1 leading-snug">{debt.description}</p>
          )}
        </div>
        <div className="text-right flex-shrink-0 min-w-[92px]">
          <div className="text-[11px] text-ink-mute uppercase tracking-[0.3px]">Sisa</div>
          <div
            className={`font-num text-[16px] font-semibold whitespace-nowrap ${accentText}`}
            style={{ fontVariantNumeric: 'tabular-nums' }}
          >
            {formatCurrency(debt.remainingAmount)}
          </div>
        </div>
      </div>

      <div className="mt-3.5">
        <div className="flex justify-between text-[12px] text-ink-soft mb-1.5">
          <span>Dibayar {formatCurrency(paid)}</span>
          <span className="font-semibold">{pct}%</span>
        </div>
        <div className="h-1.5 bg-cream-deep rounded-full overflow-hidden">
          <div
            className={`h-full rounded-full ${accentBar}`}
            style={{ width: `${pct}%` }}
          />
        </div>
      </div>

      <div className={`mt-3 flex items-center gap-1.5 text-[12px] font-medium ${dueColor}`}>
        <IcCalendar size={13} stroke="currentColor" />
        {dueText}
      </div>

      <div className="mt-3.5 flex gap-2">
        <button
          type="button"
          onClick={() => onPay(debt)}
          disabled={debt.status === 'paid'}
          className={
            'flex-1 py-3 rounded-xl text-[14px] font-semibold transition ' +
            (debt.status === 'paid'
              ? 'bg-cream-deep text-ink-mute cursor-default'
              : 'bg-indigo text-cream active:bg-indigo-deep')
          }
        >
          {debt.status === 'paid'
            ? 'Sudah Lunas'
            : isUtang
            ? 'Bayar Cicilan'
            : 'Terima Cicilan'}
        </button>
        <button
          type="button"
          onClick={() => onEdit(debt)}
          aria-label={`Edit ${debt.personName}`}
          className="w-11 h-11 rounded-xl border border-line bg-paper text-ink-soft flex items-center justify-center active:bg-cream-deep"
        >
          <IcEdit size={18} sw={1.9} />
        </button>
        <button
          type="button"
          onClick={() => onDelete(debt)}
          aria-label={`Hapus ${debt.personName}`}
          className="w-11 h-11 rounded-xl bg-terra-soft text-terra flex items-center justify-center active:opacity-80"
        >
          <IcTrash size={18} sw={1.9} />
        </button>
      </div>

      {debt.installments?.length > 0 && (
        <details className="mt-3 text-[12px]">
          <summary className="text-indigo cursor-pointer font-medium">
            Riwayat cicilan ({debt.installments.length})
          </summary>
          <ul className="mt-2 space-y-1">
            {debt.installments
              .slice()
              .reverse()
              .map((ins, i) => (
                <li key={i} className="flex justify-between text-ink-soft">
                  <span>{formatDate(ins.date, { short: true })}</span>
                  <span
                    className="font-num font-semibold"
                    style={{ fontVariantNumeric: 'tabular-nums' }}
                  >
                    {formatCurrency(ins.amount)}
                  </span>
                </li>
              ))}
          </ul>
        </details>
      )}
    </div>
  );
}
