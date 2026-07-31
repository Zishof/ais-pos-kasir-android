/**
 * offline-queue.js -- Antrean transaksi offline-first via IndexedDB (tersedia native di WebView
 * Capacitor, tanpa plugin tambahan) -- padanan Android dari {@code local-db.js} (SQLite, Desktop) dan
 * {@code ais_pos_offline.js} (IndexedDB, versi web) -- KETIGANYA memakai prinsip yang SAMA: "tulis
 * lokal DULU, baru coba kirim ke server" -- SETIAP transaksi (online maupun offline) ditulis ke sini
 * lebih dulu berstatus PENDING sebelum dicoba dikirim, supaya transaksi yang baru diklik "Bayar" tetap
 * aman tersimpan walau aplikasi/koneksi mati SEBELUM sempat dapat konfirmasi server. Baris TIDAK
 * PERNAH dihapus setelah sinkron -- hanya ditandai SYNCED (riwayat permanen, dipakai layar "Riwayat
 * Sinkronisasi" nanti).
 *
 * Idempotent lewat {@code clientTrxId} sbg primary key -- server sudah punya UNIQUE constraint pada
 * kode transaksi (lihat KantinHelper.bayar), jadi kirim ulang transaksi yg SEBENARNYA sudah pernah
 * sukses (mis. balasan pertama tak sempat diterima krn koneksi putus tepat setelah server commit)
 * dibalas "duplicate key" -- dianggap SUKSES di sini (bukan error), bukan menduplikasi transaksi.
 */
(function (global) {
    'use strict';

    var DB_NAME = 'ais_pos_offline_v1';
    // WAJIB SAMA PERSIS dgn DB_VERSION di sesi-kas-offline.js (database SAMA, dibagi dua berkas
    // independen) -- lihat JavaDoc bukaDb() di bawah utk kronologi bug yg ditimbulkan saat dua versi
    // berbeda pernah dipakai (2 vs 1) di sini.
    var DB_VERSION = 2;
    var STORE = 'transaksi';
    var dbPromise = null;

    /**
     * SEBELUMNYA berkas ini membuka database di versi 1 (hardcoded) sedangkan {@code
     * sesi-kas-offline.js} membuka DATABASE YANG SAMA ({@code ais_pos_offline_v1}) di versi 2 --
     * KEDUANYA independen, tanpa saling tahu. Begitu kedua koneksi terbuka di sesi yang sama (skenario
     * NORMAL: {@code segarkanBadgeSinkron()} @ app.js membuka koneksi v1 lewat berkas ini SEGERA
     * setelah login, lalu {@code cekSesiKas()} membuka koneksi v2 lewat sesi-kas-offline.js beberapa
     * saat kemudian), permintaan open v2 memicu upaya UPGRADE pada koneksi v1 yang MASIH TERBUKA --
     * spesifikasi IndexedDB mewajibkan koneksi lama menutup diri lewat {@code onversionchange}, TAPI
     * berkas ini TIDAK PERNAH mendaftarkan handler itu, jadi koneksi v1 tidak pernah menutup diri, dan
     * permintaan open v2 macet di status "blocked" SELAMANYA ({@code onblocked} juga tidak ditangani
     * di sesi-kas-offline.js) -- {@code await} pemanggilnya TIDAK PERNAH selesai, membuat SELURUH alur
     * masuk aplikasi ({@code masukKeAplikasi} di app.js) macet permanen di "Memuat katalog..." (gejala
     * lapangan: layar muat tak pernah hilang, TANPA error apa pun di log server, krn permintaan ke
     * server yg seharusnya menyusul -- {@code sesi_kas_status} -- tidak pernah sempat terkirim).
     *
     * <p><b>Perbaikan:</b> (1) versi database DISAMAKAN dgn sesi-kas-offline.js (konstanta di atas),
     * (2) {@code onupgradeneeded} di sini SEKARANG defensif membuat KEDUA object store (bukan cuma
     * {@code STORE} milik berkas ini) persis seperti sesi-kas-offline.js, supaya database tetap benar
     * lengkap terlepas dari berkas MANA yang kebetulan menjadi yang PERTAMA membuka koneksi di sesi
     * ini, (3) {@code onversionchange} SEKARANG menutup koneksi begitu diminta upgrade dari tempat
     * lain, dan (4) {@code onblocked} SEKARANG menolak (reject) permintaan alih-alih membiarkannya
     * menggantung tanpa batas -- kombinasi (3)+(4) memastikan skenario serupa di masa depan (mis. versi
     * database dinaikkan lagi nanti) GAGAL CEPAT dgn pesan jelas, bukan macet diam-diam selamanya.</p>
     */
    function bukaDb() {
        if (dbPromise) return dbPromise;
        dbPromise = new Promise(function (resolve, reject) {
            if (!global.indexedDB) { reject(new Error('IndexedDB tidak tersedia di perangkat ini.')); return; }
            var req = global.indexedDB.open(DB_NAME, DB_VERSION);
            req.onupgradeneeded = function (ev) {
                var db = ev.target.result;
                if (!db.objectStoreNames.contains(STORE)) {
                    var os = db.createObjectStore(STORE, { keyPath: 'clientTrxId' });
                    os.createIndex('status', 'status', { unique: false });
                }
                if (!db.objectStoreNames.contains('sesi_kas')) {
                    var osSesiKas = db.createObjectStore('sesi_kas', { keyPath: 'kode' });
                    osSesiKas.createIndex('status', 'status', { unique: false });
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

    /** Tulis SATU transaksi baru berstatus PENDING -- SELALU langkah pertama sebelum kirim ke server. */
    async function simpanBaru(payload) {
        var db = await bukaDb();
        return new Promise(function (resolve, reject) {
            var tx = db.transaction(STORE, 'readwrite');
            tx.objectStore(STORE).put({
                clientTrxId: payload.clientTrxId,
                payload: payload,
                status: 'PENDING',
                waktu: payload.waktu,
                total: payload.total,
                disimpanPada: new Date().toISOString(),
                disinkronPada: null,
                pesanError: null
            });
            tx.oncomplete = function () { resolve(); };
            tx.onerror = function () { reject(tx.error); };
        });
    }

    async function ubahBaris(clientTrxId, ubah) {
        var db = await bukaDb();
        return new Promise(function (resolve, reject) {
            var tx = db.transaction(STORE, 'readwrite');
            var store = tx.objectStore(STORE);
            var req = store.get(clientTrxId);
            req.onsuccess = function () {
                var row = req.result;
                if (row) { ubah(row); store.put(row); }
            };
            tx.oncomplete = function () { resolve(); };
            tx.onerror = function () { reject(tx.error); };
        });
    }

    function tandaiSinkron(clientTrxId) {
        return ubahBaris(clientTrxId, function (row) {
            row.status = 'SYNCED';
            row.disinkronPada = new Date().toISOString();
            row.pesanError = null;
        });
    }

    function tandaiGagal(clientTrxId, pesan) {
        return ubahBaris(clientTrxId, function (row) {
            row.pesanError = String(pesan || '').slice(0, 500);
        });
    }

    async function listPending() {
        var db = await bukaDb();
        return new Promise(function (resolve, reject) {
            var tx = db.transaction(STORE, 'readonly');
            var idx = tx.objectStore(STORE).index('status');
            var req = idx.getAll('PENDING');
            req.onsuccess = function () { resolve(req.result || []); };
            req.onerror = function () { reject(req.error); };
        });
    }

    /** @return {Promise<Array>} SELURUH baris (PENDING+SYNCED), terbaru dulu -- dipakai layar Riwayat Sinkronisasi. */
    async function listSemua() {
        var db = await bukaDb();
        return new Promise(function (resolve, reject) {
            var tx = db.transaction(STORE, 'readonly');
            var req = tx.objectStore(STORE).getAll();
            req.onsuccess = function () {
                var rows = req.result || [];
                rows.sort(function (a, b) { return (b.disimpanPada || '').localeCompare(a.disimpanPada || ''); });
                resolve(rows);
            };
            req.onerror = function () { reject(req.error); };
        });
    }

    async function hitungPending() {
        try { return (await listPending()).length; } catch (e) { return 0; }
    }

    var sedangSinkron = false;
    /**
     * Coba kirim SEMUA transaksi PENDING ke server satu per satu -- BERHENTI (bukan terus mencoba
     * sisanya) begitu SATU transaksi gagal krn offline/timeout, supaya tidak membuang percobaan
     * berulang kalau memang belum ada koneksi sama sekali (akan dicoba lagi otomatis lain kali).
     * Transaksi yang DITOLAK server krn alasan lain (bukan soal koneksi) tetap PENDING (pesanError
     * dicatat utk ditinjau admin) -- TIDAK dianggap sukses begitu saja.
     * @return {Promise<{ok:boolean, berhasil:number, gagal:number, pesan?:string}>}
     */
    async function sinkronkanSemua() {
        if (sedangSinkron) return { ok: false, berhasil: 0, gagal: 0, pesan: 'Sinkronisasi sedang berjalan.' };
        sedangSinkron = true;
        var berhasil = 0, gagal = 0;
        try {
            var daftar = await listPending();
            for (var i = 0; i < daftar.length; i++) {
                var row = daftar[i];
                try {
                    var r = await global.AisApi.panggil('bayar', row.payload);
                    if (r.status === 'success' || r.kode === 'DUPLIKAT_KODE_TRANSAKSI') {
                        await tandaiSinkron(row.clientTrxId);
                        berhasil++;
                    } else {
                        await tandaiGagal(row.clientTrxId, r.message || r.description || 'Ditolak server.');
                        gagal++;
                    }
                } catch (e) {
                    if (e && (e.offline || e.timeout)) break; // masih offline -- hentikan, coba lagi nanti
                    await tandaiGagal(row.clientTrxId, e && e.message ? e.message : String(e));
                    gagal++;
                }
            }
        } finally {
            sedangSinkron = false;
        }
        return { ok: true, berhasil: berhasil, gagal: gagal };
    }

    /** Dipanggil sekali stlh masuk ke Kasir -- sinkron otomatis saat koneksi pulih + jaring pengaman berkala. */
    function mulaiAutoSync() {
        global.addEventListener('online', function () { sinkronkanSemua(); });
        setInterval(function () { sinkronkanSemua(); }, 30000);
    }

    global.OfflineQueue = {
        simpanBaru: simpanBaru,
        tandaiSinkron: tandaiSinkron,
        tandaiGagal: tandaiGagal,
        listPending: listPending,
        listSemua: listSemua,
        hitungPending: hitungPending,
        sinkronkanSemua: sinkronkanSemua,
        mulaiAutoSync: mulaiAutoSync
    };
})(window);
