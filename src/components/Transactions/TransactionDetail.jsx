import Modal from '../common/Modal';
import { formatCurrency } from '../../utils/formatCurrency';
import { formatDate } from '../../utils/formatDate';

const TYPE_LABEL = { income: 'Pemasukan', expense: 'Pengeluaran', transfer: 'Transfer' };

export default function TransactionDetail({ tx, accounts, open, onClose, onEdit, onDelete }) {
  if (!tx) return null;
  const accountName = (id) => accounts.find((a) => a.id === id)?.name || '-';
  const color = tx.type === 'income' ? 'text-income' : tx.type === 'transfer' ? 'text-transfer' : 'text-expense';
  const sign = tx.type === 'income' ? '+' : tx.type === 'transfer' ? '' : '-';

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Detail Transaksi"
      footer={
        <div className="flex gap-2">
          <button className="btn-secondary flex-1" onClick={() => onEdit(tx)}>Edit</button>
          <button className="btn-danger flex-1" onClick={() => onDelete(tx)}>Hapus</button>
        </div>
      }
    >
      <div className="text-center mb-4">
        <div className="text-xs text-gray-500">{TYPE_LABEL[tx.type]}</div>
        <div className={`text-3xl font-extrabold mt-1 ${color}`}>
          {sign}{formatCurrency(tx.amount, false)}
        </div>
      </div>
      <dl className="space-y-3 text-sm">
        <div className="flex justify-between gap-4">
          <dt className="text-gray-500">Tanggal</dt>
          <dd className="font-medium text-right">{formatDate(tx.date)}</dd>
        </div>
        {tx.description && (
          <div className="flex justify-between gap-4">
            <dt className="text-gray-500">Keterangan</dt>
            <dd className="font-medium text-right">{tx.description}</dd>
          </div>
        )}
        {tx.fromAccount && (
          <div className="flex justify-between gap-4">
            <dt className="text-gray-500">Dari</dt>
            <dd className="font-medium text-right">{accountName(tx.fromAccount)}</dd>
          </div>
        )}
        {tx.toAccount && (
          <div className="flex justify-between gap-4">
            <dt className="text-gray-500">Ke</dt>
            <dd className="font-medium text-right">{accountName(tx.toAccount)}</dd>
          </div>
        )}
      </dl>
    </Modal>
  );
}
