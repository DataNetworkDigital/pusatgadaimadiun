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

  // Active project: started 2 months ago, 6 months duration, 4.5%/bulan,
  // payments 1 and 2 already received, payments 3-6 still pending.
  const activeStart = daysAgo(60);
  const activeStartTs = ts(activeStart);
  const projectActivePayments = [];
  const activePrincipal = 10000000;
  const activeReturnPct = 4.5;
  const activeInterest = Math.round((activePrincipal * activeReturnPct) / 100);
  for (let i = 1; i <= 6; i++) {
    const due = new Date(activeStart);
    due.setMonth(due.getMonth() + i);
    const isFinal = i === 6;
    const expected = isFinal ? activeInterest + activePrincipal : activeInterest;
    const received = i <= 2;
    projectActivePayments.push({
      no: i,
      dueDate: ts(due),
      type: isFinal ? 'final' : 'interest',
      expectedAmount: expected,
      receivedAmount: received ? expected : null,
      receivedDate: received ? ts(new Date(due.getTime() - 86400000 * 2)) : null,
      transactionId: null,
      accountKey: received ? 'BCA' : null,
    });
  }

  // Completed project: 3 months duration, all paid, BCA account
  const doneStart = daysAgo(120);
  const donePrincipal = 5000000;
  const doneReturnPct = 5;
  const doneInterest = Math.round((donePrincipal * doneReturnPct) / 100);
  const projectDonePayments = [];
  for (let i = 1; i <= 3; i++) {
    const due = new Date(doneStart);
    due.setMonth(due.getMonth() + i);
    const isFinal = i === 3;
    const expected = isFinal ? doneInterest + donePrincipal : doneInterest;
    projectDonePayments.push({
      no: i,
      dueDate: ts(due),
      type: isFinal ? 'final' : 'interest',
      expectedAmount: expected,
      receivedAmount: expected,
      receivedDate: ts(due),
      transactionId: null,
      accountKey: 'BCA',
    });
  }

  const projects = [
    {
      key: 'proj-active',
      name: 'Modal Toko Sembako Pak Budi',
      description: 'Pinjaman modal usaha toko sembako, jangka 6 bulan',
      principalAmount: activePrincipal,
      disbursedAmount: 9500000, // upfront discount Rp 500k
      monthlyReturnPct: activeReturnPct,
      durationMonths: 6,
      startDate: activeStartTs,
      paymentDayOfMonth: activeStart.getDate(),
      sourceKey: 'BCA',
      status: 'active',
      payments: projectActivePayments,
      proofUrl: null,
      createdAt: activeStartTs,
    },
    {
      key: 'proj-done',
      name: 'Pendanaan Warung Bu Sari',
      description: 'Modal warung makan, sudah lunas tepat waktu',
      principalAmount: donePrincipal,
      disbursedAmount: donePrincipal,
      monthlyReturnPct: doneReturnPct,
      durationMonths: 3,
      startDate: ts(doneStart),
      paymentDayOfMonth: doneStart.getDate(),
      sourceKey: 'BCA',
      status: 'completed',
      closedAt: ts(new Date(doneStart.getTime() + 86400000 * 91)),
      payments: projectDonePayments,
      proofUrl: null,
      createdAt: ts(doneStart),
    },
  ];

  return { accounts, transactions, debts, reminders, projects };
}
