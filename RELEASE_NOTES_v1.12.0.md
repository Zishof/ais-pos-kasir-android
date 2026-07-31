# AIS POS Kasir Android — v1.12.0

## Fitur Baru: Menu "Kulakan" (Harga Beli)

Menu baru di drawer (ikon 🛒), paritas dengan menu Kulakan yang baru ditambahkan di versi Desktop v1.0.28:

- Ketik/scan barcode atau kode produk yang dibeli dari pemasok.
- Isi **Jumlah Masuk** dan **Harga Beli Satuan** (nomor faktur/nama pemasok/keterangan opsional).
- **Simpan** -- stok dan harga beli produk otomatis diperbarui, rumus dan mekanismenya sama persis dengan layar admin "Pengadaan / Kulakan (Barang Masuk)" yang sudah ada di sistem.
- Riwayat seluruh catatan Kulakan (bisa dicari, dipaginasi) tampil langsung di layar yang sama.

Sesuai aturan hak akses yang sudah berlaku untuk Produk: **siapa saja boleh melihat riwayat**, tapi **hanya supervisor toko atau admin/manager yang boleh mencatat** barang masuk baru. Gerbang ini ditegakkan di server.

## Instalasi

Unduh dan pasang APK v1.12.0. Perangkat mungkin meminta izin "Instal aplikasi tak dikenal" untuk sumber file manager/browser yang dipakai mengunduh APK ini (khusus instalasi manual pertama kali).

## Catatan

Fitur ini baru diverifikasi lewat pemeriksaan kode + sintaks JS + kompilasi server -- belum diuji langsung ketuk-per-ketuk dengan data sungguhan di perangkat. Mohon diuji sebelum diandalkan di lapangan, terutama pastikan stok & harga beli produk yang dicatat lewat menu ini benar-benar berubah di layar Kasir.
