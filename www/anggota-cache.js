/**
 * anggota-cache.js -- Salinan LOKAL data anggota (teks saja, TANPA foto -- beda dgn Desktop yg
 * juga men-cache foto via SQLite+filesystem, lihat JavaDoc {@code sinkronkanAnggotaLengkap} main.js
 * Desktop) via IndexedDB, padanan Android dari {@code local-db.js anggota_cache}. Pola & alasan
 * SAMA PERSIS dgn {@code produk-cache.js} (database TERPISAH, timpa SELURUH isi tiap sinkron) --
 * lihat JavaDoc berkas itu. Sumber data: aksi server {@code anggota_sync_list} (cursor-paginated,
 * SAMA dgn yg dipakai Desktop) -- field {@code fotoUrl}/{@code fotoNama}/{@code fotoUkuran} pada
 * tiap baris SENGAJA diabaikan di sini (bukan diunduh) karena Android belum punya infrastruktur
 * unduh+simpan berkas biner lokal spt Desktop; kalau nanti dibutuhkan, foto cukup di-load langsung
 * dari {@code fotoUrl} (server publik tanpa token kedaluwarsa, lihat JavaDoc server ProfileImageUtil)
 * saat online, tanpa perlu cache.
 */
(function (global) {
    'use strict';

    var DB_NAME = 'ais_pos_anggota_cache_v1';
    var STORE = 'anggota';
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
            req.onblocked = function () { reject(new Error('Basis data cache anggota sedang dipakai koneksi lain.')); };
            req.onerror = function () { reject(req.error); };
        });
        return dbPromise;
    }

    /**
     * Menimpa SELURUH cache dgn data TERBARU dari server, dalam SATU transaksi.
     * @param {Array<object>} daftar baris {@code {id,nama,kode,kodeIdentitas,hp,telp,email,keterangan,jenisNama,wajibPin}} dari aksi {@code anggota_sync_list}.
     * @return {Promise<{total:number, disinkronPada:string}>}
     */
    async function gantiSemuaAnggotaCache(daftar) {
        daftar = daftar || [];
        var db = await bukaDb();
        var sekarang = new Date().toISOString();
        return new Promise(function (resolve, reject) {
            var tx = db.transaction([STORE, 'meta'], 'readwrite');
            var store = tx.objectStore(STORE);
            store.clear();
            daftar.forEach(function (a) { store.put(a); });
            tx.objectStore('meta').put({ kunci: 'ringkasan', total: daftar.length, disinkronPada: sekarang });
            tx.oncomplete = function () { resolve({ total: daftar.length, disinkronPada: sekarang }); };
            tx.onerror = function () { reject(tx.error); };
        });
    }

    /** @param {string} keyword @param {number} [limit=30] @return {Promise<object[]>} baris cocok nama/kode/kodeIdentitas -- fallback offline. */
    async function cariAnggotaCache(keyword, limit) {
        var db = await bukaDb();
        var kw = String(keyword || '').trim().toLowerCase();
        var lim = Math.max(1, Math.min(100, Number(limit) || 30));
        return new Promise(function (resolve, reject) {
            var tx = db.transaction(STORE, 'readonly');
            var req = tx.objectStore(STORE).getAll();
            req.onsuccess = function () {
                var semua = req.result || [];
                var cocok = !kw ? semua : semua.filter(function (a) {
                    return (a.nama && a.nama.toLowerCase().indexOf(kw) >= 0)
                        || (a.kode && a.kode.toLowerCase().indexOf(kw) >= 0)
                        || (a.kodeIdentitas && a.kodeIdentitas.toLowerCase().indexOf(kw) >= 0);
                });
                resolve(cocok.slice(0, lim));
            };
            req.onerror = function () { reject(req.error); };
        });
    }

    /** @return {Promise<{total:number, disinkronPada:?string}>} status cache TERKINI. */
    async function ringkasanAnggotaCache() {
        var db = await bukaDb();
        return new Promise(function (resolve, reject) {
            var tx = db.transaction('meta', 'readonly');
            var req = tx.objectStore('meta').get('ringkasan');
            req.onsuccess = function () { resolve(req.result || { total: 0, disinkronPada: null }); };
            req.onerror = function () { reject(req.error); };
        });
    }

    /**
     * Fitur "Sinkronkan" (manual, dipanggil tombol) -- ambil SELURUH anggota dari server via loop
     * cursor {@code anggota_sync_list} (page_size 200/batch, SAMA pola Desktop {@code sinkronkanAnggotaLengkap}
     * tapi TANPA tahap unduh foto) lalu timpa seluruh cache lokal.
     * @return {Promise<{ok:boolean, total?:number, disinkronPada?:string, pesan?:string}>}
     */
    async function sinkronkanAnggotaCacheManual() {
        try {
            var sejakId = 0;
            var semua = [];
            for (;;) {
                var r = await global.AisApi.panggil('anggota_sync_list', { sejak_id: sejakId, page_size: 200 });
                if (r.status !== 'success') return { ok: false, pesan: (r && r.message) || 'Gagal mengambil data anggota dari server.' };
                var data = r.data || [];
                if (data.length === 0) break;
                semua = semua.concat(data);
                if (!r.adaLagi || r.maksId == null) break;
                sejakId = r.maksId;
            }
            var ringkasan = await gantiSemuaAnggotaCache(semua);
            return { ok: true, total: ringkasan.total, disinkronPada: ringkasan.disinkronPada };
        } catch (e) {
            return { ok: false, pesan: (e && e.pesan) || (e && e.message) || String(e) };
        }
    }

    /** Timer berkala (10 menit, pola sama {@code ProdukCache.mulaiAutoSyncProduk}). Dipanggil sekali stlh masuk ke Kasir. */
    function mulaiAutoSyncAnggota() {
        setInterval(function () { sinkronkanAnggotaCacheManual().catch(function () {}); }, 600000);
    }

    global.AnggotaCache = {
        gantiSemuaAnggotaCache: gantiSemuaAnggotaCache,
        cariAnggotaCache: cariAnggotaCache,
        ringkasanAnggotaCache: ringkasanAnggotaCache,
        sinkronkanAnggotaCacheManual: sinkronkanAnggotaCacheManual,
        mulaiAutoSyncAnggota: mulaiAutoSyncAnggota
    };
})(window);
