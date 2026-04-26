import { useState } from 'react';
import { useData } from '../../contexts/DataContext';
import PageHeader from '../common/PageHeader';
import CalendarGrid from './CalendarGrid';
import DayDetail from './DayDetail';
import ReminderForm from './ReminderForm';
import TransactionDetail from '../Transactions/TransactionDetail';
import TransactionForm from '../Transactions/TransactionForm';
import ConfirmDialog from '../common/ConfirmDialog';
import { monthLabel } from '../../utils/formatDate';
import { formatCurrency } from '../../utils/formatCurrency';

export default function CalendarPage() {
  const { transactions, accounts, debts, reminders, addReminder, updateReminder, deleteReminder, deleteTransaction } = useData();
  const [month, setMonth] = useState(() => {
    const n = new Date();
    return new Date(n.getFullYear(), n.getMonth(), 1);
  });
  const [selected, setSelected] = useState(new Date());
  const [remOpen, setRemOpen] = useState(false);
  const [editingRem, setEditingRem] = useState(null);
  const [delRem, setDelRem] = useState(null);
  const [txDetail, setTxDetail] = useState(null);
  const [editingTx, setEditingTx] = useState(null);
  const [delTx, setDelTx] = useState(null);

  function prev() {
    setMonth((d) => new Date(d.getFullYear(), d.getMonth() - 1, 1));
  }
  function next() {
    setMonth((d) => new Date(d.getFullYear(), d.getMonth() + 1, 1));
  }

  async function handleSubmitRem(data) {
    if (editingRem) await updateReminder(editingRem.id, data);
    else await addReminder(data);
  }

  async function handleDeleteTx() {
    if (!delTx) return;
    await deleteTransaction(delTx.id);
    setDelTx(null);
  }

  return (
    <div className="space-y-4">
      <PageHeader
        title="Kalender"
        action={<button onClick={() => { setEditingRem(null); setRemOpen(true); }} className="btn-primary text-sm px-4 py-2">+ Reminder</button>}
      />

      <div className="flex items-center justify-between">
        <button onClick={prev} className="w-10 h-10 rounded-full bg-white border border-gray-200 active:bg-gray-50">‹</button>
        <h2 className="font-semibold text-gray-900">{monthLabel(month)}</h2>
        <button onClick={next} className="w-10 h-10 rounded-full bg-white border border-gray-200 active:bg-gray-50">›</button>
      </div>

      <CalendarGrid
        month={month}
        transactions={transactions}
        debts={debts}
        reminders={reminders}
        selected={selected}
        onSelect={setSelected}
      />

      <DayDetail
        date={selected}
        transactions={transactions}
        accounts={accounts}
        debts={debts}
        reminders={reminders}
        onSelectTx={setTxDetail}
      />

      {reminders.length > 0 && (
        <div className="card">
          <h3 className="font-semibold text-gray-900 mb-3">Reminder Bulanan</h3>
          <ul className="divide-y divide-gray-100">
            {reminders.map((r) => (
              <li key={r.id} className="py-3 flex items-center gap-3">
                <div className="w-9 h-9 rounded-full bg-primary-50 text-primary flex items-center justify-center text-sm font-bold">{r.dayOfMonth}</div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium truncate">{r.title}</div>
                  {r.amount && <div className="text-xs text-gray-500">{formatCurrency(r.amount)}</div>}
                </div>
                <button onClick={() => updateReminder(r.id, { isActive: !r.isActive })} className={`text-xs px-2 py-1 rounded ${r.isActive ? 'bg-income-bg text-income' : 'bg-gray-100 text-gray-500'}`}>
                  {r.isActive ? 'Aktif' : 'Nonaktif'}
                </button>
                <button onClick={() => { setEditingRem(r); setRemOpen(true); }} className="text-xs text-primary px-2 py-1">Edit</button>
                <button onClick={() => setDelRem(r)} className="text-xs text-expense px-2 py-1">Hapus</button>
              </li>
            ))}
          </ul>
        </div>
      )}

      <ReminderForm key={`rem-${editingRem?.id || 'new'}`} open={remOpen} onClose={() => setRemOpen(false)} onSubmit={handleSubmitRem} initial={editingRem} />
      <TransactionDetail
        tx={txDetail}
        accounts={accounts}
        open={!!txDetail}
        onClose={() => setTxDetail(null)}
        onEdit={(t) => { setTxDetail(null); setEditingTx(t); }}
        onDelete={(t) => { setTxDetail(null); setDelTx(t); }}
      />
      <TransactionForm key={`tx-${editingTx?.id || 'new'}`} open={!!editingTx} onClose={() => setEditingTx(null)} initial={editingTx} />
      <ConfirmDialog
        open={!!delRem}
        onClose={() => setDelRem(null)}
        onConfirm={async () => { if (delRem) await deleteReminder(delRem.id); }}
        title="Hapus Reminder?"
        message={delRem ? `Reminder "${delRem.title}" akan dihapus.` : ''}
      />
      <ConfirmDialog
        open={!!delTx}
        onClose={() => setDelTx(null)}
        onConfirm={handleDeleteTx}
        title="Hapus Transaksi?"
        message="Saldo rekening akan dikembalikan ke kondisi sebelum transaksi ini."
      />
    </div>
  );
}
