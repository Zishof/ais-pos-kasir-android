# AIS POS Kasir Android v1.18.3

## Perbaikan

1. **Nama kasir di transaksi/pesanan** -- kolom kasir yang benar sekarang tercatat terpisah dari metadata audit generik (padanan perbaikan Desktop).

## Fitur baru

2. **Sinkronisasi Log Error ke server** -- riwayat error di perangkat ini (sebelumnya cuma tersimpan lokal, hilang bila aplikasi di-uninstall) sekarang otomatis dikirim ke server (tiap 60 detik bila online), supaya admin pusat bisa memantau error dari semua mesin POS (Desktop/Android) dari satu tempat.
3. **Identitas Mesin POS** -- layar Konfigurasi punya bagian baru "Identitas Mesin POS" untuk memberi nama perangkat ini. Berguna untuk toko dengan lebih dari satu mesin POS -- transaksi dan pesanan sekarang mencatat mesin asalnya.
4. **Kolom Barcode Produk** (lanjutan rilis sebelumnya) -- pencarian/scan produk kini juga mencocokkan barcode.

## Catatan

- Metode pembayaran baru (QRIS/BMT/E-Money Santri/Reward Santri/Voucher BMT dll) sudah bisa ditambahkan sendiri lewat menu admin "Cara Pembayaran" tanpa perlu update aplikasi.
- Perlu server AIS versi terbaru sudah ter-deploy.
