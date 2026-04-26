import TransactionItem from '../Transactions/TransactionItem';
import { formatDate, isSameDay, toDate } from '../../utils/formatDate';
import { formatCurrency } from '../../utils/formatCurrency';

export default function DayDetail({ date, transactions, accounts, debts, reminders, onSelectTx }) {
  if (!date) return null;
  const dayTx = transactions.filter((tx) => isSameDay(toDate(tx.date), date));
  const dayDebts = debts.filter((d) => d.status !== 'paid' && isSameDay(toDate(d.dueDate), date));
  const dayReminders = reminders.filter((r) => r.isActive && r.dayOfMonth === date.getDate());

  const empty = dayTx.length === 0 && dayDebts.length === 0 && dayReminders.length === 0;

  return (
    <div className="card">
      <h3 className="font-semibold text-gray-900 mb-2">{formatDate(date)}</h3>
      {empty && <p className="text-sm text-gray-500 py-4 text-center">Tidak ada aktivitas pada tanggal ini.</p>}

      {dayDebts.length > 0 && (
        <div className="mb-3">
          <div className="text-xs font-semibold text-warning mb-1">Jatuh Tempo</div>
          <ul className="space-y-1">
            {dayDebts.map((d) => (
              <li key={d.id} className="text-sm flex justify-between bg-warning-bg rounded-md p-2">
                <span>{d.type === 'utang' ? 'Bayar ke' : 'Terima dari'} {d.personName}</span>
                <span className="font-semibold">{formatCurrency(d.remainingAmount)}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {dayReminders.length > 0 && (
        <div className="mb-3">
          <div className="text-xs font-semibold text-primary mb-1">Reminder</div>
          <ul className="space-y-1">
            {dayReminders.map((r) => (
              <li key={r.id} className="text-sm flex justify-between bg-primary-50 rounded-md p-2">
                <span>{r.title}</span>
                {r.amount && <span className="font-semibold">{formatCurrency(r.amount)}</span>}
              </li>
            ))}
          </ul>
        </div>
      )}

      {dayTx.length > 0 && (
        <div>
          <div className="text-xs font-semibold text-gray-500 mb-1">Transaksi</div>
          <div className="divide-y divide-gray-100">
            {dayTx.map((tx) => (
              <TransactionItem key={tx.id} tx={tx} accounts={accounts} onClick={() => onSelectTx?.(tx)} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
