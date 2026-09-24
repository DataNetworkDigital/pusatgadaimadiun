import { Link } from 'react-router-dom';
import Modal from '../common/Modal';
import { useData } from '../../contexts/DataContext';
import { useDemo } from '../../contexts/DemoContext';
import { formatCurrency } from '../../utils/formatCurrency';
import { formatDate } from '../../utils/formatDate';
import { projectOfTransaction } from '../../utils/projectMoney';

const TYPE_LABEL = { income: 'Pemasukan', expense: 'Pengeluaran', transfer: 'Transfer' };

export default function TransactionDetail({ tx, accounts, open, onClose, onEdit, onDelete }) {
  const { projects } = useData();
  const { isDemo } = useDemo();
  if (!tx) return null;
  const accountName = (id) => accounts.find((a) => a.id === id)?.name || '-';
  const color = tx.type === 'income' ? 'text-income' : tx.type === 'transfer' ? 'text-transfer' : 'text-expense';
  const sign = tx.type === 'income' ? '+' : tx.type === 'transfer' ? '' : '-';
  const project = projectOfTransaction(tx, projects);

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Detail Transaksi"
      footer={
        project ? (
          <Link
            to={`${isDemo ? '/demo' : ''}/project/${project.id}`}
            onClick={onClose}
            className="btn-primary w-full block text-center"
          >
            Buka project
          </Link>
        ) : (
          <div className="flex gap-2">
            <button className="btn-secondary flex-1" onClick={() => onEdit(tx)}>Edit</button>
            <button className="btn-danger flex-1" onClick={() => onDelete(tx)}>Hapus</button>
          </div>
        )
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
      {project && (
        <p className="mt-4 text-[13px] text-ink-soft leading-snug">
          Transaksi ini milik project {project.name}. Ubah atau batalkan dari halaman project.
        </p>
      )}
    </Modal>
  );
}
