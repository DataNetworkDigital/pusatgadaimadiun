import { formatCurrency } from './formatCurrency';
import { formatDate } from './formatDate';
import {
  projectSummary,
  findNextDuePayment,
  projectEndFromDuration,
  resolveTiers,
} from './projectSchedule';

const STATUS_LABEL = {
  active: 'Aktif',
  completed: 'Selesai',
  default: 'Macet',
};

// A4 usable width in mm: portrait with the default 14mm margins, landscape with
// the 6mm margins the Daftar Tagihan PDF already uses.
export const PORTRAIT_WIDTH = 182;
export const LANDSCAPE_WIDTH = 285;
const MIN_FLEX_WIDTH = 20;

// "5,5% / 6,5%" for tiered projects, "5,5%" when both tiers are the same or the
// project predates tiers.
export function formatTierPct(project) {
  const { tier1, tier2 } = resolveTiers(project);
  const fmt = (n) => `${String(n).replace('.', ',')}%`;
  return tier1 === tier2 ? fmt(tier1) : `${fmt(tier1)} / ${fmt(tier2)}`;
}

// Each column: `value` feeds Excel (numbers stay numbers), `text` feeds the PDF
// (always a string). `width` is the PDF column width in mm. Exactly one selected
// column with `flex: true` absorbs the leftover page width — the first one.
export const PROJECT_COLUMNS = [
  { key: 'no', label: 'No', defaultOn: true, width: 8, align: 'right',
    value: (p, ctx) => ctx.index + 1 },
  { key: 'name', label: 'Nama Project', defaultOn: true, width: 34, flex: true,
    value: (p) => p.name || '' },
  { key: 'owner', label: 'Pemilik', defaultOn: true, width: 26,
    value: (p) => p.ownerName || '' },
  { key: 'contract', label: 'No. Kontrak', defaultOn: false, width: 24,
    value: (p) => p.contractNumber || '' },
  { key: 'status', label: 'Status', defaultOn: true, width: 16,
    value: (p) => STATUS_LABEL[p.status] || p.status || '' },
  { key: 'startDate', label: 'Tanggal Mulai', defaultOn: true, width: 20,
    value: (p) => (p.startDate ? formatDate(p.startDate) : '') },
  { key: 'endDate', label: 'Tanggal Berakhir', defaultOn: true, width: 20,
    value: (p) => { const d = projectEndFromDuration(p); return d ? formatDate(d) : ''; } },
  { key: 'nextDue', label: 'Jatuh Tempo Berikutnya', defaultOn: true, width: 24,
    value: (p) => { const n = findNextDuePayment(p); return n ? formatDate(n.dueDate) : ''; } },
  { key: 'duration', label: 'Durasi (bulan)', defaultOn: true, width: 14, align: 'right',
    value: (p) => Number(p.durationMonths) || 0,
    text: (p) => `${Number(p.durationMonths) || 0} bln` },
  { key: 'principal', label: 'Nilai Project', defaultOn: false, width: 24, align: 'right',
    value: (p) => Number(p.principalAmount) || 0,
    text: (p) => formatCurrency(p.principalAmount) },
  { key: 'disbursed', label: 'Modal Keluar', defaultOn: true, width: 24, align: 'right',
    value: (p) => Number(p.disbursedAmount) || 0,
    text: (p) => formatCurrency(p.disbursedAmount) },
  { key: 'ratePct', label: 'Bagi Hasil', defaultOn: true, width: 22, align: 'right',
    value: (p) => formatTierPct(p) },
  { key: 'received', label: 'Sudah Diterima', defaultOn: true, width: 24, align: 'right',
    value: (p) => projectSummary(p).receivedSoFar,
    text: (p) => formatCurrency(projectSummary(p).receivedSoFar) },
  { key: 'remaining', label: 'Sisa Tagihan', defaultOn: true, width: 24, align: 'right',
    value: (p) => projectSummary(p).expectedRemaining,
    text: (p) => formatCurrency(projectSummary(p).expectedRemaining) },
  { key: 'net', label: 'Net', defaultOn: true, width: 24, align: 'right',
    value: (p) => projectSummary(p).netCashChange,
    text: (p) => formatCurrency(projectSummary(p).netCashChange) },
  { key: 'phone', label: 'No. HP', defaultOn: false, width: 24,
    value: (p) => p.phone || '' },
  { key: 'address', label: 'Alamat', defaultOn: false, width: 40, flex: true,
    value: (p) => p.address || '' },
  { key: 'collateral', label: 'Agunan', defaultOn: false, width: 30,
    value: (p) => p.collateral || '' },
  { key: 'nik', label: 'NIK', defaultOn: false, sensitive: true, width: 26,
    value: (p) => p.nik || '' },
  { key: 'sourceAccount', label: 'Rekening Sumber', defaultOn: false, width: 26,
    value: (p, ctx) => ctx.accountName(p.sourceAccountId) },
  { key: 'loss', label: 'Kerugian Final', defaultOn: false, width: 24, align: 'right',
    value: (p) => Number(p.lossAmount) || 0,
    text: (p) => formatCurrency(p.lossAmount || 0) },
  { key: 'closedAt', label: 'Tanggal Tutup', defaultOn: false, width: 20,
    value: (p) => (p.closedAt ? formatDate(p.closedAt) : '') },
  { key: 'note', label: 'Catatan', defaultOn: false, width: 40,
    value: (p) => p.description || '' },
  { key: 'proof', label: 'Bukti / Kontrak', defaultOn: false, width: 40,
    value: (p) => p.proofUrl || '' },
];

// Operates on a row produced by collectionRows() in projectExport.js.
export const COLLECTION_COLUMNS = [
  { key: 'due', label: 'Jatuh Tempo', defaultOn: true, width: 20, value: (r) => r.dueStr },
  { key: 'owner', label: 'Pemilik', defaultOn: true, width: 32, value: (r) => r.owner },
  { key: 'project', label: 'Project', defaultOn: true, width: 32, value: (r) => r.project },
  { key: 'phone', label: 'No. HP', defaultOn: true, width: 24, value: (r) => r.phone },
  { key: 'address', label: 'Alamat', defaultOn: true, width: 40, flex: true, value: (r) => r.address },
  { key: 'collateral', label: 'Agunan', defaultOn: true, width: 36, value: (r) => r.collateral },
  { key: 'start', label: 'Mulai', defaultOn: true, width: 20, value: (r) => r.startStr },
  { key: 'durasi', label: 'Durasi', defaultOn: true, width: 14, align: 'right',
    value: (r) => r.durasi, text: (r) => r.durasiStr },
  { key: 'end', label: 'Berakhir', defaultOn: true, width: 20, value: (r) => r.endStr },
  { key: 'jenis', label: 'Jenis', defaultOn: true, width: 18, value: (r) => r.jenis },
  { key: 'amount', label: 'Nominal', defaultOn: true, width: 27, align: 'right',
    value: (r) => r.amount, text: (r) => formatCurrency(r.amount) },
  { key: 'status', label: 'Status', defaultOn: true, width: 14, value: (r) => r.status },
  { key: 'paid', label: 'Tgl Bayar', defaultOn: true, width: 20, value: (r) => r.paidStr },
];

export function defaultKeys(columns) {
  return columns.filter((c) => c.defaultOn).map((c) => c.key);
}

// Registry order always wins, so the report layout is stable no matter what
// order the user ticked the boxes in.
export function pickColumns(columns, keys) {
  const wanted = new Set(keys && keys.length ? keys : defaultKeys(columns));
  const picked = columns.filter((c) => wanted.has(c.key));
  return picked.length ? picked : columns.filter((c) => c.defaultOn);
}

export function cellValue(col, item, ctx) {
  return col.value(item, ctx);
}

export function cellText(col, item, ctx) {
  if (col.text) return col.text(item, ctx);
  const v = col.value(item, ctx);
  return v == null ? '' : String(v);
}

// Fixed widths for every selected column except the first flexible one, which
// takes whatever space is left. Landscape kicks in as soon as the fixed widths
// stop fitting a portrait page.
export function pdfLayout(picked, opts = {}) {
  const portraitWidth = opts.portraitWidth ?? PORTRAIT_WIDTH;
  const landscapeWidth = opts.landscapeWidth ?? LANDSCAPE_WIDTH;
  const total = picked.reduce((s, c) => s + c.width, 0);
  const orientation = total > portraitWidth ? 'landscape' : 'portrait';
  const avail = orientation === 'landscape' ? landscapeWidth : portraitWidth;
  const flexIdx = picked.findIndex((c) => c.flex);

  const columnStyles = {};
  picked.forEach((c, i) => {
    if (i === flexIdx) return;
    columnStyles[i] = { cellWidth: c.width, ...(c.align ? { halign: c.align } : {}) };
  });
  if (flexIdx >= 0) {
    const fixed = picked.reduce((s, c, i) => (i === flexIdx ? s : s + c.width), 0);
    const flex = picked[flexIdx];
    columnStyles[flexIdx] = {
      cellWidth: Math.max(MIN_FLEX_WIDTH, avail - fixed),
      ...(flex.align ? { halign: flex.align } : {}),
    };
  }
  return { orientation, columnStyles };
}
