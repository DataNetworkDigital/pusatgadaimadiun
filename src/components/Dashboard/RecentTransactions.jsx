import { Link } from 'react-router-dom';
import { formatCurrency } from '../../utils/formatCurrency';
import { formatDate } from '../../utils/formatDate';
import { useDemo } from '../../contexts/DemoContext';
import SectionTitle from '../common/SectionTitle';
import Card from '../common/Card';
import { IcArrowDown, IcArrowUp, IcSwap } from '../common/icons';

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

function TxRow({ tx, accountName, isLast }) {
  const isIncome = tx.type === 'income';
  const isTransfer = tx.type === 'transfer';
  const sign = isIncome ? '+' : isTransfer ? '' : '−';
  const amountColor = isIncome ? 'text-daun' : isTransfer ? 'text-langit' : 'text-terra';
  const account = isTransfer
    ? `${accountName(tx.fromAccount)} → ${accountName(tx.toAccount)}`
    : accountName(isIncome ? tx.toAccount : tx.fromAccount);
  return (
    <div className={`flex items-center gap-3 py-3.5 ${isLast ? '' : 'border-b border-line-soft'}`}>
      <TxIcon type={tx.type} />
      <div className="flex-1 min-w-0">
        <div className="text-[16px] font-medium text-ink leading-tight truncate">
          {tx.description || (isIncome ? 'Pemasukan' : isTransfer ? 'Transfer' : 'Pengeluaran')}
        </div>
        <div className="text-[13px] text-ink-mute mt-0.5 truncate">
          {account} · {formatDate(tx.date, { short: true })}
        </div>
      </div>
      <div
        className={`font-num text-[16px] font-semibold whitespace-nowrap ${amountColor}`}
        style={{ fontVariantNumeric: 'tabular-nums' }}
      >
        {sign}
        {formatCurrency(tx.amount, false)}
      </div>
    </div>
  );
}

export default function RecentTransactions({ transactions, accounts }) {
  const { isDemo } = useDemo();
  const base = isDemo ? '/demo' : '';
  const accountName = (id) => accounts.find((a) => a.id === id)?.name || '—';

  if (!transactions.length) {
    return (
      <Card>
        <h3 className="font-display text-[19px] font-semibold text-ink tracking-tight mb-2">
          Transaksi Terakhir
        </h3>
        <p className="text-sm text-ink-mute py-6 text-center">Belum ada transaksi.</p>
      </Card>
    );
  }

  return (
    <div>
      <SectionTitle
        action={
          <Link to={`${base}/transaksi`} className="text-[13px] font-semibold text-indigo">
            Lihat semua →
          </Link>
        }
      >
        Transaksi Terakhir
      </SectionTitle>
      <Card className="!px-4 !py-1">
        {transactions.map((tx, i) => (
          <TxRow key={tx.id} tx={tx} accountName={accountName} isLast={i === transactions.length - 1} />
        ))}
      </Card>
    </div>
  );
}
