# SPEND Android Helper

Android helper ini menangkap notifikasi WhatsApp atau WhatsApp Business dari perangkat Android, lalu mengirimkannya ke backend SPEND. Sekarang helper ini juga bisa membuka web app utama SPEND dalam wrapper Android WebView.

## Yang sudah ada

- `NotificationListenerService`
- form untuk menyimpan URL endpoint backend
- form untuk menyimpan URL web app utama
- form untuk menyimpan filter keyword
- status pengiriman terakhir di layar setup
- kirim payload ke `POST /api/webhook/notification`
- wrapper WebView untuk membuka aplikasi utama
- bridge native `window.SpendNativeBridge.openAccountApp(...)`
- dukungan untuk:
  - `com.whatsapp`
  - `com.whatsapp.w4b`

## Struktur penting

- [MainActivity.kt](/Users/bashorfauzan/Documents/coba2/android-helper/app/src/main/java/com/moni/notifier/MainActivity.kt)
- [WhatsAppNotificationListenerService.kt](/Users/bashorfauzan/Documents/coba2/android-helper/app/src/main/java/com/moni/notifier/service/WhatsAppNotificationListenerService.kt)
- [WebhookSender.kt](/Users/bashorfauzan/Documents/coba2/android-helper/app/src/main/java/com/moni/notifier/service/WebhookSender.kt)

## Cara buka

1. Buka Android Studio.
2. Pilih `Open`.
3. Arahkan ke folder [android-helper](/Users/bashorfauzan/Documents/coba2/android-helper).
4. Tunggu Gradle sync selesai. Jika Android Studio menawarkan generate Gradle wrapper, izinkan agar build CLI berikutnya bisa memakai `./gradlew`.

## Cara jalankan

1. Sambungkan HP Android atau pakai emulator.
2. Jalankan app.
3. Isi endpoint backend.
4. Isi URL web app utama.
5. Atur filter keyword.

Contoh:
- emulator Android: `http://10.0.2.2:5001/api/webhook/notification`
- HP fisik: pakai IP laptop di jaringan lokal, misalnya `http://192.168.1.10:5001/api/webhook/notification`

Contoh URL web app:
- emulator Android: `http://10.0.2.2:4173`
- HP fisik: `http://192.168.1.10:4173`
- domain online: `https://domain-spend-anda.com`

Contoh filter:
- `bca,dana,flip,gaji,masuk,keluar`
- `mandiri,bri,bni,transfer`

6. Tap `Simpan Pengaturan`.
7. Tap `Buka Pengaturan Notification Access`.
8. Aktifkan `SPEND Notifier`.
9. Tap `Buka SPEND App`.
10. Dari web app utama, tombol `Buka` pada rekening akan memakai bridge Android:
   - coba `deepLink`
   - fallback ke app terpasang via `packageName`
   - fallback ke `storeUrl`
11. Pastikan notifikasi WhatsApp muncul di perangkat.
12. Cek `Pengiriman terakhir` di layar helper.

## Payload yang dikirim

Contoh payload:

```json
{
  "appName": "WhatsApp",
  "title": "BCA Mobile",
  "senderName": "Notifikasi Bank",
  "text": "masuk Rp 250.000 gaji bca",
  "receivedAt": "2026-03-20T09:30:00.000Z",
  "rawPayload": {
    "packageName": "com.whatsapp",
    "notificationKey": "...",
    "postTime": 1774000000000,
    "androidTitle": "BCA Mobile"
  }
}
```

## Catatan penting

- `localhost` di HP tidak menunjuk ke laptop Anda.
- Untuk HP fisik, backend Express harus bind ke jaringan lokal agar bisa diakses.
- Beberapa notifikasi WhatsApp bisa ringkas atau terpotong tergantung versi Android dan sumber pesan.
- Filter keyword dipakai untuk mengurangi spam. Jika terlalu ketat, notifikasi valid bisa ikut terlewat.
- App ini belum melakukan retry queue, enkripsi payload, atau batching.

## Langkah lanjut yang disarankan

1. Tambahkan retry queue jika backend sedang tidak aktif.
2. Tambahkan filter pengirim tertentu bila hanya notifikasi bank yang ingin diteruskan.
3. Tambahkan daftar histori pengiriman di UI Android.

## Wrapper Android Untuk Buka App Rekening

Web client sekarang sudah menyiapkan konfigurasi rekening berikut:

- `appPackageName`
- `appDeepLink`
- `appStoreUrl`

Dan di sisi browser sudah ada bridge contract global:

```ts
window.SpendNativeBridge?.openAccountApp?.({
  id: string,
  name: string,
  packageName?: string | null,
  deepLink?: string | null,
  storeUrl?: string | null
})
```

Implementasi yang sekarang sudah ada:

1. `MainActivity` menyimpan:
   - URL backend webhook
   - URL web app utama
   - filter keyword
2. Tombol `Buka SPEND App` membuka `WebAppActivity`.
3. `WebAppActivity` memuat web app utama di `WebView`.
4. Saat halaman selesai dimuat, activity menyuntikkan bridge:
   - `window.SpendNativeBridge.openAccountApp(payload)`
5. Prioritas buka app rekening:
   - pakai `deepLink` jika tersedia
   - fallback ke launcher app via `packageName`
   - fallback terakhir ke `storeUrl`
6. Jika semua gagal, helper menampilkan pesan error native.

Catatan:
- Manifest saat ini mengaktifkan `usesCleartextTraffic="true"` agar URL lokal `http://...` tetap bisa dibuka saat development.
- Manifest juga memakai `QUERY_ALL_PACKAGES` agar launcher rekening berbasis package name bisa dicoba. Jika nanti APK akan dipublikasikan ke Play Store, izin ini perlu dievaluasi ulang karena termasuk sensitif.
