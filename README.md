# AIS POS Kasir — Android

Aplikasi kasir POS untuk Android (tablet & HP), dibangun dengan [Capacitor](https://capacitorjs.com/) supaya bisa memakai ulang backend JSON yang **sama persis** dengan [Kasir Desktop (Electron)](https://github.com/Zishof/ais-pos-kasir-desktop) — server `PosApi.java` di monolith AIS.

## Kenapa Capacitor?

- Backend `PosApi.java`/`KantinHelper.java` sudah ada & teruji (dipakai Kasir Desktop) — Android jadi klien ke-3 tanpa perlu menulis ulang logika bisnis di Kotlin.
- Satu basis kode web (HTML/CSS/JS) yang sama filosofinya dengan `desktop-pos-electron`, dipaketkan jadi APK native.
- Plugin native (Bluetooth, dsb) tetap bisa dipasang lewat Capacitor plugin bridge saat fitur tertentu memang butuh akses hardware asli.

## Fitur v1 (cakupan yang SUDAH dibangun)

- Login + pengaturan alamat server (host/context path/HTTPS) — token disimpan via `@capacitor/preferences`.
- Katalog produk responsif (kategori pill + grid, menyesuaikan lebar layar HP vs tablet).
- Keranjang (sidebar di tablet lanskap ≥900px, bottom-sheet di HP/tablet potret).
- Gerbang Sesi Kas (wajib buka kas sebelum bisa checkout, sama seperti Desktop).
- Checkout tunai/metode "manual" (mis. transfer) — memakai aksi `bayar` yang sama dengan Desktop.
- Cetak struk via **printer Bluetooth thermal (ESC/POS, profil Classic/SPP)** — lihat `escpos.js`.

## Batasan v1 (belum diporting dari Desktop — arsitektur sudah siap, tinggal disambungkan)

- Pembayaran pakai **saldo member + verifikasi PIN** (Desktop punya ini via Layar Pelanggan).
- Diskon otomatis, simpan/tahan keranjang (hold sale), pesanan online.
- Mode offline-first (antrean transaksi lokal saat tanpa koneksi) — v1 murni online.
- Printer via USB/Wi-Fi (hanya Bluetooth Classic/SPP yang didukung saat ini).

## ⚠️ Uji Coba Diperlukan

Kode di sini ditulis mengikuti spesifikasi ESC/POS standar & dokumentasi resmi plugin yang dipakai, **TAPI belum bisa diuji end-to-end** di lingkungan pengembangan (tidak ada perangkat Android/printer Bluetooth fisik tersambung). Sebelum dipakai produksi, wajib diuji manual:

1. Install APK ke tablet/HP Android asli.
2. Login ke server AIS sungguhan, pastikan katalog produk tampil & checkout tunai berhasil.
3. Pairing printer thermal Bluetooth lewat **Pengaturan Bluetooth Android** (di luar aplikasi ini — prasyarat wajib, plugin hanya bisa memilih dari perangkat yang SUDAH di-pairing OS).
4. Buka menu printer (ikon di kanan atas layar Kasir) → "Cari Perangkat Ter-pairing" → pilih printer → coba cetak struk setelah transaksi.
5. Uji di Android 12+ (izin runtime Bluetooth dipisah dari versi lama — `MainActivity.java` sudah menangani ini, tapi tetap perlu verifikasi di perangkat nyata).

## Build

Prasyarat: Node.js, Android SDK (`ANDROID_HOME`), JDK 17 (Gradle di proyek ini **tidak kompatibel** dengan JDK 21+/25).

```bash
npm install
npx cap sync android
cd android
JAVA_HOME="<path ke JDK 17>" ./gradlew.bat assembleDebug
```

APK debug: `android/app/build/outputs/apk/debug/app-debug.apk`.

Untuk rilis produksi (APK yang ditandatangani), ikuti [panduan signing Capacitor/Android resmi](https://capacitorjs.com/docs/android/deploying-to-google-play) — proyek ini belum menyertakan keystore produksi (sengaja, itu rahasia yang harus dikelola terpisah, bukan dikomit ke repo).
