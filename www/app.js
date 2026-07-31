/**
 * app.js -- logika Kasir Android. Reuse kontrak {@code PosApi.java} yang SAMA dgn Kasir Desktop
 * (Electron): {@code login/konfigurasi/katalog/sesi_kas_status/sesi_kas_buka/sesi_kas_tutup/
 * cari_member/saldo_member/verifikasi_pin/topup_saldo/bayar}.
 *
 * SEJAK v1.2.0 (paritas fase 1a+1b dgn Desktop): Tutup Kas + picker member/saldo/PIN/top-up saldo
 * sudah diporting -- lihat blok "Sesi Kas" dan "Member". SEJAK Fase 3 (i18n.js dimuat via
 * index.html): alih bahasa, "Pesanan Online" (verifikasi/batalkan draft dari toko_online.jsp), dan
 * "Tahan"/"Keranjang Tertahan" (simpan+lanjutkan keranjang, tombol di panel keranjang + blok
 * "Pesanan Online + Keranjang Tertahan" di bawah) juga sudah diporting. BELUM diporting dari
 * Desktop: diskon otomatis saat checkout (BELUM ADA di Desktop juga -- lihat catatan gap 3-arah),
 * printer Wi-Fi/USB, menu "Kulakan" (Harga Beli/Pengadaan Produk, Desktop-only). Semua itu bisa
 * ditambahkan bertahap mengikuti pola yang SAMA dgn desktop-pos-electron (aksi server sudah ADA,
 * tinggal disambungkan).
 */
(function () {
    'use strict';

    var elToast = document.getElementById('toast');
    var elLayarMuat = document.getElementById('layarMuat');
    var elTxtLayarMuat = document.getElementById('txtLayarMuat');

    function tampilMuat(pesan) { elTxtLayarMuat.textContent = pesan || 'Memuat...'; elLayarMuat.classList.add('tampil'); }
    function tutupMuat() { elLayarMuat.classList.remove('tampil'); }

    var toastTimer = null;
    function toast(jenis, pesan) {
        elToast.textContent = pesan;
        elToast.className = 'toast tampil ' + jenis;
        clearTimeout(toastTimer);
        toastTimer = setTimeout(function () { elToast.className = 'toast ' + jenis; }, 3200);
    }

    function formatRupiah(n) { return 'Rp ' + Math.round(Number(n) || 0).toLocaleString('id-ID'); }
    function escapeHtml(s) {
        var d = document.createElement('div');
        d.textContent = s == null ? '' : String(s);
        return d.innerHTML;
    }
    function pesanDariHasil(hasil, fallback) {
        return (hasil && (hasil.description || hasil.message)) || fallback || 'Terjadi kesalahan.';
    }

    // Fitur "Hak Akses Menu per Akun" (gap-closure Toko Al-Bahjah, SAMA PERSIS pola dgn
    // desktop-pos-electron/akses-menu.js) -- peta {@code data-layar} -> kunci {@code aksesMenu} dari
    // aksi {@code konfigurasi}. "layarPelanggan"/"layarKeranjangTertahan" SENGAJA tak dipetakan (bukan
    // salah satu dari 13 menu utama, selalu boleh diakses -- konsisten dgn Electron yg jg tak
    // mengenal keduanya sbg item sidebar terpisah).
    var PETA_LAYAR_AKSES = {
        layarPos: 'kasir', layarRingkasan: 'ringkasan', layarPesananOnline: 'pesanan',
        layarAnggota: 'anggota', layarProduk: 'produk', layarStokOpname: 'stokopname',
        layarKulakan: 'kulakan', layarReturPenjualan: 'returpenjualan', layarAturanDiskon: 'diskon',
        layarRiwayatPenjualan: 'riwayatpenjualan',
        layarLaporanTransaksi: 'laporantransaksi',
        layarLaporanKatalog: 'laporan', layarRiwayatSinkron: 'riwayatsinkronisasi',
        layarLogError: 'logerror', layarKonfigurasi: 'konfigurasi'
    };

    /** @return {boolean} true bila menu {@code idLayar} boleh diakses -- gagal-aman: SEBELUM aksesMenu termuat dari server (state.aksesMenu masih null), semua menu dianggap boleh diakses. */
    function bolehAksesLayar(idLayar) {
        if (!state.aksesMenu) return true;
        var kunci = PETA_LAYAR_AKSES[idLayar];
        if (!kunci) return true;
        return state.aksesMenu[kunci] !== false;
    }

    function tampilkanLayar(id) {
        if (!bolehAksesLayar(id)) {
            toast('error', 'Akun ini tidak punya akses ke menu tersebut.');
            var fallback = Object.keys(PETA_LAYAR_AKSES).filter(function (l) { return bolehAksesLayar(l); })[0] || 'layarPos';
            if (fallback === id) return; // tak ada satu pun menu lain yg boleh -- diamkan drpd rekursi tanpa akhir.
            id = fallback;
        }
        document.querySelectorAll('.layar').forEach(function (el) { el.classList.remove('aktif'); });
        document.getElementById(id).classList.add('aktif');
        document.querySelectorAll('.drawer-item').forEach(function (b) { b.classList.toggle('aktif', b.getAttribute('data-layar') === id); });
    }

    /** Sembunyikan item drawer yg menunya tak diizinkan -- dipanggil tiap kali segarkanStatus() memuat ulang aksesMenu dari server. */
    function terapkanAksesMenuDrawer() {
        document.querySelectorAll('.drawer-item[data-layar]').forEach(function (btn) {
            var idLayar = btn.getAttribute('data-layar');
            btn.style.display = bolehAksesLayar(idLayar) ? '' : 'none';
        });
        var elLayarAktif = document.querySelector('.layar.aktif');
        if (elLayarAktif && !bolehAksesLayar(elLayarAktif.id)) tampilkanLayar(elLayarAktif.id);
    }

    /**
     * Gap-closure dokumen "STRUKTUR_MENU_LENGKAP_EBISNIS_ID.md": render drawer sbg POHON collapsible
     * dari taksonomi server (aksi ebisnis_menu_tree), MENGGANTIKAN tombol statis lama (Kasir, Ringkasan,
     * dst -- lihat #drawerTreeContainer di index.html; "Layar Pelanggan"/"Keranjang Tertahan" TETAP
     * statis, bukan bagian taksonomi). HANYA berisi node yg sudah punya layar sungguhan (tersedia:true
     * di ebisnis_menu_master.json), sisanya (peta jalan modul yg belum dibangun) tidak muncul sama
     * sekali. Dipanggil dari segarkanStatus() -- gerbang klik TETAP delegasi di .drawer-nav (lihat
     * listener klik yg sudah diubah jadi delegasi), jadi tombol baru otomatis berfungsi tanpa
     * re-wiring manual.
     */
    async function renderTreeDrawer() {
        var elWadah = document.getElementById('drawerTreeContainer');
        if (!elWadah) return;
        try {
            var r = await AisApi.panggil('ebisnis_menu_tree', { platform: 'android' });
            if (r.status !== '00' && r.status !== 'success') return; // gagal diam -- drawer kosong lbh baik drpd nav error mentah
            var tree = r.tree || [];
            var html = '';
            tree.forEach(function (n) { html += renderNodeDrawer(n); });
            if (html.trim()) {
                elWadah.innerHTML = html;
                var elLayarAktif = document.querySelector('.layar.aktif');
                if (elLayarAktif) document.querySelectorAll('.drawer-item[data-layar="' + elLayarAktif.id + '"]').forEach(function (b) { b.classList.add('aktif'); });
            }
        } catch (e) { /* biarkan drawer kosong -- error jaringan sementara, coba lagi saat segarkanStatus berikutnya */ }
    }

    function ikonUntukPohon(kode) {
        if (kode.indexOf('kasir_pos') === 0) return '&#128179;';
        if (kode.indexOf('produk_dan_harga') === 0) return '&#128230;';
        if (kode.indexOf('pelanggan_dan_crm') === 0) return '&#128100;';
        if (kode.indexOf('pembelian') === 0) return '&#128722;';
        if (kode.indexOf('gudang_dan_persediaan') === 0) return '&#128203;';
        if (kode.indexOf('produksi') === 0) return '&#127981;';
        if (kode.indexOf('penjualan') === 0) return '&#127991;️';
        if (kode.indexOf('keuangan_dan_akuntansi') === 0) return '&#128176;';
        if (kode.indexOf('laporan_dan_analitik') === 0) return '&#128202;';
        if (kode.indexOf('administrasi_sistem') === 0) return '&#9881;️';
        return '&#128193;';
    }

    function renderLeafDrawer(node, ikon) {
        var badge = node.kode === 'kasir_pos.daftar_pesanan' ? '<span class="badge-notif" id="badgePesananBaru" style="display:none;"></span>' : '';
        return '<button type="button" class="drawer-item" data-layar="' + node.rute + '"><span>' + ikon + '</span> <span data-i18n="' + node.label.replace(/"/g, '&quot;') + '">' + node.label + '</span>' + badge + '</button>';
    }

    function renderNodeDrawer(node) {
        var anak = node.children || [];
        var ikon = ikonUntukPohon(node.kode);
        if (anak.length === 0) {
            return node.tersedia && node.rute ? renderLeafDrawer(node, ikon) : '';
        }
        var html = '<div class="drawer-group">';
        html += '<div class="drawer-group-label"><span>' + ikon + '</span> <span data-i18n="' + node.label.replace(/"/g, '&quot;') + '">' + node.label + '</span></div>';
        if (node.tersedia && node.rute) html += renderLeafDrawer(node, ikon);
        anak.forEach(function (a) { html += renderNodeDrawer(a); });
        html += '</div>';
        return html;
    }

    // ==== State ====
    var state = {
        tokoId: null, tokoNama: '', userId: '', caraBayar: [],
        kategori: [], produk: [], kategoriAktif: null, keyword: '',
        cart: [], // {id, kode, nama, harga, jumlah}
        draftAktifId: null, // id DraftPembelianAnggotaKoperasi bila keranjang ini hasil "Muat" dr Keranjang Tertahan -- diisi ke payload bayar/draft_bayar spy menuntaskan/menahan ULANG draft yg SAMA, bukan bikin baris duplikat (lihat catatan resume di _pos.jsp).
        pesananOnline: [], // cache terakhir dari aksi pesanan_list (dipakai layar Pesanan Online & Keranjang Tertahan sekaligus, dibedakan via field dariPembeliOnline)
        sesiKasTerbuka: false,
        sesiKasInfo: {},
        metodeTerpilih: null,
        memberTerpilih: null, // {id, nama, kodeIdentitas, wajibPin, minSaldo}
        isAdminAkun: false,
        supervisorPedagang: false,
        daftarToko: [],
        multiToko: false,
        aksesMenu: null, // null = belum termuat dari server (lihat bolehAksesLayar -- gagal-aman: semua menu tampil sampai konfigurasi() pertama kali berhasil)
        aksesMenuCrud: null
    };
    function bolehAksiMenu(kunci, aksi) {
        if (state.isAdminAkun || state.supervisorPedagang) return true;
        var crud = state.aksesMenuCrud && state.aksesMenuCrud[kunci];
        if (!crud) return false;
        if (crud.supervisor === true) return true;
        return crud[aksi] !== false;
    }
    /** Gerbang tampilan layar "Produk" -- membaca supervisor toko lama ATAU CRUD/Supervisor per menu dari Tbmrole.ebisnisMenu. */
    function bolehKelolaProduk() { return bolehAksiMenu('produk', 'update') || bolehAksiMenu('produk', 'create'); }

    // =====================================================================
    // ==== Layar Login -- wizard 2 langkah (Pengaturan Server -> Masuk) ====
    // =====================================================================
    var elServerError = document.getElementById('serverError');
    var elInHost = document.getElementById('inHost');
    var elInContextPath = document.getElementById('inContextPath');
    var elInHttps = document.getElementById('inHttps');
    var elPreviewUrl = document.getElementById('previewUrl');
    var elHasilTes = document.getElementById('hasilTes');
    var elHasilTesTeks = document.getElementById('hasilTesTeks');
    var elBtnTesKoneksi = document.getElementById('btnTesKoneksi');
    var elBtnLanjutKeLogin = document.getElementById('btnLanjutKeLogin');
    var elDotLangkah1 = document.getElementById('dotLangkah1');
    var elDotLangkah2 = document.getElementById('dotLangkah2');
    var elStepServer = document.getElementById('stepServer');
    var elStepMasuk = document.getElementById('stepMasuk');
    var elTxtServerAktif = document.getElementById('txtServerAktif');
    var elBtnGantiServer = document.getElementById('btnGantiServer');

    var elLoginError = document.getElementById('loginError');
    var elInUserid = document.getElementById('inUserid');
    var elInPassword = document.getElementById('inPassword');
    var elBtnMasuk = document.getElementById('btnMasuk');

    /** {@code true} hanya bila tes koneksi SUKSES utk kombinasi host/contextPath/https PERSIS
     * sama dgn yg tampil saat ini -- direset tiap input berubah, supaya "Lanjut" tak pernah
     * mengizinkan konfigurasi yg belum benar-benar terverifikasi. Pola sama dgn wizard Desktop. */
    var sudahTesBerhasil = false;

    function cfgDariFormServer() {
        return { host: elInHost.value.trim(), contextPath: elInContextPath.value.trim(), https: elInHttps.checked };
    }

    function segarkanPreviewUrl() {
        var cfg = cfgDariFormServer();
        var skema = cfg.https ? 'https' : 'http';
        var host = cfg.host || '...';
        var ctx = cfg.contextPath ? cfg.contextPath.replace(/^\/+|\/+$/g, '') + '/' : '';
        elPreviewUrl.textContent = skema + '://' + host + '/' + ctx + 'PosApi';
    }

    function tandaiBelumTes() {
        sudahTesBerhasil = false;
        elBtnLanjutKeLogin.disabled = true;
        elHasilTes.className = 'hasil-tes';
        segarkanPreviewUrl();
    }
    [elInHost, elInContextPath].forEach(function (el) { el.addEventListener('input', tandaiBelumTes); });
    elInHttps.addEventListener('change', tandaiBelumTes);

    async function isiFormDariCfgTersimpan() {
        var cfg = await AisApi.bacaCfg();
        if (cfg) {
            elInHost.value = cfg.host || '';
            elInContextPath.value = cfg.contextPath || '';
            elInHttps.checked = cfg.https !== false;
            elInUserid.value = cfg.username || '';
        }
        segarkanPreviewUrl();
    }

    elBtnTesKoneksi.addEventListener('click', async function () {
        var cfg = cfgDariFormServer();
        if (!cfg.host) {
            elServerError.textContent = 'Alamat server wajib diisi.';
            elServerError.className = 'pesan-error tampil';
            return;
        }
        elServerError.className = 'pesan-error';
        elBtnTesKoneksi.disabled = true;
        elHasilTes.className = 'hasil-tes tampil proses';
        elHasilTes.querySelector('.ico').textContent = '⏳';
        elHasilTesTeks.textContent = 'Menghubungi server...';
        try {
            var r = await AisApi.tesKoneksi(cfg);
            if (r.ok) {
                sudahTesBerhasil = true;
                elBtnLanjutKeLogin.disabled = false;
                elHasilTes.className = 'hasil-tes tampil sukses';
                elHasilTes.querySelector('.ico').textContent = '✅';
                elHasilTesTeks.textContent = 'Berhasil terhubung ke server.';
            } else {
                sudahTesBerhasil = false;
                elBtnLanjutKeLogin.disabled = true;
                elHasilTes.className = 'hasil-tes tampil gagal';
                elHasilTes.querySelector('.ico').textContent = '❌';
                elHasilTesTeks.textContent = r.pesan || 'Gagal terhubung.';
                if (r.error) ErrorAlert.tampilkanDariException(r.error, 'Tes Koneksi');
            }
        } catch (e) {
            sudahTesBerhasil = false;
            elBtnLanjutKeLogin.disabled = true;
            elHasilTes.className = 'hasil-tes tampil gagal';
            elHasilTesTeks.textContent = 'Terjadi kesalahan tak terduga saat menguji koneksi.';
            ErrorAlert.tampilkanDariException(e, 'Tes Koneksi');
        } finally {
            elBtnTesKoneksi.disabled = false;
        }
    });

    function pindahKeLangkah(nomor) {
        elStepServer.className = 'step-wizard' + (nomor === 1 ? ' aktif' : '');
        elStepMasuk.className = 'step-wizard' + (nomor === 2 ? ' aktif' : '');
        elDotLangkah1.className = 'dot' + (nomor === 1 ? ' aktif' : ' selesai');
        elDotLangkah2.className = 'dot' + (nomor === 2 ? ' aktif' : '');
        if (nomor === 2) {
            var cfg = cfgDariFormServer();
            elTxtServerAktif.textContent = (cfg.https ? 'https' : 'http') + '://' + cfg.host + (cfg.contextPath ? '/' + cfg.contextPath : '');
            setTimeout(function () { elInUserid.focus(); }, 50);
        }
    }

    elBtnLanjutKeLogin.addEventListener('click', async function () {
        if (!sudahTesBerhasil) return;
        try {
            await AisApi.simpanCfg(cfgDariFormServer());
        } catch (e) {
            ErrorAlert.tampilkanDariException(e, 'Simpan Pengaturan Server');
            return;
        }
        pindahKeLangkah(2);
    });
    elBtnGantiServer.addEventListener('click', function () { pindahKeLangkah(1); });

    elBtnMasuk.addEventListener('click', async function () {
        elLoginError.className = 'pesan-error';
        var userid = elInUserid.value.trim();
        var password = elInPassword.value;
        if (!userid || !password) {
            elLoginError.textContent = 'Userid dan kata sandi wajib diisi.';
            elLoginError.className = 'pesan-error tampil';
            return;
        }
        elBtnMasuk.disabled = true;
        elBtnMasuk.textContent = 'Memeriksa...';
        try {
            var r = await AisApi.login(cfgDariFormServer(), userid, password);
            if (!r.ok) {
                elLoginError.textContent = r.pesan;
                elLoginError.className = 'pesan-error tampil';
                if (r.error) ErrorAlert.tampilkanDariException(r.error, 'Masuk');
                return;
            }
            await masukKeAplikasi();
        } catch (e) {
            // Jaring pengaman TERAKHIR -- lihat JavaDoc error-alert.js. Sebelum perbaikan ini,
            // exception di sini hilang tanpa jejak (tombol "Masuk" reset diam-diam di `finally`,
            // TANPA pesan apa pun) -- inilah akar penyebab bug "klik Masuk tidak merespons".
            ErrorAlert.tampilkanDariException(e, 'Masuk');
        } finally {
            elBtnMasuk.disabled = false;
            elBtnMasuk.textContent = 'Masuk';
        }
    });

    // =====================================================================
    // ==== Layar POS: header/status ====
    // =====================================================================
    var elTxtNamaToko = document.getElementById('txtNamaToko');
    var elSelectTokoAktif = document.getElementById('selectTokoAktif');
    var elPillStatus = document.getElementById('pillStatus');
    var elTxtStatus = document.getElementById('txtStatus');

    document.getElementById('btnKeluar').addEventListener('click', async function () {
        await AisApi.logout();
        tampilkanLayar('layarLogin');
    });

    // =====================================================================
    // ==== Sinkronisasi Offline-First ====
    // =====================================================================
    var elPillSinkron = document.getElementById('pillSinkron');
    var elTxtSinkronSingkat = document.getElementById('txtSinkronSingkat');
    var elOverlaySinkron = document.getElementById('overlaySinkron');
    var elBtnTutupSinkron = document.getElementById('btnTutupSinkron');
    var elSinkronRingkas = document.getElementById('sinkronRingkas');
    var elDaftarSinkronPending = document.getElementById('daftarSinkronPending');
    var elBtnSinkronSekarang = document.getElementById('btnSinkronSekarang');

    /** Segarkan lencana jumlah transaksi menunggu sinkron di topbar -- dipanggil berkala + stlh checkout/sinkron. */
    async function segarkanBadgeSinkron() {
        try {
            var jumlah = await OfflineQueue.hitungPending();
            if (jumlah > 0) {
                elPillSinkron.style.display = 'inline-flex';
                elTxtSinkronSingkat.textContent = jumlah + ' menunggu';
            } else {
                elPillSinkron.style.display = 'none';
            }
        } catch (e) { /* IndexedDB gagal -- diamkan, bukan fitur inti */ }
    }

    async function renderModalSinkron() {
        try {
            var daftar = await OfflineQueue.listPending();
            if (daftar.length === 0) {
                elSinkronRingkas.textContent = 'Semua transaksi sudah tersinkron -- tidak ada yang menunggu.';
                elDaftarSinkronPending.innerHTML = '';
                return;
            }
            elSinkronRingkas.textContent = daftar.length + ' transaksi tersimpan lokal, menunggu dikirim ke server.';
            elDaftarSinkronPending.innerHTML = daftar.map(function (row) {
                var waktu = '-';
                try { waktu = new Date(row.waktu).toLocaleString('id-ID'); } catch (e2) { /* abaikan */ }
                return '<div class="baris-sinkron-pending"><div><div class="kode">' + escapeHtml(row.clientTrxId) + '</div><div class="waktu">' + escapeHtml(waktu) + '</div></div>'
                    + '<div>' + formatRupiah(row.total) + (row.pesanError ? '<div class="gagal">' + escapeHtml(row.pesanError) + '</div>' : '') + '</div></div>';
            }).join('');
        } catch (e) {
            elSinkronRingkas.textContent = 'Gagal membaca antrean lokal: ' + (e && e.message ? e.message : e);
        }
    }

    elPillSinkron.addEventListener('click', async function () {
        elOverlaySinkron.classList.add('tampil');
        await renderModalSinkron();
    });
    elBtnTutupSinkron.addEventListener('click', function () { elOverlaySinkron.classList.remove('tampil'); });

    elBtnSinkronSekarang.addEventListener('click', async function () {
        elBtnSinkronSekarang.disabled = true;
        elBtnSinkronSekarang.textContent = 'Menyinkronkan...';
        try {
            var hasil = await OfflineQueue.sinkronkanSemua();
            if (hasil.ok) {
                toast('success', hasil.berhasil + ' transaksi tersinkron' + (hasil.gagal > 0 ? ', ' + hasil.gagal + ' ditolak server (lihat detail).' : '.'));
            } else {
                toast('info', hasil.pesan || 'Sinkronisasi belum bisa dilakukan.');
            }
            await renderModalSinkron();
            await segarkanBadgeSinkron();
        } catch (e) {
            toast('error', 'Gagal sinkronisasi: ' + (e && e.message ? e.message : e));
        } finally {
            elBtnSinkronSekarang.disabled = false;
            elBtnSinkronSekarang.textContent = 'Sinkronkan Sekarang';
        }
    });

    function renderPilihTokoAktif() {
        if (!elSelectTokoAktif) return;
        var daftar = state.daftarToko || [];
        if (daftar.length <= 1) {
            elSelectTokoAktif.style.display = 'none';
            return;
        }
        elSelectTokoAktif.innerHTML = daftar.map(function (t) {
            return '<option value="' + escapeHtml(t.id) + '">' + escapeHtml(t.nama || ('Toko #' + t.id)) + '</option>';
        }).join('');
        if (state.tokoId != null) elSelectTokoAktif.value = String(state.tokoId);
        var dipilih = daftar.filter(function (t) { return String(t.id) === String(elSelectTokoAktif.value); })[0];
        if (dipilih) {
            state.tokoId = dipilih.id;
            state.tokoNama = dipilih.nama || state.tokoNama;
            elTxtNamaToko.textContent = state.tokoNama;
        }
        AisApi.setTokoAktif(state.tokoId);
        elSelectTokoAktif.style.display = '';
    }

    if (elSelectTokoAktif) {
        elSelectTokoAktif.addEventListener('change', async function () {
            var id = elSelectTokoAktif.value;
            if (!id) return;
            elSelectTokoAktif.disabled = true;
            try {
                var r = await AisApi.panggil('pilih_toko_aktif', { tokoId: Number(id) });
                if (r.status !== 'success') {
                    toast('error', pesanDariHasil(r, 'Gagal mengganti toko aktif.'));
                    renderPilihTokoAktif();
                    return;
                }
                AisApi.setTokoAktif(Number(id));
                toast('success', 'Toko aktif diganti.');
                setTimeout(function () { location.reload(); }, 500);
            } catch (e) {
                toast('error', (e && e.pesan) || (e && e.message) || 'Gagal mengganti toko aktif.');
            } finally {
                elSelectTokoAktif.disabled = false;
            }
        });
    }

    async function segarkanStatus() {
        try {
            var r = await AisApi.panggil('konfigurasi', {});
            var online = r.status === 'success';
            elPillStatus.className = 'pill-status ' + (online ? 'online' : 'offline');
            elTxtStatus.textContent = online ? 'Online' : 'Offline';
            if (online) {
                state.tokoNama = r.tokoNama || '';
                state.tokoId = r.tokoId != null ? r.tokoId : state.tokoId;
                state.caraBayar = r.caraBayar || [];
                state.isAdminAkun = !!r.isAdmin;
                state.supervisorPedagang = !!r.supervisorPedagang;
                state.daftarToko = r.daftarToko || [];
                state.multiToko = !!r.multiToko || state.daftarToko.length > 1;
                state.aksesMenu = r.aksesMenu || null;
                state.aksesMenuCrud = r.aksesMenuCrud || null;
                state.formatImporEkspor = r.formatImporEkspor || [];
                AisApi.setTokoAktif(state.tokoId);
                terapkanAksesMenuDrawer();
                if (!state.treeDrawerDimuat) { state.treeDrawerDimuat = true; renderTreeDrawer(); }
                elTxtNamaToko.textContent = state.tokoNama || ('Kasir - ' + state.userId);
                renderPilihTokoAktif();
            }
        } catch (e) {
            elPillStatus.className = 'pill-status offline';
            elTxtStatus.textContent = 'Offline';
        }
        segarkanBadgeSinkron();
    }

    // =====================================================================
    // ==== Katalog: kategori + grid produk ====
    // =====================================================================
    var elKategoriScroll = document.getElementById('kategoriScroll');
    var elGridProduk = document.getElementById('gridProduk');
    var elPaginasiProdukKasir = document.getElementById('paginasiProdukKasir');
    var elInCari = document.getElementById('inCari');
    // Gap-closure "paging 25/hal spy katalog sangat besar tak dimuat sekaligus" -- direset ke
    // halaman 1 tiap kali filter kategori/pencarian berubah (lihat renderKategori/elInCari di bawah).
    var stateProdukKasir = { page: 1, pageSize: 25 };

    function renderKategori() {
        var html = '<button class="pill-kategori' + (state.kategoriAktif == null ? ' aktif' : '') + '" data-id="">Semua</button>';
        state.kategori.forEach(function (k) {
            html += '<button class="pill-kategori' + (state.kategoriAktif === k.id ? ' aktif' : '') + '" data-id="' + k.id + '">' + escapeHtml(k.nama) + '</button>';
        });
        elKategoriScroll.innerHTML = html;
        elKategoriScroll.querySelectorAll('.pill-kategori').forEach(function (btn) {
            btn.addEventListener('click', function () {
                var id = btn.getAttribute('data-id');
                state.kategoriAktif = id === '' ? null : Number(id);
                stateProdukKasir.page = 1;
                renderKategori();
                renderGridProduk();
            });
        });
    }

    function produkTersaring() {
        return state.produk.filter(function (p) {
            if (state.kategoriAktif != null && p.kategoriId !== state.kategoriAktif) return false;
            if (state.keyword && p.nama.toLowerCase().indexOf(state.keyword.toLowerCase()) < 0 && p.kode.toLowerCase().indexOf(state.keyword.toLowerCase()) < 0 && (p.barcode || '').toLowerCase().indexOf(state.keyword.toLowerCase()) < 0) return false;
            return true;
        });
    }

    function renderGridProduk() {
        var daftar = produkTersaring();
        var totalHal = Math.max(1, Math.ceil(daftar.length / stateProdukKasir.pageSize));
        if (stateProdukKasir.page > totalHal) stateProdukKasir.page = totalHal;
        if (stateProdukKasir.page < 1) stateProdukKasir.page = 1;
        var awal = (stateProdukKasir.page - 1) * stateProdukKasir.pageSize;
        var halamanIni = daftar.slice(awal, awal + stateProdukKasir.pageSize);

        elPaginasiProdukKasir.innerHTML = '';
        if (daftar.length > 0) {
            stateProdukKasir.total = daftar.length;
            elPaginasiProdukKasir.appendChild(renderPaginasiLt(stateProdukKasir, renderGridProduk));
        }

        if (daftar.length === 0) {
            elGridProduk.innerHTML = '<div style="grid-column:1/-1;text-align:center;color:var(--faint);padding:40px 16px;font-size:12.5px;">Tidak ada produk.</div>';
            return;
        }
        var html = '';
        halamanIni.forEach(function (p) {
            var badge = '';
            if (p.stok <= 0) badge = '<span class="badge-stok habis">Habis</span>';
            else if (p.stok <= 5) badge = '<span class="badge-stok rendah">Stok ' + p.stok + '</span>';
            var thumb = p.gambarUrl ? '<img src="' + escapeHtml(p.gambarUrl) + '" alt="">' : '&#128230;';
            html += '<div class="kartu-produk" data-id="' + p.id + '">'
                + '<div class="thumb">' + thumb + '</div>'
                + '<div class="nama">' + escapeHtml(p.nama) + '</div>'
                + '<div class="harga">' + formatRupiah(p.hargaJual) + '</div>'
                + badge
                + '</div>';
        });
        elGridProduk.innerHTML = html;
        elGridProduk.querySelectorAll('.kartu-produk').forEach(function (el) {
            el.addEventListener('click', function () { tambahKeKeranjang(Number(el.getAttribute('data-id'))); });
        });
    }

    var cariTimer = null;
    elInCari.addEventListener('input', function () {
        clearTimeout(cariTimer);
        cariTimer = setTimeout(function () { state.keyword = elInCari.value.trim(); stateProdukKasir.page = 1; renderGridProduk(); }, 250);
    });

    /**
     * Fitur "Scan Barcode" -- scanner USB-HID/Bluetooth-keyboard mengetik kode SUPER cepat lalu
     * mengirim Enter di akhir (perilaku standar semua scanner kelas kasir), dideteksi dari kotak
     * cari yg SAMA (bukan input terpisah -- kasir bisa scan ATAU ketik cari manual dari kotak yg
     * sama). Kode yg discan HARUS cocok PERSIS (bukan sekadar mengandung) dgn kode SATU produk baru
     * langsung masuk keranjang + kotak cari langsung dikosongkan, siap scan barang berikutnya tanpa
     * kasir perlu menghapus teks lama manual. Kalau tak ada yg cocok persis (mis. kasir memang lagi
     * ketik cari manual lalu tak sengaja Enter), kotak TIDAK dikosongkan -- hasil filter tetap tampil.
     */
    elInCari.addEventListener('keydown', function (event) {
        if (event.key !== 'Enter') return;
        event.preventDefault();
        var kodeScan = elInCari.value.trim().toLowerCase();
        if (!kodeScan) return;
        var cocokPersis = state.produk.filter(function (p) { return (p.kode || '').toLowerCase() === kodeScan || (p.barcode || '').toLowerCase() === kodeScan; })[0];
        if (cocokPersis) {
            tambahKeKeranjang(cocokPersis.id);
            elInCari.value = '';
            state.keyword = '';
            renderGridProduk();
            elInCari.focus();
        }
        // Gap-closure: saat TIDAK cocok persis (lihat JavaDoc di atas), kotak sengaja tidak dikosongkan
        // supaya hasil filter cari manual tetap tampil -- TAPI itu berarti teks lama tertinggal di
        // kotak, dan scanner fisik cuma "mengetik" karakter tanpa pernah menghapus sendiri, jadi scan
        // BERIKUTNYA numpuk nyambung di belakang teks lama. Select-all di sini (aman jg saat kotak
        // sudah dikosongkan di atas -- no-op) membuat karakter scan berikutnya OTOMATIS menimpa
        // seleksi ini, perilaku baku elemen <input> saat mengetik sementara ada teks terseleksi.
        elInCari.focus();
        elInCari.select();
    });

    /**
     * Gap-closure "Kasir Android: scan barcode/QR via kamera HP" -- padanan kamera "SO by Scan"
     * (lihat mulaiKameraScanSo/beepSo di atas, dipakai ULANG apa adanya, TIDAK diduplikasi) tapi utk
     * layar Kasir: hasil scan langsung dicocokkan ke {@code state.produk} (cache lokal yg SUDAH
     * dimuat, bukan panggilan server baru -- konsisten dgn Kasir yg SELALU baca lokal saja, lihat
     * JavaDoc muatKatalog) memakai ATURAN PENCOCOKAN YANG SAMA PERSIS dgn scanner fisik di kotak cari
     * (kode ATAU barcode, cocok PERSIS) supaya perilaku scan kamera vs scan fisik konsisten. Kamera
     * TETAP menyala setelah satu scan sukses (bukan auto-tutup) -- kasir biasanya scan banyak barang
     * berturut-turut ke satu keranjang, sama seperti alur SO.
     */
    var instansiKameraScanKasir = null;
    var kameraScanKasirAktif = false;
    var kunciKameraScanKasir = false;

    function prosesKodeDiscanKasir(kode) {
        var kodeCari = (kode || '').trim().toLowerCase();
        if (!kodeCari) return;
        var cocokPersis = state.produk.filter(function (p) { return (p.kode || '').toLowerCase() === kodeCari || (p.barcode || '').toLowerCase() === kodeCari; })[0];
        if (cocokPersis) {
            tambahKeKeranjang(cocokPersis.id);
            beepSo(true);
            toast('success', cocokPersis.nama + ' ditambahkan ke keranjang.');
        } else {
            beepSo(false);
            toast('error', 'Barcode "' + kode + '" tidak dikenal di katalog toko ini.');
        }
    }

    async function mulaiKameraScanKasir() {
        if (typeof Html5Qrcode === 'undefined') { toast('error', 'Modul kamera tidak tersedia.'); return; }
        elReaderKameraKasir.style.display = 'block';
        instansiKameraScanKasir = new Html5Qrcode('readerKameraKasir');
        try {
            await instansiKameraScanKasir.start(
                { facingMode: 'environment' },
                { fps: 10, qrbox: 200 },
                function (kodeTerdeteksi) {
                    if (kunciKameraScanKasir) return;
                    kunciKameraScanKasir = true;
                    prosesKodeDiscanKasir(kodeTerdeteksi);
                    setTimeout(function () { kunciKameraScanKasir = false; }, 1200);
                },
                function () { /* per-frame tak terdeteksi -- abaikan, normal & sering terjadi */ }
            );
            kameraScanKasirAktif = true;
            elBtnKameraScanKasir.classList.add('aktif');
            elBtnKameraScanKasir.innerHTML = '&#10005;';
        } catch (e) {
            elReaderKameraKasir.style.display = 'none';
            toast('error', 'Tidak bisa mengakses kamera: ' + (e && e.message ? e.message : e));
        }
    }

    function hentikanKameraScanKasir() {
        if (!kameraScanKasirAktif || !instansiKameraScanKasir) return;
        kameraScanKasirAktif = false;
        elBtnKameraScanKasir.classList.remove('aktif');
        elBtnKameraScanKasir.innerHTML = '&#128247;';
        instansiKameraScanKasir.stop().then(function () { return instansiKameraScanKasir.clear(); }).catch(function () { /* abaikan -- sudah berhenti/hancur */ }).finally(function () {
            elReaderKameraKasir.style.display = 'none';
            instansiKameraScanKasir = null;
        });
    }

    var elBtnKameraScanKasir = document.getElementById('btnKameraScanKasir');
    var elReaderKameraKasir = document.getElementById('readerKameraKasir');
    elBtnKameraScanKasir.addEventListener('click', function () { kameraScanKasirAktif ? hentikanKameraScanKasir() : mulaiKameraScanKasir(); });

    /**
     * Gap-closure "layar Kasir HANYA baca local DB (sangat ringan)" -- TIDAK PERNAH memanggil
     * {@code AisApi.panggil('katalog', ...)} langsung (beda dgn layar admin Produk, yg tetap live)
     * -- selalu baca {@code ProdukCache} (IndexedDB), padanan Android dari {@code local-db.js
     * produkCacheUntukKasir} (Desktop). Kesegaran data dijamin sinkron otomatis berkala terpisah
     * (10 menit, {@code ProdukCache.mulaiAutoSyncProduk}) + sinkron sekali segera saat masuk aplikasi
     * (lihat {@code masukKeAplikasi}) -- BUKAN oleh fungsi ini. Cache sudah pasti hanya berisi produk
     * aktif milik toko sendiri (server {@code PriceTagUtil.listProduk} memfilter {@code aktif}, dan
     * {@code katalog} yg mengisi cache selalu dipanggil TANPA {@code semuaToko} -- lihat JavaDoc
     * {@code produk-cache.js}), jadi tak perlu filter tambahan di sini.
     */
    async function muatKatalog() {
        var daftar = [];
        try { daftar = await ProdukCache.produkCacheSemua(); } catch (e) { daftar = []; }
        var petaKategori = {};
        var urutanKategori = [];
        daftar.forEach(function (p) {
            if (p.kategoriId != null && !petaKategori.hasOwnProperty(p.kategoriId)) {
                petaKategori[p.kategoriId] = p.kategoriNama || '';
                urutanKategori.push(p.kategoriId);
            }
        });
        urutanKategori.sort(function (a, b) { return (petaKategori[a] || '').localeCompare(petaKategori[b] || ''); });
        state.kategori = urutanKategori.map(function (id) { return { id: id, nama: petaKategori[id] }; });
        state.produk = daftar;
        stateProdukKasir.page = 1;
        renderKategori();
        renderGridProduk();
    }

    // =====================================================================
    // ==== Keranjang ====
    // =====================================================================
    var elKeranjangList = document.getElementById('keranjangList');
    var elTxtSubtotal = document.getElementById('txtSubtotal');
    var elBarisTxtDiskon = document.getElementById('barisTxtDiskon');
    var elTxtDiskon = document.getElementById('txtDiskon');
    var elBarisTxtCashback = document.getElementById('barisTxtCashback');
    var elTxtCashback = document.getElementById('txtCashback');
    var elTxtTotal = document.getElementById('txtTotal');
    var elBtnBuka2Bayar = document.getElementById('btnBuka2Bayar');
    var elBtnTahanKeranjang = document.getElementById('btnTahanKeranjang');
    var elPanelKeranjang = document.getElementById('panelKeranjang');
    var elFabKeranjang = document.getElementById('fabKeranjang');
    var elFabJumlah = document.getElementById('fabJumlah');
    var elOverlayGelapKeranjang = document.getElementById('overlayGelapKeranjang');
    var elBtnTutupKeranjang = document.getElementById('btnTutupKeranjang');

    function tambahKeKeranjang(produkId) {
        var p = state.produk.filter(function (x) { return x.id === produkId; })[0];
        if (!p) return;
        if (p.stok <= 0) { toast('error', 'Stok "' + p.nama + '" habis.'); return; }
        var baris = state.cart.filter(function (c) { return c.id === produkId; })[0];
        if (baris) baris.jumlah++;
        else state.cart.push({ id: p.id, kode: p.kode, nama: p.nama, harga: p.hargaJual, jumlah: 1, diskon: 0, cashback: 0, aturanDiskon: null });
        renderKeranjang();
        toast('success', p.nama + ' ditambahkan.');
        jadwalkanEvaluasiDiskon();
    }

    function ubahJumlah(produkId, delta) {
        var baris = state.cart.filter(function (c) { return c.id === produkId; })[0];
        if (!baris) return;
        baris.jumlah += delta;
        if (baris.jumlah <= 0) state.cart = state.cart.filter(function (c) { return c.id !== produkId; });
        renderKeranjang();
        jadwalkanEvaluasiDiskon();
    }

    function hitungSubtotal() {
        return state.cart.reduce(function (s, c) { return s + c.harga * c.jumlah; }, 0);
    }

    /**
     * Fase 4 -- ringkasan keranjang SUDAH memperhitungkan diskon otomatis (lihat JavaDoc server
     * {@code KantinHelper.diskonEvaluasi}). Android tak punya konsep pajak checkout (beda dari
     * Desktop/JSP yg punya {@code pajakPersen}) -- jadi {@code total = subtotal - totalDiskon},
     * TANPA suku pajak. Cashback TIDAK mengurangi total (reward terpisah, dicairkan lewat alur admin).
     */
    function hitungRingkasanKeranjang() {
        var subtotal = 0, totalDiskon = 0, totalCashback = 0;
        state.cart.forEach(function (c) {
            subtotal += c.harga * c.jumlah;
            totalDiskon += (c.diskon || 0);
            totalCashback += (c.cashback || 0);
        });
        return { subtotal: subtotal, totalDiskon: totalDiskon, totalCashback: totalCashback, total: subtotal - totalDiskon };
    }

    var diskonDebounceTimer = null;
    function jadwalkanEvaluasiDiskon() {
        clearTimeout(diskonDebounceTimer);
        if (state.cart.length === 0) return;
        diskonDebounceTimer = setTimeout(function () {
            evaluasiDiskonKeranjang().then(renderKeranjang);
        }, 250);
    }

    async function evaluasiDiskonKeranjang() {
        if (state.cart.length === 0) return;
        try {
            var items = state.cart.map(function (c) { return { id: c.id, harga: c.harga, jumlah: c.jumlah }; });
            var r = await AisApi.panggil('diskon_evaluasi', { id_member: state.memberTerpilih ? state.memberTerpilih.id : null, items: items });
            var byId = {};
            if (r.status === 'success' && Array.isArray(r.items)) {
                r.items.forEach(function (it) { byId[it.id] = it; });
            }
            state.cart.forEach(function (c) {
                var it = byId[c.id];
                c.diskon = it ? (Number(it.diskon) || 0) : 0;
                c.cashback = it ? (Number(it.cashback) || 0) : 0;
                c.aturanDiskon = it && it.aturanDiskon != null ? it.aturanDiskon : null;
            });
        } catch (e) {
            state.cart.forEach(function (c) { c.diskon = 0; c.cashback = 0; c.aturanDiskon = null; });
        }
    }

    function renderKeranjang() {
        if (state.cart.length === 0) {
            elKeranjangList.innerHTML = '<div class="keranjang-kosong">&#128722;<br>Keranjang kosong -- ketuk produk untuk menambah.</div>';
        } else {
            var html = '';
            state.cart.forEach(function (c) {
                var promo = (c.diskon > 0 ? ('<span class="badge-promo-item potong">-' + formatRupiah(c.diskon) + '</span>') : '')
                    + (c.cashback > 0 ? ('<span class="badge-promo-item cashback">+' + formatRupiah(c.cashback) + '</span>') : '');
                html += '<div class="baris-keranjang">'
                    + '<div class="info"><div class="nama">' + escapeHtml(c.nama) + '</div><div class="harga">' + formatRupiah(c.harga) + '</div>' + (promo ? '<div class="baris-promo-item">' + promo + '</div>' : '') + '</div>'
                    + '<div class="stepper">'
                    + '<button data-id="' + c.id + '" data-d="-1">-</button>'
                    + '<span class="jml">' + c.jumlah + '</span>'
                    + '<button data-id="' + c.id + '" data-d="1">+</button>'
                    + '</div></div>';
            });
            elKeranjangList.innerHTML = html;
            elKeranjangList.querySelectorAll('.stepper button').forEach(function (btn) {
                btn.addEventListener('click', function () { ubahJumlah(Number(btn.getAttribute('data-id')), Number(btn.getAttribute('data-d'))); });
            });
        }
        var ringkasan = hitungRingkasanKeranjang();
        elTxtSubtotal.textContent = formatRupiah(ringkasan.subtotal);
        elBarisTxtDiskon.style.display = ringkasan.totalDiskon > 0 ? 'flex' : 'none';
        elTxtDiskon.textContent = '- ' + formatRupiah(ringkasan.totalDiskon);
        elBarisTxtCashback.style.display = ringkasan.totalCashback > 0 ? 'flex' : 'none';
        elTxtCashback.textContent = '+ ' + formatRupiah(ringkasan.totalCashback);
        elTxtTotal.textContent = formatRupiah(ringkasan.total);
        var jumlahItem = state.cart.reduce(function (s, c) { return s + c.jumlah; }, 0);
        elFabJumlah.textContent = jumlahItem;
        elFabKeranjang.className = 'fab-keranjang' + (jumlahItem > 0 && window.innerWidth < 900 ? ' tampil' : '');
        elBtnBuka2Bayar.disabled = state.cart.length === 0 || !state.sesiKasTerbuka;
        elBtnTahanKeranjang.disabled = state.cart.length === 0 || !state.sesiKasTerbuka;
        siarkanLayarPelanggan();
    }

    function bukaPanelKeranjang() {
        elPanelKeranjang.classList.add('tampil');
        elOverlayGelapKeranjang.classList.add('tampil');
        elBtnTutupKeranjang.style.display = '';
    }
    function tutupPanelKeranjang() {
        elPanelKeranjang.classList.remove('tampil');
        elOverlayGelapKeranjang.classList.remove('tampil');
    }
    elFabKeranjang.addEventListener('click', bukaPanelKeranjang);
    elOverlayGelapKeranjang.addEventListener('click', tutupPanelKeranjang);
    elBtnTutupKeranjang.addEventListener('click', tutupPanelKeranjang);
    window.addEventListener('resize', function () { if (window.innerWidth >= 900) tutupPanelKeranjang(); renderKeranjang(); });

    // =====================================================================
    // ==== Sesi Kas ====
    // =====================================================================
    var elOverlaySesiKas = document.getElementById('overlaySesiKas');
    var elInModalAwal = document.getElementById('inModalAwal');
    var elBtnSubmitBukaKas = document.getElementById('btnSubmitBukaKas');
    var elPillKas = document.getElementById('pillKas');
    var elTxtKasSingkat = document.getElementById('txtKasSingkat');
    var elOverlayTutupKas = document.getElementById('overlayTutupKas');
    var elBtnTutupTutupKas = document.getElementById('btnTutupTutupKas');
    var elTkModalAwal = document.getElementById('tkModalAwal');
    var elTkTunai = document.getElementById('tkTunai');
    var elTkNonTunai = document.getElementById('tkNonTunai');
    var elTkSeharusnya = document.getElementById('tkSeharusnya');
    var elInUangFisik = document.getElementById('inUangFisik');
    var elInKetTutupKas = document.getElementById('inKetTutupKas');
    var elBtnSubmitTutupKas = document.getElementById('btnSubmitTutupKas');

    /**
     * ==== Fitur "Sesi Kasir OFFLINE-FIRST" ====
     * Sama persis dgn perombakan versi Desktop (local-db.js/main.js) -- status/buka/tutup dijawab
     * SEKETIKA dari database lokal ({@code SesiKasOffline}, lihat JavaDoc lengkap di
     * sesi-kas-offline.js), TIDAK LAGI menunggu round-trip server sama sekali utk memutuskan "kas
     * terbuka atau tidak". Ini akhirnya menyelesaikan bug lapangan berkepanjangan "Kas Belum Dibuka
     * macet" yg gejalanya identik di kedua platform (Desktop & Android) -- akar masalah SEBENARNYA
     * ada di server (interceptor audit menimpa identitas kasir), tapi solusi paling tahan-banting di
     * sisi klien adalah TIDAK bergantung pada round-trip server utk keputusan sekritis ini. Sinkron
     * ke server berjalan di latar via {@code SesiKasOffline.sinkronkanSemua/Satu} (dipanggil sekali
     * saat masuk Kasir + berkala tiap 30 detik + saat koneksi pulih -- lihat {@code mulaiAutoSync}).
     */
    async function cekSesiKas() {
        var lokal = await SesiKasOffline.sesiAktifLokal(state.tokoId);
        if (!lokal) {
            state.sesiKasTerbuka = false;
            state.sesiKasInfo = {};
            elOverlaySesiKas.classList.add('tampil');
            elPillKas.style.display = 'none';
            renderKeranjang();
            return;
        }
        var data = {
            terbuka: true,
            waktuBuka: lokal.waktuBuka,
            modalAwal: lokal.modalAwal,
            totalTunai: 0,
            totalNonTunai: 0,
            kasSaatIni: lokal.modalAwal,
            belumSinkron: !lokal.tersinkronBuka
        };
        // Pengayaan best-effort: tanya server angka penjualan BERJALAN yg akurat (bukan cuma modal
        // awal) -- gagal/offline TIDAK apa-apa, gerbang "terbuka" di atas SUDAH final dari lokal.
        try {
            var rServer = await AisApi.panggil('sesi_kas_status', { id_toko: state.tokoId });
            if (rServer.status === 'success' && rServer.terbuka) {
                data.totalTunai = rServer.totalTunai || 0;
                data.totalNonTunai = rServer.totalNonTunai || 0;
                data.kasSaatIni = rServer.kasSaatIni != null ? rServer.kasSaatIni : data.kasSaatIni;
            }
        } catch (e) { /* murni pengayaan tampilan, diamkan */ }

        state.sesiKasTerbuka = true;
        state.sesiKasInfo = data;
        elOverlaySesiKas.classList.remove('tampil');
        elPillKas.style.display = 'inline-flex';
        elTxtKasSingkat.textContent = formatRupiah(data.kasSaatIni) + (data.belumSinkron ? ' ⏳' : '');
        renderKeranjang();
    }

    elPillKas.addEventListener('click', function () {
        var info = state.sesiKasInfo || {};
        var seharusnya = (Number(info.modalAwal) || 0) + (Number(info.totalTunai) || 0);
        elTkModalAwal.textContent = formatRupiah(info.modalAwal);
        elTkTunai.textContent = formatRupiah(info.totalTunai);
        elTkNonTunai.textContent = formatRupiah(info.totalNonTunai);
        elTkSeharusnya.textContent = formatRupiah(seharusnya);
        elInUangFisik.value = Math.round(seharusnya);
        elInKetTutupKas.value = '';
        elOverlayTutupKas.classList.add('tampil');
    });
    elBtnTutupTutupKas.addEventListener('click', function () { elOverlayTutupKas.classList.remove('tampil'); });

    elBtnSubmitTutupKas.addEventListener('click', async function () {
        if (!confirm('Yakin ingin menutup kas kasir sekarang? Selisih terhadap kas seharusnya akan dicatat secara permanen.')) return;
        var uangFisik = Number(elInUangFisik.value) || 0;
        var keterangan = elInKetTutupKas.value || '';
        elBtnSubmitTutupKas.disabled = true;
        elBtnSubmitTutupKas.textContent = 'Menutup...';
        try {
            var lokal = await SesiKasOffline.sesiAktifLokal(state.tokoId);
            if (!lokal) { toast('error', 'Tidak ada sesi kas yang terbuka untuk ditutup.'); return; }
            await SesiKasOffline.tutupLokal(lokal.kode, uangFisik, keterangan);
            await cekSesiKas();
            elOverlayTutupKas.classList.remove('tampil');

            var hasilSync = null;
            try { hasilSync = await SesiKasOffline.sinkronkanSatu(lokal.kode); } catch (e) { /* dicoba lagi otomatis via auto-sync berkala */ }
            if (hasilSync && hasilSync.selisih != null) {
                var selisih = Number(hasilSync.selisih) || 0;
                toast(selisih < 0 ? 'error' : 'success', 'Kas ditutup. Selisih: ' + formatRupiah(selisih));
            } else {
                toast('info', 'Kas ditutup (tersimpan di perangkat ini) -- selisih akan dihitung otomatis begitu tersinkron ke server.');
            }
        } catch (e) {
            ErrorAlert.tampilkanDariException(e, 'Tutup Kas');
        } finally {
            elBtnSubmitTutupKas.disabled = false;
            elBtnSubmitTutupKas.textContent = 'Tutup Kas';
        }
    });

    elBtnSubmitBukaKas.addEventListener('click', async function () {
        var modal = Number(elInModalAwal.value) || 0;
        elBtnSubmitBukaKas.disabled = true;
        elBtnSubmitBukaKas.textContent = 'Membuka...';
        try {
            if (await SesiKasOffline.sesiAktifLokal(state.tokoId)) {
                toast('error', 'Sesi kas sudah terbuka. Tutup kas yang sedang berjalan sebelum membuka sesi baru.');
                return;
            }
            var baru = await SesiKasOffline.bukaLokal(state.tokoId, modal, '');
            await cekSesiKas();
            toast('success', 'Kas dibuka.');
            SesiKasOffline.sinkronkanSatu(baru.kode).catch(function () {}); // SENGAJA tak ditunggu -- kasir sudah boleh lanjut jualan seketika, sinkron di latar
        } catch (e) {
            ErrorAlert.tampilkanDariException(e, 'Buka Kas');
        } finally {
            elBtnSubmitBukaKas.disabled = false;
            elBtnSubmitBukaKas.textContent = 'Buka Kas & Mulai';
        }
    });

    // =====================================================================
    // ==== Member: picker, saldo, top-up, verifikasi PIN ====
    // =====================================================================
    var elOverlayMember = document.getElementById('overlayMember');
    var elBtnTutupMember = document.getElementById('btnTutupMember');
    var elInCariMember = document.getElementById('inCariMember');
    var elDaftarMember = document.getElementById('daftarMember');
    var elBtnPilihMember = document.getElementById('btnPilihMember');
    var elMemberChip = document.getElementById('memberChip');
    var elMemberChipNama = document.getElementById('memberChipNama');
    var elMemberChipSaldo = document.getElementById('memberChipSaldo');
    var elBtnIsiSaldo = document.getElementById('btnIsiSaldo');
    var elBtnHapusMember = document.getElementById('btnHapusMember');
    var elFormTopup = document.getElementById('formTopup');
    var elInNominalTopup = document.getElementById('inNominalTopup');
    var elBtnSubmitTopup = document.getElementById('btnSubmitTopup');

    function bukaPickerMember() {
        elInCariMember.value = '';
        elDaftarMember.innerHTML = '<div class="member-kosong">Ketik nama/kode member...</div>';
        elOverlayMember.classList.add('tampil');
        elInCariMember.focus();
    }
    elBtnPilihMember.addEventListener('click', bukaPickerMember);
    document.getElementById('btnMember').addEventListener('click', bukaPickerMember);
    elBtnTutupMember.addEventListener('click', function () { elOverlayMember.classList.remove('tampil'); });

    var cariMemberTimer = null;
    elInCariMember.addEventListener('input', function () {
        clearTimeout(cariMemberTimer);
        var kw = elInCariMember.value.trim();
        cariMemberTimer = setTimeout(function () { jalankanCariMember(kw); }, 350);
    });

    async function jalankanCariMember(keyword) {
        if (!keyword) { elDaftarMember.innerHTML = '<div class="member-kosong">Ketik nama/kode member...</div>'; return; }
        elDaftarMember.innerHTML = '<div class="member-kosong">Mencari...</div>';
        try {
            var r = await AisApi.panggil('cari_member', { keyword: keyword });
            if (r.status !== 'success') { elDaftarMember.innerHTML = '<div class="member-kosong">' + escapeHtml(pesanDariHasil(r, 'Gagal mencari.')) + '</div>'; return; }
            renderDaftarMember(r.member || []);
        } catch (e) {
            elDaftarMember.innerHTML = '<div class="member-kosong">Gagal mencari: ' + escapeHtml(e && e.message ? e.message : e) + '</div>';
        }
    }

    function renderDaftarMember(daftar) {
        if (daftar.length === 0) { elDaftarMember.innerHTML = '<div class="member-kosong">Tidak ada member yang cocok.</div>'; return; }
        elDaftarMember.innerHTML = '';
        daftar.forEach(function (m) {
            var kartu = document.createElement('div');
            kartu.className = 'kartu-member';
            kartu.innerHTML = '<div class="avatar"></div><div class="info"><div class="nama"></div><div class="sub"></div></div>';
            kartu.querySelector('.avatar').textContent = (m.nama || '?').trim().charAt(0).toUpperCase();
            kartu.querySelector('.nama').textContent = m.nama;
            kartu.querySelector('.sub').textContent = m.kodeIdentitas || '-';
            if (m.wajibPin) {
                var badge = document.createElement('span');
                badge.className = 'badge-pin';
                badge.textContent = '\u{1F512} PIN';
                kartu.appendChild(badge);
            }
            kartu.addEventListener('click', function () { pilihMember(m); elOverlayMember.classList.remove('tampil'); });
            elDaftarMember.appendChild(kartu);
        });
    }

    /**
     * @return {Promise} hasil {@link muatCaraBayarUntukMember} -- pemanggil BOLEH mengabaikannya
     *         (pola fire-and-forget spt tombol picker member) ATAU meng-{@code await}-nya bila perlu
     *         kepastian daftar cara bayar sudah ter-filter sebelum lanjut (spt {@code
     *         lanjutkanKeranjangTertahan} memulihkan {@code caraBayarId}).
     */
    function pilihMember(m) {
        state.memberTerpilih = m;
        elBtnPilihMember.style.display = 'none';
        elMemberChip.style.display = 'flex';
        elMemberChipNama.textContent = m.nama + (m.wajibPin ? ' \u{1F512}' : '');
        elMemberChipSaldo.textContent = 'Memeriksa saldo...';
        elBtnIsiSaldo.style.display = 'inline-block';
        elFormTopup.style.display = 'none';
        segarkanSaldoMemberTerpilih();
        jadwalkanEvaluasiDiskon();
        return muatCaraBayarUntukMember(m.id);
    }

    /**
     * Fase 5 -- muat ULANG daftar metode bayar, TERFILTER sesuai jenis-anggota member yg sedang
     * dipilih (lihat JavaDoc server {@code PosApi.prosesCaraBayarList}, porting {@code _pos.jsp}
     * {@code loadMetodePembayaranPOS}). Dipanggil setiap member dipilih/dihapus -- SEBELUMNYA
     * {@code state.caraBayar} hanya dimuat SEKALI saat start (aksi {@code konfigurasi}), tak pernah
     * disaring ulang per member (gap Fase 5). Bila metode yg sedang dipilih kasir ternyata TIDAK ada
     * di daftar baru (mis. metode "Saldo" tapi member baru tak diizinkan), pilihan direset.
     */
    async function muatCaraBayarUntukMember(idMember) {
        try {
            var r = await AisApi.panggil('cara_bayar_list', { id_member: idMember || null });
            if (r.status === 'success' && Array.isArray(r.caraBayar)) {
                state.caraBayar = r.caraBayar;
                if (state.metodeTerpilih && !state.caraBayar.some(function (cb) { return String(cb.id) === state.metodeTerpilih.id; })) {
                    state.metodeTerpilih = null;
                }
                renderGridMetode();
                segarkanTombolBayar();
            }
        } catch (e) { /* abaikan -- gagal filter, tetap pakai daftar cara bayar sebelumnya */ }
    }

    /** Fase 5 -- cari SATU member persis via id (dipakai memulihkan member saat "Muat" Keranjang Tertahan). */
    async function cariAnggotaById(id) {
        try {
            var r = await AisApi.panggil('cari_member', { id: id });
            if (r.status === 'success' && Array.isArray(r.member) && r.member.length > 0) return r.member[0];
        } catch (e) { /* abaikan */ }
        return null;
    }

    async function segarkanSaldoMemberTerpilih() {
        if (!state.memberTerpilih) return;
        var idSaatDipanggil = state.memberTerpilih.id;
        try {
            var r = await AisApi.panggil('saldo_member', { id_member: idSaatDipanggil });
            if (!state.memberTerpilih || state.memberTerpilih.id !== idSaatDipanggil) return; // member sudah diganti selagi menunggu
            if (r.status === 'success') {
                elMemberChipSaldo.textContent = 'Saldo: ' + formatRupiah(Number(r.data) || 0);
            } else {
                elMemberChipSaldo.textContent = 'Saldo: gagal diperiksa';
            }
        } catch (e) {
            elMemberChipSaldo.textContent = 'Saldo: gagal diperiksa (offline?)';
        }
    }

    elBtnHapusMember.addEventListener('click', function () {
        resetMemberTerpilih();
        jadwalkanEvaluasiDiskon();
    });

    elBtnIsiSaldo.addEventListener('click', function () {
        var tampil = elFormTopup.style.display !== 'none';
        elFormTopup.style.display = tampil ? 'none' : 'flex';
        elInNominalTopup.value = '';
        if (!tampil) elInNominalTopup.focus();
    });

    elBtnSubmitTopup.addEventListener('click', async function () {
        if (!state.memberTerpilih) return;
        var nominal = Number(elInNominalTopup.value) || 0;
        if (nominal <= 0) { toast('error', 'Nominal top up tidak valid.'); return; }
        elBtnSubmitTopup.disabled = true;
        try {
            var r = await AisApi.panggil('topup_saldo', { id_member: state.memberTerpilih.id, nominal: nominal });
            if (r.status === 'success') {
                toast('success', 'Saldo berhasil diisi.');
                elFormTopup.style.display = 'none';
                segarkanSaldoMemberTerpilih();
            } else {
                toast('error', pesanDariHasil(r, 'Gagal mengisi saldo.'));
            }
        } catch (e) {
            ErrorAlert.tampilkanDariException(e, 'Isi Saldo');
        } finally {
            elBtnSubmitTopup.disabled = false;
        }
    });

    // ==== Verifikasi PIN (di layar utama -- app ini tak punya konsep Layar Pelanggan/monitor kedua) ====
    var elOverlayPin = document.getElementById('overlayPin');
    var elPinKeterangan = document.getElementById('pinKeterangan');
    var elInPin = document.getElementById('inPin');
    var elPinError = document.getElementById('pinError');
    var elBtnSubmitPin = document.getElementById('btnSubmitPin');
    var elBtnBatalPin = document.getElementById('btnBatalPin');

    function mintaPin(memberNama, memberId) {
        return new Promise(function (resolve) {
            elPinKeterangan.textContent = 'Minta ' + memberNama + ' memasukkan PIN.';
            elInPin.value = '';
            elPinError.textContent = '';
            elBtnSubmitPin.disabled = false;
            elBtnSubmitPin.textContent = 'Verifikasi';
            elOverlayPin.classList.add('tampil');
            elInPin.focus();

            function selesai(hasil) {
                elOverlayPin.classList.remove('tampil');
                elBtnBatalPin.onclick = null;
                elBtnSubmitPin.onclick = null;
                resolve(hasil);
            }
            elBtnBatalPin.onclick = function () { selesai({ ok: false }); };
            elBtnSubmitPin.onclick = async function () {
                var pin = elInPin.value.trim();
                if (!pin) { elInPin.focus(); return; }
                elBtnSubmitPin.disabled = true;
                elBtnSubmitPin.textContent = 'Memeriksa...';
                elPinError.textContent = '';
                try {
                    var r = await AisApi.panggil('verifikasi_pin', { memberId: memberId, pin: pin });
                    var cocok = r.status === 'success' && r.ok === true;
                    if (cocok) {
                        selesai({ ok: true });
                    } else {
                        elPinError.textContent = r.status === 'success' ? 'PIN salah, coba lagi.' : pesanDariHasil(r, 'Gagal memeriksa PIN.');
                        elInPin.value = '';
                        elInPin.focus();
                    }
                } catch (e) {
                    elPinError.textContent = 'Gagal memeriksa PIN: ' + (e && e.message ? e.message : e);
                } finally {
                    elBtnSubmitPin.disabled = false;
                    elBtnSubmitPin.textContent = 'Verifikasi';
                }
            };
        });
    }

    /**
     * Gerbang saldo+PIN sebelum checkout metode "saldo" (manual===false) -- mirror gerbangSaldoDanPin
     * milik Desktop, TAPI cuma jalur "PIN di layar utama" (app ini tak punya konsep Layar
     * Pelanggan/monitor kedua terpisah -- selalu diketik langsung oleh kasir/pembeli di layar yg sama).
     * @param {number} total
     * @return {Promise<{lolos:boolean, pesan?:string}>}
     */
    async function gerbangSaldoDanPin(total) {
        if (!state.memberTerpilih) return { lolos: false, pesan: 'Pilih member dulu sebelum bayar pakai metode Saldo.' };
        var saldoTerbaru = 0;
        try {
            var r = await AisApi.panggil('saldo_member', { id_member: state.memberTerpilih.id });
            if (r.status !== 'success') return { lolos: false, pesan: pesanDariHasil(r, 'Gagal memeriksa saldo.') };
            saldoTerbaru = Number(r.data) || 0;
        } catch (e) {
            return { lolos: false, pesan: 'Gagal memeriksa saldo: ' + (e && e.message ? e.message : e) };
        }
        if (saldoTerbaru < total) {
            return { lolos: false, pesan: 'Saldo ' + state.memberTerpilih.nama + ' saat ini ' + formatRupiah(saldoTerbaru) + ' -- kurang ' + formatRupiah(total - saldoTerbaru) + ' dari total ' + formatRupiah(total) + '.' };
        }
        var minSaldo = state.memberTerpilih.minSaldo || 0;
        if ((saldoTerbaru - total) < minSaldo) {
            return { lolos: false, pesan: 'Saldo akan tersisa ' + formatRupiah(saldoTerbaru - total) + ', di bawah batas minimal yang harus mengendap ' + formatRupiah(minSaldo) + '.' };
        }
        if (!state.memberTerpilih.wajibPin) return { lolos: true };
        var hasilPin = await mintaPin(state.memberTerpilih.nama, state.memberTerpilih.id);
        if (!hasilPin.ok) return { lolos: false, pesan: 'Verifikasi PIN dibatalkan.' };
        return { lolos: true };
    }

    /** @return {Promise} hasil {@link muatCaraBayarUntukMember} -- lihat catatan awaitable di {@link pilihMember}. */
    function resetMemberTerpilih() {
        state.memberTerpilih = null;
        elMemberChip.style.display = 'none';
        elBtnPilihMember.style.display = 'flex';
        elFormTopup.style.display = 'none';
        return muatCaraBayarUntukMember(null);
    }

    // =====================================================================
    // ==== Checkout ====
    // =====================================================================
    var elOverlayBayar = document.getElementById('overlayBayar');
    var elTxtTotalModalBayar = document.getElementById('txtTotalModalBayar');
    var elGridMetode = document.getElementById('gridMetode');
    var elWrapUangTunai = document.getElementById('wrapUangTunai');
    var elInUangTunai = document.getElementById('inUangTunai');
    var elWrapKembalian = document.getElementById('wrapKembalian');
    var elTxtKembalian = document.getElementById('txtKembalian');
    var elBtnSubmitBayar = document.getElementById('btnSubmitBayar');
    var elBtnTutupBayar = document.getElementById('btnTutupBayar');

    function renderGridMetode() {
        var html = '';
        state.caraBayar.forEach(function (cb) {
            html += '<div class="kartu-metode' + (state.metodeTerpilih && state.metodeTerpilih.id === String(cb.id) ? ' aktif' : '') + '" data-id="' + cb.id + '">' + escapeHtml(cb.nama) + '</div>';
        });
        elGridMetode.innerHTML = html || '<div style="grid-column:1/-1;color:var(--muted);font-size:12px;">Belum ada metode pembayaran dikonfigurasi di server.</div>';
        elGridMetode.querySelectorAll('.kartu-metode').forEach(function (el) {
            el.addEventListener('click', function () {
                var cb = state.caraBayar.filter(function (x) { return String(x.id) === el.getAttribute('data-id'); })[0];
                state.metodeTerpilih = { id: String(cb.id), nama: cb.nama, manual: cb.manual !== false };
                renderGridMetode();
                segarkanTombolBayar();
            });
        });
    }

    function segarkanTombolBayar() {
        var total = hitungRingkasanKeranjang().total;
        var diterima = state.metodeTerpilih && state.metodeTerpilih.manual === false ? total : (Number(elInUangTunai.value) || 0);
        if (state.metodeTerpilih && state.metodeTerpilih.manual === false) {
            elWrapUangTunai.style.display = 'none';
            elWrapKembalian.style.display = 'none';
        } else {
            elWrapUangTunai.style.display = '';
            var kembalian = Math.max(0, diterima - total);
            elWrapKembalian.style.display = diterima > 0 ? '' : 'none';
            elTxtKembalian.textContent = formatRupiah(kembalian);
        }
        elBtnSubmitBayar.disabled = !(state.metodeTerpilih && diterima >= total && total > 0);
    }
    elInUangTunai.addEventListener('input', segarkanTombolBayar);

    elBtnBuka2Bayar.addEventListener('click', function () {
        if (state.cart.length === 0) return;
        state.metodeTerpilih = null;
        elInUangTunai.value = '';
        elTxtTotalModalBayar.textContent = formatRupiah(hitungRingkasanKeranjang().total);
        renderGridMetode();
        segarkanTombolBayar();
        tutupPanelKeranjang();
        elOverlayBayar.classList.add('tampil');
    });
    elBtnTutupBayar.addEventListener('click', function () { elOverlayBayar.classList.remove('tampil'); });

    var strukTerakhir = null;

    function buatKodeUnik() {
        return 'AND' + Date.now() + Math.floor(Math.random() * 1000);
    }

    /** Batas tunggu kasir utk hasil kirim transaksi ke server sebelum "Proses Pembayaran"/"Tahan"
     * dibalas duluan -- BUKAN timeout jaringan (itu tetap TIMEOUT_MS/20 detik di api.js), murni batas
     * SEBERAPA LAMA UI boleh menunggu sebelum kasir dapat konfirmasi. Pola SAMA PERSIS dgn Desktop
     * main.js (prosesTransaksiPosOfflineFirst) -- gap-closure "klik Bayar/Tahan lama sekali lalu
     * macet" (jaringan toko lambat/padat): baris SUDAH aman tersimpan lokal (OfflineQueue.simpanBaru
     * dipanggil SEBELUM fungsi ini oleh pemanggil), jadi kasir tidak perlu menunggu jaringan utk tahu
     * transaksinya aman. */
    var BATAS_TUNGGU_SINKRON_TRANSAKSI_MS = 3000;

    /**
     * Kirim SATU transaksi (bayar/draft_bayar) ke server dgn batas tunggu di atas -- kalau server
     * sempat menjawab dalam batas, hasil ASLI dikembalikan (kasir dapat konfirmasi tersinkron
     * seketika spt biasa); kalau lewat batas, langsung dianggap {@code status:'success'} versi
     * "offline/pending" SEMENTARA percobaan kirim yg sudah berjalan dibiarkan lanjut sendiri di latar
     * belakang, menandai {@code OfflineQueue.tandaiSinkron} begitu benar2 selesai (kapan pun itu,
     * idempoten kalau jalur cepat sudah menanganinya lebih dulu).
     * @param {string} aksi 'bayar' atau 'draft_bayar'.
     * @param {object} payload WAJIB berisi {@code clientTrxId} (kunci baris di OfflineQueue).
     * @param {boolean} pakaiSaldo kalau true, TIDAK ada batas tunggu/fallback offline (saldo wajib
     *        dicek real-time, sudah digerbang gerbangSaldoDanPin lebih dulu) -- await penuh spt semula.
     * @return {Promise<{hasil:object, dariAntreanOffline:boolean}>}
     */
    async function kirimTransaksiDenganBatasWaktu(aksi, payload, pakaiSaldo) {
        var clientTrxId = payload.clientTrxId;
        var promiseKirim = AisApi.panggil(aksi, payload);
        promiseKirim.then(function (h) {
            if (h && (h.status === 'success' || h.status === '00')) {
                OfflineQueue.tandaiSinkron(clientTrxId).catch(function () { /* abaikan */ });
            }
        }).catch(function () { /* offline/timeout -- baris tetap PENDING, dicoba lagi via "Sinkronkan"/siklus otomatis */ });

        if (pakaiSaldo) {
            return { hasil: await promiseKirim, dariAntreanOffline: false };
        }

        var selesaiDalamBatas = true;
        var hasilRace = await Promise.race([
            promiseKirim.catch(function (e) { return { __error: e }; }),
            new Promise(function (resolve) {
                setTimeout(function () { selesaiDalamBatas = false; resolve(null); }, BATAS_TUNGGU_SINKRON_TRANSAKSI_MS);
            })
        ]);

        if (!selesaiDalamBatas) {
            return { hasil: { status: 'success' }, dariAntreanOffline: true };
        }
        if (hasilRace && hasilRace.__error) {
            var eJaringan = hasilRace.__error;
            if (eJaringan && (eJaringan.offline || eJaringan.timeout)) {
                return { hasil: { status: 'success' }, dariAntreanOffline: true };
            }
            throw eJaringan;
        }
        return { hasil: hasilRace, dariAntreanOffline: false };
    }

    /**
     * Tombol "Tahan" -- simpan keranjang saat ini sbg draft belum-lunas (aksi {@code draft_bayar} yg
     * SAMA dipakai fitur Pesanan Online, lihat JavaDoc server {@code KantinHelper.bayar} soal parameter
     * {@code draftPembelianAnggotaKoperasi}), lalu kosongkan keranjang lokal. Kasir bisa melanjutkannya
     * lagi kapan saja lewat menu "Keranjang Tertahan" (lihat {@code lanjutkanKeranjangTertahan}) --
     * SAMA PERSIS pola resume yg sudah ada di JSP {@code _pos.jsp} (fungsi {@code
     * muatKeranjangTertahan}/{@code simpanKeranjangTertahan}). Metode bayar WAJIB diisi backend
     * walau belum menagih siapa pun -- pakai yg sedang dipilih kasir, atau opsi pertama yg tersedia.
     */
    elBtnTahanKeranjang.addEventListener('click', async function () {
        if (state.cart.length === 0) return;
        if (!state.tokoId) { toast('error', 'Toko tidak diketahui, coba lagi.'); return; }
        var idCaraBayar = state.metodeTerpilih ? state.metodeTerpilih.id : (state.caraBayar[0] ? String(state.caraBayar[0].id) : null);
        if (!idCaraBayar) { toast('error', 'Belum ada metode pembayaran yang bisa dipakai utk menahan keranjang.'); return; }
        elBtnTahanKeranjang.disabled = true;
        var oriHtml = elBtnTahanKeranjang.innerHTML;
        elBtnTahanKeranjang.textContent = '...';
        var kodeUnikTahan = buatKodeUnik();
        var payload = {
            id: state.draftAktifId || null,
            kodeUnik: kodeUnikTahan,
            clientTrxId: kodeUnikTahan,
            idToko: state.tokoId,
            tokoId: state.tokoId,
            kasir: state.userId,
            waktu: new Date().toISOString(),
            id_member: state.memberTerpilih ? state.memberTerpilih.id : null,
            caraBayar: idCaraBayar,
            total: hitungRingkasanKeranjang().total,
            transaksi: state.cart.map(function (c) {
                return { id: c.id, kode: c.kode, nama: c.nama, harga: c.harga, jumlah: c.jumlah, diskon: 0, aturanDiskon: null, cashback: 0 };
            })
        };
        // Offline-first (pola SAMA dgn tombol "Proses Pembayaran" di bawah/Desktop main.js) -- tulis
        // ke antrean lokal SEBELUM mencoba kirim, supaya keranjang yg ditahan tetap aman tersimpan di
        // perangkat walau jaringan putus/lambat (SEBELUMNYA baris ini tidak ada sama sekali di sini --
        // gap-closure, keranjang tertahan bisa hilang kalau kirim gagal sebelum sempat tersimpan).
        try { await OfflineQueue.simpanBaru(payload); } catch (eSimpanLokal) { /* gagal tulis lokal -- lanjut coba kirim langsung, jangan gagalkan alur */ }
        try {
            var percobaan = await kirimTransaksiDenganBatasWaktu('draft_bayar', payload, false);
            var r = percobaan.hasil;
            if (r.status === 'success' || r.status === '00') {
                toast('success', percobaan.dariAntreanOffline
                    ? 'Keranjang tersimpan lokal, sedang dikirim ke server di latar belakang.'
                    : 'Keranjang ditahan -- lanjutkan lewat menu Keranjang Tertahan.');
                state.cart = [];
                state.draftAktifId = null;
                resetMemberTerpilih();
                renderKeranjang();
            } else {
                toast('error', pesanDariHasil(r, 'Gagal menahan keranjang.'));
            }
        } catch (e) {
            toast('error', 'Gagal menahan keranjang: ' + (e && e.message ? e.message : e));
        } finally {
            elBtnTahanKeranjang.innerHTML = oriHtml;
            elBtnTahanKeranjang.disabled = state.cart.length === 0 || !state.sesiKasTerbuka;
        }
    });

    elBtnSubmitBayar.addEventListener('click', async function () {
        var ringkasan = hitungRingkasanKeranjang();
        var total = ringkasan.total;
        var diterima = Number(elInUangTunai.value) || total;
        var kembalian = Math.max(0, diterima - total);
        var kodeUnik = buatKodeUnik();
        var sekarang = new Date();

        var pakaiSaldo = state.metodeTerpilih && state.metodeTerpilih.manual === false;
        if (pakaiSaldo) {
            elBtnSubmitBayar.disabled = true;
            elBtnSubmitBayar.textContent = 'Memeriksa saldo...';
            var gerbang = await gerbangSaldoDanPin(total);
            elBtnSubmitBayar.disabled = false;
            elBtnSubmitBayar.textContent = 'Proses Pembayaran';
            if (!gerbang.lolos) { toast('error', gerbang.pesan || 'Pembayaran Saldo tidak bisa dilanjutkan.'); return; }
        }

        var payload = {
            kodeUnik: kodeUnik, clientTrxId: kodeUnik,
            idToko: state.tokoId, tokoId: state.tokoId,
            kasir: state.userId,
            waktu: sekarang.toISOString(),
            caraBayar: state.metodeTerpilih.id,
            total: total,
            id_member: state.memberTerpilih ? state.memberTerpilih.id : null,
            draftPembelianAnggotaKoperasi: state.draftAktifId || null,
            transaksi: state.cart.map(function (c) {
                return { id: c.id, kode: c.kode, nama: c.nama, harga: c.harga, jumlah: c.jumlah, diskon: c.diskon || 0, aturanDiskon: c.aturanDiskon || null, cashback: c.cashback || 0 };
            })
        };

        elBtnSubmitBayar.disabled = true;
        elBtnSubmitBayar.textContent = 'Memproses...';
        // Offline-first (pola SAMA dgn local-db.js Desktop/ais_pos_offline.js web): tulis transaksi
        // ke antrean lokal SEBELUM mencoba kirim -- kalau koneksi putus TEPAT SETELAH tombol ini
        // diklik, transaksi tetap aman tersimpan di perangkat, bukan hilang. Metode "Saldo" SENGAJA
        // dikecualikan (sudah ditolak lebih dulu via gerbangSaldoDanPin bila offline -- saldo real-time
        // wajib dicek server, tidak aman dijamin dari cache/antrean lokal).
        try { await OfflineQueue.simpanBaru(payload); } catch (eSimpanLokal) { /* gagal tulis lokal -- lanjut coba kirim langsung, jangan gagalkan alur */ }
        var dariAntreanOffline = false;
        try {
            // Gap-closure "klik Bayar lama sekali lalu macet" -- lihat JavaDoc kirimTransaksiDenganBatasWaktu.
            // Baris SUDAH aman tersimpan lokal di atas, jadi kasir tidak pernah lagi menunggu jaringan
            // sampai 20 detik (TIMEOUT_MS) hanya utk tahu transaksinya tersimpan.
            var percobaan = await kirimTransaksiDenganBatasWaktu('bayar', payload, pakaiSaldo);
            var r = percobaan.hasil;
            dariAntreanOffline = percobaan.dariAntreanOffline;
            if (r.status === 'success') {
                if (!dariAntreanOffline) { try { await OfflineQueue.tandaiSinkron(kodeUnik); } catch (e3) { /* abaikan */ } }
                strukTerakhir = {
                    tokoNama: state.tokoNama, kode: kodeUnik, waktu: sekarang.toLocaleString('id-ID'),
                    kasir: state.userId, metode: state.metodeTerpilih.nama,
                    items: state.cart.map(function (c) { return { nama: c.nama, jumlah: c.jumlah, harga: c.harga, diskon: c.diskon || 0, cashback: c.cashback || 0 }; }),
                    subtotal: ringkasan.subtotal, totalDiskon: ringkasan.totalDiskon, totalCashback: ringkasan.totalCashback,
                    total: total, diterima: diterima, kembalian: kembalian
                };
                document.getElementById('txtRingkasSukses').textContent = formatRupiah(total) + ' -- ' + state.metodeTerpilih.nama
                    + (dariAntreanOffline ? ' (tersimpan offline, menunggu sinkron)' : '');
                elOverlayBayar.classList.remove('tampil');
                document.getElementById('overlaySukses').classList.add('tampil');
                // Hanya metode bayar TUNAI yg memicu laci terbuka otomatis (uang kertas/koin fisik
                // perlu ditaruh/diambil) -- non-tunai (Saldo/Transfer/QRIS) TIDAK, kasir tetap bisa
                // buka manual lewat tombol kalau perlu. Kondisi SAMA PERSIS dgn Desktop pos-renderer.js.
                if ((state.metodeTerpilih.nama || '').toLowerCase().indexOf('tunai') >= 0) {
                    bukaLaciKasir(true);
                }
                state.cart = [];
                state.draftAktifId = null;
                renderKeranjang();
                resetMemberTerpilih();
                segarkanBadgeSinkron();
                // Muat ulang dari cache lokal (BUKAN live server lagi, lihat JavaDoc muatKatalog) --
                // badge stok di kartu produk karenanya mengikuti jadwal sinkron cache (berkala 10
                // menit + sekali segera saat masuk aplikasi), bukan detik-itu-juga pasca-checkout.
                if (!dariAntreanOffline) muatKatalog();
            } else {
                if (r.kode === 'DUPLIKAT_KODE_TRANSAKSI') { try { await OfflineQueue.tandaiSinkron(kodeUnik); } catch (e4) { /* abaikan */ } }
                toast('error', pesanDariHasil(r, 'Pembayaran gagal.'));
            }
        } catch (e) {
            // Checkout GAGAL diproses krn DITOLAK server dgn tegas (bukan soal koneksi -- itu sudah
            // ditangani di atas sbg antrean offline) -- WAJIB alert detail (bukan toast sekilas) krn
            // kasir perlu tahu PASTI apakah transaksi ini perlu diulang atau jangan (lihat kode
            // transaksi di detail teknis utk dicek manual ke admin bila ragu; baris di antrean lokal
            // TETAP PENDING, bisa dicoba lagi via "Sinkronkan Sekarang" setelah masalah teratasi).
            ErrorAlert.tampilkanDariException(e, 'Checkout (kode: ' + kodeUnik + ')');
        } finally {
            elBtnSubmitBayar.disabled = false;
            elBtnSubmitBayar.textContent = 'Proses Pembayaran';
        }
    });

    document.getElementById('btnTransaksiBaru').addEventListener('click', function () {
        document.getElementById('overlaySukses').classList.remove('tampil');
    });

    // =====================================================================
    // ==== Printer Bluetooth ====
    // =====================================================================
    var elOverlayPrinter = document.getElementById('overlayPrinter');
    var elDaftarPrinter = document.getElementById('daftarPrinter');
    var elTxtPrinterAktif = document.getElementById('txtPrinterAktif');
    var KUNCI_PRINTER = 'ais_pos_printer_v1';
    var printerTersimpan = null;

    function muatPrinterTersimpan() {
        try { printerTersimpan = JSON.parse(localStorage.getItem(KUNCI_PRINTER) || 'null'); } catch (e) { printerTersimpan = null; }
        elTxtPrinterAktif.textContent = printerTersimpan ? ('Printer aktif: ' + printerTersimpan.name + ' (' + printerTersimpan.address + ')') : 'Belum ada printer dipilih.';
    }

    document.getElementById('btnPrinter').addEventListener('click', function () {
        muatPrinterTersimpan();
        elOverlayPrinter.classList.add('tampil');
    });
    document.getElementById('btnTutupPrinter').addEventListener('click', function () { elOverlayPrinter.classList.remove('tampil'); });

    document.getElementById('btnScanPrinter').addEventListener('click', async function () {
        if (!EscPos.tersedia()) {
            elDaftarPrinter.innerHTML = '<p style="color:var(--danger);font-size:12px;">Plugin Bluetooth tidak tersedia -- pastikan menjalankan APK Android (bukan browser biasa).</p>';
            return;
        }
        elDaftarPrinter.innerHTML = '<p style="font-size:12px;color:var(--muted);">Mencari...</p>';
        try {
            var daftar = await EscPos.daftarPerangkat();
            if (!daftar || daftar.length === 0) {
                elDaftarPrinter.innerHTML = '<p style="font-size:12px;color:var(--muted);">Tidak ada perangkat ter-pairing. Pairing printer dulu lewat Pengaturan Bluetooth Android.</p>';
                return;
            }
            var html = '';
            daftar.forEach(function (d) {
                html += '<div class="kartu-metode" style="text-align:left;margin-bottom:8px;" data-addr="' + escapeHtml(d.address) + '" data-name="' + escapeHtml(d.name || d.address) + '">' + escapeHtml(d.name || '(tanpa nama)') + '<br><span style="font-size:10px;color:var(--muted);">' + escapeHtml(d.address) + '</span></div>';
            });
            elDaftarPrinter.innerHTML = html;
            elDaftarPrinter.querySelectorAll('.kartu-metode').forEach(function (el) {
                el.addEventListener('click', function () {
                    printerTersimpan = { address: el.getAttribute('data-addr'), name: el.getAttribute('data-name') };
                    localStorage.setItem(KUNCI_PRINTER, JSON.stringify(printerTersimpan));
                    muatPrinterTersimpan();
                    toast('success', 'Printer "' + printerTersimpan.name + '" dipilih.');
                });
            });
        } catch (e) {
            elDaftarPrinter.innerHTML = '<p style="color:var(--danger);font-size:12px;">Gagal mencari perangkat -- lihat detail di alert.</p>';
            ErrorAlert.tampilkanDariException(e, 'Cari Perangkat Bluetooth');
        }
    });

    document.getElementById('btnCetakStruk').addEventListener('click', async function () {
        if (!strukTerakhir) return;
        muatPrinterTersimpan();
        if (!printerTersimpan) { toast('error', 'Pilih printer Bluetooth dulu (ikon printer di pojok kanan atas).'); return; }
        if (!EscPos.tersedia()) { toast('error', 'Fitur cetak hanya tersedia di aplikasi Android (APK).'); return; }
        var btn = document.getElementById('btnCetakStruk');
        btn.disabled = true;
        btn.textContent = 'Menyambungkan printer...';
        try {
            await EscPos.sambungkan(printerTersimpan.address);
            btn.textContent = 'Mencetak...';
            var bytes = EscPos.bangunStruk(strukTerakhir);
            await EscPos.cetak(bytes);
            toast('success', 'Struk terkirim ke printer.');
        } catch (e) {
            ErrorAlert.tampilkanDariException(e, 'Cetak Struk Bluetooth');
        } finally {
            btn.disabled = false;
            btn.textContent = '🖨️ Cetak Struk (Bluetooth)';
        }
    });

    /**
     * Buka laci kasir -- gap-closure Android (paritas dgn Desktop pos-renderer.js bukaLaciKasir).
     * Laci TERSAMBUNG KE PRINTER (bukan perangkat sendiri), jadi memakai printer Bluetooth yang SAMA
     * sudah dipilih/tersambung utk cetak struk (lihat EscPos.bangunBukaLaci di escpos.js). {@code
     * diam=true} dipakai jalur OTOMATIS setelah bayar tunai -- sukses tak perlu toast (supaya tak
     * menumpuk dgn toast lain), tapi kegagalan TETAP dilaporkan supaya kasir tahu laci mungkin perlu
     * dibuka manual.
     * @param {boolean} [diam]
     */
    async function bukaLaciKasir(diam) {
        muatPrinterTersimpan();
        if (!printerTersimpan) { if (!diam) toast('error', 'Pilih printer Bluetooth dulu (ikon printer di pojok kanan atas) -- laci kasir tersambung lewat printer.'); return; }
        if (!EscPos.tersedia()) { if (!diam) toast('error', 'Fitur ini hanya tersedia di aplikasi Android (APK).'); return; }
        try {
            await EscPos.sambungkan(printerTersimpan.address);
            await EscPos.cetak(EscPos.bangunBukaLaci());
            if (!diam) toast('success', 'Perintah buka laci terkirim.');
        } catch (e) {
            if (!diam) { ErrorAlert.tampilkanDariException(e, 'Buka Laci Kasir'); }
            else { toast('error', 'Laci kasir tidak terbuka otomatis: ' + (e && e.message ? e.message : e)); }
        }
    }
    document.getElementById('btnBukaLaci').addEventListener('click', function () { bukaLaciKasir(false); });
    document.getElementById('btnBukaLaciSukses').addEventListener('click', function () { bukaLaciKasir(false); });

    // =====================================================================
    // ==== Inisialisasi ====
    // =====================================================================
    /**
     * Jalankan sebuah fungsi async dgn BATAS WAKTU KESELURUHAN -- lapis pertahanan TERAKHIR (di atas
     * timeout per-panggilan AisApi.panggil sendiri, lihat JavaDoc api.js) supaya TIDAK ADA alur
     * startup yg bisa macet SELAMANYA apa pun penyebabnya, termasuk penyebab yg TIDAK terlindungi oleh
     * timeout jaringan (mis. bug IndexedDB version-conflict yg pernah ditemukan & diperbaiki di
     * offline-queue.js/sesi-kas-offline.js -- lihat JavaDoc panjang di sana -- atau bug serupa lain di
     * masa depan yg belum ketahuan). Gejala lapangan yg coba dicegah: "Memuat katalog..." tak pernah
     * hilang, tanpa pesan error apa pun.
     *
     * <p>CATATAN: {@code Promise.race} TIDAK membatalkan {@code fn()} yg kalah lomba -- ia tetap
     * berjalan di latar walau sudah "dianggap gagal" di sini. Ini disengaja/dapat diterima: begitu
     * timeout menang, pengguna SUDAH diberi tahu & bisa mencoba lagi (tombol masuk ulang akan memanggil
     * fungsi ini dari awal, membentuk percobaan BARU) -- proses lama yg akhirnya selesai belakangan
     * (kalau memang akhirnya selesai) hanya berakhir tanpa ada yg mendengarkan, tidak berbahaya.</p>
     * @param {()=>Promise<void>} fn
     * @param {number} ms
     * @param {string} label dipakai di pesan error timeout.
     * @return {Promise<void>}
     */
    function jalankanDenganBatasWaktu(fn, ms, label) {
        return Promise.race([
            fn(),
            new Promise(function (resolve, reject) {
                setTimeout(function () {
                    reject(Object.assign(new Error('timeout-startup'), {
                        timeout: true,
                        pesan: label + ' memakan waktu lebih dari ' + Math.round(ms / 1000) + ' detik -- '
                            + 'periksa koneksi internet perangkat ini, lalu coba masuk lagi. Bila terus terjadi, '
                            + 'coba tutup paksa & buka ulang aplikasi.'
                    }));
                }, ms);
            })
        ]);
    }

    async function masukKeAplikasi() {
        var cfg = await AisApi.bacaCfg();
        state.userId = (cfg && cfg.username) || '';
        tampilkanLayar('layarPos');
        tampilMuat('Memuat katalog...');
        try {
            await jalankanDenganBatasWaktu(async function () {
                await segarkanStatus();
                await muatKatalog();
                await cekSesiKas();
            }, 30000, 'Memuat aplikasi');
        } catch (e) {
            tampilkanLayar('layarLogin');
            ErrorAlert.tampilkanDariException(e, 'Memuat Aplikasi');
            throw e;
        } finally {
            tutupMuat();
        }
        setInterval(segarkanStatus, 30000);
        if (window.AisUpdater) window.AisUpdater.cekUpdate();
        if (window.OfflineQueue) window.OfflineQueue.mulaiAutoSync();
        if (window.ProdukCache) {
            window.ProdukCache.mulaiAutoSyncProduk();
            // Hangatkan cache SEKALI segera saat masuk (padanan Desktop main.js yg memanggil
            // sinkronkanKatalogProdukLengkap segera saat openMainWindow, bukan cuma mengandalkan
            // interval 10 menit) -- supaya instalasi/perangkat BARU (cache masih kosong) tak perlu
            // menunggu 10 menit dulu baru kartu produk Kasir terisi. Muat ulang grid kalau berhasil
            // (diam-diam diabaikan kalau gagal/offline -- percobaan berikutnya via interval).
            window.ProdukCache.sinkronkanKatalogProdukManual().then(function (r) {
                if (r && r.ok) muatKatalog();
            }).catch(function () {});
        }
        if (window.AnggotaCache) window.AnggotaCache.mulaiAutoSyncAnggota();
        muatIdentitasMesinSayaLt();
        muatIdentitasMesinSayaPesanan();
        setInterval(function () {
            var elLt = document.getElementById('layarLaporanTransaksi');
            if (elLt && elLt.classList.contains('aktif')) muatStatistikTransaksiLt();
        }, 600000);
        setInterval(function () {
            var elPo = document.getElementById('layarPesananOnline');
            if (elPo && elPo.classList.contains('aktif')) muatPesananOnline();
        }, 600000);
        if (window.KatalogImportQueue) {
            window.KatalogImportQueue.mulaiAutoSync(function () {
                // Batch impor katalog yg tadinya offline berhasil tersinkron di latar -- segarkan
                // daftar produk TANPA supervisor perlu klik apa pun, kalau layar Produk kebetulan
                // sedang terbuka (pola sama dgn produk-renderer.js Desktop).
                toast('success', 'Impor katalog yang tadi tertunda offline sudah berhasil dikirim & diproses server.');
                if (typeof muatDaftarProduk === 'function' && elInCariProduk) muatDaftarProduk(elInCariProduk.value.trim());
            });
        }
        if (window.SesiKasOffline) {
            window.SesiKasOffline.mulaiAutoSync();
            window.SesiKasOffline.sinkronkanSemua().catch(function () {}); // langsung coba sekali saat masuk -- jangan tunggu 30 detik pertama kalau ada sesi tertunda dari sesi aplikasi sebelumnya
        }
        segarkanBadgeSinkron();
        mulaiPollingPesananBaru();
    }

    // =====================================================================
    // ==== Navigasi (drawer) + Layar Ringkasan/Riwayat Sinkronisasi/Log Error ====
    // Aplikasi ini SATU HALAMAN (beda dari Desktop yg tiap layar berkas HTML terpisah dgn sidebar
    // permanen) -- semua layar tambahan adalah <div class="layar"> lain yg ditoggle via
    // tampilkanLayar() yg sudah ada, dibuka lewat drawer (menu hamburger) ini.
    // =====================================================================
    var elBtnMenu = document.getElementById('btnMenu');
    var elDrawerOverlay = document.getElementById('drawerOverlay');
    var elDrawerNamaToko = document.getElementById('drawerNamaToko');

    function bukaDrawer() {
        elDrawerNamaToko.textContent = state.tokoNama || ('Kasir - ' + state.userId);
        elDrawerOverlay.classList.add('tampil');
    }
    function tutupDrawer() { elDrawerOverlay.classList.remove('tampil'); }
    elBtnMenu.addEventListener('click', bukaDrawer);
    elDrawerOverlay.addEventListener('click', function (ev) { if (ev.target === elDrawerOverlay) tutupDrawer(); });

    // Delegasi (BUKAN satu listener per tombol) -- gap-closure menu-tree.js: item drawer utk taksonomi
    // ERP (Ringkasan..Konfigurasi) SEKARANG dirender ULANG secara dinamis oleh renderTreeDrawer() saat
    // startup (menggantikan tombol statis lama di index.html satu-satu), jadi listener per-elemen lama
    // TIDAK PERNAH terpasang ke tombol yang baru dibuat. Delegasi di elemen induk statis (`.drawer-nav`,
    // SELALU ada) bekerja utk tombol lama MAUPUN baru tanpa perlu re-wiring manual tiap render ulang.
    document.querySelector('.drawer-nav').addEventListener('click', function (ev) {
        var btn = ev.target.closest('.drawer-item[data-layar]');
        if (btn) {
            document.querySelectorAll('.drawer-item').forEach(function (b) { b.classList.remove('aktif'); });
            btn.classList.add('aktif');
            var target = btn.getAttribute('data-layar');
            tutupDrawer();
            berhentiPollingLayarPelanggan(); // pindah layar apa pun menghentikan polling siaran (hemat baterai/data)
            tampilkanLayar(target);
            if (target === 'layarRingkasan') muatRingkasan();
            else if (target === 'layarPelanggan') mulaiPollingLayarPelanggan();
            else if (target === 'layarPesananOnline') { tampilkanBadgePesananBaru(0); muatPesananOnline(); }
            else if (target === 'layarKeranjangTertahan') muatKeranjangTertahan();
            else if (target === 'layarRiwayatPenjualan') muatRiwayatPenjualan();
            else if (target === 'layarLaporanTransaksi') muatLaporanTransaksi();
            else if (target === 'layarAnggota') muatDaftarAnggota();
            else if (target === 'layarProduk') muatDaftarProduk('');
            else if (target === 'layarKulakan') { renderGerbangKulakan(); muatKulakan(); }
            else if (target === 'layarReturPenjualan') muatReturPenjualan();
            else if (target === 'layarStokOpname') muatStokOpname();
            else if (target === 'layarAturanDiskon') muatAturanDiskon();
            else if (target === 'layarKonfigurasi') muatKonfigurasiLayar();
            else if (target === 'layarLaporanKatalog') muatKatalogLk();
            else if (target === 'layarRiwayatSinkron') muatRiwayatSinkron();
            else if (target === 'layarLogError') muatLogError();
        }
    });

    // ---- Notifikasi Pesanan Online Baru (Fase gap-closure Android) ----
    // Server: pesanan_online_baru -- SUDAH ADA & dipakai Desktop (pos-renderer.js
    // mulaiPollingPesananBaru/cekPesananOnlineBaru, poll tiap 20 detik, sejak_id sbg cursor yg
    // TIDAK disimpan server -- klien wajib menyimpan maksId sendiri & mengirimnya balik). Pola SAMA
    // PERSIS: panggilan PERTAMA (sejakIdPesananBaru === null) hanya merekam baseline maksId, TIDAK
    // menampilkan apa pun -- kalau tidak, tiap kali app dibuka akan membanjiri kasir dgn seluruh
    // pesanan lama yg belum diverifikasi. Badge merah muncul di item drawer "Pesanan Online" &
    // hilang saat layar itu dibuka (lihat pemanggil drawer-item di bawah).
    var sejakIdPesananBaru = null;
    var jumlahPesananBaruBelumDilihat = 0;

    // Dicari ULANG tiap panggilan (bukan di-cache sekali di atas) -- badge ini sekarang hidup di
    // dalam drawer tree yang dirender ASYNC oleh menu-tree.js (mungkin belum ada di DOM saat modul
    // ini pertama dieksekusi). Aman/murah -- getElementById dipanggil jarang (bukan per-frame).
    function tampilkanBadgePesananBaru(n) {
        jumlahPesananBaruBelumDilihat = n;
        var elBadgePesananBaru = document.getElementById('badgePesananBaru');
        if (!elBadgePesananBaru) return;
        if (n > 0) { elBadgePesananBaru.textContent = n > 99 ? '99+' : String(n); elBadgePesananBaru.style.display = 'inline-flex'; }
        else { elBadgePesananBaru.style.display = 'none'; }
    }

    /**
     * Notifikasi sistem best-effort (gap-closure "notifikasi lebih tegas, bukan cuma badge") --
     * Web Notification API standar, TANPA plugin Capacitor tambahan (belum ada @capacitor/local-notifications
     * terpasang). Diam-diam no-op bila WebView/izin tak mendukung -- badge+toast tetap jalan sbg jalur utama.
     */
    function notifikasiOsPesananBaru(jumlah) {
        try {
            if (typeof Notification === 'undefined') return;
            var tampilkan = function () {
                try { new Notification('Pesanan Online Baru', { body: jumlah + ' pesanan online baru menunggu diproses.', silent: true }); }
                catch (e) { /* abaikan */ }
            };
            if (Notification.permission === 'granted') tampilkan();
            else if (Notification.permission !== 'denied') {
                Notification.requestPermission().then(function (p) { if (p === 'granted') tampilkan(); });
            }
        } catch (e) { /* abaikan -- notifikasi OS bukan jalur kritis */ }
    }

    async function cekPesananOnlineBaru() {
        try {
            var r = await AisApi.panggil('pesanan_online_baru', { sejak_id: sejakIdPesananBaru || 0 });
            if (r.status !== 'success') return; // blip jaringan biasa saat polling latar -- jangan ganggu kasir
            var adalahBaseline = (sejakIdPesananBaru === null);
            sejakIdPesananBaru = r.maksId || sejakIdPesananBaru || 0;
            if (adalahBaseline) return;
            var baru = r.pesanan || [];
            if (baru.length > 0) {
                tampilkanBadgePesananBaru(jumlahPesananBaruBelumDilihat + baru.length);
                toast('success', 'Ada ' + baru.length + ' pesanan online baru!');
                beepSo(true);
                notifikasiOsPesananBaru(baru.length);
            }
        } catch (e) { /* diam -- polling latar, jangan tampilkan error tiap 20 detik */ }
    }

    function mulaiPollingPesananBaru() {
        cekPesananOnlineBaru();
        setInterval(cekPesananOnlineBaru, 20000);
    }

    // ---- Layar Pelanggan (siaran keranjang ke perangkat kedua, gap-closure Android) ----
    // Server: layar_pelanggan_kirim/layar_pelanggan_ambil -- BARU, TIDAK ada padanan langsung di
    // Desktop (yg memakai jendela Electron kedua di monitor fisik kedua lewat OS-level dual-monitor --
    // Android/WebView tidak punya akses API layar-kedua semudah itu). Didesain ulang sbg SINKRON DUA
    // PERANGKAT: perangkat kasir MENGIRIM status keranjang (debounced, fire-and-forget -- gagal kirim
    // TIDAK BOLEH mengganggu alur jual-beli), perangkat kedua yg dibuka ke layar ini MEMOLING server
    // tiap 1,5 detik SELAMA layar ini terbuka saja (berhenti otomatis saat pindah layar -- lihat
    // pemanggil di drawer-item & kembaliKeKasir -- supaya tidak menguras baterai/data kalau lupa
    // ditutup). Kanal disiarkan per-toko (lihat JavaDoc server) -- kedua perangkat cukup login ke
    // toko yang sama, tak perlu langkah "pairing" apa pun.
    var kirimLayarPelangganTimer = null;
    function siarkanLayarPelanggan() {
        if (!state.tokoId) return;
        clearTimeout(kirimLayarPelangganTimer);
        kirimLayarPelangganTimer = setTimeout(function () {
            var ringkasan = hitungRingkasanKeranjang();
            var items = state.cart.map(function (c) { return { nama: c.nama, jumlah: c.jumlah, harga: c.harga, subtotal: c.harga * c.jumlah }; });
            AisApi.panggil('layar_pelanggan_kirim', {
                items: items, subtotal: ringkasan.subtotal, diskon: ringkasan.totalDiskon, total: ringkasan.total,
                member_nama: state.memberTerpilih ? state.memberTerpilih.nama : ''
            }, 8000).catch(function () { /* diam -- gagal kirim siaran tak boleh mengganggu jualan */ });
        }, 400);
    }

    var elIsiLayarPelanggan = document.getElementById('isiLayarPelanggan');
    var pollingLayarPelangganTimer = null;

    function htmlIdleLayarPelanggan() {
        return '<div class="lp2-idle"><div class="lp2-logo">&#128179;</div>'
            + '<div class="lp2-sambutan">Selamat Datang di<br>' + escapeHtml(state.tokoNama || 'Toko Kami') + '</div>'
            + '<div class="lp2-sub">Terima kasih sudah berbelanja</div></div>';
    }

    function htmlAktifLayarPelanggan(r) {
        var items = r.items || [];
        var html = '<div class="lp2-header"><span>' + escapeHtml(state.tokoNama || 'Toko') + '</span>'
            + (r.memberNama ? ('<span class="lp2-member">' + escapeHtml(r.memberNama) + '</span>') : '') + '</div>';
        html += '<div class="lp2-list">' + (items.length ? items.map(function (it) {
            return '<div class="lp2-item"><div class="lp2-nama">' + escapeHtml(it.nama) + '</div>'
                + '<div class="lp2-detail">' + it.jumlah + ' &times; ' + formatRupiah(it.harga) + '</div>'
                + '<div class="lp2-subtotal">' + formatRupiah(it.subtotal) + '</div></div>';
        }).join('') : '') + '</div>';
        html += '<div class="lp2-footer">';
        if (r.diskon > 0) html += '<div class="lp2-baris"><span>Diskon</span><span>- ' + formatRupiah(r.diskon) + '</span></div>';
        html += '<div class="lp2-total"><span>TOTAL</span><span>' + formatRupiah(r.total) + '</span></div>';
        html += '</div>';
        return html;
    }

    async function ambilLayarPelanggan() {
        try {
            var r = await AisApi.panggil('layar_pelanggan_ambil', {});
            elIsiLayarPelanggan.innerHTML = (r.status === 'success' && r.aktif) ? htmlAktifLayarPelanggan(r) : htmlIdleLayarPelanggan();
        } catch (e) { /* diam -- polling latar menghadap pelanggan, jangan tampilkan error teknis */ }
    }

    function mulaiPollingLayarPelanggan() {
        elIsiLayarPelanggan.innerHTML = htmlIdleLayarPelanggan();
        ambilLayarPelanggan();
        pollingLayarPelangganTimer = setInterval(ambilLayarPelanggan, 1500);
    }
    function berhentiPollingLayarPelanggan() {
        clearInterval(pollingLayarPelangganTimer);
        pollingLayarPelangganTimer = null;
    }
    document.getElementById('btnKeluarLayarPelanggan').addEventListener('click', function () { kembaliKeKasir(); });

    // ---- Ringkasan Hari Ini ----
    var elIsiRingkasan = document.getElementById('isiRingkasan');
    async function muatRingkasan() {
        elIsiRingkasan.innerHTML = '<div class="layar-kosong">Memuat...</div>';
        try {
            var r = await AisApi.panggil('ringkasan', {});
            if (r.status !== 'success') { elIsiRingkasan.innerHTML = '<div class="layar-kosong">' + escapeHtml(pesanDariHasil(r, 'Gagal memuat ringkasan.')) + '</div>'; return; }
            var terlaris = r.produkTerlaris || [];
            var html = '<div class="ringkas-bar">'
                + '<div class="kartu-ringkas"><div class="label">Omzet Hari Ini</div><div class="nilai">' + formatRupiah(r.omzetHariIni) + '</div></div>'
                + '<div class="kartu-ringkas"><div class="label">Transaksi</div><div class="nilai">' + (r.transaksiHariIni || 0) + '</div></div>'
                + '<div class="kartu-ringkas" style="grid-column:1/-1;"><div class="label">Item Terjual</div><div class="nilai">' + (r.qtyTerjualHariIni || 0) + '</div></div>'
                + '</div>'
                + '<div class="sub-judul">Produk Terlaris Hari Ini</div>';
            html += terlaris.length === 0
                ? '<div class="layar-kosong">Belum ada penjualan hari ini.</div>'
                : terlaris.map(function (p) { return '<div class="baris-terlaris"><span>' + escapeHtml(p.nama) + '</span><span>' + p.qty + ' terjual</span></div>'; }).join('');
            html += '<div class="sub-judul">Peringkat Mitra/Toko (30 hari)</div><div id="ringkasPeringkatMitra"><div class="layar-kosong">Memuat...</div></div>';
            html += '<div class="sub-judul">Resep, HPP &amp; Margin</div><div id="ringkasResepHpp"><div class="layar-kosong">Memuat...</div></div>';
            html += '<div class="sub-judul">Ramalan Penjualan</div><div id="ringkasRamalan"><div class="layar-kosong">Memuat...</div></div>';
            html += '<div class="sub-judul">Monitor Promo &amp; Cashback</div><div id="ringkasPromo"><div class="layar-kosong">Memuat...</div></div>';
            html += '<div class="sub-judul">Kepatuhan Operasional</div><div id="ringkasKepatuhan"><div class="layar-kosong">Memuat...</div></div>';
            elIsiRingkasan.innerHTML = html;
            muatPeringkatMitraRingkasan();
            muatResepHppRingkasan();
            muatRamalanRingkasan();
            muatPromoRingkasan();
            muatKepatuhanRingkasan();
        } catch (e) {
            elIsiRingkasan.innerHTML = '<div class="layar-kosong">Gagal memuat: ' + escapeHtml(e && e.message ? e.message : e) + '</div>';
        }
    }

    /**
     * "Peringkat Mitra/Toko" (gap-closure kloning tab ZK, padanan Desktop ringkasan-renderer.js
     * muatTabPeringkat) -- dimuat TERPISAH dari muatRingkasan() (aksi server beda: peringkat_mitra)
     * supaya kegagalannya tak menjatuhkan KPI+produk-terlaris utama yg sudah lebih dulu tampil.
     * Akun non-admin (terkunci 1 toko) akan menerima {@code semuaToko:false} & daftar 1-baris --
     * tetap ditampilkan apa adanya (bukan disembunyikan) supaya kasir toko itu tetap lihat posisinya.
     */
    async function muatPeringkatMitraRingkasan() {
        var el = document.getElementById('ringkasPeringkatMitra');
        if (!el) return;
        try {
            var r = await AisApi.panggil('peringkat_mitra', {});
            if (r.status !== 'success') { el.innerHTML = '<div class="layar-kosong">Gagal memuat peringkat mitra.</div>'; return; }
            var daftar = r.daftar || [];
            if (daftar.length === 0) { el.innerHTML = '<div class="layar-kosong">Belum ada data pada periode ini.</div>'; return; }
            el.innerHTML = daftar.slice(0, 10).map(function (t, i) {
                var pertumbuhan = t.pertumbuhan == null ? '-' : ((t.pertumbuhan >= 0 ? '+' : '') + t.pertumbuhan.toFixed(1) + '%');
                var kelasStatus = t.status === 'Menurun' ? 'pending' : (t.status === 'Tumbuh Pesat' || t.status === 'Bertumbuh') ? 'synced' : 'pending';
                return '<div class="baris-terlaris"><span>' + (i + 1) + '. ' + escapeHtml(t.nama) + '</span>'
                    + '<span>' + formatRupiah(t.omzet) + ' &middot; <span class="lencana-status ' + kelasStatus + '">' + pertumbuhan + '</span></span></div>';
            }).join('');
        } catch (e) {
            el.innerHTML = '<div class="layar-kosong">Gagal memuat peringkat mitra.</div>';
        }
    }

    /** "Resep, HPP & Margin" (gap-closure kloning ZK, padanan Desktop tabResep) -- ringkas: KPI + top-margin saja, tabel lengkap disederhanakan utk layar HP. */
    async function muatResepHppRingkasan() {
        var el = document.getElementById('ringkasResepHpp');
        if (!el) return;
        try {
            var r = await AisApi.panggil('resep_hpp_margin', {});
            if (r.status !== 'success') { el.innerHTML = '<div class="layar-kosong">Gagal memuat data resep.</div>'; return; }
            var topMargin = (r.topMargin || []).slice(0, 5);
            var html = '<div class="ringkas-bar">'
                + '<div class="kartu-ringkas"><div class="label">Menu Ber-Resep</div><div class="nilai">' + (r.totalMenu || 0) + '</div></div>'
                + '<div class="kartu-ringkas"><div class="label">Rata-rata Margin</div><div class="nilai">' + Number(r.rataMargin || 0).toFixed(1) + '%</div></div>'
                + '</div>';
            if (r.namaMarginTerendah) html += '<div class="baris-terlaris"><span>&#9888;&#65039; Margin tertipis: ' + escapeHtml(r.namaMarginTerendah) + '</span><span>' + Number(r.marginTerendah || 0).toFixed(1) + '%</span></div>';
            html += topMargin.length === 0 ? '<div class="layar-kosong">Belum ada produk dengan resep.</div>'
                : topMargin.map(function (m) { return '<div class="baris-terlaris"><span>' + escapeHtml(m.nama) + '</span><span>' + m.margin.toFixed(1) + '%</span></div>'; }).join('');
            el.innerHTML = html;
        } catch (e) {
            el.innerHTML = '<div class="layar-kosong">Gagal memuat data resep.</div>';
        }
    }

    /** "Ramalan Penjualan" (gap-closure kloning ZK, padanan Desktop tabRamalan) -- regresi linear jumlah transaksi 14 hari. */
    async function muatRamalanRingkasan() {
        var el = document.getElementById('ringkasRamalan');
        if (!el) return;
        try {
            var r = await AisApi.panggil('ramalan_penjualan', {});
            if (r.status !== 'success') { el.innerHTML = '<div class="layar-kosong">Gagal memuat ramalan.</div>'; return; }
            var arah = (r.naik ? '↑ Naik ' : '↓ Turun ') + Number(r.persenTren || 0).toFixed(1) + '%';
            el.innerHTML = '<div class="ringkas-bar">'
                + '<div class="kartu-ringkas"><div class="label">Rata-rata/Hari</div><div class="nilai">' + Number(r.rataRata || 0).toFixed(1) + '</div></div>'
                + '<div class="kartu-ringkas ' + (r.naik ? 'sukses' : 'bahaya') + '"><div class="label">Perkiraan Besok</div><div class="nilai">' + Number(r.prediksiBerikutnya || 0).toFixed(1) + '</div></div>'
                + '<div class="kartu-ringkas" style="grid-column:1/-1;"><div class="label">Arah Tren (14 hari)</div><div class="nilai">' + arah + '</div></div>'
                + '</div>';
        } catch (e) {
            el.innerHTML = '<div class="layar-kosong">Gagal memuat ramalan.</div>';
        }
    }

    /** "Monitor Promo & Cashback" (gap-closure kloning ZK, padanan Desktop tabPromo). */
    async function muatPromoRingkasan() {
        var el = document.getElementById('ringkasPromo');
        if (!el) return;
        try {
            var r = await AisApi.panggil('monitor_promo_cashback', {});
            if (r.status !== 'success') { el.innerHTML = '<div class="layar-kosong">Gagal memuat data promo.</div>'; return; }
            el.innerHTML = '<div class="ringkas-bar">'
                + '<div class="kartu-ringkas"><div class="label">Diskon (30 hari)</div><div class="nilai" style="font-size:13px;">' + formatRupiah(r.diskonDiberikan || 0) + '</div></div>'
                + '<div class="kartu-ringkas"><div class="label">Cashback (30 hari)</div><div class="nilai" style="font-size:13px;">' + formatRupiah(r.cashbackDiberikan || 0) + '</div></div>'
                + '<div class="kartu-ringkas sukses"><div class="label">Cashback Dicairkan</div><div class="nilai" style="font-size:13px;">' + formatRupiah(r.cashbackDicairkan || 0) + '</div></div>'
                + '<div class="kartu-ringkas"><div class="label">Saldo Mengendap</div><div class="nilai" style="font-size:13px;">' + formatRupiah(r.saldoMengendap || 0) + '</div></div>'
                + '</div>';
        } catch (e) {
            el.innerHTML = '<div class="layar-kosong">Gagal memuat data promo.</div>';
        }
    }

    /** "Kepatuhan Operasional" (gap-closure kloning ZK, 4/6 rule -- padanan Desktop tabKepatuhan). */
    async function muatKepatuhanRingkasan() {
        var el = document.getElementById('ringkasKepatuhan');
        if (!el) return;
        try {
            var r = await AisApi.panggil('kepatuhan_operasional', {});
            if (r.status !== 'success') { el.innerHTML = '<div class="layar-kosong">Gagal memuat kepatuhan operasional.</div>'; return; }
            el.innerHTML = '<div class="ringkas-bar">'
                + '<div class="kartu-ringkas bahaya"><div class="label">Telat Opname</div><div class="nilai">' + (r.jmlTelatOpname || 0) + '</div></div>'
                + '<div class="kartu-ringkas bahaya"><div class="label">Sesi Lupa Tutup</div><div class="nilai">' + (r.jmlSesiLupaTutup || 0) + '</div></div>'
                + '<div class="kartu-ringkas"><div class="label">Selisih Kas</div><div class="nilai" style="font-size:13px;">' + formatRupiah(r.totalSelisihKas || 0) + '</div></div>'
                + '<div class="kartu-ringkas"><div class="label">Diskon Manual</div><div class="nilai" style="font-size:13px;">' + formatRupiah(r.totalDiskonManual || 0) + '</div></div>'
                + '<div class="kartu-ringkas"><div class="label">Dampak Selisih Opname</div><div class="nilai" style="font-size:13px;">' + formatRupiah(r.totalSelisihOpnameRp || 0) + '</div></div>'
                + '<div class="kartu-ringkas bahaya"><div class="label">Transaksi Dibatalkan</div><div class="nilai">' + (r.jmlPembatalan || 0) + '</div></div>'
                + '</div>'
                + (r.adaTabelPembatalan === false ? '<div class="layar-kosong" style="padding:8px;font-size:11px;">Tabel arsip pembatalan belum tersedia di server ini.</div>' : '');
        } catch (e) {
            el.innerHTML = '<div class="layar-kosong">Gagal memuat kepatuhan operasional.</div>';
        }
    }
    document.getElementById('btnBackRingkasan').addEventListener('click', function () { kembaliKeKasir(); });
    document.getElementById('btnMuatUlangRingkasan').addEventListener('click', muatRingkasan);

    // =====================================================================
    // ==== Pesanan Online + Keranjang Tertahan (Fase 3) ====
    // Keduanya berbagi SATU sumber data (aksi pesanan_list, lihat JavaDoc server
    // PosApi.prosesPesananList) -- dibedakan lewat field dariPembeliOnline yg baru ditambahkan
    // (true = pembeli checkout sendiri lewat toko_online.jsp, false/tak ada = ditahan kasir via
    // tombol "Tahan" di atas). Dimuat ulang independen tiap kali layarnya dibuka supaya selalu
    // terkini (BUKAN cache offline -- sama spt konfigurasi/dasbor, verifikasi/pembatalan wajib online).
    // =====================================================================
    var elIsiPesananOnline = document.getElementById('isiPesananOnline');
    var elInCariPesananOnline = document.getElementById('inCariPesananOnline');
    var elOverlayVerifikasiPesanan = document.getElementById('overlayVerifikasiPesanan');
    var elGridMetodePesanan = document.getElementById('gridMetodePesanan');
    var elIsiKeranjangTertahan = document.getElementById('isiKeranjangTertahan');

    var elBtnFilterPesananOnline = document.getElementById('btnFilterPesananOnline');
    var elPanelFilterPesanan = document.getElementById('panelFilterPesanan');
    var elFilterPesananMulai = document.getElementById('filterPesananMulai');
    var elFilterPesananAkhir = document.getElementById('filterPesananAkhir');
    var elFilterPesananKode = document.getElementById('filterPesananKode');
    var elFilterPesananPembeli = document.getElementById('filterPesananPembeli');
    var elFilterPesananPedagang = document.getElementById('filterPesananPedagang');
    var elWrapFilterPesananPedagang = document.getElementById('wrapFilterPesananPedagang');
    var elBtnSaringPesanan = document.getElementById('btnSaringPesanan');
    var elBtnBayarSemuaPesanan = document.getElementById('btnBayarSemuaPesanan');
    var elWrapProgressBayarSemuaPesanan = document.getElementById('wrapProgressBayarSemuaPesanan');
    var elProgressBayarSemuaPesananBar = document.getElementById('progressBayarSemuaPesananBar');
    var elProgressBayarSemuaPesananTeks = document.getElementById('progressBayarSemuaPesananTeks');
    var elOverlayDetailPesanan = document.getElementById('overlayDetailPesanan');
    var elJudulDetailPesanan = document.getElementById('judulDetailPesanan');
    var elIsiDetailPesanan = document.getElementById('isiDetailPesanan');
    var elBtnTutupDetailPesanan = document.getElementById('btnTutupDetailPesanan');

    function tebakIkonMetode(nama) {
        var n = String(nama || '').toLowerCase();
        if (n.indexOf('tunai') >= 0 || n.indexOf('cash') >= 0) return '\u{1F4B5}';
        if (n.indexOf('qris') >= 0 || n.indexOf('qr') >= 0) return '\u{1F4F1}';
        if (n.indexOf('kartu') >= 0 || n.indexOf('debit') >= 0 || n.indexOf('kredit') >= 0) return '\u{1F4B3}';
        if (n.indexOf('transfer') >= 0 || n.indexOf('bank') >= 0) return '\u{1F3E6}';
        return '\u{1F4B0}';
    }

    var pesananDariCache = false;
    async function muatDaftarPesanan(filter) {
        try {
            var r = await AisApi.panggil('pesanan_list', filter || {});
            if (r.status !== 'success') { toast('error', pesanDariHasil(r, 'Gagal memuat daftar pesanan.')); return []; }
            state.pesananOnline = r.pesanan || [];
            pesananDariCache = false;
            if (window.PesananCache) window.PesananCache.gantiSemuaPesananCache(state.pesananOnline).catch(function () {});
            return state.pesananOnline;
        } catch (e) {
            if (window.PesananCache) {
                try {
                    var cache = await window.PesananCache.pesananCacheSemua();
                    if (cache.length) {
                        state.pesananOnline = cache;
                        pesananDariCache = true;
                        toast('info', 'Offline -- menampilkan daftar pesanan tersimpan terakhir. Verifikasi/pembatalan butuh koneksi.');
                        return state.pesananOnline;
                    }
                } catch (e2) { /* cache pun gagal -- lempar error asli */ }
            }
            throw e;
        }
    }

    /** Kumpulkan nilai filter aktif di panel -- dipakai baik oleh muat-daftar biasa maupun "Bayar Semua". */
    function bacaFilterPesanan() {
        var f = {};
        if (elFilterPesananMulai.value) f.sejak = elFilterPesananMulai.value;
        if (elFilterPesananAkhir.value) f.sampai = elFilterPesananAkhir.value;
        if (elFilterPesananKode.value.trim()) f.kode = elFilterPesananKode.value.trim();
        if (elFilterPesananPembeli.value.trim()) f.pembeli = elFilterPesananPembeli.value.trim();
        if (state.isAdminAkun && elFilterPesananPedagang.value.trim()) f.pedagang = elFilterPesananPedagang.value.trim();
        return f;
    }

    // ---- Pesanan Online ----
    var elInfoCachePesanan = document.getElementById('infoCachePesanan');
    function formatWaktuCachePesanan(iso) {
        if (!iso) return null;
        var d = new Date(iso);
        if (isNaN(d.getTime())) return null;
        var p = function (n) { return String(n).padStart(2, '0'); };
        return p(d.getDate()) + '-' + p(d.getMonth() + 1) + '-' + d.getFullYear() + ' ' + p(d.getHours()) + ':' + p(d.getMinutes());
    }
    async function muatRingkasanCachePesanan() {
        if (!elInfoCachePesanan || !window.PesananCache) return;
        try {
            var r = await PesananCache.ringkasanPesananCache();
            var waktu = formatWaktuCachePesanan(r.disinkronPada);
            if (pesananDariCache) {
                elInfoCachePesanan.textContent = '\u{26A0}\u{FE0F} Offline -- menampilkan cache lokal' + (waktu ? ' (terakhir disinkron ' + waktu + ')' : '') + '. Verifikasi/pembatalan butuh koneksi.';
            } else {
                elInfoCachePesanan.textContent = r.total > 0
                    ? ('\u{1F4E6} ' + r.total + ' pesanan tersimpan di cache lokal' + (waktu ? ' -- terakhir disinkron ' + waktu : '.'))
                    : '\u{1F4E6} Belum ada cache lokal.';
            }
        } catch (e) { /* status cache gagal dimuat bukan blocker */ }
    }
    async function muatPesananOnline() {
        elIsiPesananOnline.innerHTML = '<div class="layar-kosong">Memuat...</div>';
        elWrapFilterPesananPedagang.style.display = state.isAdminAkun ? 'block' : 'none';
        elBtnBayarSemuaPesanan.style.display = state.isAdminAkun ? 'block' : 'none';
        try {
            await muatDaftarPesanan(bacaFilterPesanan());
            renderDaftarPesananOnline();
            muatRingkasanCachePesanan();
        } catch (e) {
            elIsiPesananOnline.innerHTML = '<div class="layar-kosong">Gagal memuat: ' + escapeHtml(e && e.message ? e.message : e) + '</div>';
        }
    }
    /**
     * "Tambah Pesanan" -- gap-closure, pola SAMA dgn Desktop pesanan-renderer.js btnTambahPesanan:
     * arahkan ke Kasir (BUKAN mini-keranjang kedua yg duplikat logika cari produk/diskon/PIN member
     * yg sudah ada+teruji) -- tombol "Tahan" di Kasir memanggil aksi draft_bayar yg SAMA PERSIS
     * menghasilkan baris pesanan baru di layar ini.
     */
    document.getElementById('btnTambahPesanan').addEventListener('click', function () {
        kembaliKeKasir();
        toast('info', 'Tambahkan produk ke keranjang, lalu tekan "Tahan" untuk menyimpannya sebagai pesanan baru.');
    });
    elBtnFilterPesananOnline.addEventListener('click', function () { elPanelFilterPesanan.classList.toggle('tampil'); });
    elBtnSaringPesanan.addEventListener('click', function () { statePesananOnline.page = 1; muatPesananOnline(); });

    var statePesananOnline = { page: 1, pageSize: 20 };
    var namaMesinSayaPesanan = null;
    async function muatIdentitasMesinSayaPesanan() {
        try {
            var m = await AisApi.identitasMesinBaca();
            namaMesinSayaPesanan = m.namaMesin && m.namaMesin.trim() ? m.namaMesin.trim() : ('Mesin-' + m.idMesin.substr(0, 8));
        } catch (e) { /* abaikan */ }
    }
    function badgeMesinPesanan(namaMesin) {
        if (!namaMesin) return '';
        var punyaSaya = namaMesinSayaPesanan && namaMesin === namaMesinSayaPesanan;
        return ' &middot; <span class="lencana-status ' + (punyaSaya ? 'synced' : 'pending') + '">' + (punyaSaya ? 'Mesin Ini &middot; ' : '') + escapeHtml(namaMesin) + '</span>';
    }

    function renderDaftarPesananOnline() {
        var keyword = (elInCariPesananOnline.value || '').trim().toLowerCase();
        var daftarUtuh = state.pesananOnline.filter(function (p) {
            if (p.dariPembeliOnline !== true) return false;
            if (!keyword) return true;
            return (p.kode || '').toLowerCase().indexOf(keyword) >= 0 || (p.pemesan || '').toLowerCase().indexOf(keyword) >= 0;
        });
        document.getElementById('kpiTotalPesanan').textContent = String(daftarUtuh.length);
        document.getElementById('kpiPesananMenunggu').textContent = String(daftarUtuh.filter(function (p) { return !p.lunas; }).length);
        if (daftarUtuh.length === 0) {
            elIsiPesananOnline.innerHTML = '<div class="layar-kosong">' + (state.pesananOnline.length === 0 ? 'Belum ada pesanan online.' : 'Tidak ada pesanan yang cocok.') + '</div>';
            return;
        }
        var totalHal = Math.max(1, Math.ceil(daftarUtuh.length / statePesananOnline.pageSize));
        if (statePesananOnline.page > totalHal) statePesananOnline.page = totalHal;
        var awal = (statePesananOnline.page - 1) * statePesananOnline.pageSize;
        var daftar = daftarUtuh.slice(awal, awal + statePesananOnline.pageSize);
        var html = '';
        daftar.forEach(function (p) {
            var items = (p.items || []).map(function (it) { return it.nama + ' (' + it.jumlah + ')'; }).join(', ') || '-';
            var aksiSelalu = '<div class="aksi-pesanan"><button type="button" class="btn-detail-aksi" data-id="' + p.id + '">&#128203; Detail</button>'
                + (p.lunas ? ('<button type="button" class="btn-cetak-aksi" data-id="' + p.id + '">&#128424;&#65039; Cetak</button>') : '')
                + (bolehAksiMenu('pesanan', 'update') ? ('<button type="button" class="btn-hitung-aksi" data-id="' + p.id + '">&#129518; Hitung Ulang</button>') : '')
                + '</div>';
            html += '<div class="baris-riwayat-item" data-id="' + p.id + '">'
                + '<div class="atas"><span class="kode">' + escapeHtml(p.kode || ('#' + p.id)) + '</span>'
                + '<span class="badge-status ' + (p.lunas ? 'lunas' : 'menunggu') + '">' + (p.lunas ? 'Lunas' : 'Menunggu') + '</span></div>'
                + '<div>&#128100; ' + escapeHtml(p.pemesan || 'Pelanggan umum') + (p.kasirLoginNama ? (' &middot; kasir: ' + escapeHtml(p.kasirLoginNama)) : '') + badgeMesinPesanan(p.namaMesin) + (p.keterangan ? (' &mdash; ' + escapeHtml(p.keterangan)) : '') + '</div>'
                + '<div class="waktu">' + escapeHtml(p.tanggalPembayaran || '') + '</div>'
                + '<div style="margin-top:4px;font-size:11.5px;color:var(--muted);">' + escapeHtml(items) + '</div>'
                + '<div style="margin-top:4px;font-weight:800;">' + formatRupiah(p.totalBiaya) + '</div>'
                + aksiSelalu
                + (p.lunas ? '' : ('<div class="aksi-pesanan"><button type="button" class="btn-verifikasi" data-id="' + p.id + '">Verifikasi</button>'
                    // Gerbang "supervisor-only" (gap-closure "edit/hapus/batal hanya supervisor") --
                    // gerbang SEBENARNYA ditegakkan server-side (PosApi.bolehSupervisorAtauAdmin di
                    // prosesBatalPesanan), ini murni UX.
                    + (bolehAksiMenu('pesanan', 'reject') ? ('<button type="button" class="btn-batal-aksi" data-id="' + p.id + '">Batalkan</button>') : '') + '</div>'))
                + '</div>';
        });
        html += '<div class="paginasi-lt">'
            + '<span>Hal ' + statePesananOnline.page + '/' + totalHal + ' (' + daftarUtuh.length + ' pesanan)</span>'
            + '<button type="button" id="btnPesananOnlineHalSebelumnya"' + (statePesananOnline.page <= 1 ? ' disabled' : '') + '>&#8249; Sebelumnya</button>'
            + '<button type="button" id="btnPesananOnlineHalBerikutnya"' + (statePesananOnline.page >= totalHal ? ' disabled' : '') + '>Berikutnya &#8250;</button>'
            + '</div>';
        elIsiPesananOnline.innerHTML = html;
        var elSebelumnya = document.getElementById('btnPesananOnlineHalSebelumnya');
        var elBerikutnya = document.getElementById('btnPesananOnlineHalBerikutnya');
        if (elSebelumnya) elSebelumnya.addEventListener('click', function () { if (statePesananOnline.page > 1) { statePesananOnline.page--; renderDaftarPesananOnline(); } });
        if (elBerikutnya) elBerikutnya.addEventListener('click', function () { if (statePesananOnline.page < totalHal) { statePesananOnline.page++; renderDaftarPesananOnline(); } });
        elIsiPesananOnline.querySelectorAll('.btn-verifikasi').forEach(function (btn) {
            btn.addEventListener('click', function () {
                var p = state.pesananOnline.filter(function (x) { return String(x.id) === btn.getAttribute('data-id'); })[0];
                if (p) bukaModalVerifikasiPesanan(p);
            });
        });
        elIsiPesananOnline.querySelectorAll('.btn-batal-aksi').forEach(function (btn) {
            btn.addEventListener('click', function () {
                var p = state.pesananOnline.filter(function (x) { return String(x.id) === btn.getAttribute('data-id'); })[0];
                if (p) batalkanPesananOnline(p);
            });
        });
        elIsiPesananOnline.querySelectorAll('.btn-detail-aksi').forEach(function (btn) {
            btn.addEventListener('click', function () {
                var p = state.pesananOnline.filter(function (x) { return String(x.id) === btn.getAttribute('data-id'); })[0];
                if (p) bukaModalDetailPesanan(p);
            });
        });
        elIsiPesananOnline.querySelectorAll('.btn-cetak-aksi').forEach(function (btn) {
            btn.addEventListener('click', function () {
                var p = state.pesananOnline.filter(function (x) { return String(x.id) === btn.getAttribute('data-id'); })[0];
                if (p) cetakStrukPesanan(p, btn);
            });
        });
        elIsiPesananOnline.querySelectorAll('.btn-hitung-aksi').forEach(function (btn) {
            btn.addEventListener('click', function () {
                var p = state.pesananOnline.filter(function (x) { return String(x.id) === btn.getAttribute('data-id'); })[0];
                if (p) hitungUlangPesanan(p, btn, muatPesananOnline);
            });
        });
    }
    elInCariPesananOnline.addEventListener('input', function () { statePesananOnline.page = 1; renderDaftarPesananOnline(); });
    document.getElementById('btnBackPesananOnline').addEventListener('click', function () { kembaliKeKasir(); });
    document.getElementById('btnMuatUlangPesananOnline').addEventListener('click', muatPesananOnline);

    var pesananSedangDiverifikasi = null;
    function bukaModalVerifikasiPesanan(p) {
        pesananSedangDiverifikasi = p;
        elGridMetodePesanan.innerHTML = '';
        if (state.caraBayar.length === 0) {
            elGridMetodePesanan.innerHTML = '<div style="grid-column:1/-1;color:var(--muted);font-size:12px;">Tidak ada metode pembayaran aktif -- hubungi admin.</div>';
        } else {
            state.caraBayar.forEach(function (cb) {
                var kartu = document.createElement('button');
                kartu.type = 'button';
                kartu.className = 'kartu-metode';
                kartu.textContent = tebakIkonMetode(cb.nama) + ' ' + cb.nama;
                kartu.addEventListener('click', function () { selesaikanVerifikasiPesanan(p, cb); });
                elGridMetodePesanan.appendChild(kartu);
            });
        }
        elOverlayVerifikasiPesanan.classList.add('tampil');
    }
    document.getElementById('btnTutupVerifikasiPesanan').addEventListener('click', function () { elOverlayVerifikasiPesanan.classList.remove('tampil'); });
    elOverlayVerifikasiPesanan.addEventListener('click', function (ev) { if (ev.target === elOverlayVerifikasiPesanan) elOverlayVerifikasiPesanan.classList.remove('tampil'); });

    async function selesaikanVerifikasiPesanan(p, caraBayar) {
        elOverlayVerifikasiPesanan.classList.remove('tampil');
        var payload = {
            kodeUnik: buatKodeUnik(),
            idToko: p.tokoId || state.tokoId,
            waktu: new Date().toISOString(),
            caraBayar: String(caraBayar.id),
            draftPembelianAnggotaKoperasi: p.id,
            id_member: p.anggotaId != null ? p.anggotaId : null,
            transaksi: (p.items || []).map(function (it) {
                return { id: it.id, nama: it.nama, harga: it.harga, jumlah: it.jumlah, diskon: 0, aturanDiskon: null, cashback: 0 };
            })
        };
        toast('info', 'Memproses verifikasi pesanan ' + (p.kode || '') + '...');
        try {
            var r = await AisApi.panggil('bayar', payload);
            if (r.status === 'success') {
                toast('success', 'Pesanan ' + (p.kode || '') + ' berhasil diverifikasi & diselesaikan.');
                muatPesananOnline();
            } else {
                toast('error', pesanDariHasil(r, 'Gagal memverifikasi pesanan.'));
            }
        } catch (e) {
            ErrorAlert.tampilkanDariException(e, 'Verifikasi Pesanan ' + (p.kode || ''));
        }
    }

    async function batalkanPesananOnline(p) {
        if (!confirm('Batalkan pesanan ' + (p.kode || ('#' + p.id)) + ' dari ' + (p.pemesan || 'pelanggan umum') + '?\n\nData akan dihapus permanen dan tidak bisa dikembalikan.')) return;
        toast('info', 'Membatalkan pesanan...');
        try {
            var r = await AisApi.panggil('batal_pesanan', { id: p.id });
            if (r.status === 'success') { toast('success', 'Pesanan dibatalkan.'); muatPesananOnline(); }
            else toast('error', pesanDariHasil(r, 'Gagal membatalkan pesanan.'));
        } catch (e) {
            ErrorAlert.tampilkanDariException(e, 'Batalkan Pesanan ' + (p.kode || ''));
        }
    }

    // ---- Detail (read-only, gap-closure -- padanan tombol "Detail"/"Monitor" JSP, dipakai KEDUA layar) ----

    function bukaModalDetailPesanan(p) {
        elJudulDetailPesanan.textContent = 'Detail Pesanan ' + (p.kode || ('#' + p.id));
        var html = '<div class="detail-kepala-info">'
            + (p.dariPembeliOnline ? '&#127760; Pesanan Online' : '&#128188; Keranjang Tertahan') + '<br>'
            + 'Status: ' + (p.lunas ? 'Lunas' : 'Menunggu') + '<br>'
            + 'Pembeli: ' + escapeHtml(p.pemesan || 'Pelanggan umum') + '<br>'
            + (p.tokoNama ? ('Toko: ' + escapeHtml(p.tokoNama) + '<br>') : '')
            + 'Waktu: ' + escapeHtml(p.tanggalPembayaran || '-') + '<br>'
            + (p.keterangan ? ('Keterangan: ' + escapeHtml(p.keterangan)) : '')
            + '</div>';
        html += (p.items || []).map(function (it) {
            return '<div class="baris-item-detail"><span>' + escapeHtml(it.nama || '') + ' x' + (it.jumlah || 0) + '</span><span>' + formatRupiah((it.harga || 0) * (it.jumlah || 0)) + '</span></div>';
        }).join('');
        if (p.totalDiskon > 0) html += '<div class="baris-item-detail"><span>Diskon</span><span>-' + formatRupiah(p.totalDiskon) + '</span></div>';
        if (p.totalCashback > 0) html += '<div class="baris-item-detail"><span>Cashback</span><span>+' + formatRupiah(p.totalCashback) + '</span></div>';
        html += '<div class="baris-total-detail"><span>Total</span><span>' + formatRupiah(p.totalBiaya) + '</span></div>';
        elIsiDetailPesanan.innerHTML = html;
        elOverlayDetailPesanan.classList.add('tampil');
    }
    elBtnTutupDetailPesanan.addEventListener('click', function () { elOverlayDetailPesanan.classList.remove('tampil'); });
    elOverlayDetailPesanan.addEventListener('click', function (ev) { if (ev.target === elOverlayDetailPesanan) elOverlayDetailPesanan.classList.remove('tampil'); });

    // ---- Cetak Struk (baris lunas) -- pakai ULANG printer Bluetooth yg sama dgn btnCetakStruk Kasir ----

    /** Ratakan bentuk mentah server {@code detail_transaksi} (field {@code item}/{@code qty}/{@code totalBiaya}) ke bentuk yg dipahami {@link EscPos.bangunStruk} ({@code items}/{@code jumlah}/{@code total}). */
    function bangunDataStrukDariDetail(d) {
        return {
            tokoNama: d.tokoNama, kode: d.kode, waktu: d.waktu,
            items: (d.item || []).map(function (it) { return { nama: it.nama, jumlah: it.qty, harga: it.harga }; }),
            subtotal: (d.item || []).reduce(function (s, it) { return s + (Number(it.qty) || 0) * (Number(it.harga) || 0); }, 0),
            total: d.totalBiaya, diterima: d.bayarTunai > 0 ? d.bayarTunai : null, kembalian: d.kembalian
        };
    }

    async function cetakStrukPesanan(p, btn) {
        if (!p.lunasId) { toast('error', 'Transaksi belum lunas -- tidak ada struk untuk dicetak.'); return; }
        muatPrinterTersimpan();
        if (!printerTersimpan) { toast('error', 'Pilih printer Bluetooth dulu (ikon printer di layar Kasir).'); return; }
        if (!EscPos.tersedia()) { toast('error', 'Fitur cetak hanya tersedia di aplikasi Android (APK).'); return; }
        var semulaTeks = btn ? btn.textContent : null;
        if (btn) { btn.disabled = true; btn.textContent = 'Menyambungkan...'; }
        try {
            var r = await AisApi.panggil('detail_transaksi', { id: p.lunasId });
            if (r.status !== 'success') { toast('error', pesanDariHasil(r, 'Gagal memuat data struk.')); return; }
            await EscPos.sambungkan(printerTersimpan.address);
            if (btn) btn.textContent = 'Mencetak...';
            var bytes = EscPos.bangunStruk(bangunDataStrukDariDetail(r));
            await EscPos.cetak(bytes);
            toast('success', 'Struk terkirim ke printer.');
        } catch (e) {
            ErrorAlert.tampilkanDariException(e, 'Cetak Struk Pesanan ' + (p.kode || ''));
        } finally {
            if (btn) { btn.disabled = false; btn.textContent = semulaTeks; }
        }
    }

    // ---- Hitung Ulang (diskon/cashback, draft ATAU sudah lunas -- lihat JavaDoc server pesananHitungUlang) ----

    async function hitungUlangPesanan(p, btn, muatUlangFn) {
        var semulaTeks = btn.textContent;
        btn.disabled = true;
        btn.textContent = 'Menghitung...';
        try {
            var r = await AisApi.panggil('pesanan_hitung_ulang', { draft_id: p.id });
            if (r.status === 'success') {
                toast('success', 'Pesanan ' + (p.kode || '') + ' dihitung ulang. Diskon: ' + formatRupiah(r.totalDiskon || 0) + ', Cashback: ' + formatRupiah(r.totalCashback || 0) + (r.lunasDiperbarui ? ' (transaksi lunas ikut diperbarui)' : ''));
                muatUlangFn();
            } else {
                toast('error', pesanDariHasil(r, 'Gagal menghitung ulang.'));
            }
        } catch (e) {
            ErrorAlert.tampilkanDariException(e, 'Hitung Ulang Pesanan ' + (p.kode || ''));
        } finally {
            btn.disabled = false;
            btn.textContent = semulaTeks;
        }
    }

    // ---- Bayar Semua (admin, massal -- padanan prosesBayarkanSemua JSP) ----
    // TIDAK transaksional lintas-baris (sama seperti JSP): tiap baris diproses satu-satu lewat jalur
    // verifikasi yg SAMA (selesaikanVerifikasiPesanan tanpa toast per-baris), gagal satu baris tidak
    // membatalkan baris lain -- hasil akhir ditally sukses/gagal & ditampilkan.

    async function prosesVerifikasiPesananSatu(p, caraBayarId) {
        var payload = {
            kodeUnik: buatKodeUnik(),
            idToko: p.tokoId || state.tokoId,
            waktu: new Date().toISOString(),
            caraBayar: String(caraBayarId),
            draftPembelianAnggotaKoperasi: p.id,
            id_member: p.anggotaId != null ? p.anggotaId : null,
            transaksi: (p.items || []).map(function (it) {
                return { id: it.id, nama: it.nama, harga: it.harga, jumlah: it.jumlah, diskon: 0, aturanDiskon: null, cashback: 0 };
            })
        };
        return AisApi.panggil('bayar', payload);
    }

    async function prosesBayarSemuaPesanan() {
        elBtnBayarSemuaPesanan.disabled = true;
        elWrapProgressBayarSemuaPesanan.style.display = 'block';
        elProgressBayarSemuaPesananBar.style.width = '0%';
        elProgressBayarSemuaPesananTeks.textContent = 'Mengambil daftar pesanan belum lunas...';
        try {
            var filter = bacaFilterPesanan();
            filter.hanya_belum_lunas = true;
            filter.limit = 500;
            var r = await AisApi.panggil('pesanan_list', filter);
            if (r.status !== 'success') { toast('error', pesanDariHasil(r, 'Gagal mengambil daftar pesanan.')); return; }
            var belumLunas = (r.pesanan || []).filter(function (p) { return p.dariPembeliOnline === true && !p.lunas; });
            var total = belumLunas.length;
            if (total === 0) { toast('info', 'Tidak ada pesanan online yang menunggu pembayaran sesuai filter saat ini.'); return; }
            var sukses = 0, gagal = 0;
            for (var i = 0; i < total; i++) {
                var p = belumLunas[i];
                elProgressBayarSemuaPesananTeks.textContent = 'Memproses ' + (i + 1) + ' / ' + total + ' -- ' + (p.kode || ('#' + p.id));
                elProgressBayarSemuaPesananBar.style.width = Math.round((i / total) * 100) + '%';
                var caraBayarId = p.caraBayarId != null ? p.caraBayarId : (state.caraBayar[0] && state.caraBayar[0].id);
                if (caraBayarId == null) { gagal++; }
                else {
                    try {
                        var hasil = await prosesVerifikasiPesananSatu(p, caraBayarId);
                        if (hasil.status === 'success') sukses++; else gagal++;
                    } catch (e) { gagal++; }
                }
                elProgressBayarSemuaPesananBar.style.width = Math.round(((i + 1) / total) * 100) + '%';
            }
            elProgressBayarSemuaPesananTeks.textContent = 'Selesai: ' + sukses + ' berhasil' + (gagal > 0 ? ', ' + gagal + ' gagal' : '') + ' dari ' + total + '.';
            toast(gagal > 0 ? 'error' : 'success', 'Bayar Semua selesai: ' + sukses + ' berhasil' + (gagal > 0 ? ', ' + gagal + ' gagal' : '') + '.');
            muatPesananOnline();
        } catch (e) {
            ErrorAlert.tampilkanDariException(e, 'Bayar Semua Pesanan');
        } finally {
            elBtnBayarSemuaPesanan.disabled = false;
            setTimeout(function () { elWrapProgressBayarSemuaPesanan.style.display = 'none'; }, 4000);
        }
    }
    elBtnBayarSemuaPesanan.addEventListener('click', function () {
        if (!confirm('Proses pembayaran SEMUA pesanan online yang belum lunas sesuai filter saat ini?\n\nTiap pesanan diproses satu-satu -- proses ini tidak bisa dibatalkan di tengah jalan.')) return;
        prosesBayarSemuaPesanan();
    });

    // ---- Keranjang Tertahan ----
    async function muatKeranjangTertahan() {
        elIsiKeranjangTertahan.innerHTML = '<div class="layar-kosong">Memuat...</div>';
        try {
            await muatDaftarPesanan();
            renderDaftarKeranjangTertahan();
        } catch (e) {
            elIsiKeranjangTertahan.innerHTML = '<div class="layar-kosong">Gagal memuat: ' + escapeHtml(e && e.message ? e.message : e) + '</div>';
        }
    }

    function renderDaftarKeranjangTertahan() {
        var daftar = state.pesananOnline.filter(function (p) { return !p.lunas && p.dariPembeliOnline !== true; });
        if (daftar.length === 0) {
            elIsiKeranjangTertahan.innerHTML = '<div class="layar-kosong">Belum ada keranjang yang ditahan.</div>';
            return;
        }
        var html = '';
        daftar.forEach(function (p) {
            var jmlItem = (p.items || []).reduce(function (s, it) { return s + (Number(it.jumlah) || 0); }, 0);
            var aksiSelalu = '<div class="aksi-pesanan"><button type="button" class="btn-detail-aksi" data-id="' + p.id + '">&#128203; Detail</button>'
                + (bolehAksiMenu('pesanan', 'update') ? ('<button type="button" class="btn-hitung-aksi" data-id="' + p.id + '">&#129518; Hitung Ulang</button>') : '')
                + '</div>';
            html += '<div class="baris-riwayat-item" data-id="' + p.id + '">'
                + '<div class="atas"><span class="kode">' + escapeHtml(p.kode || ('#' + p.id)) + '</span><span class="waktu">' + escapeHtml(p.tanggalPembayaran || '') + '</span></div>'
                + '<div>&#128100; ' + escapeHtml(p.pemesan || 'Pelanggan umum') + '</div>'
                + '<div style="margin-top:4px;font-size:11.5px;color:var(--muted);">' + jmlItem + ' item &bull; ' + formatRupiah(p.totalBiaya) + '</div>'
                + aksiSelalu
                + '<div class="aksi-pesanan"><button type="button" class="btn-muat-aksi" data-id="' + p.id + '">Muat ke Keranjang</button>'
                // Gerbang "supervisor-only" -- gerbang SEBENARNYA ditegakkan server-side (sama aksi
                // batal_pesanan dgn Pesanan Online), ini murni UX.
                + (bolehAksiMenu('pesanan', 'reject') ? ('<button type="button" class="btn-batal-aksi" data-id="' + p.id + '">Hapus</button>') : '') + '</div>'
                + '</div>';
        });
        elIsiKeranjangTertahan.innerHTML = html;
        elIsiKeranjangTertahan.querySelectorAll('.btn-muat-aksi').forEach(function (btn) {
            btn.addEventListener('click', function () {
                var p = state.pesananOnline.filter(function (x) { return String(x.id) === btn.getAttribute('data-id'); })[0];
                if (p) lanjutkanKeranjangTertahan(p);
            });
        });
        elIsiKeranjangTertahan.querySelectorAll('.btn-batal-aksi').forEach(function (btn) {
            btn.addEventListener('click', function () {
                var p = state.pesananOnline.filter(function (x) { return String(x.id) === btn.getAttribute('data-id'); })[0];
                if (p) hapusKeranjangTertahan(p);
            });
        });
        elIsiKeranjangTertahan.querySelectorAll('.btn-detail-aksi').forEach(function (btn) {
            btn.addEventListener('click', function () {
                var p = state.pesananOnline.filter(function (x) { return String(x.id) === btn.getAttribute('data-id'); })[0];
                if (p) bukaModalDetailPesanan(p);
            });
        });
        elIsiKeranjangTertahan.querySelectorAll('.btn-hitung-aksi').forEach(function (btn) {
            btn.addEventListener('click', function () {
                var p = state.pesananOnline.filter(function (x) { return String(x.id) === btn.getAttribute('data-id'); })[0];
                if (p) hitungUlangPesanan(p, btn, muatKeranjangTertahan);
            });
        });
    }
    document.getElementById('btnBackKeranjangTertahan').addEventListener('click', function () { kembaliKeKasir(); });
    document.getElementById('btnMuatUlangKeranjangTertahan').addEventListener('click', muatKeranjangTertahan);

    /**
     * <h3>Fase 5 -- memuat balik satu keranjang tertahan ke keranjang aktif, LENGKAP dgn member +
     * metode bayar terpulihkan.</h3>
     *
     * <p>Porting 1:1 pola resume JSP {@code _pos.jsp} fungsi {@code muatKeranjangTertahan}: item
     * dimuat ke {@code state.cart} (termasuk {@code kode/diskon/cashback/aturanDiskon} -- server
     * sekarang menyertakannya, lihat JavaDoc {@code PosApi.prosesPesananList}), {@code
     * state.draftAktifId} disetel supaya "Bayar" berikutnya menuntaskan draft yg SAMA (bukan bikin
     * baris duplikat), member dipulihkan lewat {@code p.anggotaId} (exact lookup via {@link
     * cariAnggotaById}, aksi {@code cari_member} dgn parameter {@code id}), lalu metode bayar
     * dipulihkan lewat {@code p.caraBayarId} SETELAH daftar cara bayar ter-filter sesuai jenis-anggota
     * member itu (lihat {@link muatCaraBayarUntukMember}) -- SEBELUMNYA (sebelum Fase 5) member/metode
     * bayar TIDAK pernah dipulihkan sama sekali, kasir harus pilih ulang manual.</p>
     */
    async function lanjutkanKeranjangTertahan(p) {
        if (!p.items || p.items.length === 0) { toast('error', 'Keranjang tertahan ini kosong/sudah tak valid.'); return; }
        if (state.cart.length > 0 && !confirm('Keranjang aktif saat ini akan diganti dengan keranjang tertahan ini. Lanjutkan?')) return;
        state.cart = p.items.map(function (it) {
            return {
                id: it.id, kode: it.kode || '', nama: it.nama, harga: Number(it.harga) || 0, jumlah: Number(it.jumlah) || 0,
                diskon: Number(it.diskon) || 0, cashback: Number(it.cashback) || 0, aturanDiskon: it.aturanDiskon != null ? it.aturanDiskon : null
            };
        });
        state.draftAktifId = p.id;

        var member = p.anggotaId != null ? await cariAnggotaById(p.anggotaId) : null;
        if (member) {
            await pilihMember(member);
        } else {
            await resetMemberTerpilih();
        }
        if (p.caraBayarId != null) {
            var cb = state.caraBayar.filter(function (x) { return String(x.id) === String(p.caraBayarId); })[0];
            if (cb) state.metodeTerpilih = { id: String(cb.id), nama: cb.nama, manual: cb.manual !== false };
        }

        renderKeranjang();
        jadwalkanEvaluasiDiskon();
        tampilkanLayar('layarPos');
        document.querySelectorAll('.drawer-item').forEach(function (b) { b.classList.toggle('aktif', b.getAttribute('data-layar') === 'layarPos'); });
        toast('success', 'Keranjang tertahan dimuat' + (p.pemesan ? (' (' + p.pemesan + ')') : '') + ', silakan lanjutkan.');
    }

    async function hapusKeranjangTertahan(p) {
        if (!confirm('Hapus keranjang tertahan ' + (p.kode || ('#' + p.id)) + ' dari ' + (p.pemesan || 'pelanggan umum') + '?\n\nData akan dihapus permanen dan tidak bisa dikembalikan.')) return;
        try {
            var r = await AisApi.panggil('batal_pesanan', { id: p.id });
            if (r.status === 'success') { toast('success', 'Keranjang tertahan dihapus.'); muatKeranjangTertahan(); }
            else toast('error', pesanDariHasil(r, 'Gagal menghapus.'));
        } catch (e) {
            ErrorAlert.tampilkanDariException(e, 'Hapus Keranjang Tertahan ' + (p.kode || ''));
        }
    }

    // =====================================================================
    // ==== Kulakan (Harga Beli / Pengadaan Produk) -- paritas dgn Desktop kulakan.html ====
    // Alur entri SAMA PERSIS dgn layar Produk/Stok Opname Desktop: cari produk via barcode/kode
    // (aksi so_produk_scan, MURNI baca, boleh dipanggil siapa saja yg login) -> isi jumlah masuk +
    // harga beli satuan (+ faktur/supplier/keterangan opsional) -> simpan (aksi kulakan_simpan, stok
    // & harga beli produk otomatis di-recompute server -- lihat JavaDoc KantinHelper.kulakanSimpan).
    // Riwayat (aksi kulakan_list) paginated+searchable, reuse renderPaginasiLt spt Laporan Transaksi.
    // Gerbang supervisor SAMA dgn layar Produk (bolehKelolaProduk) -- kasir biasa hanya melihat
    // riwayat, form entri disembunyikan; gerbang SEBENARNYA ditegakkan server (kulakan_simpan).
    // =====================================================================
    var elPanelEntriKulakan = document.getElementById('panelEntriKulakan');
    var elBlokirKulakan = document.getElementById('blokirKulakan');
    var elInBarcodeKulakan = document.getElementById('inBarcodeKulakan');
    var elBtnCariKulakan = document.getElementById('btnCariKulakan');
    var elKartuProdukKulakan = document.getElementById('kartuProdukKulakan');
    var elKulakanNamaProduk = document.getElementById('kulakanNamaProduk');
    var elKulakanMetaProduk = document.getElementById('kulakanMetaProduk');
    var elKulakanQty = document.getElementById('kulakanQty');
    var elKulakanHargaBeli = document.getElementById('kulakanHargaBeli');
    var elKulakanNomorFaktur = document.getElementById('kulakanNomorFaktur');
    var elKulakanNamaSupplier = document.getElementById('kulakanNamaSupplier');
    var elKulakanKeterangan = document.getElementById('kulakanKeterangan');
    var elBtnSimpanKulakan = document.getElementById('btnSimpanKulakan');
    var elInCariKulakan = document.getElementById('inCariKulakan');
    var elIsiKulakan = document.getElementById('isiKulakan');

    function renderGerbangKulakan() {
        var kelola = bolehKelolaProduk();
        elPanelEntriKulakan.style.display = kelola ? 'block' : 'none';
        elBlokirKulakan.style.display = kelola ? 'none' : 'block';
    }

    var produkDitemukanKulakan = null;
    async function cariProdukKulakan() {
        var barcode = (elInBarcodeKulakan.value || '').trim();
        if (!barcode) return;
        elBtnCariKulakan.disabled = true;
        try {
            var r = await AisApi.panggil('so_produk_scan', { barcode: barcode });
            if (r.status !== 'success') {
                toast('error', pesanDariHasil(r, 'Barcode "' + barcode + '" tidak dikenal di toko ini.'));
                elKartuProdukKulakan.style.display = 'none';
                produkDitemukanKulakan = null;
                return;
            }
            produkDitemukanKulakan = r;
            elKulakanNamaProduk.textContent = r.nama;
            elKulakanMetaProduk.textContent = 'Kode: ' + r.kode + ' · Stok Sistem Saat Ini: ' + (Number(r.stokSistem) || 0);
            elKulakanQty.value = '';
            elKulakanHargaBeli.value = '';
            elKulakanNomorFaktur.value = '';
            elKulakanNamaSupplier.value = '';
            elKulakanKeterangan.value = '';
            elKartuProdukKulakan.style.display = 'flex';
            elKulakanQty.focus();
        } catch (e) {
            toast('error', 'Gagal mencari produk: ' + (e && e.message ? e.message : e));
        } finally {
            elBtnCariKulakan.disabled = false;
        }
    }
    elBtnCariKulakan.addEventListener('click', cariProdukKulakan);
    elInBarcodeKulakan.addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); cariProdukKulakan(); } });

    elBtnSimpanKulakan.addEventListener('click', async function () {
        if (!bolehKelolaProduk() || !produkDitemukanKulakan) return;
        var qtyTeks = (elKulakanQty.value || '').trim().replace(',', '.');
        var hargaTeks = (elKulakanHargaBeli.value || '').trim().replace(',', '.');
        if (qtyTeks === '' || isNaN(Number(qtyTeks)) || Number(qtyTeks) <= 0) { toast('error', 'Jumlah masuk wajib diisi dengan angka lebih dari 0.'); elKulakanQty.focus(); return; }
        if (hargaTeks === '' || isNaN(Number(hargaTeks)) || Number(hargaTeks) <= 0) { toast('error', 'Harga beli satuan wajib diisi dengan angka lebih dari 0.'); elKulakanHargaBeli.focus(); return; }
        elBtnSimpanKulakan.disabled = true;
        var oriTeks = elBtnSimpanKulakan.textContent;
        elBtnSimpanKulakan.textContent = 'Menyimpan...';
        try {
            var r = await AisApi.panggil('kulakan_simpan', {
                produk_id: produkDitemukanKulakan.produkId,
                qty: Number(qtyTeks),
                harga_beli_satuan: Number(hargaTeks),
                nomor_faktur: (elKulakanNomorFaktur.value || '').trim(),
                nama_supplier: (elKulakanNamaSupplier.value || '').trim(),
                keterangan: (elKulakanKeterangan.value || '').trim()
            });
            if (r.status !== 'success') { toast('error', pesanDariHasil(r, 'Gagal menyimpan.')); return; }
            toast('success', 'Tersimpan: ' + produkDitemukanKulakan.nama + ' (+' + Number(qtyTeks) + ').');
            elKartuProdukKulakan.style.display = 'none';
            produkDitemukanKulakan = null;
            elInBarcodeKulakan.value = '';
            elInBarcodeKulakan.focus();
            stateKulakan.page = 1;
            muatKulakan();
        } catch (e) {
            ErrorAlert.tampilkanDariException(e, 'Simpan Kulakan');
        } finally {
            elBtnSimpanKulakan.disabled = false;
            elBtnSimpanKulakan.textContent = oriTeks;
        }
    });

    var stateKulakan = { keyword: '', page: 1, pageSize: 20, total: 0 };
    var cariKulakanTimer = null;

    function formatWaktuKulakan(s) { return s || '-'; }

    async function muatKulakan() {
        elIsiKulakan.innerHTML = '<div class="layar-kosong">Memuat...</div>';
        try {
            var r = await AisApi.panggil('kulakan_list', { keyword: stateKulakan.keyword, page: stateKulakan.page, page_size: stateKulakan.pageSize });
            if (r.status !== 'success') { elIsiKulakan.innerHTML = '<div class="layar-kosong">' + escapeHtml(pesanDariHasil(r, 'Gagal memuat riwayat Kulakan.')) + '</div>'; return; }
            stateKulakan.total = r.total || 0;
            var daftar = r.data || [];
            if (daftar.length === 0) {
                elIsiKulakan.innerHTML = '<div class="layar-kosong">Belum ada catatan Kulakan.</div>';
                return;
            }
            elIsiKulakan.innerHTML = daftar.map(function (k) {
                return '<div class="baris-riwayat-item"><div class="atas"><span class="kode">' + escapeHtml(k.namaProduk) + '</span><span class="waktu">' + escapeHtml(formatWaktuKulakan(k.waktuPengadaan)) + '</span></div>'
                    + '<div style="font-size:11.5px;color:var(--muted);">' + escapeHtml(k.namaSupplier || '-') + (k.nomorFaktur ? (' · Faktur: ' + escapeHtml(k.nomorFaktur)) : '') + '</div>'
                    + '<div style="margin-top:4px;">+' + (Number(k.qty) || 0) + ' × ' + formatRupiah(k.hargaBeliSatuan) + ' = <b>' + formatRupiah(k.totalHarga) + '</b></div>'
                    + (k.keterangan ? ('<div style="font-size:11px;color:var(--muted);margin-top:2px;">' + escapeHtml(k.keterangan) + '</div>') : '')
                    + '</div>';
            }).join('');
            elIsiKulakan.appendChild(renderPaginasiLt(stateKulakan, muatKulakan));
        } catch (e) {
            elIsiKulakan.innerHTML = '<div class="layar-kosong">Gagal memuat: ' + escapeHtml(e && e.message ? e.message : e) + '</div>';
        }
    }
    elInCariKulakan.addEventListener('input', function () {
        clearTimeout(cariKulakanTimer);
        cariKulakanTimer = setTimeout(function () { stateKulakan.keyword = elInCariKulakan.value.trim(); stateKulakan.page = 1; muatKulakan(); }, 350);
    });
    document.getElementById('btnBackKulakan').addEventListener('click', function () { kembaliKeKasir(); });
    document.getElementById('btnMuatUlangKulakan').addEventListener('click', function () { renderGerbangKulakan(); muatKulakan(); });

    // =====================================================================
    // ==== Stok Opname (Hitung Fisik Stok) -- paritas dgn Desktop stokopname.html/-renderer.js,
    // gap-closure Android. Alur SAMA PERSIS dgn Kulakan di atas: cari produk via barcode/kode (aksi
    // so_produk_scan, MURNI baca, boleh dipanggil siapa saja yg login) -> isi stok fisik hasil hitung
    // (+keterangan opsional) -> simpan (aksi so_simpan, gated supervisor/admin -- lihat JavaDoc
    // KantinHelper.soSimpan; stok produk otomatis di-recompute server begitu tersimpan). TIDAK
    // memakai aksi so_sesi_* (mulai/selesai/list) -- Desktop JUGA tidak memakainya (sesi hanyalah
    // "kepala kegiatan" dekoratif utk laporan, baris hasil opname sesungguhnya tetap tersimpan tanpa
    // sesi apa pun). Riwayat HANYA lokal di layar (tak ada aksi "so_list") -- reset saat layar dimuat
    // ulang/app ditutup, sama seperti riwayatLokal Desktop. Ringkasan KPI (so_ringkasan) dimuat ulang
    // tiap simpan supaya angka "Total Lebih/Kurang/Selisih Bersih" selalu terkini.
    // =====================================================================
    var elRingkasSo = document.getElementById('ringkasSo');
    var elPanelEntriSo = document.getElementById('panelEntriSo');
    var elBlokirSo = document.getElementById('blokirSo');
    var elInBarcodeSo = document.getElementById('inBarcodeSo');
    var elBtnCariSo = document.getElementById('btnCariSo');
    var elKartuProdukSo = document.getElementById('kartuProdukSo');
    var elSoNamaProduk = document.getElementById('soNamaProduk');
    var elSoMetaProduk = document.getElementById('soMetaProduk');
    var elSoStokFisik = document.getElementById('soStokFisik');
    var elSoKeterangan = document.getElementById('soKeterangan');
    var elBtnSimpanSo = document.getElementById('btnSimpanSo');
    var elIsiRiwayatSo = document.getElementById('isiRiwayatSo');

    function renderGerbangSo() {
        var kelola = bolehKelolaProduk();
        elPanelEntriSo.style.display = kelola ? 'block' : 'none';
        elBlokirSo.style.display = kelola ? 'none' : 'block';
    }

    async function muatRingkasanSo() {
        elRingkasSo.innerHTML = '<div class="layar-kosong">Memuat...</div>';
        try {
            var r = await AisApi.panggil('so_ringkasan', {});
            if (r.status !== 'success') { elRingkasSo.innerHTML = ''; return; }
            elRingkasSo.innerHTML =
                '<div class="kartu-ringkas"><div class="label">Produk Diopname</div><div class="nilai">' + (r.jumlahProduk || 0) + '</div></div>'
                + '<div class="kartu-ringkas"><div class="label">Total Catatan</div><div class="nilai">' + (r.jumlahCatatan || 0) + '</div></div>'
                + '<div class="kartu-ringkas"><div class="label" style="color:var(--success);">Total Lebih</div><div class="nilai" style="color:var(--success);">+' + (Number(r.totalLebih) || 0) + '</div></div>'
                + '<div class="kartu-ringkas"><div class="label" style="color:var(--danger);">Total Kurang</div><div class="nilai" style="color:var(--danger);">-' + Math.abs(Number(r.totalKurang) || 0) + '</div></div>'
                + '<div class="kartu-ringkas" style="grid-column:1/-1;"><div class="label">Selisih Bersih</div><div class="nilai">' + (Number(r.selisihBersih) || 0) + '</div></div>';
        } catch (e) {
            elRingkasSo.innerHTML = '<div class="layar-kosong">Gagal memuat ringkasan: ' + escapeHtml(e && e.message ? e.message : e) + '</div>';
        }
    }

    var produkDitemukanSo = null;
    async function cariProdukSo() {
        var barcode = (elInBarcodeSo.value || '').trim();
        if (!barcode) return;
        elBtnCariSo.disabled = true;
        try {
            var r = await AisApi.panggil('so_produk_scan', { barcode: barcode });
            if (r.status !== 'success') {
                toast('error', pesanDariHasil(r, 'Barcode "' + barcode + '" tidak dikenal di toko ini.'));
                elKartuProdukSo.style.display = 'none';
                produkDitemukanSo = null;
                return;
            }
            produkDitemukanSo = r;
            elSoNamaProduk.textContent = r.nama;
            elSoMetaProduk.textContent = 'Kode: ' + r.kode + ' · Stok Sistem Saat Ini: ' + (Number(r.stokSistem) || 0)
                + (r.stokMinimum != null ? (' · Stok Minimum: ' + Number(r.stokMinimum)) : '');
            elSoStokFisik.value = '';
            elSoKeterangan.value = '';
            elKartuProdukSo.style.display = 'flex';
            elSoStokFisik.focus();
        } catch (e) {
            toast('error', 'Gagal mencari produk: ' + (e && e.message ? e.message : e));
        } finally {
            elBtnCariSo.disabled = false;
        }
    }
    elBtnCariSo.addEventListener('click', cariProdukSo);
    elInBarcodeSo.addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); cariProdukSo(); } });

    // Riwayat catatan opname HARI INI (gap-closure: dibaca dari SERVER via aksi so_riwayat, bukan lagi
    // memori sesi layar ini -- SEBELUMNYA daftar ini kosong lagi begitu layar dimuat ulang walau kartu
    // ringkasan di atas, dari so_ringkasan, tetap menunjukkan angka yg benar. Lihat JavaDoc server
    // KantinHelper.soRiwayat -- SAMA PERSIS pola yg dipakai Desktop stokopname-renderer.js.)
    function renderRiwayatSo(daftar) {
        if (!daftar || !daftar.length) { elIsiRiwayatSo.innerHTML = '<div class="layar-kosong">Belum ada catatan Stok Opname hari ini.</div>'; return; }
        elIsiRiwayatSo.innerHTML = daftar.map(function (h) {
            var warna = h.selisih > 0 ? 'var(--success)' : (h.selisih < 0 ? 'var(--danger)' : 'var(--muted)');
            var tandaSelisih = (h.selisih > 0 ? '+' : '') + h.selisih;
            return '<div class="baris-riwayat-item"><div class="atas"><span class="kode">' + escapeHtml(h.nama) + '</span><span class="waktu">' + escapeHtml(h.waktu) + '</span></div>'
                + '<div style="font-size:11.5px;color:var(--muted);">Kode: ' + escapeHtml(h.kode) + '</div>'
                + '<div style="margin-top:4px;">Stok Sistem: ' + h.stokSistem + ' &rarr; Stok Fisik: ' + h.stokFisik + ' &middot; Selisih: <b style="color:' + warna + ';">' + tandaSelisih + '</b></div>'
                + (h.keterangan ? ('<div style="font-size:11px;color:var(--muted);margin-top:2px;">' + escapeHtml(h.keterangan) + '</div>') : '')
                + '</div>';
        }).join('');
    }

    async function muatRiwayatSo() {
        try {
            var r = await AisApi.panggil('so_riwayat', {});
            renderRiwayatSo(r.status === 'success' ? (r.data || []) : []);
        } catch (e) {
            renderRiwayatSo([]);
        }
    }

    elBtnSimpanSo.addEventListener('click', async function () {
        if (!bolehKelolaProduk() || !produkDitemukanSo) return;
        var stokTeks = (elSoStokFisik.value || '').trim().replace(',', '.');
        if (stokTeks === '' || isNaN(Number(stokTeks)) || Number(stokTeks) < 0) { toast('error', 'Stok fisik wajib diisi dengan angka 0 atau lebih.'); elSoStokFisik.focus(); return; }
        elBtnSimpanSo.disabled = true;
        var oriTeksSo = elBtnSimpanSo.textContent;
        elBtnSimpanSo.textContent = 'Menyimpan...';
        try {
            var stokFisik = Number(stokTeks);
            var r = await AisApi.panggil('so_simpan', {
                produk_id: produkDitemukanSo.produkId,
                stok_fisik: stokFisik,
                keterangan: (elSoKeterangan.value || '').trim()
            });
            if (r.status !== 'success') { toast('error', pesanDariHasil(r, 'Gagal menyimpan.')); return; }
            toast('success', 'Tersimpan: ' + produkDitemukanSo.nama + ' (stok fisik ' + stokFisik + ').');
            elKartuProdukSo.style.display = 'none';
            produkDitemukanSo = null;
            elInBarcodeSo.value = '';
            elInBarcodeSo.focus();
            muatRingkasanSo();
            muatRiwayatSo();
        } catch (e) {
            ErrorAlert.tampilkanDariException(e, 'Simpan Stok Opname');
        } finally {
            elBtnSimpanSo.disabled = false;
            elBtnSimpanSo.textContent = oriTeksSo;
        }
    });

    // =====================================================================
    // ==== Sub-tab Stok Opname (gap-closure -- padanan JSP stok.jsp: Kartu Mutasi Stok/Stok Opname/
    // SO by Scan), paritas dgn Desktop stokopname.html/-renderer.js versi terbaru. ====
    // =====================================================================
    var subtabSoAktif = 'dashboardSo';
    var dashboardSoPernahDimuat = false;
    function pindahSubtabSo(nama) {
        subtabSoAktif = nama;
        document.querySelectorAll('#layarStokOpname .subtab-row .subtab-btn').forEach(function (b) {
            if (b.parentElement.id === 'pilihPeriodeSo') return; // baris pill periode beda konteks, jangan disamakan
            b.classList.toggle('aktif', b.getAttribute('data-subtab') === nama);
        });
        document.querySelectorAll('#layarStokOpname .subtab-panel').forEach(function (p) {
            p.classList.toggle('aktif', p.id === 'subtab' + nama.charAt(0).toUpperCase() + nama.slice(1));
        });
        if (nama === 'dashboardSo' && !dashboardSoPernahDimuat) { dashboardSoPernahDimuat = true; muatDashboardSo(); }
        if (nama !== 'scanSo') hentikanKameraScanSo();
    }
    document.querySelectorAll('#layarStokOpname .subtab-row').forEach(function (row) {
        if (row.id === 'pilihPeriodeSo') return;
        row.querySelectorAll('.subtab-btn').forEach(function (b) {
            b.addEventListener('click', function () { pindahSubtabSo(b.getAttribute('data-subtab')); });
        });
    });

    // ---- Sub-tab "Kartu Mutasi Stok" -- dashboard KPI + 2 chart HTML/CSS ----
    var elKpiBarangMasukSo = document.getElementById('kpiBarangMasukSo');
    var elKpiBarangKeluarSo = document.getElementById('kpiBarangKeluarSo');
    var elKpiTotalStokSo = document.getElementById('kpiTotalStokSo');
    var elKpiStokKritisSo = document.getElementById('kpiStokKritisSo');
    var elChartTrenMutasiSo = document.getElementById('chartTrenMutasiSo');
    var elChartTop5KeluarSo = document.getElementById('chartTop5KeluarSo');
    var periodeSoAktif = 'today';

    function formatAngkaSo(n) { return Math.round((Number(n) || 0) * 100) / 100; }

    function buatBarVertikalGandaSo(container, data) {
        container.innerHTML = '';
        if (!data || data.length === 0) { container.innerHTML = '<div class="layar-kosong">Belum ada data.</div>'; return; }
        var maks = Math.max.apply(null, data.map(function (d) { return Math.max(d.masuk, d.keluar); })) || 1;
        var wrap = document.createElement('div');
        wrap.className = 'chart-v-wrap';
        data.forEach(function (d) {
            var kolom = document.createElement('div');
            kolom.className = 'chart-v-kolom';
            var ganda = document.createElement('div');
            ganda.className = 'batang-ganda';
            var bMasuk = document.createElement('div');
            bMasuk.className = 'batang masuk';
            bMasuk.style.height = Math.max(1, Math.round((d.masuk / maks) * 100)) + '%';
            var bKeluar = document.createElement('div');
            bKeluar.className = 'batang keluar';
            bKeluar.style.height = Math.max(1, Math.round((d.keluar / maks) * 100)) + '%';
            ganda.appendChild(bMasuk);
            ganda.appendChild(bKeluar);
            var label = document.createElement('div');
            label.className = 'label';
            label.textContent = d.label;
            kolom.appendChild(ganda);
            kolom.appendChild(label);
            wrap.appendChild(kolom);
        });
        container.appendChild(wrap);
    }

    function buatBarHorizontalSo(container, data) {
        container.innerHTML = '';
        if (!data || data.length === 0) { container.innerHTML = '<div class="layar-kosong">Belum ada data.</div>'; return; }
        var maks = Math.max.apply(null, data.map(function (d) { return d.nilai; })) || 1;
        data.forEach(function (d, i) {
            var baris = document.createElement('div');
            baris.className = 'baris-bar';
            baris.innerHTML = '<div class="peringkat"></div><div class="nama"></div><div class="batang-wrap"><div class="batang"></div></div><div class="nilai"></div>';
            baris.querySelector('.peringkat').textContent = String(i + 1);
            baris.querySelector('.nama').textContent = d.label;
            baris.querySelector('.batang').style.width = Math.max(4, Math.round((d.nilai / maks) * 100)) + '%';
            baris.querySelector('.nilai').textContent = formatAngkaSo(d.nilai);
            container.appendChild(baris);
        });
    }

    function labelTanggalRingkasSo(tgl) {
        var bln = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Ags', 'Sep', 'Okt', 'Nov', 'Des'];
        if (/^\d{4}-\d{2}-\d{2}$/.test(tgl)) { var p1 = tgl.split('-'); return parseInt(p1[2], 10) + ' ' + bln[parseInt(p1[1], 10) - 1]; }
        if (/^\d{4}-\d{2}$/.test(tgl)) { var p2 = tgl.split('-'); return bln[parseInt(p2[1], 10) - 1] + ' ' + p2[0].slice(2); }
        return tgl;
    }

    async function muatDashboardSo() {
        elChartTrenMutasiSo.innerHTML = '<div class="layar-kosong">Memuat...</div>';
        elChartTop5KeluarSo.innerHTML = '<div class="layar-kosong">Memuat...</div>';
        try {
            var r = await AisApi.panggil('stok_dashboard', { periode: periodeSoAktif });
            if (r.status !== 'success') {
                toast('error', pesanDariHasil(r, 'Gagal memuat dashboard.'));
                elChartTrenMutasiSo.innerHTML = '<div class="layar-kosong">Gagal memuat.</div>';
                elChartTop5KeluarSo.innerHTML = '';
                return;
            }
            elKpiBarangMasukSo.textContent = formatAngkaSo(r.barangMasuk);
            elKpiBarangKeluarSo.textContent = formatAngkaSo(r.barangKeluar);
            elKpiTotalStokSo.textContent = formatAngkaSo(r.totalStok);
            elKpiStokKritisSo.textContent = formatAngkaSo(r.stokKritis);
            buatBarVertikalGandaSo(elChartTrenMutasiSo, (r.trend || []).map(function (t) { return { label: labelTanggalRingkasSo(t.tanggal), masuk: t.masuk, keluar: t.keluar }; }));
            buatBarHorizontalSo(elChartTop5KeluarSo, (r.top5Keluar || []).map(function (t) { return { label: t.nama, nilai: t.qty }; }));
        } catch (e) {
            elChartTrenMutasiSo.innerHTML = '<div class="layar-kosong">Gagal memuat: ' + escapeHtml(e && e.message ? e.message : e) + '</div>';
            elChartTop5KeluarSo.innerHTML = '';
        }
    }
    document.querySelectorAll('#pilihPeriodeSo .subtab-btn').forEach(function (b) {
        b.addEventListener('click', function () {
            document.querySelectorAll('#pilihPeriodeSo .subtab-btn').forEach(function (x) { x.classList.remove('aktif'); });
            b.classList.add('aktif');
            periodeSoAktif = b.getAttribute('data-periode');
            muatDashboardSo();
        });
    });

    // ---- Sub-tab "SO by Scan (HP/PDT)" -- antrean scan batch, gap-closure ----
    var elPanelScanSo = document.getElementById('panelScanSo');
    var elBlokirScanSo = document.getElementById('blokirScanSo');
    var elInBarcodeScanSo = document.getElementById('inBarcodeScanSo');
    var elBtnKameraScanSo = document.getElementById('btnKameraScanSo');
    var elReaderKameraScanSo = document.getElementById('readerKameraScanSo');
    var elStatItemScanSo = document.getElementById('statItemScanSo');
    var elStatLebihScanSo = document.getElementById('statLebihScanSo');
    var elStatKurangScanSo = document.getElementById('statKurangScanSo');
    var elStatSelisihScanSo = document.getElementById('statSelisihScanSo');
    var elProporsiScanSo = document.getElementById('proporsiScanSo');
    var elIsiAntreanScanSo = document.getElementById('isiAntreanScanSo');
    var elKetAntreanScanSo = document.getElementById('ketAntreanScanSo');
    var elBtnKosongkanAntreanScanSo = document.getElementById('btnKosongkanAntreanScanSo');
    var elBtnSimpanSemuaScanSo = document.getElementById('btnSimpanSemuaScanSo');

    var antreanScanSo = [];
    var kunciPencarianScanSo = false;

    function beepSo(sukses) {
        try {
            var Ctx = window.AudioContext || window.webkitAudioContext;
            if (!Ctx) return;
            var ctx = new Ctx();
            var osc = ctx.createOscillator();
            var gain = ctx.createGain();
            osc.connect(gain);
            gain.connect(ctx.destination);
            osc.frequency.value = sukses ? 880 : 220;
            gain.gain.setValueAtTime(0.15, ctx.currentTime);
            osc.start();
            osc.stop(ctx.currentTime + 0.12);
            osc.onended = function () { try { ctx.close(); } catch (e) { /* abaikan */ } };
        } catch (e) { /* abaikan -- audio bukan jalur kritis */ }
    }

    function hitungStatistikAntreanSo() {
        var lebih = 0, kurang = 0;
        antreanScanSo.forEach(function (it) {
            var selisih = it.stokFisik - it.stokSistem;
            if (selisih > 0) lebih += selisih; else if (selisih < 0) kurang += selisih;
        });
        return { item: antreanScanSo.length, lebih: lebih, kurang: kurang, bersih: lebih + kurang };
    }

    function renderAntreanScanSo() {
        if (antreanScanSo.length === 0) {
            elIsiAntreanScanSo.innerHTML = '<div class="layar-kosong">Belum ada item discan.</div>';
        } else {
            elIsiAntreanScanSo.innerHTML = antreanScanSo.map(function (it, i) {
                var selisih = it.stokFisik - it.stokSistem;
                var warna = selisih > 0 ? 'var(--success)' : (selisih < 0 ? 'var(--danger)' : 'var(--muted)');
                var tanda = (selisih > 0 ? '+' : '') + formatAngkaSo(selisih);
                return '<div class="kartu-antrean-scan" data-idx="' + i + '">'
                    + '<div class="atas"><div><div class="nama">' + escapeHtml(it.nama) + '</div><div class="kode">' + escapeHtml(it.kode) + ' &middot; Sistem: ' + formatAngkaSo(it.stokSistem) + '</div></div>'
                    + '<button type="button" class="btn-hapus-baris" data-idx="' + i + '">&#128465;&#65039;</button></div>'
                    + '<div class="bawah"><div class="stepper">'
                    + '<button type="button" class="btn-kurang-scan-so" data-idx="' + i + '">&#8722;</button>'
                    + '<input type="text" inputmode="decimal" class="in-fisik-scan-so" data-idx="' + i + '" value="' + it.stokFisik + '">'
                    + '<button type="button" class="btn-tambah-scan-so" data-idx="' + i + '">&#43;</button></div>'
                    + '<span style="font-weight:800;color:' + warna + ';">' + tanda + '</span></div></div>';
            }).join('');
            elIsiAntreanScanSo.querySelectorAll('.btn-tambah-scan-so').forEach(function (b) { b.addEventListener('click', function () { ubahStokFisikAntreanSo(parseInt(b.getAttribute('data-idx'), 10), 1); }); });
            elIsiAntreanScanSo.querySelectorAll('.btn-kurang-scan-so').forEach(function (b) { b.addEventListener('click', function () { ubahStokFisikAntreanSo(parseInt(b.getAttribute('data-idx'), 10), -1); }); });
            elIsiAntreanScanSo.querySelectorAll('.in-fisik-scan-so').forEach(function (inp) {
                inp.addEventListener('change', function () {
                    var idx = parseInt(inp.getAttribute('data-idx'), 10);
                    var v = Number(inp.value.trim().replace(',', '.'));
                    if (!isNaN(v)) { antreanScanSo[idx].stokFisik = v; renderAntreanScanSo(); }
                });
            });
            elIsiAntreanScanSo.querySelectorAll('.btn-hapus-baris').forEach(function (b) {
                b.addEventListener('click', function () { antreanScanSo.splice(parseInt(b.getAttribute('data-idx'), 10), 1); renderAntreanScanSo(); });
            });
        }
        var stat = hitungStatistikAntreanSo();
        elStatItemScanSo.textContent = stat.item;
        elStatLebihScanSo.textContent = '+' + formatAngkaSo(stat.lebih);
        elStatKurangScanSo.textContent = formatAngkaSo(stat.kurang);
        elStatSelisihScanSo.textContent = (stat.bersih > 0 ? '+' : '') + formatAngkaSo(stat.bersih);
        var totalAbs = Math.abs(stat.lebih) + Math.abs(stat.kurang);
        if (totalAbs <= 0) {
            elProporsiScanSo.innerHTML = '';
        } else {
            var pctLebih = Math.round((Math.abs(stat.lebih) / totalAbs) * 100);
            elProporsiScanSo.innerHTML = '<div class="seg-lebih" style="width:' + pctLebih + '%;"></div><div class="seg-kurang" style="width:' + (100 - pctLebih) + '%;"></div>';
        }
        elBtnSimpanSemuaScanSo.disabled = antreanScanSo.length === 0;
        elBtnSimpanSemuaScanSo.textContent = 'Simpan Semua (' + antreanScanSo.length + ')';
    }

    function ubahStokFisikAntreanSo(idx, delta) { antreanScanSo[idx].stokFisik += delta; renderAntreanScanSo(); }

    async function prosesKodeDiscanSo(kode) {
        if (!kode || kunciPencarianScanSo) return;
        kunciPencarianScanSo = true;
        try {
            var existing = antreanScanSo.filter(function (it) { return it.kode.toLowerCase() === kode.toLowerCase(); })[0];
            if (existing) {
                existing.stokFisik += 1;
                renderAntreanScanSo();
                beepSo(true);
                toast('success', existing.nama + ': +1 (total ' + formatAngkaSo(existing.stokFisik) + ')');
                return;
            }
            var r = await AisApi.panggil('so_produk_scan', { barcode: kode });
            if (r.status !== 'success') {
                beepSo(false);
                toast('error', pesanDariHasil(r, 'Barcode "' + kode + '" tidak dikenal.'));
                return;
            }
            antreanScanSo.push({ produkId: r.produkId, kode: r.kode, nama: r.nama, stokSistem: Number(r.stokSistem) || 0, stokFisik: 1 });
            renderAntreanScanSo();
            beepSo(true);
            toast('success', r.nama + ' ditambahkan ke antrean.');
        } catch (e) {
            beepSo(false);
            toast('error', 'Gagal mencari produk: ' + (e && e.message ? e.message : e));
        } finally {
            kunciPencarianScanSo = false;
        }
    }

    elInBarcodeScanSo.addEventListener('keydown', function (e) {
        if (e.key === 'Enter') {
            e.preventDefault();
            var kode = elInBarcodeScanSo.value.trim();
            elInBarcodeScanSo.value = '';
            prosesKodeDiscanSo(kode);
        }
    });

    elBtnKosongkanAntreanScanSo.addEventListener('click', function () {
        if (antreanScanSo.length === 0) return;
        if (!confirm('Kosongkan seluruh antrean (' + antreanScanSo.length + ' item)? Belum ada yang tersimpan ke server.')) return;
        antreanScanSo = [];
        renderAntreanScanSo();
    });

    elBtnSimpanSemuaScanSo.addEventListener('click', async function () {
        if (antreanScanSo.length === 0 || !bolehKelolaProduk()) return;
        var keterangan = elKetAntreanScanSo.value.trim();
        var semulaTeks = elBtnSimpanSemuaScanSo.textContent;
        elBtnSimpanSemuaScanSo.disabled = true;
        var sukses = 0, gagal = 0;
        for (var i = 0; i < antreanScanSo.length; i++) {
            var it = antreanScanSo[i];
            elBtnSimpanSemuaScanSo.textContent = 'Menyimpan ' + (i + 1) + '/' + antreanScanSo.length + '...';
            try {
                var r = await AisApi.panggil('so_simpan', { produk_id: it.produkId, stok_fisik: it.stokFisik, keterangan: keterangan });
                if (r.status === 'success') sukses++; else gagal++;
            } catch (e) { gagal++; }
        }
        toast(gagal > 0 ? 'error' : 'success', 'Selesai: ' + sukses + ' tersimpan' + (gagal > 0 ? ', ' + gagal + ' gagal' : '') + '.');
        if (sukses > 0) {
            antreanScanSo = gagal > 0 ? antreanScanSo.slice(sukses) : [];
            elKetAntreanScanSo.value = '';
            muatRingkasanSo();
            muatRiwayatSo();
        }
        renderAntreanScanSo();
        elBtnSimpanSemuaScanSo.disabled = antreanScanSo.length === 0;
        if (antreanScanSo.length > 0) elBtnSimpanSemuaScanSo.textContent = semulaTeks;
    });

    var instansiKameraScanSo = null;
    var kameraScanSoAktif = false;
    var kunciKameraScanSo = false;

    async function mulaiKameraScanSo() {
        if (typeof Html5Qrcode === 'undefined') { toast('error', 'Modul kamera tidak tersedia.'); return; }
        elReaderKameraScanSo.style.display = 'block';
        instansiKameraScanSo = new Html5Qrcode('readerKameraScanSo');
        try {
            await instansiKameraScanSo.start(
                { facingMode: 'environment' },
                { fps: 10, qrbox: 200 },
                function (kodeTerdeteksi) {
                    if (kunciKameraScanSo) return;
                    kunciKameraScanSo = true;
                    prosesKodeDiscanSo(kodeTerdeteksi).finally(function () { setTimeout(function () { kunciKameraScanSo = false; }, 1200); });
                },
                function () { /* per-frame tak terdeteksi -- abaikan, normal & sering terjadi */ }
            );
            kameraScanSoAktif = true;
            elBtnKameraScanSo.classList.add('aktif');
            elBtnKameraScanSo.innerHTML = '&#10005; Tutup Kamera';
        } catch (e) {
            elReaderKameraScanSo.style.display = 'none';
            toast('error', 'Tidak bisa mengakses kamera: ' + (e && e.message ? e.message : e));
        }
    }

    function hentikanKameraScanSo() {
        if (!kameraScanSoAktif || !instansiKameraScanSo) return;
        kameraScanSoAktif = false;
        elBtnKameraScanSo.classList.remove('aktif');
        elBtnKameraScanSo.innerHTML = '&#128247; Kamera';
        instansiKameraScanSo.stop().then(function () { return instansiKameraScanSo.clear(); }).catch(function () { /* abaikan -- sudah berhenti/hancur */ }).finally(function () {
            elReaderKameraScanSo.style.display = 'none';
            instansiKameraScanSo = null;
        });
    }
    elBtnKameraScanSo.addEventListener('click', function () { kameraScanSoAktif ? hentikanKameraScanSo() : mulaiKameraScanSo(); });

    function renderGerbangScanSo() {
        var kelola = bolehKelolaProduk();
        elPanelScanSo.style.display = kelola ? 'block' : 'none';
        elBlokirScanSo.style.display = kelola ? 'none' : 'block';
    }

    renderAntreanScanSo();

    function muatStokOpname() {
        renderGerbangSo();
        renderGerbangScanSo();
        muatRingkasanSo();
        muatRiwayatSo();
        // Gap-closure: sub-tab "Kartu Mutasi Stok" SUDAH aktif secara default di markup (bukan hasil
        // ketuk), jadi pindahSubtabSo tidak pernah terpanggil saat layar ini pertama dibuka dari menu --
        // tanpa baris ini dashboard-nya kosong sampai pengguna ketuk ulang sub-tab-nya sendiri.
        if (subtabSoAktif === 'dashboardSo') { dashboardSoPernahDimuat = true; muatDashboardSo(); }
    }
    document.getElementById('btnBackStokOpname').addEventListener('click', function () { kembaliKeKasir(); });
    document.getElementById('btnMuatUlangStokOpname').addEventListener('click', function () {
        muatStokOpname();
        if (subtabSoAktif === 'dashboardSo') muatDashboardSo();
    });

    // =====================================================================
    // ==== Aturan Diskon (lihat/kelola aturan promo) -- paritas dgn Desktop diskon.html/-renderer.js,
    // gap-closure Android. Server: diskon_list (baca, terbuka utk siapa saja login), diskon_simpan
    // (upsert -- gated supervisor/admin, lihat JavaDoc KantinHelper.diskonSimpan). TIDAK ADA aksi
    // hapus terpisah -- nonaktifkan aturan dgn kirim ulang diskon_simpan {id, aktif:false}.
    // jenis_anggota_list SUDAH dimuat layar Anggota (daftarJenisAnggota, dipakai ulang di sini);
    // tipe_anggota_list dimuat khusus di sini (belum dipakai layar lain).
    // =====================================================================
    var elIsiDiskon = document.getElementById('isiDiskon');
    var elInCariDiskon = document.getElementById('inCariDiskon');
    var elBtnTambahDiskon = document.getElementById('btnTambahDiskon');
    var elOverlayFormDiskon = document.getElementById('overlayFormDiskon');
    var elJudulFormDiskon = document.getElementById('judulFormDiskon');
    var elFdNamaAturan = document.getElementById('fdNamaAturan');
    var elFdKeterangan = document.getElementById('fdKeterangan');
    var elFdSemuaProduk = document.getElementById('fdSemuaProduk');
    var elWrapDiskonKodeProduk = document.getElementById('wrapDiskonKodeProduk');
    var elFdKodeProduk = document.getElementById('fdKodeProduk');
    var elWrapDiskonSemuaToko = document.getElementById('wrapDiskonSemuaToko');
    var elFdSemuaToko = document.getElementById('fdSemuaToko');
    var elWrapDiskonTokoId = document.getElementById('wrapDiskonTokoId');
    var elFdTokoId = document.getElementById('fdTokoId');
    var elFdSemuaMember = document.getElementById('fdSemuaMember');
    var elWrapDiskonMember = document.getElementById('wrapDiskonMember');
    var elFdJenisAnggota = document.getElementById('fdJenisAnggota');
    var elFdTipeAnggota = document.getElementById('fdTipeAnggota');
    var elFdTanggalMulai = document.getElementById('fdTanggalMulai');
    var elFdTanggalSelesai = document.getElementById('fdTanggalSelesai');
    var elFdPersentase = document.getElementById('fdPersentase');
    var elFdMaksimalPotongan = document.getElementById('fdMaksimalPotongan');
    var elFdNominal = document.getElementById('fdNominal');
    var elFdPotongLangsung = document.getElementById('fdPotongLangsung');
    var elFdSimpanSaldo = document.getElementById('fdSimpanSaldo');
    var elFdSekaliPerHari = document.getElementById('fdSekaliPerHari');
    var elFdAktif = document.getElementById('fdAktif');
    var elBtnSimpanDiskon = document.getElementById('btnSimpanDiskon');

    var stateDiskon = { keyword: '', page: 1, pageSize: 20, total: 0 };
    var cariDiskonTimer = null;
    var idDiskonDiubah = null;
    var daftarTipeAnggota = [];

    function fmtTglDiskon(s) { return s || '-'; }

    function renderDaftarDiskon(daftar) {
        if (!daftar.length) { elIsiDiskon.innerHTML = '<div class="layar-kosong">Belum ada aturan diskon.</div>'; return; }
        elIsiDiskon.innerHTML = '';
        daftar.forEach(function (d) {
            var nilai = (Number(d.persentase) || 0) > 0
                ? (Number(d.persentase) + '%' + ((Number(d.maksimalPotongan) || 0) > 0 ? (' (maks ' + formatRupiah(d.maksimalPotongan) + ')') : ''))
                : formatRupiah(d.nominal);
            var badgeProduk = d.produkNama ? escapeHtml(d.produkNama) : '<span class="lencana-status synced">Semua Produk</span>';
            var badgeToko = d.tokoNama ? escapeHtml(d.tokoNama) : '<span class="lencana-status synced">Semua Toko</span>';
            var badgeStatus = d.aktif ? '<span class="lencana-status synced">Aktif</span>' : '<span class="lencana-status pending">Non-Aktif</span>';
            var el = document.createElement('div');
            el.className = 'baris-produk-item';
            el.innerHTML = '<div class="info"><div class="nama">' + escapeHtml(d.namaAturan) + '</div>'
                + '<div class="meta">' + badgeProduk + ' &middot; ' + badgeToko + '</div>'
                + '<div class="meta">' + badgeStatus + ' &middot; <b>' + nilai + '</b></div>'
                + (d.tanggalMulai || d.tanggalSelesai ? ('<div class="meta">' + fmtTglDiskon(d.tanggalMulai) + ' s/d ' + fmtTglDiskon(d.tanggalSelesai) + '</div>') : '')
                + '</div>';
            if (bolehKelolaProduk()) {
                var btn = document.createElement('button');
                btn.type = 'button'; btn.className = 'btn-kecil-outline'; btn.textContent = 'Ubah';
                btn.addEventListener('click', function () { bukaFormUbahDiskon(d); });
                el.appendChild(btn);
            }
            elIsiDiskon.appendChild(el);
        });
        elIsiDiskon.appendChild(renderPaginasiLt(stateDiskon, muatAturanDiskon));
    }

    var tipeAnggotaDimuatDiskon = false;
    async function muatAturanDiskon() {
        elBtnTambahDiskon.style.display = bolehKelolaProduk() ? 'flex' : 'none';
        if (!tipeAnggotaDimuatDiskon) {
            // muatJenisAnggota() sebelumnya TIDAK PERNAH dipanggil di mana pun (dropdown Jenis di form
            // Anggota selalu kosong) -- dipanggil di sini krn form diskon di bawah juga butuh
            // daftarJenisAnggota; sekaligus memperbaiki dropdown form Anggota tanpa risiko tambahan.
            tipeAnggotaDimuatDiskon = true;
            muatTipeAnggota();
            muatJenisAnggota();
        }
        elIsiDiskon.innerHTML = '<div class="layar-kosong">Memuat...</div>';
        try {
            var r = await AisApi.panggil('diskon_list', { keyword: stateDiskon.keyword, page: stateDiskon.page, page_size: stateDiskon.pageSize });
            if (r.status !== 'success') { elIsiDiskon.innerHTML = '<div class="layar-kosong">' + escapeHtml(pesanDariHasil(r, 'Gagal memuat aturan diskon.')) + '</div>'; return; }
            stateDiskon.total = r.total || 0;
            renderDaftarDiskon(r.data || []);
        } catch (e) {
            elIsiDiskon.innerHTML = '<div class="layar-kosong">Gagal memuat: ' + escapeHtml(e && e.message ? e.message : e) + '</div>';
        }
    }
    elInCariDiskon.addEventListener('input', function () {
        clearTimeout(cariDiskonTimer);
        cariDiskonTimer = setTimeout(function () { stateDiskon.keyword = elInCariDiskon.value.trim(); stateDiskon.page = 1; muatAturanDiskon(); }, 350);
    });

    async function muatTipeAnggota() {
        try {
            var r = await AisApi.panggil('tipe_anggota_list', {});
            daftarTipeAnggota = (r.status === 'success' && r.data) || [];
        } catch (e) { daftarTipeAnggota = []; }
        elFdTipeAnggota.innerHTML = '<option value="">-- Semua --</option>';
        daftarTipeAnggota.forEach(function (t) {
            var opt = document.createElement('option');
            opt.value = t.id; opt.textContent = t.nama;
            elFdTipeAnggota.appendChild(opt);
        });
    }

    function isiDropdownJenisAnggotaDiskon() {
        elFdJenisAnggota.innerHTML = '<option value="">-- Semua --</option>';
        daftarJenisAnggota.forEach(function (j) {
            var opt = document.createElement('option');
            opt.value = j.id; opt.textContent = j.nama;
            elFdJenisAnggota.appendChild(opt);
        });
    }

    elFdSemuaProduk.addEventListener('change', function () { elWrapDiskonKodeProduk.style.display = elFdSemuaProduk.checked ? 'none' : 'block'; });
    elFdSemuaToko.addEventListener('change', function () { elWrapDiskonTokoId.style.display = elFdSemuaToko.checked ? 'none' : 'block'; });
    elFdSemuaMember.addEventListener('change', function () { elWrapDiskonMember.style.display = elFdSemuaMember.checked ? 'none' : 'block'; });

    function resetFormDiskon() {
        elFdNamaAturan.value = ''; elFdKeterangan.value = ''; elFdKodeProduk.value = ''; elFdTokoId.value = '';
        elFdTanggalMulai.value = ''; elFdTanggalSelesai.value = '';
        elFdPersentase.value = '0'; elFdMaksimalPotongan.value = '0'; elFdNominal.value = '0';
        elFdPotongLangsung.checked = true; elFdSekaliPerHari.checked = false; elFdAktif.checked = true;
        elFdSemuaProduk.checked = true; elWrapDiskonKodeProduk.style.display = 'none';
        elFdSemuaToko.checked = true; elWrapDiskonTokoId.style.display = 'none';
        elFdSemuaMember.checked = true; elWrapDiskonMember.style.display = 'none';
        elFdJenisAnggota.value = ''; elFdTipeAnggota.value = '';
    }

    function bukaFormTambahDiskon() {
        idDiskonDiubah = null;
        elJudulFormDiskon.textContent = 'Tambah Aturan Diskon';
        resetFormDiskon();
        isiDropdownJenisAnggotaDiskon();
        elWrapDiskonSemuaToko.style.display = state.isAdminAkun ? 'flex' : 'none';
        elOverlayFormDiskon.classList.add('tampil');
        elFdNamaAturan.focus();
    }

    function bukaFormUbahDiskon(d) {
        idDiskonDiubah = d.id;
        elJudulFormDiskon.textContent = 'Ubah Aturan: ' + d.namaAturan;
        resetFormDiskon();
        isiDropdownJenisAnggotaDiskon();
        elWrapDiskonSemuaToko.style.display = state.isAdminAkun ? 'flex' : 'none';
        elFdNamaAturan.value = d.namaAturan || '';
        // CATATAN: diskon_list TIDAK mengirim kode_produk/toko_id mentah (hanya nama tampilan) --
        // checkbox "Semua Produk"/"Semua Toko" dipulihkan dari ada/tidaknya produkNama/tokoNama, tapi
        // kolom teks kode-produk/toko-id sengaja dikosongkan (harus diisi ulang kalau mau diubah) --
        // kompromi yg SAMA PERSIS dgn Desktop diskon-renderer.js (lihat komentarnya di sana).
        elFdSemuaProduk.checked = !d.produkNama; elWrapDiskonKodeProduk.style.display = d.produkNama ? 'block' : 'none';
        elFdSemuaToko.checked = !d.tokoNama; elWrapDiskonTokoId.style.display = (state.isAdminAkun && d.tokoNama) ? 'block' : 'none';
        elFdPersentase.value = String(Number(d.persentase) || 0);
        elFdNominal.value = String(Number(d.nominal) || 0);
        elFdPotongLangsung.checked = d.potonganLangsung !== false;
        elFdSimpanSaldo.checked = d.potonganLangsung === false;
        elFdAktif.checked = d.aktif !== false;
        elOverlayFormDiskon.classList.add('tampil');
    }
    elBtnTambahDiskon.addEventListener('click', bukaFormTambahDiskon);
    document.getElementById('btnTutupFormDiskon').addEventListener('click', function () { elOverlayFormDiskon.classList.remove('tampil'); });

    elBtnSimpanDiskon.addEventListener('click', async function () {
        var nama = elFdNamaAturan.value.trim();
        if (!nama) { toast('error', 'Nama aturan wajib diisi.'); elFdNamaAturan.focus(); return; }
        var payload = {
            nama_aturan: nama, keterangan: elFdKeterangan.value.trim(),
            berlaku_semua_produk: elFdSemuaProduk.checked, kode_produk: elFdKodeProduk.value.trim(),
            berlaku_semua_member: elFdSemuaMember.checked,
            jenis_anggota_id: elFdJenisAnggota.value || undefined, tipe_anggota_id: elFdTipeAnggota.value || undefined,
            persentase: Number(elFdPersentase.value) || 0, maksimal_potongan: Number(elFdMaksimalPotongan.value) || 0,
            nominal: Number(elFdNominal.value) || 0, potongan_langsung: elFdPotongLangsung.checked,
            berlaku_per_hari_dan_per_toko: elFdSekaliPerHari.checked,
            tanggal_mulai: elFdTanggalMulai.value || '', tanggal_selesai: elFdTanggalSelesai.value || '',
            aktif: elFdAktif.checked
        };
        if (idDiskonDiubah) payload.id = idDiskonDiubah;
        if (state.isAdminAkun) { payload.berlaku_semua_toko = elFdSemuaToko.checked; if (!elFdSemuaToko.checked) payload.toko_id = elFdTokoId.value.trim(); }
        elBtnSimpanDiskon.disabled = true; elBtnSimpanDiskon.textContent = 'Menyimpan...';
        try {
            var r = await AisApi.panggil('diskon_simpan', payload);
            if (r.status !== 'success') { toast('error', pesanDariHasil(r, 'Gagal menyimpan aturan diskon.')); return; }
            toast('success', idDiskonDiubah ? 'Aturan diskon diperbarui.' : 'Aturan diskon baru ditambahkan.');
            elOverlayFormDiskon.classList.remove('tampil');
            muatAturanDiskon();
        } catch (e) {
            toast('error', 'Gagal menyimpan: ' + (e && e.message ? e.message : e));
        } finally {
            elBtnSimpanDiskon.disabled = false; elBtnSimpanDiskon.textContent = 'Simpan';
        }
    });

    document.getElementById('btnBackAturanDiskon').addEventListener('click', function () { kembaliKeKasir(); });

    // ---- Laporan Transaksi (Report Order/Sesi/Payment, spesifikasi klien "Flow Kasir") ----
    // Sumber data: 3 aksi PosApi baru (laporan_order_list/laporan_sesi_list/laporan_payment_list),
    // lihat JavaDoc server PosApi.daftarOrderDenganSesi/prosesLaporanSesiList. Versi Android SENGAJA
    // lebih ringkas drpd Desktop (kartu bertumpuk, bukan tabel lebar) -- layar HP tak cukup lebar utk
    // tabel banyak kolom. Tombol "Detail" per Order MEMAKAI ULANG aksi detail_transaksi yg sudah ada
    // (sama dipakai fitur cetak struk) -- pajak/subtotal per baris item DIHITUNG di sini (proporsional
    // dari pajak header), server tak menyimpan kolom itu per-item.
    var elIsiLaporanTransaksi = document.getElementById('isiLaporanTransaksi');
    var elBtnSinkronTransaksiStatistik = document.getElementById('btnSinkronTransaksiStatistik');
    var elInfoTransaksiStatistik = document.getElementById('infoTransaksiStatistik');
    var elSubTabLt = document.getElementById('subTabLaporanTransaksi');
    var elOverlayDetailLt = document.getElementById('overlayDetailPenjualanLt');
    var elRingkasFiskalLt = document.getElementById('ringkasFiskalLt');
    var elIsiDetailLt = document.getElementById('isiDetailPenjualanLt');
    var subTabLtAktif = 'order';
    var stateLt = {
        order: { page: 1, pageSize: 20, total: 0 },
        sesi: { page: 1, pageSize: 20, total: 0 },
        payment: { page: 1, pageSize: 20, total: 0 }
    };

    // ---- Badge "Mesin Ini" (gap-closure "bedakan antar mesin POS + siapa entry", padanan Desktop
    // badgeMesin() di laporan-transaksi-renderer.js) -- dibaca sekali, nama mesin sendiri tak berubah
    // selama layar ini terbuka. ----
    var namaMesinSayaLt = null;
    async function muatIdentitasMesinSayaLt() {
        try {
            var m = await AisApi.identitasMesinBaca();
            namaMesinSayaLt = m.namaMesin && m.namaMesin.trim() ? m.namaMesin.trim() : ('Mesin-' + m.idMesin.substr(0, 8));
        } catch (e) { /* abaikan -- badge fallback ke "-" jika tak diketahui */ }
    }
    function badgeMesinLt(namaMesin) {
        if (!namaMesin) return '<span style="color:var(--muted);">-</span>';
        if (namaMesinSayaLt && namaMesin === namaMesinSayaLt) return '<span class="lencana-status synced">Mesin Ini &middot; ' + escapeHtml(namaMesin) + '</span>';
        return '<span class="lencana-status pending">' + escapeHtml(namaMesin) + '</span>';
    }

    function formatWaktuLt(iso) {
        if (!iso) return '-';
        var d = new Date(iso);
        if (isNaN(d.getTime())) return String(iso);
        function p2(n) { return (n < 10 ? '0' : '') + n; }
        return p2(d.getDate()) + '-' + p2(d.getMonth() + 1) + '-' + d.getFullYear() + ' ' + p2(d.getHours()) + ':' + p2(d.getMinutes());
    }

    function renderPaginasiLt(state, onGanti) {
        var totalHal = Math.max(1, Math.ceil(state.total / state.pageSize));
        var wrap = document.createElement('div');
        wrap.className = 'paginasi-lt';
        var info = document.createElement('span');
        info.textContent = 'Hal ' + state.page + '/' + totalHal + ' (' + state.total + ')';
        var btnMundur = document.createElement('button');
        btnMundur.type = 'button'; btnMundur.textContent = '< Sebelumnya'; btnMundur.disabled = state.page <= 1;
        btnMundur.addEventListener('click', function () { state.page--; onGanti(); });
        var btnMaju = document.createElement('button');
        btnMaju.type = 'button'; btnMaju.textContent = 'Berikutnya >'; btnMaju.disabled = state.page >= totalHal;
        btnMaju.addEventListener('click', function () { state.page++; onGanti(); });
        wrap.appendChild(info); wrap.appendChild(btnMundur); wrap.appendChild(btnMaju);
        return wrap;
    }

    /** Chart batang horizontal ranked (nilai=rupiah), pola sama buatBarHorizontalProduk. */
    function buatBarHorizontalTransaksiLt(container, data) {
        container.innerHTML = '';
        if (!data || data.length === 0) { container.innerHTML = '<div class="layar-kosong">Belum ada data.</div>'; return; }
        var maks = Math.max.apply(null, data.map(function (d) { return d.nilai; })) || 1;
        data.forEach(function (d, i) {
            var baris = document.createElement('div');
            baris.className = 'baris-bar';
            baris.innerHTML = '<div class="peringkat"></div><div class="nama"></div><div class="batang-wrap"><div class="batang"></div></div><div class="nilai"></div>';
            baris.querySelector('.peringkat').textContent = String(i + 1);
            baris.querySelector('.nama').textContent = d.label;
            baris.querySelector('.batang').style.width = Math.max(4, Math.round((d.nilai / maks) * 100)) + '%';
            baris.querySelector('.nilai').textContent = formatRupiah(d.nilai);
            container.appendChild(baris);
        });
    }

    async function muatStatistikTransaksiLt() {
        try {
            var r = await AisApi.panggil('transaksi_statistik', {});
            if (r.status !== 'success') { if (elInfoTransaksiStatistik) elInfoTransaksiStatistik.textContent = 'Gagal memuat statistik: ' + pesanDariHasil(r, 'tidak diketahui'); return; }
            document.getElementById('kpiTrxHariIni').textContent = String(r.trxHariIni || 0);
            document.getElementById('kpiOmzetHariIni').textContent = formatRupiah(r.omzetHariIni || 0);
            document.getElementById('kpiTrx30Hari').textContent = String(r.trx30Hari || 0);
            document.getElementById('kpiOmzet30Hari').textContent = formatRupiah(r.omzet30Hari || 0);
            buatBarHorizontalTransaksiLt(document.getElementById('barKasirTransaksi'), r.byKasir || []);
            buatBarHorizontalTransaksiLt(document.getElementById('barMesinTransaksi'), r.byMesin || []);
            if (elInfoTransaksiStatistik) elInfoTransaksiStatistik.textContent = '\u{2705} Data terkini dari server (dasbor laporan selalu butuh koneksi aktif, tidak memakai cache).';
        } catch (e) {
            if (elInfoTransaksiStatistik) elInfoTransaksiStatistik.textContent = 'Gagal memuat statistik: ' + (e && e.message ? e.message : e);
        }
    }
    if (elBtnSinkronTransaksiStatistik) {
        elBtnSinkronTransaksiStatistik.addEventListener('click', async function () {
            elBtnSinkronTransaksiStatistik.disabled = true;
            try {
                await muatStatistikTransaksiLt();
                toast('success', 'Statistik transaksi disinkronkan.');
            } finally {
                elBtnSinkronTransaksiStatistik.disabled = false;
            }
        });
    }

    async function muatOrderLt() {
        elIsiLaporanTransaksi.innerHTML = '<div class="layar-kosong">Memuat...</div>';
        var s = stateLt.order;
        try {
            var r = await AisApi.panggil('laporan_order_list', { page: s.page, pageSize: s.pageSize });
            if (r.status !== 'success') { elIsiLaporanTransaksi.innerHTML = '<div class="layar-kosong">' + escapeHtml(pesanDariHasil(r, 'Gagal memuat data.')) + '</div>'; return; }
            s.total = r.total || 0;
            var data = r.data || [];
            if (!data.length) { elIsiLaporanTransaksi.innerHTML = '<div class="layar-kosong">Belum ada order.</div>'; return; }
            elIsiLaporanTransaksi.innerHTML = '';
            data.forEach(function (o) {
                var el = document.createElement('div');
                el.className = 'baris-riwayat-item';
                el.innerHTML = '<div class="atas"><span class="kode-mono">' + escapeHtml(o.nomorNota) + '</span><span class="waktu">' + escapeHtml(formatWaktuLt(o.waktu)) + '</span></div>'
                    + '<div class="baris-2kol"><span>' + escapeHtml(o.pembeli) + ' &middot; ' + escapeHtml(o.kasir) + '</span><span style="font-weight:800;color:var(--primary);">' + formatRupiah(o.totalBiaya) + '</span></div>'
                    + '<div class="baris-2kol"><span class="lencana-status synced">' + escapeHtml(o.metode) + '</span>' + badgeMesinLt(o.namaMesin) + '</div>';
                var btnDetail = document.createElement('button');
                btnDetail.type = 'button'; btnDetail.className = 'btn-detail-lt'; btnDetail.textContent = 'Detail Penjualan';
                btnDetail.addEventListener('click', function () { bukaDetailPenjualanLt(o.idTransaksi, o.totalDiskon, o.pajak); });
                el.appendChild(btnDetail);
                elIsiLaporanTransaksi.appendChild(el);
            });
            elIsiLaporanTransaksi.appendChild(renderPaginasiLt(s, muatOrderLt));
        } catch (e) {
            elIsiLaporanTransaksi.innerHTML = '<div class="layar-kosong">Gagal memuat: ' + escapeHtml(e && e.message ? e.message : e) + '</div>';
        }
    }

    async function muatSesiLt() {
        elIsiLaporanTransaksi.innerHTML = '<div class="layar-kosong">Memuat...</div>';
        var s = stateLt.sesi;
        try {
            var r = await AisApi.panggil('laporan_sesi_list', { page: s.page, pageSize: s.pageSize });
            if (r.status !== 'success') { elIsiLaporanTransaksi.innerHTML = '<div class="layar-kosong">' + escapeHtml(pesanDariHasil(r, 'Gagal memuat data.')) + '</div>'; return; }
            s.total = r.total || 0;
            var data = r.data || [];
            if (!data.length) { elIsiLaporanTransaksi.innerHTML = '<div class="layar-kosong">Belum ada sesi kasir.</div>'; return; }
            elIsiLaporanTransaksi.innerHTML = '';
            data.forEach(function (x) {
                var badge = x.status === 'TUTUP' ? '<span class="lencana-status synced">Tutup</span>' : '<span class="lencana-status pending">Buka</span>';
                var el = document.createElement('div');
                el.className = 'baris-riwayat-item';
                el.innerHTML = '<div class="atas"><span class="kode-mono">' + escapeHtml(x.sesiKode) + '</span>' + badge + '</div>'
                    + '<div class="baris-2kol"><span>' + escapeHtml(x.kasir) + '</span><span>' + escapeHtml(formatWaktuLt(x.waktuBuka)) + '</span></div>'
                    + '<div class="baris-2kol"><span>Awal: ' + formatRupiah(x.modalAwal) + '</span><span style="font-weight:800;color:var(--primary);">Akhir: ' + formatRupiah(x.saldoAkhir) + (x.saldoAkhirDikonfirmasi ? '' : ' *') + '</span></div>';
                elIsiLaporanTransaksi.appendChild(el);
            });
            elIsiLaporanTransaksi.appendChild(renderPaginasiLt(s, muatSesiLt));
        } catch (e) {
            elIsiLaporanTransaksi.innerHTML = '<div class="layar-kosong">Gagal memuat: ' + escapeHtml(e && e.message ? e.message : e) + '</div>';
        }
    }

    async function muatPaymentLt() {
        elIsiLaporanTransaksi.innerHTML = '<div class="layar-kosong">Memuat...</div>';
        var s = stateLt.payment;
        try {
            var r = await AisApi.panggil('laporan_payment_list', { page: s.page, pageSize: s.pageSize });
            if (r.status !== 'success') { elIsiLaporanTransaksi.innerHTML = '<div class="layar-kosong">' + escapeHtml(pesanDariHasil(r, 'Gagal memuat data.')) + '</div>'; return; }
            s.total = r.total || 0;
            var data = r.data || [];
            if (!data.length) { elIsiLaporanTransaksi.innerHTML = '<div class="layar-kosong">Belum ada pembayaran.</div>'; return; }
            elIsiLaporanTransaksi.innerHTML = '';
            data.forEach(function (p) {
                var el = document.createElement('div');
                el.className = 'baris-riwayat-item';
                el.innerHTML = '<div class="atas"><span class="kode-mono">' + escapeHtml(p.orderKode) + '</span><span class="waktu">' + escapeHtml(formatWaktuLt(p.waktu)) + '</span></div>'
                    + '<div class="baris-2kol"><span class="lencana-status synced">' + escapeHtml(p.metode) + '</span><span style="font-weight:800;color:var(--primary);">' + formatRupiah(p.jumlah) + '</span></div>';
                elIsiLaporanTransaksi.appendChild(el);
            });
            elIsiLaporanTransaksi.appendChild(renderPaginasiLt(s, muatPaymentLt));
        } catch (e) {
            elIsiLaporanTransaksi.innerHTML = '<div class="layar-kosong">Gagal memuat: ' + escapeHtml(e && e.message ? e.message : e) + '</div>';
        }
    }

    function muatLaporanTransaksi() {
        if (subTabLtAktif === 'order') muatOrderLt();
        else if (subTabLtAktif === 'sesi') muatSesiLt();
        else muatPaymentLt();
        muatStatistikTransaksiLt();
    }

    elSubTabLt.querySelectorAll('.pill-kategori').forEach(function (btn) {
        btn.addEventListener('click', function () {
            elSubTabLt.querySelectorAll('.pill-kategori').forEach(function (b) { b.classList.remove('aktif'); });
            btn.classList.add('aktif');
            subTabLtAktif = btn.getAttribute('data-sub');
            muatLaporanTransaksi();
        });
    });

    async function bukaDetailPenjualanLt(idTransaksi, totalDiskonHeader, pajakHeader) {
        elOverlayDetailLt.classList.add('tampil');
        elRingkasFiskalLt.innerHTML = '';
        elIsiDetailLt.innerHTML = '<div class="layar-kosong">Memuat...</div>';
        try {
            var r = await AisApi.panggil('detail_transaksi', { id: idTransaksi });
            if (r.status !== 'success') { elIsiDetailLt.innerHTML = '<div class="layar-kosong">' + escapeHtml(pesanDariHasil(r, 'Gagal memuat detail.')) + '</div>'; return; }
            var item = r.item || [];
            var baris = item.map(function (it) {
                var subtotal = (Number(it.harga) || 0) * (Number(it.qty) || 0) - (Number(it.diskon) || 0);
                return { nama: it.nama, qty: it.qty, harga: it.harga, diskon: it.diskon, subtotal: subtotal };
            });
            var totalSubtotal = baris.reduce(function (a, b) { return a + b.subtotal; }, 0);
            baris.forEach(function (b) { b.pajak = totalSubtotal > 0 ? pajakHeader * (b.subtotal / totalSubtotal) : 0; });

            elRingkasFiskalLt.innerHTML =
                '<div class="kartu-ringkas"><div class="label">Total Diskon</div><div class="nilai">' + formatRupiah(totalDiskonHeader) + '</div></div>'
                + '<div class="kartu-ringkas"><div class="label">Pajak</div><div class="nilai">' + formatRupiah(pajakHeader) + '</div></div>'
                + '<div class="kartu-ringkas" style="grid-column:1/-1;"><div class="label">Total Bayar</div><div class="nilai">' + formatRupiah(r.totalBiaya) + '</div></div>';

            elIsiDetailLt.innerHTML = baris.map(function (b) {
                return '<div class="lt-item-baris"><div><div class="nama">' + escapeHtml(b.nama) + '</div>'
                    + '<div class="rincian">' + b.qty + ' x ' + formatRupiah(b.harga) + ' &middot; Diskon ' + formatRupiah(b.diskon) + ' &middot; Pajak ' + formatRupiah(b.pajak) + '</div></div>'
                    + '<div style="font-weight:800;">' + formatRupiah(b.subtotal) + '</div></div>';
            }).join('');
        } catch (e) {
            elIsiDetailLt.innerHTML = '<div class="layar-kosong">Gagal memuat: ' + escapeHtml(e && e.message ? e.message : e) + '</div>';
        }
    }
    document.getElementById('btnTutupDetailPenjualanLt').addEventListener('click', function () { elOverlayDetailLt.classList.remove('tampil'); });
    elOverlayDetailLt.addEventListener('click', function (ev) { if (ev.target === elOverlayDetailLt) elOverlayDetailLt.classList.remove('tampil'); });

    document.getElementById('btnBackLaporanTransaksi').addEventListener('click', function () { kembaliKeKasir(); });
    document.getElementById('btnMuatUlangLaporanTransaksi').addEventListener('click', muatLaporanTransaksi);

    // ---- Riwayat Penjualan (cari transaksi lunas + cetak ulang struk) ----
    // TERPISAH dari Laporan Transaksi (fokus analitik/rekap: KPI, omzet per kasir/mesin, 3 tab
    // Order/Sesi/Payment). Sengaja TIDAK menambah aksi server baru -- daftar memakai ULANG aksi
    // {@code laporan_order_list} (sama dipakai tab "Order" Laporan Transaksi) dgn filter tanggal/nama
    // pembeli yg SUDAH didukung server (lihat PosApi.daftarOrderDenganSesi) tapi belum dipakai layar
    // Laporan Transaksi Android; rincian + cetak ulang struk memakai ULANG aksi {@code detail_transaksi}
    // + {@link bangunDataStrukDariDetail}/printer Bluetooth tersimpan (SAMA persis dgn {@link
    // cetakStrukPesanan}) -- satu sumber data & satu jalur cetak, konsisten dgn Desktop
    // (struk.js dipakai Ringkasan MAUPUN Laporan Transaksi lewat aksi yg sama).
    var elIsiRp = document.getElementById('isiRiwayatPenjualan');
    var elRpTglMulai = document.getElementById('rpTglMulai');
    var elRpTglSampai = document.getElementById('rpTglSampai');
    var elRpCariPembeli = document.getElementById('rpCariPembeli');
    var stateRp = { page: 1, pageSize: 20, total: 0 };

    function renderTabelRp(data) {
        elIsiRp.innerHTML = '';
        data.forEach(function (o) {
            var el = document.createElement('div');
            el.className = 'baris-riwayat-item';
            el.innerHTML = '<div class="atas"><span class="kode-mono">' + escapeHtml(o.nomorNota) + '</span><span class="waktu">' + escapeHtml(formatWaktuLt(o.waktu)) + '</span></div>'
                + '<div class="baris-2kol"><span>' + escapeHtml(o.pembeli) + ' &middot; ' + escapeHtml(o.kasir) + '</span><span style="font-weight:800;color:var(--primary);">' + formatRupiah(o.totalBiaya) + '</span></div>'
                + '<div class="baris-2kol"><span class="lencana-status synced">' + escapeHtml(o.metode) + '</span>' + badgeMesinLt(o.namaMesin) + '</div>';
            var wrapBtn = document.createElement('div');
            wrapBtn.style.cssText = 'display:flex;gap:8px;margin-top:8px;';
            var btnDetail = document.createElement('button');
            btnDetail.type = 'button'; btnDetail.className = 'btn-detail-lt'; btnDetail.textContent = 'Detail';
            btnDetail.addEventListener('click', function () { bukaDetailPenjualanRp(o.idTransaksi, o.totalDiskon, o.pajak); });
            var btnCetak = document.createElement('button');
            btnCetak.type = 'button'; btnCetak.className = 'btn-detail-lt'; btnCetak.textContent = '🖨️ Cetak Struk';
            btnCetak.addEventListener('click', function () { cetakUlangStrukRp(o.idTransaksi, btnCetak); });
            wrapBtn.appendChild(btnDetail); wrapBtn.appendChild(btnCetak);
            if (bolehKelolaProduk()) {
                var btnBatalkan = document.createElement('button');
                btnBatalkan.type = 'button'; btnBatalkan.className = 'btn-detail-lt'; btnBatalkan.style.color = 'var(--danger)'; btnBatalkan.textContent = 'Batalkan';
                btnBatalkan.addEventListener('click', function () { batalkanTransaksiRp(o.idTransaksi); });
                wrapBtn.appendChild(btnBatalkan);
            }
            el.appendChild(wrapBtn);
            elIsiRp.appendChild(el);
        });
        elIsiRp.appendChild(renderPaginasiLt(stateRp, muatRiwayatPenjualan));
    }

    /**
     * Tombol "Batalkan" (Supervisor) -- gap-closure padanan JSP e-Kantin (tombol "Batal" di
     * {@code _riwayat_transaksi_terbaru.jsp}) &amp; Desktop (ringkasan-renderer.js). Android tidak
     * punya widget "Riwayat Transaksi" terpisah di layar Ringkasan spt Desktop (celah pra-eksisting,
     * di luar cakupan ini) -- ditaruh di sini (Riwayat Penjualan), daftar per-transaksi terdekat yang
     * sudah ada. Alasan WAJIB; server (KantinHelper.batalkanTransaksi) memakai util arsip yang SAMA
     * dgn JSP ({@code PembatalanTransaksiUtil.batalkan}), bukan mekanisme terpisah.
     */
    async function batalkanTransaksiRp(id) {
        var alasan = prompt('Alasan pembatalan transaksi (wajib diisi):', '');
        if (alasan === null) return;
        alasan = alasan.trim();
        if (!alasan) { toast('error', 'Alasan pembatalan wajib diisi.'); return; }
        if (!confirm('Batalkan transaksi ini? Transaksi akan dihapus permanen dari riwayat penjualan (tetap tercatat di arsip pembatalan beserta alasannya).')) return;
        try {
            var r = await AisApi.panggil('batalkan_transaksi', { id: id, alasan: alasan });
            if (r.status !== '00' && r.status !== 'success') { toast('error', pesanDariHasil(r, 'Gagal membatalkan transaksi.')); return; }
            toast('success', 'Transaksi berhasil dibatalkan dan tercatat di arsip pembatalan.');
            muatRiwayatPenjualan();
        } catch (e) {
            ErrorAlert.tampilkanDariException(e, 'Batalkan Transaksi');
        }
    }

    async function muatRiwayatPenjualan() {
        elIsiRp.innerHTML = '<div class="layar-kosong">Memuat...</div>';
        try {
            var r = await AisApi.panggil('laporan_order_list', {
                tglMulai: elRpTglMulai.value || '', tglSampai: elRpTglSampai.value || '',
                cariPembeli: elRpCariPembeli.value.trim(), page: stateRp.page, pageSize: stateRp.pageSize
            });
            if (r.status !== 'success') { elIsiRp.innerHTML = '<div class="layar-kosong">' + escapeHtml(pesanDariHasil(r, 'Gagal memuat data.')) + '</div>'; return; }
            stateRp.total = r.total || 0;
            var data = r.data || [];
            if (!data.length) { elIsiRp.innerHTML = '<div class="layar-kosong">Belum ada transaksi pada rentang ini.</div>'; return; }
            renderTabelRp(data);
        } catch (e) {
            elIsiRp.innerHTML = '<div class="layar-kosong">Gagal memuat: ' + escapeHtml(e && e.message ? e.message : e) + '</div>';
        }
    }
    document.getElementById('btnSaringRp').addEventListener('click', function () { stateRp.page = 1; muatRiwayatPenjualan(); });
    document.getElementById('btnMuatUlangRiwayatPenjualan').addEventListener('click', function () { muatRiwayatPenjualan(); });
    document.getElementById('btnBackRiwayatPenjualan').addEventListener('click', function () { kembaliKeKasir(); });

    // ---- Modal Detail Penjualan (Riwayat) -- pola sama persis bukaDetailPenjualanLt ----
    var elOverlayDetailRp = document.getElementById('overlayDetailRp');
    var elRingkasFiskalRp = document.getElementById('ringkasFiskalRp');
    var elIsiDetailRp = document.getElementById('isiDetailRp');
    var elBtnCetakUlangStrukRp = document.getElementById('btnCetakUlangStrukRp');
    var idTransaksiDetailRpAktif = null;

    async function bukaDetailPenjualanRp(idTransaksi, totalDiskonHeader, pajakHeader) {
        idTransaksiDetailRpAktif = idTransaksi;
        elOverlayDetailRp.classList.add('tampil');
        elRingkasFiskalRp.innerHTML = '';
        elIsiDetailRp.innerHTML = '<div class="layar-kosong">Memuat...</div>';
        try {
            var r = await AisApi.panggil('detail_transaksi', { id: idTransaksi });
            if (r.status !== 'success') { elIsiDetailRp.innerHTML = '<div class="layar-kosong">' + escapeHtml(pesanDariHasil(r, 'Gagal memuat detail.')) + '</div>'; return; }
            var item = r.item || [];
            var baris = item.map(function (it) {
                var subtotal = (Number(it.harga) || 0) * (Number(it.qty) || 0) - (Number(it.diskon) || 0);
                return { nama: it.nama, qty: it.qty, harga: it.harga, diskon: it.diskon, subtotal: subtotal };
            });
            var totalSubtotal = baris.reduce(function (a, b) { return a + b.subtotal; }, 0);
            baris.forEach(function (b) { b.pajak = totalSubtotal > 0 ? pajakHeader * (b.subtotal / totalSubtotal) : 0; });

            elRingkasFiskalRp.innerHTML =
                '<div class="kartu-ringkas"><div class="label">Total Diskon</div><div class="nilai">' + formatRupiah(totalDiskonHeader) + '</div></div>'
                + '<div class="kartu-ringkas"><div class="label">Pajak</div><div class="nilai">' + formatRupiah(pajakHeader) + '</div></div>'
                + '<div class="kartu-ringkas" style="grid-column:1/-1;"><div class="label">Total Bayar</div><div class="nilai">' + formatRupiah(r.totalBiaya) + '</div></div>';

            elIsiDetailRp.innerHTML = baris.map(function (b) {
                return '<div class="lt-item-baris"><div><div class="nama">' + escapeHtml(b.nama) + '</div>'
                    + '<div class="rincian">' + b.qty + ' x ' + formatRupiah(b.harga) + ' &middot; Diskon ' + formatRupiah(b.diskon) + ' &middot; Pajak ' + formatRupiah(b.pajak) + '</div></div>'
                    + '<div style="font-weight:800;">' + formatRupiah(b.subtotal) + '</div></div>';
            }).join('');
        } catch (e) {
            elIsiDetailRp.innerHTML = '<div class="layar-kosong">Gagal memuat: ' + escapeHtml(e && e.message ? e.message : e) + '</div>';
        }
    }
    document.getElementById('btnTutupDetailRp').addEventListener('click', function () { elOverlayDetailRp.classList.remove('tampil'); idTransaksiDetailRpAktif = null; });
    elOverlayDetailRp.addEventListener('click', function (ev) { if (ev.target === elOverlayDetailRp) { elOverlayDetailRp.classList.remove('tampil'); idTransaksiDetailRpAktif = null; } });
    elBtnCetakUlangStrukRp.addEventListener('click', function () {
        if (idTransaksiDetailRpAktif != null) cetakUlangStrukRp(idTransaksiDetailRpAktif, elBtnCetakUlangStrukRp);
    });

    /** Cetak ulang struk dari SATU transaksi historis -- pola sama persis {@link cetakStrukPesanan}, hanya sumber id-nya beda (baris Riwayat Penjualan, bukan objek pesanan lunas). */
    async function cetakUlangStrukRp(idTransaksi, btn) {
        muatPrinterTersimpan();
        if (!printerTersimpan) { toast('error', 'Pilih printer Bluetooth dulu (ikon printer di layar Kasir).'); return; }
        if (!EscPos.tersedia()) { toast('error', 'Fitur cetak hanya tersedia di aplikasi Android (APK).'); return; }
        var semulaTeks = btn ? btn.textContent : null;
        if (btn) { btn.disabled = true; btn.textContent = 'Menyambungkan...'; }
        try {
            var r = await AisApi.panggil('detail_transaksi', { id: idTransaksi });
            if (r.status !== 'success') { toast('error', pesanDariHasil(r, 'Gagal memuat data struk.')); return; }
            await EscPos.sambungkan(printerTersimpan.address);
            if (btn) btn.textContent = 'Mencetak...';
            var bytes = EscPos.bangunStruk(bangunDataStrukDariDetail(r));
            await EscPos.cetak(bytes);
            toast('success', 'Struk terkirim ke printer.');
        } catch (e) {
            ErrorAlert.tampilkanDariException(e, 'Cetak Ulang Struk Riwayat #' + idTransaksi);
        } finally {
            if (btn) { btn.disabled = false; btn.textContent = semulaTeks; }
        }
    }

    // ---- Retur Penjualan (catat barang kembali dari pelanggan) ----
    // TIDAK digerbang Supervisor (beda dari Kulakan) -- tugas rutin kasir sehari-hari, lihat JavaDoc
    // server KantinHelper.returPenjualanSimpan. Langkah 1 (cari transaksi asal) memakai ULANG aksi
    // {@code laporan_order_list} (sama dipakai Laporan Transaksi/Riwayat Penjualan); langkah 2 memakai
    // ULANG {@code detail_transaksi} (sama dipakai cetak ulang struk) -- item-nya kini menyertakan
    // {@code produkId} (ditambahkan bersamaan dgn fitur ini) supaya bisa langsung dikirim ke {@code
    // retur_penjualan_simpan} tanpa pencocokan nama produk yang rapuh.
    var elIsiRetur = document.getElementById('isiReturPenjualan');
    var elRtKeyword = document.getElementById('rtKeyword');
    var stateRetur = { page: 1, pageSize: 20, total: 0 };

    var riwayatReturTerakhir = []; // cache halaman terakhir dimuat -- dipakai bukaModalUbahRetur cari data by id tanpa panggil server lagi

    function renderTabelRetur(data) {
        riwayatReturTerakhir = data;
        elIsiRetur.innerHTML = '';
        data.forEach(function (r) {
            var balik = r.kembalikanKeStok
                ? '<span class="lencana-status synced">Balik ke Stok</span>'
                : '<span class="lencana-status pending">Rusak/Tak Kembali</span>';
            var el = document.createElement('div');
            el.className = 'baris-riwayat-item';
            el.innerHTML = '<div class="atas"><span class="kode-mono">' + escapeHtml(r.kodeTransaksiAsal) + '</span><span class="waktu">' + escapeHtml(r.waktu) + '</span></div>'
                + '<div class="baris-2kol"><span style="font-weight:700;">' + escapeHtml(r.namaProduk) + '</span><span style="font-weight:800;color:var(--danger,#dc2626);">' + formatRupiah(r.totalNilai) + '</span></div>'
                + '<div class="baris-2kol"><span>' + escapeHtml(r.namaPembeli || '-') + ' &middot; Qty ' + r.qty + '</span>' + balik + '</div>'
                + '<div style="font-size:11px;color:var(--muted);margin-top:4px;">' + escapeHtml(r.alasan || '-') + '</div>';
            if (bolehKelolaProduk()) {
                var wrapAksi = document.createElement('div');
                wrapAksi.style.cssText = 'display:flex;gap:8px;margin-top:8px;';
                var btnUbah = document.createElement('button');
                btnUbah.type = 'button'; btnUbah.className = 'btn-detail-lt'; btnUbah.textContent = 'Ubah';
                btnUbah.addEventListener('click', function () { bukaModalUbahRetur(r.id); });
                var btnHapus = document.createElement('button');
                btnHapus.type = 'button'; btnHapus.className = 'btn-detail-lt'; btnHapus.style.color = 'var(--danger)'; btnHapus.textContent = 'Hapus';
                btnHapus.addEventListener('click', function () { hapusRetur(r.id); });
                wrapAksi.appendChild(btnUbah); wrapAksi.appendChild(btnHapus);
                el.appendChild(wrapAksi);
            }
            elIsiRetur.appendChild(el);
        });
        elIsiRetur.appendChild(renderPaginasiLt(stateRetur, muatReturPenjualan));
    }

    async function muatReturPenjualan() {
        elIsiRetur.innerHTML = '<div class="layar-kosong">Memuat...</div>';
        try {
            var r = await AisApi.panggil('retur_penjualan_list', { keyword: elRtKeyword.value.trim(), page: stateRetur.page, page_size: stateRetur.pageSize });
            if (r.status !== '00' && r.status !== 'success') { elIsiRetur.innerHTML = '<div class="layar-kosong">' + escapeHtml(pesanDariHasil(r, 'Gagal memuat data.')) + '</div>'; return; }
            stateRetur.total = r.total || 0;
            var data = r.data || [];
            if (!data.length) { elIsiRetur.innerHTML = '<div class="layar-kosong">Belum ada retur penjualan tercatat.</div>'; return; }
            renderTabelRetur(data);
        } catch (e) {
            elIsiRetur.innerHTML = '<div class="layar-kosong">Gagal memuat: ' + escapeHtml(e && e.message ? e.message : e) + '</div>';
        }
    }
    document.getElementById('btnSaringRetur').addEventListener('click', function () { stateRetur.page = 1; muatReturPenjualan(); });
    document.getElementById('btnMuatUlangReturPenjualan').addEventListener('click', function () { muatReturPenjualan(); });
    document.getElementById('btnBackReturPenjualan').addEventListener('click', function () { kembaliKeKasir(); });

    // -- Modal Langkah 1: Cari Transaksi Asal --
    var elOverlayCariRetur = document.getElementById('overlayCariTransaksiRetur');
    var elRtCariNota = document.getElementById('rtCariNota');
    var elHasilCariRetur = document.getElementById('hasilCariTransaksiRetur');

    document.getElementById('btnReturBaru').addEventListener('click', function () {
        elRtCariNota.value = ''; elHasilCariRetur.innerHTML = '';
        elOverlayCariRetur.classList.add('tampil');
    });
    document.getElementById('btnTutupCariTransaksiRetur').addEventListener('click', function () { elOverlayCariRetur.classList.remove('tampil'); });
    elOverlayCariRetur.addEventListener('click', function (ev) { if (ev.target === elOverlayCariRetur) elOverlayCariRetur.classList.remove('tampil'); });

    async function cariTransaksiAsalRetur() {
        var kw = elRtCariNota.value.trim();
        if (!kw) { toast('error', 'Ketik nomor nota atau nama pembeli dulu.'); return; }
        elHasilCariRetur.innerHTML = '<div class="layar-kosong">Mencari...</div>';
        try {
            var r = await AisApi.panggil('laporan_order_list', { cariPembeli: kw, page: 1, pageSize: 25 });
            if (r.status !== 'success') { elHasilCariRetur.innerHTML = ''; toast('error', pesanDariHasil(r, 'Gagal mencari.')); return; }
            var data = r.data || [];
            var kwLower = kw.toLowerCase();
            var hasil = data.filter(function (o) { return (o.nomorNota || '').toLowerCase().indexOf(kwLower) >= 0 || (o.pembeli || '').toLowerCase().indexOf(kwLower) >= 0; });
            if (!hasil.length) hasil = data;
            if (!hasil.length) { elHasilCariRetur.innerHTML = '<div class="layar-kosong">Transaksi tidak ditemukan.</div>'; return; }
            elHasilCariRetur.innerHTML = '';
            hasil.forEach(function (o) {
                var btn = document.createElement('button');
                btn.type = 'button'; btn.className = 'baris-riwayat-item'; btn.style.cssText = 'width:100%;text-align:left;border:1.5px solid var(--border);cursor:pointer;';
                btn.innerHTML = '<div class="atas"><span class="kode-mono">' + escapeHtml(o.nomorNota) + '</span><span class="waktu">' + escapeHtml(o.waktu) + '</span></div>'
                    + '<div class="baris-2kol"><span>' + escapeHtml(o.pembeli) + '</span><span style="font-weight:800;color:var(--success);">' + formatRupiah(o.totalBiaya) + '</span></div>';
                btn.addEventListener('click', function () { pilihTransaksiAsalRetur(o.idTransaksi, o.nomorNota, o.pembeli); });
                elHasilCariRetur.appendChild(btn);
            });
        } catch (e) {
            elHasilCariRetur.innerHTML = '<div class="layar-kosong">Gagal mencari: ' + escapeHtml(e && e.message ? e.message : e) + '</div>';
        }
    }
    document.getElementById('btnCariNotaRetur').addEventListener('click', cariTransaksiAsalRetur);

    // -- Modal Langkah 2: Pilih Barang --
    var elOverlayPilihRetur = document.getElementById('overlayPilihBarangRetur');
    var elIsiPilihRetur = document.getElementById('isiPilihBarangRetur');
    var elLabelTransaksiAsalRetur = document.getElementById('labelTransaksiAsalRetur');
    var elRtTotalNilaiRetur = document.getElementById('rtTotalNilaiRetur');
    var transaksiAsalReturAktif = { id: null, kode: '', pembeli: '' };
    var itemAsalReturAktif = [];
    var ALASAN_RETUR_ANDROID = ['Rusak', 'Salah Ukuran/Varian', 'Tidak Sesuai Pesanan', 'Berubah Pikiran', 'Kadaluarsa', 'Lainnya'];
    var KONDISI_BARANG_ANDROID = ['Baik (Layak Jual Lagi)', 'Rusak (Tidak Layak Jual)'];

    async function pilihTransaksiAsalRetur(idTransaksi, kode, pembeli) {
        transaksiAsalReturAktif = { id: idTransaksi, kode: kode, pembeli: pembeli };
        elLabelTransaksiAsalRetur.textContent = kode + ' -- ' + pembeli;
        elIsiPilihRetur.innerHTML = '<div class="layar-kosong">Memuat item...</div>';
        elOverlayCariRetur.classList.remove('tampil');
        elOverlayPilihRetur.classList.add('tampil');
        try {
            var r = await AisApi.panggil('detail_transaksi', { id: idTransaksi });
            if (r.status !== 'success') { elIsiPilihRetur.innerHTML = ''; toast('error', pesanDariHasil(r, 'Gagal memuat item.')); return; }
            itemAsalReturAktif = r.item || [];
            var optAlasan = ALASAN_RETUR_ANDROID.map(function (a) { return '<option value="' + a + '">' + a + '</option>'; }).join('');
            var optKondisi = KONDISI_BARANG_ANDROID.map(function (k) { return '<option value="' + k + '">' + k + '</option>'; }).join('');
            var html = '';
            itemAsalReturAktif.forEach(function (it, idx) {
                html += '<div class="baris-riwayat-item item-retur-android" data-idx="' + idx + '" style="margin-bottom:8px;">'
                    + '<div class="atas"><label style="display:flex;align-items:center;gap:8px;"><input type="checkbox" class="chk-retur-android"> <b>' + escapeHtml(it.nama) + '</b></label><span class="waktu">Beli: ' + it.qty + '</span></div>'
                    + '<div style="font-size:11px;color:var(--muted);margin-bottom:6px;">Harga saat beli: ' + formatRupiah(it.harga) + '</div>'
                    + '<div class="baris-2kol" style="gap:8px;">'
                    + '<input type="number" class="inp-qty-retur-android" min="0.01" max="' + it.qty + '" step="0.01" value="' + it.qty + '" disabled style="flex:1;padding:6px;border:1px solid var(--border);border-radius:8px;">'
                    + '<select class="sel-alasan-retur-android" disabled style="flex:1;padding:6px;border:1px solid var(--border);border-radius:8px;">' + optAlasan + '</select>'
                    + '</div>'
                    + '<select class="sel-kondisi-retur-android" disabled style="width:100%;margin-top:6px;padding:6px;border:1px solid var(--border);border-radius:8px;">' + optKondisi + '</select>'
                    + '</div>';
            });
            elIsiPilihRetur.innerHTML = html || '<div class="layar-kosong">Transaksi ini tidak punya item.</div>';
            elIsiPilihRetur.querySelectorAll('.chk-retur-android').forEach(function (chk) {
                chk.addEventListener('change', function () {
                    var wrap = this.closest('.item-retur-android');
                    wrap.querySelectorAll('input, select').forEach(function (el) { if (el !== this) el.disabled = !chk.checked; }, this);
                    hitungTotalReturAndroid();
                });
            });
            elIsiPilihRetur.querySelectorAll('.inp-qty-retur-android').forEach(function (inp) { inp.addEventListener('input', hitungTotalReturAndroid); });
            hitungTotalReturAndroid();
        } catch (e) {
            elIsiPilihRetur.innerHTML = '<div class="layar-kosong">Gagal memuat: ' + escapeHtml(e && e.message ? e.message : e) + '</div>';
        }
    }
    document.getElementById('btnTutupPilihBarangRetur').addEventListener('click', function () { elOverlayPilihRetur.classList.remove('tampil'); });
    elOverlayPilihRetur.addEventListener('click', function (ev) { if (ev.target === elOverlayPilihRetur) elOverlayPilihRetur.classList.remove('tampil'); });

    function hitungTotalReturAndroid() {
        var total = 0;
        elIsiPilihRetur.querySelectorAll('.item-retur-android').forEach(function (wrap) {
            var chk = wrap.querySelector('.chk-retur-android');
            if (chk && chk.checked) {
                var idx = Number(wrap.getAttribute('data-idx'));
                var it = itemAsalReturAktif[idx];
                var qty = parseFloat(wrap.querySelector('.inp-qty-retur-android').value) || 0;
                total += qty * (Number(it && it.harga) || 0);
            }
        });
        elRtTotalNilaiRetur.textContent = formatRupiah(total);
    }

    document.getElementById('btnSimpanRetur').addEventListener('click', async function () {
        var items = [];
        var adaError = false;
        elIsiPilihRetur.querySelectorAll('.item-retur-android').forEach(function (wrap) {
            var chk = wrap.querySelector('.chk-retur-android');
            if (!chk || !chk.checked) return;
            var idx = Number(wrap.getAttribute('data-idx'));
            var it = itemAsalReturAktif[idx];
            var qty = parseFloat(wrap.querySelector('.inp-qty-retur-android').value) || 0;
            var qtyBeli = Number(it && it.qty) || 0;
            if (!it || it.produkId == null || qty <= 0 || qty > qtyBeli) { adaError = true; return; }
            var kondisi = wrap.querySelector('.sel-kondisi-retur-android').value;
            items.push({
                produk_id: it.produkId, qty: qty, harga_satuan: Number(it.harga) || 0,
                alasan: wrap.querySelector('.sel-alasan-retur-android').value,
                kondisi_barang: kondisi,
                kembalikan_ke_stok: kondisi.toLowerCase().indexOf('rusak') === -1
            });
        });
        if (adaError) { toast('error', 'Ada baris tidak valid (qty melebihi jumlah beli, atau produk tak dikenali).'); return; }
        if (!items.length) { toast('error', 'Pilih minimal satu barang untuk diretur.'); return; }

        var btn = document.getElementById('btnSimpanRetur');
        var oriTeks = btn.textContent;
        btn.disabled = true; btn.textContent = 'Menyimpan...';
        try {
            var r = await AisApi.panggil('retur_penjualan_simpan', {
                pembelian_anggota_koperasi_id: transaksiAsalReturAktif.id,
                kode_transaksi_asal: transaksiAsalReturAktif.kode,
                nama_pembeli: transaksiAsalReturAktif.pembeli,
                metode_pengembalian: document.getElementById('rtMetodePengembalian').value,
                items: items
            });
            if (r.status !== '00' && r.status !== 'success') { toast('error', pesanDariHasil(r, 'Gagal menyimpan retur.')); return; }
            toast('success', 'Retur penjualan berhasil disimpan.');
            elOverlayPilihRetur.classList.remove('tampil');
            muatReturPenjualan();
        } catch (e) {
            ErrorAlert.tampilkanDariException(e, 'Simpan Retur Penjualan');
        } finally {
            btn.disabled = false; btn.textContent = oriTeks;
        }
    });

    // -- Ubah/Hapus retur (Supervisor, gerbang bolehKelolaProduk() -- sama dgn Kulakan) --
    var elOverlayUbahRetur = document.getElementById('overlayUbahRetur');
    var idReturDiubah = null;

    function bukaModalUbahRetur(id) {
        var r = null;
        for (var i = 0; i < riwayatReturTerakhir.length; i++) { if (riwayatReturTerakhir[i].id === id) { r = riwayatReturTerakhir[i]; break; } }
        if (!r) { toast('error', 'Data retur tidak ditemukan di halaman ini -- muat ulang dulu.'); return; }
        idReturDiubah = id;
        document.getElementById('ubahReturId').value = id;
        document.getElementById('ubahReturProduk').value = r.namaProduk || '';
        document.getElementById('ubahReturQty').value = r.qty;
        document.getElementById('ubahReturHarga').value = r.hargaSatuan;
        document.getElementById('ubahReturAlasan').value = r.alasan || 'Lainnya';
        document.getElementById('ubahReturKondisi').value = r.kondisiBarang || 'Baik (Layak Jual Lagi)';
        document.getElementById('ubahReturMetode').value = r.metodePengembalian || 'Tunai';
        document.getElementById('ubahReturKeterangan').value = r.keterangan || '';
        elOverlayUbahRetur.classList.add('tampil');
    }
    document.getElementById('btnTutupUbahRetur').addEventListener('click', function () { elOverlayUbahRetur.classList.remove('tampil'); idReturDiubah = null; });
    elOverlayUbahRetur.addEventListener('click', function (ev) { if (ev.target === elOverlayUbahRetur) { elOverlayUbahRetur.classList.remove('tampil'); idReturDiubah = null; } });

    document.getElementById('btnSimpanUbahRetur').addEventListener('click', async function () {
        if (idReturDiubah == null) return;
        var qty = parseFloat(document.getElementById('ubahReturQty').value) || 0;
        if (qty <= 0) { toast('error', 'Qty retur harus lebih dari 0.'); return; }
        var kondisi = document.getElementById('ubahReturKondisi').value;
        var btn = document.getElementById('btnSimpanUbahRetur');
        var oriTeks = btn.textContent;
        btn.disabled = true; btn.textContent = 'Menyimpan...';
        try {
            var r = await AisApi.panggil('retur_penjualan_ubah', {
                id: idReturDiubah,
                qty: qty,
                harga_satuan: parseFloat(document.getElementById('ubahReturHarga').value) || 0,
                alasan: document.getElementById('ubahReturAlasan').value,
                kondisi_barang: kondisi,
                kembalikan_ke_stok: kondisi.toLowerCase().indexOf('rusak') === -1,
                metode_pengembalian: document.getElementById('ubahReturMetode').value,
                keterangan: document.getElementById('ubahReturKeterangan').value
            });
            if (r.status !== '00' && r.status !== 'success') { toast('error', pesanDariHasil(r, 'Gagal menyimpan perubahan.')); return; }
            toast('success', 'Retur berhasil diperbarui.');
            elOverlayUbahRetur.classList.remove('tampil');
            idReturDiubah = null;
            muatReturPenjualan();
        } catch (e) {
            ErrorAlert.tampilkanDariException(e, 'Ubah Retur Penjualan');
        } finally {
            btn.disabled = false; btn.textContent = oriTeks;
        }
    });

    async function hapusRetur(id) {
        if (!confirm('Hapus baris retur ini? Stok akan disesuaikan ulang secara otomatis.')) return;
        try {
            var r = await AisApi.panggil('retur_penjualan_hapus', { id: id });
            if (r.status !== '00' && r.status !== 'success') { toast('error', pesanDariHasil(r, 'Gagal menghapus.')); return; }
            toast('success', 'Retur berhasil dihapus.');
            muatReturPenjualan();
        } catch (e) {
            ErrorAlert.tampilkanDariException(e, 'Hapus Retur Penjualan');
        }
    }

    // ---- Customer/Anggota (CRUD, samakan dgn manajemen anggota POS Online) ----
    // Server: anggota_list (keyword/page/page_size -> data.data[]/data.total), anggota_simpan
    // (upsert), jenis_anggota_list (dropdown) -- SEMUA sudah ada & dipakai Desktop, dipanggil di sini
    // via AisApi.panggil langsung (bukan lewat proses utama spt Electron -- app ini murni web/Capacitor).
    var elIsiAnggota = document.getElementById('isiAnggota');
    var elInCariAnggota = document.getElementById('inCariAnggota');
    var elBtnTambahAnggota = document.getElementById('btnTambahAnggota');
    var elBtnSinkronAnggotaCache = document.getElementById('btnSinkronAnggotaCache');
    var elInfoCacheAnggota = document.getElementById('infoCacheAnggota');
    var elOverlayFormAnggota = document.getElementById('overlayFormAnggota');
    var elJudulFormAnggota = document.getElementById('judulFormAnggota');
    var elFormAnggotaNama = document.getElementById('formAnggotaNama');
    var elFormAnggotaKodeIdentitas = document.getElementById('formAnggotaKodeIdentitas');
    var elFormAnggotaJenis = document.getElementById('formAnggotaJenis');
    var elFormAnggotaHp = document.getElementById('formAnggotaHp');
    var elFormAnggotaTelp = document.getElementById('formAnggotaTelp');
    var elFormAnggotaEmail = document.getElementById('formAnggotaEmail');
    var elFormAnggotaKeterangan = document.getElementById('formAnggotaKeterangan');
    var elFormAnggotaAktif = document.getElementById('formAnggotaAktif');
    var elBtnSimpanAnggota = document.getElementById('btnSimpanAnggota');

    var daftarAnggotaSaatIni = [];
    var daftarJenisAnggota = [];
    var idAnggotaDiubah = null;
    var cariAnggotaTimer = null;

    async function muatJenisAnggota() {
        try {
            var r = await AisApi.panggil('jenis_anggota_list', {});
            daftarJenisAnggota = (r.status === 'success' && r.data) || [];
        } catch (e) { daftarJenisAnggota = []; }
        elFormAnggotaJenis.innerHTML = '<option value="">-- Tidak ditentukan --</option>';
        daftarJenisAnggota.forEach(function (j) {
            var opt = document.createElement('option');
            opt.value = j.id; opt.textContent = j.nama;
            elFormAnggotaJenis.appendChild(opt);
        });
    }

    var stateAnggota = { page: 1, pageSize: 20, total: 0 };

    function renderDaftarAnggota() {
        if (!daftarAnggotaSaatIni.length) { elIsiAnggota.innerHTML = '<div class="layar-kosong">Belum ada anggota yang cocok.</div>'; return; }
        elIsiAnggota.innerHTML = '';
        daftarAnggotaSaatIni.forEach(function (a) {
            var badge = a.aktif ? '<span class="lencana-status synced">Aktif</span>' : '<span class="lencana-status pending">Non-Aktif</span>';
            var el = document.createElement('div');
            el.className = 'baris-produk-item';
            el.innerHTML = '<div class="info"><div class="nama">' + escapeHtml(a.nama) + '</div>'
                + '<div class="meta">' + escapeHtml(a.kode) + (a.kodeIdentitas ? ' &middot; ' + escapeHtml(a.kodeIdentitas) : '') + (a.jenisNama && a.jenisNama !== '-' ? ' &middot; ' + escapeHtml(a.jenisNama) : '') + '</div>'
                + '<div class="meta">' + badge + '</div></div>';
            var btn = document.createElement('button');
            btn.type = 'button'; btn.className = 'btn-kecil-outline'; btn.textContent = 'Ubah';
            btn.addEventListener('click', function () { bukaFormUbahAnggota(a); });
            el.appendChild(btn);
            elIsiAnggota.appendChild(el);
        });
        var totalHal = Math.max(1, Math.ceil(stateAnggota.total / stateAnggota.pageSize));
        var footer = document.createElement('div');
        footer.className = 'paginasi-lt';
        footer.innerHTML = '<span>Hal ' + stateAnggota.page + '/' + totalHal + ' (' + stateAnggota.total + ' anggota)</span>'
            + '<button type="button" id="btnAnggotaHalSebelumnya"' + (stateAnggota.page <= 1 ? ' disabled' : '') + '>&#8249; Sebelumnya</button>'
            + '<button type="button" id="btnAnggotaHalBerikutnya"' + (stateAnggota.page >= totalHal ? ' disabled' : '') + '>Berikutnya &#8250;</button>';
        elIsiAnggota.appendChild(footer);
        var elSebelumnya = document.getElementById('btnAnggotaHalSebelumnya');
        var elBerikutnya = document.getElementById('btnAnggotaHalBerikutnya');
        if (elSebelumnya) elSebelumnya.addEventListener('click', function () { if (stateAnggota.page > 1) { stateAnggota.page--; muatDaftarAnggota(); } });
        if (elBerikutnya) elBerikutnya.addEventListener('click', function () { if (stateAnggota.page < totalHal) { stateAnggota.page++; muatDaftarAnggota(); } });
    }

    /** Chart batang horizontal ranked, pola sama persis dgn buatBarHorizontalProduk (Produk). @param {HTMLElement} container @param {Array<{label:string,jumlah:number}>} data */
    function buatBarHorizontalAnggota(container, data) {
        container.innerHTML = '';
        if (!data || data.length === 0) { container.innerHTML = '<div class="layar-kosong">Belum ada data.</div>'; return; }
        var maks = Math.max.apply(null, data.map(function (d) { return d.jumlah; })) || 1;
        data.forEach(function (d, i) {
            var baris = document.createElement('div');
            baris.className = 'baris-bar';
            baris.innerHTML = '<div class="peringkat"></div><div class="nama"></div><div class="batang-wrap"><div class="batang"></div></div><div class="nilai"></div>';
            baris.querySelector('.peringkat').textContent = String(i + 1);
            baris.querySelector('.nama').textContent = d.label;
            baris.querySelector('.batang').style.width = Math.max(4, Math.round((d.jumlah / maks) * 100)) + '%';
            baris.querySelector('.nilai').textContent = d.jumlah;
            container.appendChild(baris);
        });
    }

    async function muatStatistikAnggota() {
        try {
            var r = await AisApi.panggil('anggota_statistik', {});
            if (r.status !== 'success') return;
            document.getElementById('kpiTotalAnggota').textContent = String(r.totalAnggota || 0);
            document.getElementById('kpiAnggotaAktif').textContent = String(r.totalAktif || 0);
            document.getElementById('kpiAnggotaNonaktif').textContent = String(r.totalNonaktif || 0);
            document.getElementById('kpiAnggotaWajibPin').textContent = String(r.totalWajibPin || 0);
            buatBarHorizontalAnggota(document.getElementById('barJenisAnggota'), r.byJenis || []);
        } catch (e) { /* dasbor statistik gagal muat bukan blocker */ }
    }

    function formatWaktuCacheAnggota(iso) {
        if (!iso) return null;
        var d = new Date(iso);
        if (isNaN(d.getTime())) return null;
        var p = function (n) { return String(n).padStart(2, '0'); };
        return p(d.getDate()) + '-' + p(d.getMonth() + 1) + '-' + d.getFullYear() + ' ' + p(d.getHours()) + ':' + p(d.getMinutes());
    }

    async function muatRingkasanCacheAnggota() {
        if (!elInfoCacheAnggota || !window.AnggotaCache) return;
        try {
            var r = await AnggotaCache.ringkasanAnggotaCache();
            var waktu = formatWaktuCacheAnggota(r.disinkronPada);
            elInfoCacheAnggota.textContent = r.total > 0
                ? ('\u{1F4E6} ' + r.total + ' anggota tersimpan di cache lokal (dipakai saat offline)' + (waktu ? ' -- terakhir disinkron ' + waktu : '.'))
                : '\u{1F4E6} Belum ada cache lokal -- ketuk tombol sinkron di kanan atas.';
        } catch (e) { /* status cache gagal dimuat bukan blocker */ }
    }

    if (elBtnSinkronAnggotaCache) {
        elBtnSinkronAnggotaCache.addEventListener('click', async function () {
            elBtnSinkronAnggotaCache.disabled = true;
            var teksAsli = elBtnSinkronAnggotaCache.innerHTML;
            elBtnSinkronAnggotaCache.innerHTML = '&#8987;';
            try {
                var r = await AnggotaCache.sinkronkanAnggotaCacheManual();
                if (r.ok) {
                    toast('success', 'Cache lokal diperbarui -- ' + r.total + ' anggota tersimpan.');
                    muatRingkasanCacheAnggota();
                } else {
                    toast('error', r.pesan || 'Gagal menyinkronkan cache lokal.');
                }
            } catch (e) {
                toast('error', 'Gagal menyinkronkan: ' + (e && e.message ? e.message : e));
            } finally {
                elBtnSinkronAnggotaCache.disabled = false;
                elBtnSinkronAnggotaCache.innerHTML = teksAsli;
            }
        });
    }

    async function muatDaftarAnggota() {
        elIsiAnggota.innerHTML = '<div class="layar-kosong">Memuat...</div>';
        if (stateAnggota.page === 1 && !elInCariAnggota.value.trim()) { muatStatistikAnggota(); muatRingkasanCacheAnggota(); }
        try {
            var r = await AisApi.panggil('anggota_list', { keyword: elInCariAnggota.value.trim(), page: stateAnggota.page, page_size: stateAnggota.pageSize });
            if (r.status !== 'success') { elIsiAnggota.innerHTML = '<div class="layar-kosong">' + escapeHtml(pesanDariHasil(r, 'Gagal memuat anggota.')) + '</div>'; return; }
            daftarAnggotaSaatIni = r.data || [];
            stateAnggota.total = r.total || 0;
            renderDaftarAnggota();
        } catch (e) {
            elIsiAnggota.innerHTML = '<div class="layar-kosong">Gagal memuat: ' + escapeHtml(e && e.message ? e.message : e) + '</div>';
        }
    }
    elInCariAnggota.addEventListener('input', function () {
        clearTimeout(cariAnggotaTimer);
        cariAnggotaTimer = setTimeout(function () { stateAnggota.page = 1; muatDaftarAnggota(); }, 350);
    });
    document.getElementById('btnBackAnggota').addEventListener('click', function () { kembaliKeKasir(); });

    function resetFormAnggota() {
        elFormAnggotaNama.value = ''; elFormAnggotaKodeIdentitas.value = ''; elFormAnggotaJenis.value = '';
        elFormAnggotaHp.value = ''; elFormAnggotaTelp.value = ''; elFormAnggotaEmail.value = '';
        elFormAnggotaKeterangan.value = ''; elFormAnggotaAktif.checked = true;
    }
    function bukaFormTambahAnggota() {
        idAnggotaDiubah = null;
        elJudulFormAnggota.textContent = 'Tambah Anggota';
        resetFormAnggota();
        elOverlayFormAnggota.classList.add('tampil');
        elFormAnggotaNama.focus();
    }
    function bukaFormUbahAnggota(a) {
        idAnggotaDiubah = a.id;
        elJudulFormAnggota.textContent = 'Ubah: ' + a.nama;
        resetFormAnggota();
        elFormAnggotaNama.value = a.nama || '';
        elFormAnggotaKodeIdentitas.value = a.kodeIdentitas || '';
        elFormAnggotaJenis.value = a.jenisAnggotaKoperasiId == null ? '' : String(a.jenisAnggotaKoperasiId);
        elFormAnggotaHp.value = a.hp || '';
        elFormAnggotaTelp.value = a.telp || '';
        elFormAnggotaEmail.value = a.email || '';
        elFormAnggotaKeterangan.value = a.keterangan || '';
        elFormAnggotaAktif.checked = a.aktif !== false;
        elOverlayFormAnggota.classList.add('tampil');
        elFormAnggotaNama.focus();
    }
    elBtnTambahAnggota.addEventListener('click', bukaFormTambahAnggota);
    document.getElementById('btnTutupFormAnggota').addEventListener('click', function () { elOverlayFormAnggota.classList.remove('tampil'); });

    elBtnSimpanAnggota.addEventListener('click', async function () {
        var nama = elFormAnggotaNama.value.trim();
        if (!nama) { toast('error', 'Nama anggota wajib diisi.'); elFormAnggotaNama.focus(); return; }
        var payload = {
            nama: nama, kode_identitas: elFormAnggotaKodeIdentitas.value.trim(), hp: elFormAnggotaHp.value.trim(),
            telp: elFormAnggotaTelp.value.trim(), email: elFormAnggotaEmail.value.trim(),
            keterangan: elFormAnggotaKeterangan.value.trim(), aktif: elFormAnggotaAktif.checked,
            jenis_anggota_koperasi_id: elFormAnggotaJenis.value || null
        };
        if (idAnggotaDiubah) payload.id = idAnggotaDiubah;
        elBtnSimpanAnggota.disabled = true; elBtnSimpanAnggota.textContent = 'Menyimpan...';
        try {
            var r = await AisApi.panggil('anggota_simpan', payload);
            if (r.status !== 'success') { toast('error', pesanDariHasil(r, 'Gagal menyimpan anggota.')); return; }
            toast('success', (idAnggotaDiubah ? 'Data anggota diperbarui.' : 'Anggota baru ditambahkan.'));
            elOverlayFormAnggota.classList.remove('tampil');
            muatDaftarAnggota();
        } catch (e) {
            toast('error', 'Gagal menyimpan: ' + (e && e.message ? e.message : e));
        } finally {
            elBtnSimpanAnggota.disabled = false; elBtnSimpanAnggota.textContent = 'Simpan';
        }
    });

    // ---- Konfigurasi (Profil Toko + Akun Pedagang, khusus supervisor/admin) ----
    // Server: toko_profil_ambil/simpan, pedagang_list/pedagang_ubah, akun_tambah -- semua SUDAH ADA
    // & dipakai Desktop (lihat konfigurasi-renderer.js), dipanggil langsung di sini via AisApi.panggil.
    var cf = {
        nama: document.getElementById('cfNama'), telp: document.getElementById('cfTelp'), email: document.getElementById('cfEmail'),
        alamat: document.getElementById('cfAlamat'), kota: document.getElementById('cfKota'), kodePos: document.getElementById('cfKodePos'),
        picNama: document.getElementById('cfPicNama'), picHp: document.getElementById('cfPicHp'), npwp: document.getElementById('cfNpwp'),
        jamOperasional: document.getElementById('cfJamOperasional'), keterangan: document.getElementById('cfKeterangan'),
        pesanTerimaKasih: document.getElementById('cfPesanTerimaKasih')
    };
    var elBtnSimpanProfilToko = document.getElementById('btnSimpanProfilToko');
    var elCatatanAksesToko = document.getElementById('catatanAksesToko');
    var elIsiPedagang = document.getElementById('isiPedagang');
    var elBtnTambahPedagang = document.getElementById('btnTambahPedagang');
    var bolehUbahTokoAndroid = false;

    function terapkanGerbangTokoAndroid() {
        var kunci = !bolehUbahTokoAndroid;
        Object.keys(cf).forEach(function (k) { cf[k].disabled = kunci; });
        elBtnSimpanProfilToko.style.display = kunci ? 'none' : 'block';
        elCatatanAksesToko.style.display = kunci ? 'block' : 'none';
        elBtnTambahPedagang.style.display = bolehKelolaProduk() ? 'inline-block' : 'none';
        // Server (KantinHelper.gantiPasswordSendiri) menolak akun admin global (bukan Pedagang toko) --
        // sembunyikan section-nya utk akun itu supaya tak ada tombol yg pasti gagal kalau ditekan.
        elWrapAkunSaya.style.display = state.isAdminAkun ? 'none' : 'block';
    }

    // ---- Akun Saya: ganti kata sandi sendiri (Fase gap-closure Android) ----
    // Server: akun_ganti_password -- SUDAH ADA & dipakai Desktop (lihat pos-renderer.js
    // submitGantiPassword / panel "Akun Saya"). Hanya berlaku utk akun Pedagang toko (kasir/supervisor),
    // BUKAN akun admin global -- lihat gerbang di terapkanGerbangTokoAndroid().
    var elWrapAkunSaya = document.getElementById('wrapAkunSaya');
    var elCfPasswordLama = document.getElementById('cfPasswordLama');
    var elCfPasswordBaru = document.getElementById('cfPasswordBaru');
    var elBtnGantiPasswordSendiri = document.getElementById('btnGantiPasswordSendiri');
    elBtnGantiPasswordSendiri.addEventListener('click', async function () {
        var lama = elCfPasswordLama.value, baru = elCfPasswordBaru.value;
        if (!lama || !baru) { toast('error', 'Kata sandi lama dan kata sandi baru wajib diisi.'); return; }
        if (baru.length < 6) { toast('error', 'Kata sandi baru minimal 6 karakter.'); return; }
        elBtnGantiPasswordSendiri.disabled = true; elBtnGantiPasswordSendiri.textContent = 'Menyimpan...';
        try {
            var r = await AisApi.panggil('akun_ganti_password', { password_lama: lama, password_baru: baru });
            if (r.status !== 'success') { toast('error', pesanDariHasil(r, 'Gagal mengganti kata sandi.')); return; }
            elCfPasswordLama.value = ''; elCfPasswordBaru.value = '';
            toast('success', 'Kata sandi berhasil diganti.');
        } catch (e) {
            toast('error', 'Gagal mengganti kata sandi: ' + (e && e.message ? e.message : e));
        } finally {
            elBtnGantiPasswordSendiri.disabled = false; elBtnGantiPasswordSendiri.textContent = 'Ganti Kata Sandi';
        }
    });

    async function muatProfilTokoAndroid() {
        try {
            var r = await AisApi.panggil('toko_profil_ambil', {});
            if (r.status !== 'success') { toast('error', pesanDariHasil(r, 'Gagal memuat profil toko.')); return; }
            var d = r.data || {};
            cf.nama.value = d.nama || ''; cf.telp.value = d.telp || ''; cf.email.value = d.email || '';
            cf.alamat.value = d.alamat || ''; cf.kota.value = d.kota || ''; cf.kodePos.value = d.kodePos || '';
            cf.picNama.value = d.picNama || ''; cf.picHp.value = d.picHp || ''; cf.npwp.value = d.npwp || '';
            cf.jamOperasional.value = d.jamOperasional || ''; cf.keterangan.value = d.keterangan || '';
            cf.pesanTerimaKasih.value = d.pesanTerimaKasih || '';
            bolehUbahTokoAndroid = !!r.bolehUbah;
            terapkanGerbangTokoAndroid();
        } catch (e) {
            toast('error', 'Gagal memuat profil toko: ' + (e && e.message ? e.message : e));
        }
    }

    elBtnSimpanProfilToko.addEventListener('click', async function () {
        var nama = cf.nama.value.trim();
        if (!nama) { toast('error', 'Nama toko wajib diisi.'); cf.nama.focus(); return; }
        var payload = {
            nama: nama, alamat: cf.alamat.value.trim(), kota: cf.kota.value.trim(), kode_pos: cf.kodePos.value.trim(),
            telp: cf.telp.value.trim(), email: cf.email.value.trim(), pic_nama: cf.picNama.value.trim(),
            pic_hp: cf.picHp.value.trim(), npwp: cf.npwp.value.trim(), jam_operasional: cf.jamOperasional.value.trim(),
            keterangan: cf.keterangan.value.trim(), pesan_terima_kasih: cf.pesanTerimaKasih.value.trim()
        };
        elBtnSimpanProfilToko.disabled = true; elBtnSimpanProfilToko.textContent = 'Menyimpan...';
        try {
            var r = await AisApi.panggil('toko_profil_simpan', payload);
            if (r.status !== 'success') { toast('error', pesanDariHasil(r, 'Gagal menyimpan profil toko.')); return; }
            toast('success', 'Profil toko disimpan.');
        } catch (e) {
            toast('error', 'Gagal menyimpan: ' + (e && e.message ? e.message : e));
        } finally {
            elBtnSimpanProfilToko.disabled = false; elBtnSimpanProfilToko.textContent = 'Simpan Profil Toko';
        }
    });

    function renderDaftarPedagang(daftar) {
        if (!daftar || !daftar.length) { elIsiPedagang.innerHTML = '<div class="layar-kosong">Belum ada akun pedagang.</div>'; return; }
        elIsiPedagang.innerHTML = '';
        daftar.forEach(function (p) {
            var badgeStatus = p.aktif ? '<span class="lencana-status synced">Aktif</span>' : '<span class="lencana-status pending">Non-Aktif</span>';
            var badgePeran = p.supervisor ? '<span class="lencana-status synced">Supervisor</span>' : '<span class="lencana-status pending">Kasir</span>';
            var el = document.createElement('div');
            el.className = 'baris-produk-item';
            el.innerHTML = '<div class="info"><div class="nama">' + escapeHtml(p.nama) + '</div>'
                + '<div class="meta">' + escapeHtml(p.userid) + (p.keterangan ? ' &middot; ' + escapeHtml(p.keterangan) : '') + '</div>'
                + '<div class="meta">' + badgeStatus + ' ' + badgePeran + '</div></div>';
            if (bolehKelolaProduk()) {
                var btn = document.createElement('button');
                btn.type = 'button'; btn.className = 'btn-kecil-outline'; btn.textContent = 'Ubah';
                btn.addEventListener('click', function () { bukaFormUbahPedagang(p); });
                el.appendChild(btn);
            }
            elIsiPedagang.appendChild(el);
        });
    }

    async function muatDaftarPedagang() {
        elIsiPedagang.innerHTML = '<div class="layar-kosong">Memuat...</div>';
        try {
            var r = await AisApi.panggil('pedagang_list', {});
            if (r.status !== 'success') { elIsiPedagang.innerHTML = '<div class="layar-kosong">' + escapeHtml(pesanDariHasil(r, 'Gagal memuat akun pedagang.')) + '</div>'; return; }
            renderDaftarPedagang(r.data || []);
        } catch (e) {
            elIsiPedagang.innerHTML = '<div class="layar-kosong">Gagal memuat: ' + escapeHtml(e && e.message ? e.message : e) + '</div>';
        }
    }

    var elOverlayFormPedagang = document.getElementById('overlayFormPedagang');
    var elJudulFormPedagang = document.getElementById('judulFormPedagang');
    var elWrapPedagangUserid = document.getElementById('wrapPedagangUserid');
    var elFpUserid = document.getElementById('fpUserid');
    var elFpNama = document.getElementById('fpNama');
    var elLabelPedagangPassword = document.getElementById('labelPedagangPassword');
    var elFpPassword = document.getElementById('fpPassword');
    var elFpKeterangan = document.getElementById('fpKeterangan');
    var elFpAktif = document.getElementById('fpAktif');
    var elWrapPedagangSupervisor = document.getElementById('wrapPedagangSupervisor');
    var elFpSupervisor = document.getElementById('fpSupervisor');
    var elBtnSimpanPedagang = document.getElementById('btnSimpanPedagang');
    var idPedagangDiubah = null;

    // Fitur "Hak Akses Menu per Akun" -- SAMA PERSIS pola dgn konfigurasi-renderer.js Electron: SATU
    // peta {kunci payload server -> elemen checkbox} dipakai reset/isi-ulang/kumpulkan form.
    var PETA_AKSES_MENU = {
        aksesKasir: document.getElementById('fpAksesKasir'),
        aksesRingkasan: document.getElementById('fpAksesRingkasan'),
        aksesPesanan: document.getElementById('fpAksesPesanan'),
        aksesAnggota: document.getElementById('fpAksesAnggota'),
        aksesProduk: document.getElementById('fpAksesProduk'),
        aksesStokOpname: document.getElementById('fpAksesStokOpname'),
        aksesKulakan: document.getElementById('fpAksesKulakan'),
        aksesDiskon: document.getElementById('fpAksesDiskon'),
        aksesLaporanTransaksi: document.getElementById('fpAksesLaporanTransaksi'),
        aksesLaporan: document.getElementById('fpAksesLaporan'),
        aksesRiwayatSinkronisasi: document.getElementById('fpAksesRiwayatSinkronisasi'),
        aksesLogError: document.getElementById('fpAksesLogError'),
        aksesKonfigurasi: document.getElementById('fpAksesKonfigurasi')
    };

    function resetFormPedagang() {
        elFpUserid.value = ''; elFpNama.value = ''; elFpPassword.value = ''; elFpKeterangan.value = '';
        elFpAktif.checked = true; elFpSupervisor.checked = false;
        Object.keys(PETA_AKSES_MENU).forEach(function (k) { PETA_AKSES_MENU[k].checked = true; });
    }
    function bukaFormTambahPedagang() {
        idPedagangDiubah = null;
        elJudulFormPedagang.textContent = 'Tambah Akun Pedagang';
        resetFormPedagang();
        elWrapPedagangUserid.style.display = 'block';
        elLabelPedagangPassword.textContent = 'Kata Sandi (min. 6 karakter)';
        // Gap-closure "supervisor boleh buat Supervisor lain juga, bukan cuma Kasir" -- checkbox ini
        // SEBELUMNYA hanya utk admin global; sekarang jg tampil utk supervisor toko (server sudah
        // menghormati field ini utk kedua jenis pemanggil, lihat JavaDoc KantinHelper.tambahAkunKasir).
        elWrapPedagangSupervisor.style.display = bolehAksiMenu('pedagang', 'supervisor') ? 'flex' : 'none';
        elOverlayFormPedagang.classList.add('tampil');
        elFpUserid.focus();
    }
    function bukaFormUbahPedagang(p) {
        idPedagangDiubah = p.id;
        elJudulFormPedagang.textContent = 'Ubah Akun: ' + p.nama;
        resetFormPedagang();
        elWrapPedagangUserid.style.display = 'none';
        elLabelPedagangPassword.textContent = 'Kata Sandi Baru (opsional, min. 6 karakter)';
        elFpNama.value = p.nama || ''; elFpKeterangan.value = p.keterangan || '';
        elFpAktif.checked = p.aktif !== false; elFpSupervisor.checked = !!p.supervisor;
        Object.keys(PETA_AKSES_MENU).forEach(function (k) { PETA_AKSES_MENU[k].checked = p[k] !== false; });
        elWrapPedagangSupervisor.style.display = bolehAksiMenu('pedagang', 'supervisor') ? 'flex' : 'none';
        elOverlayFormPedagang.classList.add('tampil');
        elFpNama.focus();
    }
    elBtnTambahPedagang.addEventListener('click', bukaFormTambahPedagang);
    document.getElementById('btnTutupFormPedagang').addEventListener('click', function () { elOverlayFormPedagang.classList.remove('tampil'); });

    elBtnSimpanPedagang.addEventListener('click', async function () {
        var nama = elFpNama.value.trim();
        if (!nama) { toast('error', 'Nama wajib diisi.'); elFpNama.focus(); return; }
        elBtnSimpanPedagang.disabled = true; elBtnSimpanPedagang.textContent = 'Menyimpan...';
        try {
            var r;
            if (idPedagangDiubah) {
                var payloadUbah = { id: idPedagangDiubah, nama: nama, keterangan: elFpKeterangan.value.trim(), aktif: elFpAktif.checked };
                if (elFpPassword.value) payloadUbah.password_baru = elFpPassword.value;
                if (bolehAksiMenu('pedagang', 'supervisor')) payloadUbah.supervisor = elFpSupervisor.checked;
                Object.keys(PETA_AKSES_MENU).forEach(function (k) { payloadUbah[k] = PETA_AKSES_MENU[k].checked; });
                r = await AisApi.panggil('pedagang_ubah', payloadUbah);
            } else {
                var userid = elFpUserid.value.trim();
                var password = elFpPassword.value;
                if (!userid || !password) { toast('error', 'Userid dan kata sandi wajib diisi.'); return; }
                if (password.length < 6) { toast('error', 'Kata sandi minimal 6 karakter.'); return; }
                var payloadTambah = { userid: userid, password: password, nama: nama, keterangan: elFpKeterangan.value.trim() };
                if (bolehAksiMenu('pedagang', 'supervisor')) payloadTambah.supervisor = elFpSupervisor.checked;
                Object.keys(PETA_AKSES_MENU).forEach(function (k) { payloadTambah[k] = PETA_AKSES_MENU[k].checked; });
                r = await AisApi.panggil('akun_tambah', payloadTambah);
            }
            if (r.status !== 'success') { toast('error', pesanDariHasil(r, 'Gagal menyimpan akun pedagang.')); return; }
            toast('success', idPedagangDiubah ? 'Akun pedagang diperbarui.' : 'Akun pedagang baru ditambahkan.');
            elOverlayFormPedagang.classList.remove('tampil');
            muatDaftarPedagang();
        } catch (e) {
            toast('error', 'Gagal menyimpan: ' + (e && e.message ? e.message : e));
        } finally {
            elBtnSimpanPedagang.disabled = false; elBtnSimpanPedagang.textContent = 'Simpan';
        }
    });

    function muatKonfigurasiLayar() {
        terapkanGerbangTokoAndroid();
        muatProfilTokoAndroid();
        muatDaftarPedagang();
        muatIdentitasMesinAndroid();
    }

    // ---- Identitas Mesin POS (gap-closure "banyak mesin POS satu toko") ----
    var elCfNamaMesin = document.getElementById('cfNamaMesin');
    var elCfIdMesin = document.getElementById('cfIdMesin');
    var elBtnSimpanNamaMesin = document.getElementById('btnSimpanNamaMesin');

    async function muatIdentitasMesinAndroid() {
        try {
            var m = await AisApi.identitasMesinBaca();
            elCfNamaMesin.value = m.namaMesin || '';
            elCfIdMesin.textContent = m.idMesin || '-';
        } catch (e) { /* abaikan -- field tetap kosong, bukan blocker */ }
    }

    elBtnSimpanNamaMesin.addEventListener('click', async function () {
        elBtnSimpanNamaMesin.disabled = true;
        try {
            await AisApi.identitasMesinSimpan(elCfNamaMesin.value.trim());
            toast('success', 'Nama mesin disimpan.');
        } catch (e) {
            toast('error', 'Gagal menyimpan: ' + (e && e.message ? e.message : e));
        } finally {
            elBtnSimpanNamaMesin.disabled = false;
        }
    });
    document.getElementById('btnBackKonfigurasi').addEventListener('click', function () { kembaliKeKasir(); });
    document.getElementById('btnMuatUlangKonfigurasi').addEventListener('click', muatKonfigurasiLayar);

    // ---- Laporan-Laporan (katalog generik ~150 laporan, 32 kategori) ----
    // Server: laporan_katalog/laporan_jalankan/laporan_pdf -- SUDAH ADA & dipakai Desktop (lihat
    // laporan-renderer.js). Logika buildHead/buildBodyFoot/buildSheet DISALIN PERSIS dari sana supaya
    // angka (grup/subtotal/grand total) TIDAK PERNAH beda antar platform.
    var elViewKatalogLk = document.getElementById('viewKatalogLk');
    var elViewSatuLk = document.getElementById('viewSatuLk');
    var elCariLaporanKatalog = document.getElementById('cariLaporanKatalog');
    var elIsiKatalogLk = document.getElementById('isiKatalogLk');
    var elJudulLaporanKatalog = document.getElementById('judulLaporanKatalog');
    var elFilterLk = document.getElementById('filterLk');
    var elHasilLk = document.getElementById('hasilLk');

    var kategoriDataLk = [];
    var laporanAktifLk = null;
    var dataTerakhirLk = null;

    function numvLk(v) { return typeof v === 'number' ? v : 0; }
    function isCountLk(label) { return /^(jml|jumlah)\b/i.test(label || ''); }
    function fmtAmtLk(v) { var n = Number(v) || 0, s = new Intl.NumberFormat('id-ID', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Math.abs(n)); return n < 0 ? ('(' + s + ')') : s; }
    function fmtIntLk(v) { var n = Number(v) || 0, s = new Intl.NumberFormat('id-ID', { maximumFractionDigits: 0 }).format(Math.abs(n)); return n < 0 ? ('(' + s + ')') : s; }
    function fmtCellLk(v, label) { return isCountLk(label) ? fmtIntLk(v) : fmtAmtLk(v); }

    function cocokFilterLk(item, kat, f) {
        if (!f) return true;
        return (item.judul || '').toLowerCase().indexOf(f) >= 0 || (item.ket || '').toLowerCase().indexOf(f) >= 0 || (kat || '').toLowerCase().indexOf(f) >= 0;
    }

    function renderKatalogLk(filter) {
        var f = (filter || '').toLowerCase().trim();
        elIsiKatalogLk.innerHTML = '';
        var ada = false;
        kategoriDataLk.forEach(function (grp) {
            var items = (grp.items || []).filter(function (it) { return cocokFilterLk(it, grp.kat, f); });
            if (!items.length) return;
            ada = true;
            var judulKat = document.createElement('div');
            judulKat.className = 'lk-cat'; judulKat.textContent = grp.kat;
            elIsiKatalogLk.appendChild(judulKat);
            var grid = document.createElement('div');
            grid.className = 'lk-grid';
            items.forEach(function (it) {
                var card = document.createElement('div');
                card.className = 'lk-card' + (it.url ? ' eksternal' : '');
                card.innerHTML = '<div class="lk-ic">' + (it.url ? '&#128279;' : '&#128196;') + '</div>'
                    + '<div><div class="lk-tt">' + escapeHtml(it.judul) + '</div><div class="lk-ds">' + escapeHtml(it.ket || '') + '</div></div>';
                card.addEventListener('click', function () { bukaLaporanLk(it); });
                grid.appendChild(card);
            });
            elIsiKatalogLk.appendChild(grid);
        });
        if (!ada) elIsiKatalogLk.innerHTML = '<div class="lk-sheet-kosong">Tidak ada laporan cocok.</div>';
    }

    async function muatKatalogLk() {
        if (kategoriDataLk.length) { renderKatalogLk(elCariLaporanKatalog.value); return; }
        elIsiKatalogLk.innerHTML = '<div class="lk-sheet-kosong">Memuat katalog...</div>';
        try {
            var r = await AisApi.panggil('laporan_katalog', {});
            if (r.status !== 'success' || !r.kategori) { elIsiKatalogLk.innerHTML = '<div class="lk-sheet-kosong">' + escapeHtml(pesanDariHasil(r, 'Gagal memuat katalog.')) + '</div>'; return; }
            kategoriDataLk = r.kategori;
            renderKatalogLk(elCariLaporanKatalog.value);
        } catch (e) {
            elIsiKatalogLk.innerHTML = '<div class="lk-sheet-kosong">Gagal memuat: ' + escapeHtml(e && e.message ? e.message : e) + '</div>';
        }
    }
    elCariLaporanKatalog.addEventListener('input', function () { renderKatalogLk(elCariLaporanKatalog.value); });

    function bukaLaporanLk(item) {
        if (item.url) { toast('info', 'Laporan ini hanya tersedia di versi web/Desktop.'); return; }
        laporanAktifLk = item; dataTerakhirLk = null;
        elJudulLaporanKatalog.textContent = item.judul;
        bangunFilterLk(item);
        elHasilLk.innerHTML = '<div class="lk-sheet-kosong">Atur filter lalu ketuk Tampilkan.</div>';
        elViewKatalogLk.style.display = 'none';
        elViewSatuLk.style.display = 'flex';
    }
    function kembaliKeKatalogLk() {
        laporanAktifLk = null;
        elJudulLaporanKatalog.textContent = 'Laporan-Laporan';
        elViewSatuLk.style.display = 'none';
        elViewKatalogLk.style.display = 'block';
    }

    function bangunFilterLk(item) {
        elFilterLk.innerHTML = '';
        var wrap = document.createElement('div');
        if (item.ket) { var ket = document.createElement('div'); ket.className = 'lk-catatan'; ket.textContent = item.ket; wrap.appendChild(ket); }
        var f1 = document.createElement('div'); f1.className = 'field'; f1.innerHTML = '<label>Tanggal Mulai</label><input type="date" id="fMulaiLk">'; wrap.appendChild(f1);
        var f2 = document.createElement('div'); f2.className = 'field'; f2.innerHTML = '<label>Tanggal Sampai</label><input type="date" id="fSampaiLk">'; wrap.appendChild(f2);
        if (item.produk) { var f3 = document.createElement('div'); f3.className = 'field'; f3.innerHTML = '<label>Cari Produk (kode/nama)</label><input type="text" id="fProdukLk">'; wrap.appendChild(f3); }
        if (item.pelanggan) { var f4 = document.createElement('div'); f4.className = 'field'; f4.innerHTML = '<label>Cari Pelanggan (kode/nama/member)</label><input type="text" id="fPelangganLk">'; wrap.appendChild(f4); }
        elFilterLk.appendChild(wrap);
        var aksi = document.createElement('div');
        aksi.className = 'filter-aksi';
        var btnTampilkan = document.createElement('button'); btnTampilkan.type = 'button'; btnTampilkan.className = 'btn-utama'; btnTampilkan.textContent = 'Tampilkan';
        btnTampilkan.addEventListener('click', jalankanLaporanLk);
        var btnPdf = document.createElement('button'); btnPdf.type = 'button'; btnPdf.className = 'btn-kecil-outline'; btnPdf.textContent = 'Unduh PDF';
        btnPdf.addEventListener('click', unduhPdfLk);
        aksi.appendChild(btnTampilkan); aksi.appendChild(btnPdf);
        elFilterLk.appendChild(aksi);
    }

    function payloadFilterLk() {
        var g = function (id) { var el = document.getElementById(id); return el ? el.value : ''; };
        var p = { r: laporanAktifLk.id, tglMulai: g('fMulaiLk'), tglSampai: g('fSampaiLk') };
        if (laporanAktifLk.produk) p.qProduk = g('fProdukLk');
        if (laporanAktifLk.pelanggan) p.qPelanggan = g('fPelangganLk');
        return p;
    }

    async function jalankanLaporanLk() {
        if (!laporanAktifLk) return;
        elHasilLk.innerHTML = '<div class="lk-sheet-kosong">Memuat...</div>';
        try {
            var r = await AisApi.panggil('laporan_jalankan', payloadFilterLk());
            if (r.status !== 'success') { elHasilLk.innerHTML = '<div class="lk-sheet-kosong">' + escapeHtml(pesanDariHasil(r, 'Gagal memuat data.')) + '</div>'; return; }
            var d = { kolom: r.kolom, baris: r.baris, catatan: r.catatan, grup: r.grup, grandTotal: r.grandTotal };
            dataTerakhirLk = d;
            elHasilLk.innerHTML = buildSheetLk(d);
        } catch (e) {
            elHasilLk.innerHTML = '<div class="lk-sheet-kosong">Kesalahan koneksi.</div>';
        }
    }

    function buildHeadLk(kol) {
        var h = '<tr>';
        for (var i = 0; i < kol.length; i++) h += '<th class="' + (kol[i].t === 'num' ? 'num' : '') + '">' + escapeHtml(kol[i].l) + '</th>';
        return h + '</tr>';
    }

    function buildBodyFootLk(d) {
        var kol = d.kolom;
        var gi = (typeof d.grup === 'number') ? d.grup : -1;
        var grand = []; var hasTotal = false;
        for (var c = 0; c < kol.length; c++) { grand[c] = 0; if (kol[c].t === 'num') hasTotal = true; }

        function cellsDetail(row, sub) {
            var s = '';
            for (var c2 = 0; c2 < kol.length; c2++) {
                var v = row[c2];
                if (gi >= 0 && c2 === gi) { s += '<td></td>'; }
                else if (kol[c2].t === 'num') {
                    if (v === null) { s += '<td class="num"></td>'; }
                    else { var n = numvLk(v); grand[c2] += n; if (sub) sub[c2] += n; s += '<td class="num">' + fmtCellLk(v, kol[c2].l) + '</td>'; }
                } else { s += '<td>' + escapeHtml(v) + '</td>'; }
            }
            return s;
        }
        function subtotalRow(key, sub) {
            var s = '<tr class="lk-sub">';
            for (var c3 = 0; c3 < kol.length; c3++) {
                if (c3 === gi) s += '<td>Subtotal ' + escapeHtml(key) + '</td>';
                else if (kol[c3].t === 'num') s += '<td class="num">' + fmtCellLk(sub[c3], kol[c3].l) + '</td>';
                else s += '<td></td>';
            }
            return s + '</tr>';
        }
        var body = '';
        if (gi >= 0 && d.baris.length) {
            var curKey = null, started = false, sub = null;
            d.baris.forEach(function (row) {
                var key = row[gi];
                if (!started || key !== curKey) {
                    if (started) body += subtotalRow(curKey, sub);
                    curKey = key; started = true; sub = [];
                    for (var c4 = 0; c4 < kol.length; c4++) sub[c4] = 0;
                    body += '<tr class="lk-grp"><td colspan="' + kol.length + '">' + escapeHtml(key) + '</td></tr>';
                }
                body += '<tr>' + cellsDetail(row, sub) + '</tr>';
            });
            if (started) body += subtotalRow(curKey, sub);
        } else {
            d.baris.forEach(function (row) { body += '<tr>' + cellsDetail(row, null) + '</tr>'; });
        }
        var foot = '';
        if (hasTotal && d.grandTotal !== false) {
            foot = '<tr>';
            for (var c5 = 0; c5 < kol.length; c5++) {
                if (c5 === 0) foot += '<td>GRAND TOTAL</td>';
                else if (kol[c5].t === 'num') foot += '<td class="num">' + fmtCellLk(grand[c5], kol[c5].l) + '</td>';
                else foot += '<td></td>';
            }
            foot += '</tr>';
        }
        return { body: body, foot: foot };
    }

    function buildSheetLk(d) {
        var out = '';
        if (d.catatan) out += '<div class="lk-catatan">' + escapeHtml(d.catatan) + '</div>';
        if (!d.baris.length) return out + '<div class="lk-sheet-kosong">Tidak ada data untuk filter ini.</div>';
        var bf = buildBodyFootLk(d);
        out += '<div class="lk-tbl-wrap"><table class="lk-tbl"><thead>' + buildHeadLk(d.kolom) + '</thead><tbody>' + bf.body + '</tbody>'
            + (bf.foot ? '<tfoot>' + bf.foot + '</tfoot>' : '') + '</table></div>'
            + '<div style="font-size:10.5px;color:var(--muted);margin:8px 12px;">Jumlah baris: ' + d.baris.length + '</div>';
        return out;
    }

    async function unduhPdfLk() {
        if (!laporanAktifLk) return;
        var Filesystem = pluginCapacitor('Filesystem');
        if (!Filesystem) { toast('error', 'Fitur unduh berkas tidak tersedia di perangkat ini.'); return; }
        if (!dataTerakhirLk) await jalankanLaporanLk();
        try {
            var r = await AisApi.panggil('laporan_pdf', payloadFilterLk());
            if (r.status !== 'success') { toast('error', pesanDariHasil(r, 'Gagal membuat PDF.')); return; }
            var namaFile = (laporanAktifLk.id || 'laporan') + '.pdf';
            var direktori = 'DOCUMENTS';
            try { await Filesystem.writeFile({ path: namaFile, data: r.pdfBase64, directory: direktori }); }
            catch (eDir) { direktori = 'CACHE'; await Filesystem.writeFile({ path: namaFile, data: r.pdfBase64, directory: direktori }); }
            toast('success', 'PDF tersimpan (' + namaFile + ', folder ' + (direktori === 'DOCUMENTS' ? 'Dokumen' : 'internal aplikasi') + ').');
        } catch (e) {
            toast('error', 'Gagal membuat PDF: ' + (e && e.message ? e.message : e));
        }
    }

    document.getElementById('btnBackLaporanKatalog').addEventListener('click', function () {
        if (laporanAktifLk) kembaliKeKatalogLk(); else kembaliKeKasir();
    });

    // ---- Produk (Katalog Barang, khusus supervisor -- lihat JavaDoc server KantinHelper.produkSimpan) ----
    var elIsiProduk = document.getElementById('isiProduk');
    var elBtnTambahProduk = document.getElementById('btnTambahProduk');
    var elBtnUnduhExcelProduk = document.getElementById('btnUnduhExcelProduk');
    var elBtnUnggahExcelProduk = document.getElementById('btnUnggahExcelProduk');
    var elBtnHitungUlangStok = document.getElementById('btnHitungUlangStok');
    var elBtnSinkronProdukCache = document.getElementById('btnSinkronProdukCache');
    var elInfoCacheProduk = document.getElementById('infoCacheProduk');
    var elInFileExcelProduk = document.getElementById('inFileExcelProduk');
    var elOverlayLaporanImpor = document.getElementById('overlayLaporanImpor');
    var elIsiLaporanImpor = document.getElementById('isiLaporanImpor');
    var elBtnTutupLaporanImpor = document.getElementById('btnTutupLaporanImpor');
    var elBtnUnduhLaporanImpor = document.getElementById('btnUnduhLaporanImpor');
    var elCariProdukWrap = document.getElementById('cariProdukWrap');
    var elWrapChkSemuaTokoProduk = document.getElementById('wrapChkSemuaTokoProduk');
    var elChkSemuaTokoProduk = document.getElementById('chkSemuaTokoProduk');
    var elPanelBersihkanDuplikat = document.getElementById('panelBersihkanDuplikat');
    var elOverlayDuplikatProduk = document.getElementById('overlayDuplikatProduk');
    var elJudulDuplikatProduk = document.getElementById('judulDuplikatProduk');
    var elRingkasDuplikatProduk = document.getElementById('ringkasDuplikatProduk');
    var elDaftarGrupDuplikat = document.getElementById('daftarGrupDuplikat');
    var elBtnTutupDuplikatProduk = document.getElementById('btnTutupDuplikatProduk');
    var elBtnKonfirmasiDuplikatProduk = document.getElementById('btnKonfirmasiDuplikatProduk');
    var elInCariProduk = document.getElementById('inCariProduk');
    var elOverlayFormProduk = document.getElementById('overlayFormProduk');
    var elJudulFormProduk = document.getElementById('judulFormProduk');
    var elFormProdukKode = document.getElementById('formProdukKode');
    var elFormProdukBarcode = document.getElementById('formProdukBarcode');
    var elFormProdukKategori = document.getElementById('formProdukKategori');
    var elFormProdukNama = document.getElementById('formProdukNama');
    var elFormProdukKeterangan = document.getElementById('formProdukKeterangan');
    var elFormProdukHargaBeli = document.getElementById('formProdukHargaBeli');
    var elFormProdukHargaJual = document.getElementById('formProdukHargaJual');
    var elFormProdukStok = document.getElementById('formProdukStok');
    var elFormProdukIzinkanMinus = document.getElementById('formProdukIzinkanMinus');
    var elFormProdukAktif = document.getElementById('formProdukAktif');
    var elBtnSimpanProduk = document.getElementById('btnSimpanProduk');
    var elBbPilihBahan = document.getElementById('bbPilihBahan');
    var elBbQtyBahan = document.getElementById('bbQtyBahan');
    var elBtnTambahBahan = document.getElementById('btnTambahBahan');
    var elBbDaftarBahan = document.getElementById('bbDaftarBahan');
    var elBbTotalHpp = document.getElementById('bbTotalHpp');
    var elBtnJadikanHpp = document.getElementById('btnJadikanHpp');

    /** Sama alasan dgn helper senama di Kasir Desktop -- `type="number"` diam-diam menolak keystroke di sebagian lingkungan Android/WebView. */
    function jadikanInputAngka(el) {
        el.addEventListener('input', function () {
            var bersih = el.value.replace(/[^0-9]/g, '');
            if (bersih !== el.value) el.value = bersih;
        });
    }
    [elFormProdukHargaBeli, elFormProdukHargaJual, elFormProdukStok].forEach(jadikanInputAngka);

    var daftarProdukAdmin = [];
    var daftarKategoriAdmin = [];
    var stateProdukAdmin = { page: 1, pageSize: 20 };

    /** Chart batang horizontal ranked, pola sama persis dgn buatBarHorizontalSo (Stok Opname). @param {HTMLElement} container @param {Array<{label:string,jumlah:number}>} data */
    function buatBarHorizontalProduk(container, data) {
        container.innerHTML = '';
        if (!data || data.length === 0) { container.innerHTML = '<div class="layar-kosong">Belum ada data.</div>'; return; }
        var maks = Math.max.apply(null, data.map(function (d) { return d.jumlah; })) || 1;
        data.forEach(function (d, i) {
            var baris = document.createElement('div');
            baris.className = 'baris-bar';
            baris.innerHTML = '<div class="peringkat"></div><div class="nama"></div><div class="batang-wrap"><div class="batang"></div></div><div class="nilai"></div>';
            baris.querySelector('.peringkat').textContent = String(i + 1);
            baris.querySelector('.nama').textContent = d.label;
            baris.querySelector('.batang').style.width = Math.max(4, Math.round((d.jumlah / maks) * 100)) + '%';
            baris.querySelector('.nilai').textContent = d.jumlah;
            container.appendChild(baris);
        });
    }

    async function muatStatistikProduk() {
        try {
            var r = await AisApi.panggil('produk_statistik', {});
            if (r.status !== 'success') return;
            document.getElementById('kpiTotalProduk').textContent = String(r.totalProduk || 0);
            document.getElementById('kpiProdukAktif').textContent = String(r.totalAktif || 0);
            document.getElementById('kpiProdukNonaktif').textContent = String(r.totalNonaktif || 0);
            document.getElementById('kpiStokHabis').textContent = String(r.stokHabis || 0);
            document.getElementById('kpiStokRendah').textContent = String(r.stokRendah || 0);
            document.getElementById('kpiNilaiStok').textContent = formatRupiah(r.totalNilaiStok || 0);
            buatBarHorizontalProduk(document.getElementById('barKategoriProduk'), r.byKategori || []);
            buatBarHorizontalProduk(document.getElementById('barPemasokProduk'), r.byPemasok || []);
            buatBarHorizontalProduk(document.getElementById('barHargaProduk'), r.byHarga || []);
        } catch (e) { /* dasbor statistik gagal muat bukan blocker -- katalog produk tetap tampil normal */ }
    }

    function formatWaktuCacheProduk(iso) {
        if (!iso) return null;
        var d = new Date(iso);
        if (isNaN(d.getTime())) return null;
        var p = function (n) { return String(n).padStart(2, '0'); };
        return p(d.getDate()) + '-' + p(d.getMonth() + 1) + '-' + d.getFullYear() + ' ' + p(d.getHours()) + ':' + p(d.getMinutes());
    }

    async function muatRingkasanCacheProduk() {
        if (!elInfoCacheProduk || !window.ProdukCache) return;
        try {
            var r = await ProdukCache.ringkasanProdukCache();
            var waktu = formatWaktuCacheProduk(r.disinkronPada);
            elInfoCacheProduk.textContent = r.total > 0
                ? ('\u{1F4E6} ' + r.total + ' produk tersimpan di cache lokal (dipakai saat offline)' + (waktu ? ' -- terakhir disinkron ' + waktu : '.'))
                : '\u{1F4E6} Belum ada cache lokal -- ketuk tombol sinkron di kanan atas.';
        } catch (e) { /* status cache gagal dimuat bukan blocker */ }
    }

    if (elBtnSinkronProdukCache) {
        elBtnSinkronProdukCache.addEventListener('click', async function () {
            elBtnSinkronProdukCache.disabled = true;
            var teksAsli = elBtnSinkronProdukCache.innerHTML;
            elBtnSinkronProdukCache.innerHTML = '&#8987;';
            try {
                var r = await ProdukCache.sinkronkanKatalogProdukManual();
                if (r.ok) {
                    toast('success', 'Cache lokal diperbarui -- ' + r.total + ' produk tersimpan.');
                    muatRingkasanCacheProduk();
                } else {
                    toast('error', r.pesan || 'Gagal menyinkronkan cache lokal.');
                }
            } catch (e) {
                toast('error', 'Gagal menyinkronkan: ' + (e && e.message ? e.message : e));
            } finally {
                elBtnSinkronProdukCache.disabled = false;
                elBtnSinkronProdukCache.innerHTML = teksAsli;
            }
        });
    }
    var idProdukDiubah = null;
    var cariProdukTimer = null;

    function isiDropdownKategoriProduk() {
        elFormProdukKategori.innerHTML = '<option value="">-- Tanpa Kategori --</option>';
        daftarKategoriAdmin.forEach(function (k) {
            var opt = document.createElement('option');
            opt.value = k.id; opt.textContent = k.nama;
            elFormProdukKategori.appendChild(opt);
        });
    }

    function renderDaftarProdukAdmin() {
        if (!bolehKelolaProduk()) {
            elIsiProduk.innerHTML = '<div class="layar-blokir"><span class="ico">&#128274;</span>Hanya supervisor toko atau admin/manager yang dapat mengelola katalog barang.<br>Hubungi supervisor toko Anda bila perlu menambah/mengubah produk.</div>';
            return;
        }
        if (!daftarProdukAdmin.length) {
            elIsiProduk.innerHTML = '<div class="layar-kosong">Belum ada produk. Ketuk tombol + di kanan atas untuk mulai.</div>';
            return;
        }
        var totalHalProduk = Math.max(1, Math.ceil(daftarProdukAdmin.length / stateProdukAdmin.pageSize));
        if (stateProdukAdmin.page > totalHalProduk) stateProdukAdmin.page = totalHalProduk;
        var awalProduk = (stateProdukAdmin.page - 1) * stateProdukAdmin.pageSize;
        var halamanIniProduk = daftarProdukAdmin.slice(awalProduk, awalProduk + stateProdukAdmin.pageSize);
        var semuaTokoAktifProduk = !!(elChkSemuaTokoProduk && elChkSemuaTokoProduk.checked);
        elIsiProduk.innerHTML = halamanIniProduk.map(function (p) {
            var badgeStok = p.stok <= 0 ? '<span class="badge-stok habis">Habis</span>'
                : (p.stok <= 5 ? '<span class="badge-stok rendah">Sisa ' + p.stok + '</span>' : '');
            var badgeStatus = p.aktif === false ? '<span class="lencana-status pending">Non-Aktif</span>' : '<span class="lencana-status synced">Aktif</span>';
            var badgeToko = semuaTokoAktifProduk
                ? (' &middot; ' + (p.tokoIdProduk == null ? '<span class="lencana-status pending">Toko Null</span>' : escapeHtml(p.tokoNamaProduk || '-')))
                : '';
            return '<div class="baris-produk-item" data-id="' + p.id + '">'
                + '<div class="info"><div class="nama">' + escapeHtml(p.nama) + '</div>'
                + '<div class="meta">' + escapeHtml(p.kode) + (p.barcode ? (' &middot; BC: ' + escapeHtml(p.barcode)) : '') + (p.kategoriNama ? ' &middot; ' + escapeHtml(p.kategoriNama) : '') + badgeToko + '</div>'
                + '<div class="meta">' + badgeStatus + ' ' + badgeStok + '</div></div>'
                + '<div class="harga">' + formatRupiah(p.hargaJual) + '</div>'
                + '<button type="button" class="btn-kecil-outline ubah-produk-admin" data-id="' + p.id + '">Ubah</button>'
                + '</div>';
        }).join('') + '<div class="paginasi-lt">'
            + '<span>Hal ' + stateProdukAdmin.page + '/' + totalHalProduk + ' (' + daftarProdukAdmin.length + ' produk)</span>'
            + '<button type="button" id="btnProdukAdminHalSebelumnya"' + (stateProdukAdmin.page <= 1 ? ' disabled' : '') + '>&#8249; Sebelumnya</button>'
            + '<button type="button" id="btnProdukAdminHalBerikutnya"' + (stateProdukAdmin.page >= totalHalProduk ? ' disabled' : '') + '>Berikutnya &#8250;</button>'
            + '</div>';
        elIsiProduk.querySelectorAll('.ubah-produk-admin').forEach(function (btn) {
            btn.addEventListener('click', function () {
                var id = btn.getAttribute('data-id');
                bukaFormUbahProduk(daftarProdukAdmin.filter(function (p) { return String(p.id) === id; })[0]);
            });
        });
        var elProdukSebelumnya = document.getElementById('btnProdukAdminHalSebelumnya');
        var elProdukBerikutnya = document.getElementById('btnProdukAdminHalBerikutnya');
        if (elProdukSebelumnya) elProdukSebelumnya.addEventListener('click', function () { if (stateProdukAdmin.page > 1) { stateProdukAdmin.page--; renderDaftarProdukAdmin(); } });
        if (elProdukBerikutnya) elProdukBerikutnya.addEventListener('click', function () { if (stateProdukAdmin.page < totalHalProduk) { stateProdukAdmin.page++; renderDaftarProdukAdmin(); } });
    }

    async function muatDaftarProduk(keyword) {
        elBtnTambahProduk.style.display = bolehKelolaProduk() ? 'flex' : 'none';
        elBtnUnduhExcelProduk.style.display = bolehKelolaProduk() ? 'flex' : 'none';
        elBtnUnggahExcelProduk.style.display = bolehKelolaProduk() ? 'flex' : 'none';
        elBtnHitungUlangStok.style.display = bolehKelolaProduk() ? 'flex' : 'none';
        elCariProdukWrap.style.display = bolehKelolaProduk() ? 'block' : 'none';
        if (elWrapChkSemuaTokoProduk) elWrapChkSemuaTokoProduk.style.display = bolehKelolaProduk() ? 'flex' : 'none';
        if (elPanelBersihkanDuplikat) elPanelBersihkanDuplikat.style.display = bolehKelolaProduk() ? 'block' : 'none';
        if (!bolehKelolaProduk()) { renderDaftarProdukAdmin(); return; }
        if (!keyword) { muatStatistikProduk(); muatRingkasanCacheProduk(); }
        elIsiProduk.innerHTML = '<div class="layar-kosong">Memuat...</div>';
        try {
            var semuaTokoProduk = !!(elChkSemuaTokoProduk && elChkSemuaTokoProduk.checked);
            var r = await AisApi.panggil('katalog', { keyword: keyword || undefined, semuaToko: semuaTokoProduk });
            if (r.status !== 'success') { elIsiProduk.innerHTML = '<div class="layar-kosong">' + escapeHtml(pesanDariHasil(r, 'Gagal memuat katalog.')) + '</div>'; return; }
            daftarProdukAdmin = r.produk || [];
            daftarKategoriAdmin = r.kategori || [];
            stateProdukAdmin.page = 1;
            isiDropdownKategoriProduk();
            renderDaftarProdukAdmin();
        } catch (e) {
            elIsiProduk.innerHTML = '<div class="layar-kosong">Gagal memuat: ' + escapeHtml(e && e.message ? e.message : e) + '</div>';
        }
    }
    if (elChkSemuaTokoProduk) {
        elChkSemuaTokoProduk.addEventListener('change', function () {
            stateProdukAdmin.page = 1;
            muatDaftarProduk(elInCariProduk ? elInCariProduk.value.trim() : '');
        });
    }

    // ---- Bersihkan Produk Duplikat (gap-closure, supervisor/admin saja -- gerbang server juga) ----

    var NAMA_JENIS_DUPLIKAT = { kode: 'Kode', barcode: 'Barcode', nama: 'Nama Produk', kode_barcode: 'Kode + Barcode', kode_barcode_nama: 'Kode + Barcode + Nama' };
    var jenisDuplikatAktif = null;
    var grupDuplikatAktif = [];

    function tutupModalDuplikat() {
        elOverlayDuplikatProduk.classList.remove('tampil');
        jenisDuplikatAktif = null;
        grupDuplikatAktif = [];
    }
    if (elBtnTutupDuplikatProduk) elBtnTutupDuplikatProduk.addEventListener('click', tutupModalDuplikat);
    if (elOverlayDuplikatProduk) elOverlayDuplikatProduk.addEventListener('click', function (e) { if (e.target === elOverlayDuplikatProduk) tutupModalDuplikat(); });

    function renderModalDuplikat() {
        if (grupDuplikatAktif.length === 0) {
            elRingkasDuplikatProduk.innerHTML = '<span style="color:var(--success);font-weight:700;">&#10003; Tidak ada produk duplikat ditemukan berdasarkan ' + NAMA_JENIS_DUPLIKAT[jenisDuplikatAktif] + ' di toko ini.</span>';
            elDaftarGrupDuplikat.innerHTML = '';
            elBtnKonfirmasiDuplikatProduk.style.display = 'none';
            return;
        }
        var totalItem = 0;
        grupDuplikatAktif.forEach(function (g) { totalItem += g.items.length; });
        elRingkasDuplikatProduk.innerHTML = '<b>' + grupDuplikatAktif.length + ' grup</b> duplikat (' + totalItem + ' baris terlibat). Baris yang sudah punya transaksi selalu diprioritaskan sbg penyintas.';
        elBtnKonfirmasiDuplikatProduk.style.display = 'block';
        var html = '';
        grupDuplikatAktif.forEach(function (g) {
            var idsSort = g.items.map(function (it) { return it.id; }).slice().sort(function (a, b) { return a - b; });
            var idsPunyaTrx = g.items.filter(function (it) { return it.jumlahTransaksi > 0; }).map(function (it) { return it.id; }).sort(function (a, b) { return a - b; });
            var survivorId = idsPunyaTrx.length > 0 ? idsPunyaTrx[0] : idsSort[0];
            html += '<div style="border:1px solid var(--border);border-radius:10px;padding:9px 10px;margin-bottom:8px;">'
                + '<div style="font-size:10.5px;font-weight:800;color:var(--muted);margin-bottom:6px;">Kunci: ' + escapeHtml(g.kunci) + '</div>'
                + g.items.map(function (it) {
                    var selamat = it.id === survivorId;
                    return '<div style="display:flex;justify-content:space-between;align-items:center;padding:3px 0;font-size:11.5px;' + (selamat ? 'background:var(--bg);' : '') + '">'
                        + '<span>#' + it.id + ' &middot; ' + escapeHtml(it.kode) + ' &middot; ' + escapeHtml(it.nama) + ' (' + it.jumlahTransaksi + ' trx)</span>'
                        + '<span style="font-weight:800;color:' + (selamat ? 'var(--success)' : 'var(--danger)') + ';">' + (selamat ? 'Disimpan' : 'Dihapus') + '</span>'
                        + '</div>';
                }).join('')
                + '</div>';
        });
        elDaftarGrupDuplikat.innerHTML = html;
    }

    async function bukaModalDuplikat(jenis) {
        jenisDuplikatAktif = jenis;
        elJudulDuplikatProduk.textContent = 'Pratinjau Duplikat: ' + NAMA_JENIS_DUPLIKAT[jenis];
        elRingkasDuplikatProduk.innerHTML = 'Memuat...';
        elDaftarGrupDuplikat.innerHTML = '';
        elBtnKonfirmasiDuplikatProduk.style.display = 'none';
        elOverlayDuplikatProduk.classList.add('tampil');
        try {
            // Timeout dinaikkan (2 menit, bukan default 20 detik) -- query pencarian grup duplikat
            // (self-join+subquery per baris) bisa lama pada toko dgn puluhan ribu produk, dan gagal
            // palsu terlihat sbg "Tidak Ada Koneksi" walau sebenarnya cuma server lambat merespons.
            var r = await AisApi.panggil('produk_duplikat_cari', { jenis: jenis }, 120000);
            if (r.status !== 'success') { toast('error', pesanDariHasil(r, 'Gagal memuat pratinjau duplikat.')); tutupModalDuplikat(); return; }
            grupDuplikatAktif = r.grup || [];
            renderModalDuplikat();
        } catch (e) {
            toast('error', 'Gagal memuat pratinjau duplikat: ' + (e && e.message ? e.message : e));
            tutupModalDuplikat();
        }
    }

    var elBtnDuplikatKode = document.getElementById('btnDuplikatKode');
    var elBtnDuplikatBarcode = document.getElementById('btnDuplikatBarcode');
    var elBtnDuplikatNama = document.getElementById('btnDuplikatNama');
    var elBtnDuplikatKodeBarcode = document.getElementById('btnDuplikatKodeBarcode');
    var elBtnDuplikatKodeBarcodeNama = document.getElementById('btnDuplikatKodeBarcodeNama');
    if (elBtnDuplikatKode) elBtnDuplikatKode.addEventListener('click', function () { bukaModalDuplikat('kode'); });
    if (elBtnDuplikatBarcode) elBtnDuplikatBarcode.addEventListener('click', function () { bukaModalDuplikat('barcode'); });
    if (elBtnDuplikatNama) elBtnDuplikatNama.addEventListener('click', function () { bukaModalDuplikat('nama'); });
    if (elBtnDuplikatKodeBarcode) elBtnDuplikatKodeBarcode.addEventListener('click', function () { bukaModalDuplikat('kode_barcode'); });
    if (elBtnDuplikatKodeBarcodeNama) elBtnDuplikatKodeBarcodeNama.addEventListener('click', function () { bukaModalDuplikat('kode_barcode_nama'); });

    if (elBtnKonfirmasiDuplikatProduk) {
        elBtnKonfirmasiDuplikatProduk.addEventListener('click', async function () {
            if (!jenisDuplikatAktif) return;
            var totalItem = 0;
            grupDuplikatAktif.forEach(function (g) { totalItem += g.items.length; });
            var jumlahAkanDihapus = totalItem - grupDuplikatAktif.length;
            if (!confirm('Yakin hapus ' + jumlahAkanDihapus + ' baris produk duplikat (berdasarkan ' + NAMA_JENIS_DUPLIKAT[jenisDuplikatAktif] + ')? Transaksi pada baris yang dihapus akan digabungkan ke baris yang disimpan. Tindakan ini TIDAK BISA dibatalkan.')) return;
            elBtnKonfirmasiDuplikatProduk.disabled = true;
            var teksAsli = elBtnKonfirmasiDuplikatProduk.textContent;
            elBtnKonfirmasiDuplikatProduk.textContent = 'Memproses...';
            try {
                var r = await AisApi.panggil('produk_duplikat_hapus', { jenis: jenisDuplikatAktif }, 120000);
                if (r.status !== 'success') { toast('error', pesanDariHasil(r, 'Gagal membersihkan duplikat.')); return; }
                toast('success', r.produkDihapus + ' baris duplikat dihapus (' + r.grupDigabungTransaksi + ' grup transaksinya digabungkan).');
                tutupModalDuplikat();
                muatDaftarProduk(elInCariProduk ? elInCariProduk.value.trim() : '');
            } catch (e) {
                toast('error', 'Gagal membersihkan duplikat: ' + (e && e.message ? e.message : e));
            } finally {
                elBtnKonfirmasiDuplikatProduk.disabled = false;
                elBtnKonfirmasiDuplikatProduk.textContent = teksAsli;
            }
        });
    }

    // ---- Hitung Ulang Stok (Fase gap-closure Android) ----
    // Server: stok_hitung_ulang -- SUDAH ADA & dipakai Desktop (lihat produk-renderer.js
    // elBtnHitungUlangStok). Backfill selisih stok_opname yg NULL/salah + recompute stok semua produk
    // toko ini -- dipakai kalau stok "kelihatan aneh" (mis. sisa transisi bug getter terkomputasi lama).
    elBtnHitungUlangStok.addEventListener('click', async function () {
        if (!confirm('Hitung ulang stok seluruh produk di toko ini sekarang?\n\nProses ini memperbaiki data stok yang tidak sesuai (mis. akibat riwayat opname yang belum tersimpan benar) dan menghitung ulang stok setiap produk dari catatan transaksi. Aman dijalankan kapan saja.')) return;
        elBtnHitungUlangStok.disabled = true;
        try {
            var r = await AisApi.panggil('stok_hitung_ulang', {}, 60000);
            if (r.status !== 'success') { toast('error', pesanDariHasil(r, 'Gagal menghitung ulang stok.')); return; }
            toast('success', (r.produkDiproses || 0) + ' produk diproses, ' + (r.selisihDiperbaiki || 0) + ' selisih diperbaiki.');
            muatDaftarProduk(elInCariProduk.value || '');
        } catch (e) {
            toast('error', 'Gagal menghitung ulang stok: ' + (e && e.message ? e.message : e));
        } finally {
            elBtnHitungUlangStok.disabled = false;
        }
    });

    elInCariProduk.addEventListener('input', function () {
        clearTimeout(cariProdukTimer);
        cariProdukTimer = setTimeout(function () { muatDaftarProduk(elInCariProduk.value.trim()); }, 350);
    });

    // ---- Bahan Baku (Resep) & HPP otomatis (gap-closure -- padanan JSP barang/index.jsp, SAMA
    // PERSIS pola & perilaku dgn produk-renderer.js Desktop) ----
    var bahanBakuList = [];

    function isiPilihanBahan(kecualiId) {
        elBbPilihBahan.innerHTML = '<option value="">-- Pilih produk sbg bahan --</option>';
        daftarProdukAdmin.forEach(function (p) {
            if (kecualiId != null && String(p.id) === String(kecualiId)) return;
            var opt = document.createElement('option');
            opt.value = String(p.id);
            opt.textContent = p.nama + ' (' + formatRupiah(p.hargaBeli) + ')';
            opt.setAttribute('data-nama', p.nama);
            opt.setAttribute('data-harga', String(Number(p.hargaBeli) || 0));
            elBbPilihBahan.appendChild(opt);
        });
    }

    function hitungTotalHpp() {
        return bahanBakuList.reduce(function (s, it) { return s + (Number(it.qty) || 0) * (Number(it.harga) || 0); }, 0);
    }

    function renderDaftarBahan() {
        if (bahanBakuList.length === 0) {
            elBbDaftarBahan.innerHTML = '<div style="font-size:11.5px;color:var(--faint);padding:6px 0;">Belum ada bahan baku ditambahkan.</div>';
        } else {
            elBbDaftarBahan.innerHTML = bahanBakuList.map(function (it, i) {
                return '<div class="baris-bahan" data-idx="' + i + '"><span class="nama">' + escapeHtml(it.nama) + '</span>'
                    + '<span class="qty">x ' + it.qty + '</span><span class="subtotal">' + formatRupiah((Number(it.qty) || 0) * (Number(it.harga) || 0)) + '</span>'
                    + '<button type="button" class="btn-hapus-bahan" data-idx="' + i + '">&#10005;</button></div>';
            }).join('');
            elBbDaftarBahan.querySelectorAll('.btn-hapus-bahan').forEach(function (btn) {
                btn.addEventListener('click', function () {
                    bahanBakuList.splice(parseInt(btn.getAttribute('data-idx'), 10), 1);
                    renderDaftarBahan();
                });
            });
        }
        elBbTotalHpp.textContent = formatRupiah(hitungTotalHpp());
    }

    elBtnTambahBahan.addEventListener('click', function () {
        var opt = elBbPilihBahan.options[elBbPilihBahan.selectedIndex];
        if (!opt || !opt.value) { toast('error', 'Pilih produk bahan baku terlebih dahulu.'); return; }
        var qty = parseFloat(elBbQtyBahan.value.replace(',', '.'));
        if (!qty || qty <= 0) { toast('error', 'Isi qty bahan baku (angka lebih dari 0).'); elBbQtyBahan.focus(); return; }
        var produkId = Number(opt.value);
        var existing = bahanBakuList.filter(function (it) { return it.produk === produkId; })[0];
        if (existing) {
            existing.qty = (Number(existing.qty) || 0) + qty;
        } else {
            bahanBakuList.push({ produk: produkId, nama: opt.getAttribute('data-nama'), qty: qty, harga: Number(opt.getAttribute('data-harga')) || 0 });
        }
        elBbQtyBahan.value = '';
        elBbPilihBahan.value = '';
        renderDaftarBahan();
    });

    elBtnJadikanHpp.addEventListener('click', function () {
        elFormProdukHargaBeli.value = String(Math.round(hitungTotalHpp()));
        toast('success', 'Harga Beli diisi dari total HPP -- ' + formatRupiah(hitungTotalHpp()) + '.');
    });

    function resetFormProduk() {
        elFormProdukKode.value = '';
        elFormProdukBarcode.value = '';
        elFormProdukKategori.value = '';
        elFormProdukNama.value = '';
        elFormProdukKeterangan.value = '';
        elFormProdukHargaBeli.value = '0';
        elFormProdukHargaJual.value = '0';
        elFormProdukStok.value = '0';
        elFormProdukIzinkanMinus.checked = false;
        elFormProdukAktif.checked = true;
        bahanBakuList = [];
        renderDaftarBahan();
    }

    function bukaFormTambahProduk() {
        idProdukDiubah = null;
        elJudulFormProduk.textContent = 'Tambah Produk';
        resetFormProduk();
        isiPilihanBahan(null);
        elOverlayFormProduk.classList.add('tampil');
        elFormProdukKode.focus();
    }

    function bukaFormUbahProduk(p) {
        if (!p) return;
        idProdukDiubah = p.id;
        elJudulFormProduk.textContent = 'Ubah: ' + p.nama;
        resetFormProduk();
        elFormProdukKode.value = p.kode || '';
        elFormProdukBarcode.value = p.barcode || '';
        elFormProdukKategori.value = p.kategoriId != null ? String(p.kategoriId) : '';
        elFormProdukNama.value = p.nama || '';
        elFormProdukKeterangan.value = p.keterangan || '';
        elFormProdukHargaBeli.value = String(Math.round(Number(p.hargaBeli) || 0));
        elFormProdukHargaJual.value = String(Math.round(Number(p.hargaJual) || 0));
        elFormProdukStok.value = String(Math.round(Number(p.stok) || 0));
        // Bug lama: field ini tidak pernah diisi ulang dari data server, jadi resetFormProduk() di atas
        // (yang default-nya false) diam-diam TERPAKAI sebagai nilai simpan setiap kali produk diedit --
        // pengaturan "boleh dijual walau stok minus" yang sudah diaktifkan admin jadi mati sendiri tanpa
        // disadari. Field izinkanJualMinusStok baru dikirim server mulai perbaikan ini (lihat
        // PosApi.java prosesKatalog) -- fallback tetap false untuk katalog dari cache lama/offline.
        elFormProdukIzinkanMinus.checked = p.izinkanJualMinusStok === true;
        elFormProdukAktif.checked = p.aktif !== false;
        isiPilihanBahan(p.id);
        bahanBakuList = Array.isArray(p.bahanBaku) ? p.bahanBaku.map(function (it) { return { produk: it.produk, nama: it.nama, qty: it.qty, harga: it.harga }; }) : [];
        renderDaftarBahan();
        elOverlayFormProduk.classList.add('tampil');
        elFormProdukKode.focus();
    }

    elBtnTambahProduk.addEventListener('click', function () { if (bolehKelolaProduk()) bukaFormTambahProduk(); });
    document.getElementById('btnTutupFormProduk').addEventListener('click', function () { elOverlayFormProduk.classList.remove('tampil'); });

    // =====================================================================
    // ==== Cetak Price Tag / POP (gap-closure), padanan JSP barang/pricetag.jsp -- TIDAK digerbang
    // bolehKelolaProduk() (semua yg login boleh cetak label harga, sama spt Desktop). WebView Android
    // tidak punya padanan webContents.print() Electron (tak bisa pilih printer/kertas dari dalam app),
    // jadi label digambar ke <canvas> (barcode via JsBarcode langsung ke canvas -- lebih simpel dari
    // rute SVG Desktop) lalu diekspor PNG & disimpan via plugin Filesystem yang SUDAH dipakai fitur
    // unduh PDF/Excel lain di file ini (pola sama, folder DOCUMENTS lalu fallback CACHE) -- pengguna
    // buka Galeri/Berkas utk mencetak/membagikan dari sana, BUKAN dialog cetak langsung dari sini.
    // =====================================================================
    var elOverlayPriceTag = document.getElementById('overlayPriceTag');
    var elBtnCetakPriceTag = document.getElementById('btnCetakPriceTag');
    var elBtnTutupPriceTag = document.getElementById('btnTutupPriceTag');
    var elPtCariProduk = document.getElementById('ptCariProduk');
    var elPtPilihSemua = document.getElementById('ptPilihSemua');
    var elPtJumlahDipilih = document.getElementById('ptJumlahDipilih');
    var elPtDaftarProduk = document.getElementById('ptDaftarProduk');
    var elPtJenisCetak = document.getElementById('ptJenisCetak');
    var elPtOpsiPop = document.getElementById('ptOpsiPop');
    var elPtUkuranBtns = document.querySelectorAll('.pt-ukuran-btn');
    var elPtLabelPerHalaman = document.getElementById('ptLabelPerHalaman');
    var elPtCopies = document.getElementById('ptCopies');
    var elPtPromo = document.getElementById('ptPromo');
    var elPtTampilBarcode = document.getElementById('ptTampilBarcode');
    var elPtTampilKode = document.getElementById('ptTampilKode');
    var elPtTampilToko = document.getElementById('ptTampilToko');
    var elPtCanvasWrap = document.getElementById('ptCanvasWrap');
    var elBtnBuatPriceTag = document.getElementById('btnBuatPriceTag');

    var daftarProdukPriceTag = [];
    var idTerpilihPriceTag = {};
    var jumlahTerpilihPriceTag = 0;
    var ukuranTerpilihPriceTag = 'A4';

    async function bukaModalPriceTag() {
        elOverlayPriceTag.classList.add('tampil');
        elPtCanvasWrap.style.display = 'none';
        elPtCanvasWrap.innerHTML = '';
        elPtDaftarProduk.innerHTML = '<div class="layar-kosong">Memuat...</div>';
        idTerpilihPriceTag = {};
        jumlahTerpilihPriceTag = 0;
        elPtPilihSemua.checked = false;
        elPtJumlahDipilih.textContent = '0 dipilih';
        try {
            var r = await AisApi.panggil('price_tag_list_produk', {});
            if (r.status !== 'success') {
                toast('error', pesanDariHasil(r, 'Gagal memuat produk.'));
                elPtDaftarProduk.innerHTML = '<div class="layar-kosong">Gagal memuat.</div>';
                return;
            }
            daftarProdukPriceTag = r.data || [];
            renderDaftarPriceTag();
        } catch (e) {
            elPtDaftarProduk.innerHTML = '<div class="layar-kosong">Gagal memuat: ' + escapeHtml(e && e.message ? e.message : e) + '</div>';
        }
    }
    elBtnCetakPriceTag.addEventListener('click', bukaModalPriceTag);
    elBtnTutupPriceTag.addEventListener('click', function () { elOverlayPriceTag.classList.remove('tampil'); });

    function daftarPriceTagTerfilter() {
        var kw = elPtCariProduk.value.trim().toLowerCase();
        if (!kw) return daftarProdukPriceTag;
        return daftarProdukPriceTag.filter(function (p) { return p.nama.toLowerCase().indexOf(kw) >= 0 || p.kode.toLowerCase().indexOf(kw) >= 0 || (p.barcode || '').toLowerCase().indexOf(kw) >= 0; });
    }

    function renderDaftarPriceTag() {
        var tampil = daftarPriceTagTerfilter();
        if (tampil.length === 0) {
            elPtDaftarProduk.innerHTML = '<div class="layar-kosong">Tidak ada produk yang cocok.</div>';
        } else {
            elPtDaftarProduk.innerHTML = tampil.map(function (p) {
                return '<div class="pt-item-pilih" data-id="' + p.id + '"><input type="checkbox" ' + (idTerpilihPriceTag[p.id] ? 'checked' : '') + '>'
                    + '<div class="info" style="flex:1;"><div class="nama">' + escapeHtml(p.nama) + '</div></div>'
                    + '<div class="harga">' + formatRupiah(p.hargaJual) + '</div></div>';
            }).join('');
            elPtDaftarProduk.querySelectorAll('.pt-item-pilih').forEach(function (el) {
                el.addEventListener('click', function () {
                    var id = el.getAttribute('data-id');
                    if (idTerpilihPriceTag[id]) delete idTerpilihPriceTag[id]; else idTerpilihPriceTag[id] = true;
                    renderDaftarPriceTag();
                });
            });
        }
        jumlahTerpilihPriceTag = Object.keys(idTerpilihPriceTag).length;
        elPtJumlahDipilih.textContent = jumlahTerpilihPriceTag + ' dipilih';
        elPtPilihSemua.checked = tampil.length > 0 && tampil.every(function (p) { return !!idTerpilihPriceTag[p.id]; });
    }
    elPtCariProduk.addEventListener('input', renderDaftarPriceTag);
    elPtPilihSemua.addEventListener('change', function () {
        var tampil = daftarPriceTagTerfilter();
        tampil.forEach(function (p) { if (elPtPilihSemua.checked) idTerpilihPriceTag[p.id] = true; else delete idTerpilihPriceTag[p.id]; });
        renderDaftarPriceTag();
    });
    elPtUkuranBtns.forEach(function (btn) {
        btn.addEventListener('click', function () {
            elPtUkuranBtns.forEach(function (b) { b.classList.remove('aktif'); });
            btn.classList.add('aktif');
            ukuranTerpilihPriceTag = btn.getAttribute('data-ukuran');
        });
    });

    // "Ukuran Kertas"/"Label per Baris" HANYA relevan utk template "pop" -- "sticker"/"textlabel"
    // punya tata letak tetap sendiri (5 kolom / 2 kolom), sama persis perilaku ptTplChange() JSP.
    elPtJenisCetak.addEventListener('change', function () {
        elPtOpsiPop.style.display = elPtJenisCetak.value === 'pop' ? 'block' : 'none';
    });

    var PT_BASE_TAG = { A2: { w: 640, h: 460 }, A4: { w: 460, h: 340 }, A5: { w: 340, h: 250 } };
    var PT_PER_SCALE = { 1: 1.0, 2: 0.75, 4: 0.55 };
    var PT_PER_COLS = { 1: 1, 2: 1, 4: 2 };
    var PT_GAP = 16, PT_MARGIN = 20;

    /** Potong teks bila lebih lebar dari maxW, tambah "..." -- ukuran font mengikuti ctx.font yg sudah diset pemanggil. */
    function potongTeksCanvas(ctx, teks, maxW) {
        if (ctx.measureText(teks).width <= maxW) return teks;
        var potong = teks;
        while (potong.length > 1 && ctx.measureText(potong + '...').width > maxW) potong = potong.slice(0, -1);
        return potong + '...';
    }

    function gambarSatuTagCanvas(ctx, x, y, w, h, p, opsi) {
        ctx.save();
        ctx.strokeStyle = '#cbd5e1';
        ctx.setLineDash([6, 4]);
        ctx.lineWidth = 2;
        ctx.strokeRect(x + 1, y + 1, w - 2, h - 2);
        ctx.setLineDash([]);
        ctx.textAlign = 'center';
        var cx = x + w / 2;
        var cy = y + h * 0.16;

        if (opsi.tampilToko && state.tokoNama) {
            ctx.fillStyle = '#64748b';
            ctx.font = '700 ' + Math.round(h * 0.055) + 'px sans-serif';
            ctx.fillText(potongTeksCanvas(ctx, state.tokoNama.toUpperCase(), w * 0.85), cx, cy);
            cy += h * 0.09;
        }
        if (opsi.promo) {
            ctx.fillStyle = '#dc2626';
            ctx.font = '800 ' + Math.round(h * 0.065) + 'px sans-serif';
            ctx.fillText(potongTeksCanvas(ctx, opsi.promo, w * 0.85), cx, cy);
            cy += h * 0.1;
        }
        ctx.fillStyle = '#1e293b';
        ctx.font = '700 ' + Math.round(h * 0.085) + 'px sans-serif';
        ctx.fillText(potongTeksCanvas(ctx, p.nama, w * 0.88), cx, cy + h * 0.05);
        cy += h * 0.15;

        ctx.fillStyle = '#2563eb';
        ctx.font = '800 ' + Math.round(h * 0.13) + 'px sans-serif';
        ctx.fillText(formatRupiah(p.hargaJual), cx, cy + h * 0.08);
        cy += h * 0.2;

        if (opsi.tampilBarcode && p.kode && typeof JsBarcode !== 'undefined') {
            try {
                var bcCanvas = document.createElement('canvas');
                JsBarcode(bcCanvas, p.kode, { format: 'CODE128', displayValue: false, margin: 0, height: Math.round(h * 0.12) });
                var bcW = Math.min(w * 0.75, bcCanvas.width);
                var bcH = bcCanvas.height * (bcW / bcCanvas.width);
                ctx.drawImage(bcCanvas, cx - bcW / 2, cy, bcW, bcH);
                cy += bcH + 6;
            } catch (eBc) { /* kode tak valid utk CODE128 -- lewati, teks kode tetap tampil terpisah */ }
        }
        if (opsi.tampilKode && p.kode) {
            ctx.fillStyle = '#64748b';
            ctx.font = Math.round(h * 0.045) + 'px monospace';
            ctx.fillText(p.kode, cx, cy + h * 0.035);
        }
        ctx.restore();
    }

    function bangunCanvasPriceTag(produkList, opsi) {
        var base = PT_BASE_TAG[opsi.ukuran];
        var skala = PT_PER_SCALE[opsi.perHalaman];
        var tagW = Math.round(base.w * skala), tagH = Math.round(base.h * skala);
        var cols = PT_PER_COLS[opsi.perHalaman];

        var semuaTag = [];
        produkList.forEach(function (p) { for (var i = 0; i < opsi.copies; i++) semuaTag.push(p); });
        var rows = Math.ceil(semuaTag.length / cols);

        var canvas = document.createElement('canvas');
        canvas.width = PT_MARGIN * 2 + cols * tagW + (cols - 1) * PT_GAP;
        canvas.height = PT_MARGIN * 2 + rows * tagH + (rows - 1) * PT_GAP;
        var ctx = canvas.getContext('2d');
        ctx.fillStyle = '#fff';
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        semuaTag.forEach(function (p, idx) {
            var col = idx % cols, row = Math.floor(idx / cols);
            var x = PT_MARGIN + col * (tagW + PT_GAP), y = PT_MARGIN + row * (tagH + PT_GAP);
            gambarSatuTagCanvas(ctx, x, y, tagW, tagH, p, opsi);
        });
        return canvas;
    }

    /**
     * Template "Stiker Label Warna" (gap-closure) -- padanan visual {@code cetakSticker()} JSP
     * (bar atas merah promo+pil "Rp", pita nama kuning, harga biru, footer barcode+kode), TANPA nama
     * toko (sesuai JSP asli). Kanvas (bukan HTML/CSS spt Desktop) -- selalu 5 kolom, baris mengalir
     * sebanyak produk x salinan yg dipilih (bukan dipotong per-40 spt lembar A4 fisik JSP, krn di sini
     * hasilnya SATU gambar utuh utk dibagikan/disimpan, bukan dicetak halaman-demi-halaman).
     */
    function gambarSatuStikerCanvas(ctx, x, y, w, h, p, opsi) {
        ctx.save();
        ctx.strokeStyle = '#d1d5db';
        ctx.lineWidth = 1;
        ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
        ctx.textAlign = 'center';

        var topH = h * 0.16;
        ctx.fillStyle = '#e11d2a';
        ctx.fillRect(x, y, w, topH);
        ctx.fillStyle = '#fff';
        ctx.font = '800 ' + Math.round(topH * 0.5) + 'px sans-serif';
        ctx.textAlign = 'left';
        ctx.fillText(potongTeksCanvas(ctx, opsi.promo || 'PROMO', w * 0.6), x + 4, y + topH * 0.68);
        ctx.textAlign = 'right';
        ctx.fillStyle = '#e11d2a';
        var rpW = w * 0.16;
        ctx.fillStyle = '#fff';
        ctx.fillRect(x + w - rpW - 3, y + topH * 0.18, rpW, topH * 0.64);
        ctx.fillStyle = '#e11d2a';
        ctx.font = '700 ' + Math.round(topH * 0.42) + 'px sans-serif';
        ctx.fillText('Rp', x + w - 6, y + topH * 0.68);
        ctx.textAlign = 'center';

        var namaY = y + topH;
        var namaH = h * 0.18;
        ctx.fillStyle = '#ffd400';
        ctx.fillRect(x, namaY, w, namaH);
        ctx.fillStyle = '#000';
        ctx.font = '800 ' + Math.round(namaH * 0.55) + 'px sans-serif';
        ctx.fillText(potongTeksCanvas(ctx, p.nama, w * 0.92), x + w / 2, namaY + namaH * 0.68);

        var hargaY = namaY + namaH;
        var hargaH = h * 0.42;
        ctx.fillStyle = '#0033a0';
        ctx.font = '800 ' + Math.round(hargaH * 0.5) + 'px sans-serif';
        ctx.fillText('Rp ' + Math.round(p.hargaJual || 0).toLocaleString('id-ID'), x + w / 2, hargaY + hargaH * 0.62);

        var footY = hargaY + hargaH;
        var footH = h - (footY - y);
        if ((opsi.tampilBarcode || opsi.tampilKode) && footH > 6) {
            if (opsi.tampilBarcode && p.kode && typeof JsBarcode !== 'undefined') {
                try {
                    var bcCanvas = document.createElement('canvas');
                    JsBarcode(bcCanvas, p.kode, { format: 'CODE128', displayValue: false, margin: 0, height: Math.round(footH * 0.8) });
                    var bcW = Math.min(w * 0.55, bcCanvas.width);
                    var bcH = bcCanvas.height * (bcW / bcCanvas.width);
                    ctx.drawImage(bcCanvas, x + 3, footY + (footH - bcH) / 2, bcW, bcH);
                } catch (eBc) { /* abaikan */ }
            }
            if (opsi.tampilKode && p.kode) {
                ctx.fillStyle = '#374151';
                ctx.font = '700 ' + Math.round(footH * 0.42) + 'px sans-serif';
                ctx.textAlign = 'right';
                ctx.fillText(p.kode, x + w - 3, footY + footH * 0.65);
                ctx.textAlign = 'center';
            }
        }
        ctx.restore();
    }

    function bangunCanvasPriceTagSticker(produkList, opsi) {
        var cols = 5, tagW = 180, tagH = 130, gap = 4, margin = 10;
        var semuaTag = [];
        produkList.forEach(function (p) { for (var i = 0; i < opsi.copies; i++) semuaTag.push(p); });
        var rows = Math.ceil(semuaTag.length / cols);
        var canvas = document.createElement('canvas');
        canvas.width = margin * 2 + cols * tagW + (cols - 1) * gap;
        canvas.height = margin * 2 + rows * tagH + (rows - 1) * gap;
        var ctx = canvas.getContext('2d');
        ctx.fillStyle = '#fff';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        semuaTag.forEach(function (p, idx) {
            var col = idx % cols, row = Math.floor(idx / cols);
            var x = margin + col * (tagW + gap), y = margin + row * (tagH + gap);
            gambarSatuStikerCanvas(ctx, x, y, tagW, tagH, p, opsi);
        });
        return canvas;
    }

    /**
     * Template "Label Teks Sederhana" (gap-closure) -- padanan visual {@code cetakTextLabel()} JSP:
     * grid 2 kolom, font serif, daftar teks polos "Nama Produk : X" / "Harga : Rp Y" / kode, tanpa
     * warna/latar. Barcode DILEWATI di kanvas ini (bukan dihilangkan permanen -- serif+ukuran teks
     * kecil di kanvas sempit membuat barcode kecil sulit dipindai; kode teksnya sendiri tetap tampil
     * penuh sbg pengganti yg tetap bisa dibaca/scan manual via pencarian kode di aplikasi).
     */
    function bangunCanvasPriceTagTextLabel(produkList, opsi) {
        var cols = 2, colW = 340, rowH = 92, gap = 14, margin = 16;
        var semuaTag = [];
        produkList.forEach(function (p) { for (var i = 0; i < opsi.copies; i++) semuaTag.push(p); });
        var rows = Math.ceil(semuaTag.length / cols);
        var canvas = document.createElement('canvas');
        canvas.width = margin * 2 + cols * colW + (cols - 1) * gap;
        canvas.height = margin * 2 + rows * rowH + (rows - 1) * gap;
        var ctx = canvas.getContext('2d');
        ctx.fillStyle = '#fff';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.textAlign = 'left';
        ctx.fillStyle = '#111827';
        semuaTag.forEach(function (p, idx) {
            var col = idx % cols, row = Math.floor(idx / cols);
            var x = margin + col * (colW + gap), y = margin + row * (rowH + gap);
            var ty = y + 16;
            if (opsi.tampilToko && state.tokoNama) {
                ctx.font = '700 15px Georgia, serif';
                ctx.fillText(potongTeksCanvas(ctx, state.tokoNama.toUpperCase(), colW), x, ty);
                ty += 20;
            }
            ctx.font = '14px Georgia, serif';
            ctx.fillText('Nama Produk : ' + potongTeksCanvas(ctx, p.nama, colW - 90), x, ty); ty += 19;
            ctx.font = '600 14px Georgia, serif';
            ctx.fillText('Harga : Rp ' + Math.round(p.hargaJual || 0).toLocaleString('id-ID'), x, ty); ty += 19;
            if (opsi.tampilKode && p.kode) { ctx.font = '14px Georgia, serif'; ctx.fillText('Kode : ' + p.kode, x, ty); }
        });
        return canvas;
    }

    elBtnBuatPriceTag.addEventListener('click', async function () {
        var produkTerpilih = daftarProdukPriceTag.filter(function (p) { return !!idTerpilihPriceTag[p.id]; });
        if (produkTerpilih.length === 0) { toast('error', 'Pilih minimal satu produk terlebih dahulu.'); return; }
        var Filesystem = pluginCapacitor('Filesystem');
        if (!Filesystem) { toast('error', 'Fitur simpan gambar tidak tersedia di perangkat ini.'); return; }

        var opsi = {
            ukuran: ukuranTerpilihPriceTag,
            perHalaman: Number(elPtLabelPerHalaman.value),
            copies: Math.max(1, Math.min(50, Number(elPtCopies.value) || 1)),
            promo: elPtPromo.value.trim(),
            tampilBarcode: elPtTampilBarcode.checked,
            tampilKode: elPtTampilKode.checked,
            tampilToko: elPtTampilToko.checked
        };
        var jenis = elPtJenisCetak.value;
        var semulaTeks = elBtnBuatPriceTag.textContent;
        elBtnBuatPriceTag.disabled = true;
        elBtnBuatPriceTag.textContent = 'Membuat gambar...';
        try {
            var canvas = jenis === 'sticker' ? bangunCanvasPriceTagSticker(produkTerpilih, opsi)
                : jenis === 'textlabel' ? bangunCanvasPriceTagTextLabel(produkTerpilih, opsi)
                : bangunCanvasPriceTag(produkTerpilih, opsi);
            elPtCanvasWrap.innerHTML = '';
            elPtCanvasWrap.appendChild(canvas);
            elPtCanvasWrap.style.display = 'block';

            var dataUrl = canvas.toDataURL('image/png');
            var base64 = dataUrl.split(',')[1];
            var namaFile = 'price-tag-' + Date.now() + '.png';
            var direktori = 'DOCUMENTS';
            try { await Filesystem.writeFile({ path: namaFile, data: base64, directory: direktori }); }
            catch (eDir) { direktori = 'CACHE'; await Filesystem.writeFile({ path: namaFile, data: base64, directory: direktori }); }
            toast('success', 'Gambar tersimpan (' + namaFile + ', folder ' + (direktori === 'DOCUMENTS' ? 'Dokumen' : 'internal aplikasi') + '). Buka lewat Galeri/Berkas untuk mencetak/membagikan.');
        } catch (e) {
            toast('error', 'Gagal membuat gambar: ' + (e && e.message ? e.message : e));
        } finally {
            elBtnBuatPriceTag.disabled = false;
            elBtnBuatPriceTag.textContent = semulaTeks;
        }
    });

    // ==== Laporan Impor Katalog (modal + unduh .txt) -- padanan produk-renderer.js Desktop ====
    // Android tidak punya langkah "Tinjau Impor" terpisah (aksi server produk_impor_excel memproses
    // preview+komit sekaligus), jadi kalau sedang OFFLINE laporan cuma bisa bilang "berkas tersimpan,
    // menunggu koneksi" (belum ada detail per-baris -- itu baru diketahui SETELAH server memproses).
    // Begitu server berhasil memproses (baik langsung maupun lewat sinkron latar KatalogImportQueue),
    // field r.baris (detail per-baris, SAMA PERSIS bentuknya dgn laporan Desktop -- lihat JavaDoc
    // server KantinHelper.produkImporExcelKomit) dipakai membangun laporan lengkap.

    var infoLaporanImporAktif = null;

    function buatTeksLaporanImporAndroid(info) {
        var baris = [];
        baris.push('LAPORAN IMPOR KATALOG BARANG');
        baris.push('Diproses: ' + info.waktuProses);
        if (info.idLokal) baris.push('Referensi lokal: ' + info.idLokal);
        baris.push('Berkas: ' + (info.namaBerkas || '-'));
        baris.push('Status: ' + (info.status === 'sinkron' ? 'Berhasil dikirim & diproses server'
            : info.status === 'offline' ? 'Tersimpan lokal di perangkat ini, menunggu koneksi internet'
                : 'Gagal dikirim ke server'));
        if (info.pesan) baris.push('Keterangan: ' + info.pesan);
        baris.push('');
        if (info.ringkasan) {
            var r = info.ringkasan;
            baris.push('RINGKASAN');
            baris.push('- Produk baru dibuat    : ' + (r.dibuat || 0));
            baris.push('- Produk diperbarui     : ' + (r.diperbarui || 0));
            baris.push('- Stok disesuaikan      : ' + (r.stokDiopname || 0));
            baris.push('- Dilewati/gagal        : ' + (r.dilewati || 0));
            baris.push('- Kategori baru dibuat  : ' + (r.kategoriBaru || 0));
            baris.push('- Pemasok baru dibuat   : ' + (r.pemasokBaru || 0));
            baris.push('- Satuan baru dibuat    : ' + (r.satuanBaru || 0));
            if (r.verifikasiGagal) baris.push('- Gagal VERIFIKASI ulang: ' + r.verifikasiGagal + ' (data tersimpan TAK sesuai yg diharapkan -- lihat detail per baris)');
            baris.push('');
        }
        baris.push('DETAIL PER BARIS');
        baris.push('----------------------------------------------------------------------');
        if (info.barisHasil && info.barisHasil.length) {
            info.barisHasil.forEach(function (b) {
                baris.push('#' + b.no + ' [' + (b.status || '').toUpperCase() + '] ' + (b.kode || '-') + ' -- ' + (b.nama || '-'));
                if (b.stokLama != null && b.stokBaru != null) {
                    baris.push('    Stok: ' + b.stokLama + ' -> ' + b.stokBaru
                        + ' (selisih ' + (b.selisih > 0 ? '+' : '') + b.selisih + '), aksi: ' + (b.aksiStok || '-'));
                }
                if (b.pesan) baris.push('    ' + b.pesan);
                if (b.teknis) baris.push('    Detail teknis (penyebab gagal): ' + b.teknis);
                if (b.solusi) baris.push('    Saran perbaikan: ' + b.solusi);
                if (b.catatanVerifikasi) baris.push('    Catatan: ' + b.catatanVerifikasi);
                baris.push('');
            });
        } else {
            baris.push('(Belum ada detail per-baris -- berkas belum diproses server.)');
        }
        var adaGagalTeks = info.barisHasil && info.barisHasil.some(function (b) { return b.status === 'gagal'; });
        if (adaGagalTeks) {
            baris.push('----------------------------------------------------------------------');
            baris.push('CATATAN: Ada baris yang gagal diproses/gagal verifikasi -- coba dulu langkah "Saran '
                + 'perbaikan" di atas untuk baris terkait, lalu impor ulang. Jika kegagalan TERUS berlanjut '
                + 'setelah dicoba ulang, laporkan ke admin/tim pengembang DAN WAJIB lampirkan tangkapan layar '
                + '(screenshot) laporan ini sebagai bukti.');
        }
        return baris.join('\n');
    }

    function bangunHtmlLaporanImporAndroid(info) {
        var judulStatus = info.status === 'sinkron' ? 'Berhasil Dikirim & Diproses Server'
            : info.status === 'offline' ? 'Tersimpan Lokal -- Menunggu Koneksi' : 'Gagal Dikirim ke Server';
        var kelasStatus = info.status === 'sinkron' ? 'sinkron' : info.status === 'offline' ? 'offline' : 'gagal';

        var html = '<div class="lp-status-badge ' + kelasStatus + '">' + escapeHtml(judulStatus) + '</div>';
        html += '<div class="lp-meta">' + escapeHtml(info.namaBerkas || '') + ' -- diproses ' + escapeHtml(info.waktuProses)
            + (info.idLokal ? ' -- ref: ' + escapeHtml(info.idLokal) : '')
            + (info.pesan ? '<br>' + escapeHtml(info.pesan) : '') + '</div>';

        if (info.ringkasan) {
            var r = info.ringkasan;
            html += '<div class="ringkas-bar" style="grid-template-columns:1fr 1fr;">'
                + '<div class="kartu-ringkas"><div class="label">Produk Baru</div><div class="nilai">' + (r.dibuat || 0) + '</div></div>'
                + '<div class="kartu-ringkas"><div class="label">Diperbarui</div><div class="nilai">' + (r.diperbarui || 0) + '</div></div>'
                + '<div class="kartu-ringkas"><div class="label">Stok Disesuaikan</div><div class="nilai">' + (r.stokDiopname || 0) + '</div></div>'
                + '<div class="kartu-ringkas"><div class="label">Dilewati/Gagal</div><div class="nilai">' + (r.dilewati || 0) + '</div></div>'
                + '<div class="kartu-ringkas"><div class="label">Kategori Baru</div><div class="nilai">' + (r.kategoriBaru || 0) + '</div></div>'
                + '<div class="kartu-ringkas"><div class="label">Pemasok/Satuan Baru</div><div class="nilai">' + ((r.pemasokBaru || 0) + (r.satuanBaru || 0)) + '</div></div>'
                + (r.verifikasiGagal ? '<div class="kartu-ringkas" style="border-color:var(--danger);"><div class="label">Gagal Verifikasi</div><div class="nilai" style="color:var(--danger);">' + r.verifikasiGagal + '</div></div>' : '')
                + '</div>';
        }

        var adaGagalHtml = info.barisHasil && info.barisHasil.some(function (b) { return b.status === 'gagal'; });
        if (adaGagalHtml) {
            html += '<div class="lp-eskalasi">⚠️ Ada baris yang gagal diproses/gagal verifikasi -- coba dulu "Saran perbaikan" di baris terkait, lalu impor ulang. '
                + 'Jika kegagalan <b>TERUS berlanjut</b> setelah dicoba ulang, laporkan ke admin/tim pengembang <b>DAN WAJIB lampirkan tangkapan layar (screenshot)</b> laporan ini.</div>';
        }

        html += '<div class="sub-judul">Detail Per Baris</div>';
        if (info.barisHasil && info.barisHasil.length) {
            html += info.barisHasil.map(function (b) {
                var aksiStok = b.aksiStok === 'diopname' ? 'Disesuaikan (Opname)' : b.aksiStok === 'tidak_ada_perubahan' ? 'Tidak berubah' : '-';
                var baruDibuat = [b.produkBaru ? 'Produk' : null, b.kategoriBaru ? 'Kategori' : null, b.pemasokBaru ? 'Pemasok' : null, b.satuanBaru ? 'Satuan' : null]
                    .filter(Boolean).join(', ');
                return '<div class="lp-baris-item ' + (b.status === 'gagal' ? 'gagal' : '') + '">'
                    + '<div class="lp-atas"><span class="lp-kode">#' + b.no + ' ' + escapeHtml(b.kode || '-') + '</span>'
                    + '<span class="lp-badge-mini ' + (b.status || '') + '">' + escapeHtml(b.status || '') + '</span></div>'
                    + '<div class="lp-nama">' + escapeHtml(b.nama || '-') + '</div>'
                    + (b.stokLama != null && b.stokBaru != null ? '<div class="lp-stok">Stok: ' + b.stokLama + ' → ' + b.stokBaru + ' (' + (b.selisih > 0 ? '+' : '') + b.selisih + ') -- ' + aksiStok + '</div>' : '')
                    + (baruDibuat ? '<div class="lp-stok">Baru dibuat: ' + baruDibuat + '</div>' : '')
                    + (b.pesan ? '<div class="lp-pesan">' + escapeHtml(b.pesan) + '</div>' : '')
                    + (b.teknis ? '<div class="lp-teknis">' + escapeHtml(b.teknis) + '</div>' : '')
                    + (b.solusi ? '<div class="lp-pesan" style="color:#0369a1;">💡 Saran: ' + escapeHtml(b.solusi) + '</div>' : '')
                    + (b.catatanVerifikasi ? '<div class="lp-pesan" style="color:var(--warning);">' + escapeHtml(b.catatanVerifikasi) + '</div>' : '')
                    + '</div>';
            }).join('');
        } else {
            html += '<div class="lp-baris-item"><div class="lp-pesan">Belum ada detail per baris -- berkas belum diproses server. '
                + (info.status === 'offline' ? 'Akan diproses otomatis begitu koneksi internet tersambung.' : '') + '</div></div>';
        }
        return html;
    }

    /**
     * Simpan laporan ke berkas .txt -- DIPAKAI DUA CARA: (a) otomatis SEGERA setelah proses impor
     * selesai (permintaan: "langsung download otomatis", TANPA menunggu klik apa pun -- lihat
     * pemanggilan di {@link #tampilkanLaporanImporKatalog}), dan (b) manual lewat tombol "Unduh
     * Laporan" di modal (cara re-simpan/timpa ulang bila berkas otomatisnya kebetulan terhapus).
     * {@code diam=true} menekan toast sukses (dipakai jalur otomatis, supaya tidak menumpuk toast
     * dgn toast "Selesai: X produk..." yg sudah tampil) -- kegagalan TETAP selalu dilaporkan
     * (toast error), baik jalur otomatis maupun manual, krn permintaan user "jangan ada error
     * sekecil apapun yg tak tercatat".
     * @param {object} info
     * @param {boolean} [diam]
     */
    async function simpanLaporanImporKeBerkas(info, diam) {
        var Filesystem = pluginCapacitor('Filesystem');
        if (!Filesystem) { toast('error', 'Fitur unduh berkas tidak tersedia di perangkat ini -- laporan tetap bisa dilihat di modal.'); return; }
        try {
            var teks = buatTeksLaporanImporAndroid(info);
            var namaFile = 'laporan-impor-katalog-' + (info.idLokal || Date.now()) + '.txt';
            var direktori = 'DOCUMENTS';
            try { await Filesystem.writeFile({ path: namaFile, data: teks, directory: direktori, encoding: 'utf8' }); }
            catch (eDir) { direktori = 'CACHE'; await Filesystem.writeFile({ path: namaFile, data: teks, directory: direktori, encoding: 'utf8' }); }
            if (!diam) {
                toast('success', 'Laporan tersimpan (' + namaFile + ', folder ' + (direktori === 'DOCUMENTS' ? 'Dokumen' : 'internal aplikasi') + ').');
            } else {
                toast('info', 'Laporan impor otomatis tersimpan ke folder ' + (direktori === 'DOCUMENTS' ? 'Dokumen' : 'internal aplikasi') + ' (' + namaFile + ').');
            }
        } catch (e) {
            toast('error', 'Gagal menyimpan laporan otomatis: ' + (e && e.message ? e.message : e) + ' -- coba tombol "Unduh Laporan" di modal secara manual.');
        }
    }

    function tampilkanLaporanImporKatalog(info) {
        infoLaporanImporAktif = info;
        elIsiLaporanImpor.innerHTML = bangunHtmlLaporanImporAndroid(info);
        elOverlayLaporanImpor.classList.add('tampil');
        // Otomatis simpan ke berkas SEGERA, TANPA menunggu klik apa pun (permintaan: "langsung
        // download otomatis file text ini setelah proses upload selesai") -- tombol "Unduh Laporan"
        // di modal tetap berfungsi sbg cara manual re-simpan.
        simpanLaporanImporKeBerkas(info, true).catch(function () { /* sudah ditangani toast error di dalam fungsi -- abaikan di sini */ });
    }

    elBtnTutupLaporanImpor.addEventListener('click', function () { elOverlayLaporanImpor.classList.remove('tampil'); });

    elBtnUnduhLaporanImpor.addEventListener('click', async function () {
        if (!infoLaporanImporAktif) return;
        elBtnUnduhLaporanImpor.disabled = true;
        try { await simpanLaporanImporKeBerkas(infoLaporanImporAktif, false); }
        finally { elBtnUnduhLaporanImpor.disabled = false; }
    });

    // ==== Unduh/Unggah Excel (fitur "download/upload katalog", khusus supervisor) ====

    /** Sama pola dgn updater.js (unduh APK) -- akses plugin Capacitor via global, TANPA import bundler (app ini murni <script> tag, tak dibundel). */
    function pluginCapacitor(nama) {
        return window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins[nama];
    }

    // ==== Format Unggah/Unduh Excel (gap-closure -- lihat JavaDoc PosApi.prosesKonfigurasi soal
    // kenapa daftar format bersumber dari server walau enable/disable-nya murni lokal) ====

    var elOverlayFormatImporEkspor = document.getElementById('overlayFormatImporEkspor');
    var elJudulFormatImporEkspor = document.getElementById('judulFormatImporEkspor');
    var elDaftarFormatImporEkspor = document.getElementById('daftarFormatImporEkspor');
    var elBtnTutupFormatImporEkspor = document.getElementById('btnTutupFormatImporEkspor');
    var elBtnBatalFormatImporEkspor = document.getElementById('btnBatalFormatImporEkspor');
    var elBtnLanjutFormatImporEkspor = document.getElementById('btnLanjutFormatImporEkspor');
    var KUNCI_FORMAT_NONAKTIF = 'pos_format_import_ekspor_nonaktif';

    function formatDinonaktifkanLokal() {
        try { return JSON.parse(localStorage.getItem(KUNCI_FORMAT_NONAKTIF) || '[]'); } catch (e) { return []; }
    }
    function daftarFormatAktifUntukPicker() {
        var semua = state.formatImporEkspor || [];
        var nonaktif = formatDinonaktifkanLokal();
        var aktifSaja = semua.filter(function (f) { return f.aktif !== false && nonaktif.indexOf(f.id) === -1; });
        return aktifSaja.length > 0 ? aktifSaja : semua;
    }
    function pilihFormatImporEksporModal(judul) {
        return new Promise(function (resolve) {
            var daftar = daftarFormatAktifUntukPicker();
            if (daftar.length === 0) { resolve('accurate'); return; }
            elJudulFormatImporEkspor.textContent = judul;
            elDaftarFormatImporEkspor.innerHTML = daftar.map(function (f, i) {
                return '<label style="display:flex;align-items:center;gap:10px;padding:10px 12px;border:1.5px solid var(--border);border-radius:8px;margin-bottom:8px;cursor:pointer;">'
                    + '<input type="radio" name="pilihanFormatImporEkspor" value="' + escapeHtml(f.id) + '"' + (i === 0 ? ' checked' : '') + '>'
                    + '<span style="font-weight:700;">' + escapeHtml(f.nama || f.id) + '</span>'
                    + '</label>';
            }).join('');
            elOverlayFormatImporEkspor.classList.add('tampil');
            var selesai = false;
            function bersihkan() {
                elOverlayFormatImporEkspor.classList.remove('tampil');
                elBtnTutupFormatImporEkspor.removeEventListener('click', batal);
                elBtnBatalFormatImporEkspor.removeEventListener('click', batal);
                elBtnLanjutFormatImporEkspor.removeEventListener('click', lanjut);
            }
            function batal() { if (selesai) return; selesai = true; bersihkan(); resolve(null); }
            function lanjut() {
                if (selesai) return;
                var dipilih = elDaftarFormatImporEkspor.querySelector('input[name="pilihanFormatImporEkspor"]:checked');
                selesai = true; bersihkan(); resolve(dipilih ? dipilih.value : daftar[0].id);
            }
            elBtnTutupFormatImporEkspor.addEventListener('click', batal);
            elBtnBatalFormatImporEkspor.addEventListener('click', batal);
            elBtnLanjutFormatImporEkspor.addEventListener('click', lanjut);
        });
    }

    elBtnUnduhExcelProduk.addEventListener('click', async function () {
        if (!bolehKelolaProduk()) return;
        var Filesystem = pluginCapacitor('Filesystem');
        if (!Filesystem) { toast('error', 'Fitur unduh berkas tidak tersedia di perangkat ini.'); return; }
        var formatDipilih = await pilihFormatImporEksporModal('Unduh Excel -- Pilih Format');
        if (!formatDipilih) return;
        elBtnUnduhExcelProduk.disabled = true;
        try {
            var r = await AisApi.panggil('produk_ekspor_excel', { format: formatDipilih });
            if (r.status !== 'success') { toast('error', pesanDariHasil(r, 'Gagal mengunduh katalog.')); return; }
            var namaFile = r.namaFile || 'katalog-produk.xlsx';
            var direktori = 'DOCUMENTS';
            try {
                await Filesystem.writeFile({ path: namaFile, data: r.fileBase64, directory: direktori });
            } catch (eDir) {
                // Sebagian perangkat/versi Android menolak tulis ke Documents tanpa izin storage
                // tambahan -- coba lagi ke folder cache aplikasi (SELALU bisa ditulis, tanpa izin).
                direktori = 'CACHE';
                await Filesystem.writeFile({ path: namaFile, data: r.fileBase64, directory: direktori });
            }
            toast('success', r.total + ' produk diunduh (' + namaFile + ', folder '
                + (direktori === 'DOCUMENTS' ? 'Dokumen' : 'internal aplikasi') + ').');
        } catch (e) {
            toast('error', 'Gagal mengunduh katalog: ' + (e && e.message ? e.message : e));
        } finally {
            elBtnUnduhExcelProduk.disabled = false;
        }
    });

    var formatDipilihUnggah = null;
    elBtnUnggahExcelProduk.addEventListener('click', async function () {
        if (!bolehKelolaProduk()) return;
        var formatDipilih = await pilihFormatImporEksporModal('Unggah Excel -- Pilih Format');
        if (!formatDipilih) return;
        formatDipilihUnggah = formatDipilih;
        elInFileExcelProduk.value = '';
        elInFileExcelProduk.click();
    });

    // ==== Tinjau Impor Katalog (review sebelum commit, gap-closure Android -- paritas dgn "Tinjau
    // Impor Katalog" Desktop produk-renderer.js). Alur 2 tahap: (1) berkas dibaca & dikirim ke
    // produk_impor_excel_preview (baca-saja, PERLU koneksi -- gagal/offline di sini cuma berarti
    // "coba lagi nanti", TIDAK ada data yg perlu diamankan offline-first krn belum ada apa pun yg
    // akan disimpan ke server), (2) pengguna meninjau/mengedit baris di layar Tinjau Impor, lalu
    // menekan "Simpan & Kirim" -- BARU di titik itu alur offline-first (KatalogImportQueue) berjalan,
    // persis seperti sebelumnya tapi mengirim baris yg SUDAH ditinjau (bukan berkas mentah).
    var elRingkasTinjauImpor = document.getElementById('ringkasTinjauImpor');
    var elIsiTinjauImpor = document.getElementById('isiTinjauImpor');
    var elBtnBatalTinjauImpor = document.getElementById('btnBatalTinjauImpor');
    var elBtnSimpanTinjauImpor = document.getElementById('btnSimpanTinjauImpor');
    var elDlKategoriImpor = document.getElementById('dlKategoriImpor');
    var elDlPemasokImpor = document.getElementById('dlPemasokImpor');
    var elDlSatuanImpor = document.getElementById('dlSatuanImpor');

    var barisTinjauImpor = [];
    var tokoIdTinjauImpor = null;
    var namaBerkasTinjauImpor = '';

    function isiDatalistImpor(el, daftar) {
        el.innerHTML = (daftar || []).map(function (o) { return '<option value="' + escapeHtml(o.nama) + '">'; }).join('');
    }

    function angkaTinjauImpor(v) { var n = Number(String(v == null ? '' : v).replace(',', '.')); return isNaN(n) ? 0 : n; }

    function renderBarisTinjauImpor() {
        var jmlBaru = barisTinjauImpor.filter(function (b) { return b.baru; }).length;
        var ringkas = barisTinjauImpor.length + ' baris (' + jmlBaru + ' produk baru, '
            + (barisTinjauImpor.length - jmlBaru) + ' diperbarui) -- periksa & sunting bila perlu sebelum dikirim.';
        if (kolomTinjauImporTidakDitemukan.length) {
            elRingkasTinjauImpor.innerHTML = '<span style="color:#dc2626;font-weight:800;">'
                + '&#9888; Kolom ' + kolomTinjauImporTidakDitemukan.join(', ') + ' TIDAK ditemukan di file ini -- '
                + 'SEMUA baris otomatis dibaca 0 utk kolom itu. Periksa nama header di file Excel Anda, '
                + 'JANGAN kirim sebelum yakin ini memang benar.</span><br>' + escapeHtml(ringkas);
        } else {
            elRingkasTinjauImpor.textContent = ringkas;
        }
        elIsiTinjauImpor.innerHTML = barisTinjauImpor.map(function (b, idx) {
            var selisih = angkaTinjauImpor(b.stokBaru) - angkaTinjauImpor(b.stokLama);
            return '<div class="ti-baris' + (b.baru ? ' baru' : '') + '" data-idx="' + idx + '">'
                + '<div class="ti-atas"><span class="ti-kode">#' + (idx + 1) + ' ' + escapeHtml(b.kode || '-') + '</span>'
                + (b.baru ? '<span class="lp-badge-mini berhasil">BARU</span>' : '') + '</div>'
                + '<div class="ti-nama">' + escapeHtml(b.nama || '-') + (b.barcode ? (' &middot; ' + escapeHtml(b.barcode)) : '') + '</div>'
                + '<div class="ti-grid3">'
                + '<div><label>Kategori</label><input type="text" list="dlKategoriImpor" data-f="kategoriNama" value="' + escapeHtml(b.kategoriNama || '') + '"></div>'
                + '<div><label>Pemasok</label><input type="text" list="dlPemasokImpor" data-f="pemasokNama" value="' + escapeHtml(b.pemasokNama || '') + '"></div>'
                + '<div><label>Satuan</label><input type="text" list="dlSatuanImpor" data-f="satuanNama" value="' + escapeHtml(b.satuanNama || '') + '"></div>'
                + '</div>'
                + '<div class="ti-grid3">'
                + '<div><label>Stok Lama</label><input type="text" class="ro" value="' + (b.stokLama != null ? b.stokLama : 0) + '" disabled></div>'
                + '<div><label>Stok Baru</label><input type="text" inputmode="decimal" data-f="stokBaru" value="' + (b.stokBaru != null ? b.stokBaru : 0) + '"></div>'
                + '<div><label>Selisih</label><input type="text" class="ro selisih" value="' + (selisih > 0 ? '+' : '') + selisih + '" disabled></div>'
                + '</div>'
                + '<div class="ti-grid2">'
                + '<div><label>Harga Jual (Rp)</label><input type="text" inputmode="decimal" data-f="hargaJual" value="' + (b.hargaJual != null ? b.hargaJual : 0) + '"></div>'
                + '<div><label>Harga Beli (Rp)</label><input type="text" inputmode="decimal" data-f="hargaBeli" value="' + (b.hargaBeli != null ? b.hargaBeli : 0) + '"></div>'
                + '</div>'
                + '</div>';
        }).join('');
    }

    // Delegasi SATU listener di kontainer (bukan per-input) -- pola sama dgn produk-renderer.js
    // Desktop, penting utk performa saat baris berjumlah ratusan.
    elIsiTinjauImpor.addEventListener('input', function (ev) {
        var input = ev.target;
        var field = input.getAttribute('data-f');
        if (!field) return;
        var baris = input.closest('.ti-baris');
        var idx = Number(baris.getAttribute('data-idx'));
        var row = barisTinjauImpor[idx];
        if (!row) return;
        if (field === 'stokBaru' || field === 'hargaJual' || field === 'hargaBeli') {
            row[field] = angkaTinjauImpor(input.value);
            if (field === 'stokBaru') {
                var selisihEl = baris.querySelector('.selisih');
                var selisihBaru = angkaTinjauImpor(row.stokBaru) - angkaTinjauImpor(row.stokLama);
                if (selisihEl) selisihEl.value = (selisihBaru > 0 ? '+' : '') + selisihBaru;
            }
        } else {
            row[field] = input.value;
        }
    });

    /** Sama persis pola Desktop (produk-renderer.js kolomImporTidakDitemukan) -- lihat JavaDoc di sana. */
    var kolomTinjauImporTidakDitemukan = [];

    function bukaTinjauImpor(data, namaBerkas) {
        barisTinjauImpor = data.baris || [];
        tokoIdTinjauImpor = data.tokoId != null ? data.tokoId : null;
        namaBerkasTinjauImpor = namaBerkas;
        kolomTinjauImporTidakDitemukan = data.kolomTidakDitemukan || [];
        isiDatalistImpor(elDlKategoriImpor, data.daftarKategori);
        isiDatalistImpor(elDlPemasokImpor, data.daftarPemasok);
        isiDatalistImpor(elDlSatuanImpor, data.daftarSatuan);
        renderBarisTinjauImpor();
        tampilkanLayar('layarTinjauImpor');
    }

    elBtnBatalTinjauImpor.addEventListener('click', function () {
        if (!confirm('Batalkan peninjauan? Belum ada data yang dikirim/tersimpan.')) return;
        barisTinjauImpor = [];
        tampilkanLayar('layarProduk');
    });

    elBtnSimpanTinjauImpor.addEventListener('click', async function () {
        if (!barisTinjauImpor.length) return;
        var lanjut = confirm(
            'Kirim ' + barisTinjauImpor.length + ' baris ke server?\n\n'
            + 'Produk dengan kode yang SUDAH ADA di toko ini akan DIPERBARUI (nama/kategori/harga/stok). '
            + 'Kode yang belum ada akan dibuat sebagai produk baru. Kategori/Pemasok/Satuan yang belum '
            + 'dikenal akan otomatis dibuat. Data akan tersimpan di perangkat ini terlebih dahulu -- aman '
            + 'diproses walau sedang offline, akan otomatis terkirim begitu koneksi internet tersambung.'
        );
        if (!lanjut) return;
        if (kolomTinjauImporTidakDitemukan.length && !confirm(
            '⚠️ PERINGATAN: kolom ' + kolomTinjauImporTidakDitemukan.join(', ') + ' TIDAK ditemukan di file Excel ini.\n\n'
            + 'SEMUA baris akan menyimpan 0 utk kolom itu -- ini KEMUNGKINAN BESAR akan MENGHAPUS data stok/harga asli produk yang sudah ada.\n\n'
            + 'Yakin tetap ingin melanjutkan? Tekan "Cancel" utk membatalkan dan memeriksa ulang file Excel Anda.'
        )) return;
        var idLokal = 'IMPKTL-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8).toUpperCase();
        var waktuProses = new Date().toLocaleString('id-ID');
        var barisKirim = barisTinjauImpor;
        elBtnSimpanTinjauImpor.disabled = true;
        try {
            // Offline-first (pola SAMA dgn OfflineQueue transaksi Kasir) -- baris yg sudah ditinjau
            // SELALU tersimpan lokal dulu SEBELUM dicoba kirim, supaya menekan "Simpan & Kirim" tidak
            // pernah kehilangan data walau internet putus TEPAT setelahnya. Lihat JavaDoc
            // import-katalog-queue.js.
            if (window.KatalogImportQueue) {
                try { await KatalogImportQueue.simpanBaru({ id: idLokal, namaBerkas: namaBerkasTinjauImpor, baris: barisKirim, tokoId: tokoIdTinjauImpor }); }
                catch (eSimpanLokal) { /* gagal tulis lokal -- lanjut coba kirim langsung, jangan gagalkan alur */ }
            }

            var r;
            try {
                // Timeout diperpanjang jauh (5 menit) -- server memproses SINKRON dalam 1 permintaan,
                // dan tiap baris dgn kolom "Kts" terisi menambah pencatatan StokOpname + rekalkulasi
                // stok (beberapa query SQL per baris, bukan sekadar upsert produk polos).
                r = await AisApi.panggil('produk_impor_excel_komit', { baris: barisKirim, toko_id: tokoIdTinjauImpor }, 300000);
            } catch (eJaringan) {
                if (eJaringan && (eJaringan.offline || eJaringan.timeout)) {
                    toast('info', 'Offline -- data hasil tinjauan tersimpan di perangkat ini, akan dikirim otomatis ke server begitu online.');
                    tampilkanLaporanImporKatalog({
                        status: 'offline', idLokal: idLokal, namaBerkas: namaBerkasTinjauImpor, waktuProses: waktuProses,
                        pesan: 'Tidak ada koneksi -- data hasil tinjauan tersimpan lokal, akan dikirim otomatis begitu koneksi internet pulih.'
                    });
                    barisTinjauImpor = [];
                    tampilkanLayar('layarProduk');
                    return;
                }
                throw eJaringan;
            }

            if (r.status !== 'success') {
                if (window.KatalogImportQueue) { try { await KatalogImportQueue.tandaiGagal(idLokal, pesanDariHasil(r, 'Ditolak server.')); } catch (e2) { /* abaikan */ } }
                tampilkanLaporanImporKatalog({
                    status: 'gagal', idLokal: idLokal, namaBerkas: namaBerkasTinjauImpor, waktuProses: waktuProses,
                    pesan: pesanDariHasil(r, 'Gagal mengirim hasil tinjauan.')
                });
                toast('error', pesanDariHasil(r, 'Gagal mengirim hasil tinjauan.'));
                barisTinjauImpor = [];
                tampilkanLayar('layarProduk');
                return;
            }
            if (window.KatalogImportQueue) { try { await KatalogImportQueue.tandaiSinkron(idLokal, r); } catch (e3) { /* abaikan */ } }

            toast('success',
                'Selesai: ' + r.dibuat + ' produk baru, ' + r.diperbarui + ' diperbarui'
                + (r.stokDiopname ? ', ' + r.stokDiopname + ' stok diopname' : '')
                + (r.dilewati ? ', ' + r.dilewati + ' dilewati' : '')
                + ((r.kategoriBaru || r.pemasokBaru || r.satuanBaru)
                    ? ' (kategori baru: ' + r.kategoriBaru + ', pemasok baru: ' + r.pemasokBaru + ', satuan baru: ' + r.satuanBaru + ')'
                    : ''));
            if (r.error && r.error.length) console.warn('Baris gagal saat impor katalog:', r.error);
            barisTinjauImpor = [];
            tampilkanLayar('layarProduk');
            tampilkanLaporanImporKatalog({
                status: 'sinkron', idLokal: idLokal, namaBerkas: namaBerkasTinjauImpor, waktuProses: waktuProses,
                ringkasan: r, barisHasil: r.baris || []
            });
            muatDaftarProduk(elInCariProduk.value.trim());
        } catch (e) {
            toast('error', 'Gagal mengirim hasil tinjauan: ' + (e && e.message ? e.message : e));
        } finally {
            elBtnSimpanTinjauImpor.disabled = false;
        }
    });

    elInFileExcelProduk.addEventListener('change', function () {
        var berkas = elInFileExcelProduk.files && elInFileExcelProduk.files[0];
        if (!berkas) return;
        var reader = new FileReader();
        reader.onload = async function () {
            elBtnUnggahExcelProduk.disabled = true;
            try {
                if (formatDipilihUnggah === 'accurate') {
                    // Pratinjau 100% LOKAL (gap-closure -- lihat JavaDoc excel-produk-parser.js): TIDAK
                    // butuh koneksi sama sekali, TIDAK tergantung kapan server produksi di-redeploy.
                    // Server baru disentuh saat "Simpan" (elBtnSimpanTinjauImpor, TIDAK berubah).
                    var hasilParse = window.ExcelProdukParser.parseExcelProdukFormatAccurate(reader.result);
                    if (!hasilParse.ok) { toast('error', hasilParse.pesan); return; }
                    var cacheProduk = [];
                    try { cacheProduk = await ProdukCache.produkCacheSemua(); } catch (eCache) { cacheProduk = []; }
                    var petaProduk = {};
                    cacheProduk.forEach(function (p) { if (p && p.kode) petaProduk[String(p.kode).trim().toUpperCase()] = p; });
                    var kategoriDariCache = {};
                    cacheProduk.forEach(function (p) { if (p && p.kategoriNama) kategoriDariCache[p.kategoriNama] = true; });
                    var barisLokal = hasilParse.baris.map(function (b) {
                        var existing = petaProduk[String(b.kode).trim().toUpperCase()];
                        return {
                            no: b.no, kode: b.kode, barcode: b.barcode, nama: b.nama,
                            kategoriNama: b.kategoriNama, pemasokNama: b.pemasokNama, satuanNama: b.satuanNama,
                            stokBaru: b.stokBaru, hargaJual: b.hargaJual, hargaBeli: b.hargaBeli,
                            stokLama: existing ? (existing.stok || 0) : 0,
                            produkId: existing ? existing.id : null,
                            baru: !existing
                        };
                    });
                    var setKategoriGabung = {};
                    hasilParse.kategoriDariFile.forEach(function (n) { setKategoriGabung[n] = true; });
                    Object.keys(kategoriDariCache).forEach(function (n) { setKategoriGabung[n] = true; });
                    bukaTinjauImpor({
                        baris: barisLokal,
                        tokoId: state.tokoId,
                        kolomTidakDitemukan: [],
                        daftarKategori: Object.keys(setKategoriGabung).sort(),
                        daftarPemasok: hasilParse.pemasokDariFile,
                        daftarSatuan: hasilParse.satuanDariFile
                    }, berkas.name);
                    return;
                }
                // Format lain (belum ada) -- jalur server lama sbg cadangan. reader.result di sini adalah
                // ArrayBuffer (readAsArrayBuffer di bawah, dipakai jalur lokal juga) -- konversi ke base64.
                var byteArray = new Uint8Array(reader.result);
                var biner = '';
                for (var iByte = 0; iByte < byteArray.byteLength; iByte++) biner += String.fromCharCode(byteArray[iByte]);
                var base64 = btoa(biner);
                var r = await AisApi.panggil('produk_impor_excel_preview', { file_base64: base64, format: formatDipilihUnggah }, 300000);
                if (r.status !== 'success') {
                    toast('error', pesanDariHasil(r, 'Gagal membaca berkas -- pastikan formatnya sesuai template & koneksi internet stabil (pratinjau memerlukan koneksi).'));
                    return;
                }
                bukaTinjauImpor(r, berkas.name);
            } catch (e) {
                var offlineTeks = (e && (e.offline || e.timeout))
                    ? 'Perlu koneksi internet untuk meninjau berkas ini sebelum diimpor -- berkasnya sendiri masih ada di perangkat, coba lagi setelah online.'
                    : ('Gagal membaca berkas: ' + (e && e.message ? e.message : e));
                toast('error', offlineTeks);
            } finally {
                elBtnUnggahExcelProduk.disabled = false;
            }
        };
        reader.onerror = function () { toast('error', 'Gagal membaca berkas terpilih.'); };
        reader.readAsArrayBuffer(berkas);
    });

    elBtnSimpanProduk.addEventListener('click', async function () {
        var kode = elFormProdukKode.value.trim();
        var nama = elFormProdukNama.value.trim();
        if (!kode) { toast('error', 'Kode produk wajib diisi.'); elFormProdukKode.focus(); return; }
        if (!nama) { toast('error', 'Nama produk wajib diisi.'); elFormProdukNama.focus(); return; }

        var payload = {
            kode: kode,
            barcode: elFormProdukBarcode.value.trim(),
            nama: nama,
            keterangan: elFormProdukKeterangan.value.trim(),
            harga_beli: parseFloat(elFormProdukHargaBeli.value) || 0,
            harga_jual: parseFloat(elFormProdukHargaJual.value) || 0,
            stok: parseFloat(elFormProdukStok.value) || 0,
            izinkan_jual_minus_stok: elFormProdukIzinkanMinus.checked,
            aktif: elFormProdukAktif.checked,
            kategori_id: elFormProdukKategori.value || null,
            bahan_baku: bahanBakuList
        };
        if (idProdukDiubah) payload.id = idProdukDiubah;

        elBtnSimpanProduk.disabled = true;
        elBtnSimpanProduk.textContent = 'Menyimpan...';
        try {
            var r = await AisApi.panggil('produk_simpan', payload);
            if (r.status === 'success') {
                toast('success', idProdukDiubah ? 'Produk diperbarui.' : 'Produk baru ditambahkan.');
                elOverlayFormProduk.classList.remove('tampil');
                muatDaftarProduk(elInCariProduk.value.trim());
                muatStatistikProduk();
            } else {
                toast('error', pesanDariHasil(r, 'Gagal menyimpan produk.'));
            }
        } catch (e) {
            toast('error', 'Gagal menyimpan produk: ' + (e && e.message ? e.message : e));
        } finally {
            elBtnSimpanProduk.disabled = false;
            elBtnSimpanProduk.textContent = 'Simpan';
        }
    });

    document.getElementById('btnBackProduk').addEventListener('click', function () { kembaliKeKasir(); });

    // ---- Riwayat Sinkronisasi ----
    var elIsiRiwayatSinkron = document.getElementById('isiRiwayatSinkron');
    async function muatRiwayatSinkron() {
        elIsiRiwayatSinkron.innerHTML = '<div class="layar-kosong">Memuat...</div>';
        try {
            var daftar = await OfflineQueue.listSemua();
            if (daftar.length === 0) { elIsiRiwayatSinkron.innerHTML = '<div class="layar-kosong">Belum ada transaksi tercatat di perangkat ini.</div>'; return; }
            elIsiRiwayatSinkron.innerHTML = daftar.map(function (row) {
                var waktu = '-';
                try { waktu = new Date(row.disimpanPada).toLocaleString('id-ID'); } catch (e2) { /* abaikan */ }
                var statusKelas = row.status === 'SYNCED' ? 'synced' : 'pending';
                var statusLabel = row.status === 'SYNCED' ? 'Tersinkron' : 'Menunggu';
                return '<div class="baris-riwayat-item"><div class="atas"><span class="kode">' + escapeHtml(row.clientTrxId) + '</span>'
                    + '<span class="lencana-status ' + statusKelas + '">' + statusLabel + '</span></div>'
                    + '<div class="waktu">' + escapeHtml(waktu) + ' -- ' + formatRupiah(row.total) + '</div>'
                    + (row.pesanError ? '<div class="waktu" style="color:var(--danger);">' + escapeHtml(row.pesanError) + '</div>' : '')
                    + '</div>';
            }).join('');
        } catch (e) {
            elIsiRiwayatSinkron.innerHTML = '<div class="layar-kosong">Gagal memuat: ' + escapeHtml(e && e.message ? e.message : e) + '</div>';
        }
    }
    document.getElementById('btnBackRiwayatSinkron').addEventListener('click', function () { kembaliKeKasir(); });
    document.getElementById('btnMuatUlangRiwayatSinkron').addEventListener('click', muatRiwayatSinkron);

    // ---- Log Error (baca riwayat yg sama dipakai modal ErrorAlert, lihat error-alert.js#bacaRiwayat) ----
    var elIsiLogError = document.getElementById('isiLogError');
    function muatLogError() {
        var daftar = (window.ErrorAlert && ErrorAlert.bacaRiwayat) ? ErrorAlert.bacaRiwayat().slice().reverse() : [];
        if (daftar.length === 0) { elIsiLogError.innerHTML = '<div class="layar-kosong">Belum ada error/exception tercatat -- bagus!</div>'; return; }
        elIsiLogError.innerHTML = daftar.map(function (row) {
            var waktu = '-';
            try { waktu = new Date(row.waktu).toLocaleString('id-ID'); } catch (e2) { /* abaikan */ }
            return '<div class="baris-log-item"><div class="atas"><span class="pesan">' + escapeHtml(row.judul) + '</span><span class="waktu">' + escapeHtml(waktu) + '</span></div>'
                + '<div class="sumber">' + escapeHtml((row.teknis || '').slice(0, 160)) + '</div></div>';
        }).join('');
    }
    document.getElementById('btnBackLogError').addEventListener('click', function () { kembaliKeKasir(); });
    document.getElementById('btnSalinSemuaLogError').addEventListener('click', function () {
        var daftar = (window.ErrorAlert && ErrorAlert.bacaRiwayat) ? ErrorAlert.bacaRiwayat() : [];
        if (daftar.length === 0) { toast('info', 'Belum ada error untuk disalin.'); return; }
        var teks = daftar.map(function (r) { return '[' + r.waktu + '] ' + r.judul + '\n' + r.teknis; }).join('\n\n---\n\n');
        ErrorAlert.salinKeClipboard(teks);
    });
    document.getElementById('btnBersihkanLogError').addEventListener('click', function () {
        if (!confirm('Hapus seluruh riwayat error tersimpan di perangkat ini?')) return;
        if (window.ErrorAlert && ErrorAlert.bersihkanRiwayat) ErrorAlert.bersihkanRiwayat();
        muatLogError();
        toast('success', 'Riwayat error dibersihkan.');
    });

    function kembaliKeKasir() {
        document.querySelectorAll('.drawer-item').forEach(function (b) { b.classList.toggle('aktif', b.getAttribute('data-layar') === 'layarPos'); });
        berhentiPollingLayarPelanggan();
        tampilkanLayar('layarPos');
    }

    if (window.Kamus) {
        window.Kamus.suntikPemilih(document.getElementById('i18nSwitcherDrawer'));
        window.Kamus.muat(window.Kamus.bahasaTersimpan());
    }

    (async function start() {
        await isiFormDariCfgTersimpan();
        var adaToken = await AisApi.muatTokenTersimpan();
        if (adaToken) {
            tampilMuat('Menyambungkan...');
            try {
                await masukKeAplikasi();
            } catch (e) {
                tutupMuat();
                tampilkanLayar('layarLogin');
                // ErrorAlert SUDAH ditampilkan di dalam masukKeAplikasi() sebelum exception ini
                // dilempar ulang -- di sini cukup pastikan pengguna kembali ke layar login, bukan
                // terjebak layar kosong.
            }
        }
    })();
})();
