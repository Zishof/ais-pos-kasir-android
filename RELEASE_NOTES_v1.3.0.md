# AIS POS Kasir Android — v1.3.0

## ✨ Fitur Baru: Mode Offline-First

Checkout sekarang **tetap bisa dilakukan meski tidak ada koneksi internet** (untuk metode pembayaran tunai/manual -- metode Saldo tetap wajib online karena harus memverifikasi saldo real-time). Sama seperti versi Desktop dan web:

- Setiap transaksi ditulis ke penyimpanan lokal perangkat (IndexedDB) **sebelum** dicoba dikirim ke server -- kalau koneksi putus tepat setelah tombol "Bayar" ditekan, transaksi tetap aman tersimpan, tidak hilang.
- Tombol Bayar tetap sukses saat offline, dengan keterangan "(tersimpan offline, menunggu sinkron)" di layar sukses.
- Lencana 🔄 baru muncul di topbar menunjukkan jumlah transaksi yang menunggu dikirim -- ketuk untuk membuka **Status Sinkronisasi**: daftar transaksi tertunda + tombol "Sinkronkan Sekarang".
- Sinkronisasi otomatis: begitu koneksi pulih (atau setiap 30 detik sebagai jaring pengaman), transaksi tertunda otomatis dikirim tanpa perlu tindakan kasir.
- Aman dari duplikasi: kode transaksi bersifat unik (dijamin server) -- kalau transaksi ternyata sudah tersinkron sebelumnya (mis. balasan sukses sempat tak terbaca krn koneksi putus), sinkronisasi ulang dianggap sukses, tidak membuat transaksi kembar.

## Instalasi

Unduh dan pasang `AIS-POS-Kasir-Android-v1.3.0-debug.apk`.
