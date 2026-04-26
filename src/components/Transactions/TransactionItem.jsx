import { formatCurrency } from '../../utils/formatCurrency';
import { formatDate } from '../../utils/formatDate';

export default function TransactionItem({ tx, accounts, onClick }) {
  const accountName = (id) => accounts.find((a) => a.id === id)?.name || '-';
  const isIncome = tx.type === 'income';
  const isTransfer = tx.type === 'transfer';
  const sign = isIncome ? '+' : isTransfer ? '' : '-';
  const color = isIncome ? 'text-income' : isTransfer ? 'text-transfer' : 'text-expense';
  const account = isTransfer
    ? `${accountName(tx.fromAccount)} → ${accountName(tx.toAccount)}`
    : accountName(isIncome ? tx.toAccount : tx.fromAccount);

  return (
    <button onClick={onClick} className="w-full text-left py-3 px-1 flex items-center gap-3 active:bg-gray-50 rounded-md transition">
      <div className={
        'w-10 h-10 rounded-full flex items-center justify-center text-base flex-shrink-0 ' +
        (isIncome ? 'bg-income-bg text-income' : isTransfer ? 'bg-transfer-bg text-transfer' : 'bg-expense-bg text-expense')
      }>
        {isIncome ? '↓' : isTransfer ? '⇄' : '↑'}
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-sm font-medium text-gray-900 truncate">{tx.description || (isIncome ? 'Pemasukan' : isTransfer ? 'Transfer' : 'Pengeluaran')}</div>
        <div className="text-xs text-gray-500 truncate">{account} · {formatDate(tx.date, { short: true })}</div>
      </div>
      <div className={`text-sm font-semibold ${color} whitespace-nowrap`}>
        {sign}{formatCurrency(tx.amount, false)}
      </div>
    </button>
  );
}
