import { useState } from 'react';
import { useData } from '../../contexts/DataContext';
import PageHeader from '../common/PageHeader';
import EmptyState from '../common/EmptyState';
import ConfirmDialog from '../common/ConfirmDialog';
import AccountCard from './AccountCard';
import AccountForm from './AccountForm';
import { formatCurrency } from '../../utils/formatCurrency';

export default function AccountList() {
  const { accounts, transactions, totalBalance, addAccount, updateAccount, deleteAccount } = useData();
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [deleting, setDeleting] = useState(null);

  function openAdd() {
    setEditing(null);
    setFormOpen(true);
  }
  function openEdit(acc) {
    setEditing(acc);
    setFormOpen(true);
  }

  async function handleSubmit(data) {
    if (editing) await updateAccount(editing.id, data);
    else await addAccount(data);
  }

  async function handleDelete() {
    if (!deleting) return;
    await deleteAccount(deleting.id);
    setDeleting(null);
  }

  const txCount = (id) => transactions.filter((t) => t.fromAccount === id || t.toAccount === id).length;

  return (
    <div>
      <PageHeader
        title="Rekening"
        subtitle={`Total: ${formatCurrency(totalBalance)}`}
        action={
          <button onClick={openAdd} className="btn-primary text-sm px-4 py-2">+ Tambah</button>
        }
      />

      {accounts.length === 0 ? (
        <EmptyState
          icon="🏦"
          title="Belum ada rekening"
          description="Tambahkan bank atau dompet digital untuk mulai mencatat saldo."
          action={<button onClick={openAdd} className="btn-primary">Tambah Rekening</button>}
        />
      ) : (
        <div className="space-y-3">
          {accounts.map((acc) => (
            <AccountCard
              key={acc.id}
              account={acc}
              onEdit={openEdit}
              onDelete={(a) => setDeleting({ ...a, txCount: txCount(a.id) })}
            />
          ))}
        </div>
      )}

      <AccountForm
        open={formOpen}
        onClose={() => setFormOpen(false)}
        onSubmit={handleSubmit}
        initial={editing}
      />

      <ConfirmDialog
        open={!!deleting}
        onClose={() => setDeleting(null)}
        onConfirm={handleDelete}
        title="Hapus Rekening?"
        message={
          deleting?.txCount > 0
            ? `Rekening "${deleting.name}" memiliki ${deleting.txCount} transaksi terkait. Hapus rekening tidak akan menghapus transaksi yang sudah ada. Lanjutkan?`
            : `Rekening "${deleting?.name}" akan dihapus permanen.`
        }
        confirmLabel="Hapus"
      />
    </div>
  );
}
