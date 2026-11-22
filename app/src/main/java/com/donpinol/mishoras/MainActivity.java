package com.donpinol.mishoras;

import android.app.Activity;
import android.content.ActivityNotFoundException;
import android.content.ClipData;
import android.content.Intent;
import android.net.Uri;
import android.os.Bundle;
import android.webkit.JavascriptInterface;
import android.webkit.WebView;
import android.widget.Toast;

import androidx.core.content.FileProvider;

import java.io.File;
import java.io.FileOutputStream;
import java.nio.charset.StandardCharsets;

public class MainActivity extends Activity {
    private WebView page;

    @Override
    public void onCreate(Bundle state) {
        super.onCreate(state);
        page = new WebView(this);
        page.getSettings().setJavaScriptEnabled(true);
        page.getSettings().setDomStorageEnabled(true); // las marcas se guardan aquí (localStorage)
        page.getSettings().setAllowContentAccess(false);
        page.setBackgroundColor(0xfff3f3eb); // mismo fondo del diseño: sin parpadeo blanco
        page.addJavascriptInterface(new Puente(), "MisHorasNativo"); // solo la página local lo usa
        getWindow().setStatusBarColor(0xff112f32);
        setContentView(page);
        page.loadUrl("file:///android_asset/index.html");
    }

    /** Atrás vuelve del Historial al Inicio; en el Inicio cierra la app. */
    @Override
    @SuppressWarnings("deprecation")
    public void onBackPressed() {
        if (page != null && page.canGoBack()) {
            page.goBack();
        } else {
            super.onBackPressed();
        }
    }

    /** Compartir el historial desde la página (texto para WhatsApp y archivo CSV). */
    private class Puente {
        @JavascriptInterface
        public void compartirTexto(final String texto) {
            runOnUiThread(() -> {
                Intent envio = new Intent(Intent.ACTION_SEND);
                envio.setType("text/plain");
                envio.putExtra(Intent.EXTRA_TEXT, texto);
                try {
                    Intent whatsapp = new Intent(envio);
                    whatsapp.setPackage("com.whatsapp");
                    startActivity(whatsapp);
                } catch (ActivityNotFoundException sinWhatsapp) {
                    startActivity(Intent.createChooser(envio, "Compartir historial"));
                }
            });
        }

        @JavascriptInterface
        public void compartirCsv(final String nombre, final String csv) {
            runOnUiThread(() -> {
                try {
                    String limpio = nombre.replaceAll("[^A-Za-z0-9._-]", "_");
                    if (limpio.length() > 60) limpio = limpio.substring(0, 60);
                    if (!limpio.endsWith(".csv")) limpio = limpio + ".csv";
                    File dir = new File(getCacheDir(), "export");
                    if (!dir.exists() && !dir.mkdirs()) throw new IllegalStateException("sin carpeta");
                    File archivo = new File(dir, limpio);
                    try (FileOutputStream salida = new FileOutputStream(archivo)) {
                        salida.write(new byte[]{(byte) 0xEF, (byte) 0xBB, (byte) 0xBF}); // UTF-8 con BOM para Excel
                        salida.write(csv.getBytes(StandardCharsets.UTF_8));
                    }
                    Uri uri = FileProvider.getUriForFile(MainActivity.this, getPackageName() + ".fileprovider", archivo);
                    Intent envio = new Intent(Intent.ACTION_SEND);
                    envio.setType("text/csv");
                    envio.putExtra(Intent.EXTRA_STREAM, uri);
                    envio.setClipData(ClipData.newRawUri("Historial", uri));
                    envio.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
                    startActivity(Intent.createChooser(envio, "Compartir archivo"));
                } catch (Exception error) {
                    Toast.makeText(MainActivity.this, "No se pudo exportar el archivo", Toast.LENGTH_LONG).show();
                }
            });
        }
    }
}
