import { DAYS, isSameDay, toDate, monthLabel } from '../../utils/formatDate';
import { IcChevronLeft, IcChevronRight } from '../common/icons';
import Card from '../common/Card';

export default function CalendarGrid({
  month,
  transactions,
  debts,
  reminders,
  selected,
  onSelect,
  onPrev,
  onNext,
}) {
  const year = month.getFullYear();
  const m = month.getMonth();
  const startDay = new Date(year, m, 1).getDay();
  const daysInMonth = new Date(year, m + 1, 0).getDate();
  const today = new Date();

  const cells = [];
  for (let i = 0; i < startDay; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(new Date(year, m, d));

  function indicators(date) {
    let hasInc = false;
    let hasExp = false;
    let hasTr = false;
    let hasDue = false;
    let hasRem = false;
    transactions.forEach((tx) => {
      if (isSameDay(toDate(tx.date), date)) {
        if (tx.type === 'income') hasInc = true;
        else if (tx.type === 'expense') hasExp = true;
        else hasTr = true;
      }
    });
    debts.forEach((d) => {
      if (d.status !== 'paid' && isSameDay(toDate(d.dueDate), date)) hasDue = true;
    });
    reminders.forEach((r) => {
      if (r.isActive && r.dayOfMonth === date.getDate()) hasRem = true;
    });
    return { hasInc, hasExp, hasTr, hasDue, hasRem };
  }

  return (
    <Card className="!p-4">
      <div className="flex items-center justify-between mb-3.5">
        <button
          type="button"
          onClick={onPrev}
          aria-label="Bulan sebelumnya"
          className="w-10 h-10 rounded-xl bg-paper border border-line text-ink flex items-center justify-center active:bg-cream-deep"
        >
          <IcChevronLeft size={18} sw={1.9} />
        </button>
        <div className="font-display text-[18px] font-semibold text-ink">{monthLabel(month)}</div>
        <button
          type="button"
          onClick={onNext}
          aria-label="Bulan berikutnya"
          className="w-10 h-10 rounded-xl bg-paper border border-line text-ink flex items-center justify-center active:bg-cream-deep"
        >
          <IcChevronRight size={18} sw={1.9} />
        </button>
      </div>

      <div className="grid grid-cols-7 gap-0.5 text-[11px] font-semibold text-ink-mute pb-2">
        {DAYS.map((d) => (
          <div key={d} className="text-center tracking-[0.3px]">
            {d}
          </div>
        ))}
      </div>

      <div className="grid grid-cols-7 gap-0.5">
        {cells.map((date, i) => {
          if (!date) return <div key={i} aria-hidden />;
          const isToday = isSameDay(date, today);
          const isSel = selected && isSameDay(date, selected);
          const ind = indicators(date);
          const dotBase = 'w-1 h-1 rounded-full';
          const dotColor = (color) => (isSel ? 'bg-cream' : color);
          const cellStyle = isSel
            ? 'bg-indigo text-cream font-semibold'
            : isToday
            ? 'bg-indigo-soft text-indigo font-semibold'
            : 'text-ink hover:bg-cream-deep/40';
          return (
            <button
              type="button"
              key={i}
              onClick={() => onSelect(date)}
              className={`aspect-square rounded-xl flex flex-col items-center justify-center text-[14px] transition ${cellStyle}`}
            >
              <span>{date.getDate()}</span>
              <div className="flex gap-0.5 mt-0.5 h-1">
                {ind.hasInc && <span className={`${dotBase} ${dotColor('bg-daun')}`} />}
                {ind.hasExp && <span className={`${dotBase} ${dotColor('bg-terra')}`} />}
                {ind.hasTr && <span className={`${dotBase} ${dotColor('bg-langit')}`} />}
                {ind.hasDue && <span className={`${dotBase} ${dotColor('bg-emas')}`} />}
                {ind.hasRem && <span className={`${dotBase} ${dotColor('bg-emas')}`} />}
              </div>
            </button>
          );
        })}
      </div>

      <div className="flex flex-wrap gap-3 mt-4 text-[11px] text-ink-mute">
        <span className="flex items-center gap-1">
          <span className="w-1.5 h-1.5 rounded-full bg-daun" /> Pemasukan
        </span>
        <span className="flex items-center gap-1">
          <span className="w-1.5 h-1.5 rounded-full bg-terra" /> Pengeluaran
        </span>
        <span className="flex items-center gap-1">
          <span className="w-1.5 h-1.5 rounded-full bg-langit" /> Transfer
        </span>
        <span className="flex items-center gap-1">
          <span className="w-1.5 h-1.5 rounded-full bg-emas" /> Reminder / Tempo
        </span>
      </div>
    </Card>
  );
}
