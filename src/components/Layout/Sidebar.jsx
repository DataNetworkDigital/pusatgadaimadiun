import { NavLink } from 'react-router-dom';
import { useDemo } from '../../contexts/DemoContext';

const items = [
  { to: '', label: 'Beranda', icon: '🏠' },
  { to: 'rekening', label: 'Rekening', icon: '🏦' },
  { to: 'transaksi', label: 'Transaksi', icon: '💸' },
  { to: 'kalender', label: 'Kalender', icon: '📅' },
  { to: 'utang', label: 'Utang & Piutang', icon: '📋' },
  { to: 'pengaturan', label: 'Pengaturan', icon: '⚙️' },
];

export default function Sidebar() {
  const { isDemo } = useDemo();
  const base = isDemo ? '/demo' : '';
  return (
    <aside className="hidden sm:flex flex-col w-60 bg-white border-r border-gray-200 fixed inset-y-0 left-0 z-20">
      <div className="px-5 py-6 border-b border-gray-100">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-primary flex items-center justify-center text-white font-extrabold">₽</div>
          <div>
            <div className="font-bold text-gray-900 text-sm">Pusat Gadai</div>
            <div className="text-xs text-gray-500">{isDemo ? 'Demo' : 'Madiun'}</div>
          </div>
        </div>
      </div>
      <nav className="flex-1 py-3">
        <ul className="space-y-1 px-2">
          {items.map((it) => {
            const path = it.to ? `${base}/${it.to}` : (base || '/');
            return (
              <li key={it.to || 'home'}>
                <NavLink
                  to={path}
                  end={!it.to}
                  className={({ isActive }) =>
                    'flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition ' +
                    (isActive ? 'bg-primary-50 text-primary' : 'text-gray-700 hover:bg-gray-50')
                  }
                >
                  <span className="text-lg">{it.icon}</span>
                  <span>{it.label}</span>
                </NavLink>
              </li>
            );
          })}
        </ul>
      </nav>
    </aside>
  );
}
