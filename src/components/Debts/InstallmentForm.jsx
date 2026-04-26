import { useState, useEffect } from 'react';
import Modal from '../common/Modal';
import CurrencyInput from '../common/CurrencyInput';
import { formatCurrency } from '../../utils/formatCurrency';
import { useData } from '../../contexts/DataContext';

export default function InstallmentForm({ open, onClose, debt }) {
  const { accounts, payInstallment } = useData();
  const [amount, setAmount] = useState(0);
  const [accountId, setAccountId] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (open) {
      setAmount(0);
      setAccountId(accounts[0]?.id || '');
      setError('');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  if (!debt) return null;
  const action = debt.type === 'utang' ? 'Bayar Cicilan' : 'Terima Cicilan';

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    if (!amount || amount <= 0) { setError('Jumlah harus lebih dari 0'); return; }
    if (amount > debt.remainingAmount) { setError('Jumlah melebihi sisa'); return; }
    if (!accountId) { setError('Pilih rekening'); return; }
    setSubmitting(true);
    try {
      await payInstallment(debt.id, amount, accountId);
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
      title={action}
      footer={
        <button type="submit" form="install-form" className="btn-primary w-full" disabled={submitting}>
          {submitting ? 'Memproses...' : action}
        </button>
      }
    >
      <form id="install-form" onSubmit={handleSubmit} className="space-y-4">
        <div className="bg-gray-50 rounded-lg p-3 text-sm">
          <div className="text-gray-500">{debt.personName}</div>
          <div className="font-bold mt-1">Sisa: {formatCurrency(debt.remainingAmount)}</div>
          <div className="text-xs text-gray-500">dari total {formatCurrency(debt.totalAmount)}</div>
        </div>
        <div>
          <label className="label-text">Jumlah Cicilan</label>
          <CurrencyInput value={amount} onChange={setAmount} autoFocus />
          <button type="button" onClick={() => setAmount(debt.remainingAmount)} className="text-xs text-primary mt-1">Lunasi sisa</button>
        </div>
        <div>
          <label className="label-text">{debt.type === 'utang' ? 'Bayar dari Rekening' : 'Terima ke Rekening'}</label>
          <select className="input-field" value={accountId} onChange={(e) => setAccountId(e.target.value)} required>
            <option value="">Pilih rekening</option>
            {accounts.map((a) => <option key={a.id} value={a.id}>{a.name} ({formatCurrency(a.balance)})</option>)}
          </select>
        </div>
        {accounts.length === 0 && (
          <p className="text-sm text-warning bg-warning-bg p-3 rounded-lg">Belum ada rekening.</p>
        )}
        {error && <p className="text-sm text-expense">{error}</p>}
      </form>
    </Modal>
  );
}
