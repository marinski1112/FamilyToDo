package jp.marinski.familytodo;

import android.Manifest;
import android.app.Activity;
import android.app.AlertDialog;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.os.Build;
import android.os.Bundle;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Button;
import android.widget.EditText;
import android.widget.LinearLayout;
import android.widget.Toast;

public final class MainActivity extends Activity {
    private static final String ORIGIN = "https://familytodo.marinski1112.workers.dev";
    private WebView web;
    @Override public void onCreate(Bundle state) {
        super.onCreate(state);
        LinearLayout layout = new LinearLayout(this); layout.setOrientation(LinearLayout.VERTICAL);
        Button settings = new Button(this); settings.setText("Android位置設定"); settings.setOnClickListener(v -> showSettings());
        web = new WebView(this); web.getSettings().setJavaScriptEnabled(true); web.getSettings().setDomStorageEnabled(true);
        web.setWebViewClient(new WebViewClient() {
            @Override public boolean shouldOverrideUrlLoading(WebView view, android.webkit.WebResourceRequest request) {
                if (ORIGIN.equals(request.getUrl().getScheme() + "://" + request.getUrl().getAuthority())) return false;
                startActivity(new Intent(Intent.ACTION_VIEW, request.getUrl())); return true;
            }
        });
        layout.addView(settings); layout.addView(web, new LinearLayout.LayoutParams(-1, 0, 1)); setContentView(layout);
        web.loadUrl(ORIGIN + "/app/tasks.php");
    }
    private void showSettings() {
        LinearLayout box = new LinearLayout(this); box.setOrientation(LinearLayout.VERTICAL); box.setPadding(36, 16, 36, 0);
        EditText id = new EditText(this); id.setHint("端末ID（loc_...）"); id.setSingleLine(true);
        EditText secret = new EditText(this); secret.setHint("Secret（64文字）"); secret.setSingleLine(true);
        box.addView(id); box.addView(secret);
        new AlertDialog.Builder(this).setTitle("位置情報を設定")
            .setMessage("Webの位置情報・端末連携でAndroid接続情報を発行し、共有をONにしてください。開始中は通知を表示します。")
            .setView(box).setPositiveButton("保存して開始", (d, w) -> {
                try {
                    Credentials.save(this, id.getText().toString().trim(), secret.getText().toString().trim());
                    startSharing();
                } catch (Exception e) { Toast.makeText(this, "端末IDとSecretを確認してください", Toast.LENGTH_LONG).show(); }
            }).setNeutralButton("共有を停止", (d, w) -> stopService(new Intent(this, LocationService.class)))
            .setNegativeButton("閉じる", null).show();
    }
    private void startSharing() {
        if (checkSelfPermission(Manifest.permission.ACCESS_FINE_LOCATION) != PackageManager.PERMISSION_GRANTED &&
            checkSelfPermission(Manifest.permission.ACCESS_COARSE_LOCATION) != PackageManager.PERMISSION_GRANTED) {
            requestPermissions(new String[]{Manifest.permission.ACCESS_FINE_LOCATION, Manifest.permission.ACCESS_COARSE_LOCATION}, 11); return;
        }
        if (Build.VERSION.SDK_INT >= 33 && checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) {
            requestPermissions(new String[]{Manifest.permission.POST_NOTIFICATIONS}, 12); return;
        }
        startForegroundService(new Intent(this, LocationService.class));
    }
    @Override public void onRequestPermissionsResult(int code, String[] permissions, int[] grants) {
        super.onRequestPermissionsResult(code, permissions, grants);
        if (grants.length > 0 && grants[0] == PackageManager.PERMISSION_GRANTED) startSharing();
        else Toast.makeText(this, "位置共有には権限が必要です", Toast.LENGTH_LONG).show();
    }
    @Override public void onBackPressed() { if (web.canGoBack()) web.goBack(); else super.onBackPressed(); }
    @Override protected void onDestroy() { web.destroy(); super.onDestroy(); }
}
