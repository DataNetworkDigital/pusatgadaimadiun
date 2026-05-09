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

export function exportProjectsToExcel(projects, accounts) {
  const accountName = (id) => accounts.find((a) => a.id === id)?.name || '';
  const active = projects.filter((p) => p.status === 'active');
  const archive = projects.filter((p) => p.status === 'completed' || p.status === 'default');

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

  // Sheet: Jadwal Pembayaran (semua project)
  const allPayments = [];
  projects.forEach((p) => {
    (p.payments || []).forEach((pay) => {
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

export function exportProjectsToPdf(projects, accounts, mode = 'all') {
  const accountName = (id) => accounts.find((a) => a.id === id)?.name || '';
  const doc = new jsPDF();
  const active = projects.filter((p) => p.status === 'active');
  const archive = projects.filter((p) => p.status === 'completed' || p.status === 'default');

  const includeActive = mode === 'all' || mode === 'active';
  const includeArchive = mode === 'all' || mode === 'archive';
  const periodLabel =
    mode === 'active' ? 'Project Aktif' : mode === 'archive' ? 'Riwayat Project' : 'Semua Project';

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
  const totalDisbursed = projects.reduce((s, p) => s + (p.disbursedAmount || 0), 0);
  const totalReceived = projects.reduce(
    (s, p) => s + projectSummary(p).receivedSoFar,
    0
  );
  doc.setFontSize(10);
  doc.setFont('helvetica', 'bold');
  doc.text(`Total Modal Keluar: ${formatCurrency(totalDisbursed)}`, 14, cursorY);
  doc.text(`Total Diterima: ${formatCurrency(totalReceived)}`, 14, cursorY + 6);

  const now = new Date();
  const monthName = MONTHS[now.getMonth()];
  const filename = `Pusat Gadai Madiun_Project_${periodLabel.replace(/\s+/g, '_')}_${monthName}_${now.getFullYear()}.pdf`;
  doc.save(filename);
}

// no-op import to silence unused warning if MONTHS unused in some bundles
export const _toDate = toDate;
