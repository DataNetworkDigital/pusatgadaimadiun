import { useState } from 'react';
import { useData } from '../../contexts/DataContext';
import PageHeader from '../common/PageHeader';
import IconButton from '../common/IconButton';
import ConfirmDialog from '../common/ConfirmDialog';
import AccountCard from './AccountCard';
import AccountForm from './AccountForm';
import { formatCurrency } from '../../utils/formatCurrency';
import { IcPlus } from '../common/icons';

export default function AccountList() {
  const { accounts, transactions, totalBalance, addAccount, updateAccount, deleteAccount } =
    useData();
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

  const txCount = (id) =>
    transactions.filter((t) => t.fromAccount === id || t.toAccount === id).length;

  const subtitle = `${accounts.length} rekening · Total ${formatCurrency(totalBalance)}`;

  return (
    <div>
      <PageHeader
        title="Rekening"
        subtitle={subtitle}
        action={
          <IconButton variant="primary" onClick={openAdd} ariaLabel="Tambah rekening">
            <IcPlus size={20} sw={2.2} />
          </IconButton>
        }
      />

      {accounts.length === 0 ? (
        <div className="py-16 px-5 text-center">
          <div className="text-4xl mb-3">🏦</div>
          <h3 className="font-display text-[18px] font-semibold text-ink">Belum ada rekening</h3>
          <p className="text-sm text-ink-mute mt-2 max-w-xs mx-auto">
            Tambahkan bank atau dompet digital untuk mulai mencatat saldo.
          </p>
          <button
            type="button"
            onClick={openAdd}
            className="mt-5 px-5 py-3 rounded-xl bg-indigo text-cream font-semibold text-sm active:bg-indigo-deep"
          >
            Tambah Rekening
          </button>
        </div>
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
        key={editing?.id || 'new'}
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
