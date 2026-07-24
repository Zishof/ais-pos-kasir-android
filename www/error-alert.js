/**
 * error-alert.js -- Modal alert error TERPUSAT untuk seluruh aplikasi ini, dipakai baik oleh
 * kegagalan yang DITANGKAP (mis. gagal login, gagal sinkron) maupun exception yang TAK TERDUGA
 * (window.onerror/unhandledrejection, lihat blok "Penangkap global" di bawah).
 *
 * LATAR BELAKANG: sebelumnya, kegagalan yang tak terduga (mis. Promise ditolak tanpa .catch()) tak
 * pernah terlihat pengguna sama sekali -- tombol berhenti berputar (state direset di blok `finally`)
 * TANPA pesan apa pun, seolah aplikasi "tidak merespons". Modul ini memastikan SETIAP kegagalan --
 * baik yang diantisipasi maupun tidak -- selalu berujung pada satu alert yang sama: judul singkat +
 * penjelasan awam + langkah yang perlu dilakukan, dengan detail teknis mentah TERSEDIA (bisa
 * disalin/dilaporkan) tapi TERLIPAT (collapsible) supaya tidak menakuti pengguna awam.
 *
 * "Laporkan ke GitHub" TIDAK mengirim apa pun secara otomatis/diam-diam -- ia hanya membuka
 * (via @capacitor/browser, browser sistem eksternal) formulir "Issue baru" GitHub yang SUDAH TERISI
 * (judul+badan berisi detail teknis) untuk ditinjau & dikirim SENDIRI oleh pengguna. Ini sengaja
 * menghormati prinsip "jangan pernah kirim data pengguna tanpa aksi eksplisit mereka".
 */
(function (global) {
    'use strict';

    var REPO_GITHUB = 'Zishof/ais-pos-kasir-android';
    var NAMA_APLIKASI = 'AIS POS Kasir Android';
    var VERSI_APLIKASI = '1.1.0';

    // ==== Kamus kategori: dicocokkan dari properti terstruktur error (BUKAN menebak dari teks bebas) ====
    var KAMUS = {
        TIMEOUT: {
            tingkat: 'error', judul: 'Server Tidak Merespons (Waktu Habis)',
            penjelasan: 'Aplikasi menunggu balasan server lebih dari 20 detik tanpa hasil, lalu berhenti menunggu secara otomatis supaya aplikasi tidak "menggantung" selamanya. Ini BERBEDA dari "tidak ada koneksi sama sekali" -- biasanya server terlalu lambat, sedang sibuk, atau ada gangguan jaringan di tengah jalan (mis. WiFi lemah, kuota data habis/lambat).',
            langkah: [
                'Periksa kekuatan sinyal WiFi/data seluler perangkat ini.',
                'Coba lagi dalam beberapa saat -- kadang server sedang sibuk sesaat.',
                'Bila terus terjadi, hubungi admin/IT untuk memastikan server AIS sedang berjalan normal.'
            ]
        },
        TIDAK_ADA_KONEKSI: {
            tingkat: 'error', judul: 'Tidak Bisa Terhubung ke Server',
            penjelasan: 'Aplikasi gagal terhubung sama sekali ke alamat server yang diatur. Penyebab paling umum: perangkat sedang offline (WiFi/data mati), alamat server (host/context path) salah ketik, atau server memakai HTTPS/HTTP yang berbeda dari pengaturan aplikasi ini.',
            langkah: [
                'Periksa apakah perangkat ini terhubung ke internet (coba buka situs lain di browser).',
                'Periksa ulang alamat server di layar "Pengaturan Server" -- pastikan tidak ada salah ketik.',
                'Coba matikan centang "Gunakan HTTPS" bila server Anda memakai HTTP biasa (tanyakan admin/IT bila tidak yakin).',
                'Gunakan tombol "Tes Koneksi" di layar Pengaturan Server untuk memastikan sebelum mencoba masuk lagi.'
            ]
        },
        SESI_KEDALUWARSA: {
            tingkat: 'error', judul: 'Sesi Berakhir -- Wajib Masuk Ulang',
            penjelasan: 'Sesi login perangkat ini sudah tidak berlaku lagi di server (kedaluwarsa atau dicabut admin).',
            langkah: ['Klik "Keluar" lalu masuk kembali dengan userid dan kata sandi Anda.']
        },
        RESPONS_TAK_TERDUGA: {
            tingkat: 'error', judul: 'Server Memberi Jawaban yang Tidak Dikenali',
            penjelasan: 'Aplikasi berhasil terhubung ke alamat ini, TAPI jawaban yang diterima bukan format yang dikenali aplikasi (seharusnya data JSON dari server AIS). Ini sering berarti alamat/context path yang diisi BUKAN alamat server AIS yang benar (mis. malah mengarah ke halaman login web biasa, atau alamat yang salah total).',
            langkah: [
                'Periksa ulang alamat server & context path di layar Pengaturan Server.',
                'Pastikan alamat yang diisi adalah alamat AIS yang sama dipakai untuk login lewat browser/Kasir Desktop.',
                'Hubungi admin/IT bila tidak yakin dengan alamat context path yang benar.'
            ]
        },
        _DEFAULT: {
            tingkat: 'error', judul: 'Terjadi Kesalahan Tak Terduga',
            penjelasan: 'Aplikasi mengalami kegagalan yang belum punya penjelasan khusus. Detail teknis di bawah bisa membantu admin/pengembang menemukan penyebabnya -- silakan salin atau laporkan langsung lewat tombol di bawah.',
            langkah: ['Coba ulangi tindakan yang tadi dilakukan.', 'Bila terus terjadi, laporkan lewat tombol "Laporkan ke GitHub" di bawah supaya bisa segera diperbaiki.']
        }
    };

    var IKON = { error: '\u{1F6A8}', peringatan: '\u{26A0}\u{FE0F}', info: '\u{2139}\u{FE0F}' };

    var sudahDisuntik = false;
    var el = {};

    function suntik() {
        if (sudahDisuntik) return;
        sudahDisuntik = true;
        var style = document.createElement('style');
        style.textContent =
            '.ea-overlay{position:fixed;inset:0;background:rgba(15,23,42,.6);display:none;align-items:flex-end;justify-content:center;z-index:500;}' +
            '.ea-overlay.tampil{display:flex;}' +
            '@media (min-width:600px){.ea-overlay{align-items:center;}}' +
            '.ea-modal{background:var(--surface,#fff);border-radius:18px 18px 0 0;width:100%;max-width:440px;max-height:88vh;overflow-y:auto;box-shadow:0 16px 40px rgba(15,23,42,.25);}' +
            '@media (min-width:600px){.ea-modal{border-radius:18px;}}' +
            '.ea-kepala{display:flex;align-items:flex-start;gap:12px;padding:18px 18px 12px;}' +
            '.ea-ikon{font-size:26px;flex-shrink:0;}' +
            '.ea-kepala h3{margin:0 0 3px;font-size:15.5px;font-weight:800;color:var(--ink,#1e293b);}' +
            '.ea-tutup{margin-left:auto;background:var(--bg,#f1f5f9);border:none;width:28px;height:28px;border-radius:8px;font-size:13px;cursor:pointer;flex-shrink:0;}' +
            '.ea-body{padding:0 18px 4px;}' +
            '.ea-penjelasan{font-size:12.5px;line-height:1.6;color:var(--ink,#1e293b);margin-bottom:14px;}' +
            '.ea-blok h4{margin:0 0 6px;font-size:10.5px;font-weight:800;text-transform:uppercase;letter-spacing:.03em;color:var(--muted,#64748b);}' +
            '.ea-blok ol{margin:0 0 14px;padding-left:18px;font-size:12.5px;line-height:1.6;color:var(--ink,#1e293b);}' +
            '.ea-blok li{margin-bottom:3px;}' +
            '.ea-teknis-toggle{background:none;border:none;color:var(--muted,#64748b);font-size:11px;font-weight:700;cursor:pointer;padding:6px 0;}' +
            '.ea-teknis-pre{display:none;white-space:pre-wrap;word-break:break-word;background:var(--bg,#f1f5f9);border-radius:8px;padding:10px;font-size:10.5px;color:var(--muted,#64748b);margin:4px 0 10px;max-height:140px;overflow-y:auto;}' +
            '.ea-teknis.terbuka .ea-teknis-pre{display:block;}' +
            '.ea-footer{padding:10px 18px 18px;display:flex;flex-direction:column;gap:8px;}' +
            '.ea-footer button{width:100%;padding:12px;border-radius:11px;font-size:13px;font-weight:800;cursor:pointer;}' +
            '.ea-btn-ok{border:none;background:var(--primary,#2563eb);color:#fff;}' +
            '.ea-btn-salin,.ea-btn-lapor{border:1.5px solid var(--border,#e2e8f0);background:var(--surface,#fff);color:var(--ink,#1e293b);}';
        document.head.appendChild(style);

        el.overlay = document.createElement('div');
        el.overlay.className = 'ea-overlay';
        el.overlay.innerHTML =
            '<div class="ea-modal">' +
            '<div class="ea-kepala"><span class="ea-ikon"></span><div><h3></h3></div><button type="button" class="ea-tutup">✕</button></div>' +
            '<div class="ea-body">' +
            '<div class="ea-penjelasan"></div>' +
            '<div class="ea-blok"><h4>Langkah yang perlu dilakukan</h4><ol></ol></div>' +
            '<div class="ea-teknis"><button type="button" class="ea-teknis-toggle">Tampilkan detail teknis ▾</button><pre class="ea-teknis-pre"></pre></div>' +
            '</div>' +
            '<div class="ea-footer">' +
            '<button type="button" class="ea-btn-lapor">\u{1F41B} Laporkan ke GitHub</button>' +
            '<button type="button" class="ea-btn-salin">\u{1F4CB} Salin Detail</button>' +
            '<button type="button" class="ea-btn-ok">Mengerti</button>' +
            '</div></div>';
        document.body.appendChild(el.overlay);

        el.ikon = el.overlay.querySelector('.ea-ikon');
        el.judul = el.overlay.querySelector('h3');
        el.penjelasan = el.overlay.querySelector('.ea-penjelasan');
        el.langkahList = el.overlay.querySelector('.ea-blok ol');
        el.teknisBlok = el.overlay.querySelector('.ea-teknis');
        el.teknisPre = el.overlay.querySelector('.ea-teknis-pre');
        el.teknisToggle = el.overlay.querySelector('.ea-teknis-toggle');
        el.btnOk = el.overlay.querySelector('.ea-btn-ok');
        el.btnTutup = el.overlay.querySelector('.ea-tutup');
        el.btnSalin = el.overlay.querySelector('.ea-btn-salin');
        el.btnLapor = el.overlay.querySelector('.ea-btn-lapor');

        function tutup() { el.overlay.className = 'ea-overlay'; }
        el.btnOk.addEventListener('click', tutup);
        el.btnTutup.addEventListener('click', tutup);
        el.overlay.addEventListener('click', function (e) { if (e.target === el.overlay) tutup(); });
        el.teknisToggle.addEventListener('click', function () {
            el.teknisBlok.classList.toggle('terbuka');
            el.teknisToggle.textContent = el.teknisBlok.classList.contains('terbuka')
                ? 'Sembunyikan detail teknis ▴' : 'Tampilkan detail teknis ▾';
        });
    }

    var teksTeknisSaatIni = '';
    var judulTeknisSaatIni = '';

    function salinKeClipboard(teks) {
        if (navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard.writeText(teks).then(function () {
                toastSederhana('Detail disalin ke clipboard.');
            }).catch(function () { salinFallback(teks); });
        } else {
            salinFallback(teks);
        }
    }
    function salinFallback(teks) {
        try {
            var ta = document.createElement('textarea');
            ta.value = teks; ta.style.position = 'fixed'; ta.style.left = '-9999px';
            document.body.appendChild(ta); ta.focus(); ta.select();
            document.execCommand('copy');
            document.body.removeChild(ta);
            toastSederhana('Detail disalin ke clipboard.');
        } catch (e) { toastSederhana('Gagal menyalin -- salin manual dari kotak detail teknis.'); }
    }
    function toastSederhana(pesan) {
        var t = document.getElementById('toast');
        if (!t) { return; }
        t.textContent = pesan;
        t.className = 'toast tampil success';
        setTimeout(function () { t.className = 'toast success'; }, 2500);
    }

    async function buatIssueGitHub(judul, badan) {
        var url = 'https://github.com/' + REPO_GITHUB + '/issues/new?labels=bug&title='
            + encodeURIComponent(judul) + '&body=' + encodeURIComponent(badan);
        try {
            var Browser = global.Capacitor && global.Capacitor.Plugins && global.Capacitor.Plugins.Browser;
            if (Browser) { await Browser.open({ url: url }); return; }
        } catch (e) { /* jatuh ke fallback di bawah */ }
        try { global.open(url, '_system'); } catch (e2) { global.location.href = url; }
    }

    function tampilkan(info) {
        suntik();
        var tingkat = info.tingkat || 'error';
        el.ikon.textContent = IKON[tingkat] || IKON.error;
        el.judul.textContent = info.judul || 'Terjadi Kesalahan';
        el.penjelasan.textContent = info.penjelasan || '';

        el.langkahList.innerHTML = '';
        (info.langkah || []).forEach(function (s) {
            var li = document.createElement('li'); li.textContent = s; el.langkahList.appendChild(li);
        });

        el.teknisBlok.classList.remove('terbuka');
        el.teknisToggle.textContent = 'Tampilkan detail teknis ▾';
        teksTeknisSaatIni = info.teknis || '(tidak ada detail teknis tambahan)';
        judulTeknisSaatIni = info.judul || 'Error';
        el.teknisPre.textContent = teksTeknisSaatIni;

        el.overlay.className = 'ea-overlay tampil';
    }

    el._wireFooterOnce = false;
    function pastikanFooterTerpasang() {
        if (el._wireFooterOnce) return;
        el._wireFooterOnce = true;
        el.btnSalin.addEventListener('click', function () {
            salinKeClipboard('[' + NAMA_APLIKASI + ' v' + VERSI_APLIKASI + '] ' + judulTeknisSaatIni + '\n\n' + teksTeknisSaatIni);
        });
        el.btnLapor.addEventListener('click', function () {
            var badan = '**Aplikasi:** ' + NAMA_APLIKASI + ' v' + VERSI_APLIKASI + '\n'
                + '**Waktu:** ' + new Date().toString() + '\n'
                + '**User agent:** ' + navigator.userAgent + '\n\n'
                + '**Deskripsi masalah (isi oleh pengguna):**\n_(jelaskan apa yang sedang Anda lakukan saat error ini muncul)_\n\n'
                + '**Detail teknis:**\n```\n' + teksTeknisSaatIni + '\n```';
            buatIssueGitHub('[Error] ' + judulTeknisSaatIni, badan);
        });
    }

    /** Tampilkan alert dari kode kamus (mis. 'TIMEOUT') + teknis mentah opsional. */
    function tampilkanKode(kode, teknis) {
        suntik(); pastikanFooterTerpasang();
        var entri = KAMUS[kode] || KAMUS._DEFAULT;
        tampilkan(Object.assign({}, entri, { teknis: teknis }));
    }

    /**
     * Tampilkan alert dari sebuah JS Error/exception mentah -- dipetakan ke kategori KAMUS berdasar
     * flag terstruktur ({@code .timeout}/{@code .offline}/{@code .butuhLoginUlang}) BILA ADA, kalau
     * tidak jatuh ke kategori default (tetap menampilkan pesan asli sbg detail teknis).
     * @param {Error|any} err
     * @param {string} [konteks] label singkat konteks aksi yg gagal (mis. "Login", "Muat Katalog").
     */
    function tampilkanDariException(err, konteks) {
        suntik(); pastikanFooterTerpasang();
        var kode = '_DEFAULT';
        if (err && err.timeout) kode = 'TIMEOUT';
        else if (err && err.offline) kode = 'TIDAK_ADA_KONEKSI';
        else if (err && err.butuhLoginUlang) kode = 'SESI_KEDALUWARSA';
        else if (err && err.responsTakTerduga) kode = 'RESPONS_TAK_TERDUGA';

        var pesanAsli = (err && (err.pesan || err.message)) || String(err);
        var stack = (err && err.stack) || '';
        var teknis = (konteks ? '[' + konteks + '] ' : '') + pesanAsli + (stack ? '\n\n' + stack : '');
        tampilkan(Object.assign({}, KAMUS[kode] || KAMUS._DEFAULT, { teknis: teknis }));
    }

    global.ErrorAlert = {
        tampilkan: tampilkan,
        tampilkanKode: tampilkanKode,
        tampilkanDariException: tampilkanDariException,
        aturAplikasi: function (repo, nama, versi) { REPO_GITHUB = repo; NAMA_APLIKASI = nama; VERSI_APLIKASI = versi; }
    };

    // ==== Penangkap global -- SETIAP error tak tertangkap tampil sbg alert, bukan cuma hilang diam2 ====
    // Guard anti-badai: error identik dlm 4 detik terakhir tak memicu alert baru (mis. exception yg
    // sama berulang dari setInterval) -- cukup satu alert per kejadian, bukan tumpukan modal.
    var pesanTerakhir = null, waktuTerakhir = 0;
    function tampilkanGlobalDenganGuard(judul, teknis) {
        var sekarang = Date.now();
        if (judul === pesanTerakhir && (sekarang - waktuTerakhir) < 4000) return;
        pesanTerakhir = judul; waktuTerakhir = sekarang;
        suntik(); pastikanFooterTerpasang();
        tampilkan(Object.assign({}, KAMUS._DEFAULT, { teknis: teknis }));
    }

    global.addEventListener('error', function (ev) {
        var err = ev && ev.error;
        var pesan = (err && err.message) || ev.message || 'Error JS tak dikenal';
        var detail = (err && err.stack) || ((ev.filename || '?') + ':' + (ev.lineno || '?') + ':' + (ev.colno || '?'));
        tampilkanGlobalDenganGuard(pesan, '[window.onerror] ' + pesan + '\n\n' + detail);
    });
    global.addEventListener('unhandledrejection', function (ev) {
        var alasan = ev && ev.reason;
        var pesan = (alasan && (alasan.pesan || alasan.message)) || String(alasan || 'Promise ditolak tanpa alasan');
        var detail = (alasan && alasan.stack) || '';
        tampilkanGlobalDenganGuard(pesan, '[unhandledrejection] ' + pesan + (detail ? '\n\n' + detail : ''));
    });
})(window);
