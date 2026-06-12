import { useEffect, useState } from 'react';
import Modal from '../common/Modal';
import CurrencyInput from '../common/CurrencyInput';
import DateField from '../common/DateField';
import { formatDateInput, fromDateInput } from '../../utils/formatDate';
import { calcMonthlyInterest } from '../../utils/projectSchedule';
import { formatCurrency } from '../../utils/formatCurrency';

const DEFAULT_RETURN_PCT = 5.5;

// Disbursed auto-fills as the project value minus the monthly return %
// taken upfront, e.g. 100jt at 5% → (100% − 5%) × 100jt = 95jt.
function computeAutoDisbursed(principal, pct) {
  const p = Number(principal) || 0;
  const r = Number(pct) || 0;
  const v = Math.round(p * (1 - r / 100));
  return v > 0 ? v : 0;
}

export default function ProjectForm({ open, onClose, onSubmit, accounts, initial }) {
  const isEdit = !!initial;
  const hasReceived = isEdit && (initial.payments || []).some((p) => p.receivedAmount != null);
  const capitalLocked = hasReceived;

  const [name, setName] = useState('');
  const [ownerName, setOwnerName] = useState('');
  const [contractNumber, setContractNumber] = useState('');
  const [description, setDescription] = useState('');
  const [principalAmount, setPrincipalAmount] = useState(0);
  const [disbursedAmount, setDisbursedAmount] = useState(0);
  const [monthlyReturnPct, setMonthlyReturnPct] = useState('');
  const [durationMonths, setDurationMonths] = useState(6);
  const [startDate, setStartDate] = useState(formatDateInput(new Date()));
  const [paymentDayOfMonth, setPaymentDayOfMonth] = useState(new Date().getDate());
  const [sourceAccountId, setSourceAccountId] = useState('');
  const [proofUrl, setProofUrl] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  // Tracks whether the user has manually overridden the auto-computed
  // disbursed amount. Once touched, principal/return changes stop overwriting it.
  const [disbursedTouched, setDisbursedTouched] = useState(false);

  useEffect(() => {
    if (open) {
      if (isEdit) {
        const start = initial.startDate?.toDate ? initial.startDate.toDate() : (initial.startDate || new Date());
        setName(initial.name || '');
        setOwnerName(initial.ownerName || '');
        setContractNumber(initial.contractNumber || '');
        setDescription(initial.description || '');
        setPrincipalAmount(initial.principalAmount || 0);
        setDisbursedAmount(initial.disbursedAmount || 0);
        setMonthlyReturnPct(initial.monthlyReturnPct != null ? String(initial.monthlyReturnPct) : '');
        setDurationMonths(initial.durationMonths || 6);
        setStartDate(formatDateInput(start));
        setPaymentDayOfMonth(initial.paymentDayOfMonth || start.getDate());
        setSourceAccountId(initial.sourceAccountId || accounts?.[0]?.id || '');
        setProofUrl(initial.proofUrl || '');
        setDisbursedTouched(true); // keep the saved disbursed value as-is
      } else {
        setName('');
        setOwnerName('');
        setContractNumber('');
        setDescription('');
        setPrincipalAmount(0);
        setDisbursedAmount(0);
        setMonthlyReturnPct('');
        setDurationMonths(6);
        const today = new Date();
        setStartDate(formatDateInput(today));
        setPaymentDayOfMonth(today.getDate());
        setSourceAccountId(accounts?.[0]?.id || '');
        setProofUrl('');
        setDisbursedTouched(false); // allow auto-fill for a fresh project
      }
      setError('');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, initial]);

  const effectiveReturnPct = monthlyReturnPct === '' || monthlyReturnPct == null
    ? DEFAULT_RETURN_PCT
    : Number(monthlyReturnPct);
  const interestPerMonth = calcMonthlyInterest(principalAmount || 0, effectiveReturnPct);
  // Final month is the pelunasan (principal only), so interest accrues for duration − 1 months.
  const interestMonths = Math.max(0, (Number(durationMonths) || 0) - 1);
  const totalReturn = interestPerMonth * interestMonths;
  const upfrontDiscount = (Number(principalAmount) || 0) - (Number(disbursedAmount) || 0);

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    if (!name.trim()) {
      setError('Nama project wajib diisi');
      return;
    }
    if (!principalAmount || principalAmount <= 0) {
      setError('Nilai project harus lebih dari 0');
      return;
    }
    if (!disbursedAmount || disbursedAmount <= 0) {
      setError('Modal keluar harus lebih dari 0');
      return;
    }
    if (!durationMonths || durationMonths <= 0) {
      setError('Durasi minimal 1 bulan');
      return;
    }
    if (!sourceAccountId) {
      setError('Pilih rekening sumber');
      return;
    }
    const day = parseInt(paymentDayOfMonth, 10);
    if (!day || day < 1 || day > 31) {
      setError('Tanggal pembayaran harus 1-31');
      return;
    }
    setSubmitting(true);
    try {
      await onSubmit({
        name: name.trim(),
        ownerName: ownerName.trim() || null,
        contractNumber: contractNumber.trim() || null,
        description,
        principalAmount,
        disbursedAmount,
        monthlyReturnPct: effectiveReturnPct,
        durationMonths: Number(durationMonths),
        startDate: fromDateInput(startDate),
        paymentDayOfMonth: day,
        sourceAccountId,
        proofUrl: proofUrl.trim() || null,
        proofFileName: null,
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
      open={open}
      onClose={onClose}
      title={isEdit ? 'Edit Project' : 'Tambah Project'}
      subtitle={isEdit ? 'Update detail project (jadwal pembayaran disesuaikan otomatis)' : 'Catat investasi project bisnis dengan jadwal pembayaran terstruktur'}
      footer={
        <button
          type="submit"
          form="project-form"
          className="btn-primary w-full"
          disabled={submitting}
        >
          {submitting ? 'Menyimpan…' : (isEdit ? 'Simpan Perubahan' : 'Simpan Project')}
        </button>
      }
    >
      <form id="project-form" onSubmit={handleSubmit} className="space-y-4">
        {capitalLocked && (
          <div className="bg-emas-soft border border-emas/30 rounded-xl p-3 text-[12px] text-ink-soft leading-snug">
            ⚠️ Sudah ada pembayaran masuk — modal, rekening sumber, dan tanggal mulai tidak bisa diubah. Durasi, return %, dan tanggal pembayaran masih bisa disesuaikan (jadwal pembayaran yang belum diterima akan dihitung ulang).
          </div>
        )}
        <div>
          <label className="label-text">Nama Project</label>
          <input
            type="text"
            className="input-field"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="cth: Toko Sembako Pak Budi"
          />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="label-text">Pemilik Project (opsional)</label>
            <input
              type="text"
              className="input-field"
              value={ownerName}
              onChange={(e) => setOwnerName(e.target.value)}
              placeholder="cth: Pak Budi"
            />
          </div>
          <div>
            <label className="label-text">No. Kontrak (opsional)</label>
            <input
              type="text"
              className="input-field"
              value={contractNumber}
              onChange={(e) => setContractNumber(e.target.value)}
              placeholder="cth: SP/2026/04/0123"
            />
          </div>
        </div>

        <div>
          <label className="label-text">Nilai Project (basis return)</label>
          <CurrencyInput
            value={principalAmount}
            onChange={(v) => {
              setPrincipalAmount(v);
              if (!disbursedTouched) setDisbursedAmount(computeAutoDisbursed(v, effectiveReturnPct));
            }}
            disabled={capitalLocked}
          />
        </div>

        <div>
          <label className="label-text">Modal Keluar dari Rekening</label>
          <CurrencyInput
            value={disbursedAmount}
            onChange={(v) => {
              setDisbursedAmount(v);
              setDisbursedTouched(true);
            }}
            disabled={capitalLocked}
          />
          {!capitalLocked && (
            <p className="text-[11px] text-ink-mute mt-1">
              Terisi otomatis: Nilai project − return {effectiveReturnPct}%. Bisa diubah manual.
            </p>
          )}
          {upfrontDiscount > 0 && (
            <p className="text-[12px] text-daun mt-1">
              Potongan di muka: {formatCurrency(upfrontDiscount)}
            </p>
          )}
          {upfrontDiscount < 0 && (
            <p className="text-[12px] text-terra mt-1">
              Modal keluar lebih besar dari nilai project (selisih{' '}
              {formatCurrency(Math.abs(upfrontDiscount))}).
            </p>
          )}
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label-text">Return / Bulan (%)</label>
            <input
              type="number"
              step="0.1"
              min="0"
              className="input-field"
              value={monthlyReturnPct}
              onChange={(e) => {
                const raw = e.target.value;
                setMonthlyReturnPct(raw);
                if (!disbursedTouched) {
                  const pct = raw === '' ? DEFAULT_RETURN_PCT : Number(raw);
                  setDisbursedAmount(computeAutoDisbursed(principalAmount, pct));
                }
              }}
              placeholder={`${DEFAULT_RETURN_PCT}`}
            />
          </div>
          <div>
            <label className="label-text">Durasi (bulan)</label>
            <input
              type="number"
              min="1"
              max="120"
              className="input-field"
              value={durationMonths}
              onChange={(e) => setDurationMonths(e.target.value)}
            />
          </div>
        </div>

        <div className="bg-indigo-soft border border-indigo/20 rounded-xl p-3 text-[13px] text-indigo space-y-1">
          <div className="flex justify-between">
            <span>Return / bulan</span>
            <span
              className="font-num font-semibold"
              style={{ fontVariantNumeric: 'tabular-nums' }}
            >
              {formatCurrency(interestPerMonth)}
            </span>
          </div>
          <div className="flex justify-between">
            <span>Total return ({interestMonths}× bulan)</span>
            <span
              className="font-num font-semibold"
              style={{ fontVariantNumeric: 'tabular-nums' }}
            >
              {formatCurrency(totalReturn)}
            </span>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label-text">Tanggal Mulai</label>
            <DateField
              value={startDate}
              disabled={capitalLocked}
              onChange={(v) => {
                setStartDate(v);
                // Payment day auto-follows the start date's day-of-month
                // (still manually editable afterward).
                const day = parseInt(v.slice(8, 10), 10);
                if (day >= 1 && day <= 31) setPaymentDayOfMonth(day);
              }}
            />
          </div>
          <div>
            <label className="label-text">Tanggal Pembayaran</label>
            <input
              type="number"
              min="1"
              max="31"
              className="input-field"
              value={paymentDayOfMonth}
              onChange={(e) => setPaymentDayOfMonth(e.target.value)}
            />
          </div>
        </div>

        <div>
          <label className="label-text">Rekening Sumber Pendanaan</label>
          <select
            className="input-field"
            value={sourceAccountId}
            onChange={(e) => setSourceAccountId(e.target.value)}
            required
            disabled={capitalLocked}
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
          <label className="label-text">Catatan (opsional)</label>
          <textarea
            className="input-field !h-auto"
            rows={2}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="cth: Pinjaman modal usaha 6 bulan ke Pak Budi"
          />
        </div>

        <div>
          <label className="label-text">Link Bukti / Kontrak (opsional)</label>
          <input
            type="url"
            className="input-field"
            value={proofUrl}
            onChange={(e) => setProofUrl(e.target.value)}
            placeholder="https://…"
          />
          <p className="text-[11px] text-ink-mute mt-1.5 leading-snug">
            Upload dokumen ke Google Drive / Dropbox / OneDrive, lalu paste link-nya di sini.
          </p>
        </div>

        {accounts?.length === 0 && (
          <p className="text-[13px] text-terra bg-terra-soft border border-terra/30 rounded-xl p-3">
            Belum ada rekening. Tambahkan rekening dulu sebelum buat project.
          </p>
        )}
        {error && <p className="text-[13px] text-terra">{error}</p>}
      </form>
    </Modal>
  );
}
