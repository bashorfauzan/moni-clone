# Plan Penguatan Aplikasi Moni

Dokumen ini mengubah masukan produk menjadi langkah kerja yang bisa langsung dieksekusi.

## Tujuan Utama

1. Menjadikan transaksi, saldo rekening, dan investasi memakai aturan yang konsisten.
2. Mengurangi error production di Vercel dan perbedaan perilaku antara local vs production.
3. Membuat angka di Home, Laporan, Investasi, dan Target mudah dijelaskan ke pengguna.

## Prinsip Dasar

1. `rekening` adalah sumber kebenaran saldo kas.
2. `owner/kepemilikan` adalah metadata transaksi, bukan pembatas saldo rekening.
3. `investasi` diperlakukan sebagai perpindahan dana ke rekening tipe `RDN` atau `Sekuritas`.
4. Tipe transaksi inti dibatasi ke:
   - `INCOME`
   - `EXPENSE`
   - `TRANSFER`
5. Data legacy seperti `TOP_UP`, `INVESTMENT_IN`, dan `INVESTMENT_OUT` hanya dinormalisasi atau disembunyikan, bukan dipakai sebagai logika inti baru.

## Fase 1 - Stabilkan Source of Truth

Status: prioritas paling tinggi

### Outcome

- Semua halaman memakai aturan transaksi yang sama.
- Tidak ada lagi perbedaan hitung saldo antara client, server, dan halaman investasi.

### Langkah Eksekusi

- Buat util pusat `classifyTransaction(...)` dan `isInvestmentTransfer(...)`.
- Pakai util yang sama di:
  - `client/src/pages/Home.tsx`
  - `client/src/pages/Reports.tsx`
  - `client/src/pages/Investment.tsx`
  - `client/src/services/transactions.ts`
  - `server/lib/accountBalances.ts`
- Pastikan hanya `INCOME`, `EXPENSE`, `TRANSFER` yang dihitung sebagai transaksi aktif.
- Tambahkan normalisasi data lama:
  - `TOP_UP -> TRANSFER`
  - `INVESTMENT_IN/OUT -> hidden legacy`

### Definisi Selesai

- Saldo rekening sama saat dicek di Home, modal transaksi, dan backend validation.
- Transfer ke rekening RDN selalu tampil sebagai `Investasi`.
- Tidak ada enum lama yang bocor ke query atau insert baru.

## Fase 2 - Bersihkan Model Investasi

Status: sesudah Fase 1

### Outcome

- Pengguna bisa memahami bedanya `modal`, `nilai saat ini`, dan `return`.
- Angka investasi tidak lagi bergantung pada saldo legacy yang tercampur.

### Langkah Eksekusi

- Tetapkan rumus baku:
  - `modal = total transfer masuk ke rekening investasi`
  - `nilai saat ini = modal + pertumbuhan/hasil investasi`
  - `return = nilai saat ini - modal`
- Pisahkan label transaksi investasi:
  - `Transfer ke Investasi`
  - `Hasil Investasi`
  - `Pencairan Investasi`
- Tambahkan helper penjelasan angka di halaman investasi.
- Pastikan rekening investasi tidak memakai saldo awal yang bisa mengacaukan return.

### Definisi Selesai

- Kartu investasi bisa dijelaskan dari transaksi yang ada.
- Pengguna tahu asal angka return tanpa harus membuka database.

## Fase 3 - Rapikan Jalur Data Production

Status: paralel setelah Fase 1 mulai stabil

### Outcome

- Endpoint production tidak lagi rawan `FUNCTION_INVOCATION_FAILED`.
- Jalur API dan Supabase tidak saling bertabrakan.

### Langkah Eksekusi

- Putuskan jalur utama CRUD:
  - opsi A: API server sebagai jalur utama
  - opsi B: direct Supabase untuk modul tertentu yang aman
- Audit endpoint yang masih memakai Prisma di Vercel:
  - `/api/targets`
  - `/api/transactions`
  - `/api/master/meta`
- Tambahkan logging error yang lebih jelas di server dan API functions.
- Buat fallback terkontrol, bukan campuran logika acak per halaman.

### Definisi Selesai

- Error production menyebut penyebab yang manusiawi.
- Tidak ada halaman penting yang gagal hanya karena runtime Prisma di Vercel.

## Fase 4 - Rekonsiliasi Notifikasi dan Transaksi

Status: setelah Fase 1

### Outcome

- Notifikasi bank/e-wallet lebih akurat dipetakan ke transaksi.
- Salah klasifikasi lebih mudah diperbaiki.

### Langkah Eksekusi

- Tambahkan tabel/flag status untuk hasil parser:
  - `detected`
  - `needs_review`
  - `approved`
  - `ignored`
- Simpan alasan parser:
  - nama bank terdeteksi
  - rekening terdeteksi
  - arah dana masuk/keluar
- Tambahkan tampilan review sederhana untuk notifikasi gagal baca.
- Tambahkan kamus alias rekening/bank:
  - `BRImo -> BRI`
  - alias e-wallet dan rekening investasi lain

### Definisi Selesai

- Pengguna bisa tahu kenapa notifikasi dibaca sebagai transaksi tertentu.
- Salah baca tidak langsung merusak saldo tanpa jejak.

## Fase 5 - Transparansi Angka di UI

Status: quick win sesudah Fase 1

### Outcome

- Pengguna tidak bingung kenapa suatu angka muncul.

### Langkah Eksekusi

- Tambahkan teks bantu pada kartu investasi:
  - `Modal dihitung dari X transaksi`
  - `Return berasal dari Y pemasukan investasi`
- Tambahkan rincian sumber saldo rekening pada modal transaksi.
- Tampilkan badge yang konsisten:
  - `Pemasukan`
  - `Pengeluaran`
  - `Transfer`
  - `Investasi`
- Hindari label teknis lama yang membingungkan.

### Definisi Selesai

- Pengguna bisa menelusuri angka penting tanpa menebak-nebak.

## Fase 6 - Fitur Bernilai Tinggi

Status: setelah fondasi stabil

### Prioritas

1. Riwayat saldo rekening per hari.
2. Rekonsiliasi transaksi manual vs notifikasi.
3. Snapshot bulanan:
   - pemasukan
   - pengeluaran
   - transfer ke investasi
   - sisa kas
4. Undo untuk transaksi terakhir.
5. Kategori otomatis dari parser notifikasi.
6. Fitur "Sudah TF" di Target: tombol untuk menandai setoran bulanan yang mengurangi sisa target (aktif setiap bulan).

## Backlog Eksekusi Mingguan

### Minggu 1

- Satukan klasifikasi transaksi.
- Audit semua pemakaian enum transaksi.
- Pastikan saldo rekening dihitung dari satu helper yang sama.
- Rapikan tampilan Home dan Investment berdasarkan helper baru.

### Minggu 2

- Stabilkan endpoint production.
- Rapikan targets dan transactions agar tidak bergantung pada jalur yang mudah gagal.
- Implementasi fitur "Sudah TF" di menu Target (pengurang sisa target bulanan).
- Tambahkan logging error dan pesan alert yang lebih jelas.

### Minggu 3

- Tambahkan layar review notifikasi.
- Tambahkan penjelasan angka investasi dan saldo.
- Mulai riwayat saldo harian.

## Tugas Teknis Pertama yang Bisa Langsung Dikerjakan

1. Buat file helper baru misalnya `client/src/lib/transactionRules.ts` dan `server/lib/transactionRules.ts`.
2. Pindahkan semua logika cek tipe transaksi ke helper itu.
3. Ganti pemakaian logika lokal yang tersebar di Home, Reports, Investment, dan services.
4. Tambahkan test sederhana untuk:
   - transfer bank ke RDN dianggap investasi
   - `TOP_UP` dinormalisasi jadi `TRANSFER`
   - `INVESTMENT_IN/OUT` tidak ikut saldo aktif
5. Audit deploy Vercel setelah helper pusat dipakai semua.

## Catatan Implementasi

- Jangan tambahkan enum transaksi baru sebelum aturan lama benar-benar stabil.
- Saat ada data legacy, utamakan normalisasi dan penyembunyian, bukan menambah percabangan baru di banyak tempat.
- Setiap angka penting di UI harus bisa dijelaskan dari transaksi sumbernya.
