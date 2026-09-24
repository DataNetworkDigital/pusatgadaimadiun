import { describe, it, expect } from 'vitest';
import {
  PROJECT_COLUMNS,
  COLLECTION_COLUMNS,
  defaultKeys,
  pickColumns,
  cellValue,
  cellText,
  formatTierPct,
  pdfLayout,
  LANDSCAPE_WIDTH,
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

  it('falls back to the defaults when every saved key is stale (e.g. a renamed column)', () => {
    const picked = pickColumns(PROJECT_COLUMNS, ['kolom-lama-1', 'kolom-lama-2']);
    expect(picked.map((c) => c.key)).toEqual(defaultKeys(PROJECT_COLUMNS));
  });
});

describe('formatTierPct', () => {
  it('shows both tiers with a comma decimal', () => {
    expect(formatTierPct(project)).toBe('5,5% / 6,5%');
  });

  it('shows one value for a legacy flat-rate project', () => {
    expect(formatTierPct({ monthlyReturnPct: 5 })).toBe('5%');
  });

  it('drops a non-numeric string tier and shows just the other, valid tier', () => {
    expect(formatTierPct({ returnPctTier1: 'abc', returnPctTier2: 6.5 })).toBe('6,5%');
  });

  it('treats a null tier2 as "no override" and shows the single tier1 value', () => {
    expect(formatTierPct({ returnPctTier1: 5.5, returnPctTier2: null })).toBe('5,5%');
  });

  it('falls back to "-" when both tiers are corrupt and nothing finite is left to show', () => {
    expect(formatTierPct({ returnPctTier1: 'x', returnPctTier2: 'y' })).toBe('-');
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

describe('paymentDay column', () => {
  const col = PROJECT_COLUMNS.find((c) => c.key === 'paymentDay');

  it('exists, is off by default (Excel keeps the same 13 defaults as the PDF), and is not sensitive', () => {
    expect(col).toBeDefined();
    expect(defaultKeys(PROJECT_COLUMNS)).not.toContain('paymentDay');
    expect(col.sensitive).toBeFalsy();
  });

  it('returns the day as a number when present, and "" when missing, zero, or non-numeric', () => {
    expect(col.value({ paymentDayOfMonth: 25 }, ctx)).toBe(25);
    expect(col.value({}, ctx)).toBe('');
    expect(col.value({ paymentDayOfMonth: 0 }, ctx)).toBe('');
    expect(col.value({ paymentDayOfMonth: 'abc' }, ctx)).toBe('');
  });

  it('sits between duration and principal in registry order (report column order matters)', () => {
    const picked = pickColumns(PROJECT_COLUMNS, PROJECT_COLUMNS.map((c) => c.key));
    const keys = picked.map((c) => c.key);
    const durationIdx = keys.indexOf('duration');
    const paymentDayIdx = keys.indexOf('paymentDay');
    const principalIdx = keys.indexOf('principal');
    expect(paymentDayIdx).toBe(durationIdx + 1);
    expect(principalIdx).toBe(paymentDayIdx + 1);
  });
});

describe('cellText keeps PDF text in sync with the Excel value for currency columns', () => {
  const byKey = (k) => PROJECT_COLUMNS.find((c) => c.key === k);
  // A truthy but non-numeric field, as a legacy or hand-edited Firestore
  // document could plausibly contain.
  const bad = {
    principalAmount: 'bukan angka',
    disbursedAmount: 'bukan angka',
    lossAmount: 'bukan angka',
  };

  it.each(['principal', 'disbursed', 'loss'])(
    'coerces a non-numeric %s to 0 the same way in Excel and PDF (no "Rp NaN")',
    (key) => {
      const col = byKey(key);
      expect(col.value(bad, ctx)).toBe(0);
      expect(cellText(col, bad, ctx)).toBe('Rp 0');
    }
  );
});

describe('error isolation', () => {
  const projectColumn = (k) => PROJECT_COLUMNS.find((c) => c.key === k);
  const throwingValueCol = {
    key: 'boom', label: 'Boom', value: () => { throw new Error('kaboom'); },
  };
  const throwingTextCol = {
    key: 'boom2', label: 'Boom2', value: () => 'ok', text: () => { throw new Error('kaboom'); },
  };

  it('cellValue degrades a throwing column to an empty string instead of crashing', () => {
    expect(() => cellValue(throwingValueCol, project, ctx)).not.toThrow();
    expect(cellValue(throwingValueCol, project, ctx)).toBe('');
  });

  it('cellText degrades a throwing value() to an empty string instead of crashing', () => {
    expect(() => cellText(throwingValueCol, project, ctx)).not.toThrow();
    expect(cellText(throwingValueCol, project, ctx)).toBe('');
  });

  it('cellText degrades a throwing text() to an empty string instead of crashing', () => {
    expect(() => cellText(throwingTextCol, project, ctx)).not.toThrow();
    expect(cellText(throwingTextCol, project, ctx)).toBe('');
  });

  it('one throwing column does not stop the rest of the row from rendering', () => {
    const row = [projectColumn('name'), throwingValueCol, projectColumn('status')]
      .map((c) => cellText(c, project, ctx));
    expect(row).toEqual(['PINDANG', '', 'Aktif']);
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

  it('gives the flexible column comfortable room, well above the 20mm floor, when the page has space', () => {
    const picked = pickColumns(PROJECT_COLUMNS, defaultKeys(PROJECT_COLUMNS));
    const nameIdx = picked.findIndex((c) => c.key === 'name');
    expect(pdfLayout(picked).columnStyles[nameIdx].cellWidth).toBe(39);
  });

  // Replaces the old "never shrinks the flexible column below 20mm" assertion.
  // Guaranteeing the table fits the page and holding a hard 20mm floor are
  // contradictory once the fixed columns alone overflow — fit wins.
  it('always fits the page even when every column is selected, both flex columns included', () => {
    const picked = pickColumns(PROJECT_COLUMNS, PROJECT_COLUMNS.map((c) => c.key));
    const { orientation, columnStyles } = pdfLayout(picked);
    expect(orientation).toBe('landscape');
    const total = Object.values(columnStyles).reduce((s, cs) => s + cs.cellWidth, 0);
    expect(total).toBeLessThanOrEqual(LANDSCAPE_WIDTH);
  });

  it('always fits the page when the fixed columns alone overflow, even with no flex column selected', () => {
    // Every non-flex column at once: the old code had nothing to shrink here
    // (flexIdx === -1 skipped the fitting block entirely).
    const nonFlexKeys = PROJECT_COLUMNS.filter((c) => !c.flex).map((c) => c.key);
    const picked = pickColumns(PROJECT_COLUMNS, nonFlexKeys);
    const { columnStyles } = pdfLayout(picked);
    const total = Object.values(columnStyles).reduce((s, cs) => s + cs.cellWidth, 0);
    expect(total).toBeLessThanOrEqual(LANDSCAPE_WIDTH);
  });

  it('fits the page for a representative no-flex-column selection', () => {
    const picked = pickColumns(PROJECT_COLUMNS, [
      'no', 'status', 'disbursed', 'received', 'remaining', 'net',
      'phone', 'collateral', 'nik', 'sourceAccount', 'loss', 'closedAt',
    ]);
    const { columnStyles } = pdfLayout(picked);
    const total = Object.values(columnStyles).reduce((s, cs) => s + cs.cellWidth, 0);
    expect(total).toBeLessThanOrEqual(LANDSCAPE_WIDTH);
  });
});

describe('column labels', () => {
  it('are unique within PROJECT_COLUMNS (Task 6 keys Excel rows by label)', () => {
    const labels = PROJECT_COLUMNS.map((c) => c.label);
    expect(new Set(labels).size).toBe(labels.length);
  });

  it('are unique within COLLECTION_COLUMNS (Task 6 keys Excel rows by label)', () => {
    const labels = COLLECTION_COLUMNS.map((c) => c.label);
    expect(new Set(labels).size).toBe(labels.length);
  });
});

describe('COLLECTION_COLUMNS', () => {
  it('keeps every column of today’s Daftar Tagihan on by default', () => {
    expect(defaultKeys(COLLECTION_COLUMNS)).toEqual(COLLECTION_COLUMNS.map((c) => c.key));
  });
});

describe('Kurang Bayar column', () => {
  it('exists, is off by default, and sums what due, partly paid tagihan still lack', () => {
    const col = PROJECT_COLUMNS.find((c) => c.key === 'shortfall');
    expect(col.label).toBe('Kurang Bayar');
    expect(col.defaultOn).toBe(false);
    const past = new Date(2020, 0, 5);
    const future = new Date(2099, 0, 5);
    const p = {
      payments: [
        { no: 1, type: 'interest', expectedAmount: 1000, dueDate: past },
        { no: 2, type: 'interest', expectedAmount: 1000, dueDate: future },
        { no: 3, type: 'interest', expectedAmount: 1000, dueDate: past },
      ],
      receipts: [
        { id: 'a', amount: 400, allocations: [{ no: 1, amount: 400 }] },
        { id: 'b', amount: 300, allocations: [{ no: 2, amount: 300 }] },
      ],
    };
    expect(col.value(p, {})).toBe(600);
  });
});

describe('end date after an extension', () => {
  it('shows the pelunasan the schedule now ends with', () => {
    const p = {
      startDate: new Date(2026, 0, 10), durationMonths: 2, paymentDayOfMonth: 5, extensions: [{ id: 'e' }],
      payments: [{ no: 1, dueDate: new Date(2026, 1, 5) }, { no: 2, dueDate: new Date(2026, 5, 5) }],
    };
    const col = PROJECT_COLUMNS.find((c) => c.key === 'endDate');
    expect(cellText(col, p, { index: 0 })).toBe('05/06/2026');
  });
});
