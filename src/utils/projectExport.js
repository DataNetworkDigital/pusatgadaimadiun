import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { formatCurrency } from './formatCurrency';
import { formatDate, MONTHS, toDate } from './formatDate';
import { projectSummary } from './projectSchedule';

const STATUS_LABEL = {
  active: 'Aktif',
  completed: 'Selesai',
  default: 'Macet',
};

function projectRow(p, accountName) {
  const summary = projectSummary(p);
  const startDate = p.startDate ? formatDate(p.startDate) : '';
  const closedAt = p.closedAt ? formatDate(p.closedAt) : '';
  return {
    Nama: p.name,
    Pemilik: p.ownerName || '',
    'No. HP': p.phone || '',
    NIK: p.nik || '',
    Alamat: p.address || '',
    Agunan: p.collateral || '',
    'No. Kontrak': p.contractNumber || '',
    Status: STATUS_LABEL[p.status] || p.status,
    'Nilai Project': p.principalAmount,
    'Modal Keluar': p.disbursedAmount,
    'Return / Bulan (%)': p.monthlyReturnPct,
    'Durasi (bulan)': p.durationMonths,
    'Tanggal Mulai': startDate,
    'Hari Pembayaran': p.paymentDayOfMonth,
    'Rekening Sumber': accountName(p.sourceAccountId),
    'Total Diterima': summary.receivedSoFar,
    'Sisa Diharapkan': summary.expectedRemaining,
    'Posisi Kas Bersih': summary.netCashChange,
    'Kerugian Final': p.lossAmount || 0,
    'Tanggal Tutup': closedAt,
    Catatan: p.description || '',
    'Bukti / Kontrak': p.proofUrl || '',
  };
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

function fmtIdrCellArray(rows, currencyKeys) {
  // rows is plain object array; nothing to do for the JSON conversion since
  // numbers stay numeric. Excel still treats them as numbers — user can
  // format the column themselves if needed.
  return rows;
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

export function exportProjectsToExcel(projects, accounts, filter = null) {
  const accountName = (id) => accounts.find((a) => a.id === id)?.name || '';
  const sourceList = filter ? projectsTouchedByFilter(projects, filter) : projects;
  const active = sourceList.filter((p) => p.status === 'active');
  const archive = sourceList.filter((p) => p.status === 'completed' || p.status === 'default');

  const wb = XLSX.utils.book_new();

  // Sheet: Project Aktif
  const sheetActive = XLSX.utils.json_to_sheet(active.map((p) => projectRow(p, accountName)));
  sheetActive['!cols'] = [
    { wch: 30 }, { wch: 20 }, { wch: 16 }, { wch: 10 },
    { wch: 14 }, { wch: 14 }, { wch: 12 }, { wch: 10 },
    { wch: 14 }, { wch: 8 }, { wch: 18 }, { wch: 14 },
    { wch: 14 }, { wch: 14 }, { wch: 14 }, { wch: 14 },
    { wch: 30 }, { wch: 30 },
  ];
  XLSX.utils.book_append_sheet(wb, sheetActive, 'Project Aktif');

  // Sheet: Riwayat
  const sheetArchive = XLSX.utils.json_to_sheet(archive.map((p) => projectRow(p, accountName)));
  sheetArchive['!cols'] = sheetActive['!cols'];
  XLSX.utils.book_append_sheet(wb, sheetArchive, 'Riwayat');

  // Sheet: Jadwal Pembayaran (filtered by receivedDate when filter set)
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

  fmtIdrCellArray(active, []);
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

function projectsToPdfRows(list, accountName) {
  return list.map((p, i) => {
    const summary = projectSummary(p);
    return [
      i + 1,
      p.name + (p.ownerName ? `\n(${p.ownerName})` : ''),
      STATUS_LABEL[p.status] || p.status,
      formatCurrency(p.disbursedAmount),
      `${p.monthlyReturnPct}%`,
      `${p.durationMonths} bln`,
      formatCurrency(summary.receivedSoFar),
      formatCurrency(summary.expectedRemaining),
      formatCurrency(summary.netCashChange),
    ];
  });
}

export function exportProjectsToPdf(projects, accounts, mode = 'all', filter = null) {
  const accountName = (id) => accounts.find((a) => a.id === id)?.name || '';
  const doc = new jsPDF();
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
  const columns = [
    { header: 'No', dataKey: 0 },
    { header: 'Nama / Pemilik', dataKey: 1 },
    { header: 'Status', dataKey: 2 },
    { header: 'Modal Keluar', dataKey: 3 },
    { header: 'Return/bln', dataKey: 4 },
    { header: 'Durasi', dataKey: 5 },
    { header: 'Diterima', dataKey: 6 },
    { header: 'Sisa', dataKey: 7 },
    { header: 'Net', dataKey: 8 },
  ];

  if (includeActive) {
    doc.setFontSize(12);
    doc.setFont('helvetica', 'bold');
    doc.text('Project Aktif', 14, cursorY);
    cursorY += 4;
    autoTable(doc, {
      head: [columns.map((c) => c.header)],
      body: active.length > 0 ? projectsToPdfRows(active, accountName) : [['—', 'Tidak ada project aktif', '', '', '', '', '', '', '']],
      startY: cursorY,
      styles: { fontSize: 8.5, cellPadding: 2 },
      headStyles: { fillColor: [45, 74, 107], textColor: 248 },
      columnStyles: {
        0: { cellWidth: 8 },
        1: { cellWidth: 40 },
        2: { cellWidth: 18 },
        3: { cellWidth: 24, halign: 'right' },
        4: { cellWidth: 16, halign: 'right' },
        5: { cellWidth: 12, halign: 'right' },
        6: { cellWidth: 22, halign: 'right' },
        7: { cellWidth: 22, halign: 'right' },
        8: { cellWidth: 22, halign: 'right' },
      },
    });
    cursorY = doc.lastAutoTable.finalY + 8;
  }

  if (includeArchive) {
    doc.setFontSize(12);
    doc.setFont('helvetica', 'bold');
    doc.text('Riwayat Project', 14, cursorY);
    cursorY += 4;
    autoTable(doc, {
      head: [columns.map((c) => c.header)],
      body: archive.length > 0 ? projectsToPdfRows(archive, accountName) : [['—', 'Tidak ada riwayat project', '', '', '', '', '', '', '']],
      startY: cursorY,
      styles: { fontSize: 8.5, cellPadding: 2 },
      headStyles: { fillColor: [184, 84, 80], textColor: 248 },
      columnStyles: {
        0: { cellWidth: 8 },
        1: { cellWidth: 40 },
        2: { cellWidth: 18 },
        3: { cellWidth: 24, halign: 'right' },
        4: { cellWidth: 16, halign: 'right' },
        5: { cellWidth: 12, halign: 'right' },
        6: { cellWidth: 22, halign: 'right' },
        7: { cellWidth: 22, halign: 'right' },
        8: { cellWidth: 22, halign: 'right' },
      },
    });
    cursorY = doc.lastAutoTable.finalY + 8;
  }

  // Summary footer
  const totalDisbursed = sourceList.reduce((s, p) => s + (p.disbursedAmount || 0), 0);
  const totalReceived = sourceList.reduce(
    (s, p) => s + projectSummary(p).receivedSoFar,
    0
  );
  let totalReceivedInRange = totalReceived;
  if (filter) {
    totalReceivedInRange = 0;
    sourceList.forEach((p) => {
      (p.payments || []).forEach((pay) => {
        if (pay.receivedDate && inDateRange(pay.receivedDate, filter)) {
          totalReceivedInRange += pay.receivedAmount || 0;
        }
      });
    });
  }
  doc.setFontSize(10);
  doc.setFont('helvetica', 'bold');
  doc.text(`Total Modal Keluar: ${formatCurrency(totalDisbursed)}`, 14, cursorY);
  doc.text(
    `Total Diterima${filter ? ' (dalam rentang)' : ''}: ${formatCurrency(totalReceivedInRange)}`,
    14,
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

function projectEndDate(p) {
  const dues = (p.payments || []).map((pay) => toDate(pay.dueDate)).filter(Boolean);
  if (!dues.length) return null;
  return new Date(Math.max(...dues.map((d) => d.getTime())));
}

// Contractual project end = start + durationMonths (on the payment day). Stays
// correct even if the project was settled early (which truncates payments).
function projectEndFromDuration(p) {
  const start = toDate(p.startDate);
  const dur = Number(p.durationMonths) || 0;
  if (!start || !dur) return projectEndDate(p);
  const day = Number(p.paymentDayOfMonth) || start.getDate();
  const anchor = new Date(start.getFullYear(), start.getMonth() + dur, 1);
  const lastDay = new Date(anchor.getFullYear(), anchor.getMonth() + 1, 0).getDate();
  anchor.setDate(Math.min(day, lastDay));
  return anchor;
}

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

export function exportCollectionToExcel(projects, accounts, filter = null) {
  const rows = collectionRows(projects, filter);
  const wb = XLSX.utils.book_new();
  const sheet = XLSX.utils.json_to_sheet(
    rows.map((r) => ({
      'Jatuh Tempo': r.dueStr,
      Pemilik: r.owner,
      Project: r.project,
      'No. HP': r.phone,
      Alamat: r.address,
      Agunan: r.collateral,
      'Mulai Proyek': r.startStr,
      'Durasi (bln)': r.durasi,
      'Berakhir Proyek': r.endStr,
      Jenis: r.jenis,
      'Nominal Tagihan': r.amount,
      Status: r.status,
      'Tgl Bayar': r.paidStr,
    }))
  );
  sheet['!cols'] = [
    { wch: 14 }, { wch: 20 }, { wch: 24 }, { wch: 16 }, { wch: 32 },
    { wch: 26 }, { wch: 14 }, { wch: 11 }, { wch: 15 }, { wch: 12 }, { wch: 16 }, { wch: 10 }, { wch: 14 },
  ];
  XLSX.utils.book_append_sheet(wb, sheet, 'Daftar Tagihan');
  XLSX.writeFile(wb, `Pusat Gadai Madiun_Tagihan_${downloadFilenameStamp()}.xlsx`);
}

export function exportCollectionToPdf(projects, accounts, filter = null) {
  const rows = collectionRows(projects, filter);
  const doc = new jsPDF({ orientation: 'landscape' });
  doc.setFontSize(16);
  doc.setFont('helvetica', 'bold');
  doc.text('Daftar Tagihan — Pusat Gadai Madiun', 14, 16);
  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  const periodStr = filter
    ? `${formatDate(filter.from, { short: true })} – ${formatDate(filter.to, { short: true })}`
    : 'Semua tanggal';
  doc.text(`Periode jatuh tempo: ${periodStr}`, 14, 22);
  doc.text(`Dicetak: ${formatDate(new Date())}`, 14, 27);

  const head = [[
    'Jatuh Tempo', 'Pemilik', 'Project', 'No. HP', 'Alamat', 'Agunan',
    'Mulai', 'Durasi', 'Berakhir', 'Jenis', 'Nominal', 'Status',
  ]];
  const body = rows.length
    ? rows.map((r) => [
        r.dueStr, r.owner, r.project, r.phone, r.address, r.collateral,
        r.startStr, r.durasiStr, r.endStr, r.jenis, formatCurrency(r.amount), r.status,
      ])
    : [['—', 'Tidak ada tagihan pada periode ini', '', '', '', '', '', '', '', '', '', '']];

  autoTable(doc, {
    head,
    body,
    startY: 32,
    margin: { left: 6, right: 6 },
    styles: { fontSize: 8, cellPadding: 2, valign: 'middle', overflow: 'linebreak' },
    headStyles: { fillColor: [45, 74, 107], textColor: 248 },
    // All columns fixed except Alamat (index 4), which flexes to fill the full
    // page width so there is no empty space on the right.
    columnStyles: {
      0: { cellWidth: 20 },
      1: { cellWidth: 32 },
      2: { cellWidth: 32 },
      3: { cellWidth: 24 },
      5: { cellWidth: 36 },
      6: { cellWidth: 20 },
      7: { cellWidth: 14 },
      8: { cellWidth: 20 },
      9: { cellWidth: 18 },
      10: { cellWidth: 27, halign: 'right' },
      11: { cellWidth: 14 },
    },
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
  doc.text(`Total belum dibayar: ${formatCurrency(totalOutstanding)}`, 14, y);
  doc.setFont('helvetica', 'normal');
  doc.text(`Total semua tagihan: ${formatCurrency(totalAll)}`, 14, y + 6);

  doc.save(`Pusat Gadai Madiun_Tagihan_${downloadFilenameStamp()}.pdf`);
}

// no-op import to silence unused warning if MONTHS unused in some bundles
export const _toDate = toDate;
