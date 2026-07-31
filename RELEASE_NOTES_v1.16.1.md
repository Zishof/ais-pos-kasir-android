# AIS POS Kasir Android v1.16.1

## Perbaikan KRITIS: "Memuat Katalog..." macet tak berhenti setelah masuk

**Ini memperbaiki bug yang membuat aplikasi tidak bisa dipakai setelah login berhasil.**

- **Akar masalah:** dua berkas internal (`offline-queue.js` dan `sesi-kas-offline.js`) sama-sama
  memakai satu basis data lokal (IndexedDB) yang sama, tapi membukanya di **nomor versi berbeda**
  (1 vs 2) tanpa saling tahu. Begitu KEDUANYA membuka koneksi di sesi yang sama -- yang SELALU terjadi
  tak lama setelah login -- permintaan buka versi lebih tinggi terjebak menunggu koneksi versi lebih
  rendah menutup diri, yang TIDAK PERNAH terjadi karena tidak ada penanganan untuk itu. Akibatnya
  proses masuk aplikasi macet permanen di layar "Memuat katalog...", **tanpa satu pun error yang
  tercatat di server** (permintaan berikutnya ke server bahkan tidak sempat dikirim -- macetnya
  terjadi sebelum itu, murni di penyimpanan lokal perangkat).
- **Perbaikan:** nomor versi disamakan, kedua berkas sekarang saling defensif (bisa membuat semua
  tabel yang diperlukan siapa pun yang kebetulan membuka duluan), dan ditambahkan penanganan yang
  sebelumnya hilang supaya skenario serupa di masa depan gagal cepat dengan pesan jelas -- bukan
  macet diam-diam selamanya.
- **Lapis pertahanan tambahan:** proses masuk aplikasi sekarang punya **batas waktu keseluruhan 30
  detik** -- apa pun penyebabnya (termasuk penyebab yang belum diketahui), aplikasi tidak akan pernah
  lagi macet selamanya di layar muat; akan menampilkan error yang jelas dan kembali ke layar masuk.
- Jaringan (`api.js`) juga diperkuat agar tetap punya batas waktu bahkan pada WebView yang (jarang)
  tidak mendukung pembatalan permintaan (`AbortController`).

## Selain itu: Riwayat Stok Opname kini dari server

- Sama seperti perbaikan Desktop v1.0.36 -- daftar riwayat di layar "Stok Opname" sekarang dibaca dari
  server (aksi `so_riwayat`), bukan cuma sesi layar ini. Tetap terisi walau layar dimuat ulang.

> **Catatan:** perbaikan Riwayat Stok Opname butuh server sudah di-deploy dengan perubahan terbaru.
> Perbaikan "Memuat Katalog macet" murni sisi aplikasi, tidak perlu apa pun dari server.
