import { useState, useEffect } from 'react';
import Modal from '../common/Modal';
import CurrencyInput from '../common/CurrencyInput';
import { formatDateInput, fromDateInput } from '../../utils/formatDate';
import { useData } from '../../contexts/DataContext';

const TYPES = [
  { value: 'income', label: 'Pemasukan', color: 'income' },
  { value: 'expense', label: 'Pengeluaran', color: 'expense' },
  { value: 'transfer', label: 'Transfer', color: 'transfer' },
];

export default function TransactionForm({ open, onClose, initial, defaultType }) {
  const { accounts, addTransaction, updateTransaction } = useData();
  const isEdit = !!initial;

  const [type, setType] = useState(initial?.type || defaultType || 'expense');
  const [amount, setAmount] = useState(initial?.amount || 0);
  const [description, setDescription] = useState(initial?.description || '');
  const [fromAccount, setFromAccount] = useState(initial?.fromAccount || '');
  const [toAccount, setToAccount] = useState(initial?.toAccount || '');
  const [date, setDate] = useState(initial ? formatDateInput(initial.date) : formatDateInput(new Date()));
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (open) {
      setType(initial?.type || defaultType || 'expense');
      setAmount(initial?.amount || 0);
      setDescription(initial?.description || '');
      setFromAccount(initial?.fromAccount || '');
      setToAccount(initial?.toAccount || '');
      setDate(initial ? formatDateInput(initial.date) : formatDateInput(new Date()));
      setError('');
    }
  }, [open, initial, defaultType]);

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    if (!amount || amount <= 0) { setError('Jumlah harus lebih dari 0'); return; }
    if (type === 'income' && !toAccount) { setError('Pilih rekening tujuan'); return; }
    if (type === 'expense' && !fromAccount) { setError('Pilih rekening sumber'); return; }
    if (type === 'transfer') {
      if (!fromAccount || !toAccount) { setError('Pilih rekening asal dan tujuan'); return; }
      if (fromAccount === toAccount) { setError('Rekening asal dan tujuan harus berbeda'); return; }
    }
    setSubmitting(true);
    try {
      const payload = {
        type, amount, description,
        date: fromDateInput(date),
        fromAccount: type === 'income' ? null : fromAccount,
        toAccount: type === 'expense' ? null : toAccount,
      };
      if (isEdit) await updateTransaction(initial.id, payload);
      else await addTransaction(payload);
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
      title={isEdit ? 'Edit Transaksi' : 'Tambah Transaksi'}
      footer={
        <button type="submit" form="tx-form" className="btn-primary w-full" disabled={submitting}>
          {submitting ? 'Menyimpan...' : 'Simpan'}
        </button>
      }
    >
      <form id="tx-form" onSubmit={handleSubmit} className="space-y-4">
        <div className="grid grid-cols-3 gap-2 bg-gray-100 p-1 rounded-lg">
          {TYPES.map((t) => (
            <button
              type="button"
              key={t.value}
              onClick={() => setType(t.value)}
              className={
                'py-2 rounded-md text-sm font-semibold transition ' +
                (type === t.value
                  ? t.value === 'income' ? 'bg-income text-white' : t.value === 'expense' ? 'bg-expense text-white' : 'bg-transfer text-white'
                  : 'text-gray-600')
              }
            >
              {t.label}
            </button>
          ))}
        </div>

        <div>
          <label className="label-text">Jumlah</label>
          <CurrencyInput value={amount} onChange={setAmount} autoFocus />
        </div>

        {(type === 'expense' || type === 'transfer') && (
          <div>
            <label className="label-text">Dari Rekening</label>
            <select className="input-field" value={fromAccount} onChange={(e) => setFromAccount(e.target.value)} required>
              <option value="">Pilih rekening</option>
              {accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
            </select>
          </div>
        )}

        {(type === 'income' || type === 'transfer') && (
          <div>
            <label className="label-text">{type === 'transfer' ? 'Ke Rekening' : 'Ke Rekening'}</label>
            <select className="input-field" value={toAccount} onChange={(e) => setToAccount(e.target.value)} required>
              <option value="">Pilih rekening</option>
              {accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
            </select>
          </div>
        )}

        <div>
          <label className="label-text">Keterangan (opsional)</label>
          <input type="text" className="input-field" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="cth: Belanja bulanan" />
        </div>

        <div>
          <label className="label-text">Tanggal</label>
          <input type="date" className="input-field" value={date} onChange={(e) => setDate(e.target.value)} />
        </div>

        {accounts.length === 0 && (
          <p className="text-sm text-warning bg-warning-bg p-3 rounded-lg">
            Belum ada rekening. Tambahkan rekening terlebih dahulu di halaman Rekening.
          </p>
        )}

        {error && <p className="text-sm text-expense">{error}</p>}
      </form>
    </Modal>
  );
}
