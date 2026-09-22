# Bagian A — Pilih Kolom Download + Kolom Tanggal Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let the owner choose which columns go into every project download, and add the date columns the projects PDF is missing today.

**Architecture:** One pure column registry (`src/utils/exportColumns.js`) describes every column once: its label, whether it is on by default, its PDF width, how to read its raw value (Excel) and its display text (PDF). `projectExport.js` stops hard-coding column lists and renders whatever the registry hands it. `ExportSheet` gains a "Pilih kolom" step whose selection is remembered in `localStorage`. PDF orientation is derived from the selected widths instead of being fixed.

**Tech Stack:** React 19, Vite 8, Tailwind, `xlsx`, `jspdf` + `jspdf-autotable`, Vitest (added in Task 1).

**Spec:** `docs/superpowers/specs/2026-09-22-pembayaran-jadwal-download-design.md`, section 5.

**Branch:** work on `feat/kolom-download`, cut from `spec/pembayaran-cicilan-jadwal-download` (which holds the spec). Do **not** push to `main`: every push to `main` deploys the live app.

---

## File Structure

| File | Responsibility |
|---|---|
| `src/utils/exportColumns.js` (create) | Column registries (projects, Daftar Tagihan), selection helpers, PDF width/orientation maths. Pure, no I/O. |
| `src/utils/exportPrefs.js` (create) | Read/write the remembered column selection in `localStorage`. Pure wrapper with try/catch. |
| `src/utils/projectSchedule.js` (modify) | Gains `projectEndDate` and `projectEndFromDuration`, moved out of `projectExport.js` so the registry can use them without a circular import. |
| `src/utils/projectExport.js` (modify) | Renders Excel sheets and PDF tables from the selected columns. Loses its hard-coded column lists. |
| `src/components/Projects/ColumnPicker.jsx` (create) | The checkbox list UI. Presentational only. |
| `src/components/Projects/ExportSheet.jsx` (modify) | Adds the "Pilih kolom" step and passes the chosen keys to the export callbacks. |
| `src/components/Projects/ProjectList.jsx` (modify) | Forwards the chosen keys into the export functions. |
| `src/utils/*.test.js` (create) | Vitest unit tests for the pure modules. |
| `vite.config.js`, `package.json` (modify) | Vitest wiring. |

---

### Task 1: Test runner + move the project end-date helpers

The registry needs `projectEndFromDuration`, which currently sits unexported inside `projectExport.js`. Importing it from there would make `exportColumns.js` and `projectExport.js` import each other, so it moves to `projectSchedule.js` (which imports nothing from either).

**Files:**
- Modify: `package.json`
- Modify: `vite.config.js`
- Create: `src/utils/projectSchedule.test.js`
- Modify: `src/utils/projectSchedule.js`
- Modify: `src/utils/projectExport.js:286-303`

- [ ] **Step 1: Install Vitest**

```bash
cd ~/Desktop/pusat-gadai-madiun
git checkout spec/pembayaran-cicilan-jadwal-download
git checkout -b feat/kolom-download
npm install -D vitest
```

Let npm resolve the version that matches Vite 8; do not pin a guessed version.

- [ ] **Step 2: Add the test scripts**

In `package.json`, inside `"scripts"`, after `"lint": "eslint .",` add:

```json
    "test": "vitest run",
    "test:watch": "vitest",
```

- [ ] **Step 3: Point Vitest at the source tree**

Replace the whole of `vite.config.js` with:

```js
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  base: '/pusatgadaimadiun/',
  test: {
    environment: 'node',
    include: ['src/**/*.test.js'],
  },
});
```

Tests import `describe`/`it`/`expect` from `vitest` explicitly, so ESLint needs no new globals.

Fallback: the modules under test reach `projectSchedule.js`, which imports `Timestamp` from `firebase/firestore`. If that import fails under the `node` environment, run `npm i -D jsdom` and change `environment` to `'jsdom'`. Do not stub firebase.

- [ ] **Step 4: Write the failing test**

Create `src/utils/projectSchedule.test.js`:

```js
import { describe, it, expect } from 'vitest';
import { projectEndFromDuration, projectEndDate } from './projectSchedule';

describe('projectEndFromDuration', () => {
  it('lands on the payment day, duration months after the start', () => {
    const p = {
      startDate: new Date(2026, 0, 10),
      durationMonths: 6,
      paymentDayOfMonth: 5,
    };
    const end = projectEndFromDuration(p);
    expect(end.getFullYear()).toBe(2026);
    expect(end.getMonth()).toBe(6); // Juli
    expect(end.getDate()).toBe(5);
  });

  it('clamps the payment day to the length of the month', () => {
    const p = {
      startDate: new Date(2026, 0, 31),
      durationMonths: 1,
      paymentDayOfMonth: 31,
    };
    const end = projectEndFromDuration(p);
    expect(end.getMonth()).toBe(1); // Februari
    expect(end.getDate()).toBe(28);
  });

  it('falls back to the last due date when duration is missing', () => {
    const p = {
      startDate: new Date(2026, 0, 10),
      payments: [
        { dueDate: new Date(2026, 1, 10) },
        { dueDate: new Date(2026, 3, 10) },
      ],
    };
    expect(projectEndFromDuration(p).getMonth()).toBe(3);
  });
});

describe('projectEndDate', () => {
  it('returns null when there are no payments', () => {
    expect(projectEndDate({ payments: [] })).toBe(null);
  });
});
```

- [ ] **Step 5: Run the test and watch it fail**

Run: `npm test`
Expected: FAIL — `projectEndFromDuration` is not exported by `./projectSchedule`.

- [ ] **Step 6: Move the two helpers**

Append to `src/utils/projectSchedule.js` (after `findNextDuePayment`):

```js
// Last due date actually on the schedule. Moved here from projectExport.js so
// export code and the column registry can share it without importing each other.
export function projectEndDate(p) {
  const dues = (p.payments || []).map((pay) => toDate(pay.dueDate)).filter(Boolean);
  if (!dues.length) return null;
  return new Date(Math.max(...dues.map((d) => d.getTime())));
}

// Contractual project end = start + durationMonths (on the payment day). Stays
// correct even if the project was settled early (which truncates payments).
export function projectEndFromDuration(p) {
  const start = toDate(p.startDate);
  const dur = Number(p.durationMonths) || 0;
  if (!start || !dur) return projectEndDate(p);
  const day = Number(p.paymentDayOfMonth) || start.getDate();
  const anchor = new Date(start.getFullYear(), start.getMonth() + dur, 1);
  const lastDay = new Date(anchor.getFullYear(), anchor.getMonth() + 1, 0).getDate();
  anchor.setDate(Math.min(day, lastDay));
  return anchor;
}
```

`projectSchedule.js` imports `Timestamp` from `firebase/firestore` but not `toDate`. Add it to the top of the file:

```js
import { toDate } from './formatDate';
```

- [ ] **Step 7: Delete the old copies and import instead**

In `src/utils/projectExport.js`, delete the `projectEndDate` and `projectEndFromDuration` function bodies (lines 286-303) and change the import on line 6 to:

```js
import { projectSummary, projectEndFromDuration } from './projectSchedule';
```

- [ ] **Step 8: Run the tests and the build**

Run: `npm test && npm run build`
Expected: tests PASS, build succeeds.

- [ ] **Step 9: Commit**

```bash
git add package.json package-lock.json vite.config.js src/utils/projectSchedule.js src/utils/projectSchedule.test.js src/utils/projectExport.js
git commit -m "test: add vitest and move project end-date helpers into projectSchedule

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 2: Column registry

**Files:**
- Create: `src/utils/exportColumns.js`
- Create: `src/utils/exportColumns.test.js`

- [ ] **Step 1: Write the failing test**

Create `src/utils/exportColumns.test.js`:

```js
import { describe, it, expect } from 'vitest';
import {
  PROJECT_COLUMNS,
  COLLECTION_COLUMNS,
  defaultKeys,
  pickColumns,
  cellText,
  formatTierPct,
  pdfLayout,
} from './exportColumns';

const project = {
  name: 'PINDANG',
  ownerName: 'Bu Sri',
  nik: '3573xxxxxxxxxxxx',
  status: 'active',
  startDate: new Date(2026, 0, 10),
  durationMonths: 6,
  paymentDayOfMonth: 5,
  principalAmount: 100_000_000,
  disbursedAmount: 94_500_000,
  returnPctTier1: 5.5,
  returnPctTier2: 6.5,
  monthlyReturnPct: 5.5,
  payments: [
    { no: 1, dueDate: new Date(2026, 1, 5), type: 'interest', expectedAmount: 5_500_000, receivedAmount: 5_500_000 },
    { no: 2, dueDate: new Date(2026, 2, 5), type: 'interest', expectedAmount: 5_500_000, receivedAmount: null },
  ],
};

const ctx = { index: 0, accountName: () => 'BCA' };

describe('defaultKeys', () => {
  it('turns the three date columns on by default', () => {
    const keys = defaultKeys(PROJECT_COLUMNS);
    expect(keys).toContain('startDate');
    expect(keys).toContain('endDate');
    expect(keys).toContain('nextDue');
  });

  it('leaves NIK off by default because it is sensitive', () => {
    expect(defaultKeys(PROJECT_COLUMNS)).not.toContain('nik');
    expect(PROJECT_COLUMNS.find((c) => c.key === 'nik').sensitive).toBe(true);
  });
});

describe('pickColumns', () => {
  it('keeps registry order, not the order the keys were given in', () => {
    const picked = pickColumns(PROJECT_COLUMNS, ['status', 'no', 'name']);
    expect(picked.map((c) => c.key)).toEqual(['no', 'name', 'status']);
  });

  it('falls back to the defaults when nothing is selected', () => {
    expect(pickColumns(PROJECT_COLUMNS, []).map((c) => c.key)).toEqual(defaultKeys(PROJECT_COLUMNS));
  });

  it('ignores keys that are not in the registry', () => {
    expect(pickColumns(PROJECT_COLUMNS, ['no', 'tidak-ada']).map((c) => c.key)).toEqual(['no']);
  });
});

describe('formatTierPct', () => {
  it('shows both tiers with a comma decimal', () => {
    expect(formatTierPct(project)).toBe('5,5% / 6,5%');
  });

  it('shows one value for a legacy flat-rate project', () => {
    expect(formatTierPct({ monthlyReturnPct: 5 })).toBe('5%');
  });
});

describe('cellText', () => {
  const byKey = (k) => PROJECT_COLUMNS.find((c) => c.key === k);

  it('renders the contractual end date', () => {
    expect(cellText(byKey('endDate'), project, ctx)).toBe('05/07/2026');
  });

  it('renders the next unpaid due date', () => {
    expect(cellText(byKey('nextDue'), project, ctx)).toBe('05/03/2026');
  });

  it('adds the unit to duration in PDF text but keeps the raw number for Excel', () => {
    expect(cellText(byKey('duration'), project, ctx)).toBe('6 bln');
    expect(byKey('duration').value(project, ctx)).toBe(6);
  });
});

describe('pdfLayout', () => {
  it('stays portrait for a narrow selection and gives the rest to the flexible column', () => {
    const picked = pickColumns(PROJECT_COLUMNS, ['no', 'name', 'status']);
    const { orientation, columnStyles } = pdfLayout(picked);
    expect(orientation).toBe('portrait');
    expect(columnStyles[0].cellWidth).toBe(8);
    expect(columnStyles[2].cellWidth).toBe(16);
    expect(columnStyles[1].cellWidth).toBe(182 - 8 - 16);
  });

  it('switches to landscape once the fixed widths no longer fit', () => {
    expect(pdfLayout(pickColumns(PROJECT_COLUMNS, defaultKeys(PROJECT_COLUMNS))).orientation).toBe('landscape');
  });

  it('never shrinks the flexible column below 20mm', () => {
    const picked = pickColumns(PROJECT_COLUMNS, PROJECT_COLUMNS.map((c) => c.key));
    expect(pdfLayout(picked).columnStyles[1].cellWidth).toBeGreaterThanOrEqual(20);
  });
});

describe('COLLECTION_COLUMNS', () => {
  it('keeps every column of today’s Daftar Tagihan on by default', () => {
    expect(defaultKeys(COLLECTION_COLUMNS)).toEqual(COLLECTION_COLUMNS.map((c) => c.key));
  });
});
```

- [ ] **Step 2: Run the test and watch it fail**

Run: `npm test`
Expected: FAIL — cannot resolve `./exportColumns`.

- [ ] **Step 3: Write the registry**

Create `src/utils/exportColumns.js`:

```js
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
```

- [ ] **Step 4: Run the tests**

Run: `npm test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/utils/exportColumns.js src/utils/exportColumns.test.js
git commit -m "feat: column registry for project and collection exports

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 3: Remember the selection

**Files:**
- Create: `src/utils/exportPrefs.js`
- Create: `src/utils/exportPrefs.test.js`

- [ ] **Step 1: Write the failing test**

Create `src/utils/exportPrefs.test.js`:

```js
import { describe, it, expect, beforeEach } from 'vitest';
import { loadColumnKeys, saveColumnKeys } from './exportPrefs';

function fakeStorage(initial = {}) {
  const data = { ...initial };
  return {
    getItem: (k) => (k in data ? data[k] : null),
    setItem: (k, v) => { data[k] = String(v); },
    _data: data,
  };
}

describe('exportPrefs', () => {
  beforeEach(() => { globalThis.localStorage = fakeStorage(); });

  it('returns the fallback when nothing was saved', () => {
    expect(loadColumnKeys('project', ['no', 'name'])).toEqual(['no', 'name']);
  });

  it('saves and reads back a selection', () => {
    saveColumnKeys('project', ['no', 'status']);
    expect(loadColumnKeys('project', ['no'])).toEqual(['no', 'status']);
  });

  it('keeps the two export kinds apart', () => {
    saveColumnKeys('project', ['no']);
    saveColumnKeys('collection', ['due']);
    expect(loadColumnKeys('project', [])).toEqual(['no']);
    expect(loadColumnKeys('collection', [])).toEqual(['due']);
  });

  it('falls back when the stored value is corrupt', () => {
    globalThis.localStorage = fakeStorage({ 'pgm.exportCols.project': 'bukan json' });
    expect(loadColumnKeys('project', ['no'])).toEqual(['no']);
  });

  it('falls back when the stored value is an empty list', () => {
    saveColumnKeys('project', []);
    expect(loadColumnKeys('project', ['no'])).toEqual(['no']);
  });

  it('survives storage that throws, as in private mode', () => {
    globalThis.localStorage = {
      getItem: () => { throw new Error('blocked'); },
      setItem: () => { throw new Error('blocked'); },
    };
    expect(loadColumnKeys('project', ['no'])).toEqual(['no']);
    expect(() => saveColumnKeys('project', ['no'])).not.toThrow();
  });
});
```

- [ ] **Step 2: Run the test and watch it fail**

Run: `npm test`
Expected: FAIL — cannot resolve `./exportPrefs`.

- [ ] **Step 3: Write the module**

Create `src/utils/exportPrefs.js`:

```js
// Remembers which export columns the owner ticked, per device. Storage can be
// missing or throw (private mode, storage disabled), so every access is guarded
// and simply falls back to the defaults.
const KEY_PREFIX = 'pgm.exportCols.';

export function loadColumnKeys(kind, fallback) {
  try {
    const raw = localStorage.getItem(KEY_PREFIX + kind);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return fallback;
    const keys = parsed.filter((k) => typeof k === 'string');
    return keys.length ? keys : fallback;
  } catch {
    return fallback;
  }
}

export function saveColumnKeys(kind, keys) {
  try {
    localStorage.setItem(KEY_PREFIX + kind, JSON.stringify(keys));
  } catch {
    // Nothing to do: the picker still works for this session.
  }
}
```

- [ ] **Step 4: Run the tests**

Run: `npm test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/utils/exportPrefs.js src/utils/exportPrefs.test.js
git commit -m "feat: remember export column selection per device

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 4: Column picker UI

**Files:**
- Create: `src/components/Projects/ColumnPicker.jsx`

- [ ] **Step 1: Create the component**

```jsx
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
```

- [ ] **Step 2: Check it compiles**

Run: `npm run build`
Expected: succeeds.

- [ ] **Step 3: Commit**

```bash
git add src/components/Projects/ColumnPicker.jsx
git commit -m "feat: column picker checkbox list

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 5: "Pilih kolom" step in the export sheet

Every download now goes through the picker: Excel → kolom; PDF → cakupan → kolom; Daftar Tagihan → periode → kolom.

**Files:**
- Modify: `src/components/Projects/ExportSheet.jsx`
- Modify: `src/components/Projects/ProjectList.jsx:308-317`

- [ ] **Step 1: Add the imports and state**

In `src/components/Projects/ExportSheet.jsx`, after the existing imports (line 11), add:

```jsx
import ColumnPicker from './ColumnPicker';
import { PROJECT_COLUMNS, COLLECTION_COLUMNS, defaultKeys } from '../../utils/exportColumns';
import { loadColumnKeys, saveColumnKeys } from '../../utils/exportPrefs';
```

Replace the state block (lines 14-17) with:

```jsx
  const [step, setStep] = useState('home');
  const [useDateFilter, setUseDateFilter] = useState(false);
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  // What to run once columns are chosen: { kind, backTo, run }
  const [pending, setPending] = useState(null);
  const [cols, setCols] = useState([]);
```

Replace the `useEffect` reset block (lines 19-26) with:

```jsx
  useEffect(() => {
    if (open) {
      setStep('home');
      setUseDateFilter(false);
      setFrom('');
      setTo('');
      setPending(null);
    }
  }, [open]);
```

- [ ] **Step 2: Add the helpers that open and confirm the step**

Right after the existing `fire` function (line 40), add:

```jsx
  const registryFor = (kind) => (kind === 'collection' ? COLLECTION_COLUMNS : PROJECT_COLUMNS);

  function openColumns(kind, backTo, run) {
    setPending({ kind, backTo, run });
    setCols(loadColumnKeys(kind, defaultKeys(registryFor(kind))));
    setStep('columns');
  }

  function toggleCol(key) {
    setCols((prev) => (prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]));
  }

  function confirmColumns() {
    if (!pending || cols.length === 0) return;
    saveColumnKeys(pending.kind, cols);
    const run = pending.run;
    fire(() => run(cols));
  }
```

- [ ] **Step 3: Route the three buttons through the picker**

In `homeItems`, replace the Excel `onClick` (line 50) with:

```jsx
      onClick: () => openColumns('project', 'home', (keys) => onExportExcel(filter, keys)),
```

In `homeItems`, replace the Daftar Tagihan `onClick` (lines 70-74) with:

```jsx
      onClick: () => {
        setFrom('');
        setTo('');
        setStep('collection');
      },
```

This one is unchanged: the Daftar Tagihan picker opens from the Download button inside that step (Step 5 below), because the period has to be chosen first.

In `pdfItems`, replace the three `onClick` handlers (lines 86, 95, 103) with:

```jsx
      onClick: () => openColumns('project', 'pdf', (keys) => onExportPdf('active', filter, keys)),
```
```jsx
      onClick: () => openColumns('project', 'pdf', (keys) => onExportPdf('archive', filter, keys)),
```
```jsx
      onClick: () => openColumns('project', 'pdf', (keys) => onExportPdf('all', filter, keys)),
```

- [ ] **Step 4: Teach the step machine about `columns`**

Replace lines 108-119 with:

```jsx
  const isPdf = step === 'pdf';
  const isCollection = step === 'collection';
  const isColumns = step === 'columns';
  const items = isPdf ? pdfItems : homeItems;
  const collectionFilter =
    from && to ? { from: fromDateInput(from), to: fromDateInput(to) } : null;

  const title = isColumns
    ? 'Pilih kolom'
    : isPdf
      ? 'Cakupan PDF'
      : isCollection
        ? 'Daftar Tagihan'
        : 'Export Project';
  const subtitle = isColumns
    ? 'Centang data yang mau ikut diunduh'
    : isPdf
      ? 'Pilih project mana yang masuk ke PDF'
      : isCollection
        ? 'Pilih periode jatuh tempo tagihan'
        : 'Pilih format yang mau diunduh';
```

Replace the back-button condition on line 123 (`{(isPdf || isCollection) && (`) with:

```jsx
      {(isPdf || isCollection || isColumns) && (
```

and its `onClick` (line 126) with:

```jsx
          onClick={() => setStep(isColumns ? pending?.backTo || 'home' : 'home')}
```

- [ ] **Step 5: Render the picker and send the collection download through it**

Immediately after the back button's closing `)}` (line 131), add:

```jsx
      {isColumns && pending && (
        <div className="space-y-3">
          <ColumnPicker
            columns={registryFor(pending.kind)}
            selected={cols}
            onToggle={toggleCol}
          />
          <p className="text-[12px] text-ink-mute">
            {cols.length} kolom dipilih. Pilihan ini diingat di HP ini.
          </p>
          <button
            type="button"
            disabled={cols.length === 0}
            onClick={confirmColumns}
            className="w-full py-3 rounded-xl bg-indigo text-cream font-semibold text-[15px] active:bg-indigo-deep disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Download
          </button>
        </div>
      )}
```

Change the collection step's guard (line 133) from `{isCollection && (` to `{isCollection && !isColumns && (`, and replace its Download button `onClick` (line 174) with:

```jsx
            onClick={() =>
              openColumns('collection', 'collection', (keys) =>
                onExportCollection(collectionFilter, keys)
              )
            }
```

Finally, change the list guard on line 234 from `{!isCollection && (` to `{!isCollection && !isColumns && (`, and the date-filter block guard on line 182 from `{!isPdf && !isCollection && (` to `{!isPdf && !isCollection && !isColumns && (`.

- [ ] **Step 6: Forward the keys from ProjectList**

In `src/components/Projects/ProjectList.jsx`, replace lines 311-316 with:

```jsx
        onExportExcel={(filter, keys) => exportProjectsToExcel(projects, accounts, filter, keys)}
        onExportPdf={(mode, filter, keys) => exportProjectsToPdf(projects, accounts, mode, filter, keys)}
        onExportCollection={(filter, keys) => {
          exportCollectionToPdf(projects, accounts, filter, keys);
          exportCollectionToExcel(projects, accounts, filter, keys);
```

- [ ] **Step 7: Build**

Run: `npm run build`
Expected: succeeds. The extra `keys` argument is ignored by the export functions until Task 6.

- [ ] **Step 8: Commit**

```bash
git add src/components/Projects/ExportSheet.jsx src/components/Projects/ProjectList.jsx
git commit -m "feat: pilih kolom step before every project download

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 6: Excel uses the selected columns

**Files:**
- Modify: `src/utils/projectExport.js:14-42` (delete `projectRow`), `:99-141` (`exportProjectsToExcel`)

- [ ] **Step 1: Import the registry**

At the top of `src/utils/projectExport.js`, after the existing imports, add:

```js
import { PROJECT_COLUMNS, COLLECTION_COLUMNS, pickColumns, cellValue, cellText, pdfLayout } from './exportColumns';
```

- [ ] **Step 2: Delete `projectRow` and add a column-driven builder**

Delete the whole `projectRow` function (lines 14-42). **Keep `STATUS_LABEL` for now:** `projectsToPdfRows` still uses it until Task 7 rewrites that function, and deleting it here would break the build between the two commits. Add in place of `projectRow`:

```js
function projectSheetRows(list, picked, accountName) {
  return list.map((p, index) => {
    const ctx = { index, accountName };
    const row = {};
    picked.forEach((c) => { row[c.label] = cellValue(c, p, ctx); });
    return row;
  });
}

function sheetColWidths(picked) {
  return picked.map((c) => ({ wch: Math.max(10, Math.round(c.width * 0.9)) }));
}
```

`cellValue` reads the raw value so Excel keeps numbers numeric, exactly as `projectRow` did.

- [ ] **Step 3: Rewrite the Excel export**

Replace the body of `exportProjectsToExcel` (lines 99-141) with:

```js
export function exportProjectsToExcel(projects, accounts, filter = null, columnKeys = null) {
  const accountName = (id) => accounts.find((a) => a.id === id)?.name || '';
  const picked = pickColumns(PROJECT_COLUMNS, columnKeys);
  const sourceList = filter ? projectsTouchedByFilter(projects, filter) : projects;
  const active = sourceList.filter((p) => p.status === 'active');
  const archive = sourceList.filter((p) => p.status === 'completed' || p.status === 'default');

  const wb = XLSX.utils.book_new();
  const widths = sheetColWidths(picked);

  const sheetActive = XLSX.utils.json_to_sheet(projectSheetRows(active, picked, accountName));
  sheetActive['!cols'] = widths;
  XLSX.utils.book_append_sheet(wb, sheetActive, 'Project Aktif');

  const sheetArchive = XLSX.utils.json_to_sheet(projectSheetRows(archive, picked, accountName));
  sheetArchive['!cols'] = widths;
  XLSX.utils.book_append_sheet(wb, sheetArchive, 'Riwayat');

  // Sheet: Jadwal Pembayaran (filtered by receivedDate when filter set).
  // Not column-picked: it is a fixed per-payment view.
  const allPayments = [];
  sourceList.forEach((p) => {
    (p.payments || []).forEach((pay) => {
      if (filter && !(pay.receivedDate && inDateRange(pay.receivedDate, filter))) return;
      allPayments.push(paymentRow(p, pay, accountName));
    });
  });
  const sheetPayments = XLSX.utils.json_to_sheet(allPayments);
  sheetPayments['!cols'] = [
    { wch: 30 }, { wch: 20 }, { wch: 8 }, { wch: 16 },
    { wch: 14 }, { wch: 14 }, { wch: 14 }, { wch: 14 },
    { wch: 18 }, { wch: 12 },
  ];
  XLSX.utils.book_append_sheet(wb, sheetPayments, 'Jadwal Pembayaran');

  XLSX.writeFile(wb, `Pusat Gadai Madiun_Project_${downloadFilenameStamp()}.xlsx`);
}
```

Also delete the now-unused `fmtIdrCellArray` function (lines 59-64) and its call.

- [ ] **Step 4: Build**

Run: `npm run build`
Expected: succeeds.

- [ ] **Step 5: Commit**

```bash
git add src/utils/projectExport.js
git commit -m "feat: excel project sheets follow the selected columns

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 7: PDF uses the selected columns, with dates and both tiers

**Files:**
- Modify: `src/utils/projectExport.js:153-280` (`projectsToPdfRows`, `exportProjectsToPdf`)

- [ ] **Step 1: Rewrite the row builder**

Replace `projectsToPdfRows` (lines 153-168) with:

```js
function projectsToPdfRows(list, picked, accountName) {
  return list.map((p, index) => picked.map((c) => cellText(c, p, { index, accountName })));
}

// Placeholder line that keeps the column count intact when a section is empty.
function emptyPdfRow(picked, message) {
  return [picked.map((c, i) => (i === 0 ? '—' : i === 1 ? message : ''))];
}
```

- [ ] **Step 2: Rewrite the PDF export**

Replace `exportProjectsToPdf` (lines 170-280) with:

```js
export function exportProjectsToPdf(projects, accounts, mode = 'all', filter = null, columnKeys = null) {
  const accountName = (id) => accounts.find((a) => a.id === id)?.name || '';
  const picked = pickColumns(PROJECT_COLUMNS, columnKeys);
  const { orientation, columnStyles } = pdfLayout(picked);
  const doc = new jsPDF({ orientation });
  const margin = orientation === 'landscape' ? { left: 6, right: 6 } : { left: 14, right: 14 };

  const sourceList = filter ? projectsTouchedByFilter(projects, filter) : projects;
  const active = sourceList.filter((p) => p.status === 'active');
  const archive = sourceList.filter((p) => p.status === 'completed' || p.status === 'default');

  const includeActive = mode === 'all' || mode === 'active';
  const includeArchive = mode === 'all' || mode === 'archive';
  const baseLabel =
    mode === 'active' ? 'Project Aktif' : mode === 'archive' ? 'Riwayat Project' : 'Semua Project';
  const periodLabel = `${baseLabel}${buildPeriodLabel(filter)}`;

  pdfHeader(doc, periodLabel);

  let cursorY = 38;
  const table = (title, list, fillColor, emptyMessage) => {
    doc.setFontSize(12);
    doc.setFont('helvetica', 'bold');
    doc.text(title, margin.left, cursorY);
    cursorY += 4;
    autoTable(doc, {
      head: [picked.map((c) => c.label)],
      body: list.length > 0
        ? projectsToPdfRows(list, picked, accountName)
        : emptyPdfRow(picked, emptyMessage),
      startY: cursorY,
      margin,
      styles: { fontSize: 8.5, cellPadding: 2, overflow: 'linebreak' },
      headStyles: { fillColor, textColor: 248 },
      columnStyles,
    });
    cursorY = doc.lastAutoTable.finalY + 8;
  };

  if (includeActive) table('Project Aktif', active, [45, 74, 107], 'Tidak ada project aktif');
  if (includeArchive) table('Riwayat Project', archive, [184, 84, 80], 'Tidak ada riwayat project');

  // Summary footer
  const totalDisbursed = sourceList.reduce((s, p) => s + (p.disbursedAmount || 0), 0);
  let totalReceived = sourceList.reduce((s, p) => s + projectSummary(p).receivedSoFar, 0);
  if (filter) {
    totalReceived = 0;
    sourceList.forEach((p) => {
      (p.payments || []).forEach((pay) => {
        if (pay.receivedDate && inDateRange(pay.receivedDate, filter)) {
          totalReceived += pay.receivedAmount || 0;
        }
      });
    });
  }
  doc.setFontSize(10);
  doc.setFont('helvetica', 'bold');
  doc.text(`Total Modal Keluar: ${formatCurrency(totalDisbursed)}`, margin.left, cursorY);
  doc.text(
    `Total Diterima${filter ? ' (dalam rentang)' : ''}: ${formatCurrency(totalReceived)}`,
    margin.left,
    cursorY + 6
  );

  const now = new Date();
  const monthName = MONTHS[now.getMonth()];
  const filename = `Pusat Gadai Madiun_Project_${baseLabel.replace(/\s+/g, '_')}_${monthName}_${now.getFullYear()}.pdf`;
  doc.save(filename);
}
```

`pdfHeader` writes at x=14, which is fine in both orientations; leave it alone.

- [ ] **Step 3: Build**

Run: `npm run build`
Expected: succeeds.

Now that nothing reads it any more, delete the `STATUS_LABEL` map at the top of `projectExport.js` (lines 8-12) — the registry owns the status labels. Re-run `npm run build` to confirm.

- [ ] **Step 4: Commit**

```bash
git add src/utils/projectExport.js
git commit -m "feat: projects PDF gets date columns, both tiers, and picked columns

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 8: Daftar Tagihan uses the selected columns

**Files:**
- Modify: `src/utils/projectExport.js:339-434` (`exportCollectionToExcel`, `exportCollectionToPdf`)

- [ ] **Step 1: Rewrite the Excel export**

Replace `exportCollectionToExcel` (lines 339-365) with:

```js
export function exportCollectionToExcel(projects, accounts, filter = null, columnKeys = null) {
  const rows = collectionRows(projects, filter);
  const picked = pickColumns(COLLECTION_COLUMNS, columnKeys);
  const wb = XLSX.utils.book_new();
  const sheet = XLSX.utils.json_to_sheet(
    rows.map((r) => {
      const out = {};
      picked.forEach((c) => { out[c.label] = cellValue(c, r, {}); });
      return out;
    })
  );
  sheet['!cols'] = picked.map((c) => ({ wch: Math.max(10, Math.round(c.width * 0.9)) }));
  XLSX.utils.book_append_sheet(wb, sheet, 'Daftar Tagihan');
  XLSX.writeFile(wb, `Pusat Gadai Madiun_Tagihan_${downloadFilenameStamp()}.xlsx`);
}
```

- [ ] **Step 2: Rewrite the PDF export**

In `exportCollectionToPdf` (lines 367-434), replace everything from `const head = [[` down to the closing `});` of `autoTable` (lines 381-420) with:

```js
  const picked = pickColumns(COLLECTION_COLUMNS, columnKeys);
  const { columnStyles } = pdfLayout(picked);
  const head = [picked.map((c) => c.label)];
  const body = rows.length
    ? rows.map((r) => picked.map((c) => cellText(c, r, {})))
    : [picked.map((c, i) => (i === 0 ? '—' : i === 1 ? 'Tidak ada tagihan pada periode ini' : ''))];

  autoTable(doc, {
    head,
    body,
    startY: 32,
    margin: { left: 6, right: 6 },
    styles: { fontSize: 8, cellPadding: 2, valign: 'middle', overflow: 'linebreak' },
    headStyles: { fillColor: [45, 74, 107], textColor: 248 },
    columnStyles,
    didParseCell: (data) => {
      const r = rows[data.row.index];
      if (data.section === 'body' && r && r.status === 'Belum') {
        data.cell.styles.fillColor = [250, 240, 235];
      }
    },
  });
```

and change its signature (line 367) to:

```js
export function exportCollectionToPdf(projects, accounts, filter = null, columnKeys = null) {
```

The unpaid-row highlight reads from `rows`, not from a Status cell, so it keeps working even if the Status column is unticked. The totals footer below is unchanged for the same reason.

- [ ] **Step 3: Run tests and build**

Run: `npm test && npm run build`
Expected: both pass.

- [ ] **Step 4: Commit**

```bash
git add src/utils/projectExport.js
git commit -m "feat: daftar tagihan follows the selected columns

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 9: Verify in the browser, on demo data

Never verify against the real data: `/demo` uses the `demo_*` collections.

**Files:** none (verification only)

- [ ] **Step 1: Start the dev server**

Use the Browser pane: `preview_start` with the `pusat-gadai-madiun` launch config (port 5174). Open `/demo/project`.

- [ ] **Step 2: Walk the three flows**

1. Download → **Excel** → the "Pilih kolom" step appears with Tanggal Mulai, Tanggal Berakhir and Jatuh Tempo Berikutnya already ticked, and NIK unticked and marked "sensitif" → Download. Open the file: the project sheets carry exactly the ticked columns, and the Jadwal Pembayaran sheet is unchanged.
2. Download → **PDF** → Semua project → untick everything except No, Nama Project, Status → Download. Expect a **portrait** page where Nama Project fills the leftover width.
3. Download → PDF again → leave the defaults → Download. Expect a **landscape** page that includes the three date columns and shows Bagi Hasil as `5,5% / 6,5%`.
4. Download → **Daftar Tagihan** → pick a period → Download. Expect both files, with unpaid rows still shaded.

- [ ] **Step 3: Confirm the selection is remembered**

Reload the page, open Download → Excel again. The previous ticks are still there.

- [ ] **Step 4: Confirm the empty state**

With a period that has no tagihan, Daftar Tagihan still produces a PDF with the "Tidak ada tagihan pada periode ini" line and no broken layout.

- [ ] **Step 5: Final check and commit**

```bash
npm test && npm run build && npx eslint .
git add -A
git commit -m "chore: verify bagian A in demo mode

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

- [ ] **Step 6: Stop before deploying**

Do **not** merge into `main` or push. Report back with what was verified and wait for Gde's go-ahead, because merging to `main` deploys the live app immediately.

---

## Notes for the next part

Part B adds a **Kurang Bayar** column to `PROJECT_COLUMNS` and a partial-aware **Sisa Tagihan**, and changes the Daftar Tagihan `amount` column to bill the remainder instead of the full tagihan. Both land in the registry created here, not in new bespoke column lists.
