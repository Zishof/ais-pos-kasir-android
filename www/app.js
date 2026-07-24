/**
 * app.js -- logika Kasir Android (v1). Reuse kontrak {@code PosApi.java} yang SAMA dgn Kasir
 * Desktop (Electron): {@code login/konfigurasi/katalog/sesi_kas_status/sesi_kas_buka/bayar}.
 *
 * CAKUPAN v1 (disengaja, lihat README.md "Batasan v1"): jual produk tunai/metode "manual" +
 * cetak Bluetooth. BELUM diporting dari Desktop: pembayaran saldo member+PIN, diskon otomatis,
 * simpan/tahan keranjang, mode offline-first, pesanan online, printer Wi-Fi/USB. Semua itu bisa
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
        metodeTerpilih: null
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

    async function cekSesiKas() {
        var r = await AisApi.panggil('sesi_kas_status', { id_toko: state.tokoId });
        state.sesiKasTerbuka = r.status === 'success' && r.data && r.data.terbuka;
        if (!state.sesiKasTerbuka) elOverlaySesiKas.classList.add('tampil');
        else elOverlaySesiKas.classList.remove('tampil');
        renderKeranjang();
    }

    elBtnSubmitBukaKas.addEventListener('click', async function () {
        var modal = Number(elInModalAwal.value) || 0;
        elBtnSubmitBukaKas.disabled = true;
        elBtnSubmitBukaKas.textContent = 'Membuka...';
        try {
            var r = await AisApi.panggil('sesi_kas_buka', { id_toko: state.tokoId, modal_awal: modal });
            if (r.status === 'success') {
                toast('success', 'Kas dibuka.');
                await cekSesiKas();
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

        var payload = {
            kodeUnik: kodeUnik, clientTrxId: kodeUnik,
            idToko: state.tokoId, tokoId: state.tokoId,
            kasir: state.userId,
            waktu: sekarang.toISOString(),
            caraBayar: state.metodeTerpilih.id,
            total: subtotal,
            id_member: null,
            transaksi: state.cart.map(function (c) {
                return { id: c.id, kode: c.kode, nama: c.nama, harga: c.harga, jumlah: c.jumlah, diskon: 0, aturanDiskon: null, cashback: 0 };
            })
        };

        elBtnSubmitBayar.disabled = true;
        elBtnSubmitBayar.textContent = 'Memproses...';
        try {
            var r = await AisApi.panggil('bayar', payload);
            if (r.status === 'success') {
                strukTerakhir = {
                    tokoNama: state.tokoNama, kode: kodeUnik, waktu: sekarang.toLocaleString('id-ID'),
                    kasir: state.userId, metode: state.metodeTerpilih.nama,
                    items: state.cart.map(function (c) { return { nama: c.nama, jumlah: c.jumlah, harga: c.harga }; }),
                    subtotal: subtotal, total: subtotal, diterima: diterima, kembalian: kembalian
                };
                document.getElementById('txtRingkasSukses').textContent = formatRupiah(subtotal) + ' -- ' + state.metodeTerpilih.nama;
                elOverlayBayar.classList.remove('tampil');
                document.getElementById('overlaySukses').classList.add('tampil');
                state.cart = [];
                renderKeranjang();
                muatKatalog(); // stok berubah -- muat ulang supaya badge stok akurat
            } else {
                toast('error', pesanDariHasil(r, 'Pembayaran gagal.'));
            }
        } catch (e) {
            // Checkout GAGAL diproses (bukan cuma ditolak server dgn balasan jelas, tapi exception
            // jaringan/timeout) -- WAJIB alert detail (bukan toast sekilas) krn kasir perlu tahu
            // PASTI apakah transaksi ini perlu diulang atau jangan (lihat kode transaksi di detail
            // teknis utk dicek manual ke admin bila ragu).
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
