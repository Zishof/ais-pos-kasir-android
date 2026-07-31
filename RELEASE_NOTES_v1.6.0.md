# AIS POS Kasir Android — v1.6.0

## Perubahan Besar: Sesi Kasir kini Offline-First (menyusul versi Desktop)

Sesi Kasir (Buka Kas / Tutup Kas) sekarang dibangun ulang total supaya **tidak pernah lagi bergantung pada respons server secara langsung** -- pola yang sama persis dengan yang sudah dipakai di versi Desktop:

- **Buka Kas / Tutup Kas kini instan** -- tersimpan ke database lokal HP/tablet ini SEKETIKA, kasir langsung bisa lanjut jualan tanpa menunggu jaringan sama sekali.
- **Berfungsi penuh saat offline** -- kasir tetap bisa membuka kas, berjualan, dan menutup kas walau tidak ada koneksi internet sama sekali.
- **Sinkronisasi otomatis di latar** -- begitu ada koneksi, sesi kas yang tersimpan lokal otomatis dikirim ke server tanpa perlu tindakan apa pun dari kasir (dicoba tiap 30 detik selama aplikasi terbuka, plus segera saat koneksi kembali).
- **Aman dari duplikat** -- setiap sesi kas punya kode unik yang dibuat perangkat ini sendiri; percobaan sinkron berulang tidak akan pernah membuat sesi kas dobel di server.
- Selisih kas akhir tetap dihitung **server** (akurat dari seluruh riwayat transaksi toko) -- selama sesi belum sempat tersinkron, aplikasi menampilkan tanda "belum sinkron" yang jelas alih-alih angka yang seolah final.

## Perbaikan: Kotak pencarian barcode kini otomatis kosong setelah scan

Setelah scan barcode dan barang berhasil ketemu (kode cocok persis dengan produk), barang otomatis ditambahkan ke keranjang **dan kotak pencarian langsung dikosongkan** -- siap scan barang berikutnya tanpa jeda. Kalau kode yang di-scan/diketik tidak cocok persis, kotak dibiarkan apa adanya (hasil filter pencarian manual tetap tampil).

## Catatan penting

Fitur Sesi Kasir Offline-First baru diverifikasi lewat build + pemeriksaan sintaks/logika kode -- **belum diuji langsung di lapangan** (buka kas offline, tutup kas offline, pastikan sinkron berhasil begitu online kembali). Mohon diuji dengan skenario itu sebelum benar-benar diandalkan.

## Instalasi

Unduh dan pasang `AIS-POS-Kasir-Android-v1.6.0-debug.apk`. Perangkat mungkin meminta izin "Instal aplikasi tak dikenal" untuk sumber file manager/browser yang dipakai mengunduh APK ini (khusus instalasi manual pertama kali) -- untuk pembaruan berikutnya, aplikasi akan menawarkan update otomatis di dalam aplikasi.
