/**
 * excel-produk-parser.js -- Parser LOKAL (browser, WebView) utk file Excel katalog produk "Format
 * Accurate" ("Daftar Barang dan Jasa"). SALINAN PERSIS dari
 * {@code desktop-pos-electron/excel-produk-parser.js} (Node/Electron) -- port dari algoritma server
 * {@code KantinHelper.deteksiKolomExcelProdukFormatAccurate} (Java, lihat JavaDoc di sana). Gap-
 * closure permintaan user: "file excel dibaca di local (android/desktop) saja, tidak perlu
 * mengirimkan data ke server dulu, setelah proses simpan, baru dikirimkan ke server". Dipakai
 * bersama {@code SheetJS} (global {@code XLSX}, lihat {@code vendor/xlsx.core.min.js}).
 *
 * TIDAK melakukan deteksi per-kolom apa pun (permintaan eksplisit user) -- begitu baris header
 * ditemukan (baris yg punya sel PERSIS "Kode" DAN sel lain mengandung "Barcode"), field dibaca dari
 * POSISI ABSOLUT: C(2)=No, D(3)=Kode, E(4)=Barcode, F(5)=Kategori, G(6)=Nama Barang, H(7)=Pemasok,
 * I(8)=Satuan, J(9)=Kts (stok), K(10)=Def. Hrg. Jual Sa (harga jual), L(11)=Nilai Satuan (harga
 * beli). M(12)=Nilai Total SENGAJA tidak dibaca (dihitung ulang, bukan disimpan).
 */
(function (global) {
    'use strict';

    function cellToText(v) {
        if (v === undefined || v === null) return '';
        if (typeof v === 'number') return String(v);
        return String(v).trim();
    }

    function parseAngkaAman(v) {
        var s = cellToText(v);
        if (!s) return 0;
        var bersih = s.replace(/,/g, '').replace(/[^0-9.\-]/g, '');
        if (!bersih || bersih === '-' || bersih === '.') return 0;
        var n = parseFloat(bersih);
        return isNaN(n) ? 0 : n;
    }

    /**
     * @param {ArrayBuffer} arrayBuffer isi berkas .xlsx
     * @return {{ok:boolean, pesan?:string, baris?:Array, kategoriDariFile?:string[], pemasokDariFile?:string[], satuanDariFile?:string[]}}
     */
    function parseExcelProdukFormatAccurate(arrayBuffer) {
        if (!global.XLSX) return { ok: false, pesan: 'Pustaka pembaca Excel tidak termuat.' };
        var wb;
        try {
            wb = global.XLSX.read(arrayBuffer, { type: 'array' });
        } catch (e) {
            return { ok: false, pesan: 'File Excel tidak valid atau rusak: ' + (e && e.message ? e.message : e) };
        }
        var namaSheet = wb.SheetNames[0];
        if (!namaSheet) return { ok: false, pesan: 'File Excel tidak berisi sheet apa pun.' };
        var sheet = wb.Sheets[namaSheet];
        var rows2d = global.XLSX.utils.sheet_to_json(sheet, { header: 1, raw: true, defval: '' });

        var batasBaris = Math.min(20, rows2d.length - 1);
        var barisHeader = -1;
        for (var r = 0; r <= batasBaris; r++) {
            var row = rows2d[r] || [];
            var adaKode = false, adaBarcode = false;
            for (var c = 0; c < row.length; c++) {
                var isi = cellToText(row[c]).toUpperCase();
                if (isi === 'KODE') adaKode = true;
                if (isi.indexOf('BARCODE') >= 0) adaBarcode = true;
            }
            if (adaKode && adaBarcode) { barisHeader = r; break; }
        }
        if (barisHeader < 0) {
            return { ok: false, pesan: 'Format Excel tidak dikenali -- baris header ("Kode" + "UPC/Barcode") tidak ditemukan di 20 baris pertama.' };
        }

        var KOL_NO = 2, KOL_KODE = 3, KOL_BARCODE = 4, KOL_KATEGORI = 5, KOL_NAMA = 6,
            KOL_PEMASOK = 7, KOL_SATUAN = 8, KOL_STOK = 9, KOL_HARGA_JUAL = 10, KOL_HARGA_BELI = 11;

        var baris = [];
        var setKategori = {}, setPemasok = {}, setSatuan = {};
        var no = 0;
        for (var i = barisHeader + 1; i < rows2d.length; i++) {
            var rw = rows2d[i] || [];
            if (rw.length === 0) continue;
            var noTeks = cellToText(rw[KOL_NO]).toUpperCase();
            if (noTeks.indexOf('TOTAL') >= 0) break;
            var kode = cellToText(rw[KOL_KODE]);
            var nama = cellToText(rw[KOL_NAMA]);
            if (!kode || !nama) continue;
            no++;
            var kategoriNama = cellToText(rw[KOL_KATEGORI]);
            var pemasokNama = cellToText(rw[KOL_PEMASOK]);
            var satuanNama = cellToText(rw[KOL_SATUAN]);
            if (kategoriNama) setKategori[kategoriNama] = true;
            if (pemasokNama) setPemasok[pemasokNama] = true;
            if (satuanNama) setSatuan[satuanNama] = true;
            baris.push({
                no: no, kode: kode, barcode: cellToText(rw[KOL_BARCODE]), nama: nama,
                kategoriNama: kategoriNama, pemasokNama: pemasokNama, satuanNama: satuanNama,
                stokBaru: parseAngkaAman(rw[KOL_STOK]),
                hargaJual: parseAngkaAman(rw[KOL_HARGA_JUAL]),
                hargaBeli: parseAngkaAman(rw[KOL_HARGA_BELI])
            });
        }

        return {
            ok: true,
            baris: baris,
            kategoriDariFile: Object.keys(setKategori).sort(),
            pemasokDariFile: Object.keys(setPemasok).sort(),
            satuanDariFile: Object.keys(setSatuan).sort()
        };
    }

    global.ExcelProdukParser = { parseExcelProdukFormatAccurate: parseExcelProdukFormatAccurate };
})(window);
