package id.ecampus.ais.pos.android;

import android.Manifest;
import android.os.Build;
import android.os.Bundle;

import androidx.core.app.ActivityCompat;
import androidx.core.content.ContextCompat;
import android.content.pm.PackageManager;

import com.getcapacitor.BridgeActivity;

import java.util.ArrayList;
import java.util.List;

/**
 * Minta izin runtime (BLUETOOTH_CONNECT/BLUETOOTH_SCAN Android 12+/API 31+, KAMERA semua versi)
 * saat aplikasi dibuka. cordova-plugin-bluetooth-serial (fitur cetak struk, lihat escpos.js)
 * mendahului model izin runtime Android 12 dan TIDAK meminta izin ini sendiri; html5-qrcode (fitur
 * "SO by Scan (HP/PDT)" kamera, lihat app.js bagian Stok Opname) memakai {@code getUserMedia} murni
 * lewat WebView -- WebChromeClient bawaan Capacitor SUDAH otomatis meneruskan permintaan itu ke izin
 * Android ini (tidak perlu override WebChromeClient sendiri), TAPI hanya kalau izin levelnya SUDAH
 * granted -- deklarasi di AndroidManifest.xml saja tidak cukup utk izin "dangerous", wajib diminta
 * eksplisit saat runtime seperti di bawah ini.
 */
public class MainActivity extends BridgeActivity {
    private static final int KODE_MINTA_IZIN_RUNTIME = 4201;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        registerPlugin(ApkInstallerPlugin.class);
        super.onCreate(savedInstanceState);
        List<String> belumDiizinkan = new ArrayList<String>();
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            String[] wajibBluetooth = { Manifest.permission.BLUETOOTH_CONNECT, Manifest.permission.BLUETOOTH_SCAN };
            for (String izin : wajibBluetooth) {
                if (ContextCompat.checkSelfPermission(this, izin) != PackageManager.PERMISSION_GRANTED) {
                    belumDiizinkan.add(izin);
                }
            }
        }
        if (ContextCompat.checkSelfPermission(this, Manifest.permission.CAMERA) != PackageManager.PERMISSION_GRANTED) {
            belumDiizinkan.add(Manifest.permission.CAMERA);
        }
        if (!belumDiizinkan.isEmpty()) {
            ActivityCompat.requestPermissions(this, belumDiizinkan.toArray(new String[0]), KODE_MINTA_IZIN_RUNTIME);
        }
    }
}
