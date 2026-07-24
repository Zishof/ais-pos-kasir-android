# AIS POS Kasir Android — v1.1.0

Rilis perbaikan penting: **memperbaiki bug tombol "Masuk" tidak merespons** yang dilaporkan pengguna, sekaligus membangun sistem pelaporan error menyeluruh dan wizard pengaturan server yang baru.

## ⚠️ Perbaikan Bug Kritis

Ditemukan **2 penyebab nyata** kenapa tombol "Masuk" tidak merespons apa pun:

1. **`app.js` gagal dimuat sama sekali** — komentar dokumentasi di baris atas file secara tidak sengaja mengandung urutan karakter `*/` di tengah kalimat, yang menutup blok komentar JavaScript LEBIH AWAL dari seharusnya. Akibatnya seluruh isi file setelah itu (termasuk SEMUA tombol & logika aplikasi) gagal diparsing browser — bukan cuma tombol Masuk, TAPI SELURUH aplikasi tidak merespons klik apa pun.
2. **Tidak ada batas waktu (timeout) pada permintaan jaringan** — bila koneksi macet (bukan gagal total, cuma lambat/menggantung), aplikasi menunggu selamanya tanpa pernah menampilkan pesan apa pun.

Kedua akar masalah ini sudah diperbaiki dan diverifikasi berjalan dengan benar.

## Fitur Baru

### Wizard Pengaturan Server 2 Langkah
Layar masuk sekarang dipecah jadi 2 langkah dengan indikator progres: **(1) Pengaturan Server** — isi alamat + tombol "Tes Koneksi" wajib berhasil dulu sebelum bisa lanjut, **(2) Masuk** — userid & kata sandi. Ini mencegah pengguna mencoba login dengan alamat server yang salah tanpa tahu penyebabnya.

### Sistem Alert Error Menyeluruh
**Setiap kegagalan** (jaringan, timeout, sesi berakhir, respons tak terduga, atau exception tak terduga apa pun) sekarang menampilkan alert dengan:
- Penjelasan awam + langkah yang perlu dilakukan.
- Detail teknis mentah (collapsible, tersembunyi secara default).
- Tombol **Salin Detail** (clipboard) dan **Laporkan ke GitHub** (membuka form issue GitHub sudah terisi otomatis, tinggal ditinjau & dikirim).

## Instalasi

Unduh `app-debug.apk`, salin ke perangkat Android, buka untuk instal (aktifkan "Izinkan dari sumber ini" bila diminta). Bisa langsung menimpa instalasi v1.0.0 yang sudah ada.
