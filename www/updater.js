/**
 * updater.js -- Cek versi terbaru aplikasi ini via GitHub Releases API (padanan Android dari
 * electron-updater yang dipakai versi Desktop). BEDA penting dari Desktop: sideload APK Android
 * TIDAK BISA diunduh+dipasang otomatis oleh aplikasi (butuh izin instalasi khusus & berisiko kalau
 * dilakukan diam-diam) -- jadi di sini cukup MEMBERITAHU kasir ada versi baru + tombol yang membuka
 * halaman rilis GitHub di browser, sisanya (unduh APK, buka, izinkan instal) dilakukan manual oleh
 * pengguna, sama seperti pola instalasi APK debug yang sudah dipakai selama ini.
 *
 * Gagal cek update (offline, GitHub down, rate-limit) SELALU diam-diam diabaikan -- ini bukan fitur
 * inti, jangan sampai mengganggu alur kasir dengan alert error untuk hal yang bukan kesalahan
 * pengguna. Dicek SEKALI per pembukaan aplikasi (dipanggil dari app.js setelah masuk ke Kasir),
 * bukan polling berkala -- menghindari boros baterai/kuota dan cukup utk kebutuhan lapangan.
 */
(function (global) {
    'use strict';

    var REPO_GITHUB = 'Zishof/ais-pos-kasir-android';
    var VERSI_SAAT_INI = '1.3.0';
    var KUNCI_DISMISS = 'ais_pos_update_dismiss_v1';

    /** Bandingkan 2 string versi ala semver ("1.2.0" vs "v1.10.3") -- return >0 bila a > b. */
    function bandingkanVersi(a, b) {
        var pa = String(a || '0').replace(/^v/i, '').split('.').map(function (n) { return parseInt(n, 10) || 0; });
        var pb = String(b || '0').replace(/^v/i, '').split('.').map(function (n) { return parseInt(n, 10) || 0; });
        var panjang = Math.max(pa.length, pb.length);
        for (var i = 0; i < panjang; i++) {
            var na = pa[i] || 0, nb = pb[i] || 0;
            if (na !== nb) return na - nb;
        }
        return 0;
    }

    async function bukaTautan(url) {
        try {
            var Browser = global.Capacitor && global.Capacitor.Plugins && global.Capacitor.Plugins.Browser;
            if (Browser) { await Browser.open({ url: url }); return; }
        } catch (e) { /* jatuh ke fallback di bawah */ }
        try { global.open(url, '_system'); } catch (e2) { global.location.href = url; }
    }

    function tampilkanBanner(rilis) {
        var elBanner = document.getElementById('updBanner');
        var elTeks = document.getElementById('updBannerTeks');
        var elLihat = document.getElementById('updBtnLihat');
        var elNanti = document.getElementById('updBtnNanti');
        if (!elBanner || !elTeks || !elLihat || !elNanti) return;

        elTeks.textContent = '\u{1F389} Versi baru ' + rilis.tag_name + ' tersedia (versi Anda saat ini: v' + VERSI_SAAT_INI + ')';
        elBanner.style.display = 'flex';

        elLihat.onclick = function () {
            bukaTautan(rilis.html_url || ('https://github.com/' + REPO_GITHUB + '/releases/latest'));
        };
        elNanti.onclick = function () {
            try { localStorage.setItem(KUNCI_DISMISS, rilis.tag_name); } catch (e) { /* abaikan */ }
            elBanner.style.display = 'none';
        };
    }

    /** Dipanggil sekali stlh berhasil masuk ke layar Kasir -- TIDAK PERNAH melempar/menampilkan error. */
    async function cekUpdate() {
        try {
            var resp = await fetch('https://api.github.com/repos/' + REPO_GITHUB + '/releases/latest', {
                headers: { 'Accept': 'application/vnd.github+json' }
            });
            if (!resp.ok) return;
            var data = await resp.json();
            var tag = data && data.tag_name;
            if (!tag || bandingkanVersi(tag, VERSI_SAAT_INI) <= 0) return;

            var sudahDitutupUtk = null;
            try { sudahDitutupUtk = localStorage.getItem(KUNCI_DISMISS); } catch (e) { /* abaikan */ }
            if (sudahDitutupUtk === tag) return;

            tampilkanBanner(data);
        } catch (e) {
            // Offline / GitHub tak terjangkau / rate-limit -- cek update bukan fitur inti, diamkan saja.
        }
    }

    global.AisUpdater = { cekUpdate: cekUpdate, bandingkanVersi: bandingkanVersi };
})(window);
