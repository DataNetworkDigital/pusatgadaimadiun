import { useMemo, useState } from 'react';
import { useData } from '../../contexts/DataContext';
import PageHeader from '../common/PageHeader';
import EmptyState from '../common/EmptyState';
import ConfirmDialog from '../common/ConfirmDialog';
import TransactionItem from './TransactionItem';
import TransactionForm from './TransactionForm';
import TransactionDetail from './TransactionDetail';
import SearchFilter from './SearchFilter';
import { exportTransactionsToExcel } from '../../utils/exportExcel';
import { exportTransactionsToPdf } from '../../utils/exportPdf';
import { toDate, fromDateInput } from '../../utils/formatDate';
import { formatCurrency } from '../../utils/formatCurrency';

const INITIAL_FILTERS = { search: '', type: '', accountId: '', dateFrom: '', dateTo: '' };

export default function TransactionList() {
  const { transactions, accounts, deleteTransaction } = useData();
  const [showFilters, setShowFilters] = useState(false);
  const [filters, setFilters] = useState(INITIAL_FILTERS);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [detail, setDetail] = useState(null);
  const [deleting, setDeleting] = useState(null);
  const [pageSize, setPageSize] = useState(30);

  const filtered = useMemo(() => {
    let list = transactions;
    if (filters.search) {
      const q = filters.search.toLowerCase();
      list = list.filter((t) => (t.description || '').toLowerCase().includes(q));
    }
    if (filters.type) list = list.filter((t) => t.type === filters.type);
    if (filters.accountId) {
      list = list.filter((t) => t.fromAccount === filters.accountId || t.toAccount === filters.accountId);
    }
    if (filters.dateFrom) {
      const d = fromDateInput(filters.dateFrom);
      d.setHours(0, 0, 0, 0);
      list = list.filter((t) => toDate(t.date) >= d);
    }
    if (filters.dateTo) {
      const d = fromDateInput(filters.dateTo);
      d.setHours(23, 59, 59, 999);
      list = list.filter((t) => toDate(t.date) <= d);
    }
    return list;
  }, [transactions, filters]);

  const totals = useMemo(() => {
    let inc = 0, exp = 0;
    filtered.forEach((t) => { if (t.type === 'income') inc += t.amount; else if (t.type === 'expense') exp += t.amount; });
    return { inc, exp };
  }, [filtered]);

  const visible = filtered.slice(0, pageSize);
  const hasMore = filtered.length > pageSize;

  function handleEdit(tx) {
    setDetail(null);
    setEditing(tx);
    setFormOpen(true);
  }

  function handleDeleteRequest(tx) {
    setDetail(null);
    setDeleting(tx);
  }

  async function handleConfirmDelete() {
    if (!deleting) return;
    await deleteTransaction(deleting.id);
    setDeleting(null);
  }

  function openAdd() {
    setEditing(null);
    setFormOpen(true);
  }

  return (
    <div className="relative">
      <PageHeader
        title="Transaksi"
        subtitle={`${filtered.length} transaksi`}
        action={
          <button onClick={() => setShowFilters((v) => !v)} className="btn-secondary text-sm px-3 py-2">
            {showFilters ? 'Tutup' : 'Filter'}
          </button>
        }
      />

      {showFilters && (
        <div className="mb-4 space-y-3">
          <SearchFilter filters={filters} setFilters={setFilters} accounts={accounts} />
          <div className="flex gap-2">
            <button onClick={() => setFilters(INITIAL_FILTERS)} className="btn-secondary flex-1 text-sm">Reset Filter</button>
            <button onClick={() => exportTransactionsToExcel(filtered, accounts)} className="btn-secondary flex-1 text-sm">📊 Excel</button>
            <button onClick={() => exportTransactionsToPdf(filtered, accounts)} className="btn-secondary flex-1 text-sm">📄 PDF</button>
          </div>
        </div>
      )}

      <div className="grid grid-cols-2 gap-3 mb-4">
        <div className="card py-3">
          <div className="text-xs text-gray-500">Total Pemasukan</div>
          <div className="font-bold text-income">{formatCurrency(totals.inc)}</div>
        </div>
        <div className="card py-3">
          <div className="text-xs text-gray-500">Total Pengeluaran</div>
          <div className="font-bold text-expense">{formatCurrency(totals.exp)}</div>
        </div>
      </div>

      {filtered.length === 0 ? (
        <EmptyState
          icon="💸"
          title="Belum ada transaksi"
          description={transactions.length === 0 ? 'Yuk catat pengeluaran pertamamu!' : 'Tidak ada transaksi sesuai filter.'}
          action={<button onClick={openAdd} className="btn-primary">Tambah Transaksi</button>}
        />
      ) : (
        <div className="card divide-y divide-gray-100">
          {visible.map((tx) => (
            <TransactionItem key={tx.id} tx={tx} accounts={accounts} onClick={() => setDetail(tx)} />
          ))}
          {hasMore && (
            <div className="pt-3">
              <button onClick={() => setPageSize((s) => s + 30)} className="btn-secondary w-full text-sm">Muat 30 Lainnya</button>
            </div>
          )}
        </div>
      )}

      <button
        onClick={openAdd}
        className="fixed bottom-20 sm:bottom-8 right-4 sm:right-8 w-14 h-14 rounded-full bg-primary text-white text-3xl shadow-lg active:bg-primary-700 z-20 safe-bottom"
        aria-label="Tambah transaksi"
      >
        +
      </button>

      <TransactionForm key={editing?.id || 'new'} open={formOpen} onClose={() => setFormOpen(false)} initial={editing} />
      <TransactionDetail tx={detail} accounts={accounts} open={!!detail} onClose={() => setDetail(null)} onEdit={handleEdit} onDelete={handleDeleteRequest} />
      <ConfirmDialog
        open={!!deleting}
        onClose={() => setDeleting(null)}
        onConfirm={handleConfirmDelete}
        title="Hapus Transaksi?"
        message="Saldo rekening akan dikembalikan ke kondisi sebelum transaksi ini."
      />
    </div>
  );
}
