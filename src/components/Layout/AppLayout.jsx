import { Outlet } from 'react-router-dom';
import BottomNav from './BottomNav';
import Sidebar from './Sidebar';

export default function AppLayout() {
  return (
    <div className="min-h-[100svh] bg-gray-50">
      <Sidebar />
      <main className="sm:pl-60 pb-24 sm:pb-8">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 safe-top">
          <Outlet />
        </div>
      </main>
      <BottomNav />
    </div>
  );
}
