import { useEffect, useState } from 'react';
import Modal from '../common/Modal';
import DateField from '../common/DateField';
import { formatDateInput, fromDateInput } from '../../utils/formatDate';
import { IcCheck } from '../common/icons';

const PRESETS = [
  { id: 'this-month', label: 'Bulan Ini' },
  { id: 'last-30', label: '30 Hari Terakhir' },
  { id: 'last-90', label: '90 Hari Terakhir' },
  { id: 'this-year', label: 'Tahun Ini' },
  { id: 'all', label: 'Semua Waktu' },
];

export default function PeriodPickerSheet({ open, onClose, value, onChange }) {
  const [step, setStep] = useState('home');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');

  useEffect(() => {
    if (open) {
      setStep('home');
      if (value?.id === 'custom') {
        setFrom(value.from ? formatDateInput(value.from) : '');
        setTo(value.to ? formatDateInput(value.to) : '');
      } else {
        setFrom('');
        setTo('');
      }
    }
  }, [open, value]);

  function pickPreset(id) {
    onChange({ id });
    onClose();
  }

  function applyCustom(e) {
    e.preventDefault();
    if (!from || !to) return;
    onChange({
      id: 'custom',
      from: fromDateInput(from),
      to: fromDateInput(to),
    });
    onClose();
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={step === 'custom' ? 'Rentang Tanggal' : 'Pilih Periode'}
      subtitle={step === 'custom' ? 'Pilih tanggal mulai dan akhir' : 'Tampilkan return untuk periode mana?'}
    >
      {step === 'home' ? (
        <div className="space-y-2">
          {PRESETS.map((p) => {
            const active = value?.id === p.id;
            return (
              <button
                key={p.id}
                type="button"
                onClick={() => pickPreset(p.id)}
                className={
                  'w-full flex items-center gap-3 p-3 rounded-2xl border text-left active:bg-cream-deep transition ' +
                  (active
                    ? 'bg-indigo-soft border-indigo/30'
                    : 'bg-paper border-line')
                }
              >
                <span className={`flex-1 text-[15px] font-semibold ${active ? 'text-indigo' : 'text-ink'}`}>
                  {p.label}
                </span>
                {active && <IcCheck size={18} stroke="#2D4A6B" sw={2.4} />}
              </button>
            );
          })}
          <button
            type="button"
            onClick={() => setStep('custom')}
            className={
              'w-full flex items-center gap-3 p-3 rounded-2xl border text-left active:bg-cream-deep transition ' +
              (value?.id === 'custom'
                ? 'bg-indigo-soft border-indigo/30'
                : 'bg-paper border-line')
            }
          >
            <span
              className={`flex-1 text-[15px] font-semibold ${
                value?.id === 'custom' ? 'text-indigo' : 'text-ink'
              }`}
            >
              Custom Range…
            </span>
            <span className="text-[13px] text-ink-mute">›</span>
          </button>
        </div>
      ) : (
        <form onSubmit={applyCustom} className="space-y-3">
          <div>
            <label className="label-text">Dari</label>
            <DateField value={from} onChange={setFrom} />
          </div>
          <div>
            <label className="label-text">Sampai</label>
            <DateField value={to} onChange={setTo} />
          </div>
          <div className="flex gap-2 pt-2">
            <button
              type="button"
              onClick={() => setStep('home')}
              className="btn-secondary flex-1"
            >
              Kembali
            </button>
            <button type="submit" className="btn-primary flex-1" disabled={!from || !to}>
              Terapkan
            </button>
          </div>
        </form>
      )}
    </Modal>
  );
}

export function resolvePeriod(value) {
  if (!value) return { from: null, to: null, label: 'Semua Waktu' };
  const now = new Date();
  if (value.id === 'this-month') {
    const from = new Date(now.getFullYear(), now.getMonth(), 1);
    const to = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);
    return { from, to, label: 'Bulan Ini' };
  }
  if (value.id === 'last-30') {
    const to = new Date(now);
    to.setHours(23, 59, 59, 999);
    const from = new Date(to);
    from.setDate(from.getDate() - 29);
    from.setHours(0, 0, 0, 0);
    return { from, to, label: '30 Hari Terakhir' };
  }
  if (value.id === 'last-90') {
    const to = new Date(now);
    to.setHours(23, 59, 59, 999);
    const from = new Date(to);
    from.setDate(from.getDate() - 89);
    from.setHours(0, 0, 0, 0);
    return { from, to, label: '90 Hari Terakhir' };
  }
  if (value.id === 'this-year') {
    const from = new Date(now.getFullYear(), 0, 1);
    const to = new Date(now.getFullYear(), 11, 31, 23, 59, 59, 999);
    return { from, to, label: 'Tahun Ini' };
  }
  if (value.id === 'custom' && value.from && value.to) {
    const from = new Date(value.from);
    from.setHours(0, 0, 0, 0);
    const to = new Date(value.to);
    to.setHours(23, 59, 59, 999);
    return { from, to, label: 'Custom' };
  }
  return { from: null, to: null, label: 'Semua Waktu' };
}
