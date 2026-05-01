import Card from '../common/Card';
import SectionTitle from '../common/SectionTitle';

export default function MonthlyChart({ data }) {
  const maxBar = Math.max(1, ...data.flatMap((d) => [d.Pemasukan, d.Pengeluaran]));
  return (
    <div>
      <SectionTitle>Pemasukan vs Pengeluaran</SectionTitle>
      <Card>
        <div className="flex items-end gap-2.5 h-[140px] px-1 pt-1">
          {data.map((d) => (
            <div key={d.label} className="flex-1 flex flex-col items-center gap-1 h-full">
              <div className="flex-1 w-full flex items-end gap-[3px]">
                <div
                  className="flex-1 bg-daun rounded-t-[4px]"
                  style={{ height: `${(d.Pemasukan / maxBar) * 100}%`, minHeight: 2 }}
                />
                <div
                  className="flex-1 bg-terra rounded-t-[4px]"
                  style={{ height: `${(d.Pengeluaran / maxBar) * 100}%`, minHeight: 2 }}
                />
              </div>
              <div className="text-[11px] font-medium text-ink-mute">{d.label}</div>
            </div>
          ))}
        </div>
        <div className="flex gap-4 mt-3 pt-3 border-t border-line-soft">
          <div className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-[3px] bg-daun" />
            <span className="text-[12px] text-ink-soft">Pemasukan</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-[3px] bg-terra" />
            <span className="text-[12px] text-ink-soft">Pengeluaran</span>
          </div>
        </div>
      </Card>
    </div>
  );
}
