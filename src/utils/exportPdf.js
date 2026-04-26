import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { formatDate, MONTHS } from './formatDate';
import { formatCurrency } from './formatCurrency';

const TYPE_LABEL = {
  income: 'Pemasukan',
  expense: 'Pengeluaran',
  transfer: 'Transfer',
};

export function exportTransactionsToPdf(transactions, accounts, periodLabel) {
  const doc = new jsPDF();
  const accountName = (id) => accounts.find((a) => a.id === id)?.name || '-';

  doc.setFontSize(16);
  doc.setFont('helvetica', 'bold');
  doc.text('Laporan Transaksi Pusat Gadai Madiun', 14, 18);
  doc.setFontSize(11);
  doc.setFont('helvetica', 'normal');
  doc.text(`Periode: ${periodLabel || 'Semua Transaksi'}`, 14, 25);
  doc.text(`Dicetak: ${formatDate(new Date())}`, 14, 31);

  let totalIncome = 0;
  let totalExpense = 0;

  const rows = transactions.map((tx, i) => {
    let rekening = '-';
    if (tx.type === 'income') {
      rekening = accountName(tx.toAccount);
      totalIncome += tx.amount;
    } else if (tx.type === 'expense') {
      rekening = accountName(tx.fromAccount);
      totalExpense += tx.amount;
    } else {
      rekening = `${accountName(tx.fromAccount)} -> ${accountName(tx.toAccount)}`;
    }
    const amountStr = tx.type === 'income' ? `+${formatCurrency(tx.amount)}` : tx.type === 'expense' ? `-${formatCurrency(tx.amount)}` : formatCurrency(tx.amount);
    return [i + 1, formatDate(tx.date), TYPE_LABEL[tx.type], tx.description || '-', rekening, amountStr];
  });

  autoTable(doc, {
    head: [['No', 'Tanggal', 'Jenis', 'Keterangan', 'Rekening', 'Jumlah']],
    body: rows,
    startY: 38,
    styles: { fontSize: 9, cellPadding: 2 },
    headStyles: { fillColor: [99, 102, 241], textColor: 255 },
    columnStyles: {
      0: { cellWidth: 10 },
      1: { cellWidth: 28 },
      2: { cellWidth: 26 },
      3: { cellWidth: 50 },
      4: { cellWidth: 40 },
      5: { cellWidth: 32, halign: 'right' },
    },
  });

  const finalY = doc.lastAutoTable.finalY + 8;
  doc.setFontSize(10);
  doc.setFont('helvetica', 'bold');
  doc.text(`Total Pemasukan: ${formatCurrency(totalIncome)}`, 14, finalY);
  doc.text(`Total Pengeluaran: ${formatCurrency(totalExpense)}`, 14, finalY + 6);
  doc.text(`Selisih: ${formatCurrency(totalIncome - totalExpense)}`, 14, finalY + 12);

  const now = new Date();
  const monthName = MONTHS[now.getMonth()];
  const filename = `Pusat Gadai Madiun_Transaksi_${periodLabel || `${monthName}_${now.getFullYear()}`}.pdf`;
  doc.save(filename);
}
