import { IcCheck } from '../common/icons';

// Presentational checkbox list. The parent owns the selected keys.
export default function ColumnPicker({ columns, selected, onToggle }) {
  return (
    <div className="space-y-1.5 max-h-[46vh] overflow-y-auto pr-1">
      {columns.map((c) => {
        const on = selected.includes(c.key);
        return (
          <button
            key={c.key}
            type="button"
            onClick={() => onToggle(c.key)}
            className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl bg-paper border border-line text-left active:bg-cream-deep transition"
          >
            <span
              className={`w-5 h-5 rounded-md border flex items-center justify-center flex-shrink-0 ${
                on ? 'bg-indigo border-indigo' : 'border-line bg-paper'
              }`}
            >
              {on && <IcCheck size={14} stroke="#F8F1E2" sw={2.6} />}
            </span>
            <span className="flex-1 min-w-0 text-[14px] text-ink">{c.label}</span>
            {c.sensitive && (
              <span className="text-[11px] text-terra font-semibold flex-shrink-0">sensitif</span>
            )}
          </button>
        );
      })}
    </div>
  );
}
