# AIS POS Kasir Android — v1.10.0

## Fitur Baru: 3 layar admin baru di drawer navigasi

Melengkapi FASE 2 ("layar admin/laporan") -- menyusul Ringkasan, Produk, Riwayat Sinkronisasi, dan Log Error yang sudah ada:

- **Customer/Anggota** -- daftar & cari anggota, tambah/ubah data (nama, kode identitas, jenis keanggotaan, kontak). Sama fungsinya dengan manajemen anggota di POS Online (versi web).
- **Konfigurasi** -- profil toko (nama, alamat, kontak, jam operasional, ucapan terima kasih struk) bisa dilihat semua kasir, hanya bisa DIUBAH oleh supervisor toko atau admin. Di layar yang sama juga ada **Akun Pedagang**: daftar akun kasir toko ini, supervisor/admin boleh tambah akun baru atau ubah akun yang ada (termasuk menaikkan/menurunkan status Supervisor).
- **Laporan-Laporan** -- katalog laporan generik (puluhan kategori: Penjualan, Stok, Keuangan, dll), ketuk satu laporan untuk atur filter tanggal/produk/pelanggan lalu tampilkan hasilnya (tabel dengan pengelompokan & subtotal, sama persis logikanya dengan versi Desktop/web supaya angka tidak pernah beda), dan tombol **Unduh PDF**.

Ketiga layar ini gerbang hak aksesnya SAMA dengan versi Desktop -- tidak ada perubahan di sisi server, murni menyambungkan layar Android ke aksi PosApi yang sudah ada.

## Instalasi

Unduh dan pasang APK v1.10.0. Perangkat mungkin meminta izin "Instal aplikasi tak dikenal" untuk sumber file manager/browser yang dipakai mengunduh APK ini (khusus instalasi manual pertama kali).

## Catatan

Ketiga layar baru ini diverifikasi lewat pemeriksaan kode + sintaks JS + build APK sukses -- belum diuji ketuk-per-ketuk dengan data sungguhan di perangkat, terutama alur Unduh PDF (menyimpan berkas ke penyimpanan perangkat) dan alur ubah Akun Pedagang. Mohon diuji sebelum diandalkan penuh di lapangan.
