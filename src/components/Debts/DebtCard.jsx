import { formatCurrency } from '../../utils/formatCurrency';
import { formatDate, daysBetween, toDate } from '../../utils/formatDate';

export default function DebtCard({ debt, onPay, onEdit, onDelete }) {
  const paid = debt.totalAmount - debt.remainingAmount;
  const pct = debt.totalAmount > 0 ? Math.min(100, Math.round((paid / debt.totalAmount) * 100)) : 0;
  const days = daysBetween(new Date(), toDate(debt.dueDate));
  const overdue = debt.status !== 'paid' && days < 0;
  const dueSoon = debt.status !== 'paid' && days >= 0 && days <= 7;

  const statusLabel = debt.status === 'paid' ? 'Lunas' : debt.status === 'partial' ? 'Lunas Sebagian' : 'Belum Lunas';
  const statusClass = debt.status === 'paid' ? 'bg-income-bg text-income' : debt.status === 'partial' ? 'bg-warning-bg text-warning' : 'bg-gray-100 text-gray-700';

  const borderClass = overdue ? 'border-expense/40 bg-expense-bg/40' : dueSoon ? 'border-warning/40 bg-warning-bg/40' : 'border-gray-100';

  return (
    <div className={`card border ${borderClass}`}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 mb-1">
            <h4 className="font-semibold text-gray-900 truncate">{debt.personName}</h4>
            <span className={`text-[10px] px-2 py-0.5 rounded-full ${statusClass}`}>{statusLabel}</span>
          </div>
          {debt.description && <p className="text-xs text-gray-500 line-clamp-1">{debt.description}</p>}
        </div>
        <div className="text-right">
          <div className="text-xs text-gray-500">Sisa</div>
          <div className={`font-bold ${debt.type === 'utang' ? 'text-expense' : 'text-income'}`}>{formatCurrency(debt.remainingAmount)}</div>
        </div>
      </div>

      <div className="mt-3">
        <div className="flex justify-between text-xs text-gray-500 mb-1">
          <span>Dibayar {formatCurrency(paid)}</span>
          <span>{pct}%</span>
        </div>
        <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
          <div className={`h-full ${debt.type === 'utang' ? 'bg-expense' : 'bg-income'}`} style={{ width: `${pct}%` }} />
        </div>
      </div>

      <div className="mt-3 flex items-center justify-between text-xs">
        <span className={overdue ? 'text-expense font-medium' : dueSoon ? 'text-warning font-medium' : 'text-gray-500'}>
          {overdue ? `Telat ${Math.abs(days)} hari` : dueSoon ? `Jatuh tempo ${days} hari lagi` : `Jatuh tempo ${formatDate(debt.dueDate, { short: true })}`}
        </span>
      </div>

      <div className="mt-3 flex gap-2">
        {debt.status !== 'paid' && (
          <button onClick={() => onPay(debt)} className="btn-primary flex-1 text-sm py-2">
            {debt.type === 'utang' ? 'Bayar Cicilan' : 'Terima Cicilan'}
          </button>
        )}
        <button onClick={() => onEdit(debt)} className="btn-secondary text-sm py-2 px-3">Edit</button>
        <button onClick={() => onDelete(debt)} className="btn-secondary text-sm py-2 px-3 text-expense">Hapus</button>
      </div>

      {(debt.installments?.length > 0) && (
        <details className="mt-3 text-xs">
          <summary className="text-primary cursor-pointer">Riwayat cicilan ({debt.installments.length})</summary>
          <ul className="mt-2 space-y-1">
            {debt.installments.slice().reverse().map((ins, i) => (
              <li key={i} className="flex justify-between text-gray-600">
                <span>{formatDate(ins.date, { short: true })}</span>
                <span className="font-medium">{formatCurrency(ins.amount)}</span>
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}
