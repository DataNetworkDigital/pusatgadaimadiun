import { useState } from 'react';
import { useData } from '../../contexts/DataContext';
import PageHeader from '../common/PageHeader';
import IconButton from '../common/IconButton';
import Card from '../common/Card';
import SectionTitle from '../common/SectionTitle';
import Pill from '../common/Pill';
import CalendarGrid from './CalendarGrid';
import DayDetail from './DayDetail';
import ReminderForm from './ReminderForm';
import TransactionDetail from '../Transactions/TransactionDetail';
import TransactionForm from '../Transactions/TransactionForm';
import ConfirmDialog from '../common/ConfirmDialog';
import { formatCurrency } from '../../utils/formatCurrency';
import { IcPlus, IcEdit, IcTrash } from '../common/icons';

export default function CalendarPage() {
  const {
    transactions,
    accounts,
    debts,
    reminders,
    addReminder,
    updateReminder,
    deleteReminder,
    deleteTransaction,
  } = useData();
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
        action={
          <IconButton
            variant="primary"
            onClick={() => {
              setEditingRem(null);
              setRemOpen(true);
            }}
            ariaLabel="Tambah reminder"
          >
            <IcPlus size={20} sw={2.2} />
          </IconButton>
        }
      />

      <CalendarGrid
        month={month}
        transactions={transactions}
        debts={debts}
        reminders={reminders}
        selected={selected}
        onSelect={setSelected}
        onPrev={prev}
        onNext={next}
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
        <div>
          <SectionTitle>Reminder Bulanan</SectionTitle>
          <Card className="!px-4 !py-1">
            {reminders.map((r, i) => (
              <div
                key={r.id}
                className={`flex items-center gap-3 py-3.5 ${
                  i < reminders.length - 1 ? 'border-b border-line-soft' : ''
                }`}
              >
                <div className="w-[38px] h-[38px] rounded-[11px] bg-indigo-soft text-indigo flex items-center justify-center font-display text-[14px] font-semibold flex-shrink-0">
                  {r.dayOfMonth}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-[15px] font-medium text-ink truncate">{r.title}</div>
                  <div className="text-[12px] text-ink-mute truncate">
                    Tiap tanggal {r.dayOfMonth}
                    {r.amount ? ` · ${formatCurrency(r.amount)}` : ''}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => updateReminder(r.id, { isActive: !r.isActive })}
                  className="flex-shrink-0"
                  aria-label={r.isActive ? 'Nonaktifkan reminder' : 'Aktifkan reminder'}
                >
                  <Pill tone={r.isActive ? 'daun' : 'neutral'}>
                    {r.isActive ? 'Aktif' : 'Nonaktif'}
                  </Pill>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setEditingRem(r);
                    setRemOpen(true);
                  }}
                  aria-label={`Edit ${r.title}`}
                  className="w-9 h-9 rounded-xl border border-line bg-paper text-ink-soft flex items-center justify-center active:bg-cream-deep flex-shrink-0"
                >
                  <IcEdit size={16} sw={1.9} />
                </button>
                <button
                  type="button"
                  onClick={() => setDelRem(r)}
                  aria-label={`Hapus ${r.title}`}
                  className="w-9 h-9 rounded-xl bg-terra-soft text-terra flex items-center justify-center active:opacity-80 flex-shrink-0"
                >
                  <IcTrash size={16} sw={1.9} />
                </button>
              </div>
            ))}
          </Card>
        </div>
      )}

      <ReminderForm
        key={`rem-${editingRem?.id || 'new'}`}
        open={remOpen}
        onClose={() => setRemOpen(false)}
        onSubmit={handleSubmitRem}
        initial={editingRem}
      />
      <TransactionDetail
        tx={txDetail}
        accounts={accounts}
        open={!!txDetail}
        onClose={() => setTxDetail(null)}
        onEdit={(t) => {
          setTxDetail(null);
          setEditingTx(t);
        }}
        onDelete={(t) => {
          setTxDetail(null);
          setDelTx(t);
        }}
      />
      <TransactionForm
        key={`tx-${editingTx?.id || 'new'}`}
        open={!!editingTx}
        onClose={() => setEditingTx(null)}
        initial={editingTx}
      />
      <ConfirmDialog
        open={!!delRem}
        onClose={() => setDelRem(null)}
        onConfirm={async () => {
          if (delRem) await deleteReminder(delRem.id);
        }}
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
