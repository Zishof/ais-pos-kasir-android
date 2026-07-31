# AIS POS Kasir Android — v1.11.0

## Fitur Baru: Alih Bahasa (i18n)

Menu drawer sekarang punya pemilih bahasa (Indonesia/English/Arab/Mandarin) di bagian bawah, memakai mesin kamus server yang SAMA dengan versi Desktop dan JSP/ZK — jadi terjemahan yang sudah ada di sistem otomatis ikut terpakai. Cakupan saat ini: label menu drawer. Layar-layar lain akan menyusul bertahap.

## Fitur Baru: Pesanan Online

Menu baru di drawer (ikon 📥) untuk melihat pesanan yang dibuat pembeli sendiri lewat toko online -- cari berdasarkan kode/nama pemesan, **Verifikasi** (pilih metode bayar untuk menuntaskan) atau **Batalkan** pesanan yang belum lunas.

## Fitur Baru: Keranjang Tertahan

- Tombol **"Tahan"** baru di panel keranjang (di sebelah tombol Bayar) -- simpan keranjang saat ini sebagai draft belum-lunas, lalu lanjutkan transaksi lain. Berguna saat pembeli belum siap bayar atau kasir perlu melayani pembeli lain dulu.
- Menu baru di drawer (ikon 💼) **"Keranjang Tertahan"** -- daftar semua keranjang yang sedang ditahan, tombol **"Muat ke Keranjang"** untuk melanjutkan (menggantikan keranjang aktif saat ini), atau **"Hapus"** untuk membatalkan.
- Catatan: pemilihan member/pelanggan **tidak ikut tersimpan otomatis** saat keranjang dimuat ulang -- kasir perlu memilih member lagi bila transaksi ini dibayar pakai Saldo.

Kedua fitur di atas memakai mekanisme yang sama persis dengan yang sudah ada di versi web (JSP) dan Desktop -- server dibedakan lewat siapa yang mengirim draft (pembeli sendiri vs kasir), bukan skema data baru.

## Instalasi

Unduh dan pasang APK v1.11.0. Perangkat mungkin meminta izin "Instal aplikasi tak dikenal" untuk sumber file manager/browser yang dipakai mengunduh APK ini (khusus instalasi manual pertama kali).

## Catatan

Fitur-fitur ini baru diverifikasi lewat pemeriksaan kode + sintaks JS + kompilasi server -- belum diuji langsung ketuk-per-ketuk dengan data transaksi sungguhan di perangkat. Mohon diuji sebelum diandalkan di lapangan, terutama alur Tahan → Muat ke Keranjang → Bayar (pastikan tidak ada baris transaksi ganda di laporan).
