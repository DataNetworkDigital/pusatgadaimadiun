# Pusat Gadai Madiun

Aplikasi pencatat transaksi keuangan pribadi berbahasa Indonesia. Mobile-first, simple, dan mudah digunakan. Dibangun dengan **React + Vite + Firebase Firestore**, di-host di **GitHub Pages**.

## Fitur

- 🔒 **PIN Lock** 6 digit (default `080808`, bisa diganti)
- 🏦 **Multi rekening** — bank, dompet digital, tunai
- 💸 **Transaksi** pemasukan, pengeluaran, transfer antar rekening
- 📋 **Utang & Piutang** dengan cicilan dan progress bar
- 📅 **Kalender** dengan indicator transaksi & reminder rutin
- 📊 **Dashboard** ringkasan saldo + grafik pemasukan vs pengeluaran
- 🔍 **Search & Filter** transaksi berdasarkan jenis, rekening, tanggal
- 📤 **Export** ke Excel (.xlsx) dan PDF
- 📱 Mobile-first, touch-friendly, tanpa zoom otomatis

## Setup

### 1. Install dependencies

```bash
npm install
```

### 2. Buat project Firebase

1. Buka [Firebase Console](https://console.firebase.google.com/) → buat project baru.
2. Aktifkan **Cloud Firestore** (mode test untuk awal).
3. Tambahkan **Web App** → salin konfigurasi Firebase.

### 3. Konfigurasi environment

Salin `.env.example` menjadi `.env` dan isi dengan kredensial Firebase Anda:

```bash
cp .env.example .env
```

```env
VITE_FIREBASE_API_KEY=...
VITE_FIREBASE_AUTH_DOMAIN=your_project.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=your_project_id
VITE_FIREBASE_STORAGE_BUCKET=your_project.appspot.com
VITE_FIREBASE_MESSAGING_SENDER_ID=...
VITE_FIREBASE_APP_ID=...
```

### 4. Jalankan dev server

```bash
npm run dev
```

Buka `http://localhost:5173` lalu masukkan PIN default **`080808`**.

## Deploy ke GitHub Pages

### 1. Push ke repo bernama `pusat-gadai-madiun`

`vite.config.js` sudah disetel dengan `base: '/pusat-gadai-madiun/'`. Jika nama repo berbeda, ubah nilai ini.

### 2. Atur GitHub Pages

Di repo GitHub: **Settings → Pages → Source: GitHub Actions**.

### 3. Tambahkan secrets Firebase

**Settings → Secrets and variables → Actions** → tambahkan secret berikut:

- `VITE_FIREBASE_API_KEY`
- `VITE_FIREBASE_AUTH_DOMAIN`
- `VITE_FIREBASE_PROJECT_ID`
- `VITE_FIREBASE_STORAGE_BUCKET`
- `VITE_FIREBASE_MESSAGING_SENDER_ID`
- `VITE_FIREBASE_APP_ID`

### 4. Push ke `main`

Workflow `.github/workflows/deploy.yml` akan otomatis build dan deploy. URL akhir: `https://<username>.github.io/pusat-gadai-madiun/`.

## Firestore Security Rules (saran)

Aplikasi ini menggunakan PIN sebagai gatekeeper di sisi client. Untuk app personal, rules berikut cukup:

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /{document=**} {
      allow read, write: if true;
    }
  }
}
```

> ⚠️ Rules di atas membuat database terbuka. Untuk keamanan lebih baik, aktifkan **Anonymous Auth** di Firebase dan ubah rules menjadi `if request.auth != null`, lalu tambahkan `signInAnonymously()` di `firebase.js`.

## Struktur Data Firestore

```
config/settings        → { pinHash, createdAt }
accounts/{id}          → { name, accountNumber, balance, createdAt, updatedAt }
transactions/{id}      → { type, amount, description, date, fromAccount, toAccount, debtId, createdAt }
debts/{id}             → { type, personName, totalAmount, remainingAmount, startDate, dueDate, status, installments[], description, createdAt }
reminders/{id}         → { title, dayOfMonth, amount, accountId, isActive, createdAt }
```

## Stack

- React 18 + Vite
- Tailwind CSS 3
- React Router v6 (HashRouter agar kompatibel dengan GitHub Pages)
- Firebase Firestore
- Recharts (grafik)
- jsPDF + jsPDF-AutoTable (PDF export)
- SheetJS / xlsx (Excel export)

## Lisensi

MIT — bebas dipakai dan dimodifikasi.
