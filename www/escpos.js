/**
 * escpos.js -- pembangun perintah ESC/POS mentah + jembatan cetak Bluetooth (Classic/SPP).
 *
 * KENAPA BUKAN Web Bluetooth (navigator.bluetooth)?
 * Printer thermal kasir (semua merk umum: EPPOS, Xprinter, POS-58/80, dst) bicara lewat profil
 * Bluetooth KLASIK "Serial Port Profile" (SPP/RFCOMM) -- BUKAN Bluetooth Low Energy (BLE). Web
 * Bluetooth browser (dan juga API BLE Capacitor) HANYA bisa bicara ke perangkat BLE (GATT), jadi
 * TIDAK BISA dipakai sama sekali utk printer jenis ini, betapa pun modern browsernya. Karena itu
 * plugin native {@code cordova-plugin-bluetooth-serial} (kompatibel Capacitor lewat lapisan Cordova)
 * dipakai di sini -- ini satu-satunya jalan realistis tanpa menulis plugin native dari nol.
 *
 * CATATAN PENTING: kode di berkas ini TIDAK bisa diuji end-to-end di lingkungan pengembangan ini
 * (tidak ada perangkat Android/printer fisik tersambung) -- perintah ESC/POS mengikuti spesifikasi
 * standar yang dipakai luas (identik dgn yg dipakai puluhan aplikasi kasir sejenis), tapi WAJIB
 * diuji dengan printer fisik sebelum dipakai produksi. Lihat README.md bagian "Uji Coba Diperlukan".
 */
(function (global) {
    'use strict';

    var ESC = 0x1B, GS = 0x1D;

    function bytesFromString(str) {
        // Printer thermal umumnya CP437/kode-halaman lokal utk karakter non-ASCII; kita batasi ke
        // ASCII-safe (ganti karakter di luar itu dgn '?') supaya tidak perlu tabel kode-halaman
        // penuh -- cukup utk struk kasir kantin/koperasi yang isinya didominasi Bahasa Indonesia
        // tanpa diakritik. Baris yang butuh presisi typografi penuh tetap bisa dibaca dari histori
        // transaksi di aplikasi/​layar Ringkasan.
        var out = [];
        for (var i = 0; i < str.length; i++) {
            var c = str.charCodeAt(i);
            out.push(c > 126 || c < 9 ? 63 /* '?' */ : c);
        }
        return out;
    }

    function repeat(ch, n) {
        var s = '';
        for (var i = 0; i < n; i++) s += ch;
        return s;
    }

    /** Potong/rata-kanan teks ke lebar kolom tetap (dipakai baris item/total struk). */
    function rataKolom(kiri, kanan, lebar) {
        kiri = String(kiri == null ? '' : kiri);
        kanan = String(kanan == null ? '' : kanan);
        var sisa = lebar - kiri.length - kanan.length;
        if (sisa < 1) {
            kiri = kiri.substring(0, Math.max(0, lebar - kanan.length - 1));
            sisa = lebar - kiri.length - kanan.length;
        }
        return kiri + repeat(' ', Math.max(1, sisa)) + kanan;
    }

    /**
     * Bangun buffer byte ESC/POS lengkap untuk satu struk transaksi.
     * @param {{tokoNama:string, alamat?:string, kode:string, waktu:string, kasir?:string,
     *          metode:string, items:Array<{nama:string, jumlah:number, harga:number}>,
     *          subtotal:number, pajak?:number, total:number, diterima?:number, kembalian?:number,
     *          lebarKertas?:number}} data lebarKertas dlm karakter (32 utk 58mm, 48 utk 80mm; def 32).
     * @return {Uint8Array}
     */
    function bangunStruk(data) {
        var lebar = data.lebarKertas || 32;
        var bytes = [];
        function push() { for (var i = 0; i < arguments.length; i++) bytes.push(arguments[i]); }
        function teks(s) { bytes = bytes.concat(bytesFromString(s)); }
        function baris(s) { teks(s); push(0x0A); }

        push(ESC, 0x40); // reset/init
        push(ESC, 0x61, 0x01); // rata tengah
        push(ESC, 0x45, 0x01); // bold on
        baris(data.tokoNama || 'AIS Kasir');
        push(ESC, 0x45, 0x00); // bold off
        if (data.alamat) baris(data.alamat);
        baris(repeat('-', lebar));
        push(ESC, 0x61, 0x00); // rata kiri
        baris('No: ' + (data.kode || '-'));
        baris(data.waktu || '');
        if (data.kasir) baris('Kasir: ' + data.kasir);
        baris(repeat('-', lebar));

        (data.items || []).forEach(function (it) {
            baris(it.nama || '-');
            var subJml = (it.jumlah || 0) + ' x ' + formatRupiahPolos(it.harga || 0);
            var subTotal = formatRupiahPolos((it.jumlah || 0) * (it.harga || 0));
            baris(rataKolom(subJml, subTotal, lebar));
        });

        baris(repeat('-', lebar));
        baris(rataKolom('Subtotal', formatRupiahPolos(data.subtotal || 0), lebar));
        if (data.pajak) baris(rataKolom('Pajak', formatRupiahPolos(data.pajak), lebar));
        push(ESC, 0x45, 0x01);
        baris(rataKolom('TOTAL', formatRupiahPolos(data.total || 0), lebar));
        push(ESC, 0x45, 0x00);
        baris('Metode: ' + (data.metode || '-'));
        if (data.diterima != null) baris(rataKolom('Diterima', formatRupiahPolos(data.diterima), lebar));
        if (data.kembalian != null) baris(rataKolom('Kembalian', formatRupiahPolos(data.kembalian), lebar));

        baris(repeat('-', lebar));
        push(ESC, 0x61, 0x01);
        baris('Terima kasih!');
        push(0x0A, 0x0A, 0x0A);
        push(GS, 0x56, 0x01); // potong kertas (partial cut) -- printer tanpa auto-cutter mengabaikan ini dgn aman

        return new Uint8Array(bytes);
    }

    function formatRupiahPolos(n) {
        n = Math.round(Number(n) || 0);
        return n.toLocaleString('id-ID');
    }

    /** @return {boolean} true bila plugin bluetoothSerial (Cordova-compat) tersedia di runtime ini. */
    function tersedia() {
        return typeof global.bluetoothSerial !== 'undefined';
    }

    /** @return {Promise<Array<{name:string, address:string}>>} daftar perangkat Bluetooth yg SUDAH di-pairing OS -- printer thermal wajib di-pairing dulu lewat Pengaturan Android sebelum muncul di sini (batasan plugin, bukan bug aplikasi). */
    function daftarPerangkat() {
        return new Promise(function (resolve, reject) {
            if (!tersedia()) { reject(new Error('Plugin Bluetooth tidak tersedia (bukan build Android, atau plugin belum ter-sync).')); return; }
            global.bluetoothSerial.list(resolve, reject);
        });
    }

    /** @param {string} address MAC address perangkat (dari {@link daftarPerangkat}). @return {Promise<void>} */
    function sambungkan(address) {
        return new Promise(function (resolve, reject) {
            global.bluetoothSerial.connect(address, resolve, reject);
        });
    }

    function putuskan() {
        return new Promise(function (resolve) {
            if (!tersedia()) { resolve(); return; }
            global.bluetoothSerial.disconnect(resolve, resolve);
        });
    }

    /** Kirim buffer struk (dari {@link bangunStruk}) ke printer yang SUDAH tersambung ({@link sambungkan}). */
    function cetak(bytesUint8Array) {
        return new Promise(function (resolve, reject) {
            if (!tersedia()) { reject(new Error('Plugin Bluetooth tidak tersedia.')); return; }
            global.bluetoothSerial.write(bytesUint8Array.buffer, resolve, reject);
        });
    }

    global.EscPos = {
        bangunStruk: bangunStruk,
        tersedia: tersedia,
        daftarPerangkat: daftarPerangkat,
        sambungkan: sambungkan,
        putuskan: putuskan,
        cetak: cetak
    };
})(window);
