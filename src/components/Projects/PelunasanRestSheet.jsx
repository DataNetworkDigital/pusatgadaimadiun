import Modal from '../common/Modal';
import { formatCurrency } from '../../utils/formatCurrency';
import { extensionOptions } from '../../utils/extension';
import { rolloverSource } from '../../utils/rollover';

// What is left of a partly paid pelunasan (spec 7.2): keep asking for it,
// extend it, or turn it into a new contract. Each choice says what it does,
// and one that cannot be done says why.
export default function PelunasanRestSheet({ open, onClose, project, onExtend, onRollover }) {
  if (!open || !project) return null;
  const { sisa, remainder, final } = extensionOptions(project);
  const roll = rolloverSource(project);
  const card =
    'w-full text-left rounded-xl border border-line bg-paper p-3 active:bg-cream-deep disabled:opacity-60';
  return (
    <Modal open onClose={onClose} title={`Sisa pelunasan ${formatCurrency(remainder)}`} subtitle={project.name}>
      <div className="space-y-3">
        <p className="text-[14px] text-ink-soft">Mau diapakan?</p>
        <button type="button" className={card} onClick={onClose}>
          <div className="text-[14px] font-semibold text-ink">Ditagih menyusul</div>
          <div className="text-[12px] text-ink-soft mt-0.5 leading-snug">
            Sisa tetap di pelunasan{final ? ` bulan ${final.no}` : ''} dan terus ditagih.
          </div>
        </button>
        <button type="button" className={card} disabled={!sisa.ok} onClick={onExtend}>
          <div className="text-[14px] font-semibold text-ink">Diperpanjang</div>
          <div className="text-[12px] text-ink-soft mt-0.5 leading-snug">
            {sisa.ok ? 'Sisa jadi pokok baru: dia bayar bagi hasil tiap bulan, lalu melunasi sisanya.' : sisa.why}
          </div>
        </button>
        <button type="button" className={card} disabled={!roll.ok} onClick={onRollover}>
          <div className="text-[14px] font-semibold text-ink">Kontrak baru</div>
          <div className="text-[12px] text-ink-soft mt-0.5 leading-snug">
            {roll.ok
              ? 'Sisa jadi project baru (kontrak lanjutan) tanpa uang keluar. Project ini selesai.'
              : roll.why}
          </div>
        </button>
      </div>
    </Modal>
  );
}
