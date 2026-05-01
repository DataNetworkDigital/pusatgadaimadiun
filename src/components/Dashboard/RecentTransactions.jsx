import { Link } from 'react-router-dom';
import { useDemo } from '../../contexts/DemoContext';
import SectionTitle from '../common/SectionTitle';
import Card from '../common/Card';
import TxRow from '../common/TxRow';

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
