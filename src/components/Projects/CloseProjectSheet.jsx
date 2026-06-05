import { useEffect, useState } from 'react';
import Modal from '../common/Modal';
import CurrencyInput from '../common/CurrencyInput';
import DateField from '../common/DateField';
import { formatDateInput, fromDateInput } from '../../utils/formatDate';
import { formatCurrency } from '../../utils/formatCurrency';
import { projectSummary } from '../../utils/projectSchedule';

export default function CloseProjectSheet({ open, onClose, project, accounts, onConfirm }) {
  const [recoveredAmount, setRecoveredAmount] = useState(0);
  const [accountId, setAccountId] = useState('');
  const [date, setDate] = useState(formatDateInput(new Date()));
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (open && project) {
      setRecoveredAmount(0);
      setAccountId(project.sourceAccountId || accounts?.[0]?.id || '');
      setDate(formatDateInput(new Date()));
      setError('');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, project]);

  if (!project) return null;
  const summary = projectSummary(project);
  const expectedLoss = Math.max(
    0,
    (project.disbursedAmount || 0) - summary.receivedSoFar - (Number(recoveredAmount) || 0)
  );

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    const recv = Number(recoveredAmount) || 0;
    if (recv > 0 && !accountId) {
      setError('Pilih rekening tujuan untuk pengembalian');
      return;
    }
    setSubmitting(true);
    try {
      await onConfirm({
        recoveredAmount: recv,
        accountId: recv > 0 ? accountId : null,
        date: fromDateInput(date),
      });
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
      title="Tutup Project (Macet)"
      subtitle="Catat sisa yang berhasil dikembalikan, sisanya dihitung sebagai kerugian."
      footer={
        <button
          type="submit"
          form="close-form"
          className="btn-danger w-full"
          disabled={submitting}
        >
          {submitting ? 'Memproses…' : 'Tutup sebagai Macet'}
        </button>
      }
    >
      <form id="close-form" onSubmit={handleSubmit} className="space-y-4">
        <div className="bg-cream-deep rounded-xl p-3 text-[13px] text-ink-soft space-y-1">
          <div className="flex justify-between">
            <span>Modal keluar</span>
            <span
              className="font-num font-semibold text-ink"
              style={{ fontVariantNumeric: 'tabular-nums' }}
            >
              {formatCurrency(project.disbursedAmount)}
            </span>
          </div>
          <div className="flex justify-between">
            <span>Sudah diterima</span>
            <span
              className="font-num font-semibold text-daun"
              style={{ fontVariantNumeric: 'tabular-nums' }}
            >
              {formatCurrency(summary.receivedSoFar)}
            </span>
          </div>
        </div>

        <div>
          <label className="label-text">Pengembalian Sisa (kosongkan jika 0)</label>
          <CurrencyInput value={recoveredAmount} onChange={setRecoveredAmount} />
        </div>

        {Number(recoveredAmount) > 0 && (
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
        )}

        <div>
          <label className="label-text">Tanggal Penutupan</label>
          <DateField value={date} onChange={setDate} />
        </div>

        <div
          className={`rounded-xl p-3 text-[13px] ${
            expectedLoss > 0
              ? 'bg-terra-soft border border-terra/30 text-terra'
              : 'bg-daun-soft border border-daun/30 text-daun'
          }`}
        >
          <div className="flex justify-between">
            <span className="font-semibold">
              {expectedLoss > 0 ? 'Kerugian akan tercatat' : 'Break-even (BEP)'}
            </span>
            <span
              className="font-num font-bold"
              style={{ fontVariantNumeric: 'tabular-nums' }}
            >
              {expectedLoss > 0 ? formatCurrency(expectedLoss) : 'Rp 0'}
            </span>
          </div>
        </div>

        {error && <p className="text-[13px] text-terra">{error}</p>}
      </form>
    </Modal>
  );
}
