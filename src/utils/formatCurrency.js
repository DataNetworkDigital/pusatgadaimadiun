export function formatCurrency(value, withSymbol = true) {
  const n = Number(value || 0);
  const formatted = new Intl.NumberFormat('id-ID', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(Math.abs(n));
  const sign = n < 0 ? '-' : '';
  return withSymbol ? `${sign}Rp ${formatted}` : `${sign}${formatted}`;
}

export function parseCurrency(str) {
  if (typeof str === 'number') return str;
  if (!str) return 0;
  const digits = String(str).replace(/[^\d]/g, '');
  return digits ? parseInt(digits, 10) : 0;
}

export function formatCurrencyInput(value) {
  const num = parseCurrency(value);
  if (num === 0) return '';
  return new Intl.NumberFormat('id-ID').format(num);
}
