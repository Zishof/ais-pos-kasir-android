# AIS POS Kasir Android v1.18.2

## Fitur baru: Kolom Barcode Produk

Produk sekarang punya field **UPC/Barcode** terpisah dari **Kode Produk** -- untuk toko yang barangnya sudah punya barcode dari pabrik/supplier (EAN/UPC di kemasan) selain kode internal toko sendiri. Opsional, tidak wajib diisi.

- Field "UPC/Barcode" baru di form Tambah/Ubah Produk.
- Pencarian produk (kotak cari di layar Kasir, Cetak Price Tag) sekarang mencocokkan **kode ATAU barcode ATAU nama**.
- Scan barcode fisik (Kasir, Kulakan, Stok Opname) ikut mencocokkan kolom barcode baru ini, tidak lagi hanya kode internal.
- Unggah/unduh Excel katalog produk sudah menyertakan kolom Barcode (server sudah diperbaiki -- sebelumnya unduh katalog penuh selalu mengosongkan kolom ini walau datanya ada).

Perlu server AIS versi terbaru sudah ter-deploy.
