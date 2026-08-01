import { useEffect, useMemo, useState } from 'react';
import Modal from '../common/Modal';
import CurrencyInput from '../common/CurrencyInput';
import DateField from '../common/DateField';
import { formatDateInput, fromDateInput } from '../../utils/formatDate';
import { formatCurrency } from '../../utils/formatCurrency';
import { projectSummary } from '../../utils/projectSchedule';

// Early full settlement (pelunasan dipercepat). The default amount follows the
// owner's rule: modal keluar (disbursed) + the current month's interest. All
// remaining unpaid scheduled months are dropped once this is confirmed.
export default function SettleProjectSheet({ open, onClose, project, accounts, onConfirm }) {
  const [amount, setAmount] = useState(0);
  const [accountId, setAccountId] = useState('');
  const [date, setDate] = useState(formatDateInput(new Date()));
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const { disbursed, currentInterest, defaultAmount, unpaidRemaining } = useMemo(() => {
    if (!project) return { disbursed: 0, currentInterest: 0, defaultAmount: 0, unpaidRemaining: 0 };
    const disb = Number(project.disbursedAmount) || 0;
    const principal = Number(project.principalAmount) || 0;
    const payments = project.payments || [];
    const nextInterest = payments.find(
      (p) => p.receivedAmount == null && p.type === 'interest'
    );
    // Current month's interest; fall back to the interest deducted upfront
    // (principal − disbursed) when only the final principal is left unpaid.
    const curInt = nextInterest
      ? Number(nextInterest.expectedAmount) || 0
      : Math.max(0, principal - disb);
    const unpaid = payments.filter((p) => p.receivedAmount == null).length;
    return {
      disbursed: disb,
      currentInterest: curInt,
      defaultAmount: disb + curInt,
      unpaidRemaining: unpaid,
    };
  }, [project]);

  useEffect(() => {
    if (open && project) {
      setAmount(defaultAmount);
      setAccountId(project.sourceAccountId || accounts?.[0]?.id || '');
      setDate(formatDateInput(new Date()));
      setError('');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, project]);

  if (!project) return null;
  const summary = projectSummary(project);
  const profitAfter = summary.receivedSoFar + (Number(amount) || 0) - (Number(project.disbursedAmount) || 0);

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    const amt = Number(amount) || 0;
    if (amt <= 0) {
      setError('Jumlah pelunasan harus lebih dari 0');
      return;
    }
    if (!accountId) {
      setError('Pilih rekening tujuan');
      return;
    }
    setSubmitting(true);
    try {
      await onConfirm({ amount: amt, accountId, date: fromDateInput(date) });
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
      title="Tutup sebagai Pelunasan"
      subtitle="Proyek dilunasi lebih cepat. Jadwal bulan berikutnya otomatis dihapus."
      footer={
        <button type="submit" form="settle-form" className="btn-primary w-full" disabled={submitting}>
          {submitting ? 'Memproses…' : 'Konfirmasi Pelunasan'}
        </button>
      }
    >
      <form id="settle-form" onSubmit={handleSubmit} className="space-y-4">
        <div className="bg-cream-deep rounded-xl p-3 text-[13px] text-ink-soft space-y-1">
          <div className="flex justify-between">
            <span>Modal keluar</span>
            <span className="font-num font-semibold text-ink" style={{ fontVariantNumeric: 'tabular-nums' }}>
              {formatCurrency(disbursed)}
            </span>
          </div>
          <div className="flex justify-between">
            <span>Bunga bulan ini</span>
            <span className="font-num font-semibold text-ink" style={{ fontVariantNumeric: 'tabular-nums' }}>
              {formatCurrency(currentInterest)}
            </span>
          </div>
          <div className="flex justify-between border-t border-line pt-1 mt-1">
            <span className="font-semibold text-ink">Saran pelunasan</span>
            <span className="font-num font-bold text-indigo" style={{ fontVariantNumeric: 'tabular-nums' }}>
              {formatCurrency(defaultAmount)}
            </span>
          </div>
        </div>

        <div>
          <label className="label-text">Jumlah Diterima (bisa diedit)</label>
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
          <label className="label-text">Tanggal Pelunasan</label>
          <DateField value={date} onChange={setDate} />
        </div>

        {unpaidRemaining > 1 && (
          <p className="text-[12px] text-ink-mute leading-snug">
            {unpaidRemaining - 1} jadwal pembayaran berikutnya akan dihapus dan tidak lagi dihitung
            sebagai proyeksi pendapatan.
          </p>
        )}

        <div className="rounded-xl p-3 text-[13px] bg-daun-soft border border-daun/30 text-daun">
          <div className="flex justify-between">
            <span className="font-semibold">Laba total setelah pelunasan</span>
            <span className="font-num font-bold" style={{ fontVariantNumeric: 'tabular-nums' }}>
              {profitAfter >= 0 ? '+' : ''}{formatCurrency(profitAfter)}
            </span>
          </div>
        </div>

        {error && <p className="text-[13px] text-terra">{error}</p>}
      </form>
    </Modal>
  );
}
