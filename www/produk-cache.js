/**
 * produk-cache.js -- Salinan LOKAL katalog produk via IndexedDB, padanan Android dari
 * {@code local-db.js produk_cache} (Desktop). Gap-closure eksplisit "pastikan jumlah dan stok
 * produk selalu sama dgn server". Database TERPISAH dari {@code offline-queue.js}/
 * {@code sesi-kas-offline.js}/{@code import-katalog-queue.js} (pola sama -- lihat JavaDoc
 * {@code bukaDb} di berkas-berkas itu soal bug nyata yg pernah terjadi krn BERBAGI database antar
 * berkas independen: koneksi macet permanen saat versi tak sinkron). Menimpa SELURUH isi cache
 * setiap sinkron (bukan upsert selektif) supaya JUMLAH baris selalu presis sama dgn katalog server
 * saat itu -- produk yg sudah dihapus/nonaktif total di server ikut hilang dari cache, tidak
 * menumpuk selamanya.
 */
(function (global) {
    'use strict';

    var DB_NAME = 'ais_pos_produk_cache_v1';
    var STORE = 'produk';
    var dbPromise = null;

    function bukaDb() {
        if (dbPromise) return dbPromise;
        dbPromise = new Promise(function (resolve, reject) {
            if (!global.indexedDB) { reject(new Error('IndexedDB tidak tersedia di perangkat ini.')); return; }
            var req = global.indexedDB.open(DB_NAME, 1);
            req.onupgradeneeded = function (ev) {
                var db = ev.target.result;
                if (!db.objectStoreNames.contains(STORE)) {
                    db.createObjectStore(STORE, { keyPath: 'id' });
                }
                if (!db.objectStoreNames.contains('meta')) {
                    db.createObjectStore('meta', { keyPath: 'kunci' });
                }
            };
            req.onsuccess = function () {
                var db = req.result;
                db.onversionchange = function () { db.close(); dbPromise = null; };
                resolve(db);
            };
            req.onblocked = function () { reject(new Error('Basis data cache produk sedang dipakai koneksi lain.')); };
            req.onerror = function () { reject(req.error); };
        });
        return dbPromise;
    }

    /**
     * Menimpa SELURUH cache dgn katalog TERBARU dari server, dalam SATU transaksi (clear lalu put
     * semua baris) -- dipanggil dari tombol "Sinkronkan" manual MAUPUN siklus otomatis berkala.
     * @param {Array<object>} daftar isi {@code r.produk} dari aksi server {@code katalog}.
     * @return {Promise<{total:number, disinkronPada:string}>}
     */
    async function gantiSemuaProdukCache(daftar) {
        daftar = daftar || [];
        var db = await bukaDb();
        var sekarang = new Date().toISOString();
        return new Promise(function (resolve, reject) {
            var tx = db.transaction([STORE, 'meta'], 'readwrite');
            var store = tx.objectStore(STORE);
            store.clear();
            daftar.forEach(function (p) { store.put(p); });
            tx.objectStore('meta').put({ kunci: 'ringkasan', total: daftar.length, disinkronPada: sekarang });
            tx.oncomplete = function () { resolve({ total: daftar.length, disinkronPada: sekarang }); };
            tx.onerror = function () { reject(tx.error); };
        });
    }

    /** @return {Promise<object[]>} seluruh baris cache -- fallback offline layar Produk. */
    async function produkCacheSemua() {
        var db = await bukaDb();
        return new Promise(function (resolve, reject) {
            var tx = db.transaction(STORE, 'readonly');
            var req = tx.objectStore(STORE).getAll();
            req.onsuccess = function () { resolve(req.result || []); };
            req.onerror = function () { reject(req.error); };
        });
    }

    /** @return {Promise<{total:number, disinkronPada:?string}>} status cache TERKINI (tanpa memicu sinkron baru). */
    async function ringkasanProdukCache() {
        var db = await bukaDb();
        return new Promise(function (resolve, reject) {
            var tx = db.transaction('meta', 'readonly');
            var req = tx.objectStore('meta').get('ringkasan');
            req.onsuccess = function () { resolve(req.result || { total: 0, disinkronPada: null }); };
            req.onerror = function () { reject(req.error); };
        });
    }

    /**
     * Fitur "Sinkronkan" (manual, dipanggil tombol) -- ambil katalog PENUH dari server via
     * {@code AisApi.panggil('katalog', {})} lalu timpa seluruh cache lokal. Kegagalan (offline/
     * ditolak server) dikembalikan sbg {@code {ok:false, pesan}}, TIDAK melempar -- pemanggil (UI)
     * yg memutuskan cara menampilkannya.
     * @return {Promise<{ok:boolean, total?:number, disinkronPada?:string, pesan?:string}>}
     */
    async function sinkronkanKatalogProdukManual() {
        try {
            var r = await global.AisApi.panggil('katalog', {});
            if (r.status !== 'success') return { ok: false, pesan: (r && r.message) || 'Gagal mengambil katalog dari server.' };
            var ringkasan = await gantiSemuaProdukCache(r.produk || []);
            return { ok: true, total: ringkasan.total, disinkronPada: ringkasan.disinkronPada };
        } catch (e) {
            return { ok: false, pesan: (e && e.pesan) || (e && e.message) || String(e) };
        }
    }

    /** Timer berkala (10 menit, pola sama {@code OfflineQueue.mulaiAutoSync} tapi interval lebih jarang -- katalog produk tak seurgent transaksi/error). Dipanggil sekali stlh masuk ke Kasir. */
    function mulaiAutoSyncProduk() {
        setInterval(function () { sinkronkanKatalogProdukManual().catch(function () {}); }, 600000);
    }

    global.ProdukCache = {
        gantiSemuaProdukCache: gantiSemuaProdukCache,
        produkCacheSemua: produkCacheSemua,
        ringkasanProdukCache: ringkasanProdukCache,
        sinkronkanKatalogProdukManual: sinkronkanKatalogProdukManual,
        mulaiAutoSyncProduk: mulaiAutoSyncProduk
    };
})(window);
