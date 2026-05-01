import { useMemo, useState } from 'react';
import { useData } from '../../contexts/DataContext';
import PageHeader from '../common/PageHeader';
import IconButton from '../common/IconButton';
import FAB from '../common/FAB';
import TxCard from '../common/TxCard';
import ConfirmDialog from '../common/ConfirmDialog';
import TransactionForm from './TransactionForm';
import TransactionDetail from './TransactionDetail';
import FilterSheet from './SearchFilter';
import { exportTransactionsToExcel } from '../../utils/exportExcel';
import { exportTransactionsToPdf } from '../../utils/exportPdf';
import { toDate, fromDateInput, formatDate, formatDateInput } from '../../utils/formatDate';
import { formatCurrency } from '../../utils/formatCurrency';
import { IcFilter } from '../common/icons';

const INITIAL_FILTERS = { search: '', type: '', accountId: '', dateFrom: '', dateTo: '' };

export default function TransactionList() {
  const { transactions, accounts, deleteTransaction } = useData();
  const [filterOpen, setFilterOpen] = useState(false);
  const [filters, setFilters] = useState(INITIAL_FILTERS);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [detail, setDetail] = useState(null);
  const [deleting, setDeleting] = useState(null);
  const [pageSize, setPageSize] = useState(30);

  const accountName = (id) => accounts.find((a) => a.id === id)?.name || '—';

  const hasFilter =
    !!filters.search.trim() ||
    !!filters.type ||
    !!filters.accountId ||
    !!filters.dateFrom ||
    !!filters.dateTo;

  const filtered = useMemo(() => {
    let list = transactions;
    if (filters.search) {
      const q = filters.search.toLowerCase();
      list = list.filter((t) => (t.description || '').toLowerCase().includes(q));
    }
    if (filters.type) list = list.filter((t) => t.type === filters.type);
    if (filters.accountId) {
      list = list.filter(
        (t) => t.fromAccount === filters.accountId || t.toAccount === filters.accountId
      );
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
    let inc = 0;
    let exp = 0;
    filtered.forEach((t) => {
      if (t.type === 'income') inc += t.amount;
      else if (t.type === 'expense') exp += t.amount;
    });
    return { inc, exp };
  }, [filtered]);

  const visible = filtered.slice(0, pageSize);
  const hasMore = filtered.length > pageSize;

  const grouped = useMemo(() => {
    const map = new Map();
    visible.forEach((tx) => {
      const d = toDate(tx.date);
      if (!d) return;
      const key = formatDateInput(d);
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(tx);
    });
    return Array.from(map.entries());
  }, [visible]);

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
  function clearFilters() {
    setFilters(INITIAL_FILTERS);
  }

  return (
    <div className="relative">
      <PageHeader
        title="Transaksi"
        subtitle={`${filtered.length} catatan${hasFilter ? ' · filter aktif' : ''}`}
        action={
          <IconButton
            onClick={() => setFilterOpen(true)}
            active={hasFilter}
            ariaLabel="Filter transaksi"
          >
            <IcFilter size={20} stroke="currentColor" />
          </IconButton>
        }
      />

      {hasFilter && (
        <div className="flex items-center gap-2 px-3.5 py-2.5 bg-indigo-soft border border-indigo/30 rounded-xl mb-3 text-[13px] font-medium text-indigo">
          <IcFilter size={14} />
          <span className="flex-1">Filter aktif</span>
          <button
            type="button"
            onClick={clearFilters}
            className="bg-indigo text-cream rounded-lg px-2.5 py-1 text-[12px] font-semibold active:bg-indigo-deep"
          >
            Hapus
          </button>
        </div>
      )}

      <div className="grid grid-cols-2 gap-2.5 mb-4">
        <div className="bg-daun-soft border border-daun/30 rounded-2xl p-3.5">
          <div className="text-[12px] font-semibold text-daun tracking-[0.3px]">PEMASUKAN</div>
          <div
            className="font-num text-[18px] font-semibold text-daun mt-0.5"
            style={{ fontVariantNumeric: 'tabular-nums' }}
          >
            {formatCurrency(totals.inc)}
          </div>
        </div>
        <div className="bg-terra-soft border border-terra/30 rounded-2xl p-3.5">
          <div className="text-[12px] font-semibold text-terra tracking-[0.3px]">PENGELUARAN</div>
          <div
            className="font-num text-[18px] font-semibold text-terra mt-0.5"
            style={{ fontVariantNumeric: 'tabular-nums' }}
          >
            {formatCurrency(totals.exp)}
          </div>
        </div>
      </div>

      {hasFilter && (
        <div className="flex gap-2 mb-4">
          <button
            type="button"
            onClick={() => exportTransactionsToExcel(filtered, accounts)}
            className="flex-1 py-2.5 rounded-xl bg-paper border border-line text-[13px] font-semibold text-ink-soft active:bg-cream-deep"
          >
            📊 Excel
          </button>
          <button
            type="button"
            onClick={() => exportTransactionsToPdf(filtered, accounts)}
            className="flex-1 py-2.5 rounded-xl bg-paper border border-line text-[13px] font-semibold text-ink-soft active:bg-cream-deep"
          >
            📄 PDF
          </button>
        </div>
      )}

      {grouped.length === 0 ? (
        <div className="py-16 px-5 text-center text-[14px] text-ink-mute">
          {hasFilter ? (
            'Tidak ada transaksi yang cocok dengan filter.'
          ) : (
            <>
              Belum ada transaksi. Tekan tombol{' '}
              <strong className="text-indigo">+</strong> untuk menambah.
            </>
          )}
        </div>
      ) : (
        <div className="space-y-3.5">
          {grouped.map(([dateKey, txs]) => (
            <div key={dateKey}>
              <div className="text-[12px] font-semibold text-ink-mute px-1 pb-1.5 uppercase tracking-[0.3px]">
                {formatDate(fromDateInput(dateKey))}
              </div>
              <div className="flex flex-col gap-2">
                {txs.map((tx) => (
                  <TxCard
                    key={tx.id}
                    tx={tx}
                    accountName={accountName}
                    onClick={() => setDetail(tx)}
                  />
                ))}
              </div>
            </div>
          ))}
          {hasMore && (
            <button
              type="button"
              onClick={() => setPageSize((s) => s + 30)}
              className="w-full py-3 rounded-xl bg-paper border border-line text-[13px] font-semibold text-ink-soft active:bg-cream-deep"
            >
              Muat 30 Lainnya
            </button>
          )}
        </div>
      )}

      <FAB onClick={openAdd} ariaLabel="Tambah transaksi" />

      <FilterSheet
        open={filterOpen}
        onClose={() => setFilterOpen(false)}
        filters={filters}
        setFilters={setFilters}
        accounts={accounts}
        onClear={clearFilters}
      />
      <TransactionForm
        key={editing?.id || 'new'}
        open={formOpen}
        onClose={() => setFormOpen(false)}
        initial={editing}
      />
      <TransactionDetail
        tx={detail}
        accounts={accounts}
        open={!!detail}
        onClose={() => setDetail(null)}
        onEdit={handleEdit}
        onDelete={handleDeleteRequest}
      />
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
