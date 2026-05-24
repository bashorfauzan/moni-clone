# Panduan: Kategori Transaksi & Mengapa Ada "Dobel"

Dokumen ini menjelaskan mengapa di beberapa layar (seperti filter Laporan) muncul kategori yang terlihat mirip seperti **Transfer** dan **Transfer-Out**, atau **Investasi** dan **Investasi-Out**.

---

## Ringkasan Singkat

| Yang Terlihat di Layar | Sumber | Artinya |
|---|---|---|
| **Transfer** | Tipe transaksi modern (`type = TRANSFER`) | Transfer umum antar rekening |
| **Transfer-Out** | Nama aktivitas lama (field `activity.name`) | Transfer keluar — label lama dari data historis |
| **Investasi** | Nama aktivitas lama | Setoran ke rekening investasi — label lama |
| **Investasi-Out** | Nama aktivitas lama | Pencairan dari rekening investasi — label lama |

---

## Penjelasan Detail

### Sistem Lama (Sebelumnya)

Di versi awal aplikasi, arah transfer dicatat secara eksplisit lewat nama **Aktivitas**:
- Saat top-up ke RDN/Sekuritas → aktivitas diberi nama **"Investasi"**
- Saat tarik dana dari RDN ke bank → aktivitas diberi nama **"Investasi-Out"**
- Saat transfer biasa keluar → aktivitas **"Transfer-Out"**

Semua transaksi lama yang dibuat dengan cara ini **masih tersimpan di database** dengan nama aktivitas tersebut. Karena itu mereka masih muncul di filter/kategori.

### Sistem Baru (Sekarang)

Sistem sekarang **tidak bergantung pada nama aktivitas** untuk menentukan arah transfer. Arah ditentukan otomatis dari relasi akun:

```
isInvestmentTransfer(tx)
  → tx.destinationAccount.type ∈ ['RDN', 'Sekuritas']
  → Artinya: Dana MASUK ke investasi (top-up/setoran modal)

isInvestmentLiquidation(tx)  
  → tx.sourceAccount.type ∈ ['RDN', 'Sekuritas']
  → Artinya: Dana KELUAR dari investasi (pencairan)
```

Jadi untuk transaksi baru, tidak perlu lagi memberi nama "Investasi-Out" — sistem sudah tahu arahnya dari rekening sumber dan tujuan.

---

## Apakah Ini Masalah?

**Tidak merusak data** — data historis tetap terhitung benar. Kategori lama dan baru dihitung dengan logika yang sama di semua laporan dan chart.

**Yang perlu diperhatikan:** Jika Anda melihat kategori lama ini di filter laporan atau pie chart, itu adalah **data transaksi historis** yang masih valid. Tidak perlu dihapus atau diubah.

---

## Pemetaan Tipe Transaksi Lengkap

### Tipe Utama (Field `type`)

| Tipe | Label Tampil | Keterangan |
|---|---|---|
| `INCOME` | Pemasukan | Uang masuk ke rekening bank/e-wallet |
| `EXPENSE` | Pengeluaran | Uang keluar dari rekening bank/e-wallet |
| `TRANSFER` | Transfer | Pindah antar rekening (termasuk top-up investasi) |
| `TOP_UP` | Transfer | Alias lama dari TRANSFER, diperlakukan sama |
| `INVESTMENT_IN` | *(Tersembunyi)* | Tipe lama, sekarang digantikan TRANSFER + relasi akun |
| `INVESTMENT_OUT` | *(Tersembunyi)* | Tipe lama, sekarang digantikan TRANSFER + relasi akun |

> `INVESTMENT_IN` dan `INVESTMENT_OUT` **disembunyikan** dari tampilan oleh fungsi `shouldHideLegacyInvestmentTransactionType()`. Data tetap ada di database tapi tidak ditampilkan di daftar transaksi.

### Klasifikasi Transfer (Diturunkan dari Relasi Akun)

| Fungsi | Kondisi | Label Laporan |
|---|---|---|
| `isInvestmentTransfer()` | Tujuan = RDN/Sekuritas | "Setoran Investasi" |
| `isInvestmentLiquidation()` | Sumber = RDN/Sekuritas | "Pencairan Investasi" |
| `isTopUpLikeTransfer()` | Deskripsi mengandung "top up" / tujuan = E-Wallet | "Top Up" |
| `isInvestmentIncome()` | Tipe = INCOME + Tujuan = RDN/Sekuritas + Aktivitas = Pendapatan Sukuk/Pertumbuhan Saham | "Hasil Investasi" |

---

## Cara Menghindari Kebingungan di Masa Depan

Saat **mencatat transaksi baru**, pilih tipe yang tepat:

1. **Top-up ke sekuritas (misal BCA → RDN Mandiri):**  
   Pilih **Transfer** → Pilih rekening Sumber = BCA, Tujuan = RDN/Sekuritas.  
   Sistem otomatis mengenali ini sebagai "Setoran Investasi". Tidak perlu beri nama aktivitas khusus.

2. **Tarik dana dari sekuritas (RDN → BCA):**  
   Pilih **Transfer** → Sumber = RDN, Tujuan = BCA.  
   Sistem otomatis mengenali sebagai "Pencairan Investasi".

3. **Pendapatan investasi (sukuk, dividen):**  
   Pilih **Pemasukan** → Pilih kategori **"Pendapatan Sukuk"** atau **"Pertumbuhan Saham"**, dengan rekening tujuan = RDN/Sekuritas.

---

## Ringkasan

- **Transfer-Out & Investasi-Out** = nama aktivitas dari data historis. Data tetap benar, hanya terlihat dobel di filter.
- **Sistem baru** mendeteksi arah otomatis dari tipe rekening, bukan nama aktivitas.
- Tidak perlu mengubah data lama — semuanya sudah dihitung dengan benar oleh sistem.
