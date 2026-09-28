package jp.marinski.familytodo;

import android.Manifest;
import android.app.Activity;
import android.app.AlertDialog;
import android.app.DatePickerDialog;
import android.app.TimePickerDialog;
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
import android.widget.Spinner;
import android.widget.ArrayAdapter;
import android.widget.ImageView;
import android.widget.HorizontalScrollView;
import android.graphics.Bitmap;
import android.util.LruCache;
import android.widget.TextView;
import android.widget.Toast;
import org.json.JSONArray;
import org.json.JSONObject;
import java.time.YearMonth;
import java.time.LocalDate;
import java.util.Map;
import java.util.ArrayList;
import java.util.LinkedHashSet;
import java.util.HashSet;
import java.util.HashMap;
import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/** Native Calendar and Goods screens; a WebView is used only for the existing sign-in flow. */
public final class MainActivity extends Activity {
    private final ExecutorService network = Executors.newSingleThreadExecutor();
    private LinearLayout root, content;
    private WebView login;
    private JSONObject snapshot;
    private JSONArray messages = new JSONArray();
    private JSONObject familyLog;
    private JSONObject shoppingCategories, itemCategories;
    private MessagePhotoUpload.Draft pendingPhoto;
    private String pendingPhotoCaption="",pendingPhotoReminder="";
    private boolean photoSending;
    private final Map<String,JSONArray> stampMonths=new ConcurrentHashMap<>();
    private final LruCache<String,Bitmap> stampImages=new LruCache<String,Bitmap>(8*1024) {
        @Override protected int sizeOf(String key,Bitmap value) { return Math.max(1,value.getByteCount()/1024); }
    };
    private final Set<String> pendingStampImages=new HashSet<>();
    private boolean hasOlderMessages;
    private int sessionEpoch;
    private boolean showingCached;
    private final Map<String,JSONObject> monthCache = new ConcurrentHashMap<>();
    private YearMonth month = YearMonth.now(java.time.ZoneId.of("Asia/Tokyo"));
    private LocalDate selectedDay=LocalDate.now(java.time.ZoneId.of("Asia/Tokyo"));
    private String tab = "calendar";
    @Override public void onCreate(Bundle state) { super.onCreate(state); showNative(); load(); }
    private Button button(String label, Runnable action) {
        Button b = new Button(this); b.setText(label); b.setOnClickListener(v -> action.run()); return b;
    }
    private TextView label(String value) { TextView t = new TextView(this); t.setText(value); t.setTextSize(17); t.setPadding(12, 12, 12, 12); return t; }
    private void showNative() {
        if (login != null) {
            login.destroy(); login = null;
            monthCache.clear(); snapshot=null; messages=new JSONArray(); familyLog=null;
            shoppingCategories=null; itemCategories=null; stampMonths.clear(); stampImages.evictAll();
        }
        root = new LinearLayout(this); root.setOrientation(LinearLayout.VERTICAL);
        LinearLayout tabs = new LinearLayout(this);
        tabs.addView(button("カレンダー", () -> { tab="calendar"; if(snapshot==null || !month.toString().equals(snapshot.optString("month"))) load(); else render(); }), new LinearLayout.LayoutParams(0, -2, 1));
        tabs.addView(button("買い物", () -> { tab="shopping"; if(snapshot==null || !month.toString().equals(snapshot.optString("month"))) load(); else render(); }), new LinearLayout.LayoutParams(0, -2, 1));
        tabs.addView(button("持ち物", () -> { tab="item"; if(snapshot==null || !month.toString().equals(snapshot.optString("month"))) load(); else render(); }), new LinearLayout.LayoutParams(0, -2, 1));
        tabs.addView(button("伝言", () -> { tab="messages"; loadMessages(0); }), new LinearLayout.LayoutParams(0, -2, 1));
        tabs.addView(button("育児", () -> { tab="familylog"; loadFamilyLog(); }), new LinearLayout.LayoutParams(0, -2, 1));
        root.addView(tabs);
        LinearLayout controls = new LinearLayout(this);
        controls.addView(button("◀", () -> { month=month.minusMonths(1); selectedDay=month.atDay(1); load(); }));
        controls.addView(button("更新", this::load));
        controls.addView(button("▶", () -> { month=month.plusMonths(1); selectedDay=month.atDay(1); load(); }));
        controls.addView(button("位置設定", this::showSettings));
        controls.addView(button("ログアウト", this::logout));
        HorizontalScrollView controlScroll=new HorizontalScrollView(this); controlScroll.addView(controls);
        root.addView(controlScroll);
        ScrollView scroll = new ScrollView(this); content = new LinearLayout(this); content.setOrientation(LinearLayout.VERTICAL);
        scroll.addView(content); root.addView(scroll, new LinearLayout.LayoutParams(-1, 0, 1)); setContentView(root);
        render();
    }
    private void load() {
        String requested = month.toString();
        int epoch=sessionEpoch;
        snapshot = monthCache.get(requested);
        showingCached=snapshot!=null;
        render();
        network.execute(() -> {
            if(snapshot==null) {
                JSONObject cached=SnapshotCache.read(this,requested);
                if(cached!=null) runOnUiThread(() -> {
                    if(epoch!=sessionEpoch) return;
                    monthCache.put(requested,cached);
                    if(requested.equals(month.toString())&&snapshot==null) { snapshot=cached; showingCached=true; render(); }
                });
            }
            try {
                JSONObject data = ApiClient.request("/api/android/v1/overview?month=" + requested, null);
                if(epoch!=sessionEpoch) return;
                Map<String,JSONObject> fetched=new HashMap<>(); fetched.put(requested,data);
                JSONObject previous=monthCache.get(requested);
                boolean accountChanged=previous!=null && (previous.optInt("familyId")!=data.optInt("familyId") || previous.optInt("memberId")!=data.optInt("memberId"));
                if(accountChanged) SnapshotCache.clear(this);
                runOnUiThread(() -> {
                    if(epoch!=sessionEpoch) return;
                    if(accountChanged) { monthCache.clear(); messages=new JSONArray(); familyLog=null; shoppingCategories=null; itemCategories=null; stampMonths.clear(); stampImages.evictAll(); pendingStampImages.clear(); }
                    monthCache.put(requested, data);
                    if (requested.equals(month.toString())) { snapshot=data; showingCached=false; render(); }
                });
                for (boolean shopping : new boolean[]{true,false}) {
                    try {
                        JSONObject categories=ApiClient.request(shopping?"/api/shopping-categories":"/api/item",null);
                        runOnUiThread(() -> {
                            if(epoch!=sessionEpoch) return;
                            if(shopping) shoppingCategories=categories; else itemCategories=categories;
                            if(tab.equals(shopping?"shopping":"item")) render();
                        });
                    } catch(Exception ignored) { /* The checklist remains available. */ }
                }
                try {
                    YearMonth target=YearMonth.parse(requested);
                    JSONObject response=ApiClient.request("/api/calendar-stamps?from="+target.atDay(1)+"&to="+target.atEndOfMonth(),null);
                    JSONArray stamps=response.optJSONArray("stamps");
                    if(stamps!=null) runOnUiThread(() -> {
                        if(epoch!=sessionEpoch) return;
                        stampMonths.put(requested,stamps);
                        if(tab.equals("calendar")&&requested.equals(month.toString())) render();
                    });
                } catch(Exception ignored) { /* Calendar tasks remain usable. */ }
                for (String nearby : new String[]{YearMonth.parse(requested).minusMonths(1).toString(), YearMonth.parse(requested).plusMonths(1).toString()}) {
                    if (epoch!=sessionEpoch) return;
                    if (!monthCache.containsKey(nearby)) {
                        JSONObject prefetched = ApiClient.request("/api/android/v1/overview?month=" + nearby, null);
                        if(prefetched.optInt("schemaVersion")!=1) return;
                        if(prefetched.optInt("familyId")!=data.optInt("familyId") || prefetched.optInt("memberId")!=data.optInt("memberId")) return;
                        fetched.put(nearby,prefetched);
                        runOnUiThread(() -> { if(epoch==sessionEpoch) monthCache.put(nearby, prefetched); });
                    }
                }
                if(epoch==sessionEpoch) {
                    for(Map.Entry<String,JSONObject> entry:monthCache.entrySet()) {
                        JSONObject value=entry.getValue();
                        if(value.optInt("familyId")==data.optInt("familyId") && value.optInt("memberId")==data.optInt("memberId"))
                            fetched.putIfAbsent(entry.getKey(),value);
                    }
                    for(Map.Entry<String,JSONObject> entry:fetched.entrySet())
                        SnapshotCache.write(this,entry.getKey(),entry.getValue());
                }
            } catch (SecurityException e) { runOnUiThread(() -> { if(epoch!=sessionEpoch) return; monthCache.clear(); snapshot=null; SnapshotCache.clear(this); showLogin(); }); }
            catch (Exception e) { runOnUiThread(() -> { if (snapshot == null) { content.removeAllViews(); content.addView(label("読み込めませんでした。更新を押してください。")); } }); }
        });
    }
    private void render() {
        if (content == null) return;
        content.removeAllViews();
        if (tab.equals("messages")) { renderMessages(); return; }
        if (tab.equals("familylog")) { renderFamilyLog(); return; }
        content.addView(label(month.getYear() + "年" + month.getMonthValue() + "月"));
        if (tab.equals("calendar")) content.addView(button("＋ タスク・イベント", this::addTask));
        if (snapshot == null || !month.toString().equals(snapshot.optString("month"))) { content.addView(label("読み込み中…")); return; }
        if (showingCached) content.addView(label("保存済みデータを表示中・更新を確認しています"));
        if (snapshot.optBoolean("truncated")) content.addView(label("項目が多いため一部のみ表示しています。"));
        if (tab.equals("calendar")) renderCalendar(); else renderGoods();
    }
    private String dateValue(JSONObject row, String primary, String fallback) {
        String first = row.isNull(primary) ? "" : row.optString(primary, "");
        if (!first.isEmpty()) return first;
        return row.isNull(fallback) ? "" : row.optString(fallback, "");
    }
    private boolean taskOnDay(JSONObject task,String day) {
        String start=dateValue(task,"start_at","due_at");
        String end=dateValue(task,"end_at","start_at");
        if(end.isEmpty()) end=start;
        return start.length()>=10 && day.compareTo(start.substring(0,10))>=0 &&
            (end.length()<10 || day.compareTo(end.substring(0,10))<=0);
    }
    private void renderCalendar() {
        JSONArray tasks=snapshot.optJSONArray("tasks"); if(tasks==null) return;
        content.addView(button("＋ スタンプ",this::addStamp));
        LinearLayout weekdays=new LinearLayout(this);
        for(String weekday:new String[]{"日","月","火","水","木","金","土"})
            weekdays.addView(label(weekday),new LinearLayout.LayoutParams(0,-2,1));
        content.addView(weekdays);
        int offset=month.atDay(1).getDayOfWeek().getValue()%7;
        for(int row=0;row<6;row++) {
            LinearLayout week=new LinearLayout(this);
            for(int column=0;column<7;column++) {
                int date=row*7+column-offset;
                if(date<1||date>month.lengthOfMonth()) {
                    week.addView(new TextView(this),new LinearLayout.LayoutParams(0,-2,1)); continue;
                }
                LocalDate day=month.atDay(date); int count=0;
                for(int n=0;n<tasks.length();n++) {
                    JSONObject task=tasks.optJSONObject(n);
                    if(task!=null&&taskOnDay(task,day.toString())) count++;
                }
                int stampCount=stampsOnDay(day.toString()).length();
                Button cell=button(Integer.toString(date)+(count>0?" •":"")+(stampCount>0?" ✦":""),()->{selectedDay=day; render();});
                cell.setContentDescription(day.toString()+" 予定"+count+"件");
                cell.setAllCaps(false); cell.setTextSize(12);
                cell.setAlpha(day.equals(selectedDay)?1f:0.78f);
                week.addView(cell,new LinearLayout.LayoutParams(0,-2,1));
            }
            content.addView(week);
        }
        content.addView(label(selectedDay.toString()+" の予定"));
        renderSelectedStamps();
        int count=0;
        for(int n=0;n<tasks.length();n++) {
            JSONObject task=tasks.optJSONObject(n);
            if(task==null||!taskOnDay(task,selectedDay.toString())) continue;
            boolean event="EVENT".equalsIgnoreCase(task.optString("task_kind"));
            String start=dateValue(task,"start_at","due_at");
            String time=task.optInt("all_day")!=1 && start.length()>=16?start.substring(11,16)+"  ":"";
            CheckBox box=new CheckBox(this); box.setText(time+(event?"📌 ":"")+task.optString("title"));
            box.setChecked("completed".equals(task.optString("status")));
            int recurrenceId=task.optInt("recurrence_occurrence_id");
            int id=recurrenceId>0?recurrenceId:task.optInt("id");
            box.setEnabled(!event&&id>0);
            box.setOnClickListener(v->toggle(recurrenceId>0?"recurrence":"task",id,box));
            content.addView(box);count++;
        }
        if(count==0) content.addView(label("予定はありません"));
    }
    private JSONArray stampsOnDay(String day) {
        JSONArray result=new JSONArray();
        JSONArray placements=stampMonths.get(month.toString());
        if(placements!=null) for(int i=0;i<placements.length();i++) {
            JSONObject stamp=placements.optJSONObject(i);
            if(stamp!=null && day.equals(stamp.optString("date"))) result.put(stamp);
        }
        return result;
    }
    private void renderSelectedStamps() {
        JSONArray stamps=stampsOnDay(selectedDay.toString());
        if(stamps.length()==0) return;
        content.addView(label("スタンプ"));
        LinearLayout row=new LinearLayout(this);
        for(int i=0;i<Math.min(stamps.length(),12);i++) {
            JSONObject stamp=stamps.optJSONObject(i); if(stamp==null) continue;
            String path=stamp.optString("thumbnailUrl"); if(path.isEmpty()) continue;
            ImageView view=new ImageView(this);
            int size=(int)(64*getResources().getDisplayMetrics().density);
            row.addView(view,new LinearLayout.LayoutParams(size,size));
            view.setContentDescription("スタンプの操作");
            view.setOnClickListener(v -> stampActions(stamp));
            Bitmap cached=stampImages.get(path);
            if(cached!=null) { view.setImageBitmap(cached); continue; }
            if(!pendingStampImages.add(path)) continue;
            int epoch=sessionEpoch;
            network.execute(() -> {
                Bitmap image=null;
                try { image=ApiClient.thumbnail(path); } catch(Exception ignored) { }
                Bitmap result=image;
                runOnUiThread(() -> {
                    pendingStampImages.remove(path);
                    if(epoch!=sessionEpoch || result==null) return;
                    stampImages.put(path,result);
                    if(tab.equals("calendar")) render();
                });
            });
        }
        HorizontalScrollView horizontal=new HorizontalScrollView(this); horizontal.addView(row);
        content.addView(horizontal);
        if(stamps.length()>12) content.addView(label("ほか "+(stamps.length()-12)+" 件"));
    }
    private void stampActions(JSONObject stamp) {
        new AlertDialog.Builder(this).setTitle("スタンプの操作")
            .setItems(new String[]{"先頭へ移動","末尾へ移動","別の日に移動","削除"},(dialog,which) -> {
                if(which<2) reorderStamp(stamp,which==0);
                else if(which==2) moveStamp(stamp); else deleteStamp(stamp);
            }).show();
    }
    private void reorderStamp(JSONObject stamp,boolean first) {
        if(snapshot==null || stamp.optInt("placementId")<=0) return;
        JSONArray stamps=stampsOnDay(stamp.optString("date"));
        if(stamps.length()<2) return;
        int boundary=first?1000:-1000;
        for(int i=0;i<stamps.length();i++) {
            JSONObject row=stamps.optJSONObject(i);
            if(row!=null) boundary=first?Math.min(boundary,row.optInt("sortOrder")):
                Math.max(boundary,row.optInt("sortOrder"));
        }
        if(first && boundary<=-1000 || !first && boundary>=1000) {
            Toast.makeText(this,"並び順の上限に達しました",Toast.LENGTH_SHORT).show(); return;
        }
        int target=first?boundary-1:boundary+1;
        if(stamp.optInt("sortOrder")==target) return;
        String csrf=snapshot.optString("csrf"),day=stamp.optString("date");
        String scope=stamp.optString("visibilityScope","FAMILY"); int id=stamp.optInt("placementId"),epoch=sessionEpoch;
        network.execute(() -> {
            try {
                if(epoch!=sessionEpoch) return;
                ApiClient.request("/api/calendar-stamp-placement",new JSONObject().put("action","move")
                    .put("csrf",csrf).put("placementId",id).put("stampDate",day)
                    .put("visibilityScope",scope).put("sortOrder",target));
                if(epoch==sessionEpoch) runOnUiThread(this::load);
            } catch(Exception error) {
                runOnUiThread(() -> { if(epoch==sessionEpoch) Toast.makeText(this,"並び順を変更できませんでした",Toast.LENGTH_SHORT).show(); });
            }
        });
    }
    private void moveStamp(JSONObject stamp) {
        int placementId=stamp.optInt("placementId");
        if(snapshot==null || placementId<=0) return;
        LocalDate current;
        try { current=LocalDate.parse(stamp.optString("date")); }
        catch(Exception error) { return; }
        new DatePickerDialog(this,(picker,y,m,d) -> {
            String day=LocalDate.of(y,m+1,d).toString();
            if(day.equals(stamp.optString("date"))) return;
            String csrf=snapshot.optString("csrf"), scope=stamp.optString("visibilityScope","FAMILY");
            int order=stamp.optInt("sortOrder"),epoch=sessionEpoch;
            network.execute(() -> {
                try {
                    if(epoch!=sessionEpoch) return;
                    ApiClient.request("/api/calendar-stamp-placement",new JSONObject()
                        .put("action","move").put("csrf",csrf).put("placementId",placementId)
                        .put("stampDate",day).put("visibilityScope",scope).put("sortOrder",order));
                    if(epoch==sessionEpoch) runOnUiThread(this::load);
                } catch(Exception error) {
                    runOnUiThread(() -> { if(epoch==sessionEpoch) Toast.makeText(this,"スタンプを移動できませんでした",Toast.LENGTH_SHORT).show(); });
                }
            });
        },current.getYear(),current.getMonthValue()-1,current.getDayOfMonth()).show();
    }
    private void addStamp() {
        if(snapshot==null) return;
        String day=selectedDay.toString(), csrf=snapshot.optString("csrf"); int epoch=sessionEpoch;
        network.execute(() -> {
            try {
                JSONObject result=ApiClient.request("/api/calendar-stamp-options",null);
                JSONArray options=result.optJSONArray("options");
                runOnUiThread(() -> {
                    if(epoch!=sessionEpoch || options==null) return;
                    if(options.length()==0) { Toast.makeText(this,"使えるスタンプがありません",Toast.LENGTH_SHORT).show(); return; }
                    ArrayList<String> names=new ArrayList<>();
                    for(int i=0;i<options.length();i++) {
                        JSONObject option=options.optJSONObject(i);
                        names.add(option==null?"スタンプ":option.optString("name","スタンプ"));
                    }
                    new AlertDialog.Builder(this).setTitle(day+" のスタンプ")
                        .setItems(names.toArray(new String[0]),(dialog,which) -> {
                            JSONObject chosen=options.optJSONObject(which);
                            if(chosen==null || chosen.optInt("id")<=0) return;
                            new AlertDialog.Builder(this).setTitle("公開範囲")
                                .setItems(new String[]{"家族全員","自分だけ"},(scopeDialog,scope) -> {
                                    int assetId=chosen.optInt("id");
                                    network.execute(() -> {
                                        try {
                                            if(epoch!=sessionEpoch) return;
                                            ApiClient.request("/api/calendar-stamp-placement",new JSONObject()
                                                .put("csrf",csrf).put("assetId",assetId).put("stampDate",day)
                                                .put("visibilityScope",scope==0?"FAMILY":"PRIVATE"));
                                            if(epoch==sessionEpoch) runOnUiThread(this::load);
                                        } catch(Exception error) {
                                            runOnUiThread(() -> { if(epoch==sessionEpoch) Toast.makeText(this,"スタンプを配置できませんでした",Toast.LENGTH_SHORT).show(); });
                                        }
                                    });
                                }).show();
                        }).show();
                });
            } catch(Exception error) {
                runOnUiThread(() -> { if(epoch==sessionEpoch) Toast.makeText(this,"スタンプ一覧を取得できませんでした",Toast.LENGTH_SHORT).show(); });
            }
        });
    }
    private void deleteStamp(JSONObject stamp) {
        int placementId=stamp.optInt("placementId");
        if(snapshot==null || placementId<=0) return;
        new AlertDialog.Builder(this).setTitle("スタンプを削除")
            .setMessage("自分が置いたスタンプのみ、この日から取り除けます。")
            .setPositiveButton("削除",(dialog,which) -> {
                String csrf=snapshot.optString("csrf"); int epoch=sessionEpoch;
                network.execute(() -> {
                    try {
                        if(epoch!=sessionEpoch) return;
                        ApiClient.request("/api/calendar-stamp-placement",new JSONObject()
                            .put("csrf",csrf).put("placementId",placementId),"DELETE");
                        if(epoch==sessionEpoch) runOnUiThread(this::load);
                    } catch(Exception error) {
                        runOnUiThread(() -> { if(epoch==sessionEpoch) Toast.makeText(this,"スタンプを削除できませんでした",Toast.LENGTH_SHORT).show(); });
                    }
                });
            }).setNegativeButton("閉じる",null).show();
    }
    private void renderGoods() {
        boolean shopping=tab.equals("shopping");
        content.addView(button(shopping?"＋買い物を追加":"＋持ち物を追加", () -> addGoods(shopping)));
        content.addView(button("＋カテゴリ", () -> addCategory(shopping)));
        JSONArray rows=snapshot.optJSONArray(shopping?"shopping":"items"); if (rows==null) return;
        JSONObject catalog=shopping?shoppingCategories:itemCategories;
        LinkedHashSet<String> names=new LinkedHashSet<>();
        if(catalog!=null) {
            JSONArray order=catalog.optJSONArray("order"), available=catalog.optJSONArray("categories");
            if(order!=null) for(int i=0;i<order.length();i++) if(contains(available,order.optString(i))) names.add(order.optString(i));
            if(available!=null) for(int i=0;i<available.length();i++) names.add(available.optString(i));
        }
        for(int i=0;i<rows.length();i++) {
            JSONObject row=rows.optJSONObject(i); if(row!=null) names.add(category(row));
        }
        for(String category:names) {
            LinearLayout group=new LinearLayout(this); group.setOrientation(LinearLayout.VERTICAL);
            int count=0;
            for(int n=0;n<rows.length();n++) {
                JSONObject row=rows.optJSONObject(n); if(row==null || !category.equals(category(row))) continue;
                CheckBox box=new CheckBox(this);
                box.setText(row.optString("name")+(shopping?" ×"+row.optString("quantity","1"):""));
                box.setChecked("completed".equals(row.optString("status")));
                box.setOnClickListener(v -> toggle(shopping?"shopping":"item",row.optInt("id"),box));
                box.setOnLongClickListener(v -> { goodsActions(shopping,row); return true; });
                group.addView(box); count++;
            }
            if(count>0 || !"未分類".equals(category)) {
                TextView heading=label(category+("未分類".equals(category)?"":"  ⋮"));
                if(!"未分類".equals(category)) heading.setOnClickListener(v -> categoryActions(shopping,category));
                content.addView(heading);
                if(count>0) content.addView(group); else content.addView(label("項目なし"));
            }
        }
    }
    private void goodsActions(boolean shopping,JSONObject row) {
        new AlertDialog.Builder(this).setTitle(row.optString("name"))
            .setItems(new String[]{"詳細を編集","カテゴリを変更","完了履歴","削除"},(dialog,which) -> {
                if(which==0) editGoods(shopping,row);
                else if(which==1) changeGoodsCategory(shopping,row);
                else if(which==2) showGoodsHistory(shopping,row);
                else deleteGoods(shopping,row);
            }).show();
    }
    private void showGoodsHistory(boolean shopping,JSONObject row) {
        int id=row.optInt("id"),epoch=sessionEpoch; if(id<=0) return;
        network.execute(() -> {
            try {
                JSONObject result=ApiClient.request("/api/android/v1/goods-history?kind="+
                    (shopping?"shopping":"item")+"&id="+id,null);
                JSONArray history=result.optJSONArray("history"); StringBuilder lines=new StringBuilder();
                if(history!=null) for(int i=0;i<history.length();i++) {
                    JSONObject entry=history.optJSONObject(i); if(entry==null) continue;
                    if(lines.length()>0) lines.append("\n");
                    lines.append(entry.optString("occurred_at")).append("  ")
                        .append(entry.optString("member_name","家族")).append("  ")
                        .append("COMPLETED".equals(entry.optString("action"))?"完了":"未完了");
                }
                String message=lines.length()==0?"履歴はありません。":lines.toString();
                runOnUiThread(() -> { if(epoch==sessionEpoch) new AlertDialog.Builder(this)
                    .setTitle(row.optString("name")+" の完了履歴").setMessage(message).setPositiveButton("閉じる",null).show(); });
            } catch(Exception error) {
                runOnUiThread(() -> { if(epoch==sessionEpoch) Toast.makeText(this,"履歴を取得できませんでした",Toast.LENGTH_SHORT).show(); });
            }
        });
    }
    private void deleteGoods(boolean shopping,JSONObject row) {
        if(snapshot==null || row.optInt("id")<=0) return;
        new AlertDialog.Builder(this).setTitle(row.optString("name")+" を削除")
            .setMessage("この項目を削除します。完了履歴は既存の保全処理に従います。")
            .setPositiveButton("削除",(dialog,which) -> {
                int id=row.optInt("id"),epoch=sessionEpoch; String csrf=snapshot.optString("csrf");
                network.execute(() -> {
                    try {
                        if(epoch!=sessionEpoch) return;
                        ApiClient.request(shopping?"/api/shopping":"/api/item",new JSONObject()
                            .put("csrf",csrf).put("action","delete").put("id",id));
                        if(epoch==sessionEpoch) runOnUiThread(this::load);
                    } catch(Exception error) {
                        runOnUiThread(() -> { if(epoch==sessionEpoch) Toast.makeText(this,"項目を削除できませんでした",Toast.LENGTH_SHORT).show(); });
                    }
                });
            }).setNegativeButton("戻る",null).show();
    }
    private void editGoods(boolean shopping,JSONObject row) {
        if(snapshot==null || row.optInt("id")<=0) return;
        // The server checks edit rights even if the cached snapshot is stale.
        EditText name=new EditText(this); name.setHint(shopping?"買い物名":"持ち物名"); name.setText(row.optString("name"));
        EditText quantity=new EditText(this); quantity.setHint("数量"); quantity.setText(row.optString("quantity","1"));
        EditText memo=new EditText(this); memo.setHint("メモ"); memo.setText(row.optString("memo",""));
        EditText url=new EditText(this); url.setHint("URL"); url.setText(row.optString("url",""));
        url.setInputType(android.text.InputType.TYPE_CLASS_TEXT|android.text.InputType.TYPE_TEXT_VARIATION_URI);
        ArrayList<String> categories=new ArrayList<>(); categories.add("未分類"); categories.addAll(categoryOrder(shopping));
        String oldCategory=category(row); if(!categories.contains(oldCategory)) categories.add(oldCategory);
        Spinner choice=new Spinner(this); choice.setAdapter(new ArrayAdapter<>(this,android.R.layout.simple_spinner_dropdown_item,categories));
        choice.setSelection(categories.indexOf(oldCategory));
        String rawDate=shopping?row.optString("due_date"):row.optString("due_at");
        final String[] due={rawDate.length()>=10?rawDate.substring(0,10):""};
        final Button[] dateRef=new Button[1];
        Button date=button("日付: "+(due[0].isEmpty()?"指定なし":due[0]),() -> {
            LocalDate current=due[0].isEmpty()?selectedDay:LocalDate.parse(due[0]);
            new DatePickerDialog(this,(picker,y,m,d) -> {
                due[0]=LocalDate.of(y,m+1,d).toString(); dateRef[0].setText("日付: "+due[0]);
            },current.getYear(),current.getMonthValue()-1,current.getDayOfMonth()).show();
        }); dateRef[0]=date;
        LinearLayout form=new LinearLayout(this); form.setOrientation(LinearLayout.VERTICAL); form.setPadding(32,8,32,8);
        form.addView(name); form.addView(label("カテゴリ")); form.addView(choice);
        if(shopping) form.addView(quantity);
        form.addView(memo); form.addView(url); form.addView(date);
        form.addView(button("日付を解除",() -> { due[0]=""; dateRef[0].setText("日付: 指定なし"); }));
        ScrollView scroll=new ScrollView(this); scroll.addView(form);
        new AlertDialog.Builder(this).setTitle(shopping?"買い物を編集":"持ち物を編集").setView(scroll)
            .setPositiveButton("保存",(dialog,which) -> {
                String title=name.getText().toString().trim(),amount=quantity.getText().toString().trim();
                String note=memo.getText().toString().trim(),link=url.getText().toString().trim();
                if(title.isEmpty()||title.length()>200||note.length()>2000||link.length()>2048||shopping&&amount.length()>80) {
                    Toast.makeText(this,"入力内容を確認してください",Toast.LENGTH_SHORT).show(); return;
                }
                String csrf=snapshot.optString("csrf"),cat=categories.get(choice.getSelectedItemPosition());
                int id=row.optInt("id"),epoch=sessionEpoch; String deadline=due[0];
                network.execute(() -> {
                    try {
                        if(epoch!=sessionEpoch) return;
                        ApiClient.request(shopping?"/api/shopping":"/api/item",new JSONObject()
                            .put("csrf",csrf).put("action","update_details").put("id",id).put("name",title)
                            .put("quantity",amount).put("category","未分類".equals(cat)?"":cat)
                            .put("memo",note).put("url",link).put("due_date",deadline));
                        if(epoch==sessionEpoch) runOnUiThread(this::load);
                    } catch(Exception error) {
                        runOnUiThread(() -> { if(epoch==sessionEpoch) Toast.makeText(this,"項目を編集できませんでした",Toast.LENGTH_SHORT).show(); });
                    }
                });
            }).setNegativeButton("閉じる",null).show();
    }
    private void categoryActions(boolean shopping,String name) {
        ArrayList<String> actions=new ArrayList<>();
        actions.add("名前を変更"); actions.add("上へ移動"); actions.add("下へ移動");
        JSONObject catalog=shopping?shoppingCategories:itemCategories;
        if(catalog!=null && catalog.optBoolean("canManageCategories")) actions.add("カテゴリを削除（項目は未分類へ）");
        new AlertDialog.Builder(this).setTitle(name).setItems(actions.toArray(new String[0]),(dialog,which) -> {
            if(which==0) renameCategory(shopping,name);
            else if(which==1 || which==2) moveCategory(shopping,name,which==1?-1:1);
            else if(which==3) deleteCategory(shopping,name);
        }).show();
    }
    private ArrayList<String> categoryOrder(boolean shopping) {
        JSONObject catalog=shopping?shoppingCategories:itemCategories;
        ArrayList<String> names=new ArrayList<>();
        if(catalog==null) return names;
        JSONArray order=catalog.optJSONArray("order"), available=catalog.optJSONArray("categories");
        if(order!=null) for(int i=0;i<order.length();i++) {
            String value=order.optString(i); if(!"未分類".equals(value) && contains(available,value) && !names.contains(value)) names.add(value);
        }
        if(available!=null) for(int i=0;i<available.length();i++) {
            String value=available.optString(i); if(!value.isEmpty() && !"未分類".equals(value) && !names.contains(value)) names.add(value);
        }
        return names;
    }
    private void moveCategory(boolean shopping,String name,int direction) {
        ArrayList<String> names=categoryOrder(shopping);
        int from=names.indexOf(name), to=from+direction;
        if(from<0 || to<0 || to>=names.size()) return;
        java.util.Collections.swap(names,from,to);
        String csrf=snapshot.optString("csrf"), path=shopping?"/api/shopping-categories":"/api/item";
        int epoch=sessionEpoch;
        network.execute(() -> {
            try {
                if(epoch!=sessionEpoch) return;
                ApiClient.request(path,new JSONObject().put("csrf",csrf)
                    .put("action",shopping?"reorder":"category_reorder").put("order",new JSONArray(names)));
                JSONObject updated=ApiClient.request(path,null);
                runOnUiThread(() -> {
                    if(epoch!=sessionEpoch) return;
                    if(shopping) shoppingCategories=updated; else itemCategories=updated;
                    load();
                });
            } catch(Exception error) {
                runOnUiThread(() -> { if(epoch==sessionEpoch) Toast.makeText(this,"並べ替えできませんでした",Toast.LENGTH_SHORT).show(); });
            }
        });
    }
    private void deleteCategory(boolean shopping,String name) {
        if(snapshot==null) return;
        new AlertDialog.Builder(this).setTitle(name+" を削除")
            .setMessage("このカテゴリの項目は削除せず、未分類に移動します。")
            .setPositiveButton("カテゴリを削除",(dialog,which) -> {
                String csrf=snapshot.optString("csrf"); int epoch=sessionEpoch;
                network.execute(() -> {
                    try {
                        if(epoch!=sessionEpoch) return;
                        ApiClient.request("/api/shopping-category-mutation",new JSONObject()
                            .put("csrf",csrf).put("action","delete_many")
                            .put("kind",shopping?"shopping":"item")
                            .put("names",new JSONArray().put(name)).put("item_policy","unclassified"));
                        if(epoch==sessionEpoch) runOnUiThread(this::load);
                    } catch(Exception error) {
                        runOnUiThread(() -> { if(epoch==sessionEpoch) Toast.makeText(this,"カテゴリを削除できませんでした",Toast.LENGTH_SHORT).show(); });
                    }
                });
            }).setNegativeButton("閉じる",null).show();
    }
    private void changeGoodsCategory(boolean shopping,JSONObject row) {
        if(snapshot==null || row.optInt("id")<=0) return;
        ArrayList<String> options=new ArrayList<>(); options.add("未分類");
        options.addAll(categoryOrder(shopping));
        String current=category(row);
        if(!options.contains(current)) options.add(current);
        new AlertDialog.Builder(this).setTitle(row.optString("name")+" のカテゴリ")
            .setSingleChoiceItems(options.toArray(new String[0]),options.indexOf(current),(dialog,which) -> {
                dialog.dismiss(); String selected=options.get(which);
                if(selected.equals(current)) return;
                String csrf=snapshot.optString("csrf"); int id=row.optInt("id"), epoch=sessionEpoch;
                network.execute(() -> {
                    try {
                        if(epoch!=sessionEpoch) return;
                        ApiClient.request(shopping?"/api/shopping":"/api/item",new JSONObject()
                            .put("action","update_category").put("id",id).put("csrf",csrf)
                            .put("category","未分類".equals(selected)?"":selected));
                        if(epoch==sessionEpoch) runOnUiThread(this::load);
                    } catch(Exception error) {
                        runOnUiThread(() -> { if(epoch==sessionEpoch) Toast.makeText(this,"カテゴリを変更できませんでした",Toast.LENGTH_SHORT).show(); });
                    }
                });
            }).setNegativeButton("閉じる",null).show();
    }
    private void renameCategory(boolean shopping,String oldName) {
        if(snapshot==null || "未分類".equals(oldName)) return;
        EditText input=new EditText(this); input.setText(oldName); input.setSingleLine(true);
        new AlertDialog.Builder(this).setTitle("カテゴリ名を変更").setView(input)
            .setPositiveButton("変更",(dialog,which) -> {
                String name=input.getText().toString().trim();
                if(name.isEmpty() || name.length()>255 || "未分類".equals(name) || name.equals(oldName)) return;
                String csrf=snapshot.optString("csrf"); int epoch=sessionEpoch;
                network.execute(() -> {
                    try {
                        if(epoch!=sessionEpoch) return;
                        JSONObject body=new JSONObject().put("csrf",csrf).put("name",oldName).put("new_name",name)
                            .put("action",shopping?"rename":"category_rename");
                        if(shopping) body.put("kind","shopping");
                        ApiClient.request(shopping?"/api/shopping-category-mutation":"/api/item",body);
                        if(epoch==sessionEpoch) runOnUiThread(this::load);
                    } catch(Exception error) {
                        runOnUiThread(() -> { if(epoch==sessionEpoch) Toast.makeText(this,"カテゴリ名を変更できませんでした",Toast.LENGTH_SHORT).show(); });
                    }
                });
            }).setNegativeButton("閉じる",null).show();
    }
    private void addCategory(boolean shopping) {
        if(snapshot==null) return;
        EditText input=new EditText(this); input.setHint("カテゴリ名"); input.setSingleLine(true);
        new AlertDialog.Builder(this).setTitle(shopping?"買い物カテゴリを追加":"持ち物カテゴリを追加")
            .setView(input).setPositiveButton("追加",(dialog,which) -> {
                String name=input.getText().toString().trim();
                if(name.isEmpty() || name.length()>255 || "未分類".equals(name)) {
                    Toast.makeText(this,"カテゴリ名を確認してください",Toast.LENGTH_SHORT).show(); return;
                }
                String csrf=snapshot.optString("csrf"), path=shopping?"/api/shopping-categories":"/api/item";
                int epoch=sessionEpoch;
                network.execute(() -> {
                    try {
                        if(epoch!=sessionEpoch) return;
                        ApiClient.request(path,new JSONObject().put("action",shopping?"add":"category_add")
                            .put("name",name).put("csrf",csrf));
                        JSONObject updated=ApiClient.request(path,null);
                        runOnUiThread(() -> {
                            if(epoch!=sessionEpoch) return;
                            if(shopping) shoppingCategories=updated; else itemCategories=updated;
                            load();
                        });
                    } catch(Exception error) {
                        runOnUiThread(() -> { if(epoch==sessionEpoch) Toast.makeText(this,"カテゴリを追加できませんでした",Toast.LENGTH_SHORT).show(); });
                    }
                });
            }).setNegativeButton("閉じる",null).show();
    }
    private String category(JSONObject row) {
        String value=row.optString("category","").trim(); return value.isEmpty()?"未分類":value;
    }
    private boolean contains(JSONArray values,String target) {
        if(values==null) return false;
        for(int i=0;i<values.length();i++) if(target.equals(values.optString(i))) return true;
        return false;
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
        EditText quantity=new EditText(this); quantity.setHint("数量（例: 2個）"); quantity.setSingleLine(true);
        EditText memo=new EditText(this); memo.setHint("メモ");
        EditText url=new EditText(this); url.setHint("商品・参考URL（任意）"); url.setSingleLine(true);
        url.setInputType(android.text.InputType.TYPE_CLASS_TEXT|android.text.InputType.TYPE_TEXT_VARIATION_URI);
        final String[] due={""};
        final Button[] dateRef=new Button[1];
        Button date=button("期限日: 指定なし",() -> {
            LocalDate current=due[0].isEmpty()?selectedDay:LocalDate.parse(due[0]);
            new DatePickerDialog(this,(picker,y,m,d) -> {
                due[0]=LocalDate.of(y,m+1,d).toString();
                dateRef[0].setText("期限日: "+due[0]);
            },current.getYear(),current.getMonthValue()-1,current.getDayOfMonth()).show();
        });
        dateRef[0]=date;
        Button clearDate=button("期限日を解除",() -> { due[0]=""; dateRef[0].setText("期限日: 指定なし"); });
        JSONObject catalog=shopping?shoppingCategories:itemCategories;
        ArrayList<String> choices=new ArrayList<>(); choices.add("未分類");
        JSONArray available=catalog==null?null:catalog.optJSONArray("categories");
        if(available!=null) for(int i=0;i<available.length();i++) {
            String value=available.optString(i); if(!value.isEmpty()&&!choices.contains(value)) choices.add(value);
        }
        Spinner category=new Spinner(this);
        category.setAdapter(new ArrayAdapter<>(this,android.R.layout.simple_spinner_dropdown_item,choices));
        LinearLayout form=new LinearLayout(this); form.setOrientation(LinearLayout.VERTICAL);
        form.setPadding(32,8,32,8); form.addView(input); form.addView(label("カテゴリ")); form.addView(category);
        if(shopping) form.addView(quantity);
        form.addView(memo); form.addView(url); form.addView(date); form.addView(clearDate);
        ScrollView formScroll=new ScrollView(this); formScroll.addView(form);
        new AlertDialog.Builder(this).setTitle(shopping?"買い物を追加":"持ち物を追加").setView(formScroll)
            .setPositiveButton("追加", (d,w) -> {
                String name=input.getText().toString().trim(); if (name.isEmpty()) return;
                String selected=category.getSelectedItem().toString();
                String csrf=snapshot.optString("csrf");
                String note=memo.getText().toString().trim();
                String amount=quantity.getText().toString().trim();
                String link=url.getText().toString().trim(), deadline=due[0];
                network.execute(() -> {
                    try { ApiClient.request(shopping?"/api/shopping":"/api/item",new JSONObject()
                        .put("action","add").put("name",name).put("csrf",csrf)
                        .put("category","未分類".equals(selected)?"":selected)
                        .put("memo",note).put("quantity",amount.isEmpty()?"1":amount)
                        .put("url",link).put(shopping?"due_date":"date",deadline)
                        .put("client_request_id",java.util.UUID.randomUUID().toString()));
                        runOnUiThread(this::load);
                    } catch (Exception e) { runOnUiThread(() -> Toast.makeText(this,"追加できませんでした",Toast.LENGTH_SHORT).show()); }
                });
            }).setNegativeButton("閉じる",null).show();
    }
    private void addTask() {
        if (snapshot == null) return;
        EditText title=new EditText(this); title.setHint("タイトル"); title.setSingleLine(true);
        final String[] selectedDate={selectedDay.toString()};
        final Button[] dateRef=new Button[1];
        Button date=button("日付: " + selectedDate[0], () -> {
            java.time.LocalDate current=java.time.LocalDate.parse(selectedDate[0]);
            new DatePickerDialog(this,(picker,y,m,d) -> {
                selectedDate[0]=java.time.LocalDate.of(y,m+1,d).toString();
                dateRef[0].setText("日付: " + selectedDate[0]);
            },current.getYear(),current.getMonthValue()-1,current.getDayOfMonth()).show();
        });
        dateRef[0]=date;
        CheckBox event=new CheckBox(this); event.setText("イベントとして登録");
        CheckBox allDay=new CheckBox(this); allDay.setText("終日"); allDay.setChecked(true);
        final String[] startTime={"09:00"}, endTime={"10:00"};
        final Button[] startTimeButton=new Button[1], endTimeButton=new Button[1];
        Button startButton=button("開始: 09:00",() -> new TimePickerDialog(this,(picker,h,m) -> {
            startTime[0]=String.format(java.util.Locale.ROOT,"%02d:%02d",h,m);
            startTimeButton[0].setText("開始: "+startTime[0]);
        },9,0,true).show());
        Button endButton=button("終了: 10:00",() -> new TimePickerDialog(this,(picker,h,m) -> {
            endTime[0]=String.format(java.util.Locale.ROOT,"%02d:%02d",h,m);
            endTimeButton[0].setText("終了: "+endTime[0]);
        },10,0,true).show());
        startTimeButton[0]=startButton; endTimeButton[0]=endButton;
        startButton.setVisibility(android.view.View.GONE); endButton.setVisibility(android.view.View.GONE);
        allDay.setOnCheckedChangeListener((view,checked) -> {
            startButton.setVisibility(checked?android.view.View.GONE:android.view.View.VISIBLE);
            endButton.setVisibility(checked?android.view.View.GONE:android.view.View.VISIBLE);
        });
        EditText description=new EditText(this); description.setHint("説明（任意）");
        EditText location=new EditText(this); location.setHint("場所（任意）");
        LinearLayout form=new LinearLayout(this); form.setOrientation(LinearLayout.VERTICAL);
        form.setPadding(32,8,32,8); form.addView(title); form.addView(date); form.addView(event);
        form.addView(allDay); form.addView(startButton); form.addView(endButton);
        form.addView(description); form.addView(location);
        ScrollView formScroll=new ScrollView(this); formScroll.addView(form);
        new AlertDialog.Builder(this).setTitle("タスク・イベントを作成").setView(formScroll)
            .setPositiveButton("保存",(dialog,which)->{
                String value=title.getText().toString().trim(); if(value.isEmpty()) return;
                String csrf=snapshot.optString("csrf"); String day=selectedDate[0]; boolean isEvent=event.isChecked();
                boolean isAllDay=allDay.isChecked(); String start=startTime[0], end=endTime[0];
                String detail=description.getText().toString().trim(), place=location.getText().toString().trim();
                if(!isAllDay && start.compareTo(end)>=0) {
                    Toast.makeText(this,"終了時刻は開始時刻より後にしてください",Toast.LENGTH_SHORT).show(); return;
                }
                network.execute(() -> {
                    try {
                        ApiClient.request("/api/task",new JSONObject().put("csrf",csrf).put("title",value)
                            .put("dateOnly",day).put("endDateOnly",day).put("allDay",isAllDay)
                            .put("startTime",isAllDay?"":start).put("endTime",isAllDay?"":end)
                            .put("description",detail).put("location",place)
                            .put("is_event",isEvent).put("idempotency_key",java.util.UUID.randomUUID().toString()));
                        runOnUiThread(this::load);
                    } catch(Exception e) { runOnUiThread(() -> Toast.makeText(this,"保存できませんでした",Toast.LENGTH_SHORT).show()); }
                });
            }).setNegativeButton("閉じる",null).show();
    }
    private void loadFamilyLog() {
        String day=selectedDay.toString(); int epoch=sessionEpoch;
        familyLog=null; render();
        network.execute(() -> {
            try {
                JSONObject result=ApiClient.request("/api/android/v1/family-log?date="+day,null);
                runOnUiThread(() -> {
                    if(epoch!=sessionEpoch || !day.equals(selectedDay.toString())) return;
                    if(snapshot!=null && (result.optInt("familyId")!=snapshot.optInt("familyId") ||
                        result.optInt("memberId")!=snapshot.optInt("memberId"))) { showLogin(); return; }
                    familyLog=result;
                    if(tab.equals("familylog")) render();
                });
            } catch(SecurityException error) { runOnUiThread(() -> { if(epoch==sessionEpoch) showLogin(); }); }
            catch(Exception error) { runOnUiThread(() -> {
                if(epoch==sessionEpoch && tab.equals("familylog")) { content.removeAllViews(); content.addView(label("育児記録を取得できませんでした")); }
            }); }
        });
    }
    private void renderFamilyLog() {
        LinearLayout days=new LinearLayout(this);
        days.addView(button("◀",() -> { selectedDay=selectedDay.minusDays(1); month=YearMonth.from(selectedDay); loadFamilyLog(); }));
        days.addView(label(selectedDay.toString()));
        days.addView(button("▶",() -> { selectedDay=selectedDay.plusDays(1); month=YearMonth.from(selectedDay); loadFamilyLog(); }));
        days.addView(button("更新",this::loadFamilyLog));
        content.addView(days);
        if(familyLog==null || !selectedDay.toString().equals(familyLog.optString("date"))) {
            content.addView(label("読み込み中…")); return;
        }
        JSONArray subjects=familyLog.optJSONArray("subjects"), logs=familyLog.optJSONArray("logs");
        content.addView(button("＋ 記録対象",this::addFamilyLogSubject));
        if(subjects==null || subjects.length()==0) {
            content.addView(label("記録対象がありません。赤ちゃん・家族・ペットなどを追加してください。")); return;
        }
        content.addView(button("記録対象の名前・表示を管理",this::manageFamilyLogSubjects));
        content.addView(button("＋ 記録を追加",this::addFamilyLog));
        content.addView(button("＋ タイマー",this::startFamilyLogTimer));
        JSONArray timers=familyLog.optJSONArray("timers");
        if(timers!=null && timers.length()>0) {
            content.addView(label("実行中のタイマー"));
            for(int i=0;i<timers.length();i++) {
                JSONObject timer=timers.optJSONObject(i); if(timer==null) continue;
                String name=timer.optString("timer_label","タイマー"),subject=timer.optString("subject_name");
                long started=timer.optLong("started_at_ms"),minutes=started>0?
                    Math.max(0,(System.currentTimeMillis()-started)/60000):0;
                content.addView(button((subject.isEmpty()?"":subject+" ・ ")+name+" "+minutes+"分  終了",() -> finishFamilyLogTimer(timer,false)));
                if(!"SLEEP".equals(timer.optString("log_type")))
                    content.addView(button(name+"を記録せず中止",() -> finishFamilyLogTimer(timer,true)));
            }
        }
        if(familyLog.optBoolean("timersTruncated")) content.addView(label("実行中のタイマーは一部のみ表示しています。"));
        for(int i=0;i<subjects.length();i++) {
            JSONObject subject=subjects.optJSONObject(i);
            if(subject==null || !"BABY".equals(subject.optString("subject_kind"))) continue;
            content.addView(label(subject.optString("name")));
            LinearLayout actions=new LinearLayout(this);
            ArrayList<String> enabled=allowedLogTypes(subject);
            if(enabled.contains("SLEEP")) {
                boolean sleeping=false;
                if(timers!=null) for(int n=0;n<timers.length();n++) {
                    JSONObject running=timers.optJSONObject(n);
                    if(running!=null && running.optInt("subject_id")==subject.optInt("id") &&
                        "SLEEP".equals(running.optString("log_type"))) sleeping=true;
                }
                if(!sleeping) actions.addView(button("😴 睡眠開始",() -> changeFamilyLogTimer("sleep_start",subject.optInt("id"),0,"")));
            }
            if(enabled.contains("MILK")) actions.addView(button("🍼 ミルク",() -> recordBaby(subject,"MILK","")));
            if(enabled.contains("DIAPER")) {
                actions.addView(button("💧 おしっこ",() -> recordBaby(subject,"DIAPER","WET")));
                actions.addView(button("💩 うんち",() -> recordBaby(subject,"DIAPER","DIRTY")));
            }
            if(actions.getChildCount()>0) content.addView(actions);
        }
        if(familyLog.optBoolean("truncated")) content.addView(label("記録が多いため一部のみ表示しています。"));
        if(logs!=null && !familyLog.optBoolean("truncated")) {
            double milk=0; int diaper=0,sleep=0;
            for(int i=0;i<logs.length();i++) {
                JSONObject log=logs.optJSONObject(i); if(log==null) continue;
                switch(log.optString("log_type")) {
                    case "MILK": if("ml".equalsIgnoreCase(log.optString("unit"))) milk+=log.optDouble("amount",0); break;
                    case "DIAPER": diaper++; break;
                    case "SLEEP": sleep+=log.optInt("duration_minutes"); break;
                    default: break;
                }
            }
            content.addView(label("当日の集計（表示中の全対象）  ミルク "+java.text.NumberFormat.getNumberInstance().format(milk)+
                "ml ・ おむつ "+diaper+"回 ・ 睡眠 "+sleep+"分"));
        }
        content.addView(label("当日の記録"));
        if(logs==null || logs.length()==0) { content.addView(label("記録はありません")); return; }
        for(int i=0;i<logs.length();i++) {
            JSONObject row=logs.optJSONObject(i); if(row==null) continue;
            String time=row.optString("occurred_at");
            if(time.length()>=16) time=time.substring(11,16);
            String detail=row.optString("detail_code");
            String amount=row.isNull("amount")?"":row.optString("amount")+row.optString("unit");
            TextView entry=label(time+"  "+row.optString("subject_name")+"  "+logTypeName(row.optString("log_type"))+
                (detail.isEmpty()?"":" "+detail)+(amount.isEmpty()?"":" "+amount)+
                (row.optString("value_text").isEmpty()?"":" "+row.optString("value_text"))+
                (row.optString("note").isEmpty()?"":"\n"+row.optString("note")));
            entry.setOnLongClickListener(v -> { familyLogActions(row); return true; });
            content.addView(entry);
        }
    }
    private void startFamilyLogTimer() {
        if(snapshot==null || familyLog==null) return;
        EditText name=new EditText(this); name.setHint("タイマー名（例: お散歩）"); name.setSingleLine(true);
        JSONArray subjects=familyLog.optJSONArray("subjects");
        ArrayList<String> labels=new ArrayList<>(); labels.add("家族共通");
        ArrayList<Integer> ids=new ArrayList<>(); ids.add(0);
        if(subjects!=null) for(int i=0;i<subjects.length();i++) {
            JSONObject subject=subjects.optJSONObject(i);
            if(subject!=null && subject.optInt("id")>0) { labels.add(subject.optString("name")); ids.add(subject.optInt("id")); }
        }
        Spinner choice=new Spinner(this);
        choice.setAdapter(new ArrayAdapter<>(this,android.R.layout.simple_spinner_dropdown_item,labels));
        LinearLayout form=new LinearLayout(this); form.setOrientation(LinearLayout.VERTICAL); form.setPadding(32,8,32,8);
        form.addView(name); form.addView(label("対象")); form.addView(choice);
        new AlertDialog.Builder(this).setTitle("タイマーを開始").setView(form)
            .setPositiveButton("開始",(dialog,which) -> {
                String value=name.getText().toString().trim();
                if(value.isEmpty()||value.length()>80) { Toast.makeText(this,"名前を1〜80文字で入力してください",Toast.LENGTH_SHORT).show(); return; }
                changeFamilyLogTimer("timer_start",ids.get(choice.getSelectedItemPosition()),0,value);
            }).setNegativeButton("閉じる",null).show();
    }
    private void finishFamilyLogTimer(JSONObject timer,boolean cancel) {
        int id=timer.optInt("id"); if(id<=0) return;
        String action=cancel?"timer_cancel":"SLEEP".equals(timer.optString("log_type"))?"sleep_stop":"timer_stop";
        new AlertDialog.Builder(this).setTitle(cancel?"タイマーを中止":"タイマーを終了")
            .setMessage(cancel?"記録を残さずに中止します。":"終了時刻までを記録します。")
            .setPositiveButton(cancel?"中止":"終了",(dialog,which) -> changeFamilyLogTimer(action,0,id,""))
            .setNegativeButton("戻る",null).show();
    }
    private void changeFamilyLogTimer(String action,int subjectId,int timerId,String timerLabel) {
        if(snapshot==null) return;
        String csrf=snapshot.optString("csrf"); int epoch=sessionEpoch;
        network.execute(() -> {
            try {
                if(epoch!=sessionEpoch) return;
                ApiClient.request("/api/family-log",new JSONObject().put("csrf",csrf).put("action",action)
                    .put("subject_id",subjectId).put("timer_id",timerId).put("timer_label",timerLabel).put("log_type","TIMER"));
                if(epoch==sessionEpoch) runOnUiThread(this::loadFamilyLog);
            } catch(Exception error) {
                runOnUiThread(() -> { if(epoch==sessionEpoch) Toast.makeText(this,"タイマーを操作できませんでした",Toast.LENGTH_SHORT).show(); });
            }
        });
    }
    private void familyLogActions(JSONObject row) {
        boolean editable=row.optInt("subject_id")>0;
        String[] actions=editable?new String[]{"編集","削除"}:new String[]{"削除"};
        new AlertDialog.Builder(this).setTitle("記録の操作").setItems(actions,(dialog,which) -> {
            if(editable&&which==0) showFamilyLogEditor(row); else deleteFamilyLog(row);
        }).show();
    }
    private void addFamilyLogSubject() {
        if(snapshot==null) return;
        EditText name=new EditText(this); name.setHint("名前"); name.setSingleLine(true);
        String[] kinds={"赤ちゃん","子ども","大人","ペット","その他"};
        String[] codes={"BABY","CHILD","ADULT","PET","OTHER"};
        Spinner kind=new Spinner(this);
        kind.setAdapter(new ArrayAdapter<>(this,android.R.layout.simple_spinner_dropdown_item,kinds));
        LinearLayout form=new LinearLayout(this); form.setOrientation(LinearLayout.VERTICAL);
        form.setPadding(32,8,32,8); form.addView(name); form.addView(kind);
        new AlertDialog.Builder(this).setTitle("記録対象を追加").setView(form)
            .setPositiveButton("追加",(dialog,which) -> {
                String value=name.getText().toString().trim(); if(value.isEmpty()||value.length()>80) return;
                String csrf=snapshot.optString("csrf"),code=codes[kind.getSelectedItemPosition()]; int epoch=sessionEpoch;
                network.execute(() -> {
                    try {
                        if(epoch!=sessionEpoch) return;
                        ApiClient.request("/api/family-log",new JSONObject().put("csrf",csrf)
                            .put("action","subject_create").put("name",value).put("subject_kind",code));
                        if(epoch==sessionEpoch) runOnUiThread(this::loadFamilyLog);
                    } catch(Exception error) {
                        runOnUiThread(() -> { if(epoch==sessionEpoch) Toast.makeText(this,"記録対象を追加できませんでした",Toast.LENGTH_SHORT).show(); });
                    }
                });
            }).setNegativeButton("閉じる",null).show();
    }
    private void manageFamilyLogSubjects() {
        JSONArray subjects=familyLog==null?null:familyLog.optJSONArray("subjects");
        if(subjects==null) return;
        ArrayList<JSONObject> rows=new ArrayList<>(); ArrayList<String> names=new ArrayList<>();
        for(int i=0;i<subjects.length();i++) {
            JSONObject subject=subjects.optJSONObject(i); if(subject==null || subject.optInt("id")<=0) continue;
            rows.add(subject); names.add(subject.optString("name"));
        }
        new AlertDialog.Builder(this).setTitle("記録対象を選択")
            .setItems(names.toArray(new String[0]),(dialog,which) -> familyLogSubjectActions(rows.get(which))).show();
    }
    private void familyLogSubjectActions(JSONObject subject) {
        boolean linked=subject.optInt("member_id")>0;
        String[] actions=linked?new String[]{"名前を変更"}:new String[]{"名前を変更","対象を非表示"};
        new AlertDialog.Builder(this).setTitle(subject.optString("name"))
            .setItems(actions,(dialog,which) -> {
                if(which==0) renameFamilyLogSubject(subject); else disableFamilyLogSubject(subject);
            }).show();
    }
    private void renameFamilyLogSubject(JSONObject subject) {
        if(snapshot==null) return;
        EditText input=new EditText(this); input.setText(subject.optString("name")); input.setSingleLine(true);
        new AlertDialog.Builder(this).setTitle("記録対象の名前を変更").setView(input)
            .setPositiveButton("保存",(dialog,which) -> {
                String name=input.getText().toString().trim();
                if(name.isEmpty()||name.length()>80) { Toast.makeText(this,"名前を80文字以内で入力してください",Toast.LENGTH_SHORT).show(); return; }
                JSONArray enabled=new JSONArray();
                for(String type:allowedLogTypes(subject)) enabled.put(type);
                JSONArray overview=new JSONArray();
                try {
                    String raw=subject.optString("overview_quick_types_json");
                    if(!raw.isEmpty()) overview=new JSONArray(raw);
                } catch(Exception ignored) { }
                JSONArray overviewTypes=overview;
                int epoch=sessionEpoch; String csrf=snapshot.optString("csrf");
                network.execute(() -> {
                    try {
                        if(epoch!=sessionEpoch) return;
                        ApiClient.request("/api/family-log",new JSONObject().put("action","subject_update")
                            .put("csrf",csrf).put("id",subject.optInt("id")).put("name",name)
                            .put("subject_kind",subject.optString("subject_kind"))
                            .put("birth_date",subject.optString("birth_date",""))
                            .put("enabled_types",enabled).put("auto_complete_linked_task",subject.optInt("auto_complete_linked_task")==1)
                            .put("show_on_family_overview",subject.optInt("show_on_family_overview")==1)
                            .put("overview_quick_types",overviewTypes));
                        if(epoch==sessionEpoch) runOnUiThread(this::loadFamilyLog);
                    } catch(Exception error) {
                        runOnUiThread(() -> { if(epoch==sessionEpoch) Toast.makeText(this,"名前を変更できませんでした",Toast.LENGTH_SHORT).show(); });
                    }
                });
            }).setNegativeButton("閉じる",null).show();
    }
    private void disableFamilyLogSubject(JSONObject subject) {
        if(snapshot==null || subject.optInt("member_id")>0) return;
        new AlertDialog.Builder(this).setTitle(subject.optString("name")+" を非表示")
            .setMessage("対象は一覧から非表示になり、実行中のタイマーは中止されます。")
            .setPositiveButton("非表示",(dialog,which) -> {
                int epoch=sessionEpoch,id=subject.optInt("id"); String csrf=snapshot.optString("csrf");
                network.execute(() -> {
                    try {
                        if(epoch!=sessionEpoch) return;
                        ApiClient.request("/api/family-log",new JSONObject().put("action","subject_disable")
                            .put("csrf",csrf).put("id",id));
                        if(epoch==sessionEpoch) runOnUiThread(this::loadFamilyLog);
                    } catch(Exception error) {
                        runOnUiThread(() -> { if(epoch==sessionEpoch) Toast.makeText(this,"非表示にできませんでした",Toast.LENGTH_SHORT).show(); });
                    }
                });
            }).setNegativeButton("戻る",null).show();
    }
    private void deleteFamilyLog(JSONObject row) {
        if(snapshot==null || row.optInt("id")<=0) return;
        new AlertDialog.Builder(this).setTitle("記録を削除")
            .setMessage("この記録を削除します。")
            .setPositiveButton("削除",(dialog,which) -> {
                String csrf=snapshot.optString("csrf"); int id=row.optInt("id"),epoch=sessionEpoch;
                network.execute(() -> {
                    try {
                        if(epoch!=sessionEpoch) return;
                        ApiClient.request("/api/family-log",new JSONObject().put("csrf",csrf)
                            .put("action","delete").put("id",id));
                        if(epoch==sessionEpoch) runOnUiThread(this::loadFamilyLog);
                    } catch(Exception error) {
                        runOnUiThread(() -> { if(epoch==sessionEpoch) Toast.makeText(this,"記録を削除できませんでした",Toast.LENGTH_SHORT).show(); });
                    }
                });
            }).setNegativeButton("閉じる",null).show();
    }
    private String logTypeName(String type) {
        switch(type) {
            case "MILK": return "🍼 ミルク"; case "DIAPER": return "🧷 おむつ";
            case "MEAL": return "🍚 食事"; case "SLEEP": return "😴 睡眠";
            case "BATH": return "🛁 お風呂"; case "TEMPERATURE": return "🌡️ 体温";
            case "WEIGHT": return "⚖️ 体重"; case "MEMO": return "📝 メモ";
            case "BREASTFEED": return "🤱 母乳"; case "MEDICINE": return "💊 薬";
            case "VACCINE": return "💉 予防接種"; case "HEIGHT": return "📏 身長";
            case "CONDITION": return "🙂 体調"; case "EXERCISE": return "🏃 運動";
            case "WATER": return "💧 水分"; case "TOILET": return "🚻 トイレ";
            case "WALK": return "🐕 散歩"; case "BLOOD_PRESSURE": return "🫀 血圧";
            default: return type;
        }
    }
    private ArrayList<String> allowedLogTypes(JSONObject subject) {
        String kind=subject.optString("subject_kind");
        String defaults;
        switch(kind) {
            case "BABY": defaults="MILK,BREASTFEED,MEAL,DIAPER,SLEEP,BATH,TEMPERATURE,MEDICINE,VACCINE,HEIGHT,WEIGHT,CONDITION,MEMO"; break;
            case "CHILD": defaults="MEAL,TOILET,SLEEP,BATH,TEMPERATURE,MEDICINE,VACCINE,HEIGHT,WEIGHT,CONDITION,EXERCISE,MEMO"; break;
            case "PET": defaults="MEAL,WATER,TOILET,WALK,SLEEP,BATH,WEIGHT,MEDICINE,CONDITION,MEMO"; break;
            case "ADULT": defaults="CONDITION,SLEEP,EXERCISE,WEIGHT,BLOOD_PRESSURE,TEMPERATURE,MEDICINE,MEAL,BATH,MEMO"; break;
            default: defaults="MEMO,CONDITION,TEMPERATURE,MEDICINE,SLEEP,WEIGHT";
        }
        ArrayList<String> result=new ArrayList<>();
        String raw=subject.optString("enabled_types_json");
        if(!raw.isEmpty()) try {
            JSONArray enabled=new JSONArray(raw);
            for(int i=0;i<enabled.length();i++) {
                String type=enabled.optString(i);
                if(!type.isEmpty()&&!result.contains(type)) result.add(type);
            }
        } catch(Exception ignored) { result.clear(); }
        if(result.isEmpty()) java.util.Collections.addAll(result,defaults.split(","));
        return result;
    }
    private void recordBaby(JSONObject subject,String type,String detail) {
        if(snapshot==null) return;
        if("MILK".equals(type)) {
            EditText amount=new EditText(this); amount.setHint("ミルク量（ml）");
            amount.setInputType(android.text.InputType.TYPE_CLASS_NUMBER);
            new AlertDialog.Builder(this).setTitle(subject.optString("name")+" のミルク").setView(amount)
                .setPositiveButton("記録",(dialog,which) -> {
                    String value=amount.getText().toString().trim();
                    try { int ml=Integer.parseInt(value); if(ml<=0 || ml>2000) throw new NumberFormatException();
                        saveFamilyLog(subject.optInt("id"),type,"",ml,"ml","");
                    } catch(NumberFormatException error) { Toast.makeText(this,"ミルク量を確認してください",Toast.LENGTH_SHORT).show(); }
                }).setNegativeButton("閉じる",null).show();
        } else {
            new AlertDialog.Builder(this).setTitle(subject.optString("name")+" の"+("WET".equals(detail)?"おしっこ":"うんち"))
                .setMessage(selectedDay.toString()+" に記録します。")
                .setPositiveButton("記録",(dialog,which) -> saveFamilyLog(subject.optInt("id"),type,detail,null,"",""))
                .setNegativeButton("閉じる",null).show();
        }
    }
    private void saveFamilyLog(int subjectId,String type,String detail,Number amount,String unit,String note) {
        if(snapshot==null || subjectId<=0) return;
        String csrf=snapshot.optString("csrf"), day=selectedDay.toString(); int epoch=sessionEpoch;
        String time=java.time.LocalTime.now(java.time.ZoneId.of("Asia/Tokyo")).format(java.time.format.DateTimeFormatter.ofPattern("HH:mm"));
        network.execute(() -> {
            try {
                if(epoch!=sessionEpoch) return;
                JSONObject body=new JSONObject().put("action","save").put("csrf",csrf).put("subject_id",subjectId)
                    .put("log_type",type).put("occurred_at",day+" "+time).put("detail_code",detail)
                    .put("unit",unit).put("note",note);
                if(amount!=null) body.put("amount",amount);
                ApiClient.request("/api/family-log",body);
                if(epoch==sessionEpoch) runOnUiThread(this::loadFamilyLog);
            } catch(Exception error) {
                runOnUiThread(() -> { if(epoch==sessionEpoch) Toast.makeText(this,"記録できませんでした",Toast.LENGTH_SHORT).show(); });
            }
        });
    }
    private void addFamilyLog() { showFamilyLogEditor(null); }
    private void showFamilyLogEditor(JSONObject existing) {
        if(snapshot==null) { Toast.makeText(this,"ログイン情報を読み込み中です",Toast.LENGTH_SHORT).show(); load(); return; }
        JSONArray subjects=familyLog==null?null:familyLog.optJSONArray("subjects");
        if(subjects==null || subjects.length()==0) return;
        ArrayList<String> names=new ArrayList<>();
        ArrayList<Integer> ids=new ArrayList<>();
        for(int i=0;i<subjects.length();i++) {
            JSONObject subject=subjects.optJSONObject(i);
            if(subject!=null && subject.optInt("id")>0) { names.add(subject.optString("name")); ids.add(subject.optInt("id")); }
        }
        if(ids.isEmpty()) return;
        Spinner subjectChoice=new Spinner(this),typeChoice=new Spinner(this);
        subjectChoice.setAdapter(new ArrayAdapter<>(this,android.R.layout.simple_spinner_dropdown_item,names));
        int initialSubject=existing==null?0:ids.indexOf(existing.optInt("subject_id"));
        if(existing!=null && initialSubject<0) {
            Toast.makeText(this,"記録対象が現在利用できません",Toast.LENGTH_SHORT).show(); return;
        }
        if(existing!=null) {
            JSONObject selectedSubject=null;
            for(int i=0;i<subjects.length();i++) {
                JSONObject candidate=subjects.optJSONObject(i);
                if(candidate!=null && candidate.optInt("id")==existing.optInt("subject_id")) { selectedSubject=candidate; break; }
            }
            if(selectedSubject==null || !allowedLogTypes(selectedSubject).contains(existing.optString("log_type"))) {
                Toast.makeText(this,"この記録種類は現在編集できません",Toast.LENGTH_SHORT).show(); return;
            }
        }
        ArrayList<String> typeCodes=new ArrayList<>();
        ArrayAdapter<String> typeAdapter=new ArrayAdapter<>(this,android.R.layout.simple_spinner_dropdown_item,new ArrayList<>());
        typeChoice.setAdapter(typeAdapter);
        subjectChoice.setOnItemSelectedListener(new android.widget.AdapterView.OnItemSelectedListener() {
            @Override public void onItemSelected(android.widget.AdapterView<?> parent,android.view.View view,int position,long id) {
                typeCodes.clear();
                for(int i=0;i<subjects.length();i++) {
                    JSONObject subject=subjects.optJSONObject(i);
                    if(subject!=null && subject.optInt("id")==ids.get(position)) { typeCodes.addAll(allowedLogTypes(subject)); break; }
                }
                typeAdapter.clear();
                for(String code:typeCodes) typeAdapter.add(logTypeName(code));
                typeAdapter.notifyDataSetChanged();
                if(existing!=null && ids.get(position)==existing.optInt("subject_id")) {
                    int selected=typeCodes.indexOf(existing.optString("log_type"));
                    if(selected>=0) typeChoice.setSelection(selected);
                }
            }
            @Override public void onNothingSelected(android.widget.AdapterView<?> parent) { }
        });
        subjectChoice.setSelection(initialSubject);
        EditText amount=new EditText(this); amount.setHint("数値（任意）"); amount.setInputType(android.text.InputType.TYPE_CLASS_NUMBER|android.text.InputType.TYPE_NUMBER_FLAG_DECIMAL);
        EditText unit=new EditText(this); unit.setHint("単位（ml、℃、kgなど）");
        EditText detail=new EditText(this); detail.setHint("詳細コード（任意）");
        EditText duration=new EditText(this); duration.setHint("時間（分、任意）"); duration.setInputType(android.text.InputType.TYPE_CLASS_NUMBER);
        EditText valueText=new EditText(this); valueText.setHint("内容（任意）");
        EditText note=new EditText(this); note.setHint("メモ（任意）");
        if(existing!=null) {
            if(!existing.isNull("amount")) amount.setText(existing.optString("amount"));
            unit.setText(existing.optString("unit","")); detail.setText(existing.optString("detail_code",""));
            if(!existing.isNull("duration_minutes")) duration.setText(existing.optString("duration_minutes"));
            valueText.setText(existing.optString("value_text","")); note.setText(existing.optString("note",""));
        }
        String defaultOccurred=selectedDay+" "+java.time.LocalTime.now(java.time.ZoneId.of("Asia/Tokyo"))
            .format(java.time.format.DateTimeFormatter.ofPattern("HH:mm"));
        String oldOccurred=existing==null?"":existing.optString("occurred_at");
        final String[] occurred={oldOccurred.length()>=16?oldOccurred.substring(0,16):defaultOccurred};
        final Button[] dateRef=new Button[1];
        Button dateButton=button("日時: "+occurred[0],() -> {
            java.time.LocalDateTime current=java.time.LocalDateTime.parse(occurred[0].replace(' ','T'));
            new DatePickerDialog(this,(picker,y,m,d) ->
                new TimePickerDialog(this,(clock,h,minute) -> {
                    occurred[0]=String.format(java.util.Locale.ROOT,"%04d-%02d-%02d %02d:%02d",y,m+1,d,h,minute);
                    dateRef[0].setText("日時: "+occurred[0]);
                },current.getHour(),current.getMinute(),true).show(),
                current.getYear(),current.getMonthValue()-1,current.getDayOfMonth()).show();
        });
        dateRef[0]=dateButton;
        LinearLayout form=new LinearLayout(this); form.setOrientation(LinearLayout.VERTICAL); form.setPadding(32,8,32,8);
        form.addView(label("対象")); form.addView(subjectChoice); form.addView(label("種類")); form.addView(typeChoice);
        form.addView(dateButton); form.addView(amount); form.addView(unit); form.addView(detail);
        form.addView(duration); form.addView(valueText); form.addView(note);
        ScrollView scroll=new ScrollView(this); scroll.addView(form);
        new AlertDialog.Builder(this).setTitle(existing==null?"記録を追加":"記録を編集").setView(scroll)
            .setPositiveButton("保存",(dialog,which) -> {
                String raw=amount.getText().toString().trim(); Double number=null;
                if(!raw.isEmpty()) {
                    try {
                        number=Double.valueOf(raw);
                        if(!Double.isFinite(number)||number < -100000||number > 100000) throw new NumberFormatException();
                    } catch(NumberFormatException error) { Toast.makeText(this,"数値を確認してください",Toast.LENGTH_SHORT).show(); return; }
                }
                if(typeCodes.isEmpty()||typeChoice.getSelectedItemPosition()<0) return;
                String minutes=duration.getText().toString().trim();
                if(!minutes.isEmpty()) try {
                    int value=Integer.parseInt(minutes);
                    if(value<0||value>10080) throw new NumberFormatException();
                } catch(NumberFormatException error) { Toast.makeText(this,"時間を確認してください",Toast.LENGTH_SHORT).show(); return; }
                String details=detail.getText().toString().trim(),units=unit.getText().toString().trim();
                String value=valueText.getText().toString().trim(),memo=note.getText().toString().trim();
                if(details.length()>32||units.length()>16||value.length()>255||memo.length()>2000) {
                    Toast.makeText(this,"入力が長すぎます",Toast.LENGTH_SHORT).show(); return;
                }
                int id=existing==null?0:existing.optInt("id"),subjectId=ids.get(subjectChoice.getSelectedItemPosition());
                String type=typeCodes.get(typeChoice.getSelectedItemPosition()),csrf=snapshot.optString("csrf"),timestamp=occurred[0];
                String linked="";
                if(existing!=null) {
                    if(existing.optInt("linked_task_id")>0) linked="task:"+existing.optInt("linked_task_id");
                    else if(existing.optInt("linked_occurrence_id")>0) linked="occ:"+existing.optInt("linked_occurrence_id");
                }
                String linkedTarget=linked; Double amountValue=number; int epoch=sessionEpoch;
                network.execute(() -> {
                    try {
                        if(epoch!=sessionEpoch) return;
                        JSONObject body=new JSONObject().put("action","save").put("csrf",csrf).put("id",id)
                            .put("subject_id",subjectId).put("log_type",type).put("occurred_at",timestamp)
                            .put("detail_code",details).put("unit",units).put("duration_minutes",minutes)
                            .put("value_text",value).put("note",memo).put("linked_target",linkedTarget);
                        if(amountValue!=null) body.put("amount",amountValue);
                        ApiClient.request("/api/family-log",body);
                        if(epoch==sessionEpoch) runOnUiThread(() -> {
                            selectedDay=LocalDate.parse(timestamp.substring(0,10)); month=YearMonth.from(selectedDay);
                            loadFamilyLog();
                        });
                    } catch(Exception error) {
                        runOnUiThread(() -> { if(epoch==sessionEpoch) Toast.makeText(this,"記録を保存できませんでした",Toast.LENGTH_SHORT).show(); });
                    }
                });
            }).setNegativeButton("閉じる",null).show();
    }
    private void loadMessages(int before) {
        content.removeAllViews(); content.addView(label("伝言を読み込み中…"));
        network.execute(() -> {
            try {
                JSONObject result=ApiClient.request("/api/message-chat-sync?before="+(before>0?before:9007199254740991L),null);
                runOnUiThread(() -> {
                    JSONArray page=result.optJSONArray("messages");
                    if(before==0) messages=page==null?new JSONArray():page;
                    else if(page!=null) {
                        JSONArray combined=new JSONArray();
                        for(int i=0;i<page.length();i++) combined.put(page.optJSONObject(i));
                        for(int i=0;i<messages.length();i++) combined.put(messages.optJSONObject(i));
                        messages=combined;
                    }
                    hasOlderMessages=result.optBoolean("hasOlder"); render();
                });
            } catch(SecurityException e) { runOnUiThread(() -> { monthCache.clear(); snapshot=null; showLogin(); }); }
            catch(Exception e) { runOnUiThread(() -> { content.removeAllViews(); content.addView(label("伝言を取得できませんでした")); }); }
        });
    }
    private void renderMessages() {
        content.addView(button("＋ 伝言する",this::addMessage));
        content.addView(button("＋ 写真付き伝言",this::chooseMessagePhoto));
        if(pendingPhoto!=null) content.addView(button("写真送信を再試行",this::retryMessagePhoto));
        content.addView(button("更新",()->loadMessages(0)));
        if(hasOlderMessages && messages.length()>0) content.addView(button("以前の伝言",()->loadMessages(messages.optJSONObject(0).optInt("id"))));
        for(int n=0;n<messages.length();n++) {
            JSONObject row=messages.optJSONObject(n); if(row==null) continue;
            content.addView(label(row.optString("senderName")+" ・ "+row.optString("createdAt")+"\n"+row.optString("text")
                +(row.optBoolean("hasImage")?"\n📷 写真あり":"")+(row.optBoolean("hasStamp")?"\nスタンプあり":"")));
            if(row.optBoolean("hasImage") && row.optInt("id")>0)
                content.addView(button("写真を開く",() -> showMessagePhoto(row.optInt("id"))));
        }
    }
    private void showMessagePhoto(int id) {
        int epoch=sessionEpoch;
        Toast.makeText(this,"写真を読み込みます",Toast.LENGTH_SHORT).show();
        network.execute(() -> {
            try {
                Bitmap bitmap=ApiClient.thumbnail("/api/messages?photo="+id);
                runOnUiThread(() -> {
                    if(epoch!=sessionEpoch || !tab.equals("messages")) return;
                    ImageView view=new ImageView(this); view.setImageBitmap(bitmap);
                    view.setAdjustViewBounds(true); view.setContentDescription("伝言の写真");
                    new AlertDialog.Builder(this).setTitle("伝言の写真").setView(view)
                        .setPositiveButton("閉じる",null).show();
                });
            } catch(Exception error) {
                runOnUiThread(() -> { if(epoch==sessionEpoch) Toast.makeText(this,"写真を表示できませんでした",Toast.LENGTH_SHORT).show(); });
            }
        });
    }
    private void chooseMessagePhoto() {
        if(snapshot==null) { load(); return; }
        if(photoSending) { Toast.makeText(this,"写真を送信中です",Toast.LENGTH_SHORT).show(); return; }
        Intent picker=new Intent(Intent.ACTION_OPEN_DOCUMENT);
        picker.addCategory(Intent.CATEGORY_OPENABLE); picker.setType("image/*");
        startActivityForResult(picker,41);
    }
    @Override protected void onActivityResult(int requestCode,int resultCode,Intent data) {
        super.onActivityResult(requestCode,resultCode,data);
        if(requestCode!=41 || resultCode!=RESULT_OK || data==null || data.getData()==null) return;
        android.net.Uri uri=data.getData(); int epoch=sessionEpoch;
        Toast.makeText(this,"写真を準備しています",Toast.LENGTH_SHORT).show();
        network.execute(() -> {
            try {
                MessagePhotoUpload.Draft draft=MessagePhotoUpload.prepare(this,uri);
                runOnUiThread(() -> {
                    if(epoch!=sessionEpoch) return;
                    pendingPhoto=draft; pendingPhotoCaption=""; pendingPhotoReminder="";
                    showPhotoComposer();
                });
            } catch(Exception error) {
                runOnUiThread(() -> { if(epoch==sessionEpoch) Toast.makeText(this,"写真を読み込めませんでした（20 MiB以内）",Toast.LENGTH_LONG).show(); });
            }
        });
    }
    private void showPhotoComposer() {
        if(pendingPhoto==null || snapshot==null) return;
        EditText caption=new EditText(this); caption.setHint("写真の説明（任意）"); caption.setText(pendingPhotoCaption);
        final String[] reminder={pendingPhotoReminder}; final Button[] reminderRef=new Button[1];
        Button when=button("通知予約: "+(reminder[0].isEmpty()?"指定なし":reminder[0]),() -> {
            java.time.LocalDateTime base=java.time.LocalDateTime.now(java.time.ZoneId.of("Asia/Tokyo")).plusHours(1);
            new DatePickerDialog(this,(picker,y,m,d) ->
                new TimePickerDialog(this,(clock,h,minute) -> {
                    reminder[0]=String.format(java.util.Locale.ROOT,"%04d-%02d-%02dT%02d:%02d",y,m+1,d,h,minute);
                    reminderRef[0].setText("通知予約: "+reminder[0]);
                },base.getHour(),base.getMinute(),true).show(),
                base.getYear(),base.getMonthValue()-1,base.getDayOfMonth()).show();
        }); reminderRef[0]=when;
        LinearLayout form=new LinearLayout(this); form.setOrientation(LinearLayout.VERTICAL); form.setPadding(32,8,32,8);
        form.addView(label("写真は家族全員に送ります")); form.addView(caption); form.addView(when);
        form.addView(button("通知予約を解除",() -> { reminder[0]=""; reminderRef[0].setText("通知予約: 指定なし"); }));
        new AlertDialog.Builder(this).setTitle("写真付き伝言").setView(form)
            .setPositiveButton("送信",(dialog,which) -> {
                String text=caption.getText().toString().trim();
                if(text.length()>2000) { Toast.makeText(this,"説明は2000文字以内にしてください",Toast.LENGTH_SHORT).show(); return; }
                if(!reminder[0].isEmpty() && reminder[0].compareTo(java.time.LocalDateTime.now(java.time.ZoneId.of("Asia/Tokyo"))
                    .format(java.time.format.DateTimeFormatter.ofPattern("yyyy-MM-dd'T'HH:mm")))<=0) {
                    Toast.makeText(this,"通知予約は未来の日時を選んでください",Toast.LENGTH_LONG).show(); return;
                }
                pendingPhotoCaption=text; pendingPhotoReminder=reminder[0]; retryMessagePhoto();
            }).setNegativeButton("閉じる",null).show();
    }
    private void retryMessagePhoto() {
        if(snapshot==null || pendingPhoto==null || photoSending) return;
        photoSending=true;
        MessagePhotoUpload.Draft draft=pendingPhoto;
        String csrf=snapshot.optString("csrf"),caption=pendingPhotoCaption,reminder=pendingPhotoReminder;
        int epoch=sessionEpoch;
        network.execute(() -> {
            try {
                if(epoch!=sessionEpoch) return;
                MessagePhotoUpload.send(draft,csrf,caption,reminder);
                runOnUiThread(() -> {
                    if(epoch!=sessionEpoch || pendingPhoto!=draft) return;
                    photoSending=false; pendingPhoto=null; pendingPhotoCaption=""; pendingPhotoReminder="";
                    loadMessages(0);
                });
            } catch(Exception error) {
                runOnUiThread(() -> { if(epoch==sessionEpoch) {
                    photoSending=false;
                    Toast.makeText(this,"写真を送信できませんでした。再試行できます",Toast.LENGTH_LONG).show();
                    if(tab.equals("messages")) render();
                } });
            }
        });
    }
    private void addMessage() {
        if(snapshot==null) { load(); return; }
        EditText text=new EditText(this); text.setHint("伝言を入力"); text.setMinLines(3);
        ArrayList<String> recipients=new ArrayList<>(); recipients.add("家族全員");
        ArrayList<Integer> recipientIds=new ArrayList<>(); recipientIds.add(0);
        JSONArray members=snapshot.optJSONArray("members");
        if(members!=null) for(int i=0;i<members.length();i++) {
            JSONObject person=members.optJSONObject(i);
            if(person==null || person.optInt("id")<=0) continue;
            recipients.add(person.optString("name","メンバー")); recipientIds.add(person.optInt("id"));
        }
        Spinner recipient=new Spinner(this);
        recipient.setAdapter(new ArrayAdapter<>(this,android.R.layout.simple_spinner_dropdown_item,recipients));
        final String[] reminder={""};
        final Button[] reminderRef=new Button[1];
        Button when=button("通知予約: 指定なし",() -> {
            java.time.LocalDateTime base=java.time.LocalDateTime.now(java.time.ZoneId.of("Asia/Tokyo")).plusHours(1);
            new DatePickerDialog(this,(picker,y,m,d) ->
                new TimePickerDialog(this,(clock,h,minute) -> {
                    reminder[0]=String.format(java.util.Locale.ROOT,"%04d-%02d-%02dT%02d:%02d",y,m+1,d,h,minute);
                    reminderRef[0].setText("通知予約: "+reminder[0]);
                },base.getHour(),base.getMinute(),true).show(),
                base.getYear(),base.getMonthValue()-1,base.getDayOfMonth()).show();
        });
        reminderRef[0]=when;
        Button clear=button("通知予約を解除",() -> { reminder[0]=""; reminderRef[0].setText("通知予約: 指定なし"); });
        LinearLayout form=new LinearLayout(this); form.setOrientation(LinearLayout.VERTICAL);
        form.setPadding(32,8,32,8); form.addView(label("宛先")); form.addView(recipient);
        form.addView(text); form.addView(when); form.addView(clear);
        new AlertDialog.Builder(this).setTitle("伝言する").setView(form)
            .setPositiveButton("送る",(dialog,which)->{
                String body=text.getText().toString().trim(); if(body.isEmpty()) return;
                String csrf=snapshot.optString("csrf"), notifyAt=reminder[0]; int epoch=sessionEpoch;
                int recipientId=recipientIds.get(recipient.getSelectedItemPosition());
                network.execute(() -> {
                    try {
                        if(epoch!=sessionEpoch) return;
                        ApiClient.request("/api/messages",new JSONObject().put("csrf",csrf).put("text",body)
                            .put("target_member_id",recipientId).put("reminder_at",notifyAt));
                        if(epoch==sessionEpoch) runOnUiThread(()->{ load(); loadMessages(0); });
                    } catch(Exception e) {
                        runOnUiThread(()->{ if(epoch==sessionEpoch) Toast.makeText(this,"伝言を送れませんでした",Toast.LENGTH_SHORT).show(); });
                    }
                });
            }).setNegativeButton("閉じる",null).show();
    }
    private void logout() {
        new AlertDialog.Builder(this).setTitle("ログアウト")
            .setMessage("端末内のカレンダーとチェックリストを削除し、位置共有を停止します。")
            .setPositiveButton("ログアウト",(dialog,which)->{
                sessionEpoch++;
                stopService(new Intent(this,LocationService.class)); Credentials.clear(this);
                network.execute(() -> SnapshotCache.clear(this));
                monthCache.clear(); snapshot=null; messages=new JSONArray(); familyLog=null; shoppingCategories=null; itemCategories=null;
                pendingPhoto=null; photoSending=false; pendingPhotoCaption=""; pendingPhotoReminder="";
                stampMonths.clear(); stampImages.evictAll(); pendingStampImages.clear();
                android.webkit.CookieManager.getInstance().removeAllCookies(value -> runOnUiThread(this::showLogin));
                android.webkit.CookieManager.getInstance().flush();
            }).setNegativeButton("閉じる",null).show();
    }
    private void showLogin() {
        if (login != null) return;
        monthCache.clear(); snapshot=null; familyLog=null; shoppingCategories=null; itemCategories=null;
        pendingPhoto=null; photoSending=false; pendingPhotoCaption=""; pendingPhotoReminder="";
        stampMonths.clear(); stampImages.evictAll(); pendingStampImages.clear();
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
