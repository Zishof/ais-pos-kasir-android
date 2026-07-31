/**
 * updater.js -- Cek versi terbaru aplikasi ini via GitHub Releases API (padanan Android dari
 * electron-updater yang dipakai versi Desktop), lalu tawarkan pembaruan mirip "Windows Update":
 * popup Ya/Nanti + checkbox "Update Otomatis" (tersimpan lintas-sesi lewat Capacitor Preferences).
 * Bila "Update Otomatis" aktif, unduhan APK berjalan SENDIRI di latar begitu versi baru terdeteksi,
 * TANPA menanyai kasir lagi -- tapi langkah TERAKHIR (konfirmasi instal) SELALU tetap milik Android
 * sendiri (dialog sistem "Instal aplikasi ini?"), TIDAK BISA dilewati oleh aplikasi mana pun tanpa
 * root/MDM -- ini batasan keamanan platform, bukan kekurangan kode ini. Lihat ApkInstallerPlugin.java
 * (native) untuk paruh kedua alur (unduhan -> URI FileProvider -> Intent installer sistem).
 *
 * Gagal cek update (offline, GitHub down, rate-limit) SELALU diam-diam diabaikan -- ini bukan fitur
 * inti, jangan sampai mengganggu alur kasir dengan alert error untuk hal yang bukan kesalahan
 * pengguna. Dicek SEKALI per pembukaan aplikasi (dipanggil dari app.js setelah masuk ke Kasir),
 * bukan polling berkala -- menghindari boros baterai/kuota dan cukup utk kebutuhan lapangan.
 */
(function (global) {
    'use strict';

    var REPO_GITHUB = 'Zishof/ais-pos-kasir-android';
    var VERSI_SAAT_INI = '1.18.21';
    var KUNCI_DISMISS = 'ais_pos_update_dismiss_v1';
    var KUNCI_PREF_OTOMATIS = 'ais_pos_update_otomatis';

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

    function plugin(nama) {
        return global.Capacitor && global.Capacitor.Plugins && global.Capacitor.Plugins[nama];
    }

    async function bukaTautan(url) {
        try {
            var Browser = plugin('Browser');
            if (Browser) { await Browser.open({ url: url }); return; }
        } catch (e) { /* jatuh ke fallback di bawah */ }
        try { global.open(url, '_system'); } catch (e2) { global.location.href = url; }
    }

    async function bacaPreferensiOtomatis() {
        try {
            var Preferences = plugin('Preferences');
            if (!Preferences) return false;
            var r = await Preferences.get({ key: KUNCI_PREF_OTOMATIS });
            return r && r.value === '1';
        } catch (e) { return false; }
    }

    async function simpanPreferensiOtomatis(aktif) {
        try {
            var Preferences = plugin('Preferences');
            if (!Preferences) return;
            await Preferences.set({ key: KUNCI_PREF_OTOMATIS, value: aktif ? '1' : '0' });
        } catch (e) { /* abaikan -- gagal simpan preferensi bukan hal fatal */ }
    }

    function tampilkanBanner(rilis) {
        var elBanner = document.getElementById('updBanner');
        var elTeks = document.getElementById('updBannerTeks');
        var elLihat = document.getElementById('updBtnLihat');
        var elNanti = document.getElementById('updBtnNanti');
        if (!elBanner || !elTeks || !elLihat || !elNanti) return;

        elTeks.textContent = '\u{1F389} Versi baru ' + rilis.tag_name + ' tersedia (versi Anda saat ini: v' + VERSI_SAAT_INI + ')';
        elBanner.style.display = 'flex';

        elLihat.onclick = function () { tampilkanTawaran(rilis); };
        elNanti.onclick = function () {
            try { localStorage.setItem(KUNCI_DISMISS, rilis.tag_name); } catch (e) { /* abaikan */ }
            elBanner.style.display = 'none';
        };
    }

    /** Konversi respons unduhan (Response fetch) jadi string base64 murni (tanpa prefiks "data:...;base64,") lewat FileReader -- lebih aman utk berkas beberapa MB drpd konversi manual per-byte. */
    function blobKeBase64(blob) {
        return new Promise(function (resolve, reject) {
            var reader = new FileReader();
            reader.onerror = function () { reject(reader.error || new Error('Gagal membaca berkas unduhan.')); };
            reader.onload = function () {
                var dataUrl = String(reader.result || '');
                var idx = dataUrl.indexOf(',');
                resolve(idx >= 0 ? dataUrl.slice(idx + 1) : dataUrl);
            };
            reader.readAsDataURL(blob);
        });
    }

    /**
     * Mengunduh APK rilis ke penyimpanan cache lokal lalu memicu installer sistem Android.
     * @param {{assets?:Array<{name:string,browser_download_url:string}>, html_url?:string}} rilis
     * @param {(teks:string)=>void} [aturStatus] callback opsional utk menampilkan progres tekstual.
     * @throws bila plugin native tak tersedia (fallback ke tautan manual dilakukan PEMANGGIL, bukan di sini), unduhan gagal, atau instalasi ditolak sistem.
     */
    async function unduhDanPasang(rilis, aturStatus) {
        var Filesystem = plugin('Filesystem');
        var ApkInstaller = plugin('ApkInstaller');
        var asset = (rilis.assets || []).filter(function (a) { return /\.apk$/i.test(a && a.name || ''); })[0];
        if (!Filesystem || !ApkInstaller || !asset) {
            throw new Error('TANPA_APK_OTOMATIS'); // ditangani pemanggil: fallback buka halaman rilis GitHub
        }

        if (aturStatus) aturStatus('Mengunduh pembaruan (' + asset.name + ')...');
        var resp = await fetch(asset.browser_download_url);
        if (!resp.ok) throw new Error('Unduhan gagal (HTTP ' + resp.status + ').');
        var blob = await resp.blob();
        var base64 = await blobKeBase64(blob);

        if (aturStatus) aturStatus('Menyiapkan pemasangan...');
        var tulis = await Filesystem.writeFile({ path: asset.name, data: base64, directory: 'CACHE' });
        var pathAsli = String((tulis && tulis.uri) || '').replace(/^file:\/\//, '');
        if (!pathAsli) throw new Error('Gagal menyimpan berkas unduhan ke perangkat.');

        if (aturStatus) aturStatus('Membuka installer sistem Android...');
        await ApkInstaller.install({ path: pathAsli });
    }

    /** Menampilkan modal tawaran (Ya/Nanti + checkbox Update Otomatis) -- juga dipakai jalur "Update Otomatis" gagal (fallback minta konfirmasi manual). */
    async function tampilkanTawaran(rilis) {
        var elOverlay = document.getElementById('overlayUpdateTawaran');
        var elTeks = document.getElementById('updTawaranTeks');
        var elStatus = document.getElementById('updTawaranStatus');
        var elChk = document.getElementById('updChkOtomatis');
        var elBtnUpdate = document.getElementById('updBtnTawaranUpdate');
        var elBtnNanti = document.getElementById('updBtnTawaranNanti');
        var elBtnTutup = document.getElementById('btnTutupUpdateTawaran');
        if (!elOverlay || !elTeks || !elBtnUpdate) { tampilkanBanner(rilis); return; }

        var elBanner = document.getElementById('updBanner');
        if (elBanner) elBanner.style.display = 'none';

        elTeks.textContent = 'Versi baru ' + rilis.tag_name + ' tersedia (versi Anda saat ini: v' + VERSI_SAAT_INI + '). Update sekarang?';
        elStatus.style.display = 'none';
        elStatus.className = 'upd-status';
        elChk.checked = await bacaPreferensiOtomatis();
        elBtnUpdate.disabled = false;
        elBtnUpdate.textContent = 'Update Sekarang';
        elOverlay.className = 'overlay tampil';

        function tutup() { elOverlay.className = 'overlay'; }
        if (elBtnTutup) elBtnTutup.onclick = tutup;
        elOverlay.onclick = function (ev) { if (ev.target === elOverlay) tutup(); };

        elChk.onchange = function () { simpanPreferensiOtomatis(elChk.checked); };

        elBtnNanti.onclick = function () {
            try { localStorage.setItem(KUNCI_DISMISS, rilis.tag_name); } catch (e) { /* abaikan */ }
            tutup();
        };

        elBtnUpdate.onclick = function () {
            jalankanUnduhDenganUi(rilis, elStatus, elBtnUpdate, elBtnNanti);
        };
    }

    async function jalankanUnduhDenganUi(rilis, elStatus, elBtnUpdate, elBtnNanti) {
        elBtnUpdate.disabled = true;
        if (elBtnNanti) elBtnNanti.disabled = true;
        elStatus.className = 'upd-status';
        elStatus.style.display = 'block';
        try {
            await unduhDanPasang(rilis, function (teks) { elStatus.textContent = teks; });
            // Installer sistem sudah terbuka di atas aplikasi ini -- biarkan modal apa adanya (aplikasi
            // akan pindah ke latar begitu dialog instal Android muncul); tombol dikembalikan aktif
            // berjaga-jaga bila kasir kembali ke aplikasi ini tanpa jadi menginstal.
            elStatus.textContent = 'Installer sistem terbuka -- ikuti langkah pemasangan di sana.';
        } catch (e) {
            var pesan = String((e && e.message) || e || '');
            if (pesan.indexOf('TANPA_APK_OTOMATIS') >= 0) {
                elStatus.textContent = 'Rilis ini belum menyertakan berkas APK -- membuka halaman unduhan manual...';
                await bukaTautan(rilis.html_url || ('https://github.com/' + REPO_GITHUB + '/releases/latest'));
            } else if (pesan.indexOf('IZIN_SUMBER_TAK_DIKENAL_BELUM_AKTIF') >= 0) {
                elStatus.className = 'upd-status error';
                elStatus.textContent = 'Android meminta izin "Instal aplikasi tak dikenal" utk app ini diaktifkan dulu -- halaman pengaturannya baru saja dibuka. Aktifkan, kembali ke sini, lalu tekan "Update Sekarang" lagi.';
            } else {
                elStatus.className = 'upd-status error';
                elStatus.textContent = 'Gagal memperbarui: ' + (pesan || 'kesalahan tak dikenal') + '. Coba lagi, atau unduh manual dari halaman rilis GitHub.';
            }
        } finally {
            elBtnUpdate.disabled = false;
            elBtnUpdate.textContent = 'Coba Lagi';
            if (elBtnNanti) elBtnNanti.disabled = false;
        }
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

            var otomatis = await bacaPreferensiOtomatis();
            if (otomatis) {
                try {
                    await unduhDanPasang(data, null);
                } catch (e) {
                    // Alur otomatis gagal (mis. izin "sumber tak dikenal" belum aktif, atau rilis tanpa
                    // APK) -- jatuh ke tawaran manual spy kasir tetap tahu ada pembaruan yg butuh perhatian.
                    tampilkanTawaran(data);
                }
                return;
            }

            var sudahDitutupUntuk = null;
            try { sudahDitutupUntuk = localStorage.getItem(KUNCI_DISMISS); } catch (e) { /* abaikan */ }
            if (sudahDitutupUntuk === tag) { tampilkanBanner(data); return; }

            tampilkanTawaran(data);
        } catch (e) {
            // Offline / GitHub tak terjangkau / rate-limit -- cek update bukan fitur inti, diamkan saja.
        }
    }

    global.AisUpdater = { cekUpdate: cekUpdate, bandingkanVersi: bandingkanVersi };
})(window);
