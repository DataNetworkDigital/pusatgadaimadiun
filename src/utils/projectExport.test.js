import { describe, it, expect } from 'vitest';
import { PROJECT_COLUMNS, COLLECTION_COLUMNS, defaultKeys, pickColumns, pdfLayout } from './exportColumns';
import { formatCurrency } from './formatCurrency';
import {
  projectSheetRows, projectsToPdfRows, emptyPdfRow, projectsTouchedByFilter, scheduleSheetRows,
  collectionRows, collectionTotals,
} from './projectExport';

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

// exportCollectionToPdf creates its jsPDF document with whatever orientation
// pdfLayout picks for the selected columns (it no longer hardcodes
// 'landscape'), so this is the regression guard: it locks in which selections
// must render landscape vs portrait, without needing to touch jsPDF at all.
describe('Daftar Tagihan PDF orientation (drives exportCollectionToPdf\'s document orientation)', () => {
  it('stays landscape for the default (all 13) column selection - what the debt collector receives today', () => {
    const picked = pickColumns(COLLECTION_COLUMNS, defaultKeys(COLLECTION_COLUMNS));
    expect(pdfLayout(picked).orientation).toBe('landscape');
  });

  it('switches to portrait for a narrow selection, so the columns fill the page width instead of leaving a gutter', () => {
    const picked = pickColumns(COLLECTION_COLUMNS, ['due', 'owner', 'project', 'phone', 'address']);
    expect(pdfLayout(picked).orientation).toBe('portrait');
  });
});

// The spec's own example: bulan 3 paid 3jt on 5 Okt and 1jt on 6 Okt, then
// 7jt on 5 Nov finishes bulan 3 (1,5jt) and pays bulan 4 (5,5jt). A period
// export must follow the money, not the tagihan's last payment date.
describe('period-filtered exports follow each arrival', () => {
  const r3 = { no: 3, type: 'interest', expectedAmount: 5_500_000, dueDate: new Date(2026, 9, 5), receivedAmount: 5_500_000, receivedDate: new Date(2026, 10, 5), accountId: 'bca' };
  const r4 = { no: 4, type: 'interest', expectedAmount: 5_500_000, dueDate: new Date(2026, 10, 5), receivedAmount: 5_500_000, receivedDate: new Date(2026, 10, 5), accountId: 'bca' };
  const project = {
    id: 'p1', name: 'Toko', ownerName: 'Budi', status: 'active',
    payments: [r3, r4],
    receipts: [
      { id: 'a', amount: 3_000_000, date: new Date(2026, 9, 5), accountId: 'bca', allocations: [{ no: 3, amount: 3_000_000 }] },
      { id: 'b', amount: 1_000_000, date: new Date(2026, 9, 6), accountId: 'bri', allocations: [{ no: 3, amount: 1_000_000 }] },
      { id: 'c', amount: 7_000_000, date: new Date(2026, 10, 5), accountId: 'bca', allocations: [{ no: 3, amount: 1_500_000 }, { no: 4, amount: 5_500_000 }] },
    ],
  };
  const october = { from: new Date(2026, 9, 1), to: new Date(2026, 9, 31) };
  const november = { from: new Date(2026, 10, 1), to: new Date(2026, 10, 30) };
  const accountName = (id) => ({ bca: 'BCA', bri: 'BRI' })[id] || '';
  const total = (rows) => rows.reduce((sum, r) => sum + (Number(r['Diterima (Rp)']) || 0), 0);

  it('includes a project in the month money arrived for it', () => {
    expect(projectsTouchedByFilter([project], october)).toHaveLength(1);
    expect(projectsTouchedByFilter([project], november)).toHaveLength(1);
    expect(projectsTouchedByFilter([project], { from: new Date(2026, 11, 1), to: new Date(2026, 11, 31) })).toHaveLength(0);
  });

  it('lists each arrival in its own month on the Jadwal sheet', () => {
    const oct = scheduleSheetRows([project], accountName, october);
    expect(oct.map((r) => [r['No. Pembayaran'], r['Diterima (Rp)'], r['Rekening Tujuan']])).toEqual([
      [3, 3_000_000, 'BCA'],
      [3, 1_000_000, 'BRI'],
    ]);
    expect(total(oct)).toBe(4_000_000);

    const nov = scheduleSheetRows([project], accountName, november);
    expect(nov.map((r) => [r['No. Pembayaran'], r['Diterima (Rp)']])).toEqual([
      [3, 1_500_000],
      [4, 5_500_000],
    ]);
    expect(total(nov)).toBe(7_000_000);
  });

  it('keeps one line per tagihan when there is no period', () => {
    const all = scheduleSheetRows([project], accountName, null);
    expect(all.map((r) => [r['No. Pembayaran'], r['Diterima (Rp)']])).toEqual([
      [3, 5_500_000],
      [4, 5_500_000],
    ]);
  });
});

describe('closed remainders in the exports', () => {
  const past = (m) => new Date(2026, m, 5);
  const project = {
    id: 'p', name: 'Toko', status: 'active',
    payments: [
      { no: 1, type: 'interest', expectedAmount: 5_500_000, dueDate: past(6), closure: { kind: 'carry', amount: 2_500_000, toNo: 2 } },
      { no: 2, type: 'interest', expectedAmount: 5_500_000, dueDate: past(7) },
      { no: 3, type: 'interest', expectedAmount: 5_500_000, dueDate: past(8), closure: { kind: 'waive', amount: 5_500_000, reason: 'manual' } },
    ],
    receipts: [{ id: 'a', amount: 3_000_000, date: past(6), accountId: 'bca', allocations: [{ no: 1, amount: 3_000_000 }] }],
  };

  it('leaves a carried month out of the Daftar Tagihan and asks for it on the month it moved to', () => {
    const rows = collectionRows([project], null);
    expect(rows).toHaveLength(2);
    const second = rows.find((r) => r.status !== 'Dianggap lunas');
    expect(second.amount).toBe(8_000_000);
    expect(rows.some((r) => r.status === 'Dianggap lunas')).toBe(true);
  });

  it('says how a closed month ended on the Jadwal sheet', () => {
    const lines = scheduleSheetRows([project], () => 'BCA', null);
    expect(lines[0].Status).toBe('Digabung ke bln 2');
    expect(lines[2].Status).toBe('Dianggap lunas');
  });
});

describe('Daftar Tagihan totals', () => {
  const on = (m) => new Date(2026, m, 5);
  const project = {
    id: 'p', name: 'Toko', status: 'active',
    payments: [
      { no: 1, type: 'interest', expectedAmount: 5_500_000, dueDate: on(6), closure: { kind: 'waive', amount: 2_500_000, reason: 'manual' } },
      { no: 2, type: 'interest', expectedAmount: 5_500_000, dueDate: on(7) },
      { no: 3, type: 'interest', expectedAmount: 5_500_000, dueDate: on(8) },
    ],
    receipts: [
      { id: 'a', amount: 3_000_000, date: on(6), accountId: 'bca', allocations: [{ no: 1, amount: 3_000_000 }] },
      { id: 'b', amount: 1_000_000, date: on(7), accountId: 'bca', allocations: [{ no: 2, amount: 1_000_000 }] },
    ],
  };

  it('counts a forgiven month as settled, not as still owed', () => {
    const rows = collectionRows([project], null);
    expect(rows.map((r) => [r.status, r.paid])).toEqual([
      ['Dianggap lunas', true], ['Kurang', false], ['Belum', false],
    ]);
    expect(collectionTotals(rows)).toEqual({ outstanding: 4_500_000 + 5_500_000, all: 3_000_000 + 4_500_000 + 5_500_000 });
  });
});
