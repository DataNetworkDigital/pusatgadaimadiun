import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { formatCurrency } from './formatCurrency';
import { formatDate, MONTHS, toDate } from './formatDate';
import { projectSummary, projectEndFromDuration } from './projectSchedule';
import { PROJECT_COLUMNS, COLLECTION_COLUMNS, pickColumns, cellValue, cellText, pdfLayout } from './exportColumns';

export function projectSheetRows(list, picked, accountName) {
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

function paymentRow(p, payment, accountName) {
  return {
    Project: p.name,
    'Pemilik Project': p.ownerName || '',
    'No. Pembayaran': payment.no,
    Jenis: payment.type === 'final' ? 'Pelunasan' : 'Cicilan Return',
    'Jatuh Tempo': payment.dueDate ? formatDate(payment.dueDate) : '',
    'Estimasi (Rp)': payment.expectedAmount,
    'Diterima (Rp)': payment.receivedAmount ?? '',
    'Tanggal Diterima': payment.receivedDate ? formatDate(payment.receivedDate) : '',
    'Rekening Tujuan': accountName(payment.accountId),
    Status: payment.receivedAmount != null ? 'Diterima' : 'Belum',
  };
}

function downloadFilenameStamp() {
  const d = new Date();
  return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(
    d.getDate()
  ).padStart(2, '0')}`;
}

function inDateRange(date, filter) {
  if (!filter) return true;
  const d = toDate(date);
  if (!d) return false;
  const from = new Date(filter.from);
  from.setHours(0, 0, 0, 0);
  const to = new Date(filter.to);
  to.setHours(23, 59, 59, 999);
  return d >= from && d <= to;
}

function projectsTouchedByFilter(projects, filter) {
  if (!filter) return projects;
  return projects.filter((p) =>
    (p.payments || []).some(
      (pay) => pay.receivedDate && inDateRange(pay.receivedDate, filter)
    )
  );
}

function buildPeriodLabel(filter) {
  if (!filter) return '';
  const fmt = (d) => formatDate(d, { short: true });
  return ` · ${fmt(filter.from)} – ${fmt(filter.to)}`;
}

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

function pdfHeader(doc, periodLabel) {
  doc.setFontSize(16);
  doc.setFont('helvetica', 'bold');
  doc.text('Laporan Project — Pusat Gadai Madiun', 14, 18);
  doc.setFontSize(11);
  doc.setFont('helvetica', 'normal');
  doc.text(`Cakupan: ${periodLabel}`, 14, 25);
  doc.text(`Dicetak: ${formatDate(new Date())}`, 14, 31);
}

export function projectsToPdfRows(list, picked, accountName) {
  return list.map((p, index) => picked.map((c) => cellText(c, p, { index, accountName })));
}

// Placeholder line that keeps the column count intact when a section is empty.
export function emptyPdfRow(picked, message) {
  return [picked.map((c, i) => (i === 0 ? '—' : i === 1 ? message : ''))];
}

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

// ===== Daftar Tagihan (untuk penagih utang) =====
// One row per scheduled payment whose DUE DATE falls in the range (all
// statuses), so the collector knows who / when / where to collect.

function collectionRows(projects, filter) {
  const rows = [];
  projects.forEach((p) => {
    const startStr = p.startDate ? formatDate(p.startDate) : '';
    const end = projectEndFromDuration(p);
    const endStr = end ? formatDate(end) : '';
    const durasi = Number(p.durationMonths) || 0;
    (p.payments || []).forEach((pay) => {
      if (!pay.dueDate) return;
      if (filter && !inDateRange(pay.dueDate, filter)) return;
      const paid = pay.receivedAmount != null;
      rows.push({
        project: p.name,
        owner: p.ownerName || '',
        phone: p.phone || '',
        address: p.address || '',
        collateral: p.collateral || '',
        startStr,
        durasi,
        durasiStr: durasi ? `${durasi} bln` : '',
        endStr,
        due: toDate(pay.dueDate),
        dueStr: formatDate(pay.dueDate),
        jenis: pay.type === 'final' ? 'Pelunasan' : 'Cicilan',
        amount: paid ? (pay.receivedAmount || 0) : (pay.expectedAmount || 0),
        status: paid ? 'Lunas' : 'Belum',
        paidStr: pay.receivedDate ? formatDate(pay.receivedDate) : '',
      });
    });
  });
  rows.sort((a, b) => (a.due?.getTime() || 0) - (b.due?.getTime() || 0));
  return rows;
}

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

export function exportCollectionToPdf(projects, accounts, filter = null, columnKeys = null) {
  const rows = collectionRows(projects, filter);
  const picked = pickColumns(COLLECTION_COLUMNS, columnKeys);
  const { orientation, columnStyles } = pdfLayout(picked);
  const doc = new jsPDF({ orientation });
  const margin = orientation === 'landscape' ? { left: 6, right: 6 } : { left: 14, right: 14 };

  doc.setFontSize(16);
  doc.setFont('helvetica', 'bold');
  doc.text('Daftar Tagihan — Pusat Gadai Madiun', margin.left, 16);
  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  const periodStr = filter
    ? `${formatDate(filter.from, { short: true })} – ${formatDate(filter.to, { short: true })}`
    : 'Semua tanggal';
  doc.text(`Periode jatuh tempo: ${periodStr}`, margin.left, 22);
  doc.text(`Dicetak: ${formatDate(new Date())}`, margin.left, 27);

  const head = [picked.map((c) => c.label)];
  const body = rows.length
    ? rows.map((r) => picked.map((c) => cellText(c, r, {})))
    : [picked.map((c, i) => (i === 0 ? '—' : i === 1 ? 'Tidak ada tagihan pada periode ini' : ''))];

  autoTable(doc, {
    head,
    body,
    startY: 32,
    margin,
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

  const totalOutstanding = rows
    .filter((r) => r.status === 'Belum')
    .reduce((s, r) => s + r.amount, 0);
  const totalAll = rows.reduce((s, r) => s + r.amount, 0);
  const y = doc.lastAutoTable.finalY + 8;
  doc.setFontSize(10);
  doc.setFont('helvetica', 'bold');
  doc.text(`Total belum dibayar: ${formatCurrency(totalOutstanding)}`, margin.left, y);
  doc.setFont('helvetica', 'normal');
  doc.text(`Total semua tagihan: ${formatCurrency(totalAll)}`, margin.left, y + 6);

  doc.save(`Pusat Gadai Madiun_Tagihan_${downloadFilenameStamp()}.pdf`);
}

// no-op import to silence unused warning if MONTHS unused in some bundles
export const _toDate = toDate;
