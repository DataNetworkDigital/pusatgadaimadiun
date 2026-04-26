import { formatCurrencyInput, parseCurrency } from '../../utils/formatCurrency';

export default function CurrencyInput({ value, onChange, placeholder = '0', autoFocus, id }) {
  const display = formatCurrencyInput(value);
  return (
    <div className="relative">
      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 font-medium">Rp</span>
      <input
        id={id}
        type="text"
        inputMode="numeric"
        autoFocus={autoFocus}
        className="input-field pl-12 text-right font-semibold text-lg"
        value={display}
        placeholder={placeholder}
        onChange={(e) => onChange(parseCurrency(e.target.value))}
      />
    </div>
  );
}
