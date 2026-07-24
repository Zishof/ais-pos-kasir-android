# AIS POS Kasir Android — v1.1.2

## Fitur Baru: Cek Update Aplikasi

Layar Kasir sekarang otomatis mengecek (sekali setiap kali aplikasi dibuka) apakah ada versi baru di GitHub Releases. Kalau ada, muncul banner biru di bagian atas layar:

> 🎉 Versi baru vX.X.X tersedia (versi Anda saat ini: v1.1.2)  [Lihat] [Nanti]

- **Lihat** membuka halaman rilis GitHub di browser, tempat APK versi terbaru bisa diunduh dan dipasang manual (Android tidak mengizinkan aplikasi memasang APK baru secara otomatis/diam-diam seperti installer Windows -- ini demi keamanan perangkat).
- **Nanti** menutup banner untuk versi tersebut; akan muncul lagi otomatis begitu ada versi yang LEBIH baru lagi.
- Gagal cek (tidak ada internet, GitHub tidak terjangkau) selalu diam-diam diabaikan -- tidak pernah memunculkan alert error, supaya tidak mengganggu kasir yang sedang bekerja.

## Instalasi

Unduh dan pasang `AIS-POS-Kasir-Android-v1.1.2-debug.apk`.
