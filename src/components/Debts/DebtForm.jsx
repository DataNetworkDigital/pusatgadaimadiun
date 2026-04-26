import { useState, useEffect } from 'react';
import Modal from '../common/Modal';
import CurrencyInput from '../common/CurrencyInput';
import { formatDateInput, fromDateInput } from '../../utils/formatDate';

export default function DebtForm({ open, onClose, onSubmit, initial, defaultType }) {
  const isEdit = !!initial;
  const [type, setType] = useState(initial?.type || defaultType || 'utang');
  const [personName, setPersonName] = useState(initial?.personName || '');
  const [totalAmount, setTotalAmount] = useState(initial?.totalAmount || 0);
  const [startDate, setStartDate] = useState(initial ? formatDateInput(initial.startDate) : formatDateInput(new Date()));
  const [dueDate, setDueDate] = useState(initial ? formatDateInput(initial.dueDate) : formatDateInput(new Date(Date.now() + 30 * 86400000)));
  const [description, setDescription] = useState(initial?.description || '');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (open) {
      setType(initial?.type || defaultType || 'utang');
      setPersonName(initial?.personName || '');
      setTotalAmount(initial?.totalAmount || 0);
      setStartDate(initial ? formatDateInput(initial.startDate) : formatDateInput(new Date()));
      setDueDate(initial ? formatDateInput(initial.dueDate) : formatDateInput(new Date(Date.now() + 30 * 86400000)));
      setDescription(initial?.description || '');
      setError('');
    }
  }, [open, initial, defaultType]);

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    if (!personName.trim()) { setError('Nama wajib diisi'); return; }
    if (!totalAmount || totalAmount <= 0) { setError('Jumlah harus lebih dari 0'); return; }
    setSubmitting(true);
    try {
      await onSubmit({
        type, personName: personName.trim(), totalAmount,
        startDate: fromDateInput(startDate),
        dueDate: fromDateInput(dueDate),
        description,
      });
      onClose();
    } catch (e) {
      setError(e.message || 'Gagal menyimpan');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={isEdit ? 'Edit' : 'Tambah Utang/Piutang'}
      footer={
        <button type="submit" form="debt-form" className="btn-primary w-full" disabled={submitting}>
          {submitting ? 'Menyimpan...' : 'Simpan'}
        </button>
      }
    >
      <form id="debt-form" onSubmit={handleSubmit} className="space-y-4">
        {!isEdit && (
          <div className="grid grid-cols-2 gap-2 bg-gray-100 p-1 rounded-lg">
            <button type="button" onClick={() => setType('utang')} className={'py-2 rounded-md text-sm font-semibold ' + (type === 'utang' ? 'bg-expense text-white' : 'text-gray-600')}>
              Utang Saya
            </button>
            <button type="button" onClick={() => setType('piutang')} className={'py-2 rounded-md text-sm font-semibold ' + (type === 'piutang' ? 'bg-income text-white' : 'text-gray-600')}>
              Piutang Saya
            </button>
          </div>
        )}
        <div>
          <label className="label-text">{type === 'utang' ? 'Nama Pemberi Utang' : 'Nama Penerima Pinjaman'}</label>
          <input type="text" className="input-field" value={personName} onChange={(e) => setPersonName(e.target.value)} placeholder="cth: Pak Budi" required />
        </div>
        <div>
          <label className="label-text">Jumlah Total</label>
          <CurrencyInput value={totalAmount} onChange={setTotalAmount} />
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="label-text">Tanggal Mulai</label>
            <input type="date" className="input-field" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
          </div>
          <div>
            <label className="label-text">Jatuh Tempo</label>
            <input type="date" className="input-field" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
          </div>
        </div>
        <div>
          <label className="label-text">Keterangan (opsional)</label>
          <input type="text" className="input-field" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="cth: Pinjam untuk modal usaha" />
        </div>
        {error && <p className="text-sm text-expense">{error}</p>}
      </form>
    </Modal>
  );
}
