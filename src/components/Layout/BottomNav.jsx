import { NavLink } from 'react-router-dom';
import { useDemo } from '../../contexts/DemoContext';
import { IcHome, IcSwap, IcCalendar, IcLedger, IcSettings } from '../common/icons';

const items = [
  { to: '', label: 'Beranda', Icon: IcHome },
  { to: 'transaksi', label: 'Transaksi', Icon: IcSwap },
  { to: 'kalender', label: 'Kalender', Icon: IcCalendar },
  { to: 'utang', label: 'Utang', Icon: IcLedger },
  { to: 'pengaturan', label: 'Pengaturan', Icon: IcSettings },
];

export default function BottomNav() {
  const { isDemo } = useDemo();
  const base = isDemo ? '/demo' : '';
  return (
    <nav className="fixed bottom-0 left-0 right-0 bg-paper border-t border-line z-30 safe-bottom sm:hidden">
      <ul className="flex">
        {items.map(({ to, label, Icon }) => {
          const path = to ? `${base}/${to}` : (base || '/');
          return (
            <li key={to || 'home'} className="flex-1">
              <NavLink
                to={path}
                end={!to}
                className={({ isActive }) =>
                  `flex flex-col items-center gap-[3px] py-2 px-1 ${isActive ? 'text-indigo' : 'text-ink-mute'}`
                }
              >
                {({ isActive }) => (
                  <>
                    <Icon size={24} sw={isActive ? 2.1 : 1.75} />
                    <span className={`text-[11px] tracking-[-0.1px] ${isActive ? 'font-semibold' : 'font-medium'}`}>{label}</span>
                  </>
                )}
              </NavLink>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
