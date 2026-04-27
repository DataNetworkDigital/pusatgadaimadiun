import { Outlet } from 'react-router-dom';
import BottomNav from './BottomNav';
import Sidebar from './Sidebar';
import DemoBanner from '../Demo/DemoBanner';
import DemoCTA from '../Demo/DemoCTA';
import VisitorCounter from '../Demo/VisitorCounter';
import { useDemo } from '../../contexts/DemoContext';

export default function AppLayout() {
  const { isDemo } = useDemo();
  return (
    <div className="min-h-[100svh] bg-cream">
      {isDemo && <DemoBanner />}
      <Sidebar />
      <main className="sm:pl-60 pb-24 sm:pb-8">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 safe-top">
          {isDemo && (
            <div className="pt-4">
              <VisitorCounter />
            </div>
          )}
          <Outlet />
          {isDemo && (
            <div className="mt-6">
              <DemoCTA />
            </div>
          )}
        </div>
      </main>
      <BottomNav />
    </div>
  );
}
