# Setup Supabase

Panduan ini menyiapkan proyek sekarang agar memakai Supabase sebagai PostgreSQL utama, sambil tetap mempertahankan Prisma dan backend Express yang sudah ada.

## 1. Buat Project Supabase

1. Buka `https://supabase.com/dashboard`.
2. Buat project baru.
3. Catat:
   - `Project URL`
   - `Database password`
   - `Anon key`
   - `Service role key`

## 2. Ambil Connection String PostgreSQL

1. Di dashboard Supabase buka `Project Settings > Database`.
2. Cari `Connection string`.
3. Pilih format `URI`.
4. Gunakan connection string pooler atau direct connection.

Untuk development awal, pakai direct connection lebih sederhana.

Contoh:

```env
DATABASE_URL="postgresql://postgres.your-ref:YOUR_PASSWORD@aws-0-ap-southeast-1.pooler.supabase.com:6543/postgres?pgbouncer=true&connection_limit=1"
DIRECT_URL="postgresql://postgres.your-ref:YOUR_PASSWORD@db.your-ref.supabase.co:5432/postgres"
```

Jika ingin lebih rapih, Anda bisa menambahkan `directUrl` nanti di Prisma. Untuk sekarang proyek ini cukup memakai `DATABASE_URL`.

## 3. Buat File Env Server

Di folder [server](/Users/bashorfauzan/Documents/coba2/server), buat file `.env`:

```env
DATABASE_URL="postgresql://postgres.your-ref:YOUR_PASSWORD@aws-0-ap-southeast-1.pooler.supabase.com:6543/postgres?pgbouncer=true&connection_limit=1"
PORT=5001
```

Jika frontend ingin langsung memakai Supabase Auth/Realtime nanti, tambahkan juga di `client/.env`:

```env
VITE_API_BASE_URL=http://localhost:5001/api
VITE_SUPABASE_URL=https://your-ref.supabase.co
VITE_SUPABASE_ANON_KEY=your_anon_key
```

## 4. Generate Prisma Client

Jalankan dari folder [server](/Users/bashorfauzan/Documents/coba2/server):

```bash
npx prisma generate
```

## 5. Push Schema ke Supabase

Karena proyek ini masih tahap awal, paling cepat pakai:

```bash
npx prisma db push
```

Kalau Anda ingin migrasi formal:

```bash
npx prisma migrate dev --name init_supabase_notification_inbox
```

Untuk Supabase, `db push` cukup praktis selama Anda masih iterasi cepat.

## 6. Seed Data Minimum

Aplikasi auto-ingest butuh minimal:
- 1 owner
- 1 activity
- 1 account

Jalankan:

```bash
npx prisma db seed
```

Kalau seed belum cukup, tambah master lewat menu aplikasi:
- Owner utama
- Aktivitas `Lainnya`
- Rekening utama seperti `BCA`, `DANA`, atau `SeaBank`

## 7. Jalankan Backend dan Frontend

Backend:

```bash
npm run dev
```

Frontend:

```bash
npm run dev
```

Server backend berjalan di `http://localhost:5001`.

Untuk akses dari HP fisik di jaringan Wi‑Fi yang sama, backend sekarang juga bind ke jaringan lokal. Saat `npm run dev` dijalankan, terminal server akan menampilkan alamat seperti:

```txt
Akses jaringan lokal: http://192.168.1.10:5001
```

Gunakan alamat itu untuk Android helper di smartphone.

## 8. Endpoint Baru untuk Notifikasi WA

Setelah setup, backend siap menerima notifikasi ke:

```txt
POST /api/webhook/notification
GET  /api/webhook/notifications
```

Contoh payload dari Android helper app:

```json
{
  "appName": "WhatsApp",
  "title": "BCA Mobile",
  "senderName": "Notifikasi Bank",
  "text": "masuk Rp 250.000 gaji bca",
  "receivedAt": "2026-03-20T09:30:00.000Z",
  "rawPayload": {
    "packageName": "com.whatsapp",
    "androidTitle": "BCA Mobile"
  }
}
```

## 9. Cara Uji Manual

Kirim request:

```bash
curl -X POST http://localhost:5001/api/webhook/notification \
  -H "Content-Type: application/json" \
  -d '{
    "appName": "WhatsApp",
    "title": "BCA Mobile",
    "senderName": "Notifikasi Bank",
    "text": "masuk Rp 250.000 gaji bca"
  }'
```

Lalu cek inbox notifikasi:

```bash
curl "http://localhost:5001/api/webhook/notifications?limit=10"
```

## 10. Rekomendasi Struktur Android Helper App

App Android kecil nantinya cukup melakukan:
- baca notifikasi lewat `NotificationListenerService`
- filter `packageName == com.whatsapp`
- kirim payload ke endpoint `/api/webhook/notification`

Jangan kirim langsung ke Supabase dari app Android pada tahap awal. Lebih aman kirim ke backend ini dulu agar parsing dan rule bisnis tetap terpusat.

## 11. Langkah Lanjut yang Disarankan

Setelah setup selesai, urutan terbaik berikutnya:

1. Buat Android listener app.
2. Tambahkan UI inbox notifikasi pending di halaman Home.
3. Tambahkan rule parser per rekening seperti `bca`, `dana`, `flip`.
4. Tambahkan fallback approval manual jika confidence parser rendah.

## 12. Android Helper App

Skeleton Android helper app sekarang sudah tersedia di folder [android-helper](/Users/bashorfauzan/Documents/coba2/android-helper).

Tujuannya:
- membaca notifikasi WhatsApp dari Android
- mengirim payload ke backend SPEND

Lihat panduan detail di [android-helper/README.md](/Users/bashorfauzan/Documents/coba2/android-helper/README.md).

Endpoint yang dipakai Android helper:

```txt
http://10.0.2.2:5001/api/webhook/notification
```

`10.0.2.2` hanya untuk emulator Android. Jika memakai HP fisik, ganti dengan IP lokal laptop Anda.

Android helper sekarang juga mendukung:
- filter keyword agar tidak semua notifikasi WhatsApp diteruskan
- status pengiriman terakhir di layar setup
