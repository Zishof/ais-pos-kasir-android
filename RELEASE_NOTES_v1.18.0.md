# AIS POS Kasir Android v1.18.0

## Stok Opname: paritas penuh dengan versi JSP/Web

Layar Stok Opname sekarang punya 3 sub-tab, sejajar dengan JSP "Manajemen Stok Barang":

- **Kartu Mutasi Stok** (dashboard baru) -- KPI Barang Masuk/Barang Keluar/Total Stok/Peringatan Stok < 10, filter periode (Hari Ini/Minggu Ini/Bulan Ini/6 Bulan/Tahun Ini), chart tren pergerakan barang dan Top 5 Barang Keluar.
- **Stok Opname** (form manual, tidak berubah).
- **SO by Scan (HP/PDT)** (baru) -- scan barcode berturut-turut (scanner PDT eksternal maupun **kamera HP**), tiap hasil masuk antrean dengan penghitung otomatis (scan barcode yang sama menambah stok fisik +1), statistik langsung (item discan/lebih/kurang/selisih bersih) dengan bunyi (beep) sukses/gagal, baru dikomit semua sekaligus lewat tombol "Simpan Semua".
  - **Izin kamera baru**: aplikasi akan meminta izin Kamera saat pertama dibuka setelah update ini -- diperlukan untuk fitur scan via kamera HP. Boleh ditolak bila hanya memakai scanner PDT eksternal/keyboard-wedge (fitur scan barcode manual tetap berfungsi tanpa izin kamera).

## Produk: fungsi baru "Cetak Price Tag"

Tombol baru di layar Produk untuk membuat label harga (price tag/POP): pilih produk, ukuran kertas (A2/A4/A5), jumlah label per baris, salinan per produk, label promo opsional, serta checkbox tampilkan barcode/kode produk/nama toko. Karena HP tidak bisa memilih printer langsung seperti Desktop, label digambar sebagai **gambar (PNG)** dan disimpan ke perangkat -- buka lewat aplikasi Galeri/Berkas untuk mencetak atau membagikannya.

## Perubahan Teknis

- Server: aksi baru `stok_dashboard` dan `price_tag_list_produk` (sama dengan yang dipakai Desktop).
- Barcode CODE128 dibangun via JsBarcode (vendored lokal, bukan CDN).
- Kamera scan memakai html5-qrcode (vendored lokal) + izin `CAMERA` baru di AndroidManifest.xml.

Fitur baru ini memerlukan server AIS versi terbaru sudah ter-deploy.
