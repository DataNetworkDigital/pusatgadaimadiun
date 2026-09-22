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
