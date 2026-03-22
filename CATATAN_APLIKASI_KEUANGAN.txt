# Catatan Aplikasi Keuangan Pribadi

## Tujuan
Aplikasi pencatatan keuangan pribadi (gaya Moni) yang:
- mobile-first
- bisa diakses via web
- mengikuti alur pencatatan manual dari file Excel

## Stack Teknis
- Frontend: Vite + React (mobile-first responsive web app)
- Backend: Node.js
- ORM: Prisma
- Database: PostgreSQL

## Workflow Utama (Disesuaikan dari Catatan Manual)

### 1. Setup Awal
- Input master pemilik dana (contoh: Bashor Fauzan, Novan Visia, Niswa, Fatih)
- Input master rekening (bank/e-wallet/RDN/sekuritas)
- Input master aktivitas (Pribadi, Operasional, Dividen, IPO, dll)
- Input dana wajib bulanan dan kebutuhan rutin

### 2. Input Transaksi Harian
Field utama:
- Tanggal/Waktu
- Jenis transaksi: Income, Expense, Transfer, Investasi-In, Investasi-Out
- Aktivitas
- Pemilik
- Rekening sumber
- Rekening tujuan
- Jumlah
- Keterangan
- Validasi (opsional)

Aturan:
- Income: rekening tujuan wajib
- Expense: rekening sumber wajib
- Transfer: sumber + tujuan wajib
- Investasi-In/Out: wajib terhubung rekening investasi

### 3. Import Mutasi Rekening
- Import mutasi per rekening
- Parsing otomatis nominal masuk (+) dan keluar (-)
- Mapping mutasi ke transaksi utama untuk rekonsiliasi

### 4. Dashboard & Laporan
- Ringkasan bulanan: pemasukan, pengeluaran, saldo
- Breakdown per pemilik
- Breakdown per rekening
- Ringkasan investasi (net Investasi-In - Investasi-Out)
- Filter laporan: bulanan, tahunan, rentang tanggal

### 5. Anggaran
- Monitoring progress anggaran
- Sisa anggaran harian
- Notifikasi status aman/waspada

### 6. Closing Bulanan
- Validasi transaksi belum terklasifikasi
- Cek selisih mutasi vs transaksi
- Simpan ringkasan akhir bulan

## Struktur Menu Mobile/Web
- Beranda
- Laporan
- Tambah Transaksi (tombol +)
- Anggaran
- Akun/Pengaturan

## Catatan Implementasi
- Prioritas UI mobile dulu, lalu optimasi tablet/desktop
- API backend berbasis Node.js
- Prisma schema disiapkan untuk multi-pemilik, multi-rekening, transfer antar rekening, dan investasi
- Deploy web app agar tetap nyaman dibuka dari browser HP
