import { formatCurrency } from '../../utils/formatCurrency';
import { monthLabel } from '../../utils/formatDate';
import KawungMark from '../common/KawungMark';
import BatikPattern from '../common/BatikPattern';
import { IcArrowDown, IcArrowUp } from '../common/icons';

export default function BalanceSummary({ totalBalance, income, expense }) {
  const month = monthLabel(new Date());
  return (
    <div className="bg-indigo text-cream rounded-[22px] p-[22px] relative overflow-hidden shadow-hero">
      <BatikPattern opacity={0.1} color="#F8F1E2" />
      <div className="relative z-[1]">
        <div className="flex items-center justify-between mb-3.5">
          <div className="flex items-center gap-2.5">
            <KawungMark size={32} color="#F8F1E2" bg="transparent" />
            <div>
              <div className="font-display text-[13px] tracking-[0.5px] opacity-85">BUKU TABUNGAN</div>
              <div className="text-[11px] opacity-70">Pusat Gadai Madiun</div>
            </div>
          </div>
          <div className="text-[11px] opacity-75">{month}</div>
        </div>

        <div className="text-[12px] uppercase tracking-[0.3px] opacity-80">Total Saldo</div>
        <div
          className="font-display font-semibold text-[36px] leading-tight mt-0.5 tracking-[-0.5px] break-words"
          style={{ fontVariantNumeric: 'tabular-nums' }}
        >
          {formatCurrency(totalBalance)}
        </div>

        <div className="grid grid-cols-2 gap-2.5 mt-[18px] pt-3.5 border-t border-cream/20">
          <div>
            <div className="flex items-center gap-1.5 text-[11px] opacity-80">
              <IcArrowDown size={13} sw={2.2} /> Masuk
            </div>
            <div
              className="font-num font-semibold text-[17px] mt-0.5"
              style={{ fontVariantNumeric: 'tabular-nums' }}
            >
              {formatCurrency(income, false)}
            </div>
          </div>
          <div>
            <div className="flex items-center gap-1.5 text-[11px] opacity-80">
              <IcArrowUp size={13} sw={2.2} /> Keluar
            </div>
            <div
              className="font-num font-semibold text-[17px] mt-0.5"
              style={{ fontVariantNumeric: 'tabular-nums' }}
            >
              {formatCurrency(expense, false)}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
