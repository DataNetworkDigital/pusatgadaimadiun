import { useMemo, useState } from 'react';
import Modal from '../common/Modal';
import CurrencyInput from '../common/CurrencyInput';
import { formatCurrency } from '../../utils/formatCurrency';
import { DEFAULT_ANAK_FEE_PCT, anakSummary, cleanAnak } from '../../utils/anakShare';

const pct = (ratio) => `${Math.round(ratio * 1000) / 10}%`;

// Diambil anak (spec 2026-09-29): which part of the project is the son's, and
// Mas Hena's fee on it. The preview shows what he gets each month and when the
// principal comes back.
export default function AnakSheet({ open, onClose, project, onSubmit }) {
  if (!open || !project) return null;
  return <AnakForm key={project.id} onClose={onClose} project={project} onSubmit={onSubmit} />;
}

function AnakForm({ onClose, project, onSubmit }) {
  const [on, setOn] = useState(!!project.anak);
  const [amount, setAmount] = useState(Number(project.anak?.amount) || Number(project.principalAmount) || 0);
  const [feePct, setFeePct] = useState(String(project.anak?.feePct ?? DEFAULT_ANAK_FEE_PCT));
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [seenWriteId] = useState(() => project.lastWriteId ?? null);

  const checked = useMemo(() => {
    if (!on) return { anak: null };
    try {
      return { anak: cleanAnak(project, { amount, feePct: feePct === '' ? NaN : Number(feePct) }) };
    } catch (e) {
      return { error: e.message };
    }
  }, [project, on, amount, feePct]);
  const summary = checked.anak ? anakSummary(project, checked.anak) : null;
  const unchanged = JSON.stringify(checked.anak ?? null) === JSON.stringify(project.anak ?? null);

  async function submit() {
    setError('');
    setSubmitting(true);
    try {
      await onSubmit({ anak: checked.anak, seenWriteId });
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
      title="Diambil anak"
      subtitle={project.name}
      footer={
        <button
          type="button"
          className="btn-primary w-full"
          disabled={submitting || !!checked.error || unchanged}
          onClick={submit}
        >
          {submitting ? 'Menyimpan…' : 'Simpan'}
        </button>
      }
    >
      <div className="space-y-4">
        <label className="flex items-center justify-between gap-3 rounded-xl border border-line bg-paper p-3">
          <span className="text-[14px] font-semibold text-ink">Project ini diambil anak</span>
          <input
            type="checkbox"
            className="w-5 h-5 accent-anak"
            checked={on}
            onChange={(e) => setOn(e.target.checked)}
          />
        </label>
        {on && (
          <>
            <div>
              <label className="label-text">Bagian anak (dari nilai project {formatCurrency(project.principalAmount)})</label>
              <CurrencyInput value={amount} onChange={setAmount} />
            </div>
            <div>
              <label className="label-text">Fee Mas Hena (% per bulan dari bagian anak)</label>
              <input
                type="number"
                step="0.1"
                min="0"
                className="input-field"
                value={feePct}
                onChange={(e) => setFeePct(e.target.value)}
              />
            </div>
          </>
        )}
        {checked.error && <p className="text-[13px] text-terra">{checked.error}</p>}
        {summary && (
          <div className="bg-anak-soft rounded-xl p-3 text-[13px] text-ink-soft space-y-1 leading-snug">
            <div>Bagian anak {pct(summary.ratio)} dari nilai project.</div>
            <div>
              Bagi hasil ke anak {formatCurrency(summary.first.net)} per bulan, setelah fee Mas Hena{' '}
              {formatCurrency(summary.first.fee)}
              {summary.later ? `. Mulai bulan 4: ${formatCurrency(summary.later.net)}` : ''}.
            </div>
            <div>Saat pelunasan, pokok ke anak {formatCurrency(summary.pokok)}.</div>
          </div>
        )}
        {!on && project.anak && (
          <p className="text-[13px] text-ink-soft">Tanda diambil anak akan dilepas dari project ini.</p>
        )}
        {error && <p className="text-[13px] text-terra">{error}</p>}
      </div>
    </Modal>
  );
}
