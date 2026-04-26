import { formatCurrency } from '../../utils/formatCurrency';

export default function BalanceSummary({ totalBalance, income, expense }) {
  const diff = income - expense;
  return (
    <div className="bg-gradient-to-br from-primary-600 to-primary text-white rounded-2xl p-5 shadow-lg">
      <div className="text-xs opacity-80 uppercase tracking-wide">Total Saldo</div>
      <div className="text-3xl sm:text-4xl font-extrabold mt-1 break-all">{formatCurrency(totalBalance)}</div>
      <div className="grid grid-cols-2 gap-3 mt-5">
        <div className="bg-white/15 backdrop-blur rounded-xl p-3">
          <div className="text-xs opacity-80">Pemasukan Bulan Ini</div>
          <div className="font-bold mt-0.5 truncate">{formatCurrency(income)}</div>
        </div>
        <div className="bg-white/15 backdrop-blur rounded-xl p-3">
          <div className="text-xs opacity-80">Pengeluaran Bulan Ini</div>
          <div className="font-bold mt-0.5 truncate">{formatCurrency(expense)}</div>
        </div>
      </div>
      <div className="mt-3 text-sm">
        Selisih: <span className="font-bold">{diff >= 0 ? '+' : ''}{formatCurrency(diff)}</span>
      </div>
    </div>
  );
}
