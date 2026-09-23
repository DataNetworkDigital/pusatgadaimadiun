import { describe, it, expect } from 'vitest';
import { PROJECT_COLUMNS, defaultKeys, pickColumns } from './exportColumns';
import { formatCurrency } from './formatCurrency';
import { projectSheetRows, projectsToPdfRows, emptyPdfRow } from './projectExport';

// Two projects: one active with every relevant field present, one completed
// with a missing ownerName and a missing paymentDayOfMonth — the two "holes"
// real Firestore data has had in practice. Missing ownerName exercises the
// Pemilik column's `|| ''` fallback; missing paymentDayOfMonth exercises
// projectEndFromDuration's fallback to the start date's day-of-month.
const projectActive = {
  name: 'PINDANG',
  ownerName: 'Bu Sri',
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

const projectCompleted = {
  name: 'RUPIAH JAYA',
  // ownerName intentionally missing
  status: 'completed',
  startDate: new Date(2025, 5, 1), // 1 Jun 2025
  durationMonths: 3,
  // paymentDayOfMonth intentionally missing
  principalAmount: 50_000_000,
  disbursedAmount: 48_000_000,
  monthlyReturnPct: 5,
  payments: [
    { no: 1, dueDate: new Date(2025, 6, 1), type: 'interest', expectedAmount: 2_500_000, receivedAmount: 2_500_000 },
    { no: 2, dueDate: new Date(2025, 7, 1), type: 'interest', expectedAmount: 2_500_000, receivedAmount: 2_500_000 },
    { no: 3, dueDate: new Date(2025, 8, 1), type: 'final', expectedAmount: 50_000_000, receivedAmount: 50_000_000 },
  ],
};

const projects = [projectActive, projectCompleted];
const accountName = () => 'BCA';

describe('projectSheetRows (Excel)', () => {
  it('keys every row by the default column labels, in registry order, with Modal Keluar numeric', () => {
    const picked = pickColumns(PROJECT_COLUMNS, defaultKeys(PROJECT_COLUMNS));
    const rows = projectSheetRows(projects, picked, accountName);
    const expectedKeys = picked.map((c) => c.label);

    rows.forEach((row) => expect(Object.keys(row)).toEqual(expectedKeys));
    expect(rows[0]['Modal Keluar']).toBe(94_500_000);
    expect(typeof rows[0]['Modal Keluar']).toBe('number');
  });

  it('renders a missing ownerName as an empty string, not "undefined"', () => {
    const picked = pickColumns(PROJECT_COLUMNS, defaultKeys(PROJECT_COLUMNS));
    const rows = projectSheetRows(projects, picked, accountName);
    expect(rows[1]['Pemilik']).toBe('');
  });

  it('falls back to the start day when paymentDayOfMonth is missing, instead of an invalid end date', () => {
    const picked = pickColumns(PROJECT_COLUMNS, defaultKeys(PROJECT_COLUMNS));
    const rows = projectSheetRows(projects, picked, accountName);
    expect(rows[1]['Tanggal Berakhir']).toBe('01/09/2025');
  });

  it('renders a completed project\'s Status as "Selesai" (regression guard for the deleted STATUS_LABEL map)', () => {
    const picked = pickColumns(PROJECT_COLUMNS, defaultKeys(PROJECT_COLUMNS));
    const rows = projectSheetRows(projects, picked, accountName);
    expect(rows[1]['Status']).toBe('Selesai');
  });

  it('includes only the selected columns for a narrow selection, still in registry order', () => {
    const picked = pickColumns(PROJECT_COLUMNS, ['no', 'name', 'startDate']);
    const rows = projectSheetRows(projects, picked, accountName);
    expect(Object.keys(rows[0])).toEqual(['No', 'Nama Project', 'Tanggal Mulai']);
    expect(rows[0].No).toBe(1);
    expect(rows[1].No).toBe(2);
  });
});

describe('projectsToPdfRows (PDF)', () => {
  it('renders every cell as a string, in the same order as picked', () => {
    const picked = pickColumns(PROJECT_COLUMNS, defaultKeys(PROJECT_COLUMNS));
    const rows = projectsToPdfRows(projects, picked, accountName);
    rows.forEach((row) => {
      expect(row).toHaveLength(picked.length);
      row.forEach((cell) => expect(typeof cell).toBe('string'));
    });
  });

  it('formats Modal Keluar as currency and Durasi (bulan) as "N bln"', () => {
    const picked = pickColumns(PROJECT_COLUMNS, defaultKeys(PROJECT_COLUMNS));
    const rows = projectsToPdfRows(projects, picked, accountName);
    const disbursedIdx = picked.findIndex((c) => c.key === 'disbursed');
    const durationIdx = picked.findIndex((c) => c.key === 'duration');

    expect(rows[0][disbursedIdx]).toBe(formatCurrency(94_500_000));
    expect(rows[1][disbursedIdx]).toBe(formatCurrency(48_000_000));
    expect(rows[0][durationIdx]).toBe('6 bln');
    expect(rows[1][durationIdx]).toBe('3 bln');
  });

  it('renders a completed project\'s Status as "Selesai" (regression guard for the deleted STATUS_LABEL map)', () => {
    const picked = pickColumns(PROJECT_COLUMNS, defaultKeys(PROJECT_COLUMNS));
    const statusIdx = picked.findIndex((c) => c.key === 'status');
    const rows = projectsToPdfRows(projects, picked, accountName);
    expect(rows[1][statusIdx]).toBe('Selesai');
  });

  it('numbers rows from 1 for whatever list it is given (this is what makes numbering restart per PDF table)', () => {
    const picked = pickColumns(PROJECT_COLUMNS, defaultKeys(PROJECT_COLUMNS));
    const noIdx = picked.findIndex((c) => c.key === 'no');
    expect(projectsToPdfRows(projects, picked, accountName)[0][noIdx]).toBe('1');
    expect(projectsToPdfRows(projects, picked, accountName)[1][noIdx]).toBe('2');
    // A second, independent call (as exportProjectsToPdf makes once per table)
    // starts back at 1 rather than continuing a shared counter.
    expect(projectsToPdfRows([projectCompleted], picked, accountName)[0][noIdx]).toBe('1');
  });
});

describe('emptyPdfRow', () => {
  it('produces exactly one row with picked.length cells, for a narrow or a wide selection', () => {
    const narrow = pickColumns(PROJECT_COLUMNS, ['no', 'name', 'startDate']);
    const wide = pickColumns(PROJECT_COLUMNS, defaultKeys(PROJECT_COLUMNS));

    expect(emptyPdfRow(narrow, 'Tidak ada project aktif')).toHaveLength(1);
    expect(emptyPdfRow(narrow, 'Tidak ada project aktif')[0]).toHaveLength(narrow.length);
    expect(emptyPdfRow(wide, 'Tidak ada riwayat project')[0]).toHaveLength(wide.length);
  });

  it('puts a dash in the first cell and the message in the second, leaving the rest blank', () => {
    const picked = pickColumns(PROJECT_COLUMNS, defaultKeys(PROJECT_COLUMNS));
    const [row] = emptyPdfRow(picked, 'Tidak ada project aktif');
    expect(row[0]).toBe('—');
    expect(row[1]).toBe('Tidak ada project aktif');
    row.slice(2).forEach((cell) => expect(cell).toBe(''));
  });
});
