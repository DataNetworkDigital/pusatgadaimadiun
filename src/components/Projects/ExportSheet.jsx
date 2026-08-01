import { useEffect, useState } from 'react';
import Modal from '../common/Modal';
import DateField from '../common/DateField';
import { fromDateInput, formatDate } from '../../utils/formatDate';
import {
  IcDownload,
  IcReceipt,
  IcChevronRight,
  IcChevronLeft,
  IcCheck,
} from '../common/icons';

export default function ExportSheet({ open, onClose, onExportExcel, onExportPdf, onExportCollection, counts }) {
  const [step, setStep] = useState('home');
  const [useDateFilter, setUseDateFilter] = useState(false);
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');

  useEffect(() => {
    if (open) {
      setStep('home');
      setUseDateFilter(false);
      setFrom('');
      setTo('');
    }
  }, [open]);

  const filter =
    useDateFilter && from && to
      ? { from: fromDateInput(from), to: fromDateInput(to) }
      : null;

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
      hint: '1 file · 3 sheet (Aktif + Riwayat + Jadwal Pembayaran)',
      Icon: IcDownload,
      iconBg: 'bg-daun-soft',
      iconColor: '#5C8A4E',
      onClick: () => fire(() => onExportExcel(filter)),
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
    {
      key: 'collection',
      label: 'Daftar Tagihan (buat penagih)',
      hint: 'Siapa, kapan, di mana harus ditagih · PDF + Excel',
      Icon: IcReceipt,
      iconBg: 'bg-emas-soft',
      iconColor: '#C9952F',
      onClick: () => {
        setFrom('');
        setTo('');
        setStep('collection');
      },
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
      onClick: () => fire(() => onExportPdf('active', filter)),
      disabled: counts.active === 0,
    },
    {
      key: 'pdf-archive',
      label: 'Riwayat saja',
      hint: `${counts.archive} project`,
      iconBg: 'bg-terra-soft',
      iconColor: '#B85450',
      onClick: () => fire(() => onExportPdf('archive', filter)),
      disabled: counts.archive === 0,
    },
    {
      key: 'pdf-all',
      label: 'Semua project',
      iconBg: 'bg-emas-soft',
      iconColor: '#C9952F',
      onClick: () => fire(() => onExportPdf('all', filter)),
      disabled: counts.total === 0,
    },
  ];

  const isPdf = step === 'pdf';
  const isCollection = step === 'collection';
  const items = isPdf ? pdfItems : homeItems;
  const collectionFilter =
    from && to ? { from: fromDateInput(from), to: fromDateInput(to) } : null;

  const title = isPdf ? 'Cakupan PDF' : isCollection ? 'Daftar Tagihan' : 'Export Project';
  const subtitle = isPdf
    ? 'Pilih project mana yang masuk ke PDF'
    : isCollection
      ? 'Pilih periode jatuh tempo tagihan'
      : 'Pilih format yang mau diunduh';

  return (
    <Modal open={open} onClose={close} title={title} subtitle={subtitle}>
      {(isPdf || isCollection) && (
        <button
          type="button"
          onClick={() => setStep('home')}
          className="flex items-center gap-1 text-[13px] text-indigo font-semibold mb-3 active:opacity-70"
        >
          <IcChevronLeft size={16} sw={2} /> Kembali
        </button>
      )}

      {isCollection && (
        <div className="space-y-4">
          <div className="rounded-2xl border border-line bg-paper p-3">
            <div className="text-[13px] font-semibold text-ink mb-2">
              Periode jatuh tempo tagihan
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-[11px] text-ink-mute font-semibold uppercase tracking-[0.3px]">
                  Dari
                </label>
                <div className="mt-1">
                  <DateField value={from} onChange={setFrom} />
                </div>
              </div>
              <div>
                <label className="text-[11px] text-ink-mute font-semibold uppercase tracking-[0.3px]">
                  Sampai
                </label>
                <div className="mt-1">
                  <DateField value={to} onChange={setTo} />
                </div>
              </div>
            </div>
            {from && to && (
              <p className="text-[11px] text-indigo mt-2">
                {formatDate(fromDateInput(from), { short: true })} –{' '}
                {formatDate(fromDateInput(to), { short: true })}
              </p>
            )}
          </div>

          <p className="text-[12px] text-ink-mute leading-snug">
            Berisi semua tagihan yang jatuh tempo di periode ini (sudah & belum
            dibayar), lengkap dengan nama, no HP, alamat, dan agunan. Dapat 2 file:
            PDF dan Excel.
          </p>

          <button
            type="button"
            disabled={!collectionFilter}
            onClick={() => fire(() => onExportCollection(collectionFilter))}
            className="w-full py-3 rounded-xl bg-indigo text-cream font-semibold text-[15px] active:bg-indigo-deep disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Download PDF + Excel
          </button>
        </div>
      )}

      {!isPdf && !isCollection && (
        <div className="mb-4 rounded-2xl border border-line bg-paper p-3">
          <button
            type="button"
            onClick={() => setUseDateFilter((v) => !v)}
            className="w-full flex items-center justify-between gap-2 active:opacity-80"
          >
            <div className="text-left">
              <div className="text-[13px] font-semibold text-ink">Filter tanggal (opsional)</div>
              <div className="text-[12px] text-ink-mute mt-0.5">
                {useDateFilter
                  ? 'Hanya pembayaran yang diterima dalam rentang tanggal ini'
                  : 'Semua tanggal'}
              </div>
            </div>
            <span
              className={`w-5 h-5 rounded-md border flex items-center justify-center flex-shrink-0 ${
                useDateFilter ? 'bg-indigo border-indigo' : 'border-line bg-paper'
              }`}
            >
              {useDateFilter && <IcCheck size={14} stroke="#F8F1E2" sw={2.6} />}
            </span>
          </button>
          {useDateFilter && (
            <div className="grid grid-cols-2 gap-2 mt-3">
              <div>
                <label className="text-[11px] text-ink-mute font-semibold uppercase tracking-[0.3px]">
                  Dari
                </label>
                <div className="mt-1">
                  <DateField value={from} onChange={setFrom} />
                </div>
              </div>
              <div>
                <label className="text-[11px] text-ink-mute font-semibold uppercase tracking-[0.3px]">
                  Sampai
                </label>
                <div className="mt-1">
                  <DateField value={to} onChange={setTo} />
                </div>
              </div>
            </div>
          )}
          {useDateFilter && from && to && (
            <p className="text-[11px] text-indigo mt-2">
              {formatDate(fromDateInput(from), { short: true })} –{' '}
              {formatDate(fromDateInput(to), { short: true })}
            </p>
          )}
        </div>
      )}

      {!isCollection && (
      <div className="space-y-2">
        {items.map(({ key, label, hint, Icon, iconBg, iconColor, onClick, disabled }) => (
          <button
            key={key}
            type="button"
            onClick={onClick}
            disabled={disabled || (useDateFilter && (!from || !to))}
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
              {hint && <div className="text-[12px] text-ink-mute mt-0.5 leading-snug">{hint}</div>}
            </div>
            <IcChevronRight size={18} stroke="#8B7558" />
          </button>
        ))}
      </div>
      )}
    </Modal>
  );
}
