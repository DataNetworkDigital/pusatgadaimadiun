import * as XLSX from 'xlsx';
import { formatDate } from './formatDate';
import { MONTHS } from './formatDate';

const TYPE_LABEL = {
  income: 'Pemasukan',
  expense: 'Pengeluaran',
  transfer: 'Transfer',
};

export function exportTransactionsToExcel(transactions, accounts, periodLabel) {
  const accountName = (id) => accounts.find((a) => a.id === id)?.name || '-';

  const rows = transactions.map((tx, i) => {
    const isIncome = tx.type === 'income';
    const amount = isIncome ? tx.amount : -tx.amount;
    let rekening = '-';
    if (tx.type === 'income') rekening = accountName(tx.toAccount);
    else if (tx.type === 'expense') rekening = accountName(tx.fromAccount);
    else rekening = `${accountName(tx.fromAccount)} → ${accountName(tx.toAccount)}`;

    return {
      No: i + 1,
      Tanggal: formatDate(tx.date),
      Jenis: TYPE_LABEL[tx.type] || tx.type,
      Keterangan: tx.description || '-',
      Jumlah: amount,
      Rekening: rekening,
    };
  });

  const ws = XLSX.utils.json_to_sheet(rows);
  ws['!cols'] = [
    { wch: 5 },
    { wch: 16 },
    { wch: 14 },
    { wch: 30 },
    { wch: 18 },
    { wch: 25 },
  ];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Transaksi');

  const now = new Date();
  const monthName = MONTHS[now.getMonth()];
  const filename = `Pusat Gadai Madiun_Transaksi_${periodLabel || `${monthName}_${now.getFullYear()}`}.xlsx`;
  XLSX.writeFile(wb, filename);
}
