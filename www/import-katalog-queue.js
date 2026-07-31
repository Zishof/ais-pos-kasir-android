/**
 * import-katalog-queue.js -- Antrean "Unggah Excel" (layar Produk, khusus supervisor) offline-first
 * via IndexedDB, TERPISAH dari {@code offline-queue.js} (yg khusus transaksi Kasir) dgn database
 * sendiri -- prinsipnya SAMA ("tulis lokal DULU, baru coba kirim ke server") tapi bentuk datanya beda
 * (baris hasil tinjauan Excel yg sudah di-parse & mungkin diedit pengguna, bisa cukup besar, bukan
 * transaksi kecil per baris) sehingga disengaja TIDAK dipaksa masuk ke store yang sama supaya tidak
 * mengganggu antrean transaksi yang jauh lebih kritis (uang) kalau ada masalah di sini. Padanan
 * Android dari {@code import_katalog_pending} (SQLite, Desktop) -- lihat JavaDoc lengkap di sana soal
 * alasan desainnya.
 *
 * Android SEKARANG PUNYA langkah "Tinjau Impor" terpisah spt Desktop (gap-closure) -- alur: (1)
 * berkas Excel dibaca & dikirim ke {@code produk_impor_excel_preview} (baca-saja, MURNI perlu
 * koneksi, TIDAK offline-first krn belum ada apa pun yg perlu diamankan -- gagal/offline di tahap ini
 * cuma berarti "coba lagi nanti", bukan kehilangan data), (2) pengguna meninjau/mengedit baris hasil
 * parse di layar Tinjau Impor, (3) BARU setelah menekan "Simpan & Kirim" baris yg (mungkin sudah
 * diedit) itu yg disimpan offline-first ke sini (bukan lagi berkas mentah) & dikirim ke {@code
 * produk_impor_excel_komit}. Ini SELARAS dgn Desktop yg juga hanya membuat langkah KOMIT
 * offline-first, bukan langkah PRATINJAU (lihat main.js `pos:produk-komit-excel` vs pratinjau biasa).
 */
(function (global) {
    'use strict';

    var DB_NAME = 'ais_pos_katalog_import_v1';
    var STORE = 'batch';
    var dbPromise = null;

    function bukaDb() {
        if (dbPromise) return dbPromise;
        dbPromise = new Promise(function (resolve, reject) {
            if (!global.indexedDB) { reject(new Error('IndexedDB tidak tersedia di perangkat ini.')); return; }
            var req = global.indexedDB.open(DB_NAME, 1);
            req.onupgradeneeded = function (ev) {
                var db = ev.target.result;
                if (!db.objectStoreNames.contains(STORE)) {
                    var os = db.createObjectStore(STORE, { keyPath: 'id' });
                    os.createIndex('status', 'status', { unique: false });
                }
            };
            req.onsuccess = function () { resolve(req.result); };
            req.onerror = function () { reject(req.error); };
        });
        return dbPromise;
    }

    /** Tulis SATU batch baru berstatus PENDING -- SELALU langkah pertama sebelum kirim ke server (setelah pengguna menekan "Simpan & Kirim" di layar Tinjau Impor). @param {{id:string, namaBerkas:string, baris:object[], tokoId:(number|string|null)}} batch */
    async function simpanBaru(batch) {
        var db = await bukaDb();
        return new Promise(function (resolve, reject) {
            var tx = db.transaction(STORE, 'readwrite');
            tx.objectStore(STORE).put({
                id: batch.id,
                namaBerkas: batch.namaBerkas || 'katalog.xlsx',
                baris: batch.baris,
                tokoId: batch.tokoId != null ? batch.tokoId : null,
                status: 'PENDING',
                hasil: null,
                pesanError: null,
                disimpanPada: new Date().toISOString(),
                disinkronPada: null
            });
            tx.oncomplete = function () { resolve(); };
            tx.onerror = function () { reject(tx.error); };
        });
    }

    async function ubahBaris(id, ubah) {
        var db = await bukaDb();
        return new Promise(function (resolve, reject) {
            var tx = db.transaction(STORE, 'readwrite');
            var store = tx.objectStore(STORE);
            var req = store.get(id);
            req.onsuccess = function () {
                var row = req.result;
                if (row) { ubah(row); store.put(row); }
            };
            tx.oncomplete = function () { resolve(); };
            tx.onerror = function () { reject(tx.error); };
        });
    }

    function tandaiSinkron(id, hasil) {
        return ubahBaris(id, function (row) {
            row.status = 'SYNCED';
            row.hasil = hasil || null;
            row.disinkronPada = new Date().toISOString();
            row.pesanError = null;
        });
    }

    function tandaiGagal(id, pesan) {
        return ubahBaris(id, function (row) { row.pesanError = String(pesan || '').slice(0, 500); });
    }

    async function ambil(id) {
        var db = await bukaDb();
        return new Promise(function (resolve, reject) {
            var tx = db.transaction(STORE, 'readonly');
            var req = tx.objectStore(STORE).get(id);
            req.onsuccess = function () { resolve(req.result || null); };
            req.onerror = function () { reject(req.error); };
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

    var sedangSinkron = false;
    /**
     * Coba kirim SEMUA batch PENDING ke server satu per satu (aksi {@code produk_impor_excel_komit},
     * baris yg sudah ditinjau/diedit pengguna -- lihat JavaDoc file ini) -- BERHENTI begitu satu batch
     * gagal krn offline/timeout (pola SAMA PERSIS dgn {@code OfflineQueue.sinkronkanSemua}), supaya
     * tidak membuang percobaan berulang kalau memang belum ada koneksi sama sekali.
     * {@code onBatchTersinkron(batch)} dipanggil per batch yg berhasil -- dipakai app.js menampilkan
     * toast + menyegarkan daftar produk/laporan bila layar Produk sedang terbuka.
     * @param {(batch:object)=>void} [onBatchTersinkron]
     */
    async function sinkronkanSemua(onBatchTersinkron) {
        if (sedangSinkron) return { ok: false, berhasil: 0, gagal: 0 };
        sedangSinkron = true;
        var berhasil = 0, gagal = 0;
        try {
            var daftar = await listPending();
            for (var i = 0; i < daftar.length; i++) {
                var row = daftar[i];
                try {
                    var r = await global.AisApi.panggil('produk_impor_excel_komit', { baris: row.baris, toko_id: row.tokoId }, 300000);
                    if (r.status === 'success') {
                        await tandaiSinkron(row.id, r);
                        berhasil++;
                        if (typeof onBatchTersinkron === 'function') { try { onBatchTersinkron(await ambil(row.id)); } catch (eCb) { /* abaikan -- kegagalan callback tak boleh menghentikan sinkron batch lain */ } }
                    } else {
                        await tandaiGagal(row.id, r.message || r.description || 'Ditolak server.');
                        gagal++;
                    }
                } catch (e) {
                    if (e && (e.offline || e.timeout)) break; // masih offline -- hentikan, coba lagi nanti
                    await tandaiGagal(row.id, e && e.message ? e.message : String(e));
                    gagal++;
                }
            }
        } finally {
            sedangSinkron = false;
        }
        return { ok: true, berhasil: berhasil, gagal: gagal };
    }

    /** Dipanggil sekali stlh masuk ke Kasir -- sinkron otomatis saat koneksi pulih + jaring pengaman berkala. Pola SAMA PERSIS {@code OfflineQueue.mulaiAutoSync}. @param {(batch:object)=>void} [onBatchTersinkron] */
    function mulaiAutoSync(onBatchTersinkron) {
        global.addEventListener('online', function () { sinkronkanSemua(onBatchTersinkron); });
        setInterval(function () { sinkronkanSemua(onBatchTersinkron); }, 30000);
    }

    global.KatalogImportQueue = {
        simpanBaru: simpanBaru,
        tandaiSinkron: tandaiSinkron,
        tandaiGagal: tandaiGagal,
        ambil: ambil,
        listPending: listPending,
        sinkronkanSemua: sinkronkanSemua,
        mulaiAutoSync: mulaiAutoSync
    };
})(window);
