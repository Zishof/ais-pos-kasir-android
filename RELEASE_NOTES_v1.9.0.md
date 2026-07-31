# AIS POS Kasir Android — v1.9.0

## Fitur Baru: Layar "Laporan Transaksi" (Report Order/Sesi/Payment)

Menu baru di drawer navigasi (ikon 📋), dengan 3 sub-tab:

- **Order** -- daftar order penjualan (nomor nota, waktu, kasir, pembeli, metode bayar, total). Ketuk **"Detail Penjualan"** untuk melihat rincian tiap item (qty, harga jual, diskon, pajak, subtotal).
- **Sesi** -- daftar sesi buka/tutup kas: nama kasir, waktu mulai/selesai, saldo awal, saldo akhir.
- **Payment** -- daftar pembayaran: waktu, metode, referensi order, jumlah.

Sesuai spesifikasi "Flow Kasir" dari klien -- versi Android sengaja lebih ringkas (kartu bertumpuk) dibanding versi Desktop (tabel), supaya tetap nyaman di layar HP.

## Perbaikan: Unggah Excel Katalog

Fitur "Unggah Excel" di layar Produk (khusus supervisor) sempat gagal sejak perubahan server versi sebelumnya. Sudah diperbaiki -- fitur berjalan normal kembali tanpa perlu perubahan apa pun di aplikasi ini (perbaikan murni di sisi server).

## Instalasi

Unduh dan pasang APK v1.9.0. Perangkat mungkin meminta izin "Instal aplikasi tak dikenal" untuk sumber file manager/browser yang dipakai mengunduh APK ini (khusus instalasi manual pertama kali).

## Catatan

Fitur "Laporan Transaksi" baru diverifikasi lewat pemeriksaan kode + sintaks JS -- belum diuji langsung ketuk-per-ketuk dengan data transaksi sungguhan di perangkat. Mohon diuji sebelum diandalkan di lapangan.
