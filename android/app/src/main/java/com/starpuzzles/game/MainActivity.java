package com.starpuzzles.game;

import android.annotation.SuppressLint;
import android.app.Activity;
import android.content.Intent;
import android.net.Uri;
import android.os.Bundle;
import android.webkit.JavascriptInterface;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Toast;

import androidx.webkit.WebViewAssetLoader;

import org.json.JSONObject;

import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.nio.charset.StandardCharsets;

public class MainActivity extends Activity {
    private static final int REQUEST_EXPORT_BACKUP = 7101;
    private static final int REQUEST_IMPORT_BACKUP = 7102;

    private WebView webView;
    private WebViewAssetLoader assetLoader;
    private String pendingBackupJson;

    @SuppressLint({"SetJavaScriptEnabled", "AddJavascriptInterface"})
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        assetLoader = new WebViewAssetLoader.Builder()
            .addPathHandler("/assets/", new WebViewAssetLoader.AssetsPathHandler(this))
            .build();

        webView = new WebView(this);
        webView.getSettings().setJavaScriptEnabled(true);
        webView.getSettings().setDomStorageEnabled(true);
        webView.getSettings().setDatabaseEnabled(true);
        webView.getSettings().setAllowFileAccess(false);
        webView.getSettings().setAllowContentAccess(true);
        webView.setOverScrollMode(WebView.OVER_SCROLL_NEVER);
        webView.addJavascriptInterface(new BackupBridge(), "AndroidBackup");
        webView.setWebViewClient(new WebViewClient() {
            @Override
            public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
                return assetLoader.shouldInterceptRequest(request.getUrl());
            }

            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                return !request.getUrl().toString().startsWith("https://appassets.androidplatform.net/");
            }
        });
        setContentView(webView);
        webView.loadUrl("https://appassets.androidplatform.net/assets/launcher.html");
    }

    private class BackupBridge {
        @JavascriptInterface
        public void saveBackup(String json) {
            runOnUiThread(() -> {
                pendingBackupJson = json;
                Intent intent = new Intent(Intent.ACTION_CREATE_DOCUMENT);
                intent.addCategory(Intent.CATEGORY_OPENABLE);
                intent.setType("application/json");
                intent.putExtra(Intent.EXTRA_TITLE, "tijara-backup-" +
                    new java.text.SimpleDateFormat("yyyy-MM-dd", java.util.Locale.US)
                        .format(new java.util.Date()) + ".json");
                startActivityForResult(intent, REQUEST_EXPORT_BACKUP);
            });
        }

        @JavascriptInterface
        public void requestImport() {
            runOnUiThread(() -> {
                Intent intent = new Intent(Intent.ACTION_OPEN_DOCUMENT);
                intent.addCategory(Intent.CATEGORY_OPENABLE);
                intent.setType("application/json");
                intent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
                startActivityForResult(intent, REQUEST_IMPORT_BACKUP);
            });
        }
    }

    @Override
    protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        super.onActivityResult(requestCode, resultCode, data);
        if (resultCode != RESULT_OK || data == null || data.getData() == null) {
            pendingBackupJson = null;
            return;
        }

        Uri uri = data.getData();
        try {
            if (requestCode == REQUEST_EXPORT_BACKUP) {
                if (pendingBackupJson == null) throw new IllegalStateException("لا توجد نسخة جاهزة للحفظ");
                try (OutputStream output = getContentResolver().openOutputStream(uri)) {
                    if (output == null) throw new IllegalStateException("تعذر فتح الملف للحفظ");
                    output.write(pendingBackupJson.getBytes(StandardCharsets.UTF_8));
                    output.flush();
                }
                pendingBackupJson = null;
                Toast.makeText(this, "تم حفظ النسخة الاحتياطية", Toast.LENGTH_LONG).show();
            } else if (requestCode == REQUEST_IMPORT_BACKUP) {
                String json;
                try (InputStream input = getContentResolver().openInputStream(uri);
                     ByteArrayOutputStream output = new ByteArrayOutputStream()) {
                    if (input == null) throw new IllegalStateException("تعذر فتح ملف النسخة");
                    byte[] buffer = new byte[8192];
                    int count;
                    while ((count = input.read(buffer)) != -1) output.write(buffer, 0, count);
                    json = output.toString(StandardCharsets.UTF_8.name());
                }
                final String safeJson = JSONObject.quote(json);
                webView.post(() -> webView.evaluateJavascript(
                    "window.receiveAndroidBackup(" + safeJson + ");", null));
            }
        } catch (Exception error) {
            pendingBackupJson = null;
            Toast.makeText(this, "تعذر التعامل مع النسخة الاحتياطية: " +
                (error.getMessage() == null ? "خطأ غير معروف" : error.getMessage()),
                Toast.LENGTH_LONG).show();
        }
    }

    @Override
    public void onBackPressed() {
        if (webView != null && webView.canGoBack()) {
            webView.goBack();
        } else {
            super.onBackPressed();
        }
    }
}
