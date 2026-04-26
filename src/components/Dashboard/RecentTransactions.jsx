import { Link } from 'react-router-dom';
import { formatCurrency } from '../../utils/formatCurrency';
import { formatDate } from '../../utils/formatDate';

export default function RecentTransactions({ transactions, accounts }) {
  const accountName = (id) => accounts.find((a) => a.id === id)?.name || '-';

  if (!transactions.length) {
    return (
      <div className="card">
        <div className="flex items-center justify-between mb-2">
          <h3 className="font-semibold text-gray-900">Transaksi Terakhir</h3>
        </div>
        <p className="text-sm text-gray-500 py-6 text-center">Belum ada transaksi.</p>
      </div>
    );
  }

  return (
    <div className="card">
      <div className="flex items-center justify-between mb-3">
        <h3 className="font-semibold text-gray-900">Transaksi Terakhir</h3>
        <Link to="/transaksi" className="text-xs text-primary font-medium">Lihat semua →</Link>
      </div>
      <ul className="divide-y divide-gray-100">
        {transactions.map((tx) => {
          const isIncome = tx.type === 'income';
          const isTransfer = tx.type === 'transfer';
          const color = isIncome ? 'text-income' : isTransfer ? 'text-transfer' : 'text-expense';
          const sign = isIncome ? '+' : isTransfer ? '' : '-';
          const account = isTransfer
            ? `${accountName(tx.fromAccount)} → ${accountName(tx.toAccount)}`
            : accountName(isIncome ? tx.toAccount : tx.fromAccount);
          return (
            <li key={tx.id} className="py-3 flex items-center gap-3">
              <div className={
                'w-9 h-9 rounded-full flex items-center justify-center text-sm ' +
                (isIncome ? 'bg-income-bg text-income' : isTransfer ? 'bg-transfer-bg text-transfer' : 'bg-expense-bg text-expense')
              }>
                {isIncome ? '↓' : isTransfer ? '⇄' : '↑'}
              </div>
              <div className="min-w-0 flex-1">
                <div className="text-sm font-medium text-gray-900 truncate">{tx.description || (isIncome ? 'Pemasukan' : isTransfer ? 'Transfer' : 'Pengeluaran')}</div>
                <div className="text-xs text-gray-500 truncate">{account} · {formatDate(tx.date, { short: true })}</div>
              </div>
              <div className={`text-sm font-semibold ${color} whitespace-nowrap`}>
                {sign}{formatCurrency(tx.amount, false)}
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
