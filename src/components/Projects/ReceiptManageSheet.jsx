import { useMemo, useState } from 'react';
import Modal from '../common/Modal';
import { useData } from '../../contexts/DataContext';
import CurrencyInput from '../common/CurrencyInput';
import DateField from '../common/DateField';
import { formatDate, formatDateInput, fromDateInput, toDate } from '../../utils/formatDate';
import { formatCurrency } from '../../utils/formatCurrency';
import {
  applyReceiptEdit,
  applyReceiptMove,
  correctionRules,
  moveTargets,
  receiptBlock,
} from '../../utils/receiptOps';

// One arrival of money: what it paid, and the three ways to correct it. Each
// correction previews what it will do with the same decision the save makes,
// so the owner sees the result before committing.
export default function ReceiptManageSheet({
  open,
  onClose,
  project,
  receiptId,
  accounts,
  onEdit,
  onMove,
  onCancel,
}) {
  const receipt = (project?.receipts || []).find((r) => r.id === receiptId);
  if (!open || !project || !receipt) return null;
  // Mounts fresh for each arrival opened, and only then, so a snapshot
  // arriving while the owner types does not reset what he entered.
  return (
    <ManageForm
      key={receipt.id}
      onClose={onClose}
      project={project}
      receipt={receipt}
      accounts={accounts}
      onEdit={onEdit}
      onMove={onMove}
      onCancel={onCancel}
    />
  );
}

function Allocations({ allocations }) {
  return (
    <div className="rounded-xl border border-line bg-paper p-3 text-[13px]">
      <div className="font-semibold text-ink mb-1">Menutup tagihan:</div>
      {allocations.map((a) => (
        <div key={a.no} className="flex justify-between text-ink-soft">
          <span>Bulan {a.no}</span>
          <span className="font-num">{formatCurrency(a.amount)}</span>
        </div>
      ))}
    </div>
  );
}

const TX_CHANGED =
  'Transaksi untuk pembayaran ini tidak ada atau sudah diubah di halaman Transaksi, jadi jumlahnya tidak bisa diedit. Batalkan pembayaran ini, lalu catat ulang.';

const TITLES = {
  menu: 'Uang masuk',
  edit: 'Edit uang masuk',
  move: 'Pindah ke bulan lain',
  cancel: 'Batalkan pembayaran?',
};

function ManageForm({ onClose, project, receipt, accounts, onEdit, onMove, onCancel }) {
  const { transactions, loading } = useData();
  const [step, setStep] = useState('menu');
  const [amount, setAmount] = useState(() => Number(receipt.amount) || 0);
  // An account deleted since is not offered back: the owner picks a real one.
  const [account, setAccount] = useState(() =>
    accounts?.some((a) => a.id === receipt.accountId) ? receipt.accountId : ''
  );
  const [date, setDate] = useState(() => formatDateInput(toDate(receipt.date) || new Date()));
  const [startNo, setStartNo] = useState(() => {
    const first = moveTargets(project, receipt.id)[0];
    return first ? String(first.no) : '';
  });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const rules = correctionRules(project);
  const block = receiptBlock(project, receipt);
  const targets = useMemo(() => moveTargets(project, receipt.id), [project, receipt.id]);
  const nameOf = (id) => accounts?.find((a) => a.id === id)?.name || null;
  const accountName = nameOf(receipt.accountId) || '—';

  // What the ledger holds for this arrival. Before this stage the Transaksi
  // page could change or delete a project transaction: an Edit is then
  // refused (DataContext says so too), and a cancel reverses what the
  // transaction holds, not what the receipt says.
  const tx = (transactions || []).find((t) => t.id === receipt.transactionId) || null;
  const txChanged =
    !loading &&
    (!tx ||
      (Number(tx.amount) || 0) !== (Number(receipt.amount) || 0) ||
      (tx.toAccount || null) !== (receipt.accountId || null));
  const notes = [block, txChanged && TX_CHANGED, rules.why].filter(Boolean);

  const editPreview = useMemo(() => {
    try {
      return applyReceiptEdit(project, receipt.id, { amount, at: new Date(), accountId: account });
    } catch (e) {
      return { error: e.message };
    }
  }, [project, receipt.id, amount, account]);

  // Gaps an edit leaves closed as settled rather than showing Kurang: an old
  // payment keeps its confirmation, a project closed by pelunasan stays
  // closed. The owner sees it before saving.
  const forgiven = (editPreview.update?.payments || []).filter((row) => {
    const c = row.closure;
    if (c?.kind !== 'waive' || (c.reason !== 'legacy' && c.reason !== 'settlement')) return false;
    const before = (project.payments || []).find((p) => p.no === row.no)?.closure;
    return !before || before.amount !== c.amount;
  });

  const movePreview = useMemo(() => {
    if (!startNo) return { error: 'Tidak ada tagihan lain yang masih terbuka.' };
    try {
      return applyReceiptMove(project, receipt.id, Number(startNo));
    } catch (e) {
      return { error: e.message };
    }
  }, [project, receipt.id, startNo]);

  function go(next) {
    setError('');
    setStep(next);
  }

  async function run(action) {
    setError('');
    setSubmitting(true);
    try {
      await action();
      onClose();
    } catch (e) {
      setError(e.message || 'Gagal menyimpan');
    } finally {
      setSubmitting(false);
    }
  }

  const back = (
    <button type="button" onClick={() => go('menu')} className="text-[13px] font-semibold text-indigo mb-3">
      ← Kembali
    </button>
  );
  const errorLine = error && <p className="text-[13px] text-terra">{error}</p>;

  let body;
  let footer = null;

  if (step === 'menu') {
    body = (
      <div className="space-y-3">
        <div className="bg-cream-deep rounded-xl p-3 text-[13px] text-ink-soft space-y-1">
          <div className="flex justify-between">
            <span>Tanggal</span>
            <span className="font-semibold text-ink">{formatDate(receipt.date)}</span>
          </div>
          <div className="flex justify-between">
            <span>Rekening</span>
            <span className="font-semibold text-ink">{accountName}</span>
          </div>
          <div className="flex justify-between">
            <span>Jumlah</span>
            <span className="font-num font-semibold text-ink">{formatCurrency(receipt.amount)}</span>
          </div>
        </div>
        <Allocations allocations={receipt.allocations || []} />
        {notes.map((note) => (
          <p key={note} className="text-[12px] text-ink-mute leading-snug">
            {note}
          </p>
        ))}
        {!block && (
          <div className="space-y-2 pt-1">
            {rules.edit && !txChanged && (
              <button type="button" className="btn-secondary w-full" onClick={() => go('edit')}>
                Edit jumlah, rekening, atau tanggal
              </button>
            )}
            {rules.move && (
              <button type="button" className="btn-secondary w-full" onClick={() => go('move')}>
                Pindah ke bulan lain
              </button>
            )}
            {rules.cancel && (
              <button type="button" className="btn-danger w-full" onClick={() => go('cancel')}>
                Batalkan pembayaran ini
              </button>
            )}
          </div>
        )}
      </div>
    );
  } else if (step === 'edit') {
    body = (
      <form
        id="receipt-edit-form"
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          run(() => onEdit({ amount: Number(amount), account, date: fromDateInput(date) }));
        }}
      >
        {back}
        <div>
          <label className="label-text">Jumlah diterima</label>
          <CurrencyInput value={amount} onChange={setAmount} />
        </div>
        <div>
          <label className="label-text">Masuk ke</label>
          <select className="input-field" value={account} onChange={(e) => setAccount(e.target.value)}>
            {account === '' && <option value="">Pilih rekening</option>}
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
        {editPreview.error ? (
          <p className="text-[13px] text-terra">{editPreview.error}</p>
        ) : (
          <Allocations allocations={editPreview.allocations} />
        )}
        {forgiven.map((row) => (
          <p key={row.no} className="text-[12px] text-ink-mute leading-snug">
            Selisih {formatCurrency(row.closure.amount)} di bulan {row.no} tetap dianggap lunas,{' '}
            {row.closure.reason === 'legacy'
              ? 'karena pembayaran ini dicatat sebelum ada fitur cicilan.'
              : 'karena project ini sudah ditutup lewat pelunasan dipercepat.'}
          </p>
        ))}
        {errorLine}
      </form>
    );
    footer = (
      <button
        type="submit"
        form="receipt-edit-form"
        className="btn-primary w-full"
        disabled={submitting || !!editPreview.error}
      >
        {submitting ? 'Menyimpan…' : 'Simpan perubahan'}
      </button>
    );
  } else if (step === 'move') {
    body = (
      <form
        id="receipt-move-form"
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          run(() => onMove(Number(startNo)));
        }}
      >
        {back}
        <p className="text-[13px] text-ink-soft leading-snug">
          Uangnya tetap di rekening yang sama. Yang berubah hanya tagihan yang ditutup.
        </p>
        {targets.length > 0 && (
          <div>
            <label className="label-text">Pindah ke tagihan</label>
            <select className="input-field" value={startNo} onChange={(e) => setStartNo(e.target.value)}>
              {targets.map((r) => (
                <option key={r.no} value={r.no}>
                  Bulan {r.no} · jatuh tempo {formatDate(r.dueDate, { short: true })} · sisa{' '}
                  {formatCurrency(r.remaining)}
                </option>
              ))}
            </select>
          </div>
        )}
        {movePreview.error ? (
          <p className="text-[13px] text-terra">{movePreview.error}</p>
        ) : (
          <Allocations allocations={movePreview.allocations} />
        )}
        {errorLine}
      </form>
    );
    footer = (
      <button
        type="submit"
        form="receipt-move-form"
        className="btn-primary w-full"
        disabled={submitting || !!movePreview.error}
      >
        {submitting ? 'Memindahkan…' : 'Pindahkan'}
      </button>
    );
  } else {
    body = (
      <div className="space-y-3">
        {back}
        <p className="text-ink-soft text-[14px] leading-relaxed">
          Pembayaran {formatCurrency(receipt.amount)} tanggal {formatDate(receipt.date)} dibatalkan.{' '}
          {tx && nameOf(tx.toAccount)
            ? `Saldo ${nameOf(tx.toAccount)} berkurang ${formatCurrency(tx.amount)} dan transaksinya ikut dihapus.`
            : 'Transaksi atau rekeningnya sudah tidak ada, jadi saldo tidak diubah.'}{' '}
          Tagihan yang ditutup pembayaran ini terbuka lagi.
        </p>
        {errorLine}
      </div>
    );
    footer = (
      <button type="button" className="btn-danger w-full" disabled={submitting} onClick={() => run(onCancel)}>
        {submitting ? 'Membatalkan…' : 'Ya, batalkan'}
      </button>
    );
  }

  return (
    <Modal open onClose={onClose} title={TITLES[step]} subtitle={project.name} footer={footer}>
      {body}
    </Modal>
  );
}
