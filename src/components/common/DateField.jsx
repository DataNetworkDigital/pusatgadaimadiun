import { useEffect, useState } from 'react';
import { IcCalendar } from './icons';

// DateField keeps the same data contract as <input type="date">:
// `value` and `onChange` both use the ISO string yyyy-mm-dd. Only the
// VISIBLE format is dd/mm/yyyy, so the rest of the app is unaffected.
// A transparent native date input overlays the calendar icon so the OS
// date picker still works on every device, regardless of browser locale.

function isoToDisplay(iso) {
  const m = String(iso || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : '';
}

function displayToIso(str) {
  const m = str.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (!m) return null;
  const dd = +m[1];
  const mm = +m[2];
  const yyyy = +m[3];
  if (mm < 1 || mm > 12) return null;
  const maxDay = new Date(yyyy, mm, 0).getDate();
  if (dd < 1 || dd > maxDay) return null;
  return `${m[3]}-${m[2]}-${m[1]}`;
}

function autoFormat(raw) {
  const digits = raw.replace(/\D/g, '').slice(0, 8);
  if (digits.length <= 2) return digits;
  if (digits.length <= 4) return `${digits.slice(0, 2)}/${digits.slice(2)}`;
  return `${digits.slice(0, 2)}/${digits.slice(2, 4)}/${digits.slice(4)}`;
}

export default function DateField({ value, onChange, disabled = false, min, max, id, name }) {
  const [text, setText] = useState(isoToDisplay(value));

  // Keep the visible text in sync when the value changes externally
  // (form reset, picker selection, auto-follow logic, etc.)
  useEffect(() => {
    setText(isoToDisplay(value));
  }, [value]);

  function handleTextChange(e) {
    const formatted = autoFormat(e.target.value);
    setText(formatted);
    const iso = displayToIso(formatted);
    if (iso) onChange(iso);
  }

  function handleBlur() {
    // Snap back to the last valid value if left incomplete/invalid
    if (displayToIso(text) == null) setText(isoToDisplay(value));
  }

  return (
    <div className="relative">
      <input
        id={id}
        name={name}
        type="text"
        inputMode="numeric"
        autoComplete="off"
        placeholder="dd/mm/yyyy"
        className="input-field pr-11"
        value={text}
        onChange={handleTextChange}
        onBlur={handleBlur}
        disabled={disabled}
      />
      <span
        className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-ink-soft"
        aria-hidden="true"
      >
        <IcCalendar size={18} sw={1.9} />
      </span>
      <input
        type="date"
        value={value || ''}
        min={min}
        max={max}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
        onClick={(e) => {
          try {
            e.currentTarget.showPicker?.();
          } catch {
            /* showPicker unsupported — native click still opens it */
          }
        }}
        aria-label="Pilih tanggal"
        className="absolute right-0 top-0 h-full w-11 opacity-0 cursor-pointer disabled:cursor-not-allowed"
      />
    </div>
  );
}
