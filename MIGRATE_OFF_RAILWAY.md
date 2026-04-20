# Migrasi penuh tanpa Railway

Project ini sekarang sudah memakai Supabase untuk:

- database PostgreSQL
- auth
- realtime

Kalau ingin lepas total dari Railway, host aplikasi bisa dipindah ke Render dengan satu Blueprint.

Referensi resmi:

- Render Blueprints: https://render.com/docs/infrastructure-as-code
- Render Blueprint spec: https://render.com/docs/blueprint-spec
- Render Node/Express: https://render.com/docs/deploy-node-express-app
- Render Static Sites: https://render.com/docs/static-sites

## Arsitektur target

- Supabase: database, auth, realtime
- Render `nova-api`: backend Express dari folder `server/`
- Render `nova-web`: frontend Vite dari folder `client/`
- Android helper: diarahkan ke domain Render baru

## File yang sudah disiapkan

- [render.yaml](/Users/bashorfauzan/Documents/coba2/render.yaml)
- [SUPABASE_SETUP.md](/Users/bashorfauzan/Documents/coba2/SUPABASE_SETUP.md)

## Cara deploy di Render

1. Push repo ini ke GitHub.
2. Di Render Dashboard, pilih `New` -> `Blueprint`.
3. Connect repo ini.
4. Render akan membaca [render.yaml](/Users/bashorfauzan/Documents/coba2/render.yaml) dan membuat:
   - `nova-api`
   - `nova-web`
5. Isi environment variable yang bertanda `sync: false`.

## Environment backend di Render

Isi service `nova-api` dengan:

```env
DATABASE_URL=postgresql://postgres.PROJECT_REF:PASSWORD@aws-REGION.pooler.supabase.com:6543/postgres?sslmode=require&pgbouncer=true
DIRECT_URL=postgresql://postgres.PROJECT_REF:PASSWORD@aws-REGION.pooler.supabase.com:6543/postgres?sslmode=require&pgbouncer=true
SUPABASE_URL=https://PROJECT_REF.supabase.co
SUPABASE_SERVICE_ROLE_KEY=YOUR_SUPABASE_SERVICE_ROLE_KEY
TELEGRAM_BOT_TOKEN=OPTIONAL
TELEGRAM_ALLOWED_CHAT_IDS=OPTIONAL
HOST=0.0.0.0
PORT=10000
```

Catatan:

- Render web services secara default memakai port `10000`, sesuai docs mereka.
- Prisma `db push` lewat pooler bisa tidak stabil. Schema bootstrap sudah pernah dijalankan ke project Supabase aktif.

## Environment frontend di Render

Isi service `nova-web` dengan:

```env
VITE_API_BASE_URL=https://YOUR_RENDER_BACKEND_DOMAIN/api
VITE_SUPABASE_URL=https://PROJECT_REF.supabase.co
VITE_SUPABASE_ANON_KEY=YOUR_SUPABASE_ANON_KEY
VITE_SUPABASE_PUBLISHABLE_KEY=YOUR_SUPABASE_PUBLISHABLE_KEY
VITE_USE_SUPABASE_DATA=true
```

Catatan:

- Karena frontend dan backend akan berada di domain berbeda, `VITE_API_BASE_URL` harus full URL backend, bukan `/api`.

## Setelah deploy pertama

1. Buka URL `nova-api` dan pastikan `/` merespons.
2. Buka URL `nova-web`.
3. Test daftar akun baru.
4. Test login.
5. Test halaman data master dan transaksi.

## Android helper

Setelah Render memberi domain final:

1. Ganti default `webhook` dan `web app URL` di Android helper.
2. Build APK baru jika ingin default URL baru tertanam permanen.
3. Kalau tidak build ulang, user masih bisa mengisi URL Render manual di halaman setup Android helper.

## Kapan Railway boleh dimatikan

Matikan Railway hanya setelah:

1. `nova-api` Render sudah hidup
2. `nova-web` Render sudah hidup
3. login/register sukses
4. Android helper sudah diarahkan ke domain baru bila diperlukan
5. custom domain, bila ada, sudah dipindahkan
