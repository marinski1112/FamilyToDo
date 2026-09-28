package jp.marinski.familytodo;

import android.Manifest;
import android.app.Activity;
import android.app.AlertDialog;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.os.Build;
import android.os.Bundle;
import android.webkit.WebResourceRequest;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Button;
import android.widget.CheckBox;
import android.widget.EditText;
import android.widget.LinearLayout;
import android.widget.ScrollView;
import android.widget.TextView;
import android.widget.Toast;
import org.json.JSONArray;
import org.json.JSONObject;
import java.time.YearMonth;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/** Native Calendar and Goods screens; a WebView is used only for the existing sign-in flow. */
public final class MainActivity extends Activity {
    private final ExecutorService network = Executors.newSingleThreadExecutor();
    private LinearLayout root, content;
    private WebView login;
    private JSONObject snapshot;
    private final Map<String,JSONObject> monthCache = new ConcurrentHashMap<>();
    private YearMonth month = YearMonth.now(java.time.ZoneId.of("Asia/Tokyo"));
    private String tab = "calendar";
    @Override public void onCreate(Bundle state) { super.onCreate(state); showNative(); load(); }
    private Button button(String label, Runnable action) {
        Button b = new Button(this); b.setText(label); b.setOnClickListener(v -> action.run()); return b;
    }
    private TextView label(String value) { TextView t = new TextView(this); t.setText(value); t.setTextSize(17); t.setPadding(12, 12, 12, 12); return t; }
    private void showNative() {
        if (login != null) { login.destroy(); login = null; }
        root = new LinearLayout(this); root.setOrientation(LinearLayout.VERTICAL);
        LinearLayout tabs = new LinearLayout(this);
        tabs.addView(button("カレンダー", () -> { tab="calendar"; render(); }), new LinearLayout.LayoutParams(0, -2, 1));
        tabs.addView(button("買い物", () -> { tab="shopping"; render(); }), new LinearLayout.LayoutParams(0, -2, 1));
        tabs.addView(button("持ち物", () -> { tab="item"; render(); }), new LinearLayout.LayoutParams(0, -2, 1));
        root.addView(tabs);
        LinearLayout controls = new LinearLayout(this);
        controls.addView(button("◀", () -> { month=month.minusMonths(1); load(); }));
        controls.addView(button("更新", this::load));
        controls.addView(button("▶", () -> { month=month.plusMonths(1); load(); }));
        controls.addView(button("位置設定", this::showSettings));
        root.addView(controls);
        ScrollView scroll = new ScrollView(this); content = new LinearLayout(this); content.setOrientation(LinearLayout.VERTICAL);
        scroll.addView(content); root.addView(scroll, new LinearLayout.LayoutParams(-1, 0, 1)); setContentView(root);
        render();
    }
    private void load() {
        String requested = month.toString();
        snapshot = monthCache.get(requested);
        render();
        network.execute(() -> {
            try {
                JSONObject data = ApiClient.request("/api/android/overview?month=" + requested, null);
                runOnUiThread(() -> {
                    monthCache.put(requested, data);
                    if (requested.equals(month.toString())) { snapshot=data; render(); }
                });
                for (String nearby : new String[]{YearMonth.parse(requested).minusMonths(1).toString(), YearMonth.parse(requested).plusMonths(1).toString()}) {
                    if (!monthCache.containsKey(nearby)) {
                        JSONObject prefetched = ApiClient.request("/api/android/overview?month=" + nearby, null);
                        runOnUiThread(() -> monthCache.put(nearby, prefetched));
                    }
                }
            } catch (SecurityException e) { runOnUiThread(() -> { monthCache.clear(); snapshot=null; showLogin(); }); }
            catch (Exception e) { runOnUiThread(() -> { if (snapshot == null) { content.removeAllViews(); content.addView(label("読み込めませんでした。更新を押してください。")); } }); }
        });
    }
    private void render() {
        if (content == null) return;
        content.removeAllViews();
        content.addView(label(month.getYear() + "年" + month.getMonthValue() + "月"));
        if (snapshot == null || !month.toString().equals(snapshot.optString("month"))) { content.addView(label("読み込み中…")); return; }
        if (snapshot.optBoolean("truncated")) content.addView(label("項目が多いため一部のみ表示しています。"));
        if (tab.equals("calendar")) renderCalendar(); else renderGoods();
    }
    private String dateValue(JSONObject row, String primary, String fallback) {
        String first = row.isNull(primary) ? "" : row.optString(primary, "");
        if (!first.isEmpty()) return first;
        return row.isNull(fallback) ? "" : row.optString(fallback, "");
    }
    private void renderCalendar() {
        JSONArray tasks = snapshot.optJSONArray("tasks"); if (tasks == null) return;
        for (int date=1; date<=month.lengthOfMonth(); date++) {
            String day = month.atDay(date).toString();
            LinearLayout group = new LinearLayout(this); group.setOrientation(LinearLayout.VERTICAL);
            group.addView(label(day)); int count=0;
            for (int n=0; n<tasks.length(); n++) {
                JSONObject task=tasks.optJSONObject(n); if (task==null) continue;
                String start=dateValue(task,"start_at","due_at");
                String end=dateValue(task,"end_at","start_at");
                if (end.isEmpty()) end=start;
                if (start.length()<10 || day.compareTo(start.substring(0,10))<0 || (end.length()>=10 && day.compareTo(end.substring(0,10))>0)) continue;
                boolean event="EVENT".equalsIgnoreCase(task.optString("task_kind"));
                CheckBox box=new CheckBox(this); box.setText((event?"📌 ":"")+task.optString("title"));
                box.setChecked("completed".equals(task.optString("status"))); box.setEnabled(!event);
                int recurrenceId=task.optInt("recurrence_occurrence_id");
                int id=recurrenceId>0?recurrenceId:task.optInt("id");
                box.setEnabled(!event && id>0);
                box.setOnClickListener(v -> toggle(recurrenceId>0?"recurrence":"task", id, box));
                group.addView(box); count++;
            }
            if (count>0) content.addView(group);
        }
    }
    private void renderGoods() {
        boolean shopping=tab.equals("shopping");
        content.addView(button(shopping?"＋買い物を追加":"＋持ち物を追加", () -> addGoods(shopping)));
        JSONArray rows=snapshot.optJSONArray(shopping?"shopping":"items"); if (rows==null) return;
        for (int n=0; n<rows.length(); n++) {
            JSONObject row=rows.optJSONObject(n); if (row==null) continue;
            CheckBox box=new CheckBox(this); box.setText(row.optString("category", "未分類") + "  " + row.optString("name") +
                (shopping?" ×"+row.optString("quantity", "1"):""));
            box.setChecked("completed".equals(row.optString("status")));
            box.setOnClickListener(v -> toggle(shopping?"shopping":"item", row.optInt("id"), box)); content.addView(box);
        }
    }
    private void toggle(String type, int id, CheckBox box) {
        box.setEnabled(false); boolean completed=box.isChecked();
        network.execute(() -> {
            try { ApiClient.request("/api/toggle", new JSONObject().put("type", type).put("id", id)
                .put("completed", completed).put("csrf", snapshot.getString("csrf")));
                runOnUiThread(this::load);
            } catch (Exception e) { runOnUiThread(() -> { box.setChecked(!completed); box.setEnabled(true); Toast.makeText(this, "更新できませんでした", Toast.LENGTH_SHORT).show(); }); }
        });
    }
    private void addGoods(boolean shopping) {
        EditText input=new EditText(this); input.setHint(shopping?"買い物名":"持ち物名");
        new AlertDialog.Builder(this).setTitle(shopping?"買い物を追加":"持ち物を追加").setView(input)
            .setPositiveButton("追加", (d,w) -> {
                String name=input.getText().toString().trim(); if (name.isEmpty()) return;
                network.execute(() -> {
                    try { ApiClient.request(shopping?"/api/shopping":"/api/item",new JSONObject()
                        .put("action","add").put("name",name).put("csrf",snapshot.getString("csrf"))
                        .put("client_request_id",java.util.UUID.randomUUID().toString()));
                        runOnUiThread(this::load);
                    } catch (Exception e) { runOnUiThread(() -> Toast.makeText(this,"追加できませんでした",Toast.LENGTH_SHORT).show()); }
                });
            }).setNegativeButton("閉じる",null).show();
    }
    private void showLogin() {
        if (login != null) return;
        login = new WebView(this); login.getSettings().setJavaScriptEnabled(true); login.getSettings().setDomStorageEnabled(true);
        LinearLayout frame=new LinearLayout(this); frame.setOrientation(LinearLayout.VERTICAL);
        frame.addView(button("ログイン後、ネイティブ画面に戻る", () -> { showNative(); load(); }));
        frame.addView(login,new LinearLayout.LayoutParams(-1,0,1)); setContentView(frame);
        login.setWebViewClient(new WebViewClient() {
            @Override public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                String host=request.getUrl().getHost();
                if ("familytodo.marinski1112.workers.dev".equals(host) || "access.line.me".equals(host)) return false;
                startActivity(new Intent(Intent.ACTION_VIEW,request.getUrl())); return true;
            }
        });
        login.loadUrl(ApiClient.ORIGIN+"/login.php");
    }
    private void showSettings() {
        LinearLayout box = new LinearLayout(this); box.setOrientation(LinearLayout.VERTICAL); box.setPadding(36,16,36,0);
        EditText id=new EditText(this); id.setHint("端末ID（loc_...）"); id.setSingleLine(true);
        EditText secret=new EditText(this); secret.setHint("Secret（64文字）"); secret.setSingleLine(true);
        box.addView(id); box.addView(secret);
        new AlertDialog.Builder(this).setTitle("位置情報を設定")
            .setMessage("Webの位置情報設定でAndroid端末を発行し、共有をONにしてください。共有中は通知を表示します。")
            .setView(box).setPositiveButton("保存して開始",(d,w)->{
                try { Credentials.save(this,id.getText().toString().trim(),secret.getText().toString().trim()); startSharing(); }
                catch(Exception e) { Toast.makeText(this,"端末IDとSecretを確認してください",Toast.LENGTH_LONG).show(); }
            }).setNeutralButton("共有を停止",(d,w)->stopService(new Intent(this,LocationService.class)))
            .setNegativeButton("閉じる",null).show();
    }
    private void startSharing() {
        if (checkSelfPermission(Manifest.permission.ACCESS_FINE_LOCATION)!=PackageManager.PERMISSION_GRANTED &&
            checkSelfPermission(Manifest.permission.ACCESS_COARSE_LOCATION)!=PackageManager.PERMISSION_GRANTED) {
            requestPermissions(new String[]{Manifest.permission.ACCESS_FINE_LOCATION,Manifest.permission.ACCESS_COARSE_LOCATION},11); return;
        }
        if (Build.VERSION.SDK_INT>=33 && checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS)!=PackageManager.PERMISSION_GRANTED) {
            requestPermissions(new String[]{Manifest.permission.POST_NOTIFICATIONS},12); return;
        }
        startForegroundService(new Intent(this,LocationService.class));
    }
    @Override public void onRequestPermissionsResult(int code,String[] permissions,int[] grants) {
        super.onRequestPermissionsResult(code,permissions,grants);
        if (grants.length>0 && grants[0]==PackageManager.PERMISSION_GRANTED) startSharing();
        else Toast.makeText(this,"位置共有には権限が必要です",Toast.LENGTH_LONG).show();
    }
    @Override public void onBackPressed() { if (login!=null && login.canGoBack()) login.goBack(); else super.onBackPressed(); }
    @Override protected void onDestroy() { network.shutdownNow(); if (login!=null) login.destroy(); super.onDestroy(); }
}
