import { useMemo, useState } from 'react';
import Modal from '../common/Modal';
import CurrencyInput from '../common/CurrencyInput';
import DateField from '../common/DateField';
import { formatDate, formatDateInput, fromDateInput } from '../../utils/formatDate';
import { formatCurrency } from '../../utils/formatCurrency';
import { applyPrincipalPayment, defaultStepMonth, principalPaymentRules } from '../../utils/principalPayment';

// Money comes back to the account the modal left from by default, as in
// Terima pembayaran.
function defaultAccount(project, accounts) {
  const list = accounts || [];
  if (project.sourceAccountId && list.some((a) => a.id === project.sourceAccountId)) {
    return project.sourceAccountId;
  }
  return list[0]?.id || 'cash';
}

// Pelunasan bertahap (spec 2026-09-28 §5): part of the principal paid early.
// The owner sees the bagi hasil that change and what the pelunasan still asks
// before saving.
export default function PrincipalPaymentSheet({ open, onClose, project, accounts, onSubmit }) {
  if (!open || !project) return null;
  return <PrincipalForm key={project.id} onClose={onClose} project={project} accounts={accounts} onSubmit={onSubmit} />;
}

function PrincipalForm({ onClose, project, accounts, onSubmit }) {
  const rules = principalPaymentRules(project);
  const [amount, setAmount] = useState(0);
  const [account, setAccount] = useState(() => defaultAccount(project, accounts));
  const [date, setDate] = useState(() => formatDateInput(new Date()));
  const [fromNo, setFromNo] = useState(() => {
    const no = defaultStepMonth(rules.months, new Date());
    return no == null ? '' : String(no);
  });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const principal = Number(project.principalAmount) || 0;
  const pct = principal > 0 ? Math.round((Number(amount) / principal) * 1000) / 10 : 0;
  const preview = useMemo(() => {
    if (!(Number(amount) > 0)) return null;
    try {
      return applyPrincipalPayment(project, {
        amount,
        at: fromDateInput(date) || new Date(),
        accountId: 'preview',
        transactionId: 'preview',
        fromNo: fromNo === '' ? null : Number(fromNo),
      });
    } catch (e) {
      return { error: e.message };
    }
  }, [project, amount, date, fromNo]);
  const changed = (preview?.update?.payments || [])
    .map((r) => ({ row: r, before: (project.payments || []).find((b) => b.no === r.no) }))
    .filter(({ row, before }) => before && before.expectedAmount !== row.expectedAmount);

  async function submit() {
    setError('');
    setSubmitting(true);
    try {
      await onSubmit({
        amount: Number(amount),
        date: fromDateInput(date),
        account,
        fromNo: fromNo === '' ? null : Number(fromNo),
        seenWriteId: project.lastWriteId ?? null,
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
      open
      onClose={onClose}
      title="Bayar sebagian pokok"
      subtitle={project.name}
      footer={
        <button
          type="button"
          className="btn-primary w-full"
          disabled={submitting || !rules.ok || !preview || !!preview.error}
          onClick={submit}
        >
          {submitting ? 'Menyimpan…' : 'Simpan'}
        </button>
      }
    >
      {!rules.ok ? (
        <p className="text-[13px] text-ink-soft leading-snug">{rules.why}</p>
      ) : (
        <div className="space-y-4">
          <div className="bg-cream-deep rounded-xl p-3 text-[13px] text-ink-soft flex justify-between">
            <span>Sisa pelunasan sekarang</span>
            <span className="font-num font-semibold text-ink">{formatCurrency(rules.remaining)}</span>
          </div>
          <div>
            <label className="label-text">Jumlah pokok yang dibayar</label>
            <CurrencyInput value={amount} onChange={setAmount} />
            {Number(amount) > 0 && <p className="text-[12px] text-ink-mute mt-1">{pct}% dari nilai project</p>}
          </div>
          <div>
            <label className="label-text">Masuk ke</label>
            <select className="input-field" value={account} onChange={(e) => setAccount(e.target.value)}>
              <option value="cash">Tunai (Kas)</option>
              {accounts?.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name} ({formatCurrency(a.balance)})
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="label-text">Tanggal diterima</label>
            <DateField value={date} onChange={setDate} />
          </div>
          <div>
            <label className="label-text">Bagi hasil ikut pokok baru mulai</label>
            <select className="input-field" value={fromNo} onChange={(e) => setFromNo(e.target.value)}>
              {rules.months.map((r) => (
                <option key={r.no} value={r.no}>
                  Bulan {r.no} · jatuh tempo {formatDate(r.dueDate, { short: true })}
                </option>
              ))}
              <option value="">Tidak ada (bagi hasil tetap)</option>
            </select>
          </div>
          {preview?.error && <p className="text-[13px] text-terra leading-snug">{preview.error}</p>}
          {preview?.update && (
            <div className="bg-cream-deep rounded-xl p-3 text-[13px] text-ink-soft space-y-1.5">
              {changed.map(({ row, before }) => (
                <div key={row.no} className="flex justify-between gap-2">
                  <span>Bagi hasil bulan {row.no}</span>
                  <span className="font-num text-ink">
                    {formatCurrency(before.expectedAmount)} → {formatCurrency(row.expectedAmount)}
                  </span>
                </div>
              ))}
              <div className="flex justify-between gap-2">
                <span>Pelunasan tinggal</span>
                <span className="font-num font-semibold text-ink">
                  {formatCurrency(rules.remaining - Number(amount))}
                </span>
              </div>
            </div>
          )}
          {error && <p className="text-[13px] text-terra">{error}</p>}
        </div>
      )}
    </Modal>
  );
}
