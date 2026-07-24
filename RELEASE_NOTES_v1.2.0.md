# AIS POS Kasir Android — v1.2.0

Rilis besar: menutup gap paritas fitur inti transaksi dengan versi Desktop, sekaligus memperbaiki bug kritis yang sudah ada sejak v1.1.0.

## 🐛 Perbaikan Kritis (ada sejak v1.1.0)

**Layar "Kas Belum Dibuka" tidak pernah hilang, bahkan setelah Buka Kas berhasil.** Penyebabnya: aplikasi salah membaca struktur balasan server (mengharapkan data dibungkus `{data: {...}}` seperti versi Desktop, padahal server Android/API ini mengirim field langsung di level atas). Akibatnya status kas SELALU terbaca "tertutup" apa pun yang sebenarnya terjadi di server. Sekarang sudah diperbaiki dan diuji ulang terhadap struktur respons server yang sebenarnya.

## ✨ Fitur Baru

### Tutup Kas
Tombol status kas di pojok kanan atas (💰) sekarang bisa ditekan untuk menutup sesi kas -- menampilkan ringkasan Modal Awal/Penjualan Tunai/Non-Tunai/Kas Seharusnya, input Uang Fisik yang dihitung, dan mencatat selisih secara permanen. Setelah kas ditutup, aplikasi otomatis memberi tahu bila ada produk yang stoknya sudah di bawah ambang minimum.

### Pilih Member + Bayar Pakai Saldo + Verifikasi PIN
- Tombol "Pilih member" baru di atas keranjang -- cari berdasarkan nama/kode, tampil dengan lencana 🔒 PIN bila member itu wajib verifikasi.
- Memilih member langsung menampilkan saldo terkininya.
- Metode pembayaran "Saldo" sekarang benar-benar berfungsi: sebelum transaksi diproses, saldo dicek ulang real-time (bukan dari cache), termasuk batas minimal saldo yang harus tersisa (mengendap). Bila member wajib PIN, muncul layar verifikasi PIN sebelum transaksi dilanjutkan.

### Isi Saldo (Top Up)
Tombol "💰 Isi Saldo" pada kartu member yang dipilih membuka form nominal untuk mengisi saldo member tersebut langsung dari layar Kasir (butuh hak akses "Boleh Entry Topup" dari admin).

## Instalasi

Unduh dan pasang `AIS-POS-Kasir-Android-v1.2.0-debug.apk`.
