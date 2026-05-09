import { useEffect, useState } from 'react';
import Modal from '../common/Modal';
import { IcDownload, IcReceipt, IcChevronRight, IcChevronLeft } from '../common/icons';

export default function ExportSheet({ open, onClose, onExportExcel, onExportPdf, counts }) {
  const [step, setStep] = useState('home');

  useEffect(() => {
    if (open) setStep('home');
  }, [open]);

  function close() {
    onClose();
    setTimeout(() => setStep('home'), 200);
  }
  function fire(action) {
    close();
    setTimeout(() => action(), 120);
  }

  const homeItems = [
    {
      key: 'xlsx',
      label: 'Excel',
      hint: `1 file · 3 sheet (Aktif + Riwayat + Jadwal Pembayaran) · total ${counts.total} project`,
      Icon: IcDownload,
      iconBg: 'bg-daun-soft',
      iconColor: '#5C8A4E',
      onClick: () => fire(onExportExcel),
      disabled: counts.total === 0,
    },
    {
      key: 'pdf',
      label: 'PDF',
      hint: 'Pilih cakupan: aktif saja, riwayat saja, atau semua',
      Icon: IcReceipt,
      iconBg: 'bg-indigo-soft',
      iconColor: '#2D4A6B',
      onClick: () => setStep('pdf'),
      disabled: counts.total === 0,
    },
  ];

  const pdfItems = [
    {
      key: 'pdf-active',
      label: 'Project aktif saja',
      hint: `${counts.active} project`,
      iconBg: 'bg-indigo-soft',
      iconColor: '#2D4A6B',
      onClick: () => fire(() => onExportPdf('active')),
      disabled: counts.active === 0,
    },
    {
      key: 'pdf-archive',
      label: 'Riwayat saja',
      hint: `${counts.archive} project`,
      iconBg: 'bg-terra-soft',
      iconColor: '#B85450',
      onClick: () => fire(() => onExportPdf('archive')),
      disabled: counts.archive === 0,
    },
    {
      key: 'pdf-all',
      label: 'Semua project',
      hint: `${counts.total} project, satu file`,
      iconBg: 'bg-emas-soft',
      iconColor: '#C9952F',
      onClick: () => fire(() => onExportPdf('all')),
      disabled: counts.total === 0,
    },
  ];

  const isPdf = step === 'pdf';
  const items = isPdf ? pdfItems : homeItems;

  return (
    <Modal
      open={open}
      onClose={close}
      title={isPdf ? 'Cakupan PDF' : 'Export Project'}
      subtitle={isPdf ? 'Pilih project mana yang masuk ke PDF' : 'Pilih format yang mau diunduh'}
    >
      {isPdf && (
        <button
          type="button"
          onClick={() => setStep('home')}
          className="flex items-center gap-1 text-[13px] text-indigo font-semibold mb-3 active:opacity-70"
        >
          <IcChevronLeft size={16} sw={2} /> Kembali
        </button>
      )}

      <div className="space-y-2">
        {items.map(({ key, label, hint, Icon, iconBg, iconColor, onClick, disabled }) => (
          <button
            key={key}
            type="button"
            onClick={onClick}
            disabled={disabled}
            className="w-full flex items-center gap-3 p-3 rounded-2xl bg-paper border border-line text-left active:bg-cream-deep transition disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <div className={`w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0 ${iconBg}`}>
              {Icon ? (
                <Icon size={22} stroke={iconColor} sw={2} />
              ) : (
                <IcReceipt size={22} stroke={iconColor} sw={2} />
              )}
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
