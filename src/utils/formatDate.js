const MONTHS = [
  'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
  'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember',
];
const MONTHS_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];
const DAYS = ['Min', 'Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab'];

export function toDate(value) {
  if (!value) return null;
  if (value instanceof Date) return value;
  if (typeof value?.toDate === 'function') return value.toDate();
  if (typeof value === 'number' || typeof value === 'string') return new Date(value);
  if (value.seconds) return new Date(value.seconds * 1000);
  return null;
}

export function formatDate(value, opts = {}) {
  const d = toDate(value);
  if (!d) return '-';
  const { withYear = true, short = false } = opts;
  const months = short ? MONTHS_SHORT : MONTHS;
  const month = months[d.getMonth()];
  return withYear ? `${d.getDate()} ${month} ${d.getFullYear()}` : `${d.getDate()} ${month}`;
}

export function formatDateInput(value) {
  const d = toDate(value) || new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

export function fromDateInput(str) {
  if (!str) return new Date();
  const [y, m, d] = str.split('-').map(Number);
  return new Date(y, m - 1, d);
}

export function monthLabel(date) {
  const d = toDate(date) || new Date();
  return `${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
}

export function isSameDay(a, b) {
  const da = toDate(a);
  const db = toDate(b);
  if (!da || !db) return false;
  return da.getFullYear() === db.getFullYear() && da.getMonth() === db.getMonth() && da.getDate() === db.getDate();
}

export function startOfMonth(date) {
  const d = toDate(date) || new Date();
  return new Date(d.getFullYear(), d.getMonth(), 1);
}

export function endOfMonth(date) {
  const d = toDate(date) || new Date();
  return new Date(d.getFullYear(), d.getMonth() + 1, 0, 23, 59, 59, 999);
}

export function daysBetween(a, b) {
  const da = toDate(a);
  const db = toDate(b);
  if (!da || !db) return 0;
  const ms = db.setHours(0, 0, 0, 0) - da.setHours(0, 0, 0, 0);
  return Math.round(ms / (1000 * 60 * 60 * 24));
}

export { MONTHS, MONTHS_SHORT, DAYS };
