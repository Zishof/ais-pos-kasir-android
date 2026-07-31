# AIS POS Kasir Android v1.16.0

## Rilis penutup celah fitur (gap-closure) terhadap Kasir Desktop

Delapan fitur yang sebelumnya hanya ada di Kasir Desktop kini tersedia juga di Android -- semuanya
memakai ulang aksi server `PosApi.java`/`KantinHelper.java` yang sama, sudah teruji lewat Desktop.

### Buka Laci Kasir
- Tombol baru di pojok kanan atas layar Kasir dan di layar sukses setelah bayar.
- Mengirim perintah standar ESC/POS `ESC p m t1 t2` lewat koneksi printer Bluetooth yang sama dipakai
  cetak struk (laci kasir tersambung ke port printer, bukan perangkat Bluetooth sendiri).
- **Otomatis terbuka** setelah pembayaran **tunai** berhasil (non-tunai/Saldo/Transfer TIDAK memicu
  otomatis -- kasir tetap bisa buka manual bila perlu).

### Layar Pelanggan (sinkron 2 perangkat)
- Menu baru "Layar Pelanggan" -- dibuka di perangkat KEDUA (tablet/HP lain), menampilkan isi
  keranjang & total secara langsung menghadap pembeli, dengan layar sambutan saat belum ada
  transaksi berjalan.
- Tidak perlu proses pairing apa pun -- cukup login ke toko yang sama di kedua perangkat. Perangkat
  kasir menyiarkan status keranjang ke server (kanal per-toko, tersimpan di memori server saja, tidak
  pernah ditulis ke database); perangkat kedua memoling tiap 1,5 detik selama layar itu terbuka.

### Stok Opname
- Menu baru "Stok Opname" -- pindai/ketik barcode, isi stok fisik hasil hitung, langsung tersimpan
  dan stok produk otomatis dihitung ulang. Kartu ringkasan (produk diopname, total lebih/kurang,
  selisih bersih) selalu terlihat, riwayat sesi ini ditampilkan di layar yang sama.

### Aturan Diskon
- Menu baru "Aturan Diskon" -- daftar & kelola aturan promo lengkap (target produk/toko/member, masa
  berlaku, persentase/nominal, potong-langsung vs cashback, aktif/nonaktif).

### Tinjau Impor Katalog (sebelum kirim ke server)
- Unggah Excel katalog sekarang menampilkan layar **peninjauan** (kode, nama, kategori/pemasok/satuan,
  stok lama→baru, harga) yang bisa DISUNTING sebelum benar-benar dikirim & disimpan -- setara dengan
  "Tinjau Impor Katalog" Desktop. Setelah ditinjau & dikonfirmasi, proses pengiriman tetap
  offline-first seperti sebelumnya (aman tersimpan di perangkat walau sedang tanpa koneksi).

### Notifikasi Pesanan Online Baru
- Lencana merah otomatis muncul di menu "Pesanan Online" begitu ada pesanan baru masuk (dipoling tiap
  20 detik) -- tidak perlu lagi membuka layar itu berulang-ulang untuk mengecek.

### Hitung Ulang Stok
- Tombol baru di layar Produk -- memperbaiki data stok yang tidak sesuai (mis. akibat riwayat opname
  yang belum tersimpan benar) dan menghitung ulang stok semua produk toko ini dari catatan transaksi.

### Ganti Kata Sandi Sendiri
- Bagian baru "Akun Saya" di layar Konfigurasi -- kasir/supervisor bisa mengganti kata sandi login
  sendiri tanpa perlu minta admin.

---

> **Catatan:** server (backend) perlu sudah di-deploy dengan perubahan terbaru (khususnya aksi baru
> `layar_pelanggan_kirim`/`layar_pelanggan_ambil` untuk fitur Layar Pelanggan) supaya seluruh fitur di
> atas berfungsi penuh.
