# AIS POS Kasir Android v1.15.0

## Enhance: Unggah Excel katalog kini offline-first + laporan hasil lengkap

**Layar Produk (tombol "Unggah Excel"):**

- **Offline-first.** Memilih berkas Excel sekarang SELALU menyimpan berkas ke perangkat ini
  terlebih dahulu (IndexedDB, sama prinsipnya dengan antrean transaksi Kasir), baru dicoba dikirim
  ke server. Kalau sedang offline, berkas tetap aman tersimpan dan **otomatis terkirim di latar
  begitu koneksi internet pulih** (dicek berkala tiap 30 detik, atau segera saat koneksi kembali
  tersambung) -- tidak perlu memilih ulang berkas.
- **Laporan hasil impor** langsung terbuka sebagai modal setiap kali proses selesai (baik langsung
  online maupun setelah tersinkron di latar) -- menampilkan status tiap baris (Berhasil/Gagal/
  Dilewati), perubahan stok lama→baru, kategori/pemasok/satuan yang baru dibuat, dan **penyebab
  teknis** bila ada baris yang gagal. Laporan bisa **diunduh sebagai berkas .txt** ke folder
  Dokumen/internal aplikasi.
- Konsisten dengan Desktop v1.0.33 yang merilis fitur serupa -- keduanya memakai field detail
  per-baris yang sama dari server (`KantinHelper.produkImporExcelKomit`).

## Enhance lanjutan: verifikasi otomatis + saran perbaikan + unduh otomatis

- **Verifikasi pasca-simpan.** Server sekarang membaca ULANG setiap baris yang dilaporkan "berhasil"
  langsung dari database (bukan cuma percaya tidak ada error saat proses) untuk memastikan data yang
  tersimpan BENAR-BENAR sesuai yang diunggah. Kalau ada yang tidak sesuai, baris itu diturunkan jadi
  "gagal" dengan rincian nilai yang diharapkan vs yang sungguhan tersimpan.
- **Saran perbaikan per baris.** Baris yang gagal sekarang disertai saran konkret apa yang bisa
  dicoba (mis. kode duplikat, format angka salah, kolom wajib kosong) -- bukan cuma pesan error
  teknis mentah.
- **Unduh otomatis.** Laporan .txt sekarang **langsung tersimpan otomatis** ke folder Dokumen/internal
  aplikasi begitu proses impor selesai -- tidak perlu menekan tombol "Unduh Laporan" lagi (tombol itu
  tetap ada untuk menyimpan ulang secara manual bila perlu).
- **Peringatan eskalasi.** Kalau ada baris yang gagal, laporan menampilkan catatan tegas: coba dulu
  saran perbaikannya, dan kalau kegagalan terus berlanjut, laporkan ke admin/tim pengembang **dengan
  wajib melampirkan tangkapan layar (screenshot)** laporan tersebut.

> **Catatan:** server (backend) perlu sudah di-deploy dengan perubahan terbaru supaya laporan
> menampilkan detail lengkap per-baris (bukan cuma ringkasan lama).
