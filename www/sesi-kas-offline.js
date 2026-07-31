/**
 * sesi-kas-offline.js -- "Sesi Kasir OFFLINE-FIRST" via IndexedDB, padanan Android dari
 * {@code local-db.js} (SQLite, Desktop) yg sudah lebih dulu dibangun ulang total dgn prinsip yang
 * SAMA setelah bug lapangan berkepanjangan: layar "Kas Belum Dibuka" macet menampilkan tertutup
 * walau server SUDAH mencatat sesi sukses (akar masalah akhirnya ditemukan murni di sisi server --
 * interceptor audit menimpa identitas kasir sebelum baris tersimpan -- tapi gejalanya membuktikan
 * satu hal jelas: status kas TIDAK BOLEH bergantung pada round-trip server tiap kali ditanya).
 *
 * <p>Status/Buka/Tutup SEKARANG dijawab SEKETIKA dari tabel lokal ini -- kasir bisa lanjut jualan
 * tanpa menunggu jaringan sama sekali, termasuk saat benar-benar offline. Sinkron ke server
 * ({@code sesi_kas_buka}/{@code sesi_kas_tutup}, idempoten lewat {@code kode} yg SAMA -- lihat
 * javadoc server {@code KantinHelper.sesiKasBuka}) berjalan di LATAR: segera setelah buka/tutup
 * (best-effort, TIDAK PERNAH memblokir kasir) dan berkala (lihat {@link #mulaiAutoSync}, pola SAMA
 * persis dgn {@code OfflineQueue.mulaiAutoSync} transaksi) selama app terbuka.</p>
 *
 * <p>{@code totalTunai}/{@code totalNonTunai}/{@code selisih} SENGAJA tidak pernah dihitung sendiri
 * di klien -- angka itu HARUS dihitung server dari SELURUH transaksi toko yg tercatat resmi, bukan
 * cuma yg kebetulan terlihat di perangkat ini. Selama belum sinkron, {@code kasSaatIni = modalAwal}
 * apa adanya (bukan tebakan) + penanda {@code belumSinkron:true}.</p>
 */
(function (global) {
    'use strict';

    var DB_NAME = 'ais_pos_offline_v1'; // SAMA dgn offline-queue.js -- satu database, object store berbeda (upgrade version menambah store baru tanpa mengganggu store 'transaksi' yg sudah ada)
    var DB_VERSION = 2; // dinaikkan dari versi offline-queue.js (1) supaya onupgradeneeded ini jalan menambah store baru pada database yg SUDAH ada
    var STORE = 'sesi_kas';
    var dbPromise = null;

    /**
     * WAJIB SAMA PERSIS dgn DB_VERSION di offline-queue.js (database SAMA, dibagi dua berkas
     * independen) -- lihat JavaDoc panjang di bukaDb() offline-queue.js utk kronologi bug macet-total
     * "Memuat katalog..." yg ditimbulkan saat kedua berkas ini pernah memakai versi berbeda (2 vs 1).
     * {@code onversionchange}/{@code onblocked} di bawah adalah lapis pertahanan KEDUA (offline-queue.js
     * punya yang sama) -- kalau suatu saat versi kembali tak sinkron krn kelalaian, kegagalan akan
     * CEPAT & JELAS (reject dgn pesan), bukan menggantung tanpa batas seperti sebelumnya.
     */
    function bukaDb() {
        if (dbPromise) return dbPromise;
        dbPromise = new Promise(function (resolve, reject) {
            if (!global.indexedDB) { reject(new Error('IndexedDB tidak tersedia di perangkat ini.')); return; }
            var req = global.indexedDB.open(DB_NAME, DB_VERSION);
            req.onupgradeneeded = function (ev) {
                var db = ev.target.result;
                if (!db.objectStoreNames.contains('transaksi')) {
                    var osTrx = db.createObjectStore('transaksi', { keyPath: 'clientTrxId' });
                    osTrx.createIndex('status', 'status', { unique: false });
                }
                if (!db.objectStoreNames.contains(STORE)) {
                    var os = db.createObjectStore(STORE, { keyPath: 'kode' });
                    os.createIndex('status', 'status', { unique: false });
                }
            };
            req.onsuccess = function () {
                var db = req.result;
                db.onversionchange = function () { db.close(); dbPromise = null; };
                resolve(db);
            };
            req.onerror = function () { dbPromise = null; reject(req.error); };
            req.onblocked = function () {
                dbPromise = null;
                reject(new Error('Basis data lokal sedang dipakai koneksi lain yang belum menutup diri -- tutup & buka ulang aplikasi.'));
            };
        });
        return dbPromise;
    }

    function bacaSatu(kode) {
        return bukaDb().then(function (db) {
            return new Promise(function (resolve, reject) {
                var tx = db.transaction(STORE, 'readonly');
                var req = tx.objectStore(STORE).get(kode);
                req.onsuccess = function () { resolve(req.result || null); };
                req.onerror = function () { reject(req.error); };
            });
        });
    }

    function tulisSatu(row) {
        return bukaDb().then(function (db) {
            return new Promise(function (resolve, reject) {
                var tx = db.transaction(STORE, 'readwrite');
                tx.objectStore(STORE).put(row);
                tx.oncomplete = function () { resolve(); };
                tx.onerror = function () { reject(tx.error); };
            });
        });
    }

    function ubahBaris(kode, ubah) {
        return bukaDb().then(function (db) {
            return new Promise(function (resolve, reject) {
                var tx = db.transaction(STORE, 'readwrite');
                var store = tx.objectStore(STORE);
                var req = store.get(kode);
                req.onsuccess = function () {
                    var row = req.result;
                    if (row) { ubah(row); store.put(row); }
                };
                tx.oncomplete = function () { resolve(); };
                tx.onerror = function () { reject(tx.error); };
            });
        });
    }

    /** @return {Promise<object|null>} sesi TERBUKA (status='BUKA') milik toko ini, atau null. Inilah SATU-SATUNYA sumber "apakah kas terbuka" -- lihat JavaDoc kelas. */
    async function sesiAktifLokal(tokoId) {
        var db = await bukaDb();
        var semua = await new Promise(function (resolve, reject) {
            var tx = db.transaction(STORE, 'readonly');
            var req = tx.objectStore(STORE).index('status').getAll('BUKA');
            req.onsuccess = function () { resolve(req.result || []); };
            req.onerror = function () { reject(req.error); };
        });
        var cocok = semua.filter(function (s) { return (s.tokoId == null && tokoId == null) || s.tokoId === tokoId; });
        if (cocok.length === 0) return null;
        cocok.sort(function (a, b) { return (b.waktuBuka || '').localeCompare(a.waktuBuka || ''); });
        return cocok[0];
    }

    function buatKode() {
        return 'SESI-' + Date.now() + '-' + Math.random().toString(36).slice(2, 10);
    }

    /** Format waktu LOKAL (BUKAN UTC -- {@code toISOString} akan salah zona waktu) sesuai yg diharapkan server (pola {@code yyyy-MM-dd'T'HH:mm}). */
    function keFormatWaktuServer(d) {
        function p(n) { return String(n).length < 2 ? '0' + n : String(n); }
        return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()) + 'T' + p(d.getHours()) + ':' + p(d.getMinutes());
    }

    /** Menulis sesi BARU status BUKA -- langkah pertama & SATU-SATUNYA yg ditunggu kasir. @return {Promise<object>} baris yg baru ditulis (berisi kode-nya). */
    async function bukaLokal(tokoId, modalAwal, keterangan) {
        var kode = buatKode();
        var row = {
            kode: kode,
            tokoId: tokoId != null ? tokoId : null,
            modalAwal: Number(modalAwal) || 0,
            keteranganBuka: keterangan || '',
            waktuBuka: keFormatWaktuServer(new Date()),
            status: 'BUKA',
            waktuTutup: null,
            uangFisik: null,
            keteranganTutup: null,
            selisih: null,
            totalTunai: null,
            totalNonTunai: null,
            tersinkronBuka: false,
            tersinkronTutup: false,
            idServer: null,
            pesanErrorSync: null,
            disimpanPada: new Date().toISOString()
        };
        await tulisSatu(row);
        return row;
    }

    /** Menutup sesi (by kode) LOKAL -- status jadi TUTUP seketika, TAPI selisih/total tunai/non-tunai SENGAJA null sampai sinkron tutup sukses (lihat JavaDoc kelas). */
    function tutupLokal(kode, uangFisik, keterangan) {
        return ubahBaris(kode, function (row) {
            row.status = 'TUTUP';
            row.waktuTutup = keFormatWaktuServer(new Date());
            row.uangFisik = Number(uangFisik) || 0;
            row.keteranganTutup = keterangan || '';
        });
    }

    function tandaiSinkronBuka(kode, idServer) {
        return ubahBaris(kode, function (row) {
            row.tersinkronBuka = true;
            row.idServer = idServer != null ? idServer : null;
            row.pesanErrorSync = null;
        });
    }

    function tandaiSinkronTutup(kode, hasilServer) {
        return ubahBaris(kode, function (row) {
            row.tersinkronTutup = true;
            row.selisih = hasilServer && hasilServer.selisih != null ? hasilServer.selisih : null;
            row.totalTunai = hasilServer && hasilServer.totalTunai != null ? hasilServer.totalTunai : null;
            row.totalNonTunai = hasilServer && hasilServer.totalNonTunai != null ? hasilServer.totalNonTunai : null;
            row.pesanErrorSync = null;
        });
    }

    function tandaiGagalSinkron(kode, pesan) {
        return ubahBaris(kode, function (row) { row.pesanErrorSync = String(pesan || '').slice(0, 500); });
    }

    async function listBelumSinkron() {
        var db = await bukaDb();
        var semua = await new Promise(function (resolve, reject) {
            var tx = db.transaction(STORE, 'readonly');
            var req = tx.objectStore(STORE).getAll();
            req.onsuccess = function () { resolve(req.result || []); };
            req.onerror = function () { reject(req.error); };
        });
        return semua.filter(function (s) { return !s.tersinkronBuka || (s.status === 'TUTUP' && !s.tersinkronTutup); });
    }

    /**
     * Sinkron SATU sesi (by kode) ke server -- kirim BUKA dulu bila belum tersinkron, baru TUTUP
     * (hanya bila status lokalnya sudah TUTUP). Idempoten (server mengecek {@code kode} lebih dulu) --
     * aman dipanggil ulang kapan pun tanpa risiko sesi dobel/hitung ganda.
     * @return {Promise<{selisih?:number}|null>}
     */
    async function sinkronkanSatu(kode) {
        var sesi = await bacaSatu(kode);
        if (!sesi) return null;

        if (!sesi.tersinkronBuka) {
            var rBuka = await global.AisApi.panggil('sesi_kas_buka', {
                id_toko: sesi.tokoId,
                modal_awal: sesi.modalAwal,
                keterangan: sesi.keteranganBuka,
                kode: sesi.kode,
                waktu_buka: sesi.waktuBuka
            });
            if (rBuka.status !== 'success') {
                await tandaiGagalSinkron(kode, pesanDariRespons(rBuka, 'Gagal sinkron buka kas.'));
                return null;
            }
            await tandaiSinkronBuka(kode, rBuka.id_server);
            sesi.tersinkronBuka = true;
        }

        if (sesi.status !== 'TUTUP' || sesi.tersinkronTutup) return null;

        var rTutup = await global.AisApi.panggil('sesi_kas_tutup', {
            id_toko: sesi.tokoId,
            uang_fisik: sesi.uangFisik,
            keterangan: sesi.keteranganTutup,
            kode: sesi.kode,
            waktu_tutup: sesi.waktuTutup
        });
        if (rTutup.status !== 'success') {
            await tandaiGagalSinkron(kode, pesanDariRespons(rTutup, 'Gagal sinkron tutup kas.'));
            return null;
        }
        await tandaiSinkronTutup(kode, { selisih: rTutup.selisih, totalTunai: rTutup.totalTunai, totalNonTunai: rTutup.totalNonTunai });
        return { selisih: rTutup.selisih };
    }

    function pesanDariRespons(r, fallback) {
        return (r && (r.message || r.description)) || fallback;
    }

    var sedangSinkron = false;
    /** Sinkron SEMUA sesi yg belum tuntas -- dipanggil setelah buka/tutup (segera, best-effort) DAN berkala (lihat {@link #mulaiAutoSync}). */
    async function sinkronkanSemua() {
        if (sedangSinkron) return;
        sedangSinkron = true;
        try {
            var daftar = await listBelumSinkron();
            for (var i = 0; i < daftar.length; i++) {
                try { await sinkronkanSatu(daftar[i].kode); } catch (e) { /* satu sesi gagal tak boleh menghentikan sesi lain -- lanjut coba berikutnya */ }
            }
        } finally {
            sedangSinkron = false;
        }
    }

    /** Dipanggil sekali stlh masuk ke Kasir -- pola SAMA persis dgn {@code OfflineQueue.mulaiAutoSync}. */
    function mulaiAutoSync() {
        global.addEventListener('online', function () { sinkronkanSemua(); });
        setInterval(function () { sinkronkanSemua(); }, 30000);
    }

    global.SesiKasOffline = {
        sesiAktifLokal: sesiAktifLokal,
        bukaLokal: bukaLokal,
        tutupLokal: tutupLokal,
        sinkronkanSatu: sinkronkanSatu,
        sinkronkanSemua: sinkronkanSemua,
        mulaiAutoSync: mulaiAutoSync
    };
})(window);
