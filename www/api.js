/**
 * api.js -- klien HTTP tipis ke {@code PosApi.java} (endpoint {@code /PosApi}), server yang SAMA
 * PERSIS dipakai Kasir Desktop (Electron) -- lihat JavaDoc kelas {@code PosApi} di server utk
 * kontrak lengkap tiap aksi. TIDAK ada logika bisnis di sini, murni transport + penyimpanan token.
 *
 * BEDA dari Electron: di sana panggilan API lewat proses utama Node (IPC), di sini langsung
 * {@code fetch()} dari WebView Capacitor (jalan sebagai proses tunggal, seperti browser biasa) --
 * konsekuensinya token & URL server disimpan di {@code @capacitor/preferences} (setara localStorage
 * persisten), BUKAN berkas JSON di filesystem OS.
 */
(function (global) {
    'use strict';
    var Preferences = (global.Capacitor && global.Capacitor.Plugins && global.Capacitor.Plugins.Preferences) || null;

    var KUNCI_CFG = 'ais_pos_cfg_v1';
    var cfgCache = null;
    var token = null;
    var tokoAktifId = null;

    /**
     * Fitur "Identitas Mesin POS" -- gap-closure "toko dgn banyak mesin POS, transaksi/pesanan harus
     * bisa dibedakan mesin asalnya" (padanan {@code MESIN_PATH} di Desktop main.js, lihat JavaDoc di
     * sana utk alasan lengkap). {@code idMesin} di-generate SEKALI (UUID v4, fallback hex acak bila
     * {@code crypto.randomUUID} tak tersedia di WebView lama) dan tak pernah berubah. {@code namaMesin}
     * diisi admin lewat layar Konfigurasi.
     */
    var KUNCI_MESIN = 'ais_pos_mesin_v1';
    var mesinCache = null;

    function buatIdMesinBaru() {
        try { if (global.crypto && typeof global.crypto.randomUUID === 'function') return global.crypto.randomUUID(); } catch (e) { /* fallback di bawah */ }
        var hex = ''; for (var i = 0; i < 32; i++) hex += Math.floor(Math.random() * 16).toString(16);
        return hex.substr(0, 8) + '-' + hex.substr(8, 4) + '-' + hex.substr(12, 4) + '-' + hex.substr(16, 4) + '-' + hex.substr(20, 12);
    }

    async function bacaIdentitasMesin() {
        if (mesinCache) return mesinCache;
        var raw = null;
        if (Preferences) { var r = await Preferences.get({ key: KUNCI_MESIN }); raw = r.value; }
        else raw = localStorage.getItem(KUNCI_MESIN);
        var m = raw ? JSON.parse(raw) : null;
        if (!m || !m.idMesin) {
            m = { idMesin: buatIdMesinBaru(), namaMesin: '' };
            var rawBaru = JSON.stringify(m);
            if (Preferences) await Preferences.set({ key: KUNCI_MESIN, value: rawBaru });
            else localStorage.setItem(KUNCI_MESIN, rawBaru);
        }
        mesinCache = m;
        return m;
    }

    async function simpanNamaMesin(namaMesin) {
        var m = await bacaIdentitasMesin();
        m = { idMesin: m.idMesin, namaMesin: String(namaMesin || '').trim() };
        mesinCache = m;
        var raw = JSON.stringify(m);
        if (Preferences) await Preferences.set({ key: KUNCI_MESIN, value: raw });
        else localStorage.setItem(KUNCI_MESIN, raw);
        return m;
    }

    async function simpanCfg(cfg) {
        cfgCache = cfg;
        var raw = JSON.stringify(cfg);
        if (Preferences) await Preferences.set({ key: KUNCI_CFG, value: raw });
        else localStorage.setItem(KUNCI_CFG, raw);
    }

    async function bacaCfg() {
        if (cfgCache) return cfgCache;
        var raw = null;
        if (Preferences) { var r = await Preferences.get({ key: KUNCI_CFG }); raw = r.value; }
        else raw = localStorage.getItem(KUNCI_CFG);
        cfgCache = raw ? JSON.parse(raw) : null;
        return cfgCache;
    }

    async function hapusCfg() {
        cfgCache = null;
        token = null;
        if (Preferences) await Preferences.remove({ key: KUNCI_CFG });
        else localStorage.removeItem(KUNCI_CFG);
    }

    function baseUrl(cfg) {
        var skema = cfg.https ? 'https' : 'http';
        var host = (cfg.host || '').trim().replace(/^https?:\/\//, '').replace(/\/+$/, '');
        var ctx = (cfg.contextPath || '').trim().replace(/^\/+|\/+$/g, '');
        return skema + '://' + host + '/' + (ctx ? ctx + '/' : '');
    }

    /** Batas waktu tunggu jaringan -- lihat JavaDoc {@link panggil} soal kenapa ini WAJIB ada. */
    var TIMEOUT_MS = 20000;

    /**
     * Panggil satu aksi {@code PosApi}. Melempar {@link Error} beranotasi (lihat {@code error-alert.js}
     * utk arti tiap flag: {@code .offline}/{@code .timeout}/{@code .butuhLoginUlang}/
     * {@code .responsTakTerduga}) bila gagal; bila server MERESPONS (walau {@code status !== 'success'})
     * hasil mentahnya tetap dikembalikan apa adanya supaya pemanggil bisa membaca {@code description}.
     *
     * <p><b>KENAPA ADA AbortController/timeout eksplisit</b>: {@code fetch()} TIDAK PUNYA batas waktu
     * bawaan -- bila koneksi macet di tengah jalan (bukan gagal total, cuma lambat/menggantung), Promise
     * -nya TIDAK PERNAH selesai (tidak resolve, tidak reject). Tanpa timeout ini, tombol yang memanggil
     * method ini akan "diam" selamanya (persis gejala bug "klik Masuk tidak merespons apa pun" yang
     * pernah dilaporkan) -- pemanggil tidak pernah tahu harus menampilkan alert apa karena Promise-nya
     * memang belum (dan tidak akan pernah) selesai.</p>
     * @param {string} action
     * @param {object} [payload]
     * @param {number} [timeoutMs] override {@link TIMEOUT_MS} default (mis. aksi impor Excel katalog
     *        yg bisa memproses ribuan baris sinkron di server -- 20 detik default terlalu singkat).
     * @return {Promise<object>}
     */
    async function panggil(action, payload, timeoutMs) {
        var cfg = await bacaCfg();
        if (!cfg || !cfg.host) throw Object.assign(new Error('belum-diatur'), { pesan: 'Alamat server belum diatur.' });
        var url = baseUrl(cfg) + 'PosApi';
        var headers = { 'Content-Type': 'application/json; charset=UTF-8' };
        if (token) headers['Authorization'] = 'Bearer ' + token;
        var payloadKirim = payload || {};
        if (tokoAktifId != null
                && payloadKirim.tokoId == null && payloadKirim.id_toko == null
                && payloadKirim.idToko == null && payloadKirim.toko_id == null) {
            payloadKirim = Object.assign({}, payloadKirim, { tokoId: tokoAktifId });
        }
        // Gap-closure "banyak mesin POS satu toko" -- disisipkan di SATU titik masuk (bukan tiap
        // pemanggil di app.js) supaya tak ada jalur checkout yg lupa menyertakannya. Lihat JavaDoc
        // {@code lampirkanNamaMesin} Desktop main.js utk alasan lengkap (fallback ke potongan idMesin
        // bila admin belum sempat memberi nama).
        if (action === 'bayar' || action === 'draft_bayar') {
            var m = await bacaIdentitasMesin();
            var namaMesinKirim = m.namaMesin && m.namaMesin.trim() ? m.namaMesin.trim() : ('Mesin-' + m.idMesin.substr(0, 8));
            payloadKirim = Object.assign({}, payloadKirim, { nama_mesin: namaMesinKirim });
        }
        var body = JSON.stringify(Object.assign({}, payloadKirim, { action: action }));

        var batasWaktu = timeoutMs || TIMEOUT_MS;
        var controller = (typeof AbortController !== 'undefined') ? new AbortController() : null;
        var timer = null;

        // Lapis pertahanan GANDA thd fetch() yg menggantung: {@code controller.abort()} (jalur utama,
        // MEMBATALKAN permintaan sungguhan) DITAMBAH sebuah race Promise.race independen thd
        // AbortController (jalur cadangan) -- kalau suatu WebView/lingkungan kebetulan tidak
        // mendukung AbortController sama sekali ({@code typeof AbortController === 'undefined'},
        // jarang tapi PERNAH terjadi di WebView versi lama), {@code fetch()} tanpa {@code signal} sama
        // sekali TIDAK PUNYA batas waktu bawaan -- tanpa race ini, panggilan akan menggantung
        // SELAMANYA persis seperti bug lapangan "Memuat katalog... tak pernah berhenti" yg pernah
        // dilaporkan (root cause SEBENARNYA saat itu ternyata bug lain di IndexedDB, tapi celah ini
        // tetap nyata & terpisah, jadi tetap ditutup di sini sbg pencegahan).
        var promiseFetch = fetch(url, { method: 'POST', headers: headers, body: body, signal: controller ? controller.signal : undefined });
        var promiseTimeout = new Promise(function (resolve, reject) {
            timer = setTimeout(function () {
                if (controller) controller.abort();
                reject(Object.assign(new Error('timeout'), { __sudahDiabort: true }));
            }, batasWaktu);
        });

        var resp;
        try {
            resp = await Promise.race([promiseFetch, promiseTimeout]);
        } catch (eJaringan) {
            if (eJaringan && (eJaringan.name === 'AbortError' || eJaringan.__sudahDiabort)) {
                throw Object.assign(new Error('timeout'), {
                    timeout: true,
                    pesan: 'Server tidak merespons dalam ' + Math.round(batasWaktu / 1000) + ' detik.',
                    stack: 'Timeout (' + batasWaktu + 'ms) saat memanggil aksi "' + action + '" ke ' + url
                });
            }
            throw Object.assign(new Error('offline'), {
                offline: true,
                pesan: 'Tidak ada koneksi ke server.',
                stack: String((eJaringan && eJaringan.message) || eJaringan) + '\nURL: ' + url
            });
        } finally {
            if (timer) clearTimeout(timer);
        }
        if (resp.status === 401) {
            throw Object.assign(new Error('unauthorized'), { butuhLoginUlang: true, pesan: 'Sesi berakhir, silakan masuk kembali.' });
        }
        var teksMentah = await resp.text();
        var json;
        try { json = JSON.parse(teksMentah); } catch (eParse) {
            throw Object.assign(new Error('respons-tak-terduga'), {
                responsTakTerduga: true,
                pesan: 'Server memberi respons tak terduga (HTTP ' + resp.status + ').',
                stack: 'HTTP ' + resp.status + ' dari ' + url + '\n\nIsi respons (500 karakter pertama):\n' + teksMentah.slice(0, 500)
            });
        }
        return json;
    }

    /**
     * Login: simpan token+cfg server bila sukses. TIDAK PERNAH melempar exception ke pemanggil --
     * SEMUA kegagalan (termasuk kegagalan menyimpan konfigurasi lokal, bukan cuma jaringan) ditangkap
     * di sini dan dikembalikan sbg {@code {ok:false, pesan, error}}, supaya tombol "Masuk" di app.js
     * SELALU punya sesuatu utk ditampilkan -- inilah perbaikan atas bug "klik Masuk tidak merespons":
     * sebelumnya {@code simpanCfg} di baris pertama TIDAK dibungkus try/catch sama sekali, jadi
     * kegagalannya (mis. plugin Preferences belum siap) menyebabkan Promise ini REJECT tanpa pernah
     * tertangkap pemanggil (pemanggil lama hanya py try/finally, tanpa catch).
     * @return {Promise<{ok:boolean, pesan?:string, error?:Error}>}
     */
    async function login(cfg, username, password) {
        try {
            await simpanCfg(Object.assign({}, cfg, { username: username }));
        } catch (eSimpan) {
            return { ok: false, pesan: 'Gagal menyimpan pengaturan di perangkat ini.', error: eSimpan };
        }
        var hasil;
        try {
            hasil = await panggil('login', { username: username, password: password });
        } catch (e) {
            return { ok: false, pesan: e.pesan || String(e.message || e), error: e };
        }
        if (hasil.status !== 'success' || !hasil.token) {
            return { ok: false, pesan: hasil.message || hasil.description || 'Userid atau kata sandi salah.' };
        }
        token = hasil.token;
        try {
            var cfgFinal = Object.assign({}, cfgCache, { token: hasil.token });
            await simpanCfg(cfgFinal);
        } catch (eSimpan2) {
            return { ok: false, pesan: 'Login berhasil tapi gagal menyimpan sesi di perangkat ini.', error: eSimpan2 };
        }
        return { ok: true };
    }

    /**
     * Tes konektivitas ke server TANPA login -- memanggil aksi publik {@code i18n_kamus} (SATU-SATUNYA
     * aksi selain login/logout yg tidak butuh token, lihat JavaDoc server {@code PosApi.java}). Dipakai
     * tombol "Tes Koneksi" di wizard Pengaturan Server, supaya kesalahan alamat/HTTPS/context path
     * ketahuan SEBELUM pengguna mencoba login (dan bingung kenapa "Masuk" gagal).
     * @param {{host:string, contextPath:string, https:boolean}} cfg
     * @return {Promise<{ok:boolean, pesan?:string, error?:Error}>}
     */
    async function tesKoneksi(cfg) {
        var cfgLama = cfgCache;
        try {
            cfgCache = Object.assign({}, cfgLama, cfg);
            var hasil = await panggil('i18n_kamus', {});
            if (!hasil || typeof hasil !== 'object') {
                return { ok: false, pesan: 'Server memberi jawaban tak terduga.' };
            }
            return { ok: true };
        } catch (e) {
            return { ok: false, pesan: e.pesan || String(e.message || e), error: e };
        } finally {
            cfgCache = cfgLama;
        }
    }

    /** Muat token tersimpan (dipanggil saat app start) -- TIDAK memverifikasi ke server, sekadar isi memori. */
    async function muatTokenTersimpan() {
        var cfg = await bacaCfg();
        token = cfg && cfg.token ? cfg.token : null;
        return !!token;
    }

    async function logout() {
        try { await panggil('logout', {}); } catch (e) { /* abaikan -- logout lokal tetap jalan walau server tak terjangkau */ }
        tokoAktifId = null;
        await hapusCfg();
    }

    function setTokoAktif(id) {
        tokoAktifId = id == null || id === '' ? null : Number(id);
    }

    function getTokoAktif() {
        return tokoAktifId;
    }

    /**
     * Jembatan {@code i18n_kamus} utk modul BERSAMA {@code i18n.js} (lihat resolveFnI18nKamus di sana)
     * -- meratakan balasan mentah {@code panggil()} ({@code {status,lang,kamus}}, lihat JavaDoc server
     * {@code PosApi.prosesI18nKamus}) jadi bentuk {@code {ok,data:{kamus}}} yg SAMA dgn yg dikembalikan
     * jembatan Electron ({@code window.electronAPI.posAPI.i18nKamus}), supaya {@code i18n.js} tetap
     * SATU berkas identik lintas app (Desktop/Android) tanpa perlu tahu bentuk transport masing-masing.
     * @param {{lang:string, teks:string[]}} payload
     * @return {Promise<{ok:boolean, data?:{kamus:object}}>}
     */
    async function i18nKamus(payload) {
        try {
            var hasil = await panggil('i18n_kamus', payload);
            if (hasil && hasil.status === 'success') return { ok: true, data: { kamus: hasil.kamus || {} } };
            return { ok: false };
        } catch (e) {
            return { ok: false };
        }
    }

    global.AisApi = {
        panggil: panggil,
        login: login,
        logout: logout,
        tesKoneksi: tesKoneksi,
        muatTokenTersimpan: muatTokenTersimpan,
        bacaCfg: bacaCfg,
        simpanCfg: simpanCfg,
        setTokoAktif: setTokoAktif,
        getTokoAktif: getTokoAktif,
        i18nKamus: i18nKamus,
        identitasMesinBaca: bacaIdentitasMesin,
        identitasMesinSimpan: simpanNamaMesin
    };
})(window);
