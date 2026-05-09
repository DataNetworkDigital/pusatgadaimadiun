import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useData } from '../../contexts/DataContext';
import { useDemo } from '../../contexts/DemoContext';
import BalanceSummary from './BalanceSummary';
import MonthlyChart from './MonthlyChart';
import RecentTransactions from './RecentTransactions';
import Card from '../common/Card';
import { startOfMonth, endOfMonth, toDate, daysBetween, MONTHS_SHORT } from '../../utils/formatDate';
import { formatCurrency } from '../../utils/formatCurrency';
import { projectSummary } from '../../utils/projectSchedule';
import { IcAlert, IcChevronRight, IcSwap, IcWallet, IcLedger, IcBriefcase } from '../common/icons';

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
  { to: 'catatan/transaksi', label: 'Transaksi', Icon: IcSwap },
  { to: 'rekening', label: 'Rekening', Icon: IcWallet },
  { to: 'catatan/utang', label: 'Utang', Icon: IcLedger },
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
  const { transactions, accounts, debts, projects, totalBalance, loading } = useData();
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
      if (days < 0) o.push({ kind: 'debt', amount: d.remainingAmount || 0 });
      else if (days <= 7) s.push({ kind: 'debt', amount: d.remainingAmount || 0 });
    });
    projects.forEach((p) => {
      if (p.status !== 'active') return;
      (p.payments || []).forEach((pay) => {
        if (pay.receivedAmount != null) return;
        const days = daysBetween(now, toDate(pay.dueDate));
        if (days < 0) o.push({ kind: 'project', amount: pay.expectedAmount || 0 });
        else if (days <= 7) s.push({ kind: 'project', amount: pay.expectedAmount || 0 });
      });
    });
    return { overdue: o, dueSoon: s };
  }, [debts, projects]);

  const projectStats = useMemo(() => {
    const active = projects.filter((p) => p.status === 'active');
    let modal = 0;
    let expectedRemaining = 0;
    active.forEach((p) => {
      modal += Number(p.disbursedAmount) || 0;
      expectedRemaining += projectSummary(p).expectedRemaining;
    });
    return { count: active.length, modal, expectedRemaining };
  }, [projects]);

  if (loading) {
    return <div className="py-20 text-center text-ink-mute">Memuat data…</div>;
  }

  const hasChartData = chartData.some((m) => m.Pemasukan > 0 || m.Pengeluaran > 0);
  const dueItems = overdue.length > 0 ? overdue : dueSoon;
  const dueIsOverdue = overdue.length > 0;
  const dueTotal = dueItems.reduce((sum, d) => sum + (d.amount || 0), 0);
  const dueHasProject = dueItems.some((d) => d.kind === 'project');
  const dueLink = dueHasProject && !dueItems.some((d) => d.kind === 'debt')
    ? `${base}/project`
    : `${base}/catatan/utang`;

  return (
    <div className="space-y-4">
      <BalanceSummary totalBalance={totalBalance} income={monthIncome} expense={monthExpense} />

      {dueItems.length > 0 && (
        <DueBanner
          count={dueItems.length}
          total={dueTotal}
          isOverdue={dueIsOverdue}
          to={dueLink}
        />
      )}

      <QuickActions base={base} />

      {projectStats.count > 0 && (
        <Link to={`${base}/project`} className="block">
          <Card className="!p-4 active:bg-cream-deep/30">
            <div className="flex items-center gap-3">
              <div className="w-11 h-11 rounded-xl bg-indigo-soft text-indigo flex items-center justify-center flex-shrink-0">
                <IcBriefcase size={22} sw={1.9} />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-display text-[16px] font-semibold text-ink">
                    {projectStats.count} Project Aktif
                  </span>
                  <IcChevronRight size={18} stroke="#8B7558" />
                </div>
                <div className="text-[12px] text-ink-mute mt-0.5">
                  Modal {formatCurrency(projectStats.modal)}
                </div>
              </div>
            </div>
            <div className="mt-3 pt-3 border-t border-line-soft flex items-baseline justify-between">
              <span className="text-[12px] text-ink-soft">Ekspektasi belum cair</span>
              <span
                className="font-num text-[16px] font-semibold text-daun"
                style={{ fontVariantNumeric: 'tabular-nums' }}
              >
                {formatCurrency(projectStats.expectedRemaining)}
              </span>
            </div>
          </Card>
        </Link>
      )}

      <RecentTransactions transactions={recent} accounts={accounts} />

      {hasChartData && <MonthlyChart data={chartData} />}
    </div>
  );
}
