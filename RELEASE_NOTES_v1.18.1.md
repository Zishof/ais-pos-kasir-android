# AIS POS Kasir Android v1.18.1

## Perbaikan

1. **Dasbor Stok Opname tidak muncul saat pertama dibuka** -- sekarang otomatis dimuat begitu layar Stok Opname dibuka, tak perlu memuat ulang manual dulu.
2. **"Cetak Price Tag" belum ada pilihan jenis label** -- ditambahkan dropdown "Jenis Cetak" (POP Besar / Stiker Label Warna / Label Teks), masing-masing dirender lewat canvas dan disimpan sbg gambar PNG utk dibagikan/dicetak.

## Fitur baru

3. **Bahan Baku (Resep) & HPP** pada form Tambah/Ubah Produk -- sama seperti versi Desktop/JSP: pilih bahan, tentukan qty, HPP terhitung otomatis jadi harga beli saat disimpan.
4. **Scan barcode lebih efisien** -- kotak pencarian di layar Kasir sekarang otomatis "Select All" setiap kali Enter ditekan/barcode discan, supaya scan berikutnya langsung menimpa teks lama.

Catatan: notifikasi badge merah "Pesanan Online Baru" sudah ada sejak rilis sebelumnya di Android -- tidak ada perubahan pada fitur itu di rilis ini.
