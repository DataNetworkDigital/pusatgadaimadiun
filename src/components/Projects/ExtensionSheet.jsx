import { useState } from 'react';
import Modal from '../common/Modal';
import { formatCurrency } from '../../utils/formatCurrency';
import { formatDate } from '../../utils/formatDate';
import { buildExtensionRows, extensionDue, extensionOptions } from '../../utils/extension';
import { resolveTiers } from '../../utils/projectSchedule';
import { rowCarriedIn } from '../../utils/paymentStatus';

// Mundur X bulan (kind 'mundur') or Diperpanjang (kind 'sisa'): how many
// months, at what rate, starting when. The owner sees every new tagihan and
// the new end before saving. No money moves.
export default function ExtensionSheet({ open, onClose, project, kind, onSubmit }) {
  if (!open || !project || !kind) return null;
  // Mounted fresh each time it opens, so a snapshot arriving never wipes
  // what the owner is typing.
  return <ExtensionForm key={kind} onClose={onClose} project={project} kind={kind} onSubmit={onSubmit} />;
}

function ExtensionForm({ onClose, project, kind, onSubmit }) {
  const [months, setMonths] = useState('1');
  const [rate, setRate] = useState(() => String(resolveTiers(project).tier2));
  const [startMode, setStartMode] = useState('today');
  const [note, setNote] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  // The version of the project this sheet showed; the save is refused if the
  // project has been written since.
  const seenWriteId = project.lastWriteId ?? null;

  const opts = extensionOptions(project);
  const check = kind === 'mundur' ? opts.mundur : opts.sisa;
  const final = opts.final;
  const baseAmount = kind === 'mundur'
    ? Number(final?.baseAmount ?? project.principalAmount) || 0
    : opts.remainder;
  const lastNo = Math.max(0, ...(project.payments || []).map((r) => Number(r.no) || 0));
  const carried = kind === 'mundur' && final ? rowCarriedIn(project, final) : 0;

  // The same rows the save will write, so the preview cannot disagree with it.
  let rows = [];
  let problem = check.ok ? '' : check.why;
  if (check.ok) {
    try {
      rows = buildExtensionRows({
        firstNo: kind === 'mundur' ? final.no : lastNo + 1,
        anchorDue: final.dueDate,
        paymentDay: project.paymentDayOfMonth,
        months: Number(months),
        ratePct: rate === '' ? NaN : Number(rate),
        baseAmount,
        startMode,
        extensionId: 'preview',
      });
    } catch (e) {
      problem = e.message;
    }
  }
  const last = rows[rows.length - 1];

  async function submit() {
    setError('');
    setSubmitting(true);
    try {
      await onSubmit({ kind, months: Number(months), ratePct: Number(rate), startMode, note: note.trim(), seenWriteId });
      onClose();
    } catch (e) {
      setError(e.message || 'Gagal menyimpan');
    } finally {
      setSubmitting(false);
    }
  }

  const startCard = (mode, label) => {
    const first = final ? extensionDue(final.dueDate, project.paymentDayOfMonth, mode) : null;
    const active = startMode === mode;
    return (
      <button
        type="button"
        onClick={() => setStartMode(mode)}
        className={`flex-1 text-left rounded-xl border p-3 ${active ? 'border-indigo bg-indigo-soft' : 'border-line bg-paper'}`}
      >
        <div className="text-[14px] font-semibold text-ink">{label}</div>
        <div className="text-[12px] text-ink-soft mt-0.5">Bagi hasil pertama {first ? formatDate(first) : '—'}</div>
      </button>
    );
  };

  return (
    <Modal
      open
      onClose={onClose}
      title={kind === 'mundur' ? 'Mundurkan pelunasan' : 'Perpanjang sisa pelunasan'}
      subtitle={project.name}
      footer={
        <button type="button" className="btn-primary w-full" disabled={submitting || !!problem} onClick={submit}>
          {submitting ? 'Menyimpan…' : 'Simpan'}
        </button>
      }
    >
      <div className="space-y-4">
        <div className="bg-cream-deep rounded-xl p-3 text-[13px] text-ink-soft leading-snug">
          {kind === 'mundur'
            ? `Pelunasan ${formatCurrency(baseAmount)} (jatuh tempo ${final ? formatDate(final.dueDate) : '—'}) dimundurkan. Selama itu dia membayar bagi hasil tiap bulan.`
            : `Sisa pelunasan ${formatCurrency(baseAmount)} diperpanjang. Selama itu dia membayar bagi hasil dari sisa itu tiap bulan, lalu melunasinya.`}
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label-text">Jumlah bulan</label>
            <input
              type="number"
              min="1"
              max="60"
              inputMode="numeric"
              className="input-field"
              value={months}
              onChange={(e) => setMonths(e.target.value)}
            />
          </div>
          <div>
            <label className="label-text">Bagi hasil / bulan (%)</label>
            <input
              type="number"
              step="0.1"
              min="0"
              className="input-field"
              value={rate}
              onChange={(e) => setRate(e.target.value)}
            />
          </div>
        </div>
        <div>
          <label className="label-text">Mulai</label>
          <div className="flex gap-2">
            {startCard('today', 'Mulai hari itu')}
            {startCard('nextMonth', 'Mulai bulan depan')}
          </div>
        </div>
        <div>
          <label className="label-text">Catatan (boleh kosong)</label>
          <input
            className="input-field"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Misalnya: panen mundur"
          />
        </div>
        {rows.length > 0 && (
          <div className="rounded-xl border border-line bg-paper p-3 text-[13px]">
            <div className="font-semibold text-ink mb-1">Jadwal baru:</div>
            {rows.map((r) => (
              <div key={r.no} className="flex justify-between gap-3 text-ink-soft">
                <span>
                  Bulan {r.no} · {formatDate(r.dueDate)} · {r.type === 'final' ? 'Pelunasan' : 'Bagi hasil'}
                </span>
                <span className="font-num">{formatCurrency(r.expectedAmount)}</span>
              </div>
            ))}
            {carried > 0 && (
              <p className="text-[12px] text-emas mt-1">
                Tunggakan {formatCurrency(carried)} yang digabung ke pelunasan ikut ditagih di bulan {final.no}.
              </p>
            )}
            <div className="flex justify-between border-t border-line-soft mt-2 pt-2 text-ink">
              <span>Selesai</span>
              <span className="font-semibold">{last ? formatDate(last.dueDate) : '—'}</span>
            </div>
          </div>
        )}
        {(error || problem) && <p className="text-[13px] text-terra">{error || problem}</p>}
      </div>
    </Modal>
  );
}
