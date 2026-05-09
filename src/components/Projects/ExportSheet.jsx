import Modal from '../common/Modal';
import { IcExport, IcReceipt, IcChevronRight } from '../common/icons';

export default function ExportSheet({ open, onClose, onExportExcel, onExportPdf, counts }) {
  function pick(action) {
    onClose();
    setTimeout(() => action(), 120);
  }

  const items = [
    {
      key: 'xlsx',
      label: 'Excel — Semua project',
      hint: `2 sheet (Aktif + Riwayat) + jadwal pembayaran · total ${counts.total}`,
      Icon: IcExport,
      iconBg: 'bg-daun-soft',
      iconColor: '#5C8A4E',
      onClick: () => pick(onExportExcel),
    },
    {
      key: 'pdf-active',
      label: 'PDF — Project aktif saja',
      hint: `${counts.active} project`,
      Icon: IcReceipt,
      iconBg: 'bg-indigo-soft',
      iconColor: '#2D4A6B',
      onClick: () => pick(() => onExportPdf('active')),
    },
    {
      key: 'pdf-archive',
      label: 'PDF — Riwayat saja',
      hint: `${counts.archive} project`,
      Icon: IcReceipt,
      iconBg: 'bg-terra-soft',
      iconColor: '#B85450',
      onClick: () => pick(() => onExportPdf('archive')),
    },
    {
      key: 'pdf-all',
      label: 'PDF — Semua project',
      hint: `${counts.total} project, satu file`,
      Icon: IcReceipt,
      iconBg: 'bg-emas-soft',
      iconColor: '#C9952F',
      onClick: () => pick(() => onExportPdf('all')),
    },
  ];

  return (
    <Modal open={open} onClose={onClose} title="Export Project" subtitle="Pilih format yang mau diunduh">
      <div className="space-y-2">
        {items.map(({ key, label, hint, Icon, iconBg, iconColor, onClick }) => (
          <button
            key={key}
            type="button"
            onClick={onClick}
            disabled={key === 'xlsx' ? counts.total === 0 : (
              key === 'pdf-active' ? counts.active === 0 :
              key === 'pdf-archive' ? counts.archive === 0 :
              counts.total === 0
            )}
            className="w-full flex items-center gap-3 p-3 rounded-2xl bg-paper border border-line text-left active:bg-cream-deep transition disabled:opacity-50 disabled:cursor-not-allowed"
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
