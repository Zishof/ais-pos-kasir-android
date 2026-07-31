# AIS POS Kasir Android — v1.8.0

## Fitur Baru: Unduh & Unggah Excel Katalog Barang (khusus Supervisor)

Layar "Produk" sekarang punya 2 tombol baru di drawer navigasi:

- **Unduh Excel** -- mengekspor seluruh katalog produk toko ke file `.xlsx` dengan format yang SAMA PERSIS dengan "Daftar Barang dan Jasa" (Kode, UPC/Barcode, Kategori, Nama Barang, Nama Pemasok Utama, Satuan, Kts, Def. Hrg. Jual Sa, Nilai Satuan).
- **Unggah Excel** -- mengunggah file Excel untuk memperbarui katalog secara massal:
  - **Kode sudah ada di toko ini** → produk itu **diperbarui**. **Kode belum ada** → dibuat **produk baru**.
  - **Kategori/Pemasok/Satuan** yang namanya belum dikenal sistem otomatis **dibuat baru** dan langsung ditautkan ke produk.
  - **Kolom "Kts" (stok) RANGKAP FUNGSI jadi Stok Opname**: dicatat sebagai baris Stok Opname resmi (mesin sama dgn fitur Stok Opname yang sudah ada) sehingga stok akhir produk otomatis sesuai angka di file, lengkap dengan jejak audit.

## Instalasi

Unduh dan pasang `AIS-POS-Kasir-Android-v1.8.0-debug.apk`. Perangkat mungkin meminta izin "Instal aplikasi tak dikenal" untuk sumber file manager/browser yang dipakai mengunduh APK ini (khusus instalasi manual pertama kali).
