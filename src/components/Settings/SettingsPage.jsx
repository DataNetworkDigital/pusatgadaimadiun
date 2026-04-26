import { useState } from 'react';
import PageHeader from '../common/PageHeader';
import ChangePinForm from './ChangePinForm';
import ResetData from './ResetData';
import { useAuth } from '../../contexts/AuthContext';
import { useData } from '../../contexts/DataContext';
import { Link } from 'react-router-dom';

export default function SettingsPage() {
  const { lock } = useAuth();
  const { accounts, transactions, debts } = useData();
  const [pinOpen, setPinOpen] = useState(false);
  const [resetOpen, setResetOpen] = useState(false);

  return (
    <div className="space-y-4">
      <PageHeader title="Pengaturan" />

      <div className="card">
        <h3 className="font-semibold text-gray-900 mb-3">Statistik</h3>
        <div className="grid grid-cols-3 gap-2 text-center">
          <div>
            <div className="text-xl font-bold text-primary">{accounts.length}</div>
            <div className="text-xs text-gray-500">Rekening</div>
          </div>
          <div>
            <div className="text-xl font-bold text-primary">{transactions.length}</div>
            <div className="text-xs text-gray-500">Transaksi</div>
          </div>
          <div>
            <div className="text-xl font-bold text-primary">{debts.length}</div>
            <div className="text-xs text-gray-500">Utang/Piutang</div>
          </div>
        </div>
      </div>

      <div className="card">
        <h3 className="font-semibold text-gray-900 mb-2">Akun & Keamanan</h3>
        <div className="divide-y divide-gray-100">
          <button onClick={() => setPinOpen(true)} className="w-full text-left py-3 flex items-center justify-between active:bg-gray-50 rounded">
            <span className="text-sm">Ganti PIN</span>
            <span className="text-gray-400">›</span>
          </button>
          <button onClick={lock} className="w-full text-left py-3 flex items-center justify-between active:bg-gray-50 rounded">
            <span className="text-sm">Kunci Aplikasi</span>
            <span className="text-gray-400">›</span>
          </button>
        </div>
      </div>

      <div className="card sm:hidden">
        <h3 className="font-semibold text-gray-900 mb-2">Lainnya</h3>
        <div className="divide-y divide-gray-100">
          <Link to="/rekening" className="block py-3 text-sm flex items-center justify-between active:bg-gray-50 rounded">
            <span className="flex items-center gap-2">🏦 <span>Daftar Rekening</span></span>
            <span className="text-gray-400">›</span>
          </Link>
        </div>
      </div>

      <div className="card">
        <h3 className="font-semibold text-expense mb-2">Zona Berbahaya</h3>
        <button onClick={() => setResetOpen(true)} className="btn-danger w-full">Reset Semua Data</button>
      </div>

      <div className="text-center text-xs text-gray-400 pb-6">
        Pusat Gadai Madiun · v1.0
      </div>

      <ChangePinForm open={pinOpen} onClose={() => setPinOpen(false)} />
      <ResetData open={resetOpen} onClose={() => setResetOpen(false)} />
    </div>
  );
}
