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

    /**
     * Panggil satu aksi {@code PosApi}. Melempar {@link Error} dgn {@code .pesan} bila gagal jaringan;
     * bila server MERESPONS (walau {@code status !== 'success'}) hasil mentahnya tetap dikembalikan
     * apa adanya supaya pemanggil bisa membaca {@code description}/{@code statusAsli}.
     * @param {string} action
     * @param {object} [payload]
     * @return {Promise<object>}
     */
    async function panggil(action, payload) {
        var cfg = await bacaCfg();
        if (!cfg || !cfg.host) throw Object.assign(new Error('belum-diatur'), { pesan: 'Alamat server belum diatur.' });
        var url = baseUrl(cfg) + 'PosApi';
        var headers = { 'Content-Type': 'application/json; charset=UTF-8' };
        if (token) headers['Authorization'] = 'Bearer ' + token;
        var body = JSON.stringify(Object.assign({}, payload || {}, { action: action }));

        var resp;
        try {
            resp = await fetch(url, { method: 'POST', headers: headers, body: body });
        } catch (eJaringan) {
            throw Object.assign(new Error('offline'), { offline: true, pesan: 'Tidak ada koneksi ke server.' });
        }
        if (resp.status === 401) {
            throw Object.assign(new Error('unauthorized'), { butuhLoginUlang: true, pesan: 'Sesi berakhir, silakan masuk kembali.' });
        }
        var json;
        try { json = await resp.json(); } catch (eParse) {
            throw Object.assign(new Error('respons-tak-terduga'), { pesan: 'Server memberi respons tak terduga.' });
        }
        return json;
    }

    /** Login: simpan token+cfg server bila sukses. @return {Promise<{ok:boolean, pesan?:string}>} */
    async function login(cfg, username, password) {
        await simpanCfg(Object.assign({}, cfg, { username: username }));
        var hasil;
        try {
            hasil = await panggil('login', { username: username, password: password });
        } catch (e) {
            return { ok: false, pesan: e.pesan || String(e.message || e) };
        }
        if (hasil.status !== 'success' || !hasil.token) {
            return { ok: false, pesan: hasil.message || hasil.description || 'Userid atau kata sandi salah.' };
        }
        token = hasil.token;
        var cfgFinal = Object.assign({}, cfgCache, { token: hasil.token });
        await simpanCfg(cfgFinal);
        return { ok: true };
    }

    /** Muat token tersimpan (dipanggil saat app start) -- TIDAK memverifikasi ke server, sekadar isi memori. */
    async function muatTokenTersimpan() {
        var cfg = await bacaCfg();
        token = cfg && cfg.token ? cfg.token : null;
        return !!token;
    }

    async function logout() {
        try { await panggil('logout', {}); } catch (e) { /* abaikan -- logout lokal tetap jalan walau server tak terjangkau */ }
        await hapusCfg();
    }

    global.AisApi = {
        panggil: panggil,
        login: login,
        logout: logout,
        muatTokenTersimpan: muatTokenTersimpan,
        bacaCfg: bacaCfg,
        simpanCfg: simpanCfg
    };
})(window);
