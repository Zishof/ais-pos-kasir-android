# AIS POS Kasir Android v1.14.0

## FASE 5 -- Keranjang Tertahan & Metode Bayar per Anggota

- **Metode pembayaran kini tersaring otomatis** sesuai jenis keanggotaan member yang dipilih di
  Kasir (sebelumnya daftar metode bayar sama utk semua orang, tidak menghormati pembatasan per
  jenis-anggota seperti di versi web) -- daftar disegarkan tiap kali member dipilih atau dihapus dari
  keranjang.
- **"Muat" Keranjang Tertahan kini memulihkan lebih lengkap**: kode produk, diskon, cashback,
  aturan diskon per item, member yang dipilih, DAN metode pembayaran yang sebelumnya dipakai --
  sebelumnya field-field ini hilang/di-hardcode kosong saat keranjang tertahan dibuka kembali.

## Catatan

Rilis ini menyusul v1.0.30 Desktop yang menutup gap yang sama (fitur "Tahan" + resume Keranjang
Tertahan di layar Kasir Desktop, plus fix crash "elSearchDropdown"). Fitur "Diskon Otomatis saat
Checkout" (Fase 4, dari rilis sebelumnya) tetap berjalan seperti biasa.
