import { useMemo, useState } from 'react';
import Modal from '../common/Modal';
import CurrencyInput from '../common/CurrencyInput';
import DateField from '../common/DateField';
import { formatDateInput, fromDateInput, formatDate } from '../../utils/formatDate';
import { formatCurrency } from '../../utils/formatCurrency';
import { allocateReceipt, openRows } from '../../utils/allocation';
import { rowRemaining } from '../../utils/paymentStatus';

// Receiving money. The owner types what arrived; the sheet shows which tagihan
// it will close before he commits, so a split payment is never a surprise.
export default function ReceiptSheet({ open, onClose, project, accounts, defaultNo, onSubmit }) {
  if (!open || !project) return null;
  // The form mounts fresh each time the sheet opens, and only then. Resetting
  // on every change to `project` would wipe what the owner is typing whenever
  // a snapshot arrives, including one for a different project.
  return (
    <ReceiptForm
      key={defaultNo ?? 'oldest'}
      onClose={onClose}
      project={project}
      accounts={accounts}
      defaultNo={defaultNo}
      onSubmit={onSubmit}
    />
  );
}

function initialTarget(project, defaultNo) {
  const rows = openRows(project);
  return (defaultNo != null ? rows.find((r) => r.no === defaultNo) : rows[0]) || null;
}

// Money comes back to the account the modal left from, as it always did
// before this sheet existed; the owner's habit of tapping Simpan relies on it.
function defaultAccount(project, accounts) {
  const list = accounts || [];
  if (project.sourceAccountId && list.some((a) => a.id === project.sourceAccountId)) {
    return project.sourceAccountId;
  }
  return list[0]?.id || 'cash';
}

function ReceiptForm({ onClose, project, accounts, defaultNo, onSubmit }) {
  const [amount, setAmount] = useState(() => {
    const target = initialTarget(project, defaultNo);
    return target ? rowRemaining(project, target) : 0;
  });
  const [account, setAccount] = useState(() => defaultAccount(project, accounts));
  const [date, setDate] = useState(() => formatDateInput(new Date()));
  const [startNo, setStartNo] = useState(() => {
    const target = initialTarget(project, defaultNo);
    return target ? String(target.no) : '';
  });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const rows = useMemo(() => openRows(project), [project]);

  const preview = useMemo(
    () => allocateReceipt(project, amount, startNo ? Number(startNo) : null),
    [project, amount, startNo]
  );

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    if (!amount || amount <= 0) return setError('Jumlah harus lebih dari 0');
    // Another device may have paid the chosen tagihan while this sheet was
    // open; say so instead of reporting the whole amount as too much.
    if (startNo && !rows.some((r) => String(r.no) === startNo)) {
      return setError(`Tagihan bulan ${startNo} sudah lunas. Pilih tagihan lain.`);
    }
    if (preview.leftover > 0) {
      return setError(`Jumlah melebihi sisa tagihan sebesar ${formatCurrency(preview.leftover)}`);
    }
    setSubmitting(true);
    try {
      await onSubmit({
        amount: Number(amount),
        date: fromDateInput(date),
        account,
        startNo: startNo ? Number(startNo) : null,
      });
      onClose();
    } catch (err) {
      setError(err.message || 'Gagal menyimpan');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      title="Terima pembayaran"
      subtitle={project.name}
      footer={
        <button type="submit" form="receipt-form" className="btn-primary w-full" disabled={submitting}>
          {submitting ? 'Menyimpan…' : 'Simpan'}
        </button>
      }
    >
      <form id="receipt-form" onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="label-text">Jumlah diterima</label>
          <CurrencyInput value={amount} onChange={setAmount} />
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
          <label className="label-text">Untuk tagihan</label>
          <select className="input-field" value={startNo} onChange={(e) => setStartNo(e.target.value)}>
            {rows.map((r) => (
              <option key={r.no} value={r.no}>
                Bulan {r.no} · jatuh tempo {formatDate(r.dueDate, { short: true })} · sisa{' '}
                {formatCurrency(rowRemaining(project, r))}
              </option>
            ))}
          </select>
          <p className="text-[12px] text-ink-mute mt-1">
            Kelebihannya otomatis lanjut ke tagihan berikutnya.
          </p>
        </div>

        {preview.allocations.length > 0 && (
          <div className="rounded-xl border border-line bg-paper p-3 text-[13px]">
            <div className="font-semibold text-ink mb-1">Menutup tagihan:</div>
            {preview.allocations.map((a) => (
              <div key={a.no} className="flex justify-between text-ink-soft">
                <span>Bulan {a.no}</span>
                <span className="font-num">{formatCurrency(a.amount)}</span>
              </div>
            ))}
          </div>
        )}

        {error && <p className="text-[13px] text-terra">{error}</p>}
      </form>
    </Modal>
  );
}
