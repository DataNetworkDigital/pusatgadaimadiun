import { useEffect, useState } from 'react';
import Modal from '../common/Modal';
import CurrencyInput from '../common/CurrencyInput';

export default function ReminderForm({ open, onClose, onSubmit, initial }) {
  const isEdit = !!initial;
  const [type, setType] = useState(initial?.type || 'expense');
  const [title, setTitle] = useState(initial?.title || '');
  const [dayOfMonth, setDayOfMonth] = useState(initial?.dayOfMonth || 1);
  const [amount, setAmount] = useState(initial?.amount || 0);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (open) {
      setType(initial?.type || 'expense');
      setTitle(initial?.title || '');
      setDayOfMonth(initial?.dayOfMonth || 1);
      setAmount(initial?.amount || 0);
      setError('');
    }
  }, [open, initial]);

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    if (!title.trim()) { setError('Judul wajib diisi'); return; }
    const day = parseInt(dayOfMonth, 10);
    if (isNaN(day) || day < 1 || day > 31) { setError('Tanggal harus 1-31'); return; }
    setSubmitting(true);
    try {
      await onSubmit({ type, title: title.trim(), dayOfMonth: day, amount: amount || null });
      onClose();
    } catch (e) {
      setError(e.message || 'Gagal');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={isEdit ? 'Edit Pembayaran Berulang' : 'Tambah Pembayaran Berulang'}
      footer={
        <button type="submit" form="rem-form" className="btn-primary w-full" disabled={submitting}>
          {submitting ? 'Menyimpan...' : 'Simpan'}
        </button>
      }
    >
      <form id="rem-form" onSubmit={handleSubmit} className="space-y-4">
        <div className="grid grid-cols-2 gap-2 bg-gray-100 p-1 rounded-lg">
          <button
            type="button"
            onClick={() => setType('expense')}
            className={
              'py-2 rounded-md text-sm font-semibold transition ' +
              (type === 'expense' ? 'bg-expense text-white' : 'text-gray-600')
            }
          >
            Pengeluaran
          </button>
          <button
            type="button"
            onClick={() => setType('income')}
            className={
              'py-2 rounded-md text-sm font-semibold transition ' +
              (type === 'income' ? 'bg-income text-white' : 'text-gray-600')
            }
          >
            Pemasukan
          </button>
        </div>
        <div>
          <label className="label-text">Judul</label>
          <input type="text" className="input-field" value={title} onChange={(e) => setTitle(e.target.value)} placeholder={type === 'income' ? 'cth: Gaji, Sewa Kontrakan' : 'cth: Bayar Kos, Listrik, WiFi'} />
        </div>
        <div>
          <label className="label-text">Tanggal Setiap Bulan (1-31)</label>
          <input type="number" min="1" max="31" className="input-field" value={dayOfMonth} onChange={(e) => setDayOfMonth(e.target.value)} />
        </div>
        <div>
          <label className="label-text">Jumlah (opsional)</label>
          <CurrencyInput value={amount} onChange={setAmount} />
        </div>
        {error && <p className="text-sm text-expense">{error}</p>}
      </form>
    </Modal>
  );
}
