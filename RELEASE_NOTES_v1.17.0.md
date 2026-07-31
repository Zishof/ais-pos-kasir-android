# AIS POS Kasir Android v1.17.0

## Paritas Fitur Menu "Pesanan Online" & "Keranjang Tertahan" dengan JSP/Web Admin

Layar Pesanan Online sekarang sejajar dengan layar "Monitor Pesanan Online (Draft)" di JSP/Web admin:

- **Filter**: Mulai, Akhir, Kode, Pembeli, dan (khusus admin) Pedagang -- buka lewat ikon filter di pojok kanan atas, tombol "Saring" untuk menerapkan.
- **Detail**: lihat rincian item, diskon, cashback, dan total tiap pesanan (baik yang sudah lunas maupun belum) -- tersedia di layar Pesanan Online maupun Keranjang Tertahan.
- **Cetak Struk**: untuk pesanan yang sudah lunas, langsung ke printer Bluetooth yang sudah dipasangkan (sama seperti tombol cetak struk di layar Kasir).
- **Hitung Ulang**: (admin/pengawas toko) menghitung ulang diskon & cashback memakai aturan diskon terkini -- berlaku untuk draft maupun transaksi yang sudah lunas (otomatis mengoreksi juga transaksi lunas terkait), tersedia di kedua layar.
- **Bayar Semua**: (admin) memproses pembayaran seluruh pesanan online yang belum lunas sesuai filter aktif, satu per satu, dengan progress bar dan ringkasan berhasil/gagal.

Semua fitur baru ini memerlukan server AIS versi terbaru (aksi `pesanan_hitung_ulang` dan filter baru pada `pesanan_list`) sudah ter-deploy.
