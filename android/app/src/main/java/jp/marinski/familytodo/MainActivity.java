package jp.marinski.familytodo;

import android.Manifest;
import android.app.Activity;
import android.app.AlertDialog;
import android.app.DatePickerDialog;
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
    private JSONObject shoppingCategories, itemCategories;
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
        if (login != null) { login.destroy(); login = null; }
        root = new LinearLayout(this); root.setOrientation(LinearLayout.VERTICAL);
        LinearLayout tabs = new LinearLayout(this);
        tabs.addView(button("カレンダー", () -> { tab="calendar"; render(); }), new LinearLayout.LayoutParams(0, -2, 1));
        tabs.addView(button("買い物", () -> { tab="shopping"; render(); }), new LinearLayout.LayoutParams(0, -2, 1));
        tabs.addView(button("持ち物", () -> { tab="item"; render(); }), new LinearLayout.LayoutParams(0, -2, 1));
        tabs.addView(button("伝言", () -> { tab="messages"; loadMessages(0); }), new LinearLayout.LayoutParams(0, -2, 1));
        root.addView(tabs);
        LinearLayout controls = new LinearLayout(this);
        controls.addView(button("◀", () -> { month=month.minusMonths(1); selectedDay=month.atDay(1); load(); }));
        controls.addView(button("更新", this::load));
        controls.addView(button("▶", () -> { month=month.plusMonths(1); selectedDay=month.atDay(1); load(); }));
        controls.addView(button("位置設定", this::showSettings));
        controls.addView(button("ログアウト", this::logout));
        root.addView(controls);
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
                JSONObject previous=monthCache.get(requested);
                boolean accountChanged=previous!=null && (previous.optInt("familyId")!=data.optInt("familyId") || previous.optInt("memberId")!=data.optInt("memberId"));
                if(accountChanged) SnapshotCache.clear(this);
                SnapshotCache.write(this,requested,data);
                runOnUiThread(() -> {
                    if(epoch!=sessionEpoch) return;
                    if(accountChanged) { monthCache.clear(); messages=new JSONArray(); shoppingCategories=null; itemCategories=null; stampMonths.clear(); stampImages.evictAll(); pendingStampImages.clear(); }
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
                        SnapshotCache.write(this,nearby,prefetched);
                        runOnUiThread(() -> { if(epoch==sessionEpoch) monthCache.put(nearby, prefetched); });
                    }
                }
            } catch (SecurityException e) { runOnUiThread(() -> { if(epoch!=sessionEpoch) return; monthCache.clear(); snapshot=null; SnapshotCache.clear(this); showLogin(); }); }
            catch (Exception e) { runOnUiThread(() -> { if (snapshot == null) { content.removeAllViews(); content.addView(label("読み込めませんでした。更新を押してください。")); } }); }
        });
    }
    private void render() {
        if (content == null) return;
        content.removeAllViews();
        if (tab.equals("messages")) { renderMessages(); return; }
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
            CheckBox box=new CheckBox(this); box.setText((event?"📌 ":"")+task.optString("title"));
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
        content.addView(row);
        if(stamps.length()>12) content.addView(label("ほか "+(stamps.length()-12)+" 件"));
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
                box.setOnLongClickListener(v -> { changeGoodsCategory(shopping,row); return true; });
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
                    if(tab.equals(shopping?"shopping":"item")) render();
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
                            if(tab.equals(shopping?"shopping":"item")) render();
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
        LinearLayout form=new LinearLayout(this); form.setOrientation(LinearLayout.VERTICAL);
        form.setPadding(32,8,32,8); form.addView(title); form.addView(date); form.addView(event);
        new AlertDialog.Builder(this).setTitle("タスク・イベントを作成").setView(form)
            .setPositiveButton("保存",(dialog,which)->{
                String value=title.getText().toString().trim(); if(value.isEmpty()) return;
                String csrf=snapshot.optString("csrf"); String day=selectedDate[0]; boolean isEvent=event.isChecked();
                network.execute(() -> {
                    try {
                        ApiClient.request("/api/task",new JSONObject().put("csrf",csrf).put("title",value)
                            .put("dateOnly",day).put("endDateOnly",day).put("allDay",true)
                            .put("is_event",isEvent).put("idempotency_key",java.util.UUID.randomUUID().toString()));
                        runOnUiThread(this::load);
                    } catch(Exception e) { runOnUiThread(() -> Toast.makeText(this,"保存できませんでした",Toast.LENGTH_SHORT).show()); }
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
        content.addView(button("更新",()->loadMessages(0)));
        if(hasOlderMessages && messages.length()>0) content.addView(button("以前の伝言",()->loadMessages(messages.optJSONObject(0).optInt("id"))));
        for(int n=0;n<messages.length();n++) {
            JSONObject row=messages.optJSONObject(n); if(row==null) continue;
            content.addView(label(row.optString("senderName")+" ・ "+row.optString("createdAt")+"\n"+row.optString("text")
                +(row.optBoolean("hasImage")?"\n📷 写真あり":"")+(row.optBoolean("hasStamp")?"\nスタンプあり":"")));
        }
    }
    private void addMessage() {
        if(snapshot==null) { load(); return; }
        EditText text=new EditText(this); text.setHint("家族全員への伝言"); text.setMinLines(3);
        new AlertDialog.Builder(this).setTitle("伝言する").setView(text)
            .setPositiveButton("送る",(dialog,which)->{
                String body=text.getText().toString().trim(); if(body.isEmpty()) return;
                String csrf=snapshot.optString("csrf");
                network.execute(() -> {
                    try { ApiClient.request("/api/messages",new JSONObject().put("csrf",csrf).put("text",body).put("target_member_id",0));
                        runOnUiThread(()->loadMessages(0));
                    } catch(Exception e) { runOnUiThread(()->Toast.makeText(this,"伝言を送れませんでした",Toast.LENGTH_SHORT).show()); }
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
                monthCache.clear(); snapshot=null; messages=new JSONArray(); shoppingCategories=null; itemCategories=null;
                stampMonths.clear(); stampImages.evictAll(); pendingStampImages.clear();
                android.webkit.CookieManager.getInstance().removeAllCookies(value -> runOnUiThread(this::showLogin));
                android.webkit.CookieManager.getInstance().flush();
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
