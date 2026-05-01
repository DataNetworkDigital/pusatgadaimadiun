import { useState } from 'react';
import { Link } from 'react-router-dom';
import PageHeader from '../common/PageHeader';
import SectionTitle from '../common/SectionTitle';
import Card from '../common/Card';
import KawungMark from '../common/KawungMark';
import ChangePinForm from './ChangePinForm';
import ResetData from './ResetData';
import { useAuth } from '../../contexts/AuthContext';
import { useData } from '../../contexts/DataContext';
import { useDemo } from '../../contexts/DemoContext';
import { exportTransactionsToExcel } from '../../utils/exportExcel';
import { exportTransactionsToPdf } from '../../utils/exportPdf';
import {
  IcLock,
  IcPower,
  IcWallet,
  IcExport,
  IcReceipt,
  IcReset,
  IcChevronRight,
} from '../common/icons';

function Row({ Icon, iconBg, iconColor, label, labelColor = 'text-ink', onClick, isLast }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`w-full flex items-center gap-3.5 py-3.5 text-left active:bg-cream-deep/30 ${
        isLast ? '' : 'border-b border-line-soft'
      }`}
    >
      <div className={`w-9 h-9 rounded-[10px] flex items-center justify-center flex-shrink-0 ${iconBg}`}>
        <Icon size={18} stroke={iconColor} sw={1.9} />
      </div>
      <span className={`flex-1 text-[16px] font-medium ${labelColor}`}>{label}</span>
      <IcChevronRight size={18} stroke="#8B7558" />
    </button>
  );
}

export default function SettingsPage() {
  const auth = useAuth();
  const { accounts, transactions, debts } = useData();
  const { isDemo } = useDemo();
  const [pinOpen, setPinOpen] = useState(false);
  const [resetOpen, setResetOpen] = useState(false);
  const base = isDemo ? '/demo' : '';

  return (
    <div>
      <PageHeader title="Pengaturan" />

      {isDemo && (
        <Card className="!bg-emas-soft !border-emas/40 mb-4">
          <h3 className="font-display text-[15px] font-semibold text-ink">Mode Demo</h3>
          <p className="text-[13px] text-ink-soft mt-1 leading-snug">
            Fitur akun dan reset data dinonaktifkan. Data demo akan kembali ke kondisi awal setiap hari.
          </p>
        </Card>
      )}

      <Card className="mb-4 flex items-center gap-3.5">
        <KawungMark size={56} color="#2D4A6B" bg="#E5EBF2" />
        <div className="flex-1 min-w-0">
          <div className="font-display text-[18px] font-semibold text-ink">Pusat Gadai Madiun</div>
          <div className="text-[13px] text-ink-soft mt-0.5">Buku kas pribadi</div>
        </div>
      </Card>

      <SectionTitle>Ringkasan</SectionTitle>
      <Card className="mb-4 !py-4">
        <div className="grid grid-cols-3">
          {[
            { label: 'Rekening', value: accounts.length },
            { label: 'Transaksi', value: transactions.length },
            { label: 'Utang/Piutang', value: debts.length },
          ].map((s, i) => (
            <div
              key={s.label}
              className={`text-center px-1 ${i < 2 ? 'border-r border-line-soft' : ''}`}
            >
              <div className="font-display text-[24px] font-semibold text-indigo">{s.value}</div>
              <div className="text-[12px] text-ink-mute mt-0.5">{s.label}</div>
            </div>
          ))}
        </div>
      </Card>

      {!isDemo && (
        <>
          <SectionTitle>Akun & Keamanan</SectionTitle>
          <Card className="mb-4 !px-4 !py-1">
            <Row
              Icon={IcLock}
              iconBg="bg-indigo-soft"
              iconColor="#2D4A6B"
              label="Ganti PIN"
              onClick={() => setPinOpen(true)}
            />
            <Row
              Icon={IcPower}
              iconBg="bg-indigo-soft"
              iconColor="#2D4A6B"
              label="Kunci Aplikasi"
              onClick={auth.lock}
              isLast
            />
          </Card>
        </>
      )}

      <SectionTitle>Data</SectionTitle>
      <Card className="mb-4 !px-4 !py-1">
        <Link
          to={`${base}/rekening`}
          className="w-full flex items-center gap-3.5 py-3.5 text-left active:bg-cream-deep/30 border-b border-line-soft"
        >
          <div className="w-9 h-9 rounded-[10px] flex items-center justify-center flex-shrink-0 bg-cream-deep">
            <IcWallet size={18} stroke="#8B6F47" sw={1.9} />
          </div>
          <span className="flex-1 text-[16px] font-medium text-ink">Daftar Rekening</span>
          <IcChevronRight size={18} stroke="#8B7558" />
        </Link>
        <Row
          Icon={IcExport}
          iconBg="bg-cream-deep"
          iconColor="#8B6F47"
          label="Export Excel (CSV)"
          onClick={() => exportTransactionsToExcel(transactions, accounts)}
        />
        <Row
          Icon={IcReceipt}
          iconBg="bg-cream-deep"
          iconColor="#8B6F47"
          label="Export PDF"
          onClick={() => exportTransactionsToPdf(transactions, accounts)}
          isLast
        />
      </Card>

      {!isDemo && (
        <>
          <SectionTitle>Zona Berbahaya</SectionTitle>
          <Card className="mb-4 !border-terra/40 !px-4 !py-1">
            <button
              type="button"
              onClick={() => setResetOpen(true)}
              className="w-full flex items-center gap-3.5 py-3.5 text-left active:bg-terra-soft/40"
            >
              <div className="w-9 h-9 rounded-[10px] bg-terra-soft text-terra flex items-center justify-center flex-shrink-0">
                <IcReset size={18} sw={1.9} />
              </div>
              <span className="flex-1 text-[16px] font-semibold text-terra">Reset Semua Data</span>
            </button>
          </Card>
        </>
      )}

      <div className="text-center text-[12px] text-ink-mute py-4 pb-8">
        Pusat Gadai Madiun · v1.0
      </div>

      {!isDemo && <ChangePinForm open={pinOpen} onClose={() => setPinOpen(false)} />}
      {!isDemo && <ResetData open={resetOpen} onClose={() => setResetOpen(false)} />}
    </div>
  );
}
