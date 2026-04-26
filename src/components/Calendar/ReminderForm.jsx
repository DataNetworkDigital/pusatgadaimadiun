import { useEffect, useState } from 'react';
import Modal from '../common/Modal';
import CurrencyInput from '../common/CurrencyInput';

export default function ReminderForm({ open, onClose, onSubmit, initial }) {
  const isEdit = !!initial;
  const [title, setTitle] = useState(initial?.title || '');
  const [dayOfMonth, setDayOfMonth] = useState(initial?.dayOfMonth || 1);
  const [amount, setAmount] = useState(initial?.amount || 0);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (open) {
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
      await onSubmit({ title: title.trim(), dayOfMonth: day, amount: amount || null });
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
      title={isEdit ? 'Edit Reminder' : 'Tambah Reminder'}
      footer={
        <button type="submit" form="rem-form" className="btn-primary w-full" disabled={submitting}>
          {submitting ? 'Menyimpan...' : 'Simpan'}
        </button>
      }
    >
      <form id="rem-form" onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="label-text">Judul</label>
          <input type="text" className="input-field" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="cth: Bayar Listrik" />
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
