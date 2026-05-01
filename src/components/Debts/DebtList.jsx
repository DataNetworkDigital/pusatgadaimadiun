import { useMemo, useState } from 'react';
import { useData } from '../../contexts/DataContext';
import PageHeader from '../common/PageHeader';
import IconButton from '../common/IconButton';
import ConfirmDialog from '../common/ConfirmDialog';
import DebtCard from './DebtCard';
import DebtForm from './DebtForm';
import InstallmentForm from './InstallmentForm';
import { formatCurrency } from '../../utils/formatCurrency';
import { IcPlus } from '../common/icons';

export default function DebtList() {
  const { debts, addDebt, updateDebt, deleteDebt } = useData();
  const [tab, setTab] = useState('utang');
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [paying, setPaying] = useState(null);
  const [deleting, setDeleting] = useState(null);

  const list = useMemo(() => debts.filter((d) => d.type === tab), [debts, tab]);
  const totalRemaining = useMemo(
    () => list.reduce((s, d) => s + (d.status !== 'paid' ? d.remainingAmount || 0 : 0), 0),
    [list]
  );

  function openAdd() {
    setEditing(null);
    setFormOpen(true);
  }

  async function handleSubmit(data) {
    if (editing) await updateDebt(editing.id, data);
    else await addDebt(data);
  }

  async function handleDelete() {
    if (!deleting) return;
    await deleteDebt(deleting.id);
    setDeleting(null);
  }

  const accentText = tab === 'utang' ? 'text-terra' : 'text-daun';

  return (
    <div>
      <PageHeader
        title="Utang & Piutang"
        action={
          <IconButton variant="primary" onClick={openAdd} ariaLabel="Tambah utang/piutang">
            <IcPlus size={20} sw={2.2} />
          </IconButton>
        }
      />

      <div className="bg-cream-deep rounded-[14px] p-1 flex gap-1 mb-4">
        {[
          { id: 'utang', label: 'Utang Saya', activeText: 'text-terra' },
          { id: 'piutang', label: 'Piutang Saya', activeText: 'text-daun' },
        ].map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            className={
              'flex-1 py-2.5 rounded-[10px] text-[14px] font-semibold transition ' +
              (tab === t.id
                ? `bg-paper ${t.activeText} shadow-[0_1px_3px_rgba(140,110,60,0.1)]`
                : 'bg-transparent text-ink-soft')
            }
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="bg-paper rounded-2xl border border-line shadow-card p-4 mb-3.5">
        <div className="text-[12px] text-ink-mute font-medium uppercase tracking-[0.3px]">
          Total Belum Lunas
        </div>
        <div
          className={`font-display text-[28px] font-semibold mt-0.5 ${accentText}`}
          style={{ fontVariantNumeric: 'tabular-nums' }}
        >
          {formatCurrency(totalRemaining)}
        </div>
      </div>

      {list.length === 0 ? (
        <div className="py-10 px-5 text-center text-[14px] text-ink-mute">
          Belum ada catatan. Tekan <strong className="text-indigo">+</strong> untuk menambah.
        </div>
      ) : (
        <div className="space-y-3">
          {list.map((d) => (
            <DebtCard
              key={d.id}
              debt={d}
              onPay={setPaying}
              onEdit={(x) => {
                setEditing(x);
                setFormOpen(true);
              }}
              onDelete={setDeleting}
            />
          ))}
        </div>
      )}

      <DebtForm
        key={editing?.id || 'new'}
        open={formOpen}
        onClose={() => setFormOpen(false)}
        onSubmit={handleSubmit}
        initial={editing}
        defaultType={tab}
      />
      <InstallmentForm open={!!paying} onClose={() => setPaying(null)} debt={paying} />
      <ConfirmDialog
        open={!!deleting}
        onClose={() => setDeleting(null)}
        onConfirm={handleDelete}
        title="Hapus?"
        message="Catatan ini akan dihapus. Transaksi cicilan terkait tetap ada."
      />
    </div>
  );
}
