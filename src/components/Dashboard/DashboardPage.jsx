import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useData } from '../../contexts/DataContext';
import { useDemo } from '../../contexts/DemoContext';
import BalanceSummary from './BalanceSummary';
import MonthlyChart from './MonthlyChart';
import RecentTransactions from './RecentTransactions';
import { startOfMonth, endOfMonth, toDate, daysBetween, MONTHS_SHORT } from '../../utils/formatDate';
import { formatCurrency } from '../../utils/formatCurrency';
import { IcAlert, IcChevronRight, IcSwap, IcWallet, IcLedger } from '../common/icons';

function DueBanner({ count, total, isOverdue, to }) {
  return (
    <Link
      to={to}
      className={`block rounded-2xl px-4 py-3.5 relative overflow-hidden ${
        isOverdue ? 'bg-terra' : 'bg-[#C4574A]'
      }`}
      style={{ boxShadow: '0 6px 16px rgba(184,84,80,0.25)' }}
    >
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background:
            'repeating-linear-gradient(45deg, transparent 0 14px, rgba(255,255,255,0.06) 14px 15px)',
        }}
      />
      <div className="relative flex items-center gap-3">
        <div className="w-10 h-10 rounded-[11px] bg-white/[0.18] flex items-center justify-center flex-shrink-0">
          <IcAlert size={22} stroke="#F8F1E2" sw={2.2} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-[11px] font-bold text-cream/90 uppercase tracking-[0.6px]">
            {isOverdue ? 'Lewat Jatuh Tempo' : 'Segera Jatuh Tempo'}
          </div>
          <div className="font-display text-[16px] font-semibold text-cream mt-px">
            {count} tagihan · {formatCurrency(total)}
          </div>
        </div>
        <IcChevronRight size={20} stroke="#F8F1E2" />
      </div>
    </Link>
  );
}

const QUICK_ACTIONS = [
  { to: 'transaksi', label: 'Transaksi', Icon: IcSwap },
  { to: 'rekening', label: 'Rekening', Icon: IcWallet },
  { to: 'utang', label: 'Utang', Icon: IcLedger },
];

function QuickActions({ base }) {
  return (
    <div className="grid grid-cols-3 gap-2.5">
      {QUICK_ACTIONS.map(({ to, label, Icon }) => (
        <Link
          key={to}
          to={`${base}/${to}`}
          className="bg-paper border border-line rounded-2xl py-3.5 px-2 flex flex-col items-center gap-1.5 active:bg-cream-deep/40 transition"
        >
          <Icon size={22} stroke="#2D4A6B" sw={1.9} />
          <span className="text-[13px] font-medium text-ink">{label}</span>
        </Link>
      ))}
    </div>
  );
}

export default function DashboardPage() {
  const { transactions, accounts, debts, totalBalance, loading } = useData();
  const { isDemo } = useDemo();
  const base = isDemo ? '/demo' : '';

  const { monthIncome, monthExpense, chartData, recent } = useMemo(() => {
    const now = new Date();
    const start = startOfMonth(now);
    const end = endOfMonth(now);
    let inc = 0;
    let exp = 0;
    transactions.forEach((tx) => {
      const d = toDate(tx.date);
      if (!d || d < start || d > end) return;
      if (tx.type === 'income') inc += tx.amount;
      else if (tx.type === 'expense') exp += tx.amount;
    });
    const months = [];
    for (let i = 5; i >= 0; i--) {
      const m = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const mStart = startOfMonth(m);
      const mEnd = endOfMonth(m);
      let mi = 0;
      let me = 0;
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

  const { overdue, dueSoon } = useMemo(() => {
    const now = new Date();
    const o = [];
    const s = [];
    debts.forEach((d) => {
      if (d.status === 'paid') return;
      const days = daysBetween(now, toDate(d.dueDate));
      if (days < 0) o.push(d);
      else if (days <= 7) s.push(d);
    });
    return { overdue: o, dueSoon: s };
  }, [debts]);

  if (loading) {
    return <div className="py-20 text-center text-ink-mute">Memuat data…</div>;
  }

  const hasChartData = chartData.some((m) => m.Pemasukan > 0 || m.Pengeluaran > 0);
  const dueItems = overdue.length > 0 ? overdue : dueSoon;
  const dueIsOverdue = overdue.length > 0;
  const dueTotal = dueItems.reduce((sum, d) => sum + (d.remainingAmount || 0), 0);

  return (
    <div className="space-y-4">
      <BalanceSummary totalBalance={totalBalance} income={monthIncome} expense={monthExpense} />

      {dueItems.length > 0 && (
        <DueBanner
          count={dueItems.length}
          total={dueTotal}
          isOverdue={dueIsOverdue}
          to={`${base}/utang`}
        />
      )}

      <QuickActions base={base} />

      <RecentTransactions transactions={recent} accounts={accounts} />

      {hasChartData && <MonthlyChart data={chartData} />}
    </div>
  );
}
