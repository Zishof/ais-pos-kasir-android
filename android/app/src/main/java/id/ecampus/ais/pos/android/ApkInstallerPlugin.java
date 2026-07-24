package id.ecampus.ais.pos.android;

import android.content.Intent;
import android.net.Uri;
import android.os.Build;
import android.provider.Settings;

import androidx.core.content.FileProvider;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.io.File;

/**
 * Plugin native kecil untuk fitur "Update Otomatis" (mirip Windows Update, lihat www/updater.js):
 * membuka installer SISTEM Android untuk sebuah berkas APK yang sudah diunduh aplikasi ini sendiri
 * ke penyimpanan lokal (cache). Android TIDAK MENGIZINKAN aplikasi memasang APK secara diam-diam
 * tanpa keterlibatan pengguna sama sekali -- ini batasan keamanan OS, bukan keterbatasan plugin ini
 * -- jadi alur "otomatis" di sini berhenti tepat SEBELUM tap konfirmasi instal terakhir milik
 * Android sendiri, sepenuhnya sejalan dengan permintaan "update otomatis via backend, baru
 * berfungsi setelah konfirmasi restart/instal disetujui pengguna".
 *
 * <p><b>Dua gerbang izin Android yang berbeda (WAJIB dipahami pemelihara):</b>
 * <ol>
 *   <li>{@code REQUEST_INSTALL_PACKAGES} di AndroidManifest.xml -- izin level manifest, otomatis
 *       "granted" saat instalasi APK ini sendiri, TIDAK perlu diminta runtime.</li>
 *   <li>{@code canRequestPackageInstalls()} -- gerbang "Instal aplikasi tak dikenal" per-APLIKASI
 *       yang HANYA bisa diaktifkan pengguna lewat halaman Pengaturan sistem (Android 8+/API 26+),
 *       TIDAK BISA diminta lewat dialog izin runtime biasa. Bila belum aktif, {@link #install}
 *       akan membuka halaman itu (bukan installer) dan menolak panggilan dengan pesan yang jelas
 *       supaya JS bisa memberi tahu pengguna utk mengaktifkannya lalu coba lagi.</li>
 * </ol>
 * </p>
 */
@CapacitorPlugin(name = "ApkInstaller")
public class ApkInstallerPlugin extends Plugin {

    @PluginMethod
    public void install(PluginCall call) {
        String path = call.getString("path");
        if (path == null || path.trim().isEmpty()) {
            call.reject("Path berkas APK kosong.");
            return;
        }
        File berkas = new File(path);
        if (!berkas.exists()) {
            call.reject("Berkas APK tidak ditemukan di perangkat: " + path);
            return;
        }

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O
                && !getContext().getPackageManager().canRequestPackageInstalls()) {
            // Gerbang "Instal aplikasi tak dikenal" belum diaktifkan pengguna utk app ini -- buka
            // halaman pengaturannya (BUKAN installer, krn installer akan ditolak sistem tanpa ini)
            // lalu tolak panggilan dgn pesan jelas supaya UI JS bisa menuntun pengguna & coba lagi.
            Intent intentPengaturan = new Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES,
                    Uri.parse("package:" + getContext().getPackageName()));
            intentPengaturan.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            try {
                getContext().startActivity(intentPengaturan);
            } catch (Exception ignore) {
                // Perangkat/ROM tanpa halaman ini -- pesan penolakan di bawah tetap jadi panduan utama.
            }
            call.reject("IZIN_SUMBER_TAK_DIKENAL_BELUM_AKTIF");
            return;
        }

        try {
            Uri uriKonten = FileProvider.getUriForFile(getContext(),
                    getContext().getPackageName() + ".fileprovider", berkas);
            Intent intentInstal = new Intent(Intent.ACTION_VIEW);
            intentInstal.setDataAndType(uriKonten, "application/vnd.android.package-archive");
            intentInstal.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_ACTIVITY_NEW_TASK);
            getContext().startActivity(intentInstal);
            JSObject hasil = new JSObject();
            hasil.put("ok", true);
            call.resolve(hasil);
        } catch (Exception e) {
            call.reject("Gagal membuka installer sistem: " + e.getMessage(), e);
        }
    }
}
