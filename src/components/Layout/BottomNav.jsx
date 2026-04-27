import { NavLink } from 'react-router-dom';
import { useDemo } from '../../contexts/DemoContext';

const items = [
  { to: '', label: 'Beranda', icon: '🏠' },
  { to: 'transaksi', label: 'Transaksi', icon: '💸' },
  { to: 'kalender', label: 'Kalender', icon: '📅' },
  { to: 'utang', label: 'Utang', icon: '📋' },
  { to: 'pengaturan', label: 'Pengaturan', icon: '⚙️' },
];

export default function BottomNav() {
  const { isDemo } = useDemo();
  const base = isDemo ? '/demo' : '';
  return (
    <nav className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 z-30 safe-bottom sm:hidden">
      <ul className="flex justify-around">
        {items.map((it) => {
          const path = it.to ? `${base}/${it.to}` : (base || '/');
          return (
            <li key={it.to || 'home'} className="flex-1">
              <NavLink
                to={path}
                end={!it.to}
                className={({ isActive }) =>
                  'flex flex-col items-center justify-center py-2 text-xs ' +
                  (isActive ? 'text-primary' : 'text-gray-500')
                }
              >
                <span className="text-xl leading-none">{it.icon}</span>
                <span className="mt-0.5 font-medium">{it.label}</span>
              </NavLink>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
