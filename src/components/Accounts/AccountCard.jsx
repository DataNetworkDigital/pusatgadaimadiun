import { formatCurrency } from '../../utils/formatCurrency';
import { IcChevronRight, IcTrash } from '../common/icons';

const COLOR_PALETTE = ['#2D4A6B', '#5C8A4E', '#B85450', '#4A7BA0', '#C9952F', '#8B6F47'];

function colorForName(name = '') {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) | 0;
  return COLOR_PALETTE[Math.abs(h) % COLOR_PALETTE.length];
}

export default function AccountCard({ account, onEdit, onDelete }) {
  const avatarBg = colorForName(account.name);
  return (
    <div className="bg-paper rounded-2xl border border-line shadow-card p-3.5 flex items-center gap-3.5">
      <button
        type="button"
        onClick={() => onEdit(account)}
        className="flex items-center gap-3.5 flex-1 min-w-0 text-left active:opacity-80 transition"
      >
        <div
          className="w-[50px] h-[50px] rounded-[14px] flex items-center justify-center text-white font-display text-[16px] font-semibold flex-shrink-0"
          style={{ background: avatarBg }}
        >
          {account.name.slice(0, 2).toUpperCase()}
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-[16px] font-semibold text-ink truncate">{account.name}</div>
          {account.accountNumber && (
            <div className="text-[12px] text-ink-mute mt-0.5 truncate">{account.accountNumber}</div>
          )}
          <div
            className="font-num text-[18px] font-semibold text-ink mt-1"
            style={{ fontVariantNumeric: 'tabular-nums' }}
          >
            {formatCurrency(account.balance)}
          </div>
        </div>
        <IcChevronRight size={18} stroke="#8B7558" />
      </button>
      <button
        type="button"
        onClick={() => onDelete(account)}
        aria-label={`Hapus ${account.name}`}
        className="w-9 h-9 rounded-xl bg-terra-soft text-terra flex items-center justify-center flex-shrink-0 active:opacity-80 transition"
      >
        <IcTrash size={16} sw={2} />
      </button>
    </div>
  );
}
