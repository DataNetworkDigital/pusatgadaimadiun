import { DAYS, isSameDay, toDate } from '../../utils/formatDate';

export default function CalendarGrid({ month, transactions, debts, reminders, selected, onSelect }) {
  const year = month.getFullYear();
  const m = month.getMonth();
  const first = new Date(year, m, 1);
  const startDay = first.getDay();
  const daysInMonth = new Date(year, m + 1, 0).getDate();
  const today = new Date();

  const cells = [];
  for (let i = 0; i < startDay; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(new Date(year, m, d));
  while (cells.length % 7 !== 0) cells.push(null);

  function indicators(date) {
    let income = false, expense = false, transfer = false, dueDebt = false, reminder = false;
    transactions.forEach((tx) => {
      if (isSameDay(toDate(tx.date), date)) {
        if (tx.type === 'income') income = true;
        else if (tx.type === 'expense') expense = true;
        else transfer = true;
      }
    });
    debts.forEach((d) => {
      if (d.status !== 'paid' && isSameDay(toDate(d.dueDate), date)) dueDebt = true;
    });
    reminders.forEach((r) => {
      if (r.isActive && r.dayOfMonth === date.getDate()) reminder = true;
    });
    return { income, expense, transfer, dueDebt, reminder };
  }

  return (
    <div className="card">
      <div className="grid grid-cols-7 text-center text-xs font-semibold text-gray-500 mb-2">
        {DAYS.map((d) => <div key={d}>{d}</div>)}
      </div>
      <div className="grid grid-cols-7 gap-1">
        {cells.map((date, i) => {
          if (!date) return <div key={i} />;
          const isToday = isSameDay(date, today);
          const isSel = selected && isSameDay(date, selected);
          const ind = indicators(date);
          return (
            <button
              key={i}
              onClick={() => onSelect(date)}
              className={
                'aspect-square rounded-lg flex flex-col items-center justify-center text-sm relative transition ' +
                (isSel ? 'bg-primary text-white font-semibold' : isToday ? 'bg-primary-50 text-primary font-semibold' : 'text-gray-700 hover:bg-gray-50')
              }
            >
              <span>{date.getDate()}</span>
              <div className="flex gap-0.5 mt-0.5 h-1.5">
                {ind.income && <span className="w-1 h-1 rounded-full bg-income" />}
                {ind.expense && <span className="w-1 h-1 rounded-full bg-expense" />}
                {ind.transfer && <span className="w-1 h-1 rounded-full bg-transfer" />}
                {ind.dueDebt && <span className="w-1 h-1 rounded-full bg-warning" />}
                {ind.reminder && <span className="w-1 h-1 rounded-full bg-primary" />}
              </div>
            </button>
          );
        })}
      </div>
      <div className="flex flex-wrap gap-3 mt-4 text-[11px] text-gray-500">
        <span className="flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-income" /> Pemasukan</span>
        <span className="flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-expense" /> Pengeluaran</span>
        <span className="flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-transfer" /> Transfer</span>
        <span className="flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-warning" /> Jatuh Tempo</span>
        <span className="flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-primary" /> Reminder</span>
      </div>
    </div>
  );
}
