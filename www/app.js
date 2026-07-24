/**
 * app.js -- logika Kasir Android. Reuse kontrak {@code PosApi.java} yang SAMA dgn Kasir Desktop
 * (Electron): {@code login/konfigurasi/katalog/sesi_kas_status/sesi_kas_buka/sesi_kas_tutup/
 * cari_member/saldo_member/verifikasi_pin/topup_saldo/bayar}.
 *
 * SEJAK v1.2.0 (paritas fase 1a+1b dgn Desktop): Tutup Kas + picker member/saldo/PIN/top-up saldo
 * sudah diporting -- lihat blok "Sesi Kas" dan "Member". BELUM diporting dari Desktop: diskon
 * otomatis saat checkout (BELUM ADA di Desktop juga -- lihat catatan gap 3-arah), simpan/tahan
 * keranjang, mode offline-first (checkout masih murni online), pesanan online, printer Wi-Fi/USB,
 * i18n, layar admin (Ringkasan/Laporan/Customer CRUD/Konfigurasi/Riwayat Sinkron). Semua itu bisa
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

    function tampilkanLayar(id) {
        document.querySelectorAll('.layar').forEach(function (el) { el.classList.remove('aktif'); });
        document.getElementById(id).classList.add('aktif');
    }

    // ==== State ====
    var state = {
        tokoId: null, tokoNama: '', userId: '', caraBayar: [],
        kategori: [], produk: [], kategoriAktif: null, keyword: '',
        cart: [], // {id, kode, nama, harga, jumlah}
        sesiKasTerbuka: false,
        sesiKasInfo: {},
        metodeTerpilih: null,
        memberTerpilih: null // {id, nama, kodeIdentitas, wajibPin, minSaldo}
    };

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
                elTxtNamaToko.textContent = state.tokoNama || ('Kasir - ' + state.userId);
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
    var elInCari = document.getElementById('inCari');

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
                renderKategori();
                renderGridProduk();
            });
        });
    }

    function produkTersaring() {
        return state.produk.filter(function (p) {
            if (state.kategoriAktif != null && p.kategoriId !== state.kategoriAktif) return false;
            if (state.keyword && p.nama.toLowerCase().indexOf(state.keyword.toLowerCase()) < 0 && p.kode.toLowerCase().indexOf(state.keyword.toLowerCase()) < 0) return false;
            return true;
        });
    }

    function renderGridProduk() {
        var daftar = produkTersaring();
        if (daftar.length === 0) {
            elGridProduk.innerHTML = '<div style="grid-column:1/-1;text-align:center;color:var(--faint);padding:40px 16px;font-size:12.5px;">Tidak ada produk.</div>';
            return;
        }
        var html = '';
        daftar.forEach(function (p) {
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
        cariTimer = setTimeout(function () { state.keyword = elInCari.value.trim(); renderGridProduk(); }, 250);
    });

    async function muatKatalog() {
        var r = await AisApi.panggil('katalog', {});
        if (r.status !== 'success') { toast('error', pesanDariHasil(r, 'Gagal memuat katalog.')); return; }
        state.kategori = r.kategori || [];
        state.produk = r.produk || [];
        state.tokoId = r.tokoId;
        renderKategori();
        renderGridProduk();
    }

    // =====================================================================
    // ==== Keranjang ====
    // =====================================================================
    var elKeranjangList = document.getElementById('keranjangList');
    var elTxtSubtotal = document.getElementById('txtSubtotal');
    var elTxtTotal = document.getElementById('txtTotal');
    var elBtnBuka2Bayar = document.getElementById('btnBuka2Bayar');
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
        else state.cart.push({ id: p.id, kode: p.kode, nama: p.nama, harga: p.hargaJual, jumlah: 1 });
        renderKeranjang();
        toast('success', p.nama + ' ditambahkan.');
    }

    function ubahJumlah(produkId, delta) {
        var baris = state.cart.filter(function (c) { return c.id === produkId; })[0];
        if (!baris) return;
        baris.jumlah += delta;
        if (baris.jumlah <= 0) state.cart = state.cart.filter(function (c) { return c.id !== produkId; });
        renderKeranjang();
    }

    function hitungSubtotal() {
        return state.cart.reduce(function (s, c) { return s + c.harga * c.jumlah; }, 0);
    }

    function renderKeranjang() {
        if (state.cart.length === 0) {
            elKeranjangList.innerHTML = '<div class="keranjang-kosong">&#128722;<br>Keranjang kosong -- ketuk produk untuk menambah.</div>';
        } else {
            var html = '';
            state.cart.forEach(function (c) {
                html += '<div class="baris-keranjang">'
                    + '<div class="info"><div class="nama">' + escapeHtml(c.nama) + '</div><div class="harga">' + formatRupiah(c.harga) + '</div></div>'
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
        var subtotal = hitungSubtotal();
        elTxtSubtotal.textContent = formatRupiah(subtotal);
        elTxtTotal.textContent = formatRupiah(subtotal);
        var jumlahItem = state.cart.reduce(function (s, c) { return s + c.jumlah; }, 0);
        elFabJumlah.textContent = jumlahItem;
        elFabKeranjang.className = 'fab-keranjang' + (jumlahItem > 0 && window.innerWidth < 900 ? ' tampil' : '');
        elBtnBuka2Bayar.disabled = state.cart.length === 0 || !state.sesiKasTerbuka;
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

    async function cekSesiKas() {
        var r = await AisApi.panggil('sesi_kas_status', { id_toko: state.tokoId });
        // PENTING: field server (terbuka/modalAwal/dst) ada di TOP LEVEL respons (r.terbuka), BUKAN
        // dibungkus r.data -- beda dari pola Desktop (main.js membungkus SELURUH balasan server ke
        // dalam {ok, data:<hasilServer>}). Android manggil server LANGSUNG (lihat api.js) jadi `r`
        // ADALAH `hasil` mentah server apa adanya -- lihat JavaDoc KantinHelper.sesiKasStatus di server.
        var data = (r.status === 'success') ? r : {};
        state.sesiKasTerbuka = !!data.terbuka;
        state.sesiKasInfo = data;
        if (!state.sesiKasTerbuka) {
            elOverlaySesiKas.classList.add('tampil');
            elPillKas.style.display = 'none';
        } else {
            elOverlaySesiKas.classList.remove('tampil');
            elPillKas.style.display = 'inline-flex';
            elTxtKasSingkat.textContent = formatRupiah(data.kasSaatIni);
        }
        renderKeranjang();
    }

    /**
     * Setelah server membalas sesi_kas_buka/tutup "berhasil", pengecekan sesi_kas_status BERIKUTNYA
     * seharusnya langsung mencerminkan kondisi baru -- di lapangan (versi Desktop) pernah ditemukan
     * (dgn bukti log server menunjukkan commit SUKSES) status re-check SEGERA setelahnya masih
     * melaporkan kondisi LAMA -- dugaan latensi visibilitas baca-setelah-tulis di sisi infrastruktur
     * server, BUKAN kesalahan penyimpanan. Coba ulang beberapa kali dgn jeda singkat sebelum
     * benar-benar menyerah, drpd langsung menampilkan overlay "Kas Belum Dibuka" yg macet padahal
     * server sudah sukses (lihat perbaikan v1.0.16 versi Desktop utk simtom persis sama).
     * @param {boolean} terbukaDiharapkan
     * @return {Promise<boolean>}
     */
    async function tungguStatusSesiKasSesuai(terbukaDiharapkan) {
        var jedaMs = [300, 600, 1000, 1500, 2000];
        for (var i = 0; i < jedaMs.length; i++) {
            await new Promise(function (r) { setTimeout(r, jedaMs[i]); });
            await cekSesiKas();
            if (state.sesiKasTerbuka === terbukaDiharapkan) return true;
        }
        return false;
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
            var r = await AisApi.panggil('sesi_kas_tutup', { id_toko: state.tokoId, uang_fisik: uangFisik, keterangan: keterangan });
            if (r.status === 'success') {
                await cekSesiKas();
                if (state.sesiKasTerbuka) await tungguStatusSesiKasSesuai(false);
                elOverlayTutupKas.classList.remove('tampil');
                var selisih = Number(r.selisih) || 0;
                toast(selisih < 0 ? 'error' : 'success', 'Kas ditutup. Selisih: ' + formatRupiah(selisih));
                var stokMenipis = r.stokMenipis || [];
                if (stokMenipis.length > 0) {
                    setTimeout(function () {
                        toast('info', stokMenipis.length + ' produk perlu direstok (stok di bawah ambang minimum).');
                    }, 1200);
                }
            } else {
                toast('error', pesanDariHasil(r, 'Gagal menutup kas.'));
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
            var r = await AisApi.panggil('sesi_kas_buka', { id_toko: state.tokoId, modal_awal: modal });
            if (r.status === 'success') {
                await cekSesiKas();
                if (!state.sesiKasTerbuka) {
                    elBtnSubmitBukaKas.textContent = 'Menunggu server memperbarui status...';
                    var akhirnyaTerbuka = await tungguStatusSesiKasSesuai(true);
                    if (!akhirnyaTerbuka) {
                        toast('error', 'Kas sudah tersimpan di server, tapi tampilan belum ikut memperbarui -- coba tekan "Buka Kas" sekali lagi atau muat ulang aplikasi.');
                        return;
                    }
                }
                toast('success', 'Kas dibuka.');
            } else {
                toast('error', pesanDariHasil(r, 'Gagal membuka kas.'));
            }
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

    function pilihMember(m) {
        state.memberTerpilih = m;
        elBtnPilihMember.style.display = 'none';
        elMemberChip.style.display = 'flex';
        elMemberChipNama.textContent = m.nama + (m.wajibPin ? ' \u{1F512}' : '');
        elMemberChipSaldo.textContent = 'Memeriksa saldo...';
        elBtnIsiSaldo.style.display = 'inline-block';
        elFormTopup.style.display = 'none';
        segarkanSaldoMemberTerpilih();
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
        state.memberTerpilih = null;
        elMemberChip.style.display = 'none';
        elBtnPilihMember.style.display = 'flex';
        elFormTopup.style.display = 'none';
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

    function resetMemberTerpilih() {
        state.memberTerpilih = null;
        elMemberChip.style.display = 'none';
        elBtnPilihMember.style.display = 'flex';
        elFormTopup.style.display = 'none';
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
        var total = hitungSubtotal();
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
        elTxtTotalModalBayar.textContent = formatRupiah(hitungSubtotal());
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

    elBtnSubmitBayar.addEventListener('click', async function () {
        var subtotal = hitungSubtotal();
        var diterima = Number(elInUangTunai.value) || subtotal;
        var kembalian = Math.max(0, diterima - subtotal);
        var kodeUnik = buatKodeUnik();
        var sekarang = new Date();

        var pakaiSaldo = state.metodeTerpilih && state.metodeTerpilih.manual === false;
        if (pakaiSaldo) {
            elBtnSubmitBayar.disabled = true;
            elBtnSubmitBayar.textContent = 'Memeriksa saldo...';
            var gerbang = await gerbangSaldoDanPin(subtotal);
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
            total: subtotal,
            id_member: state.memberTerpilih ? state.memberTerpilih.id : null,
            transaksi: state.cart.map(function (c) {
                return { id: c.id, kode: c.kode, nama: c.nama, harga: c.harga, jumlah: c.jumlah, diskon: 0, aturanDiskon: null, cashback: 0 };
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
            var r;
            try {
                r = await AisApi.panggil('bayar', payload);
            } catch (eJaringan) {
                if (eJaringan && (eJaringan.offline || eJaringan.timeout) && !pakaiSaldo) {
                    // Tidak ada koneksi/timeout -- transaksi SUDAH aman di antrean lokal (baris di atas),
                    // akan disinkronkan otomatis begitu koneksi pulih. Bukan kegagalan bagi kasir.
                    dariAntreanOffline = true;
                    r = { status: 'success' };
                } else {
                    throw eJaringan;
                }
            }
            if (r.status === 'success') {
                if (!dariAntreanOffline) { try { await OfflineQueue.tandaiSinkron(kodeUnik); } catch (e3) { /* abaikan */ } }
                strukTerakhir = {
                    tokoNama: state.tokoNama, kode: kodeUnik, waktu: sekarang.toLocaleString('id-ID'),
                    kasir: state.userId, metode: state.metodeTerpilih.nama,
                    items: state.cart.map(function (c) { return { nama: c.nama, jumlah: c.jumlah, harga: c.harga }; }),
                    subtotal: subtotal, total: subtotal, diterima: diterima, kembalian: kembalian
                };
                document.getElementById('txtRingkasSukses').textContent = formatRupiah(subtotal) + ' -- ' + state.metodeTerpilih.nama
                    + (dariAntreanOffline ? ' (tersimpan offline, menunggu sinkron)' : '');
                elOverlayBayar.classList.remove('tampil');
                document.getElementById('overlaySukses').classList.add('tampil');
                state.cart = [];
                renderKeranjang();
                resetMemberTerpilih();
                segarkanBadgeSinkron();
                if (!dariAntreanOffline) muatKatalog(); // stok berubah -- muat ulang supaya badge stok akurat (dilewati saat offline, toh tak terjangkau)
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

    // =====================================================================
    // ==== Inisialisasi ====
    // =====================================================================
    async function masukKeAplikasi() {
        var cfg = await AisApi.bacaCfg();
        state.userId = (cfg && cfg.username) || '';
        tampilkanLayar('layarPos');
        tampilMuat('Memuat katalog...');
        try {
            await segarkanStatus();
            await muatKatalog();
            await cekSesiKas();
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
        segarkanBadgeSinkron();
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
