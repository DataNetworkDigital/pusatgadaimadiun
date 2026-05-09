import { NavLink, Outlet } from 'react-router-dom';
import { useDemo } from '../../contexts/DemoContext';

export default function CatatanLayout() {
  const { isDemo } = useDemo();
  const base = isDemo ? '/demo/catatan' : '/catatan';
  const tabClass = ({ isActive }) =>
    'flex-1 py-2.5 rounded-[10px] text-[14px] font-semibold transition text-center ' +
    (isActive
      ? 'bg-paper text-indigo shadow-[0_1px_3px_rgba(140,110,60,0.1)]'
      : 'bg-transparent text-ink-soft');

  return (
    <div>
      <div className="bg-cream-deep rounded-[14px] p-1 flex gap-1 mb-4">
        <NavLink to={`${base}/transaksi`} className={tabClass}>
          Transaksi
        </NavLink>
        <NavLink to={`${base}/utang`} className={tabClass}>
          Utang & Piutang
        </NavLink>
      </div>
      <Outlet />
    </div>
  );
}
