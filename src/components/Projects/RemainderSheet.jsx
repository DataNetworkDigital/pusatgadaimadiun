import { useState } from 'react';
import Modal from '../common/Modal';
import { formatCurrency } from '../../utils/formatCurrency';
import { formatDate } from '../../utils/formatDate';
import { remainderOptions } from '../../utils/remainderOps';

// What is left on a bagi hasil: moved onto the next tagihan, or forgiven. No
// money moves either way, and the owner reads exactly what happens first.
export default function RemainderSheet({ open, onClose, project, no, onCarry, onWaive }) {
  if (!open || !project || no == null) return null;
  return (
    <RemainderForm key={no} onClose={onClose} project={project} no={no} onCarry={onCarry} onWaive={onWaive} />
  );
}

function RemainderForm({ onClose, project, no, onCarry, onWaive }) {
  const options = remainderOptions(project, no);
  const [choice, setChoice] = useState(() => (options.carry ? 'carry' : 'waive'));
  const [note, setNote] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  // The version of the project this sheet showed; the save is refused if the
  // project has been written since.
  const seenWriteId = project.lastWriteId ?? null;
  const canSave = (choice === 'carry' && options.carry) || (choice === 'waive' && options.waive);

  async function submit() {
    setError('');
    setSubmitting(true);
    try {
      if (choice === 'carry') await onCarry({ seenWriteId });
      else await onWaive({ note: note.trim(), seenWriteId });
      onClose();
    } catch (e) {
      setError(e.message || 'Gagal menyimpan');
    } finally {
      setSubmitting(false);
    }
  }

  const card = (active) =>
    `w-full text-left rounded-xl border p-3 ${active ? 'border-indigo bg-indigo-soft' : 'border-line bg-paper'}`;

  return (
    <Modal
      open
      onClose={onClose}
      title={`Sisa tagihan bulan ${no}`}
      subtitle={project.name}
      footer={
        <button type="button" className="btn-primary w-full" disabled={submitting || !canSave} onClick={submit}>
          {submitting
            ? 'Menyimpan…'
            : choice === 'carry'
              ? `Gabung ke bulan ${options.target?.no}`
              : `Anggap lunas ${formatCurrency(options.amount)}`}
        </button>
      }
    >
      <div className="space-y-3">
        <div className="bg-cream-deep rounded-xl p-3 text-[13px] text-ink-soft flex justify-between">
          <span>Belum dibayar</span>
          <span className="font-num font-semibold text-ink">{formatCurrency(options.amount)}</span>
        </div>
        {options.carry && (
          <button type="button" className={card(choice === 'carry')} onClick={() => setChoice('carry')}>
            <div className="text-[14px] font-semibold text-ink">Gabung ke bulan {options.target.no}</div>
            <div className="text-[12px] text-ink-soft mt-0.5 leading-snug">
              {formatCurrency(options.amount)} ditambahkan ke tagihan bulan {options.target.no} (jatuh tempo{' '}
              {formatDate(options.target.dueDate, { short: true })}). Bulan {no} dianggap selesai.
            </div>
          </button>
        )}
        {options.waive && (
          <button type="button" className={card(choice === 'waive')} onClick={() => setChoice('waive')}>
            <div className="text-[14px] font-semibold text-ink">Anggap lunas</div>
            <div className="text-[12px] text-ink-soft mt-0.5 leading-snug">
              {formatCurrency(options.amount)} tidak ditagih lagi.
            </div>
          </button>
        )}
        {choice === 'waive' && options.waive && (
          <div>
            <label className="label-text">Catatan (boleh kosong)</label>
            <input
              className="input-field"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Misalnya: diskon karena selalu tepat waktu"
            />
          </div>
        )}
        {!options.carry && !options.waive && (
          <p className="text-[13px] text-ink-mute">Tagihan ini sudah tidak punya sisa yang bisa diatur.</p>
        )}
        {error && <p className="text-[13px] text-terra">{error}</p>}
      </div>
    </Modal>
  );
}
