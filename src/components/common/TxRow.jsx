import { formatCurrency } from '../../utils/formatCurrency';
import { formatDate } from '../../utils/formatDate';
import { IcArrowDown, IcArrowUp, IcSwap } from './icons';

function TxIcon({ type }) {
  const palette =
    type === 'income'
      ? { bg: 'bg-daun-soft', stroke: '#5C8A4E', Icon: IcArrowDown }
      : type === 'transfer'
      ? { bg: 'bg-langit-soft', stroke: '#4A7BA0', Icon: IcSwap }
      : { bg: 'bg-terra-soft', stroke: '#B85450', Icon: IcArrowUp };
  const { Icon } = palette;
  return (
    <div className={`w-[42px] h-[42px] rounded-xl flex items-center justify-center flex-shrink-0 ${palette.bg}`}>
      <Icon size={20} stroke={palette.stroke} sw={2} />
    </div>
  );
}

export default function TxRow({ tx, accountName, onClick, isLast, showDate = true }) {
  const isIncome = tx.type === 'income';
  const isTransfer = tx.type === 'transfer';
  const sign = isIncome ? '+' : isTransfer ? '' : '−';
  const amountColor = isIncome ? 'text-daun' : isTransfer ? 'text-langit' : 'text-terra';
  const account = isTransfer
    ? `${accountName(tx.fromAccount)} → ${accountName(tx.toAccount)}`
    : accountName(isIncome ? tx.toAccount : tx.fromAccount);
  const Tag = onClick ? 'button' : 'div';
  return (
    <Tag
      type={onClick ? 'button' : undefined}
      onClick={onClick}
      className={`w-full text-left flex items-center gap-3 py-3.5 ${isLast ? '' : 'border-b border-line-soft'} ${onClick ? 'active:bg-cream-deep/40 transition' : ''}`}
    >
      <TxIcon type={tx.type} />
      <div className="flex-1 min-w-0">
        <div className="text-[16px] font-medium text-ink leading-tight truncate">
          {tx.description || (isIncome ? 'Pemasukan' : isTransfer ? 'Transfer' : 'Pengeluaran')}
        </div>
        <div className="text-[13px] text-ink-mute mt-0.5 truncate">
          {account}
          {showDate && tx.date ? ` · ${formatDate(tx.date, { short: true })}` : ''}
        </div>
      </div>
      <div
        className={`font-num text-[16px] font-semibold whitespace-nowrap ${amountColor}`}
        style={{ fontVariantNumeric: 'tabular-nums' }}
      >
        {sign}
        {formatCurrency(tx.amount, false)}
      </div>
    </Tag>
  );
}

export { TxIcon };
