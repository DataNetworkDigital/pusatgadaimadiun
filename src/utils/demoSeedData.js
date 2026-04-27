import { Timestamp } from 'firebase/firestore';

const ONE_DAY = 86400000;

function daysAgo(n) {
  return new Date(Date.now() - n * ONE_DAY);
}

function daysFromNow(n) {
  return new Date(Date.now() + n * ONE_DAY);
}

function ts(d) {
  return Timestamp.fromDate(d);
}

function firstOfThisMonth() {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth(), 1);
}

export function buildDemoSeed() {
  const now = new Date();
  const t30 = ts(daysAgo(30));
  const t14 = ts(daysAgo(14));
  const tNow = ts(now);

  const accounts = [
    { key: 'BCA',    name: 'BCA',        accountNumber: '1234567890',  balance: 15750000, createdAt: t30, updatedAt: tNow },
    { key: 'GoPay',  name: 'GoPay',      accountNumber: '081234567890', balance: 850000,   createdAt: t30, updatedAt: tNow },
    { key: 'Kas',    name: 'Kas/Tunai',  accountNumber: '-',            balance: 2300000,  createdAt: t30, updatedAt: tNow },
    { key: 'BRI',    name: 'BRI',        accountNumber: '0987654321',   balance: 8200000,  createdAt: t14, updatedAt: tNow },
  ];

  const transactions = [
    { type: 'income',  amount: 12000000, description: 'Gaji bulan ini',          dateRef: ts(firstOfThisMonth()),       fromKey: null,    toKey: 'BCA' },
    { type: 'income',  amount: 2500000,  description: 'Freelance project',        dateRef: ts(daysAgo(20)),               fromKey: null,    toKey: 'BCA' },
    { type: 'income',  amount: 500000,   description: 'Cashback promo',           dateRef: ts(daysAgo(15)),               fromKey: null,    toKey: 'GoPay' },
    { type: 'income',  amount: 1000000,  description: 'Transfer dari orang tua',  dateRef: ts(daysAgo(10)),               fromKey: null,    toKey: 'BRI' },

    { type: 'expense', amount: 3500000,  description: 'Bayar kos bulan ini',      dateRef: ts(daysAgo(25)),               fromKey: 'BCA',   toKey: null },
    { type: 'expense', amount: 150000,   description: 'Listrik token',            dateRef: ts(daysAgo(23)),               fromKey: 'GoPay', toKey: null },
    { type: 'expense', amount: 85000,    description: 'Pulsa & internet',         dateRef: ts(daysAgo(23)),               fromKey: 'GoPay', toKey: null },
    { type: 'expense', amount: 450000,   description: 'Belanja mingguan Indomaret', dateRef: ts(daysAgo(22)),             fromKey: 'Kas',   toKey: null },
    { type: 'expense', amount: 120000,   description: 'Makan siang x 3 hari',     dateRef: ts(daysAgo(21)),               fromKey: 'Kas',   toKey: null },
    { type: 'expense', amount: 250000,   description: 'Bensin motor',             dateRef: ts(daysAgo(18)),               fromKey: 'Kas',   toKey: null },
    { type: 'expense', amount: 75000,    description: 'Grab ke kantor klien',     dateRef: ts(daysAgo(16)),               fromKey: 'GoPay', toKey: null },
    { type: 'expense', amount: 350000,   description: 'Belanja mingguan',         dateRef: ts(daysAgo(15)),               fromKey: 'Kas',   toKey: null },
    { type: 'expense', amount: 199000,   description: 'Netflix + Spotify',        dateRef: ts(daysAgo(14)),               fromKey: 'BCA',   toKey: null },
    { type: 'expense', amount: 180000,   description: 'Makan bareng teman',       dateRef: ts(daysAgo(12)),               fromKey: 'GoPay', toKey: null },
    { type: 'expense', amount: 500000,   description: 'Service motor',            dateRef: ts(daysAgo(8)),                fromKey: 'Kas',   toKey: null },
    { type: 'expense', amount: 89000,    description: 'Beli buku online',         dateRef: ts(daysAgo(6)),                fromKey: 'BCA',   toKey: null },
    { type: 'expense', amount: 65000,    description: 'Kopi & makan siang',       dateRef: ts(daysAgo(3)),                fromKey: 'GoPay', toKey: null },
    { type: 'expense', amount: 220000,   description: 'Belanja kebutuhan',        dateRef: ts(daysAgo(1)),                fromKey: 'Kas',   toKey: null },

    { type: 'transfer', amount: 1000000, description: 'Top up GoPay',             dateRef: ts(daysAgo(24)),               fromKey: 'BCA',   toKey: 'GoPay' },
    { type: 'transfer', amount: 500000,  description: 'Tarik tunai ATM',          dateRef: ts(daysAgo(19)),               fromKey: 'BCA',   toKey: 'Kas' },
    { type: 'transfer', amount: 2000000, description: 'Transfer ke BRI tabungan', dateRef: ts(daysAgo(11)),               fromKey: 'BCA',   toKey: 'BRI' },
  ];

  const debts = [
    {
      type: 'utang',
      personName: 'Budi (teman kantor)',
      totalAmount: 1500000,
      remainingAmount: 750000,
      startDate: ts(daysAgo(20)),
      dueDate: ts(daysFromNow(10)),
      description: 'Pinjam untuk service laptop',
      status: 'partial',
      installments: [
        { amount: 500000, date: ts(daysAgo(10)) },
        { amount: 250000, date: ts(daysAgo(3)) },
      ],
    },
    {
      type: 'piutang',
      personName: 'Rina',
      totalAmount: 500000,
      remainingAmount: 500000,
      startDate: ts(daysAgo(15)),
      dueDate: ts(daysFromNow(5)),
      description: 'Ditalangin makan waktu hangout',
      status: 'unpaid',
      installments: [],
    },
    {
      type: 'utang',
      personName: 'Mama',
      totalAmount: 3000000,
      remainingAmount: 3000000,
      startDate: ts(daysAgo(25)),
      dueDate: ts(daysFromNow(60)),
      description: 'Pinjaman untuk bayar kos 2 bulan',
      status: 'unpaid',
      installments: [],
    },
    {
      type: 'piutang',
      personName: 'Agus (adik)',
      totalAmount: 1000000,
      remainingAmount: 300000,
      startDate: ts(daysAgo(30)),
      dueDate: ts(daysAgo(2)),
      description: 'Pinjam buat beli sepatu',
      status: 'partial',
      installments: [
        { amount: 400000, date: ts(daysAgo(20)) },
        { amount: 300000, date: ts(daysAgo(7)) },
      ],
    },
  ];

  const reminders = [
    { title: 'Bayar Kos',       dayOfMonth: 5,  amount: 3500000, accountKey: 'BCA',   isActive: true },
    { title: 'Token Listrik',   dayOfMonth: 7,  amount: 150000,  accountKey: 'GoPay', isActive: true },
    { title: 'Bayar WiFi',      dayOfMonth: 10, amount: 350000,  accountKey: 'BCA',   isActive: true },
    { title: 'Cicilan ke Budi', dayOfMonth: 20, amount: 250000,  accountKey: 'Kas',   isActive: true },
  ];

  return { accounts, transactions, debts, reminders };
}
