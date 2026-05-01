import { formatDate, isSameDay, toDate } from '../../utils/formatDate';
import { formatCurrency } from '../../utils/formatCurrency';
import Card from '../common/Card';
import SectionTitle from '../common/SectionTitle';
import TxRow from '../common/TxRow';
import { IcBell, IcAlert } from '../common/icons';

export default function DayDetail({ date, transactions, accounts, debts, reminders, onSelectTx }) {
  if (!date) return null;
  const accountName = (id) => accounts.find((a) => a.id === id)?.name || '—';
  const dayTx = transactions.filter((tx) => isSameDay(toDate(tx.date), date));
  const dayDebts = debts.filter(
    (d) => d.status !== 'paid' && isSameDay(toDate(d.dueDate), date)
  );
  const dayReminders = reminders.filter(
    (r) => r.isActive && r.dayOfMonth === date.getDate()
  );
  const empty = dayTx.length === 0 && dayDebts.length === 0 && dayReminders.length === 0;

  return (
    <div>
      <SectionTitle>{formatDate(date)}</SectionTitle>
      <Card className="!px-4 !py-1">
        {empty && (
          <div className="py-6 text-center text-[14px] text-ink-mute">
            Tidak ada catatan hari ini.
          </div>
        )}

        {dayDebts.map((d, i) => (
          <div
            key={d.id}
            className={`flex items-center gap-3 py-3.5 ${
              i < dayDebts.length - 1 || dayReminders.length > 0 || dayTx.length > 0
                ? 'border-b border-line-soft'
                : ''
            }`}
          >
            <div className="w-[42px] h-[42px] rounded-xl bg-terra-soft text-terra flex items-center justify-center flex-shrink-0">
              <IcAlert size={20} sw={2} />
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-[16px] font-medium text-ink leading-tight">
                {d.type === 'utang' ? 'Bayar ke' : 'Terima dari'} {d.personName}
              </div>
              <div className="text-[13px] text-ink-mute mt-0.5">Jatuh tempo</div>
            </div>
            <div
              className="font-num text-[16px] font-semibold text-terra whitespace-nowrap"
              style={{ fontVariantNumeric: 'tabular-nums' }}
            >
              {formatCurrency(d.remainingAmount, false)}
            </div>
          </div>
        ))}

        {dayReminders.map((r, i) => (
          <div
            key={r.id}
            className={`flex items-center gap-3 py-3.5 ${
              i < dayReminders.length - 1 || dayTx.length > 0 ? 'border-b border-line-soft' : ''
            }`}
          >
            <div className="w-[42px] h-[42px] rounded-xl bg-emas-soft text-emas flex items-center justify-center flex-shrink-0">
              <IcBell size={20} sw={2} />
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-[16px] font-medium text-ink leading-tight">{r.title}</div>
              <div className="text-[13px] text-ink-mute mt-0.5">Reminder bulanan</div>
            </div>
            {r.amount && (
              <div
                className="font-num text-[15px] font-semibold text-emas whitespace-nowrap"
                style={{ fontVariantNumeric: 'tabular-nums' }}
              >
                {formatCurrency(r.amount, false)}
              </div>
            )}
          </div>
        ))}

        {dayTx.map((tx, i) => (
          <TxRow
            key={tx.id}
            tx={tx}
            accountName={accountName}
            onClick={() => onSelectTx?.(tx)}
            isLast={i === dayTx.length - 1}
            showDate={false}
          />
        ))}
      </Card>
    </div>
  );
}
