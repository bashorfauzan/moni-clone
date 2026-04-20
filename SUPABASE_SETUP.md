# Setup Supabase untuk project ini

Dokumen ini fokus pada migrasi database dari Railway Postgres ke Supabase, tanpa mengubah arsitektur app yang sudah ada.

## Ringkasan arsitektur

- `server/` tetap memakai Prisma ke PostgreSQL.
- `client/` sudah memakai Supabase untuk:
  - Auth (`signUp`, `signIn`, `signOut`)
  - Realtime (`postgres_changes`)
  - Direct table access untuk beberapa data (`Owner`, `Account`, `Activity`, `Transaction`, `Target`)
- Backend hosting boleh tetap di Railway atau pindah ke platform lain. Yang diganti di sini adalah database-nya ke Supabase.

## 1. Buat project Supabase

1. Buat project baru di Supabase.
2. Simpan `Project URL`.
3. Simpan `anon public key`.
4. Buka `Project Settings -> Database` lalu ambil:
   - `Connection string -> URI` untuk pooler
   - direct connection string untuk koneksi langsung

## 2. Isi environment backend

Copy [server/.env.example](/Users/bashorfauzan/Documents/coba2/server/.env.example) menjadi `server/.env`, lalu isi:

```env
DATABASE_URL="postgresql://postgres.PROJECT_REF:PASSWORD@aws-0-ap-southeast-1.pooler.supabase.com:6543/postgres?pgbouncer=true"
DIRECT_URL="postgresql://postgres.PROJECT_REF:PASSWORD@db.PROJECT_REF.supabase.co:5432/postgres"
PORT="5001"
HOST="0.0.0.0"
SUPABASE_URL="https://PROJECT_REF.supabase.co"
SUPABASE_SERVICE_ROLE_KEY="YOUR_SUPABASE_SERVICE_ROLE_KEY"
```

Catatan:

- `DATABASE_URL` dipakai runtime Prisma client.
- `DIRECT_URL` dipakai Prisma untuk operasi schema/migration yang tidak aman lewat pgbouncer/pooler.
- File [server/lib/prisma.ts](/Users/bashorfauzan/Documents/coba2/server/lib/prisma.ts) sudah otomatis menambahkan `pgbouncer=true` kalau hostname Supabase pooler terdeteksi.
- `SUPABASE_SERVICE_ROLE_KEY` hanya untuk backend. Jangan dipasang di frontend.

## 3. Isi environment frontend

Copy [client/.env.example](/Users/bashorfauzan/Documents/coba2/client/.env.example) menjadi `client/.env`, lalu isi:

```env
VITE_SUPABASE_URL="https://PROJECT_REF.supabase.co"
VITE_SUPABASE_ANON_KEY="YOUR_SUPABASE_ANON_KEY"
VITE_SUPABASE_PUBLISHABLE_KEY="YOUR_SUPABASE_PUBLISHABLE_KEY"
VITE_USE_SUPABASE_DATA="true"
VITE_API_BASE_URL="/api"
```

Kalau sementara ingin frontend tetap lewat backend API saja, set:

```env
VITE_USE_SUPABASE_DATA="false"
```

## 4. Buat schema di Supabase

Dari folder `server/`, jalankan:

```bash
npm install
npm run prisma:generate
npm run db:push
```

Kalau ingin seed data awal:

```bash
npm run prisma:seed
```

## 5. Aktifkan RLS policy

Client melakukan query langsung dari browser, jadi tabel perlu policy untuk role `authenticated`.

Jalankan isi file berikut di Supabase SQL Editor:

- [server/prisma/manual-migrations/20260324_enable_rls_authenticated_only.sql](/Users/bashorfauzan/Documents/coba2/server/prisma/manual-migrations/20260324_enable_rls_authenticated_only.sql)

Catatan penting:

- Policy saat ini mengizinkan semua user yang login mengakses semua data.
- Ini aman sebagai baseline untuk migrasi, tapi belum membatasi data per user.
- Kalau nanti mau multi-user sungguhan, schema perlu relasi ke `auth.users`.

## 6. Aktifkan Supabase Realtime

Frontend memakai `postgres_changes`, jadi tabel harus masuk publication `supabase_realtime`.

Jalankan isi file berikut di Supabase SQL Editor:

- [server/prisma/manual-migrations/20260420_enable_supabase_realtime.sql](/Users/bashorfauzan/Documents/coba2/server/prisma/manual-migrations/20260420_enable_supabase_realtime.sql)

## 7. Pindahkan data dari Railway ke Supabase

Cara paling aman:

1. Export database Railway ke SQL dump atau CSV.
2. Import ke Supabase.
3. Jalankan query validasi jumlah row per tabel.

Tabel inti project ini:

- `Owner`
- `Account`
- `Activity`
- `Transaction`
- `NotificationInbox`
- `Budget`
- `Target`

Kalau mau migrasi manual via SQL dump, pastikan schema di Supabase sudah dibuat dulu oleh Prisma supaya tipe dan foreign key sesuai.

## 8. Set environment di hosting backend

Kalau backend masih di Railway, cukup ganti env service backend:

```env
DATABASE_URL=...
DIRECT_URL=...
```

Tidak perlu lagi attach Railway Postgres kalau semua sudah mengarah ke Supabase.

Kalau backend masih di Railway, set minimal env berikut di service backend:

```env
DATABASE_URL=postgresql://postgres.PROJECT_REF:PASSWORD@aws-REGION.pooler.supabase.com:6543/postgres?sslmode=require&pgbouncer=true
DIRECT_URL=postgresql://postgres.PROJECT_REF:PASSWORD@aws-REGION.pooler.supabase.com:6543/postgres?sslmode=require&pgbouncer=true
SUPABASE_URL=https://PROJECT_REF.supabase.co
SUPABASE_SERVICE_ROLE_KEY=YOUR_SUPABASE_SERVICE_ROLE_KEY
PORT=5001
HOST=0.0.0.0
```

Untuk frontend production, set minimal:

```env
VITE_API_BASE_URL=/api
VITE_SUPABASE_URL=https://PROJECT_REF.supabase.co
VITE_SUPABASE_ANON_KEY=YOUR_SUPABASE_ANON_KEY
VITE_SUPABASE_PUBLISHABLE_KEY=YOUR_SUPABASE_PUBLISHABLE_KEY
VITE_USE_SUPABASE_DATA=true
```

## 9. Verifikasi setelah setup

Checklist minimum:

1. Backend bisa start tanpa error Prisma.
2. Login/register di frontend jalan.
3. Halaman data master bisa load.
4. Tambah/edit/hapus transaksi berjalan.
5. Realtime refresh jalan setelah ada perubahan data.

## 10. Fallback yang sudah tersedia di code

- Kalau env Supabase frontend kosong, client tidak crash dan akan fallback ke backend API.
- Kalau query langsung ke Supabase gagal, beberapa service frontend akan fallback ke backend API.

File terkait:

- [client/src/lib/supabase.ts](/Users/bashorfauzan/Documents/coba2/client/src/lib/supabase.ts)
- [client/src/services/api.ts](/Users/bashorfauzan/Documents/coba2/client/src/services/api.ts)
- [server/prisma/schema.prisma](/Users/bashorfauzan/Documents/coba2/server/prisma/schema.prisma)

## Hal yang belum otomatis

- Migrasi data dari Railway ke Supabase belum otomatis di repo ini.
- RLS per user belum ada.
- SQL manual migration perlu dijalankan dari dashboard Supabase atau tooling SQL terpisah.
