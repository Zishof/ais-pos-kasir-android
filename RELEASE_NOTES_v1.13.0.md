# AIS POS Kasir Android — v1.13.0

## Fitur Baru: Diskon Otomatis Saat Checkout (Fase 4)

Layar Kasir sekarang menerapkan **Aturan Diskon** secara otomatis, paritas dengan versi Desktop/web/ZK -- bukan fitur baru, murni porting mesin yang sudah ada:

- Setiap kali keranjang berubah (tambah/kurangi qty/pilih member), sistem otomatis mengecek aturan yang cocok untuk tiap produk lalu menghitung potongannya.
- Baris keranjang yang kena diskon menampilkan badge kecil "-Rp ..." (potong langsung) atau "+Rp ..." (cashback, dihitung terpisah -- tidak mengurangi total yang harus dibayar).
- Ringkasan keranjang menampilkan baris "Diskon Otomatis" dan "Cashback Diperoleh" bila ada.
- Bila server tidak bisa dihubungi saat mengevaluasi diskon, transaksi TETAP bisa dilanjutkan tanpa diskon -- bukan diblokir.

## Instalasi

Unduh dan pasang APK v1.13.0. Perangkat mungkin meminta izin "Instal aplikasi tak dikenal" untuk sumber file manager/browser yang dipakai mengunduh APK ini (khusus instalasi manual pertama kali).

## Catatan

Fitur ini baru diverifikasi lewat pemeriksaan kode + sintaks JS + kompilasi server -- belum diuji langsung ketuk-per-ketuk dengan data sungguhan di perangkat. Mohon diuji sebelum diandalkan di lapangan, terutama pastikan aturan diskon yang sudah dibuat benar-benar terpotong sesuai aturan (produk/toko/member/tanggal/batas maksimal) dan Total yang dikirim ke server sudah benar.

Catatan teknis: aplikasi Android ini tidak punya konsep pajak checkout (beda dari Desktop/web yang punya field Pajak), jadi Total = Subtotal - Diskon (tanpa suku pajak).
