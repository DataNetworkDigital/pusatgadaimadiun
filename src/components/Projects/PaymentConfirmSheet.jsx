import { useEffect, useState } from 'react';
import Modal from '../common/Modal';
import CurrencyInput from '../common/CurrencyInput';
import DateField from '../common/DateField';
import { formatDateInput, fromDateInput, formatDate, toDate } from '../../utils/formatDate';
import { formatCurrency } from '../../utils/formatCurrency';

export default function PaymentConfirmSheet({ open, onClose, project, payment, accounts, onConfirm }) {
  const isEdit = payment?.receivedAmount != null;
  const [accountId, setAccountId] = useState('');
  const [amount, setAmount] = useState(0);
  const [date, setDate] = useState(formatDateInput(new Date()));
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (open && payment) {
      if (payment.receivedAmount != null) {
        setAccountId(payment.accountId || project?.sourceAccountId || accounts?.[0]?.id || '');
        setAmount(payment.receivedAmount || 0);
        setDate(formatDateInput(payment.receivedDate || new Date()));
      } else {
        setAccountId(project?.sourceAccountId || accounts?.[0]?.id || '');
        setAmount(payment.expectedAmount || 0);
        setDate(formatDateInput(new Date()));
      }
      setError('');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, payment]);

  if (!payment || !project) return null;

  const dueDate = toDate(payment.dueDate);
  const isFinal = payment.type === 'final';

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    if (!amount || amount <= 0) {
      setError('Jumlah harus lebih dari 0');
      return;
    }
    if (!accountId) {
      setError('Pilih rekening tujuan');
      return;
    }
    setSubmitting(true);
    try {
      await onConfirm({ accountId, amount: Number(amount), date: fromDateInput(date) });
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
      title={isEdit ? 'Edit Pembayaran' : (isFinal ? 'Konfirmasi Pelunasan' : 'Konfirmasi Pembayaran')}
      subtitle={`Pembayaran ke-${payment.no} dari ${project.name}`}
      footer={
        <button
          type="submit"
          form="pay-form"
          className="btn-primary w-full"
          disabled={submitting}
        >
          {submitting ? 'Menyimpan…' : (isEdit ? 'Simpan Perubahan' : 'Konfirmasi Diterima')}
        </button>
      }
    >
      <form id="pay-form" onSubmit={handleSubmit} className="space-y-4">
        <div className="bg-indigo-soft border border-indigo/20 rounded-xl p-3 text-[13px] text-indigo space-y-1">
          <div className="flex justify-between">
            <span>Jatuh tempo</span>
            <span className="font-semibold">{dueDate ? formatDate(dueDate) : '—'}</span>
          </div>
          <div className="flex justify-between">
            <span>{isFinal ? 'Modal + return' : 'Return'} (estimasi)</span>
            <span
              className="font-num font-semibold"
              style={{ fontVariantNumeric: 'tabular-nums' }}
            >
              {formatCurrency(payment.expectedAmount)}
            </span>
          </div>
        </div>

        <div>
          <label className="label-text">Jumlah Diterima</label>
          <CurrencyInput value={amount} onChange={setAmount} />
        </div>

        <div>
          <label className="label-text">Rekening Tujuan</label>
          <select
            className="input-field"
            value={accountId}
            onChange={(e) => setAccountId(e.target.value)}
            required
          >
            <option value="">Pilih rekening</option>
            {accounts?.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name} ({formatCurrency(a.balance)})
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="label-text">Tanggal Diterima</label>
          <DateField value={date} onChange={setDate} />
        </div>

        {error && <p className="text-[13px] text-terra">{error}</p>}
      </form>
    </Modal>
  );
}
