# AIS POS Kasir Android — v1.5.0

## ✨ Fitur Baru: Update Otomatis (mirip Windows Update)

Sebelumnya, deteksi versi baru hanya menampilkan banner "Lihat"/"Nanti" yang membuka halaman rilis GitHub -- unduh dan instal sepenuhnya manual. Sekarang:

- Begitu versi baru terdeteksi (dicek otomatis sekali tiap aplikasi dibuka), muncul **popup tawaran** "Update Sekarang" / "Nanti Saja" langsung di dalam aplikasi.
- Popup itu punya checkbox **"Update Otomatis"** -- kalau dicentang, aplikasi tidak bertanya lagi: APK rilis berikutnya diunduh sendiri di latar begitu terdeteksi.
- Klik "Update Sekarang" (atau alur otomatis) akan **mengunduh APK langsung di dalam aplikasi** (bukan lagi lewat browser) lalu membuka installer sistem Android.
- **Batasan platform yang tidak bisa dilewati** (bukan kekurangan fitur ini): Android SELALU meminta satu ketukan konfirmasi terakhir dari dialog sistem "Instal aplikasi ini?" sebelum benar-benar memasang -- ini pengamanan OS, berlaku untuk semua aplikasi non-Play-Store, sepenuhnya sejalan dengan pola "update otomatis via backend, baru berfungsi setelah dikonfirmasi pengguna" seperti Windows Update.
- Bila izin "Instal aplikasi tak dikenal" belum diaktifkan untuk aplikasi ini, popup akan membuka halaman pengaturannya secara otomatis dan menuntun apa yang harus dilakukan.

## Instalasi

Unduh dan pasang `AIS-POS-Kasir-Android-v1.5.0-debug.apk`. Perangkat mungkin meminta izin "Instal aplikasi tak dikenal" untuk sumber file manager/browser yang dipakai mengunduh APK ini (khusus instalasi manual pertama kali) -- untuk pembaruan berikutnya, izin ini otomatis diminta khusus untuk aplikasi AIS POS Kasir sendiri.
