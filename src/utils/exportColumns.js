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
const MIN_FLEX_WIDTH = 20; // mm; what a flex column gets while there is room to spare
const MIN_ABS_WIDTH = 8; // mm; absolute last-resort floor once even proportional shrinking can't fit

// "5,5% / 6,5%" for tiered projects, "5,5%" when both tiers are the same or the
// project predates tiers. A tier that isn't a finite number (corrupt/legacy
// data) is dropped rather than rendered as "NaN%"; if nothing finite is left,
// falls back to '-' like the rest of this codebase does for unknown values
// (see formatDate).
export function formatTierPct(project) {
  const { tier1, tier2 } = resolveTiers(project);
  const fmt = (n) => `${String(n).replace('.', ',')}%`;
  const distinct = [...new Set([tier1, tier2].filter((n) => Number.isFinite(n)))];
  if (!distinct.length) return '-';
  if (distinct.length === 1) return fmt(distinct[0]);
  return `${fmt(distinct[0])} / ${fmt(distinct[1])}`;
}

// Each column: `value` feeds Excel (numbers stay numbers), `text` feeds the PDF
// (always a string). `width` is the PDF column width in mm. Every selected
// column with `flex: true` shares the leftover page width evenly.
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
    text: (p) => formatCurrency(Number(p.principalAmount) || 0) },
  { key: 'disbursed', label: 'Modal Keluar', defaultOn: true, width: 24, align: 'right',
    value: (p) => Number(p.disbursedAmount) || 0,
    text: (p) => formatCurrency(Number(p.disbursedAmount) || 0) },
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
    text: (p) => formatCurrency(Number(p.lossAmount) || 0) },
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

// One bad cell (a throwing accessor, unexpected data shape, etc.) must not
// take down the whole export — degrade just that cell to '' and let the rest
// of the row render.
export function cellValue(col, item, ctx) {
  try {
    return col.value(item, ctx);
  } catch {
    return '';
  }
}

export function cellText(col, item, ctx) {
  try {
    if (col.text) return col.text(item, ctx);
    const v = col.value(item, ctx);
    return v == null ? '' : String(v);
  } catch {
    return '';
  }
}

// Shrinks `widths` (mutated copy returned, input untouched) so they sum to at
// most `avail`, never letting any single column go below MIN_ABS_WIDTH unless
// avail itself can't fit MIN_ABS_WIDTH per column (a selection so wide no
// layout could save it). One scale-and-floor pass is not enough: flooring a
// column that would have shrunk below MIN_ABS_WIDTH gives it back more than
// its fair share, which can itself push a *different*, previously-fine column
// below the floor. So this pins columns to the floor one round at a time and
// re-solves the remaining "free" columns against the remaining budget, same
// idea as CSS flexbox min-width resolution — until nothing new gets pinned.
// Bounded by the column count, so it always terminates.
function shrinkToFit(widths, avail) {
  const total = widths.reduce((s, w) => s + w, 0);
  if (total <= avail) return widths.slice();

  const out = widths.slice();
  const pinned = new Array(out.length).fill(false);
  for (let pass = 0; pass < out.length; pass++) {
    const pinnedTotal = out.reduce((s, w, i) => (pinned[i] ? s + w : s), 0);
    const freeTotal = out.reduce((s, w, i) => (pinned[i] ? s : s + w), 0);
    if (freeTotal <= 0) break;
    const factor = (avail - pinnedTotal) / freeTotal;
    let pinnedMore = false;
    out.forEach((w, i) => {
      if (pinned[i]) return;
      const scaled = w * factor;
      if (scaled <= MIN_ABS_WIDTH) {
        out[i] = MIN_ABS_WIDTH;
        pinned[i] = true;
        pinnedMore = true;
      } else {
        out[i] = scaled;
      }
    });
    if (!pinnedMore) break;
  }
  return out;
}

// Fixed widths for every selected column except the flexible ones, which
// share the leftover page width evenly. Landscape kicks in as soon as the
// *declared* widths stop fitting a portrait page. Whatever the declared
// widths add up to, the final layout is shrunk (see shrinkToFit) so the table
// always fits the chosen page — it never just overflows off the edge.
export function pdfLayout(picked, opts = {}) {
  const portraitWidth = opts.portraitWidth ?? PORTRAIT_WIDTH;
  const landscapeWidth = opts.landscapeWidth ?? LANDSCAPE_WIDTH;
  const declaredTotal = picked.reduce((s, c) => s + c.width, 0);
  const orientation = declaredTotal > portraitWidth ? 'landscape' : 'portrait';
  const avail = orientation === 'landscape' ? landscapeWidth : portraitWidth;

  const flexCols = picked.filter((c) => c.flex);
  const nonFlexTotal = picked.reduce((s, c) => (c.flex ? s : s + c.width), 0);
  const leftover = avail - nonFlexTotal;
  const flexShare = flexCols.length ? Math.max(MIN_FLEX_WIDTH, leftover / flexCols.length) : 0;
  const rawWidths = picked.map((c) => (c.flex ? flexShare : c.width));

  // Whole millimetres, like every other width in this file, and immune to a
  // float sum ever landing a hair above `avail`.
  const widths = shrinkToFit(rawWidths, avail).map((w) => Math.floor(w));

  const columnStyles = {};
  picked.forEach((c, i) => {
    columnStyles[i] = { cellWidth: widths[i], ...(c.align ? { halign: c.align } : {}) };
  });
  return { orientation, columnStyles };
}
