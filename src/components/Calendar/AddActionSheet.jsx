import Modal from '../common/Modal';
import { IcSwap, IcLedger, IcReset, IcChevronRight } from '../common/icons';

export default function AddActionSheet({ open, onClose, onPick }) {
  const items = [
    {
      id: 'tx',
      label: 'Transaksi',
      hint: 'Masukan, pengeluaran, atau transfer antar rekening',
      Icon: IcSwap,
      iconBg: 'bg-langit-soft',
      iconColor: '#4A7BA0',
    },
    {
      id: 'debt',
      label: 'Utang / Piutang',
      hint: 'Catat pinjaman atau hutang ke orang lain',
      Icon: IcLedger,
      iconBg: 'bg-terra-soft',
      iconColor: '#B85450',
    },
    {
      id: 'reminder',
      label: 'Pembayaran Berulang',
      hint: 'Catat pengeluaran tetap setiap bulan',
      Icon: IcReset,
      iconBg: 'bg-emas-soft',
      iconColor: '#C9952F',
    },
  ];

  function pick(id) {
    onClose();
    setTimeout(() => onPick(id), 120);
  }

  return (
    <Modal open={open} onClose={onClose} title="Tambah" subtitle="Mau catat apa hari ini?">
      <div className="space-y-2">
        {items.map(({ id, label, hint, Icon, iconBg, iconColor }) => (
          <button
            key={id}
            type="button"
            onClick={() => pick(id)}
            className="w-full flex items-center gap-3 p-3 rounded-2xl bg-paper border border-line text-left active:bg-cream-deep transition"
          >
            <div className={`w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0 ${iconBg}`}>
              <Icon size={22} stroke={iconColor} sw={2} />
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-[15px] font-semibold text-ink">{label}</div>
              <div className="text-[12px] text-ink-mute mt-0.5 leading-snug">{hint}</div>
            </div>
            <IcChevronRight size={18} stroke="#8B7558" />
          </button>
        ))}
      </div>
    </Modal>
  );
}
