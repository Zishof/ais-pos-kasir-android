# AIS POS Kasir Android — v1.0.0 (rilis awal)

Rilis pertama aplikasi Kasir Android — Kasir Desktop (Electron) kini punya rekan Android untuk tablet (mis. Galaxy Tab) & HP, memakai backend `PosApi.java` yang sama persis.

## Fitur

- Login + pengaturan alamat server, tampilan **responsif** (grid produk & keranjang menyesuaikan lebar layar — sidebar di tablet lanskap, bottom-sheet di HP/tablet potret).
- Katalog produk (kategori + pencarian), keranjang, gerbang Sesi Kas, checkout tunai/metode manual.
- **Cetak struk via printer Bluetooth thermal (ESC/POS)** — lihat README untuk daftar uji coba yang wajib dilakukan di perangkat fisik sebelum produksi.

## ⚠️ Status: APK Debug (belum ditandatangani untuk rilis produksi)

APK terlampir adalah **build debug** — cukup untuk instal & uji coba langsung di perangkat (`Instal aplikasi tidak dikenal` perlu diizinkan di Android), TAPI belum melalui proses *signing* rilis maupun uji fisik lengkap (lihat README bagian "Uji Coba Diperlukan"). Mohon laporkan temuan sebelum dipakai di kasir sungguhan.

## Instalasi

Unduh `app-debug.apk`, salin ke perangkat Android, buka untuk instal (aktifkan "Izinkan dari sumber ini" bila diminta).
