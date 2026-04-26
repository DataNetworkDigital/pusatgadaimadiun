import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useData } from '../../contexts/DataContext';
import BalanceSummary from './BalanceSummary';
import MonthlyChart from './MonthlyChart';
import RecentTransactions from './RecentTransactions';
import { startOfMonth, endOfMonth, toDate, daysBetween, MONTHS_SHORT } from '../../utils/formatDate';
import { formatCurrency } from '../../utils/formatCurrency';

export default function DashboardPage() {
  const { transactions, accounts, debts, totalBalance, loading } = useData();

  const { monthIncome, monthExpense, chartData, recent } = useMemo(() => {
    const now = new Date();
    const start = startOfMonth(now);
    const end = endOfMonth(now);
    let inc = 0, exp = 0;
    const dailyData = {};
    transactions.forEach((tx) => {
      const d = toDate(tx.date);
      if (!d || d < start || d > end) return;
      if (tx.type === 'income') inc += tx.amount;
      else if (tx.type === 'expense') exp += tx.amount;
    });
    // Build last 6 months chart
    const months = [];
    for (let i = 5; i >= 0; i--) {
      const m = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const mStart = startOfMonth(m);
      const mEnd = endOfMonth(m);
      let mi = 0, me = 0;
      transactions.forEach((tx) => {
        const td = toDate(tx.date);
        if (!td || td < mStart || td > mEnd) return;
        if (tx.type === 'income') mi += tx.amount;
        else if (tx.type === 'expense') me += tx.amount;
      });
      months.push({ label: MONTHS_SHORT[m.getMonth()], Pemasukan: mi, Pengeluaran: me });
    }
    return {
      monthIncome: inc,
      monthExpense: exp,
      chartData: months,
      recent: transactions.slice(0, 5),
    };
  }, [transactions]);

  const dueSoon = useMemo(() => {
    const now = new Date();
    return debts.filter((d) => {
      if (d.status === 'paid') return false;
      const days = daysBetween(now, toDate(d.dueDate));
      return days >= 0 && days <= 7;
    });
  }, [debts]);

  if (loading) {
    return <div className="py-20 text-center text-gray-500">Memuat data…</div>;
  }

  const hasChartData = chartData.some((m) => m.Pemasukan > 0 || m.Pengeluaran > 0);

  return (
    <div className="space-y-4">
      <BalanceSummary totalBalance={totalBalance} income={monthIncome} expense={monthExpense} />

      {dueSoon.length > 0 && (
        <Link to="/utang" className="block">
          <div className="bg-warning-bg border border-warning/30 rounded-xl p-3 flex items-center gap-3">
            <div className="w-9 h-9 rounded-full bg-warning text-white flex items-center justify-center">⚠</div>
            <div className="flex-1 text-sm">
              <div className="font-semibold text-gray-900">{dueSoon.length} jatuh tempo dalam 7 hari</div>
              <div className="text-gray-600 text-xs">Total: {formatCurrency(dueSoon.reduce((s, d) => s + d.remainingAmount, 0))}</div>
            </div>
            <span className="text-warning">→</span>
          </div>
        </Link>
      )}

      <div className="grid grid-cols-3 gap-2">
        <Link to="/transaksi" className="card flex flex-col items-center justify-center py-4 px-2 active:bg-gray-50">
          <span className="text-2xl">💸</span>
          <span className="text-xs font-medium mt-1 text-center">Transaksi</span>
        </Link>
        <Link to="/rekening" className="card flex flex-col items-center justify-center py-4 px-2 active:bg-gray-50">
          <span className="text-2xl">🏦</span>
          <span className="text-xs font-medium mt-1 text-center">Rekening</span>
        </Link>
        <Link to="/utang" className="card flex flex-col items-center justify-center py-4 px-2 active:bg-gray-50">
          <span className="text-2xl">📋</span>
          <span className="text-xs font-medium mt-1 text-center">Utang</span>
        </Link>
      </div>

      <RecentTransactions transactions={recent} accounts={accounts} />

      {hasChartData && <MonthlyChart data={chartData} />}
    </div>
  );
}
