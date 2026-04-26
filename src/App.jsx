import { HashRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { DataProvider } from './contexts/DataContext';
import PinScreen from './components/PinLock/PinScreen';
import AppLayout from './components/Layout/AppLayout';
import DashboardPage from './components/Dashboard/DashboardPage';
import AccountList from './components/Accounts/AccountList';
import TransactionList from './components/Transactions/TransactionList';
import DebtList from './components/Debts/DebtList';
import CalendarPage from './components/Calendar/CalendarPage';
import SettingsPage from './components/Settings/SettingsPage';

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

function Gate() {
  const { isUnlocked } = useAuth();
  if (!isUnlocked) return <PinScreen />;
  return (
    <DataProvider>
      <Routes>
        <Route element={<AppLayout />}>
          <Route index element={<DashboardPage />} />
          <Route path="rekening" element={<AccountList />} />
          <Route path="transaksi" element={<TransactionList />} />
          <Route path="utang" element={<DebtList />} />
          <Route path="kalender" element={<CalendarPage />} />
          <Route path="pengaturan" element={<SettingsPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </DataProvider>
  );
}

export default function App() {
  if (!import.meta.env.VITE_FIREBASE_API_KEY) {
    return <MissingFirebaseConfig />;
  }
  return (
    <HashRouter>
      <AuthProvider>
        <Gate />
      </AuthProvider>
    </HashRouter>
  );
}
