# Plan Integrasi Modul Saham dan IPO dari `coba4-file-penting` ke `aplikasi_keuangan`

## Ringkasan

Tujuan integrasi ini adalah menambahkan modul `Saham` dan `IPO` ke aplikasi utama `aplikasi_keuangan` tanpa mengubah identitas aplikasi sebagai personal finance app. Integrasi akan dilakukan dengan pendekatan **MVP (Minimum Viable Product)** yang berfokus HANYA pada pencatatan transaksi saham dan IPO secara manual ke database.

Artinya, fitur saham/IPO dari `d:\Sistem\coba4-file-penting` akan dipetakan ke arsitektur, routing, auth, service layer, dan database `aplikasi_keuangan`, lalu UI lama `coba4` hanya dipakai sebagai referensi visual dan logika bisnis. Fitur otomasi seperti integrasi *webhook* dari email sekuritas ditunda untuk fase selanjutnya agar tidak mengganggu stabilitas aplikasi.

Hasil akhir yang ditargetkan:
- aplikasi utama tetap memakai auth, shell, dan navigasi `aplikasi_keuangan`
- muncul menu baru untuk pencatatan riwayat saham dan IPO secara manual
- data saham/IPO tidak lagi disimpan di `localStorage` melainkan masuk ke backend Prisma/Postgres
- posisi saham (sisa lot) dan *Realized PnL* dihitung secara *on-the-fly* dari riwayat transaksi
- modul investasi lama tetap berjalan independen, tetapi tidak menjadi sumber kebenaran posisi saham per ticker

## Keputusan Utama

1. Proyek sumber yang dipakai adalah `d:\Sistem\coba4-file-penting`.
2. Scope integrasi disederhanakan: HANYA modul transaksi saham dan pesanan IPO.
3. Otomasi webhook dan *parser* email ditiadakan dari fase MVP ini. Pengguna akan menginput riwayat beli/jual secara manual.
4. `aplikasi_keuangan` menjadi source of truth untuk auth, routing, database, API, dan deployment.
5. UI `coba4` dipakai sebagai referensi fitur.
6. Semua penyimpanan `localStorage` di `coba4` diganti menjadi persistence backend.

## Cakupan Fitur

### In Scope

- Akses ke halaman baru (ditempatkan di dalam menu `Investasi`):
  - `Saham`
  - `IPO`
- Tambah model data backend (Prisma) untuk:
  - transaksi saham (Beli/Jual)
  - order/pesanan IPO
  - histori transaksi dari IPO
- Tambah API endpoint dan service frontend untuk CRUD saham/IPO
- Kalkulasi *on-the-fly* posisi saham dan *Realized PnL* berdasarkan metode FIFO
- Integrasi dengan akun existing bertipe `RDN` dan `Sekuritas`
- **Integrasi "Target Investasi"**: Fitur target (bulanan/bebas) yang mengharuskan pengguna melakukan Transfer (TF) ke akun Sekuritas yang ditentukan.
- Migrasi logika IPO dari `localStorage` ke alur database
### Out of Scope (Ditunda / Tidak Dikerjakan)

- **Otomasi Webhook & Parser Notifikasi Sekuritas** (penginputan data full manual)
- Tabel khusus untuk *Snapshot* posisi saham di database (dihitung *on-the-fly* saja)
- Import histori saham dari broker secara bulk (CSV)
- Mark-to-market harga realtime dari API pihak ketiga
- Rekonstruksi backend `coba4` yang hilang secara terpisah
- Fitur chart lanjutan atau analitik trading kompleks

## Arsitektur Target

### Frontend

Gunakan shell dan routing existing di `client/src/App.tsx` dan layout existing `aplikasi_keuangan`. Modul saham akan ditambahkan sebagai route baru di bawah protected route.

Route baru:
- `/stocks`
- `/stocks/ipo`

Struktur halaman baru:
- `client/src/pages/Stocks.tsx`
- `client/src/pages/StocksIpo.tsx`

Struktur komponen baru:
- `client/src/components/stocks/StockDashboard.tsx`
- `client/src/components/stocks/StockTransactionsTable.tsx`
- `client/src/components/stocks/StockPositionsTable.tsx`
- `client/src/components/stocks/IpoBoard.tsx`
- `client/src/components/stocks/IpoFormModal.tsx`

Service baru:
- `client/src/services/stocks.ts`
- `client/src/services/stocksIpo.ts`

Prinsip frontend:
- ikuti pola service layer existing
- reuse auth/session dan visual tokens/layout existing `aplikasi_keuangan`
- logika hitung posisi dipusatkan di fungsi *helper* yang dibagikan (shared helper)

### Backend

Backend existing `server` menjadi jalur utama untuk modul saham/IPO.

Route baru:
- `server/routes/stocks.ts`
- `server/routes/stocksIpo.ts`

Helper baru:
- `server/lib/stockPositionCalculator.ts` (untuk kalkulasi *on-the-fly* dari riwayat `StockTransaction`)
- `server/lib/ipoRules.ts`

### Database

Tambahkan model terpisah untuk domain saham/IPO. 

Model baru yang direkomendasikan (Lebih ramping dari rencana awal):

- `StockTransaction`
  - `id`
  - `ownerId`
  - `accountId`
  - `ticker`
  - `side` (BUY/SELL)
  - `lot`
  - `pricePerShare`
  - `grossValue`
  - `brokerFee`
  - `levyFee`
  - `netValue`
  - `tradedAt`
  - `notes?`

- `IpoOrder`
  - `id`
  - `ownerId`
  - `accountId`
  - `ticker`
  - `broker`
  - `ipoPrice`
  - `lotRequested`
  - `lotAllocated`
  - `sellPrice?`
  - `status` (PESAN, JATAH, TIDAK_JATAH, JUAL)
  - `notes?`
  - `orderedAt`
  - `updatedAt`

- `IpoTransaction`
  - `id`
  - `ipoOrderId`
  - `ownerId`
  - `accountId`
  - `ticker`
  - `side`
  - `lot`
  - `pricePerShare`
  - `grossValue`
  - `feePercent`
  - `feeAmount`
  - `netValue`
  - `tradedAt`

Relasi yang dipilih:
- `ownerId` wajib, supaya konsisten dengan domain existing
- `accountId` wajib merujuk ke tabel `Account` (khusus tipe `RDN` atau `Sekuritas`)

## Perubahan Public API / Interface / Type

### API baru

- `GET /api/stocks/transactions`
  - filter opsional: `ownerId`, `accountId`, `ticker`, `dateFrom`, `dateTo`
- `POST /api/stocks/transactions`
- `PATCH /api/stocks/transactions/:id`
- `DELETE /api/stocks/transactions/:id`

- `GET /api/stocks/positions`
  - Hasil kalkulasi posisi terkini dan *Realized PnL* per `ticker` (dihitung *on-the-fly* di backend lalu di-serve ke frontend).

- `GET /api/stocks/ipo/orders`
- `POST /api/stocks/ipo/orders`
- `PATCH /api/stocks/ipo/orders/:id`
- `DELETE /api/stocks/ipo/orders/:id`

- `GET /api/stocks/ipo/transactions`

### Frontend types baru

- `StockTransaction`
- `StockPosition` (untuk hasil dari `/api/stocks/positions`)
- `IpoOrder`
- `IpoTransaction`

Semua type frontend didefinisikan di service module lokal `aplikasi_keuangan`.

## Strategi Integrasi Domain

### 1. Pemisahan domain keuangan vs saham
- `Transaction` existing tetap untuk kas, transfer, income, expense, investasi umum
- `StockTransaction` khusus pencatatan manual riwayat broker per ticker
- `Stocks` page menjadi sumber kebenaran untuk detail buy/sell, posisi per ticker, dan realized PnL

### 2. Hubungan dengan akun existing
- akun existing tipe `RDN` dan `Sekuritas` dipakai ulang
- `accountId` pada `StockTransaction` wajib menunjuk akun broker/RDN yang relevan
- (Opsional) Tambah field di metadata `Account` jika perlu menyimpan persentase default *fee broker*.

### 3. IPO
- logika `localStorage` pada `coba4` diterjemahkan menjadi alur database murni.
- perubahan status IPO secara manual di UI akan men-*trigger* backend untuk membuat/menghapus record `IpoTransaction`:
  - `PESAN`: hanya catat order
  - `JATAH`: buat `IpoTransaction` side `BUY`
  - `TIDAK_JATAH`: tidak buat transaksi beli
  - `JUAL`: buat `IpoTransaction` side `SELL`

## Langkah Implementasi

### Fase 1 - Desain Kontrak & Database
- Finalkan schema Prisma untuk `StockTransaction`, `IpoOrder`, `IpoTransaction`.
- Buat file migration Prisma.
- Siapkan *helper* backend untuk fungsi FIFO (menghitung sisa lot & Realized PnL berdasarkan array `StockTransaction`).

### Fase 2 - Backend CRUD & Logic
- Buat route Express untuk `/api/stocks` dan `/api/stocks/ipo`.
- Implementasi endpoint CRUD transaksi saham.
- Implementasi endpoint `GET /api/stocks/positions` yang memanggil *helper* FIFO.
- Implementasi endpoint CRUD IPO beserta *side-effect* pembentukan `IpoTransaction` berdasarkan status.

### Fase 3 - Frontend Saham
- Tambahkan tombol/card akses di dalam halaman `Investasi` existing untuk menuju ke modul Saham & IPO.
- Buat UI `/stocks` (tabel riwayat transaksi dan tabel posisi).
- Buat form tambah/edit transaksi manual Beli & Jual.
- Pasang filter (ticker, akun RDN).

### Fase 4 - Frontend IPO
- Buat UI `/stocks/ipo` dengan konsep *Kanban/Board* status IPO atau tabel sederhana.
- Buat form tambah/edit IPO.
- Validasi flow status IPO (Pesan -> Jatah -> Jual).

### Fase 5 - Integrasi "Target Investasi"
- Tambahkan flag/mode (contoh: `isInvestmentTarget`) pada modul **Target** yang sudah ada.
- Izinkan pengguna memilih akun `Sekuritas/RDN` spesifik saat membuat Target.
- Buat tombol aksi cepat "Sudah TF" pada target tersebut, yang akan otomatis membuat pencatatan `TRANSFER` dari Kas/Bank ke akun `Sekuritas` tujuan.

## Detail Implementasi Penting

### Kalkulasi Posisi (*On-the-fly*)
Gunakan logika FIFO murni saat endpoint `/api/stocks/positions` dipanggil:
1. Ambil semua `StockTransaction` milik *owner*.
2. Kelompokkan per `ticker`.
3. Loop dari transaksi paling lama ke baru:
   - `BUY`: tambah `netLots` dan perbarui `avgBuyPrice`.
   - `SELL`: kurangi `netLots` dan akumulasikan selisih harga jual vs `avgBuyPrice` ke `realizedProfit`.
4. Return array posisi yang `netLots > 0` atau `realizedProfit != 0`.

### Status IPO
Enum simpel di tingkat API/Frontend:
- `PESAN`, `JATAH`, `TIDAK_JATAH`, `JUAL`

## Risiko dan Mitigasi
- **Risiko**: Input manual rawan *typo* harga/lot.
  - **Mitigasi**: Tambahkan validasi frontend saat input Beli/Jual saham. Pastikan `netValue` terhitung otomatis agar bisa dicocokkan user sebelum submit.
- **Risiko**: Logika kalkulasi FIFO lambat jika data membengkak.
  - **Mitigasi**: Aman untuk skala personal finance (ratusan/ribuan baris per user). Jika sudah melambat, baru dipikirkan skema *snapshot* di masa depan.

## Test Cases dan Skenario Minimal
- Create `StockTransaction` BUY valid pada akun `RDN`.
- Hitung posisi FIFO: 2 BUY dengan harga beda, lalu 1 SELL, pastikan `avgBuyPrice` sisa lot benar dan `realizedProfit` tercatat.
- Create `IpoOrder` berstatus `JATAH` -> otomatis membuat `IpoTransaction` BUY di background.
- Update `IpoOrder` ke `JUAL` -> otomatis membuat `IpoTransaction` SELL di background.

## Acceptance Criteria
- User login ke `aplikasi_keuangan` dan melihat menu `Saham` serta `IPO`.
- User bisa memasukkan histori BUY/SELL saham secara manual dari UI.
- Halaman posisi saham bisa menampilkan jumlah lot yang sedang dipegang beserta riwayat untung-rugi (*Realized PnL*) dengan benar.
- User bisa mencatat IPO dan mengubah statusnya tanpa memakai `localStorage`.
- Data tersimpan aman di database Postgres yang sama dengan data keuangan lainnya.
