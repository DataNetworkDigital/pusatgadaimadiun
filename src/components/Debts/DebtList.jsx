import { useMemo, useState } from 'react';
import { useData } from '../../contexts/DataContext';
import PageHeader from '../common/PageHeader';
import EmptyState from '../common/EmptyState';
import ConfirmDialog from '../common/ConfirmDialog';
import DebtCard from './DebtCard';
import DebtForm from './DebtForm';
import InstallmentForm from './InstallmentForm';
import { formatCurrency } from '../../utils/formatCurrency';

export default function DebtList() {
  const { debts, addDebt, updateDebt, deleteDebt } = useData();
  const [tab, setTab] = useState('utang');
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [paying, setPaying] = useState(null);
  const [deleting, setDeleting] = useState(null);

  const list = useMemo(() => debts.filter((d) => d.type === tab), [debts, tab]);
  const totalRemaining = useMemo(() => list.reduce((s, d) => s + (d.status !== 'paid' ? d.remainingAmount : 0), 0), [list]);

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

  return (
    <div>
      <PageHeader
        title="Utang & Piutang"
        action={<button onClick={openAdd} className="btn-primary text-sm px-4 py-2">+ Tambah</button>}
      />

      <div className="grid grid-cols-2 gap-2 bg-gray-100 p-1 rounded-lg mb-4">
        <button onClick={() => setTab('utang')} className={'py-2 rounded-md text-sm font-semibold ' + (tab === 'utang' ? 'bg-white text-expense shadow-sm' : 'text-gray-600')}>
          Utang Saya
        </button>
        <button onClick={() => setTab('piutang')} className={'py-2 rounded-md text-sm font-semibold ' + (tab === 'piutang' ? 'bg-white text-income shadow-sm' : 'text-gray-600')}>
          Piutang Saya
        </button>
      </div>

      <div className="card mb-4">
        <div className="text-xs text-gray-500">Total Belum Lunas</div>
        <div className={`text-2xl font-extrabold ${tab === 'utang' ? 'text-expense' : 'text-income'}`}>{formatCurrency(totalRemaining)}</div>
      </div>

      {list.length === 0 ? (
        <EmptyState
          icon="📋"
          title={tab === 'utang' ? 'Belum ada utang' : 'Belum ada piutang'}
          description={tab === 'utang' ? 'Catat utang untuk melacak kewajiban pembayaran.' : 'Catat piutang untuk melacak uang yang dipinjamkan.'}
          action={<button onClick={openAdd} className="btn-primary">Tambah</button>}
        />
      ) : (
        <div className="space-y-3">
          {list.map((d) => (
            <DebtCard
              key={d.id}
              debt={d}
              onPay={setPaying}
              onEdit={(x) => { setEditing(x); setFormOpen(true); }}
              onDelete={setDeleting}
            />
          ))}
        </div>
      )}

      <DebtForm key={editing?.id || 'new'} open={formOpen} onClose={() => setFormOpen(false)} onSubmit={handleSubmit} initial={editing} defaultType={tab} />
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
