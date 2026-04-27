import { NavLink } from 'react-router-dom';
import { useDemo } from '../../contexts/DemoContext';
import KawungMark from '../common/KawungMark';
import { IcHome, IcWallet, IcSwap, IcCalendar, IcLedger, IcSettings } from '../common/icons';

const items = [
  { to: '', label: 'Beranda', Icon: IcHome },
  { to: 'rekening', label: 'Rekening', Icon: IcWallet },
  { to: 'transaksi', label: 'Transaksi', Icon: IcSwap },
  { to: 'kalender', label: 'Kalender', Icon: IcCalendar },
  { to: 'utang', label: 'Utang & Piutang', Icon: IcLedger },
  { to: 'pengaturan', label: 'Pengaturan', Icon: IcSettings },
];

export default function Sidebar() {
  const { isDemo } = useDemo();
  const base = isDemo ? '/demo' : '';
  return (
    <aside className="hidden sm:flex flex-col w-60 bg-paper border-r border-line fixed inset-y-0 left-0 z-20">
      <div className="px-5 py-6 border-b border-line">
        <div className="flex items-center gap-3">
          <KawungMark size={36} color="#2D4A6B" bg="#FFFCF5" />
          <div>
            <div className="font-display text-[15px] font-semibold text-ink leading-tight">Pusat Gadai</div>
            <div className="text-xs text-ink-mute">{isDemo ? 'Demo' : 'Madiun'}</div>
          </div>
        </div>
      </div>
      <nav className="flex-1 py-3">
        <ul className="space-y-1 px-2">
          {items.map(({ to, label, Icon }) => {
            const path = to ? `${base}/${to}` : (base || '/');
            return (
              <li key={to || 'home'}>
                <NavLink
                  to={path}
                  end={!to}
                  className={({ isActive }) =>
                    `flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition ${
                      isActive
                        ? 'bg-indigo-soft text-indigo'
                        : 'text-ink-soft hover:bg-cream-deep/60'
                    }`
                  }
                >
                  {({ isActive }) => (
                    <>
                      <Icon size={20} sw={isActive ? 2.1 : 1.75} />
                      <span>{label}</span>
                    </>
                  )}
                </NavLink>
              </li>
            );
          })}
        </ul>
      </nav>
    </aside>
  );
}
