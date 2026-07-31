/**
 * i18n.js -- Modul BERSAMA "Alih Bahasa" (Indonesia/English/Arabic/Mandarin) dimuat lewat <script>
 * di SETIAP layar Desktop (pos.html/ringkasan.html/pesanan.html/riwayat-sinkronisasi.html/login.html/
 * setup.html/laporan.html), pola sama persis dgn {@code pesan-detail.js} (self-injecting style+markup
 * sekali saat pertama dipakai, tanpa perlu <style>/markup tambahan per halaman).
 *
 * KENAPA TIDAK ADA KAMUS TERJEMAHAN SENDIRI DI SINI: server sudah punya mesin kamus lengkap
 * (Common.getBahasaConfig + tabel LabelBahasa, dipakai SELURUH JSP/ZK) -- modul ini murni JEMBATAN
 * ke situ (lihat PosApi.prosesI18nKamus), BUKAN kamus terpisah. Konsekuensinya: string sumber di
 * Desktop HARUS teks Bahasa Indonesia asli yang SAMA persis dgn yg dipakai di JSP/ZK bila memang ada
 * padanannya (mis. "Cari Produk...") supaya terjemahan yg SUDAH ada di database ikut kepakai --
 * kalau beda walau cuma tanda baca, kunci dianggap BARU (server auto-insert kamus baru).
 *
 * CARA PAKAI (per halaman):
 *   1. Beri elemen teks statis atribut `data-i18n="Teks Indonesia Asli"` (BUKAN textContent langsung
 *      -- textContent-nya sendiri boleh dikosongkan/diisi placeholder, `Kamus.muat()` yg mengisi).
 *   2. Utk atribut placeholder/title: `data-i18n-placeholder="..."` / `data-i18n-title="..."`.
 *   3. Utk string yg dibuat murni lewat JS (bukan markup statis, mis. pesan toast dinamis), panggil
 *      `Kamus.t("Teks Indonesia Asli")` di tempat string itu dipakai.
 *   4. String yg HANYA muncul lewat `Kamus.t()` (tak pernah sbg data-i18n di markup) WAJIB didaftarkan
 *      ke `window.KAMUS_JS_TAMBAHAN = [...]` SEBELUM `Kamus.muat()` dipanggil pertama kali, supaya
 *      ikut diminta ke server saat ganti bahasa (kalau tidak, string itu tetap dicoba diterjemahkan
 *      per-panggilan `Kamus.t()`, TAPI baru masuk kamus lokal setelah kamus penuh dimuat ulang --
 *      utk pengalaman terbaik tetap daftarkan di awal).
 *   5. Panggil `Kamus.muat(Kamus.bahasaTersimpan())` SEKALI di akhir inisialisasi halaman (setelah
 *      seluruh markup data-i18n sudah ada di DOM).
 *   6. (Opsional) taruh `<div id="i18nSwitcher"></div>` di topbar lalu panggil
 *      `Kamus.suntikPemilih(document.getElementById('i18nSwitcher'))` -- widget dropdown 4 bahasa siap
 *      pakai, otomatis memanggil `Kamus.muat()` saat kasir memilih bahasa lain.
 *
 * RTL (Arab): memilih bahasa Arab menyetel `<html dir="rtl">` + kelas `.i18n-rtl` di <body> --
 * lembar gaya dasar (disuntik modul ini) membalik arah flex/margin elemen STRUKTURAL UMUM (topbar,
 * sidebar, kartu, tabel) lewat aturan `[dir="rtl"]`. Halaman dgn tata letak KHUSUS (grid non-standar,
 * posisi absolut) mungkin perlu penyesuaian CSS tambahan per kasus -- dasar ini menutup SEBAGIAN BESAR
 * kasus umum (topbar/sidebar/tombol/form/tabel), bukan jaminan sempurna piksel-demi-piksel di semua
 * layar.
 */
(function () {
    'use strict';

    var KUNCI_LANG = 'ais_pos_bahasa';
    var PREFIX_KAMUS = 'ais_pos_kamus_';
    var BAHASA_DEFAULT = 'id';

    var DAFTAR_BAHASA = [
        { kode: 'id', label: 'Indonesia', bendera: '🇮🇩', rtl: false },
        { kode: 'en', label: 'English', bendera: '🇬🇧', rtl: false },
        { kode: 'ar', label: 'العربية', bendera: '🇸🇦', rtl: true },
        { kode: 'zh', label: '中文', bendera: '🇨🇳', rtl: false }
    ];

    var kamusAktif = {};
    var bahasaAktif = BAHASA_DEFAULT;
    var pendengarGanti = [];
    var sudahDisuntikGaya = false;
    var sedangMemuat = false;

    function bahasaInfo(kode) {
        for (var i = 0; i < DAFTAR_BAHASA.length; i++) {
            if (DAFTAR_BAHASA[i].kode === kode) return DAFTAR_BAHASA[i];
        }
        return DAFTAR_BAHASA[0];
    }

    /** Menerjemahkan SATU string sumber (Bahasa Indonesia asli) memakai kamus bahasa aktif saat ini. */
    function t(teks) {
        if (!teks) return teks;
        if (bahasaAktif === 'id') return teks;
        return kamusAktif[teks] || teks;
    }

    function terapkanKeElemen(root) {
        var akar = root || document;
        var i;
        var elsTeks = akar.querySelectorAll('[data-i18n]');
        for (i = 0; i < elsTeks.length; i++) {
            elsTeks[i].textContent = t(elsTeks[i].getAttribute('data-i18n'));
        }
        var elsPh = akar.querySelectorAll('[data-i18n-placeholder]');
        for (i = 0; i < elsPh.length; i++) {
            elsPh[i].setAttribute('placeholder', t(elsPh[i].getAttribute('data-i18n-placeholder')));
        }
        var elsTt = akar.querySelectorAll('[data-i18n-title]');
        for (i = 0; i < elsTt.length; i++) {
            elsTt[i].setAttribute('title', t(elsTt[i].getAttribute('data-i18n-title')));
        }
    }

    function terapkanArah() {
        var info = bahasaInfo(bahasaAktif);
        document.documentElement.setAttribute('dir', info.rtl ? 'rtl' : 'ltr');
        document.documentElement.setAttribute('lang', bahasaAktif);
        if (document.body) document.body.classList.toggle('i18n-rtl', info.rtl);
    }

    function kumpulkanSemuaTeksSumber() {
        var set = {};
        var i;
        var a = document.querySelectorAll('[data-i18n]');
        for (i = 0; i < a.length; i++) set[a[i].getAttribute('data-i18n')] = true;
        var b = document.querySelectorAll('[data-i18n-placeholder]');
        for (i = 0; i < b.length; i++) set[b[i].getAttribute('data-i18n-placeholder')] = true;
        var c = document.querySelectorAll('[data-i18n-title]');
        for (i = 0; i < c.length; i++) set[c[i].getAttribute('data-i18n-title')] = true;
        var tambahan = window.KAMUS_JS_TAMBAHAN || [];
        for (i = 0; i < tambahan.length; i++) set[tambahan[i]] = true;
        var out = [];
        for (var k in set) if (set.hasOwnProperty(k) && k) out.push(k);
        return out;
    }

    /**
     * Menemukan fungsi pemanggil {@code i18n_kamus} yang tersedia di window SAAT INI -- tiap jendela
     * Electron punya preload TERISOLASI (`window.electronAPI.posAPI` di jendela kasir utama,
     * `window.loginAPI` di layar Login, `window.setupAPI` di wizard Pengaturan Server -- lihat JavaDoc
     * masing-masing preload soal alasan isolasinya), jadi modul BERSAMA ini tak bisa mengasumsikan
     * SATU nama jembatan tetap; dicoba berurutan, yang PERTAMA ada yang dipakai.
     */
    function resolveFnI18nKamus() {
        if (window.electronAPI && window.electronAPI.posAPI && window.electronAPI.posAPI.i18nKamus) {
            return window.electronAPI.posAPI.i18nKamus;
        }
        if (window.loginAPI && window.loginAPI.i18nKamus) return window.loginAPI.i18nKamus;
        if (window.setupAPI && window.setupAPI.i18nKamus) return window.setupAPI.i18nKamus;
        // Aplikasi Android (Capacitor) -- lihat AisApi.i18nKamus di api.js, wrapper tipis di atas
        // AisApi.panggil('i18n_kamus', ...) yg meratakan balasan PosApi jadi bentuk {ok,data} yg SAMA
        // dgn yg diharapkan modul ini (identik pola Electron di atas), supaya file ini tetap portable
        // apa adanya lintas app.
        if (window.AisApi && window.AisApi.i18nKamus) return window.AisApi.i18nKamus;
        return null;
    }

    /**
     * Mengganti bahasa aktif: (1) langsung terapkan arah RTL/LTR + kamus CACHE lokal (bila ada) supaya
     * UI tak menunggu jaringan, (2) di LATAR BELAKANG minta kamus terkini ke server (semua string yg
     * sedang ada di DOM + `KAMUS_JS_TAMBAHAN`) dan menimpa cache begitu balasan datang. Aman dipanggil
     * berkali-kali (mis. app baru buka + kasir ganti bahasa manual) -- pemanggilan yg sedang berjalan
     * TIDAK diblokir/dibatalkan oleh pemanggilan berikutnya (kamus terakhir yg selesai yg menang; utk
     * pemakaian normal -- 1x saat halaman dibuka + sesekali klik pemilih -- ini tak masalah).
     */
    async function muat(kode) {
        bahasaAktif = kode;
        try { localStorage.setItem(KUNCI_LANG, kode); } catch (e) { /* ignore */ }
        terapkanArah();

        if (kode === BAHASA_DEFAULT) {
            kamusAktif = {};
            terapkanKeElemen(document);
            pendengarGanti.forEach(function (fn) { try { fn(kode); } catch (e) { /* ignore */ } });
            return;
        }

        try {
            var cache = localStorage.getItem(PREFIX_KAMUS + kode);
            if (cache) {
                kamusAktif = JSON.parse(cache);
                terapkanKeElemen(document);
            }
        } catch (e) { /* ignore */ }

        var fnKamus = resolveFnI18nKamus();
        if (!fnKamus) return;
        sedangMemuat = true;
        try {
            var teksSumber = kumpulkanSemuaTeksSumber();
            var hasil = await fnKamus({ lang: kode, teks: teksSumber });
            if (hasil && hasil.ok && hasil.data && hasil.data.kamus && bahasaAktif === kode) {
                kamusAktif = hasil.data.kamus;
                try { localStorage.setItem(PREFIX_KAMUS + kode, JSON.stringify(kamusAktif)); } catch (e) { /* ignore */ }
                terapkanKeElemen(document);
            }
        } catch (e) {
            // Offline / gagal jaringan -- tetap pakai cache lokal (sudah diterapkan di atas) atau teks asli.
        } finally {
            sedangMemuat = false;
        }
        pendengarGanti.forEach(function (fn) { try { fn(kode); } catch (e) { /* ignore */ } });
    }

    function bahasaTersimpan() {
        try { return localStorage.getItem(KUNCI_LANG) || BAHASA_DEFAULT; } catch (e) { return BAHASA_DEFAULT; }
    }

    function onGanti(fn) { pendengarGanti.push(fn); }

    function suntikGayaSekaliJalan() {
        if (sudahDisuntikGaya) return;
        sudahDisuntikGaya = true;
        var style = document.createElement('style');
        style.textContent =
            '.i18n-switcher{position:relative;display:inline-block;}' +
            '.i18n-switcher-btn{background:var(--surface-2,#f1f5f9);border:1px solid var(--border,#e2e8f0);border-radius:10px;' +
            'padding:6px 12px;font-size:12.5px;font-weight:700;cursor:pointer;color:var(--ink,#1e293b);white-space:nowrap;}' +
            '.i18n-switcher-btn:hover{border-color:var(--primary,#2563eb);}' +
            '.i18n-switcher-menu{position:absolute;top:calc(100% + 6px);right:0;background:var(--surface,#fff);' +
            'border:1px solid var(--border,#e2e8f0);border-radius:12px;box-shadow:0 12px 28px rgba(15,23,42,.14);' +
            'min-width:150px;z-index:400;overflow:hidden;padding:4px;}' +
            '.i18n-switcher-item{padding:8px 12px;font-size:12.5px;font-weight:600;border-radius:8px;cursor:pointer;color:var(--ink,#1e293b);}' +
            '.i18n-switcher-item:hover{background:var(--surface-2,#f1f5f9);}' +
            /* RTL dasar: membalik struktur flex UMUM (topbar/sidebar/kartu/tombol-grup) -- lihat JavaDoc modul. */
            'html[dir="rtl"] body{direction:rtl;}' +
            'html[dir="rtl"] .i18n-switcher-menu{right:auto;left:0;}' +
            'html[dir="rtl"] input,html[dir="rtl"] textarea,html[dir="rtl"] select{text-align:right;}' +
            'html[dir="rtl"] .num,html[dir="rtl"] .tabular-nums{direction:ltr;unicode-bidi:isolate;}';
        document.head.appendChild(style);
    }

    /** Menyuntik widget dropdown pemilih bahasa (4 bendera) ke dalam `containerEl`. */
    function suntikPemilih(containerEl) {
        if (!containerEl) return;
        suntikGayaSekaliJalan();
        containerEl.innerHTML = '';
        var wrap = document.createElement('div');
        wrap.className = 'i18n-switcher';
        var btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'i18n-switcher-btn';
        function labelTombol(kode) {
            var info = bahasaInfo(kode);
            return info.bendera + ' ' + info.label;
        }
        btn.textContent = labelTombol(bahasaAktif);
        var menu = document.createElement('div');
        menu.className = 'i18n-switcher-menu';
        menu.style.display = 'none';
        DAFTAR_BAHASA.forEach(function (b) {
            var it = document.createElement('div');
            it.className = 'i18n-switcher-item';
            it.textContent = b.bendera + ' ' + b.label;
            it.addEventListener('click', function () {
                menu.style.display = 'none';
                btn.textContent = labelTombol(b.kode);
                muat(b.kode);
            });
            menu.appendChild(it);
        });
        btn.addEventListener('click', function (e) {
            e.stopPropagation();
            menu.style.display = (menu.style.display === 'none') ? 'block' : 'none';
        });
        document.addEventListener('click', function () { menu.style.display = 'none'; });
        wrap.appendChild(btn);
        wrap.appendChild(menu);
        containerEl.appendChild(wrap);
    }

    window.Kamus = {
        t: t,
        muat: muat,
        terapkan: terapkanKeElemen,
        onGanti: onGanti,
        bahasaTersimpan: bahasaTersimpan,
        bahasaAktif: function () { return bahasaAktif; },
        daftarBahasa: DAFTAR_BAHASA,
        bahasaInfo: bahasaInfo,
        suntikPemilih: suntikPemilih
    };
})();
