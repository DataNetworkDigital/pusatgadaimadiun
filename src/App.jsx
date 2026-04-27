import { useEffect, useState } from 'react';
import { HashRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { DataProvider } from './contexts/DataContext';
import { DemoProvider } from './contexts/DemoContext';
import PinScreen from './components/PinLock/PinScreen';
import AppLayout from './components/Layout/AppLayout';
import DashboardPage from './components/Dashboard/DashboardPage';
import AccountList from './components/Accounts/AccountList';
import TransactionList from './components/Transactions/TransactionList';
import DebtList from './components/Debts/DebtList';
import CalendarPage from './components/Calendar/CalendarPage';
import SettingsPage from './components/Settings/SettingsPage';
import DemoLoading from './components/Demo/DemoLoading';
import { ensureDemoFresh, incrementVisitor } from './utils/demoReset';
import { authReady } from './firebase';

function MissingFirebaseConfig() {
  return (
    <div className="min-h-[100svh] flex items-center justify-center px-6 bg-gray-50">
      <div className="max-w-md text-center">
        <div className="text-4xl mb-3">⚙️</div>
        <h1 className="text-xl font-bold text-gray-900">Konfigurasi Firebase belum diatur</h1>
        <p className="text-sm text-gray-600 mt-2">
          Silakan buat file <code className="bg-gray-100 px-1 rounded">.env</code> di root project dan isi dengan kredensial Firebase Anda. Lihat <code className="bg-gray-100 px-1 rounded">.env.example</code> untuk daftar variabel.
        </p>
      </div>
    </div>
  );
}

function AppRoutes() {
  return (
    <Routes>
      <Route element={<AppLayout />}>
        <Route index element={<DashboardPage />} />
        <Route path="rekening" element={<AccountList />} />
        <Route path="transaksi" element={<TransactionList />} />
        <Route path="utang" element={<DebtList />} />
        <Route path="kalender" element={<CalendarPage />} />
        <Route path="pengaturan" element={<SettingsPage />} />
        <Route path="*" element={<Navigate to="" replace />} />
      </Route>
    </Routes>
  );
}

function RealGate() {
  const { isUnlocked } = useAuth();
  if (!isUnlocked) return <PinScreen />;
  return (
    <DataProvider>
      <AppRoutes />
    </DataProvider>
  );
}

function DemoGate() {
  const [ready, setReady] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    (async () => {
      try {
        await authReady.catch(() => null);
        await ensureDemoFresh();
        incrementVisitor();
        setReady(true);
      } catch (e) {
        console.error('Demo init failed', e);
        setError(e.message || 'Gagal menyiapkan demo');
      }
    })();
  }, []);

  if (error) {
    return (
      <div className="min-h-[100svh] flex items-center justify-center px-6">
        <div className="text-center max-w-md">
          <div className="text-4xl mb-2">😢</div>
          <h2 className="font-bold text-gray-900">Demo gagal dimulai</h2>
          <p className="text-sm text-gray-600 mt-2">{error}</p>
        </div>
      </div>
    );
  }
  if (!ready) return <DemoLoading />;
  return (
    <DataProvider>
      <AppRoutes />
    </DataProvider>
  );
}

export default function App() {
  if (!import.meta.env.VITE_FIREBASE_API_KEY) {
    return <MissingFirebaseConfig />;
  }
  return (
    <HashRouter>
      <Routes>
        <Route
          path="/demo/*"
          element={
            <DemoProvider isDemo>
              <DemoGate />
            </DemoProvider>
          }
        />
        <Route
          path="/*"
          element={
            <DemoProvider>
              <AuthProvider>
                <RealGate />
              </AuthProvider>
            </DemoProvider>
          }
        />
      </Routes>
    </HashRouter>
  );
}
