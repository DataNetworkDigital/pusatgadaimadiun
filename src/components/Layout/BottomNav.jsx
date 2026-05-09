import { NavLink, useLocation } from 'react-router-dom';
import { useDemo } from '../../contexts/DemoContext';
import { IcHome, IcLedger, IcBriefcase, IcCalendar, IcSettings } from '../common/icons';

const items = [
  { to: '', label: 'Beranda', Icon: IcHome },
  { to: 'catatan', label: 'Catatan', Icon: IcLedger, alt: ['transaksi', 'utang'] },
  { to: 'project', label: 'Project', Icon: IcBriefcase },
  { to: 'kalender', label: 'Kalender', Icon: IcCalendar },
  { to: 'pengaturan', label: 'Pengaturan', Icon: IcSettings },
];

export default function BottomNav() {
  const { isDemo } = useDemo();
  const location = useLocation();
  const base = isDemo ? '/demo' : '';
  const path = location.pathname;
  return (
    <nav className="fixed bottom-0 left-0 right-0 bg-paper border-t border-line z-30 safe-bottom sm:hidden">
      <ul className="flex">
        {items.map(({ to, label, Icon, alt = [] }) => {
          const target = to ? `${base}/${to}` : (base || '/');
          // Manual active detection so the Catatan tab also matches legacy /transaksi /utang
          const isActive =
            (!to && (path === '/' || path === (base || '/'))) ||
            (to && path.startsWith(`${base}/${to}`)) ||
            alt.some((a) => path.startsWith(`${base}/${a}`));
          return (
            <li key={to || 'home'} className="flex-1">
              <NavLink
                to={target}
                end={!to}
                className={`flex flex-col items-center gap-[3px] py-2 px-1 ${isActive ? 'text-indigo' : 'text-ink-mute'}`}
              >
                <Icon size={24} sw={isActive ? 2.1 : 1.75} />
                <span className={`text-[11px] tracking-[-0.1px] ${isActive ? 'font-semibold' : 'font-medium'}`}>{label}</span>
              </NavLink>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
