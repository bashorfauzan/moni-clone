# Workflow Sistem Notifikasi Transaksi Saham

Dokumen ini menjelaskan alur kerja (workflow) untuk menangkap notifikasi transaksi saham (Jual/Beli) dari aplikasi sekuritas/broker dan mencatatnya ke dalam sistem portofolio Anda secara otomatis.

## Pemahaman Konsep Dasarnya
Alur sistem ini adalah: **Notifikasi Muncul -> Ditangkap -> Diekstrak (Regex) -> Dikirim ke Server (API) -> Dihitung (Fee/Pajak) -> Disimpan ke Database**.

---

## Tahap 1: Sumber Notifikasi (Source)
Sistem perlu tahu aplikasi mana yang memunculkan notifikasi. 
Contoh aplikasi sekuritas: Ajaib, Stockbit, IPOT, Mandiri Sekuritas, dll.
Notifikasi biasanya berbunyi seperti: 
- `MATCH: BUY 100 Lot BBCA @ 9,000`
- `DONE: SELL 50 Lot BMRI @ 6,500`

## Tahap 2: Menangkap Notifikasi (Notification Listener / Interceptor)
Untuk menangkap notifikasi dari handphone (khususnya Android), Anda bisa menggunakan dua cara:
1. **Pendekatan No-Code/Low-Code (Rekomendasi Tercepat):**
   Gunakan aplikasi automasi dari Google Play Store seperti **MacroDroid** atau **Tasker**.
   - **Trigger:** Kapan saja ada notifikasi dari aplikasi sekuritas (contoh: Ajaib).
   - **Action:** Kirim "HTTP Request" (Webhook) ke server / aplikasi buatan Anda, dengan membawa variabel *Title* dan *Text* dari notifikasi tersebut.
2. **Pendekatan Code (Buat Aplikasi Catcher Android):**
   Buat aplikasi simpel menggunakan React Native / Flutter / Kotlin yang mengimplementasikan fitur `NotificationListenerService`.

## Tahap 3: Parsing Data (Ekstraksi Informasi)
Setelah server/backend aplikasi Anda menerima data teks notifikasi dari Tahap 2, tahap selanjutnya adalah mengekstrak teks riwayat (string) menjadi data yang terstruktur. Anda akan membutuhkan **Regex (Regular Expressions)**.

**Data yang perlu diekstrak:**
1. **Tipe Transaksi:** Jual (`Sell`/`Done`) atau Beli (`Buy`/`Match`)
2. **Kode Saham (Ticker):** 4 huruf kapital (misal: `BBCA`, `GOTO`)
3. **Volume:** Jumlah Lot/Lembar Saham (Ingat: 1 Lot = 100 lembar)
4. **Harga (Price):** Harga per lembar saham
5. **Status:** Pastikan hanya mencatat notifikasi dengan status "Match" atau "Done" agar tidak mencatat order yang masih "Open/Pending" atau "Rejected/Withdrawn".

*Contoh logika pseudo-code backend:*
```javascript
const text = "MATCH: BUY 100 Lot BBCA @ 9,000";
const modeTransaksi = text.includes("BUY") ? "BELI" : "JUAL";
const ticker = text.match(/[A-Z]{4}/)[0]; // Menangkap BBCA
const volumeLot = parseInt(text.match(/(\d+)\s+Lot/i)[1]); // Menangkap 100
const harga = parseInt(text.match(/@\s+([\d,]+)/)[1].replace(/,/g, '')); // Menangkap 9000
```

## Tahap 4: Endpoint API (Backend Receiver)
Buat satu endpoint pada sistem Anda yang akan menerima hasil tangkapan notifikasi.
- **URL:** `POST /api/stock-transaction/webhook`
- **Body JSON yang diterima:**
  ```json
  {
     "app": "Ajaib",
     "title": "Trade Confirmation",
     "body": "MATCH: BUY 100 Lot BBCA @ 9,000",
     "timestamp": "2024-05-10T09:30:00Z"
  }
  ```
Backend ini lalu menjalankan fungsi *Parsing* (Tahap 3).

## Tahap 5: Perhitungan Fee Broker dan Pajak
Setelah mendapatkan Harga dan Volume, sistem Anda JANGAN LANGSUNG MENULIS HARGANYA. Transaksi saham memiliki komponen biaya:
- **Total Pembelian Kotor:** (Volume Lot * 100) * Harga
- **Fee Beli (Buy Fee):** Biasanya ~0.15% dari total kotor (gabungan broker fee, levy BEI/KSEI, PPN).
- **Fee Jual (Sell Fee):** Biasanya ~0.25% dari total kotor (sama dengan beli, tapi ada tambahan PPh final 0.1%).

*Jika Anda mencatat riwayat Beli*: Modal Anda adalah Pembelian Kotor + Fee Beli.
*Jika Anda mencatat riwayat Jual*: Uang bersih yang didapat adalah Penjualan Kotor - Fee Jual.

## Tahap 6: Eksekusi Penyimpanan ke Database (Database Transaction)
Simpan data ke dalam database dengan skema atau tabel `StockTransactions`:
- `id` (UUID/PK)
- `tipe_transaksi` (ENUM: 'BUY', 'SELL')
- `kode_saham` (String: 'BBCA')
- `jumlah_lot` (Integer)
- `harga_per_lembar` (Decimal)
- `broker_fee` (Decimal)
- `total_nilai_bersih` (Decimal) - (Total yang keluar/masuk tabungan)
- `waktu_transaksi` (Timestamp)

## Tahap Tambahan (Opsional buat Pengembangan)
- **Abaikan Data Ganda (Idempotency):** Kadang sekuritas mengirim notifikasi 2x untuk satu kejadian. Buat pengecekan (misal cek apakah hari ini dan di jam ini sudah ada transaksi saham dan lot yang sama) untuk menghindari duplikasi saldo.
- **Average Price:** Saat membeli saham yang sudah ada, update harga rata-rata (Average Price) dari portofolio (menggunakan Weighted Average).
- **Notifikasi Balik (Feedback):** Server membalas webhook. Anda bisa memanfaatkan Bot Telegram/Pushover untuk memberitahu Anda ketika pencatatan *sukses*: "✅ Sukses mencatat: Beli 10 Lot BBCA".

---

## Panduan Setup & Uji Coba (Proof of Concept)
Agar Anda bisa langsung mencoba alur ini tanpa harus selesai *coding* backend terlebih dahulu, cobalah panduan berikut:

### Langkah 1: Setup Server Penerima Sementara (Webhook Target)
Untuk mengecek apakah HP Anda berhasil mengirim notifikasi keluar, gunakan layanan Webhook gratis:
1. Buka browser di komputer/laptop Anda: [https://webhook.site/](https://webhook.site/)
2. Anda akan mendapatkan **Your unique URL** (contoh: `https://webhook.site/abcdef-1234-5678`). 
3. Biarkan tab browser ini tetap terbuka. Layar ini akan langsung muncul data ketika HP Anda berhasil mengirim notifikasinya.

### Langkah 2: Menangkap Notifikasi di HP Android
Kita akan menggunakan aplikasi automasi ringan untuk membaca isi notifikasi yang masuk.
1. Install aplikasi **MacroDroid** secara gratis dari Google Play Store.
2. Buka aplikasi, lalu ikuti izin / akses yang diminta, terutama **Notification Access** (Akses Notifikasi).
3. Buat *Macro* baru dengan menekan tombol **Add Macro**:

   **A. Trigger (Pemicu Kapan Jalan):**
   - Tekan tombol **(+)** pada panel Triggers. 
   - Pilih *Device Events* -> *Notification* -> *Notification Received*.
   - Pilih *Select Application(s)* -> Centang aplikasi sekuritas Anda (misalnya Ajaib, Stockbit, IPOT) atau Telegram (jika info lewat bot).
   - Pada `Text Content`, pilih *Any* / *Matches*.
   
   **B. Action (Tindakan yang Dilakukan):**
   - Tekan tombol **(+)** pada panel Actions.
   - Pilih *Applications* -> *HTTP Request*.
   - Atur begini:
     - **Request Method:** `POST`
     - **URL:** Masukkan *"Your unique URL"* dari akun Webhook.site tadi.
     - **Content Type:** `application/json`
     - **Body Parameters (JSON):** Salin mentah-mentah blok kode di bawah ini:
       ```json
       {
          "app": "[app_name]",
          "title": "[not_title]",
          "body": "[not_text]",
          "timestamp": "[system_time]"
       }
       ```
       *(Catatan: Jangan ubah yang di dalam kurung siku `[ ]`, karena MacroDroid akan otomatis menggantinya menjadi teks notifikasi asli)*.

4. Beri nama di atas layar (Contoh: "Saham Webhook") dan Simpan dengan klik tanda centang pojok kanan bawah.

### Langkah 3: Tes / Simulasi!
1. Jika saat ini jam bursa sedang tutup atau tidak ada notifikasi, Anda harus mensimulasikannya.
2. Minta nomer HP lain / akun Telegram lain mengirimkan teks simulasi notifikasi (ke HP Anda): `MATCH: BUY 100 Lot BBCA @ 9,000`. 
   **(PERHATIAN: Pemicu di Langkah 2-A harus dicentang juga ke aplikasi WhatsApp/Telegram agar MacroDroid membaca pesan buatan ini)**
3. Setelah notifikasi muncul di atap layar HP Anda...
4. Segera lihat tab komputer web **Webhook.site** Anda.
5. Anda akan langsung melihat *"POST /"* masuk memuat isi JSON yang sama persis berisi tulisan `MATCH: BUY...` tersebut!

Bila sudah berhasil sampai tahap ini, Anda hanya tinggal mengganti *"Your unique URL"* Webhook.site dengan URL backend / aplikasi resmi yang nantinya akan Anda buat. Selamat mencoba!
