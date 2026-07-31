/**
 * pesanan-cache.js -- Salinan LOKAL daftar pesanan (Pesanan Online + Keranjang Tertahan, SATU sumber
 * data yg sama, lihat JavaDoc app.js muatDaftarPesanan) via IndexedDB, gap-closure paritas Desktop
 * (main.js sudah lama meng-cache 'pesanan' otomatis lewat local-db.js). BEDA dgn produk-cache.js/
 * anggota-cache.js: di sini cache HANYA dipakai utk MELIHAT daftar saat offline -- verifikasi/
 * pembatalan/checkout TETAP wajib online (aksi itu butuh state server terkini, bukan potret lama),
 * sama seperti Desktop TIDAK mengizinkan verifikasi/batal saat sedang menampilkan data dari cache.
 * Ditimpa PENUH tiap kali daftar berhasil diambil online (bukan upsert) -- pola sama produk-cache.js.
 */
(function (global) {
    'use strict';

    var DB_NAME = 'ais_pos_pesanan_cache_v1';
    var STORE = 'pesanan';
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
            req.onblocked = function () { reject(new Error('Basis data cache pesanan sedang dipakai koneksi lain.')); };
            req.onerror = function () { reject(req.error); };
        });
        return dbPromise;
    }

    /**
     * Menimpa SELURUH cache dgn daftar pesanan TERBARU -- dipanggil OTOMATIS tiap kali
     * {@code pesanan_list} berhasil diambil online (bukan lewat tombol manual terpisah), sama
     * persis kapan Desktop main.js memanggil {@code localDb.simpanCache('pesanan', ...)}.
     * @param {Array<object>} daftar isi {@code r.pesanan} dari aksi server {@code pesanan_list}.
     * @return {Promise<{total:number, disinkronPada:string}>}
     */
    async function gantiSemuaPesananCache(daftar) {
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

    /** @return {Promise<object[]>} seluruh baris cache -- fallback TAMPILAN SAJA saat offline. */
    async function pesananCacheSemua() {
        var db = await bukaDb();
        return new Promise(function (resolve, reject) {
            var tx = db.transaction(STORE, 'readonly');
            var req = tx.objectStore(STORE).getAll();
            req.onsuccess = function () { resolve(req.result || []); };
            req.onerror = function () { reject(req.error); };
        });
    }

    /** @return {Promise<{total:number, disinkronPada:?string}>} status cache TERKINI (tanpa memicu sinkron baru). */
    async function ringkasanPesananCache() {
        var db = await bukaDb();
        return new Promise(function (resolve, reject) {
            var tx = db.transaction('meta', 'readonly');
            var req = tx.objectStore('meta').get('ringkasan');
            req.onsuccess = function () { resolve(req.result || { total: 0, disinkronPada: null }); };
            req.onerror = function () { reject(req.error); };
        });
    }

    global.PesananCache = {
        gantiSemuaPesananCache: gantiSemuaPesananCache,
        pesananCacheSemua: pesananCacheSemua,
        ringkasanPesananCache: ringkasanPesananCache
    };
})(window);
