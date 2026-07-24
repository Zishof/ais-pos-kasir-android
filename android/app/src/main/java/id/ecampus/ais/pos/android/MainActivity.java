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
 * Minta izin Bluetooth runtime (BLUETOOTH_CONNECT/BLUETOOTH_SCAN, Android 12+/API 31+) saat
 * aplikasi dibuka. cordova-plugin-bluetooth-serial (dipakai fitur cetak struk, lihat escpos.js)
 * mendahului model izin runtime Android 12 dan TIDAK meminta izin ini sendiri -- tanpa kode ini,
 * pencarian/penyambungan printer akan gagal diam-diam (SecurityException) di perangkat Android 12+
 * meski sudah dicantumkan di AndroidManifest.xml (deklarasi manifest saja tidak cukup utk izin
 * "dangerous" -- wajib diminta eksplisit saat runtime).
 */
public class MainActivity extends BridgeActivity {
    private static final int KODE_MINTA_IZIN_BLUETOOTH = 4201;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        registerPlugin(ApkInstallerPlugin.class);
        super.onCreate(savedInstanceState);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            List<String> belumDiizinkan = new ArrayList<String>();
            String[] wajib = { Manifest.permission.BLUETOOTH_CONNECT, Manifest.permission.BLUETOOTH_SCAN };
            for (String izin : wajib) {
                if (ContextCompat.checkSelfPermission(this, izin) != PackageManager.PERMISSION_GRANTED) {
                    belumDiizinkan.add(izin);
                }
            }
            if (!belumDiizinkan.isEmpty()) {
                ActivityCompat.requestPermissions(this, belumDiizinkan.toArray(new String[0]), KODE_MINTA_IZIN_BLUETOOTH);
            }
        }
    }
}
