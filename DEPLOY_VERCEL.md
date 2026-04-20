# Deploy tanpa Railway memakai Vercel + Supabase

Project ini bisa dijalankan tanpa Railway dengan kombinasi:

- Supabase untuk database, auth, realtime
- Vercel untuk frontend statis Vite
- Vercel Function untuk backend Express pada path `/api`

Referensi resmi:

- Vite on Vercel: https://vercel.com/docs/frameworks/frontend/vite
- Static `vercel.json`: https://vercel.com/docs/project-configuration/vercel-json
- Express on Vercel: https://vercel.com/guides/using-express-with-vercel
- Rewrites on Vercel: https://vercel.com/docs/rewrites
- Node.js runtime: https://vercel.com/docs/functions/runtimes/node-js

## File yang sudah disiapkan

- [vercel.json](/Users/bashorfauzan/Documents/coba2/vercel.json)
- [api/index.ts](/Users/bashorfauzan/Documents/coba2/api/index.ts)
- [server/app.ts](/Users/bashorfauzan/Documents/coba2/server/app.ts)

## Cara deploy

1. Push repo ke GitHub.
2. Import repo ini di Vercel.
3. Framework preset bisa dibiarkan autodetect atau pilih `Vite`.
4. Root directory tetap repo root.
5. Vercel akan build `client/dist` dan route `/api/*` ke Express function.

## Environment Variables di Vercel

Isi project env berikut:

```env
DATABASE_URL=postgresql://postgres.PROJECT_REF:PASSWORD@aws-REGION.pooler.supabase.com:6543/postgres?sslmode=require&pgbouncer=true
DIRECT_URL=postgresql://postgres.PROJECT_REF:PASSWORD@aws-REGION.pooler.supabase.com:6543/postgres?sslmode=require&pgbouncer=true
SUPABASE_URL=https://PROJECT_REF.supabase.co
SUPABASE_SERVICE_ROLE_KEY=YOUR_SUPABASE_SERVICE_ROLE_KEY
VITE_API_BASE_URL=/api
VITE_SUPABASE_URL=https://PROJECT_REF.supabase.co
VITE_SUPABASE_ANON_KEY=YOUR_SUPABASE_ANON_KEY
VITE_SUPABASE_PUBLISHABLE_KEY=YOUR_SUPABASE_PUBLISHABLE_KEY
VITE_USE_SUPABASE_DATA=true
```

Catatan:

- Vercel Functions memakai environment yang sama untuk build dan runtime.
- Karena frontend dan API berada di project/domain yang sama, `VITE_API_BASE_URL` tetap `/api`.

## Verifikasi setelah deploy

1. Buka `/api/health`
2. Test daftar akun
3. Test login
4. Test halaman master data dan transaksi

## Android helper

Setelah Vercel memberi domain final:

1. isi URL backend menjadi `https://YOUR-VERCEL-DOMAIN/api/webhook/notification`
2. isi URL web app menjadi `https://YOUR-VERCEL-DOMAIN`
3. build APK baru hanya jika kamu ingin default URL baru tertanam permanen
