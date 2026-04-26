import { formatCurrency } from '../../utils/formatCurrency';

export default function AccountCard({ account, onEdit, onDelete }) {
  return (
    <div className="card flex items-center gap-3">
      <div className="w-11 h-11 rounded-xl bg-primary-50 text-primary flex items-center justify-center font-bold">
        {account.name.slice(0, 2).toUpperCase()}
      </div>
      <div className="flex-1 min-w-0">
        <div className="font-semibold text-gray-900 truncate">{account.name}</div>
        {account.accountNumber && (
          <div className="text-xs text-gray-500 truncate">{account.accountNumber}</div>
        )}
        <div className="text-base font-bold text-gray-900 mt-0.5">{formatCurrency(account.balance)}</div>
      </div>
      <div className="flex flex-col gap-1">
        <button onClick={() => onEdit(account)} className="text-xs text-primary px-3 py-1.5 rounded-md bg-primary-50 active:bg-primary-100">Edit</button>
        <button onClick={() => onDelete(account)} className="text-xs text-expense px-3 py-1.5 rounded-md bg-expense-bg active:opacity-80">Hapus</button>
      </div>
    </div>
  );
}
