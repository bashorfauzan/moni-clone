# Moni Android Helper

Android helper ini menangkap notifikasi WhatsApp atau WhatsApp Business dari perangkat Android, lalu mengirimkannya ke backend Moni.

## Yang sudah ada

- `NotificationListenerService`
- form untuk menyimpan URL endpoint backend
- form untuk menyimpan filter keyword
- status pengiriman terakhir di layar setup
- kirim payload ke `POST /api/webhook/notification`
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
4. Tunggu Gradle sync selesai.

## Cara jalankan

1. Sambungkan HP Android atau pakai emulator.
2. Jalankan app.
3. Isi endpoint backend.
4. Atur filter keyword.

Contoh:
- emulator Android: `http://10.0.2.2:5001/api/webhook/notification`
- HP fisik: pakai IP laptop di jaringan lokal, misalnya `http://192.168.1.10:5001/api/webhook/notification`

Contoh filter:
- `bca,dana,flip,gaji,masuk,keluar`
- `mandiri,bri,bni,transfer`

5. Tap `Simpan Endpoint`.
6. Tap `Buka Pengaturan Notification Access`.
7. Aktifkan `Moni Notifier`.
8. Pastikan notifikasi WhatsApp muncul di perangkat.
9. Cek `Pengiriman terakhir` di layar app.

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

## Jalur APK Untuk Buka App Rekening

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

Target implementasi APK:

1. Bungkus web app utama ke WebView Android.
2. Expose bridge `SpendNativeBridge.openAccountApp`.
3. Prioritas buka app:
   - pakai `deepLink` jika tersedia
   - fallback ke launcher app via `packageName`
   - fallback terakhir ke `storeUrl`
4. Jika app tidak terpasang dan tidak ada `storeUrl`, tampilkan pesan error native.

Dengan kontrak ini, UI web tidak perlu dirombak lagi saat nanti dipindah ke APK.
