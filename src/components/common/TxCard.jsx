import { formatCurrency } from '../../utils/formatCurrency';
import { IcArrowDown, IcArrowUp, IcSwap } from './icons';

const PALETTES = {
  income: {
    bg: 'bg-daun-soft',
    border: 'border-daun/40',
    accent: 'bg-daun',
    accentText: 'text-daun',
    label: 'MASUK',
    Icon: IcArrowDown,
    sign: '+',
  },
  expense: {
    bg: 'bg-terra-soft',
    border: 'border-terra/40',
    accent: 'bg-terra',
    accentText: 'text-terra',
    label: 'KELUAR',
    Icon: IcArrowUp,
    sign: '−',
  },
  transfer: {
    bg: 'bg-langit-soft',
    border: 'border-langit/40',
    accent: 'bg-langit',
    accentText: 'text-langit',
    label: 'TRANSFER',
    Icon: IcSwap,
    sign: '',
  },
};

export default function TxCard({ tx, accountName, onClick }) {
  const p = PALETTES[tx.type] || PALETTES.expense;
  const account =
    tx.type === 'transfer'
      ? `${accountName(tx.fromAccount)} → ${accountName(tx.toAccount)}`
      : accountName(tx.type === 'income' ? tx.toAccount : tx.fromAccount);
  return (
    <button
      type="button"
      onClick={onClick}
      className={`w-full text-left rounded-[14px] border px-4 py-3.5 flex items-center gap-3 ${p.bg} ${p.border} active:opacity-80 transition`}
    >
      <div className={`w-[38px] h-[38px] rounded-[11px] text-white flex items-center justify-center flex-shrink-0 ${p.accent}`}>
        <p.Icon size={18} stroke="#ffffff" sw={2.2} />
      </div>
      <div className="flex-1 min-w-0">
        <span className={`text-[10px] font-bold tracking-[0.5px] ${p.accentText}`}>{p.label}</span>
        <div className="text-[15px] font-semibold text-ink leading-tight mt-0.5 truncate">
          {tx.description || (tx.type === 'income' ? 'Pemasukan' : tx.type === 'transfer' ? 'Transfer' : 'Pengeluaran')}
        </div>
        <div className="text-[12px] text-ink-soft mt-0.5 truncate">{account}</div>
      </div>
      <div
        className={`font-num text-[17px] font-bold whitespace-nowrap ${p.accentText}`}
        style={{ fontVariantNumeric: 'tabular-nums' }}
      >
        {p.sign}
        {formatCurrency(tx.amount, false)}
      </div>
    </button>
  );
}
