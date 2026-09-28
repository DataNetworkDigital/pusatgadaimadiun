import { useMemo, useState } from 'react';
import Modal from '../common/Modal';
import CurrencyInput from '../common/CurrencyInput';
import { formatCurrency } from '../../utils/formatCurrency';
import { calcMonthlyInterest, resolveTiers } from '../../utils/projectSchedule';
import { applyCapitalCorrection, capitalCorrectionRules } from '../../utils/capitalCorrection';

const STATE_LABEL = { lunas: 'Lunas', kurang: 'Kurang', belum: 'Belum dibayar' };

// What the correction does to balances, one line per account, as the writer
// does it from the funding transaction (which says what the project says).
function moneyMoves(project, disbursed, accountId) {
  const deltas = new Map();
  const add = (id, amount) => {
    if (id) deltas.set(id, (deltas.get(id) || 0) + amount);
  };
  add(project.sourceAccountId, Number(project.disbursedAmount) || 0);
  add(accountId, -(Number(disbursed) || 0));
  return [...deltas].filter(([, amount]) => amount !== 0).map(([id, amount]) => ({ accountId: id, amount }));
}

// Koreksi modal (spec 2026-09-28 §4): for a Nilai Project, Modal Keluar or
// Rekening Sumber typed wrong after money has arrived. The owner sees every
// month and balance that changes before saving.
export default function CapitalCorrectionSheet({ open, onClose, project, accounts, onSubmit }) {
  if (!open || !project) return null;
  return <CorrectionForm key={project.id} onClose={onClose} project={project} accounts={accounts} onSubmit={onSubmit} />;
}

function CorrectionForm({ onClose, project, accounts, onSubmit }) {
  const [principal, setPrincipal] = useState(Number(project.principalAmount) || 0);
  const [disbursed, setDisbursed] = useState(Number(project.disbursedAmount) || 0);
  const [accountId, setAccountId] = useState(project.sourceAccountId || '');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  // The version of the project the preview was made from; the save is
  // refused if the project has been written since.
  const seenWriteId = project.lastWriteId ?? null;

  const rules = capitalCorrectionRules(project);
  const { tier1 } = resolveTiers(project);
  const usual = Math.max(0, principal - calcMonthlyInterest(principal, tier1));
  const preview = useMemo(() => {
    try {
      return applyCapitalCorrection(project, {
        principalAmount: principal,
        disbursedAmount: disbursed,
        sourceAccountId: accountId,
        at: new Date(),
      });
    } catch (e) {
      return { error: e.message };
    }
  }, [project, principal, disbursed, accountId]);
  const changedRows = (preview.rows || []).filter((r) => r.before !== r.after || r.stateBefore !== r.stateAfter);
  const nothing = !preview.error && Object.keys(preview.update || {}).length === 0;
  const money = preview.error ? [] : moneyMoves(project, disbursed, accountId);
  const accountName = (id) => accounts?.find((a) => a.id === id)?.name || 'rekening lama';

  async function submit() {
    setError('');
    setSubmitting(true);
    try {
      await onSubmit({ principalAmount: principal, disbursedAmount: disbursed, sourceAccountId: accountId, seenWriteId });
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
      title="Koreksi modal"
      subtitle={project.name}
      footer={
        <button
          type="button"
          className="btn-primary w-full"
          disabled={submitting || !rules.ok || !!preview.error || nothing}
          onClick={submit}
        >
          {submitting ? 'Menyimpan…' : 'Simpan koreksi'}
        </button>
      }
    >
      {!rules.ok ? (
        <p className="text-[13px] text-ink-soft leading-snug">{rules.why}</p>
      ) : (
        <div className="space-y-4">
          <p className="text-[12px] text-ink-mute leading-snug">
            Untuk angka yang salah ketik. Uang yang sudah masuk tidak berubah. Tagihan dihitung ulang dari angka yang
            benar.
          </p>
          <div>
            <label className="label-text">Nilai Project (basis return)</label>
            <CurrencyInput value={principal} onChange={setPrincipal} disabled={!rules.principal.ok} />
            {!rules.principal.ok && <p className="text-[12px] text-ink-mute mt-1 leading-snug">{rules.principal.why}</p>}
          </div>
          <div>
            <label className="label-text">Modal Keluar dari Rekening</label>
            <CurrencyInput value={disbursed} onChange={setDisbursed} />
            <p className="text-[11px] text-ink-mute mt-1">
              Biasanya: Nilai project − bagi hasil bulan 1 = {formatCurrency(usual)}
            </p>
          </div>
          <div>
            <label className="label-text">Rekening Sumber</label>
            <select className="input-field" value={accountId} onChange={(e) => setAccountId(e.target.value)}>
              {!accounts?.some((a) => a.id === accountId) && <option value="">Pilih rekening</option>}
              {(accounts || []).map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </select>
          </div>
          {preview.error ? (
            <p className="text-[13px] text-terra leading-snug">{preview.error}</p>
          ) : (
            !nothing && (
              <div className="bg-cream-deep rounded-xl p-3 text-[13px] text-ink-soft space-y-1.5">
                <div className="text-[12px] font-semibold text-ink">Yang berubah</div>
                {changedRows.map((r) => (
                  <div key={r.no} className="flex justify-between gap-2">
                    <span>{r.type === 'final' ? 'Pelunasan' : `Bulan ${r.no}`}</span>
                    <span className="font-num text-ink text-right">
                      {formatCurrency(r.before)} → {formatCurrency(r.after)}
                      {r.stateBefore !== r.stateAfter ? `, jadi ${STATE_LABEL[r.stateAfter]}` : ''}
                    </span>
                  </div>
                ))}
                {money.map((m) => (
                  <div key={m.accountId} className="flex justify-between gap-2">
                    <span>Saldo {accountName(m.accountId)}</span>
                    <span className="font-num text-ink">
                      {m.amount > 0 ? '+' : '−'}
                      {formatCurrency(Math.abs(m.amount))}
                    </span>
                  </div>
                ))}
              </div>
            )
          )}
          {error && <p className="text-[13px] text-terra">{error}</p>}
        </div>
      )}
    </Modal>
  );
}
