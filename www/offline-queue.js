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
    var STORE = 'transaksi';
    var dbPromise = null;

    function bukaDb() {
        if (dbPromise) return dbPromise;
        dbPromise = new Promise(function (resolve, reject) {
            if (!global.indexedDB) { reject(new Error('IndexedDB tidak tersedia di perangkat ini.')); return; }
            var req = global.indexedDB.open(DB_NAME, 1);
            req.onupgradeneeded = function (ev) {
                var db = ev.target.result;
                if (!db.objectStoreNames.contains(STORE)) {
                    var os = db.createObjectStore(STORE, { keyPath: 'clientTrxId' });
                    os.createIndex('status', 'status', { unique: false });
                }
            };
            req.onsuccess = function () { resolve(req.result); };
            req.onerror = function () { reject(req.error); };
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
