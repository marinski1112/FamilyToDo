package jp.marinski.familytodo;

import android.Manifest;
import android.app.Activity;
import android.app.AlertDialog;
import android.app.DatePickerDialog;
import android.app.TimePickerDialog;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.content.pm.ShortcutInfo;
import android.content.pm.ShortcutManager;
import android.graphics.drawable.Icon;
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
import android.graphics.Color;
import android.graphics.drawable.GradientDrawable;
import android.view.Gravity;
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

/** Native family screens with authenticated Web views for sign-in and full Web-only tools. */
public final class MainActivity extends Activity {
    private final ExecutorService network = Executors.newSingleThreadExecutor();
    private final ExecutorService stampMedia = Executors.newSingleThreadExecutor();
    private LinearLayout root, content, pageDock;
    private boolean checklistEvents=false, checklistCompleted=false;
    private int familyLogSubjectId=0;
    private String messageDraft="";
    private int messageDraftEpoch=-1;
    private boolean inlineMessageSending;
    private final Map<Integer,JSONObject> messageStamps=new HashMap<>();
    private boolean goodsCompleted=false;
    private boolean emptyCategoriesExpanded=false;
    private final Set<String> expandedGoodsCategories=new HashSet<>();
    private final Map<String,String[]> goodsComposerDrafts=new HashMap<>();

    private WebView login;
    private JSONObject snapshot;
    private JSONArray messages = new JSONArray();
    private JSONObject familyLog;
    private boolean familyLogCached;
    private JSONObject shoppingCategories, itemCategories;
    private MessagePhotoUpload.Draft pendingPhoto;
    private String pendingPhotoCaption="",pendingPhotoReminder="";
    private boolean photoSending;
    private MessagePhotoUpload.Draft pendingFamilyLogPhoto;
    private int pendingFamilyLogPhotoId;
    private boolean familyPhotoSending;
    private String pendingStampName="";
    private String pendingAnimatedStampName="";
    private int pendingAnimatedFrameMs=120;
    private final Map<String,JSONArray> stampMonths=new ConcurrentHashMap<>();
    private final LruCache<String,Bitmap> stampImages=new LruCache<String,Bitmap>(8*1024) {
        @Override protected int sizeOf(String key,Bitmap value) { return Math.max(1,value.getByteCount()/1024); }
    };
    private final Set<String> pendingStampImages=new HashSet<>();
    private final Set<String> scheduledFramePaths=new HashSet<>();
    private final Set<String> scheduledAnimationPaths=new HashSet<>();
    private boolean hasOlderMessages;
    private volatile int sessionEpoch;
    private String memorySessionBinding;
    private volatile int stampGeneration;
    private boolean showingCached;
    private final Map<String,JSONObject> monthCache = new ConcurrentHashMap<>();
    private YearMonth month = YearMonth.now(java.time.ZoneId.of("Asia/Tokyo"));
    private LocalDate selectedDay=LocalDate.now(java.time.ZoneId.of("Asia/Tokyo"));
    private String tab = "home";
    private String goodsKind = "shopping";
    private JSONObject locationLatest;
    private String locationError="";
    private WebView pageWeb;
    @Override public void onCreate(Bundle state) { super.onCreate(state); ApiClient.setMutationsEnabled(false); showNative(); if(!BuildConfig.UI_TEST_MODE)load(); }
    @Override protected void onResume() {
        super.onResume();
        if(BuildConfig.UI_TEST_MODE)return;
        if(content!=null && login==null && pageWeb==null && !java.util.Objects.equals(memorySessionBinding,SnapshotCache.currentSessionBinding())) load();
    }
    private boolean darkMode() {
        return (getResources().getConfiguration().uiMode &
            android.content.res.Configuration.UI_MODE_NIGHT_MASK)==android.content.res.Configuration.UI_MODE_NIGHT_YES;
    }
    private int dp(float value) { return (int)(value*getResources().getDisplayMetrics().density+0.5f); }
    private int pageColor() { return Color.parseColor(darkMode()?"#101827":"#F4F6FA"); }
    private int surfaceColor() { return Color.parseColor(darkMode()?"#1B2637":"#FFFFFF"); }
    private int textColor() { return Color.parseColor(darkMode()?"#EEF3FA":"#18212F"); }
    private int mutedColor() { return Color.parseColor(darkMode()?"#A6B3C6":"#6B7280"); }
    private int accentColor() { return Color.parseColor(darkMode()?"#6366F1":"#4F46E5"); }
    private int lineColor() { return Color.parseColor(darkMode()?"#35465C":"#E5E7EB"); }
    private int softColor() { return Color.parseColor(darkMode()?"#293452":"#EEF2FF"); }
    private LinearLayout panel() {
        LinearLayout panel=new LinearLayout(this); panel.setOrientation(LinearLayout.VERTICAL);
        panel.setPadding(dp(12),dp(10),dp(12),dp(10));
        panel.setBackground(shape(surfaceColor(),lineColor(),18));
        return panel;
    }
    private void addPanel(LinearLayout panel) {
        LinearLayout.LayoutParams lp=new LinearLayout.LayoutParams(-1,-2);
        lp.setMargins(0,0,0,dp(12));content.addView(panel,lp);
    }
    private GradientDrawable shape(int fill, int stroke, int radius) {
        GradientDrawable background=new GradientDrawable();
        background.setColor(fill); background.setCornerRadius(dp(radius));
        if(stroke!=Color.TRANSPARENT) background.setStroke(dp(1),stroke);
        return background;
    }
    private void styleButton(Button b, boolean selected) {
        b.setAllCaps(false); b.setTextSize(14); b.setMinHeight(dp(44));
        b.setPadding(dp(12),dp(7),dp(12),dp(7));
        b.setTextColor(selected?Color.WHITE:textColor());
        b.setBackground(shape(selected?accentColor():surfaceColor(),
            selected?Color.TRANSPARENT:lineColor(),11));
        b.setStateListAnimator(null);
    }
    private Button button(String label, Runnable action) {
        Button b=new Button(this);b.setText(label);styleButton(b,false);
        b.setOnClickListener(v -> action.run());return b;
    }
    private TextView label(String value) {
        TextView t=new TextView(this);t.setText(value);t.setTextSize(16);
        t.setTextColor(textColor());t.setPadding(dp(8),dp(12),dp(8),dp(12));return t;
    }
    private TextView heading(String value) {
        TextView t=label(value);t.setTextSize(22);t.setTypeface(null,android.graphics.Typeface.BOLD);
        return t;
    }
    private void applySystemBarInsets(android.view.View view) {
        if(Build.VERSION.SDK_INT<35) return;
        view.setOnApplyWindowInsetsListener((target,insets) -> {
            android.graphics.Insets bars=insets.getInsets(
                android.view.WindowInsets.Type.systemBars()|android.view.WindowInsets.Type.displayCutout());
            target.setPadding(bars.left,bars.top,bars.right,bars.bottom);
            return insets;
        });
    }
    private void showNative() {
        if (login != null) {
            ApiClient.setMutationsEnabled(false);
            stampGeneration++;
            login.destroy(); login = null;
            monthCache.clear(); snapshot=null; messages=new JSONArray(); familyLog=null; familyLogCached=false; locationLatest=null; locationError="";
            shoppingCategories=null; itemCategories=null; stampMonths.clear(); stampImages.evictAll(); pendingStampImages.clear(); scheduledFramePaths.clear(); scheduledAnimationPaths.clear();
        }
        root=new LinearLayout(this);root.setOrientation(LinearLayout.VERTICAL);
        root.setBackgroundColor(pageColor());
        if(pageWeb!=null) {pageWeb.destroy();pageWeb=null;}
        TextView version=label("FamilyToDo  ・  テスト版 v"+BuildConfig.VERSION_NAME);
        version.setTextSize(13);version.setTextColor(mutedColor());
        version.setPadding(dp(18),dp(8),dp(18),0);root.addView(version);
        if(tab.equals("calendar")) {
            LinearLayout controls=new LinearLayout(this);
            controls.setPadding(dp(12),dp(6),dp(12),dp(6));
            Button previous=button("前月",() -> {month=month.minusMonths(1);selectedDay=month.atDay(1);load();});
            Button next=button("翌月",() -> {month=month.plusMonths(1);selectedDay=month.atDay(1);load();});
            Button refresh=button("更新",this::load);
            Button settings=button("設定 ⋮",this::showSettingsActions);
            for(Button control:new Button[]{previous,next,refresh,settings}) {
                LinearLayout.LayoutParams item=new LinearLayout.LayoutParams(0,dp(44),1);
                item.setMargins(0,0,dp(6),0);controls.addView(control,item);
            }
            root.addView(controls);
        }
        ScrollView scroll=new ScrollView(this);
        content=new LinearLayout(this);content.setOrientation(LinearLayout.VERTICAL);
        content.setPadding(dp(14),dp(4),dp(14),dp(24));
        scroll.addView(content);root.addView(scroll,new LinearLayout.LayoutParams(-1,0,1));
        pageDock=new LinearLayout(this);pageDock.setOrientation(LinearLayout.VERTICAL);
        pageDock.setBackground(shape(surfaceColor(),lineColor(),0));root.addView(pageDock);
        root.addView(bottomNavigation());
        applySystemBarInsets(root);setContentView(root);
        render();
    }
    private LinearLayout bottomNavigation() {
        LinearLayout nav=new LinearLayout(this);nav.setPadding(dp(2),dp(6),dp(2),dp(6));
        nav.setBackground(shape(surfaceColor(),lineColor(),0));
        String[] icons={"🏠","✅","📅","📍","🐣","💬"};
        String[] names={"ホーム","チェックリスト","カレンダー","位置情報","家族ログ","伝言"};
        String[] keys={"home","goods","calendar","location","familylog","messages"};
        for(int i=0;i<keys.length;i++) {
            final String destination=keys[i]; boolean active=destination.equals(tab);
            LinearLayout item=new LinearLayout(this);item.setOrientation(LinearLayout.VERTICAL);
            item.setGravity(Gravity.CENTER);
            item.setBackground(shape(active?softColor():surfaceColor(),Color.TRANSPARENT,12));
            TextView icon=new TextView(this);icon.setText(icons[i]);icon.setTextSize(19);
            icon.setGravity(Gravity.CENTER);item.addView(icon);
            TextView name=new TextView(this);name.setText(names[i]);name.setTextSize(10);
            name.setSingleLine(false);name.setMaxLines(1);name.setGravity(Gravity.CENTER);
            name.setAutoSizeTextTypeUniformWithConfiguration(7,10,1,android.util.TypedValue.COMPLEX_UNIT_SP);
            name.setTextColor(active?accentColor():mutedColor());item.addView(name,new LinearLayout.LayoutParams(-1,-2));
            item.setContentDescription(names[i]+"を開く");
            item.setOnClickListener(v -> navigate(destination));
            LinearLayout.LayoutParams slot=new LinearLayout.LayoutParams(0,dp(62),1);
            slot.setMargins(dp(1),0,dp(1),0);nav.addView(item,slot);
        }
        return nav;
    }
    private void navigate(String destination) {
        if(destination.equals(tab)){if(pageWeb!=null){showNative();if(!BuildConfig.UI_TEST_MODE)load();}return;}
        tab=destination;
        if(destination.equals("home")) {
            selectedDay=LocalDate.now(java.time.ZoneId.of("Asia/Tokyo"));
            month=YearMonth.from(selectedDay);
        }
        if(destination.equals("location")&&!BuildConfig.UI_TEST_MODE){showWebPage("/app/location.php");return;}
        showNative();
        if(BuildConfig.UI_TEST_MODE)return;
        if(destination.equals("messages"))loadMessages(0);
        else if(destination.equals("familylog"))loadFamilyLog();
        else if(destination.equals("location"))loadLocation();
        else if(snapshot==null||!month.toString().equals(snapshot.optString("month")))load();
    }
    private void load() {
        if(BuildConfig.UI_TEST_MODE){render();return;}
        ApiClient.setMutationsEnabled(false);
        String binding=SnapshotCache.currentSessionBinding();
        if(!java.util.Objects.equals(memorySessionBinding,binding)) {
            sessionEpoch++;
            stampGeneration++;
            monthCache.clear(); snapshot=null; showingCached=false; messages=new JSONArray(); familyLog=null; familyLogCached=false; locationLatest=null; locationError="";
            shoppingCategories=null; itemCategories=null; stampMonths.clear(); stampImages.evictAll();
            pendingStampImages.clear(); scheduledFramePaths.clear(); scheduledAnimationPaths.clear();
            pendingPhoto=null; pendingFamilyLogPhoto=null;
            memorySessionBinding=binding;
        }
        String requested = month.toString();
        int epoch=sessionEpoch;
        snapshot = monthCache.get(requested);
        showingCached=snapshot!=null;
        render();
        network.execute(() -> {
            JSONArray savedStamps=SnapshotCache.readPlacements(this,requested);
            if(savedStamps!=null) runOnUiThread(() -> {
                if(epoch!=sessionEpoch||stampMonths.containsKey(requested)) return;
                stampMonths.put(requested,savedStamps);
                if(tab.equals("calendar")&&requested.equals(month.toString())) render();
            });
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
                if(data.optInt("schemaVersion")!=1 || !requested.equals(data.optString("month")) ||
                    data.optInt("familyId")<=0 || data.optInt("memberId")<=0)
                    throw new IllegalStateException("Android APIの契約が一致しません");
                if(epoch!=sessionEpoch) return;
                Map<String,JSONObject> fetched=new HashMap<>(); fetched.put(requested,data);
                JSONObject previous=monthCache.get(requested);
                boolean accountChanged=previous!=null && (previous.optInt("familyId")!=data.optInt("familyId") || previous.optInt("memberId")!=data.optInt("memberId"));
                if(accountChanged) {
                    stampGeneration++;
                    stampMedia.execute(() -> SnapshotCache.clear(this));
                    SnapshotCache.clear(this);
                }
                runOnUiThread(() -> {
                    if(epoch!=sessionEpoch) return;
                    if(accountChanged) { monthCache.clear(); messages=new JSONArray(); familyLog=null; familyLogCached=false; shoppingCategories=null; itemCategories=null; stampMonths.clear(); stampImages.evictAll(); pendingStampImages.clear(); scheduledFramePaths.clear(); scheduledAnimationPaths.clear(); }
                    monthCache.put(requested, data);
                    if (requested.equals(month.toString())) {
                        snapshot=data; showingCached=false; ApiClient.setMutationsEnabled(true); render();
                    }
                });
                for (boolean shopping : new boolean[]{true,false}) {
                    try {
                        JSONObject categories=ApiClient.request(shopping?"/api/shopping-categories":"/api/item",null);
                        runOnUiThread(() -> {
                            if(epoch!=sessionEpoch) return;
                            if(shopping) shoppingCategories=categories; else itemCategories=categories;
                            if(tab.equals("goods")&&goodsKind.equals(shopping?"shopping":"item")) render();
                        });
                    } catch(Exception ignored) { /* The checklist remains available. */ }
                }
                try {
                    YearMonth target=YearMonth.parse(requested);
                    JSONObject response=ApiClient.request("/api/calendar-stamps?from="+target.atDay(1)+"&to="+target.atEndOfMonth(),null);
                    JSONArray stamps=response.optJSONArray("stamps");
                    if(stamps!=null) {
                        SnapshotCache.writePlacements(this,requested,stamps);
                        runOnUiThread(() -> {
                        if(epoch!=sessionEpoch) return;
                        stampMonths.put(requested,stamps);
                        if(tab.equals("calendar")&&requested.equals(month.toString())) render();
                        prefetchStampThumbnails(stamps,epoch);
                        });
                    }
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
        if (tab.equals("messages")) { if(pageDock!=null&&pageDock.getChildCount()==0)pageDock.addView(messageComposer());updateMessageComposerReadiness();renderMessages(); return; }
        if (tab.equals("familylog")) { renderFamilyLog();renderFamilyLogDock(); return; }
        if (tab.equals("location")) { renderLocation(); return; }
        if (tab.equals("home")) { renderHome(); return; }
        if (tab.equals("goods")) {
            content.addView(heading("✅ チェックリスト  "+selectedDay.getMonthValue()+"月"+selectedDay.getDayOfMonth()+"日"));
            if(snapshot!=null)renderChecklistTasks();
            LinearLayout kinds=new LinearLayout(this);
            Button shopping=button("🛒 買い物",() -> {goodsKind="shopping";render();});
            Button items=button("🎒 持ち物",() -> {goodsKind="item";render();});
            styleButton(shopping,goodsKind.equals("shopping"));styleButton(items,goodsKind.equals("item"));
            kinds.addView(shopping,new LinearLayout.LayoutParams(0,dp(46),1));
            kinds.addView(items,new LinearLayout.LayoutParams(0,dp(46),1));
            content.addView(kinds);
        } else content.addView(heading(month.getYear() + "年" + month.getMonthValue() + "月"));
        if (snapshot == null || !month.toString().equals(snapshot.optString("month"))) { content.addView(label("読み込み中…")); return; }
        if (showingCached) content.addView(label("保存済みデータを読み取り専用で表示中・更新を確認しています"));
        if(tab.equals("calendar")&&ApiClient.canMutate()) {
            Button add=button("＋ 追加・管理",this::showCalendarActions);
            styleButton(add,true);content.addView(add);
        }
        if (snapshot.optBoolean("truncated")) content.addView(label("項目が多いため一部のみ表示しています。"));
        if (tab.equals("calendar")) renderCalendar(); else renderGoods();
    }
    private LinearLayout card(String title,String details) {
        LinearLayout card=new LinearLayout(this);card.setOrientation(LinearLayout.VERTICAL);
        card.setPadding(dp(14),dp(10),dp(14),dp(10));
        card.setBackground(shape(surfaceColor(),lineColor(),18));
        TextView heading=label(title);heading.setTypeface(null,android.graphics.Typeface.BOLD);
        card.addView(heading);card.addView(label(details));
        return card;
    }
    private void addPanelCard(LinearLayout view) {
        LinearLayout.LayoutParams lp=new LinearLayout.LayoutParams(-1,-2);
        lp.setMargins(0,0,0,dp(12));content.addView(view,lp);
    }
    private void renderHome() {
        content.addView(heading("ホーム"));
        content.addView(label(LocalDate.now(java.time.ZoneId.of("Asia/Tokyo")).toString()));
        if(snapshot==null||!month.toString().equals(snapshot.optString("month"))) {
            content.addView(label("読み込み中…"));return;
        }
        if(showingCached)content.addView(label("保存済みデータを表示中。通信の確認を待っています。"));
        String today=LocalDate.now(java.time.ZoneId.of("Asia/Tokyo")).toString();
        JSONArray tasks=snapshot.optJSONArray("tasks"),shopping=snapshot.optJSONArray("shopping"),items=snapshot.optJSONArray("items");
        int eventCount=0,taskCount=0,shoppingCount=0,itemCount=0;
        if(tasks!=null)for(int i=0;i<tasks.length();i++) {
            JSONObject task=tasks.optJSONObject(i);if(task==null||!taskOnDay(task,today))continue;
            if("EVENT".equalsIgnoreCase(task.optString("task_kind")))eventCount++;
            else if(!"completed".equals(task.optString("status")))taskCount++;
        }
        if(shopping!=null)for(int i=0;i<shopping.length();i++) {
            JSONObject row=shopping.optJSONObject(i);
            if(row!=null&&!"completed".equals(row.optString("status")))shoppingCount++;
        }
        if(items!=null)for(int i=0;i<items.length();i++) {
            JSONObject row=items.optJSONObject(i);
            if(row!=null&&!"completed".equals(row.optString("status")))itemCount++;
        }
        content.addView(heading("今日"));
        String[] titles={"✅ 未完了タスク","📅 イベント","🛒 買い物残り","🎒 持ち物残り"};
        int[] counts={taskCount,eventCount,shoppingCount,itemCount};
        Runnable[] destinations={()->openTodayChecklist("shopping"),()->navigate("calendar"),()->openTodayChecklist("shopping"),()->openTodayChecklist("item")};
        for(int row=0;row<2;row++) {
            LinearLayout grid=new LinearLayout(this);
            for(int col=0;col<2;col++) {
                int index=row*2+col;LinearLayout stat=panel();stat.setPadding(dp(13),dp(10),dp(13),dp(10));
                TextView value=label(Integer.toString(counts[index]));value.setTextSize(23);value.setTypeface(null,android.graphics.Typeface.BOLD);
                stat.addView(value);TextView title=label(titles[index]);title.setTextSize(13);title.setTextColor(mutedColor());stat.addView(title);
                stat.setContentDescription(titles[index]+" "+counts[index]+"件");stat.setOnClickListener(v->destinations[index].run());
                LinearLayout.LayoutParams cell=new LinearLayout.LayoutParams(0,-2,1);cell.setMargins(col==0?0:dp(5),0,col==0?dp(5):0,0);grid.addView(stat,cell);
            }
            addPanelCard(grid);
        }
        LinearLayout journal=card("📖 昨日の家族日誌","家族の記録を振り返る ›");
        journal.setOnClickListener(v->showWebPage("/app/family_journal.php"));addPanelCard(journal);
        content.addView(heading("ショートカット"));
        String[] shortcutNames={"✅ チェックリスト","📅 カレンダー","📖 家族日誌","📍 位置情報","🐣 家族ログ","💬 伝言"};
        Runnable[] shortcutActions={()->openTodayChecklist("shopping"),()->navigate("calendar"),()->showWebPage("/app/family_journal.php"),()->navigate("location"),()->navigate("familylog"),()->navigate("messages")};
        for(int row=0;row<2;row++) {
            LinearLayout grid=new LinearLayout(this);
            for(int col=0;col<3;col++) {
                int index=row*3+col;LinearLayout shortcut=panel();shortcut.setGravity(Gravity.CENTER);shortcut.setPadding(dp(3),dp(9),dp(3),dp(9));
                String title=shortcutNames[index];int split=title.indexOf(' ');
                TextView icon=label(title.substring(0,split));icon.setTextSize(21);icon.setGravity(Gravity.CENTER);shortcut.addView(icon);
                TextView caption=label(title.substring(split+1));caption.setTextSize(11);caption.setPadding(0,dp(3),0,0);caption.setGravity(Gravity.CENTER);caption.setSingleLine(true);shortcut.addView(caption);
                shortcut.setContentDescription(title);shortcut.setOnClickListener(v->shortcutActions[index].run());
                LinearLayout.LayoutParams cell=new LinearLayout.LayoutParams(0,-2,1);cell.setMargins(col==0?0:dp(4),0,col==2?0:dp(4),0);grid.addView(shortcut,cell);
            }
            addPanelCard(grid);
        }
        if(ApiClient.canMutate()) {
            LinearLayout quickPanel=panel();quickPanel.addView(heading("クイック追加"));
            quickPanel.addView(button("＋ タスク・イベント",()->{selectedDay=LocalDate.now(java.time.ZoneId.of("Asia/Tokyo"));addTask();}));
            LinearLayout quick=new LinearLayout(this);
            quick.addView(button("＋ 持ち物",()->addGoods(false)),new LinearLayout.LayoutParams(0,dp(48),1));
            quick.addView(button("＋ 買い物",()->addGoods(true)),new LinearLayout.LayoutParams(0,dp(48),1));quickPanel.addView(quick);addPanel(quickPanel);
        }
        content.addView(button("⚙️ 管理",this::showSettingsActions));
        content.addView(button("Web版のホームを開く",() -> showWebPage("/app/index.php")));
        content.addView(heading("今日の予定"));
        int shown=0;
        if(tasks!=null)for(int i=0;i<tasks.length()&&shown<8;i++) {
            JSONObject task=tasks.optJSONObject(i);if(task==null||!taskOnDay(task,today))continue;
            LinearLayout entry=card("EVENT".equalsIgnoreCase(task.optString("task_kind"))?"📅 "+task.optString("title"):"✅ "+task.optString("title"),
                "completed".equals(task.optString("status"))?"完了済み":"未完了");
            entry.setOnClickListener(v->openTodayChecklist("shopping"));addPanelCard(entry);shown++;
        }
        if(shown==0)content.addView(label("今日の予定はありません"));
    }
    private void openTodayChecklist(String kind) {
        selectedDay=LocalDate.now(java.time.ZoneId.of("Asia/Tokyo"));goodsKind=kind;navigate("goods");
    }
    private void loadLocation() {
        int epoch=sessionEpoch;
        locationLatest=null;locationError="";render();
        network.execute(() -> {
            try {
                JSONObject response=ApiClient.request("/api/location/latest",null);
                runOnUiThread(() -> {
                    if(epoch!=sessionEpoch||!tab.equals("location"))return;
                    locationLatest=response;render();
                });
            }catch(Exception error) {
                runOnUiThread(() -> {
                    if(epoch!=sessionEpoch||!tab.equals("location"))return;
                    locationError="位置情報を読み込めませんでした。通信とログインを確認してください。";render();
                });
            }
        });
    }
    private void renderLocation() {
        content.addView(heading("位置情報"));
        content.addView(button("更新",this::loadLocation));
        content.addView(button("家族の地図・履歴を開く",() -> showWebPage("/app/location.php")));
        content.addView(button("この端末の位置共有を設定",this::showSettings));
        if(!locationError.isEmpty()) {content.addView(label(locationError));return;}
        if(locationLatest==null) {content.addView(label("共有状態を読み込み中…"));return;}
        JSONArray members=locationLatest.optJSONArray("members");
        if(members==null||members.length()==0) {content.addView(label("表示できるメンバーがいません"));return;}
        for(int i=0;i<members.length();i++) {
            JSONObject member=members.optJSONObject(i);if(member==null)continue;
            String state=member.optBoolean("sharingEnabled")?"共有ON":"共有OFF";
            String place=member.optString("registeredPlaceLabel");
            if(place.isEmpty()||place.equals("null"))place=member.optString("displayNearbyPlaceLabel");
            JSONObject latest=member.optJSONObject("latest");
            String time=latest==null?"位置情報なし":latest.optString("recordedAt");
            String detail=state+(place.isEmpty()||place.equals("null")?"":" ・ "+place)+"\n"+time;
            addPanelCard(card(member.optString("name","メンバー"),detail));
        }
    }
    private String nativeRoute(String path) {
        if("/app/index.php".equals(path))return "home";
        if("/app/tasks.php".equals(path))return "goods";
        if("/app/calendar.php".equals(path))return "calendar";
        if("/app/location.php".equals(path))return "location";
        if("/app/family_log.php".equals(path))return "familylog";
        if("/app/messages.php".equals(path))return "messages";
        return null;
    }
    private void returnFromWebPage() { showNative();load(); }
    private void showWebPage(String path) {
        if(!path.startsWith("/app/")||login!=null)return;
        if(BuildConfig.UI_TEST_MODE)return;
        if(pageWeb!=null){pageWeb.destroy();pageWeb=null;}
        pageWeb=new WebView(this);
        pageWeb.getSettings().setJavaScriptEnabled(true);
        pageWeb.getSettings().setDomStorageEnabled(true);
        pageWeb.setWebViewClient(new WebViewClient() {
            @Override public boolean shouldOverrideUrlLoading(WebView view,WebResourceRequest request) {
                android.net.Uri destination=request.getUrl(),origin=android.net.Uri.parse(ApiClient.ORIGIN);
                if("https".equals(destination.getScheme())&&origin.getHost().equals(destination.getHost())&&
                    origin.getPort()==destination.getPort()) {
                    String route=nativeRoute(destination.getPath());
                    if(route!=null&&!destination.getPath().equals(android.net.Uri.parse(path).getPath())){navigate(route);return true;}
                    return false;
                }
                startActivity(new Intent(Intent.ACTION_VIEW,destination));return true;
            }
        });
        LinearLayout frame=new LinearLayout(this);frame.setOrientation(LinearLayout.VERTICAL);
        frame.setBackgroundColor(pageColor());
        frame.addView(button("← アプリに戻る",this::returnFromWebPage));
        if(path.startsWith("/app/location.php"))frame.addView(button("この端末の位置共有を設定",this::showSettings));
        frame.addView(pageWeb,new LinearLayout.LayoutParams(-1,0,1));
        applySystemBarInsets(frame);setContentView(frame);
        pageWeb.loadUrl(ApiClient.ORIGIN+path);
    }
    private int calendarTaskColor(JSONObject task) {
        String color=task.optString("calendar_color");
        return color.matches("#[0-9a-fA-F]{6}")?Color.parseColor(color):Color.parseColor("#EC4899");
    }
    private void showCalendarActions() {
        ArrayList<String> actions=new ArrayList<>();
        actions.add("タスク・イベントを追加");actions.add("定期タスク");
        actions.add("スタンプを配置");actions.add("スタンプ管理");
        if(snapshot!=null&&snapshot.optBoolean("canManageStamps")) {
            actions.add("新しいスタンプ画像");actions.add("動くPNGスタンプ");
        }
        new AlertDialog.Builder(this).setTitle("追加・管理")
            .setItems(actions.toArray(new String[0]),(dialog,which) -> {
                switch(actions.get(which)) {
                    case "タスク・イベントを追加":addTask();break;
                    case "定期タスク":loadRecurringRules();break;
                    case "スタンプを配置":addStamp();break;
                    case "スタンプ管理":loadStampAssets();break;
                    case "新しいスタンプ画像":chooseStaticStamp();break;
                    case "動くPNGスタンプ":chooseAnimatedStamp();break;
                }
            }).show();
    }
    private void showSettingsActions() {
        String[] actions={"位置設定","アプリ設定","Google連携の状態","ホーム画面アイコン","ログアウト","Web版の管理画面"};
        new AlertDialog.Builder(this).setTitle("設定")
            .setItems(actions,(dialog,which) -> {
                switch(which) {
                    case 0:showSettings();break;
                    case 1:loadAppSettings();break;
                    case 2:loadIntegrationStatus();break;
                    case 3:pinFamilyShortcut();break;
                    case 4:logout();break;
                    case 5:showWebPage("/app/settings.php");break;
                }
            }).show();
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
    private void showCalendarDayPreview(LocalDate day,ArrayList<JSONObject> rows) {
        if(rows.isEmpty()){Toast.makeText(this,day+" の予定はありません",Toast.LENGTH_SHORT).show();return;}
        ArrayList<String> names=new ArrayList<>();
        for(JSONObject row:rows) {
            String at=dateValue(row,"start_at","due_at");
            names.add(("EVENT".equalsIgnoreCase(row.optString("task_kind"))?"📅 ":"☑ ")+
                (row.optInt("all_day")==1||at.length()<16?"":at.substring(11,16)+" ")+row.optString("title"));
        }
        new AlertDialog.Builder(this).setTitle(day+" の予定").setItems(names.toArray(new String[0]),(dialog,which)->{
            selectedDay=day;checklistEvents="EVENT".equalsIgnoreCase(rows.get(which).optString("task_kind"));navigate("goods");
        }).setNegativeButton("閉じる",null).show();
    }
    private void renderCalendar() {
        JSONArray tasks=snapshot.optJSONArray("tasks"); if(tasks==null) return;
        LinearLayout calendarPanel=panel();
        calendarPanel.setPadding(dp(2),dp(4),dp(2),dp(4));
        LinearLayout weekdays=new LinearLayout(this);
        for(String weekday:new String[]{"日","月","火","水","木","金","土"}) {
            TextView day=label(weekday);day.setGravity(Gravity.CENTER);day.setTextSize(11);
            day.setTypeface(null,android.graphics.Typeface.BOLD);
            day.setTextColor(mutedColor());day.setPadding(0,dp(7),0,dp(7));
            weekdays.addView(day,new LinearLayout.LayoutParams(0,-2,1));
        }
        calendarPanel.addView(weekdays);
        ArrayList<JSONObject> ranges=new ArrayList<>();
        for(int i=0;i<tasks.length();i++) {
            JSONObject task=tasks.optJSONObject(i);if(task!=null&&multiDayEvent(task))ranges.add(task);
        }
        ranges.sort((a,b)->{
            int start=dateValue(a,"start_at","due_at").compareTo(dateValue(b,"start_at","due_at"));
            if(start!=0)return start;
            int end=dateValue(a,"end_at","start_at").compareTo(dateValue(b,"end_at","start_at"));
            return end!=0?end:Integer.compare(a.optInt("id"),b.optInt("id"));
        });
        Map<JSONObject,Integer> lanes=new HashMap<>();ArrayList<String> laneEnds=new ArrayList<>();
        for(JSONObject task:ranges) {
            String start=dateValue(task,"start_at","due_at").substring(0,10),end=dateValue(task,"end_at","start_at").substring(0,10);
            int lane=0;while(lane<laneEnds.size()&&laneEnds.get(lane).compareTo(start)>=0)lane++;
            if(lane==laneEnds.size())laneEnds.add(end);else laneEnds.set(lane,end);lanes.put(task,lane);
        }
        int offset=month.atDay(1).getDayOfWeek().getValue()%7;
        int weeks=(offset+month.lengthOfMonth()+6)/7;
        for(int row=0;row<weeks;row++) {
            LocalDate weekStart=month.atDay(1).plusDays(row*7-offset),weekEnd=weekStart.plusDays(6);
            int bandRows=0;
            for(JSONObject task:ranges)if(taskOnDay(task,weekStart.toString())||taskOnDay(task,weekEnd.toString())||
                (dateValue(task,"start_at","due_at").substring(0,10).compareTo(weekStart.toString())>=0&&dateValue(task,"start_at","due_at").substring(0,10).compareTo(weekEnd.toString())<=0)) {
                if(lanes.get(task)<4)bandRows=Math.max(bandRows,lanes.get(task)+1);
            }
            int eventRows=1;boolean hasOverflow=false,hasAccessory=false,hasStamps=false;
            for(int col=0;col<7;col++) {
                LocalDate day=month.atDay(1).plusDays(row*7+col-offset);int events=0;
                for(int n=0;n<tasks.length();n++) {
                    JSONObject task=tasks.optJSONObject(n);if(task==null||!taskOnDay(task,day.toString()))continue;
                    if("EVENT".equalsIgnoreCase(task.optString("task_kind"))&&task.optInt("calendar_visible",1)==1&&!multiDayEvent(task))events++;
                    else if(!"EVENT".equalsIgnoreCase(task.optString("task_kind")))hasAccessory=true;
                }
                eventRows=Math.max(eventRows,Math.min(4,events));hasOverflow|=events>4;
                hasAccessory|=calendarGoodsCount(snapshot.optJSONArray("shopping"),day,"due_date")+calendarGoodsCount(snapshot.optJSONArray("items"),day,"due_at")>0;
                hasStamps|=stampsOnDay(day.toString()).length()>0;
            }
            int weekHeight=Math.max(76,48+19*bandRows+17*eventRows+(hasOverflow?13:0)+(hasAccessory?13:0)+(hasStamps?18:0));
            LinearLayout week=new LinearLayout(this);
            for(int column=0;column<7;column++) {
                int date=row*7+column-offset+1;
                LinearLayout cell=new LinearLayout(this);cell.setOrientation(LinearLayout.VERTICAL);
                cell.setPadding(dp(2),dp(4),dp(2),dp(2));
                cell.setBackground(shape(surfaceColor(),lineColor(),0));
                LinearLayout.LayoutParams slot=new LinearLayout.LayoutParams(0,dp(weekHeight),1);
                week.addView(cell,slot);
                LocalDate day=month.atDay(1).plusDays(date-1);
                boolean inMonth=YearMonth.from(day).equals(month);
                String holiday=CalendarHolidays.name(day);
                boolean selected=day.equals(LocalDate.now(java.time.ZoneId.of("Asia/Tokyo")));
                TextView number=new TextView(this);number.setText(Integer.toString(day.getDayOfMonth()));
                number.setTextSize(15);number.setTypeface(null,android.graphics.Typeface.BOLD);
                number.setGravity(Gravity.CENTER);
                number.setTextColor(selected?Color.WHITE:!inMonth?mutedColor():column==0||holiday!=null?Color.parseColor("#FB7185"):column==6?Color.parseColor("#93C5FD"):textColor());
                if(selected)number.setBackground(shape(accentColor(),Color.TRANSPARENT,100));
                cell.addView(number,new LinearLayout.LayoutParams(dp(28),dp(28)));
                TextView holidayLabel=new TextView(this);holidayLabel.setText(holiday==null?"":holiday);holidayLabel.setTextSize(8);
                holidayLabel.setTextColor(Color.parseColor("#FB7185"));holidayLabel.setSingleLine(true);holidayLabel.setEllipsize(android.text.TextUtils.TruncateAt.END);
                cell.addView(holidayLabel,new LinearLayout.LayoutParams(-1,dp(13)));
                android.view.View bandSpace=new android.view.View(this);cell.addView(bandSpace,new LinearLayout.LayoutParams(-1,dp(19*bandRows)));
                ArrayList<JSONObject> dayRows=new ArrayList<>(),events=new ArrayList<>();
                int taskCount=0,bandOverflow=0;
                for(int n=0;n<tasks.length();n++) {
                    JSONObject task=tasks.optJSONObject(n);if(task==null||!taskOnDay(task,day.toString()))continue;
                    if("EVENT".equalsIgnoreCase(task.optString("task_kind"))) {
                        if(task.optInt("calendar_visible",1)!=1)continue;
                        if(multiDayEvent(task)){if(lanes.get(task)>=4)bandOverflow++;}else events.add(task);
                    }else taskCount++;
                    dayRows.add(task);
                }
                events.sort((left,right)->{
                    int allDay=Integer.compare(right.optInt("all_day"),left.optInt("all_day"));
                    return allDay!=0?allDay:dateValue(left,"start_at","due_at").compareTo(dateValue(right,"start_at","due_at"));
                });
                for(int n=0;n<Math.min(4,events.size());n++) {
                    JSONObject task=events.get(n);TextView chip=new TextView(this);
                    String at=dateValue(task,"start_at","due_at"),first=at.length()>=10?at.substring(0,10):"";
                    chip.setText((task.optInt("all_day")==1||at.length()<16||!first.equals(day.toString())?"":at.substring(11,16)+" ")+task.optString("title"));
                    chip.setSingleLine(true);chip.setEllipsize(android.text.TextUtils.TruncateAt.END);chip.setTextSize(9);chip.setTextColor(Color.WHITE);
                    chip.setContentDescription(task.optString("title"));chip.setPadding(dp(2),0,dp(2),0);
                    chip.setBackground(shape(calendarTaskColor(task),Color.TRANSPARENT,4));
                    cell.addView(chip,new LinearLayout.LayoutParams(-1,dp(17)));
                }
                if(events.size()>4||bandOverflow>0) {
                    TextView more=new TextView(this);more.setText("＋"+(Math.max(0,events.size()-4)+bandOverflow)+"件");more.setTextSize(8);more.setTextColor(mutedColor());
                    cell.addView(more,new LinearLayout.LayoutParams(-1,dp(13)));
                }
                int shoppingCount=calendarGoodsCount(snapshot.optJSONArray("shopping"),day,"due_date");
                int itemCount=calendarGoodsCount(snapshot.optJSONArray("items"),day,"due_at");
                if(taskCount+shoppingCount+itemCount>0) {
                    TextView taskLabel=new TextView(this);taskLabel.setText((taskCount>0?"✅":"")+(shoppingCount>0?"🛒":"")+(itemCount>0?"🎒":"")+" "+(taskCount+shoppingCount+itemCount)+"件");taskLabel.setSingleLine(true);
                    taskLabel.setTextSize(9);taskLabel.setTextColor(Color.parseColor("#86EFAC"));
                    cell.addView(taskLabel,new LinearLayout.LayoutParams(-1,dp(13)));
                }
                int count=dayRows.size();
                cell.setOnLongClickListener(v->{showCalendarDayPreview(day,dayRows);return true;});
                if(stampsOnDay(day.toString()).length()>0) {
                    TextView mark=new TextView(this);mark.setText("✦");mark.setTextSize(10);
                    mark.setTextColor(accentColor());cell.addView(mark);
                }
                cell.setContentDescription(day.toString()+" 予定"+count+"件");
                cell.setOnClickListener(v -> {selectedDay=day;month=YearMonth.from(day);navigate("goods");});
            }
            android.widget.FrameLayout frame=new android.widget.FrameLayout(this);
            frame.addView(week,new android.widget.FrameLayout.LayoutParams(-1,dp(weekHeight)));
            for(JSONObject task:ranges) {
                int lane=lanes.get(task);if(lane>=4)continue;
                LocalDate first=LocalDate.parse(dateValue(task,"start_at","due_at").substring(0,10));
                LocalDate last=LocalDate.parse(dateValue(task,"end_at","start_at").substring(0,10));
                if(last.isBefore(weekStart)||first.isAfter(weekEnd))continue;
                LocalDate segmentStart=first.isBefore(weekStart)?weekStart:first,segmentEnd=last.isAfter(weekEnd)?weekEnd:last;
                int from=(int)java.time.temporal.ChronoUnit.DAYS.between(weekStart,segmentStart),span=(int)java.time.temporal.ChronoUnit.DAYS.between(segmentStart,segmentEnd)+1;
                TextView band=new TextView(this);band.setText((first.equals(segmentStart)?"📌 ":"‹ ")+task.optString("title")+(last.equals(segmentEnd)?"":" ›"));
                band.setSingleLine(true);band.setEllipsize(android.text.TextUtils.TruncateAt.END);band.setTextSize(9);band.setTextColor(Color.WHITE);
                band.setGravity(Gravity.CENTER_VERTICAL);band.setPadding(dp(4),0,dp(4),0);band.setBackground(shape(calendarTaskColor(task),Color.TRANSPARENT,4));
                band.setContentDescription(task.optString("title")+" "+first+"〜"+last);
                band.setOnClickListener(v->{selectedDay=segmentStart;month=YearMonth.from(segmentStart);checklistEvents=true;navigate("goods");});
                android.widget.FrameLayout.LayoutParams position=new android.widget.FrameLayout.LayoutParams(0,dp(17));position.topMargin=dp(45+19*lane);frame.addView(band,position);
                frame.addOnLayoutChangeListener((v,left,top,right,bottom,oldLeft,oldTop,oldRight,oldBottom)->{
                    int width=right-left;android.widget.FrameLayout.LayoutParams lp=(android.widget.FrameLayout.LayoutParams)band.getLayoutParams();
                    int margin=width*from/7+dp(2),bandWidth=width*(from+span)/7-width*from/7-dp(4);
                    if(lp.leftMargin!=margin||lp.width!=bandWidth){lp.leftMargin=margin;lp.width=bandWidth;band.setLayoutParams(lp);}
                });
            }
            calendarPanel.addView(frame);
        }
        addPanel(calendarPanel);
        content.addView(heading(selectedDay.toString()+" の予定"));
        renderSelectedStamps();
        ArrayList<JSONObject> dayTasks=new ArrayList<>();
        for(int n=0;n<tasks.length();n++) {
            JSONObject task=tasks.optJSONObject(n);
            if(task!=null&&taskOnDay(task,selectedDay.toString())) dayTasks.add(task);
        }
        dayTasks.sort((a,b) -> {
            boolean aEvent="EVENT".equalsIgnoreCase(a.optString("task_kind"));
            boolean bEvent="EVENT".equalsIgnoreCase(b.optString("task_kind"));
            if(aEvent!=bEvent) return aEvent?-1:1;
            boolean aAllDay=a.optInt("all_day")==1,bAllDay=b.optInt("all_day")==1;
            if(aAllDay!=bAllDay) return aAllDay?-1:1;
            return dateValue(a,"start_at","due_at").compareTo(dateValue(b,"start_at","due_at"));
        });
        Boolean previousEvent=null;
        for(JSONObject task:dayTasks) {
            boolean event="EVENT".equalsIgnoreCase(task.optString("task_kind"));
            if(previousEvent==null||previousEvent!=event) content.addView(label(event?"イベント":"タスク"));
            previousEvent=event;
            String start=dateValue(task,"start_at","due_at");
            String time=task.optInt("all_day")!=1 && start.length()>=16?start.substring(11,16)+"  ":"";
            int recurrenceId=task.optInt("recurrence_occurrence_id");
            int id=recurrenceId>0?recurrenceId:task.optInt("id");
            if(event) {
                TextView entry=label(time+"📌 "+task.optString("title"));
                entry.setContentDescription("イベント "+task.optString("title")+"。長押しで操作");
                if(ApiClient.canMutate()&&recurrenceId>0) entry.setOnLongClickListener(v -> { recurringOccurrenceActions(task); return true; });
                else if(ApiClient.canMutate()&&id>0) entry.setOnLongClickListener(v -> { taskActions(task); return true; });
                entry.setBackground(shape(surfaceColor(),lineColor(),12));
                addPanelCard(wrapView(entry));
            } else {
                CheckBox box=new CheckBox(this);box.setText(time+task.optString("title"));
                box.setChecked("completed".equals(task.optString("status")));
                box.setEnabled(id>0&&ApiClient.canMutate());
                box.setOnClickListener(v->toggle(recurrenceId>0?"recurrence":"task",id,box));
                if(ApiClient.canMutate()&&recurrenceId>0) box.setOnLongClickListener(v -> { recurringOccurrenceActions(task); return true; });
                else if(ApiClient.canMutate()&&id>0) box.setOnLongClickListener(v -> { taskActions(task); return true; });
                styleCheckBox(box);addPanelCard(wrapView(box));
            }
        }
        if(dayTasks.isEmpty()) content.addView(label("予定はありません"));
    }
    private boolean multiDayEvent(JSONObject task) {
        if(!"EVENT".equalsIgnoreCase(task.optString("task_kind"))||task.optInt("calendar_visible",1)!=1)return false;
        String first=dateValue(task,"start_at","due_at"),last=dateValue(task,"end_at","start_at");
        return first.length()>=10&&last.length()>=10&&last.substring(0,10).compareTo(first.substring(0,10))>0;
    }
    private int calendarGoodsCount(JSONArray rows,LocalDate day,String dateField) {
        int count=0;if(rows!=null)for(int i=0;i<rows.length();i++) {
            JSONObject row=rows.optJSONObject(i);if(row==null)continue;
            String date=row.optString(dateField,"");if(date.length()>=10&&date.substring(0,10).equals(day.toString()))count++;
        }
        return count;
    }
    private LinearLayout wrapView(android.view.View child) {
        LinearLayout holder=panel();holder.addView(child);return holder;
    }
    private void styleCheckBox(CheckBox box) {
        box.setTextSize(15);box.setTextColor(textColor());box.setMinHeight(dp(48));
        if(Build.VERSION.SDK_INT>=21) box.setButtonTintList(android.content.res.ColorStateList.valueOf(accentColor()));
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
            int epoch=sessionEpoch,generation=stampGeneration;
            stampMedia.execute(() -> {
                Bitmap image=null;
                try {
                    if(epoch!=sessionEpoch||generation!=stampGeneration) return;
                    image=SnapshotCache.readStamp(this,path);
                    if(image==null) {
                        image=ApiClient.thumbnail(path);
                        if(epoch==sessionEpoch&&generation==stampGeneration) SnapshotCache.writeStamp(this,path,image);
                    }
                } catch(Exception ignored) { }
                Bitmap result=image;
                runOnUiThread(() -> {
                    pendingStampImages.remove(path);
                    if(epoch!=sessionEpoch || generation!=stampGeneration || result==null) return;
                    stampImages.put(path,result);
                    if(tab.equals("calendar")) render();
                });
            });
        }
        HorizontalScrollView horizontal=new HorizontalScrollView(this); horizontal.addView(row);
        content.addView(horizontal);
        if(stamps.length()>12) content.addView(label("ほか "+(stamps.length()-12)+" 件"));
        prefetchSelectedStampFrames(stamps);
    }
    private void prefetchSelectedStampFrames(JSONArray stamps) {
        ArrayList<String> paths=new ArrayList<>();
        for(int i=0;i<stamps.length()&&paths.size()<16;i++) {
            JSONObject stamp=stamps.optJSONObject(i);
            JSONArray frames=stamp==null?null:stamp.optJSONArray("frames");
            if(frames==null||frames.length()<2||frames.length()>16||paths.size()+frames.length()>16) continue;
            for(int n=0;n<frames.length();n++) {
                JSONObject frame=frames.optJSONObject(n);
                String path=frame==null?"":frame.optString("url");
                if((path.matches("/api/calendar-stamp-media\\?asset=[1-9][0-9]*&frame=[0-9]+") ||
                    path.startsWith("/")&&!path.contains("?")&&path.endsWith(".png")) &&
                    scheduledFramePaths.add(path)) paths.add(path);
            }
        }
        if(!paths.isEmpty()) prefetchFrameStep(paths,0,sessionEpoch,stampGeneration);
        int animations=0;
        for(int i=0;i<stamps.length()&&animations<2;i++) {
            JSONObject stamp=stamps.optJSONObject(i);
            if(stamp==null||!"ANIMATED".equals(stamp.optString("kind"))||
                !("image/gif".equals(stamp.optString("mimeType"))||"image/webp".equals(stamp.optString("mimeType")))) continue;
            String path=stamp.optString("fullUrl");
            if(!scheduledAnimationPaths.add(path)) continue;
            animations++;
            int epoch=sessionEpoch,generation=stampGeneration;
            stampMedia.execute(() -> {
                try {
                    if(epoch!=sessionEpoch||generation!=stampGeneration) return;
                    if(SnapshotCache.readAnimation(this,path)==null) {
                        byte[] bytes=ApiClient.animatedStampBytes(path);
                        if(epoch==sessionEpoch&&generation==stampGeneration) SnapshotCache.writeAnimation(this,path,bytes);
                    }
                } catch(Exception error) { runOnUiThread(() -> scheduledAnimationPaths.remove(path)); }
            });
        }
    }
    private void prefetchFrameStep(ArrayList<String> paths,int index,int epoch,int generation) {
        if(stampMedia.isShutdown()) return;
        stampMedia.execute(() -> {
            if(epoch!=sessionEpoch||generation!=stampGeneration) return;
            String path=paths.get(index);
            try {
                if(SnapshotCache.readStamp(this,path)==null) {
                    Bitmap frame=ApiClient.thumbnail(path);
                    if(epoch==sessionEpoch&&generation==stampGeneration) SnapshotCache.writeStamp(this,path,frame);
                }
            } catch(Exception error) { runOnUiThread(() -> scheduledFramePaths.remove(path)); }
            if(index+1<paths.size()&&epoch==sessionEpoch&&generation==stampGeneration&&!stampMedia.isShutdown())
                prefetchFrameStep(paths,index+1,epoch,generation);
        });
    }
    private void prefetchStampThumbnails(JSONArray stamps,int epoch) {
        int generation=stampGeneration;
        LinkedHashSet<String> paths=new LinkedHashSet<>();
        for(int i=0;i<stamps.length()&&paths.size()<24;i++) {
            JSONObject stamp=stamps.optJSONObject(i);
            if(stamp==null) continue;
            String path=stamp.optString("thumbnailUrl");
            if(!path.isEmpty() && stampImages.get(path)==null && !pendingStampImages.contains(path)) paths.add(path);
        }
        if(paths.isEmpty()) return;
        prefetchStampStep(new ArrayList<>(paths),0,epoch,generation);
    }
    private void prefetchStampStep(ArrayList<String> paths,int index,int epoch,int generation) {
        if(stampMedia.isShutdown()) return;
        stampMedia.execute(() -> {
            if(epoch!=sessionEpoch||generation!=stampGeneration) return;
            String path=paths.get(index);
            try {
                if(SnapshotCache.readStamp(this,path)==null) {
                    Bitmap image=ApiClient.thumbnail(path);
                    if(epoch==sessionEpoch&&generation==stampGeneration) SnapshotCache.writeStamp(this,path,image);
                }
            } catch(Exception ignored) { /* A missing stamp must not block the calendar. */ }
            if(index+1<paths.size()&&epoch==sessionEpoch&&generation==stampGeneration&&!stampMedia.isShutdown())
                prefetchStampStep(paths,index+1,epoch,generation);
        });
    }
    private void stampActions(JSONObject stamp) {
        boolean animated=stamp.optJSONArray("frames")!=null && stamp.optJSONArray("frames").length()>1 ||
            "ANIMATED".equals(stamp.optString("kind")) &&
            ("image/gif".equals(stamp.optString("mimeType"))||"image/webp".equals(stamp.optString("mimeType")));
        new AlertDialog.Builder(this).setTitle("スタンプの操作")
            .setItems(animated?new String[]{"アニメーションを表示","好きな位置へ移動","先頭へ移動","末尾へ移動","別の日に移動","削除"}:
                new String[]{"好きな位置へ移動","先頭へ移動","末尾へ移動","別の日に移動","削除"},(dialog,which) -> {
                int action=animated?which-1:which;
                if(animated && which==0) showStampAnimation(stamp);
                else if(action==0) chooseStampPosition(stamp);
                else if(action<3) reorderStamp(stamp,action==1);
                else if(action==3) moveStamp(stamp); else deleteStamp(stamp);
            }).show();
    }
    private void chooseStampPosition(JSONObject stamp) {
        if(snapshot==null||stamp.optInt("placementId")<=0) return;
        JSONArray stamps=stampsOnDay(stamp.optString("date"));
        ArrayList<JSONObject> other=new ArrayList<>();
        for(int i=0;i<stamps.length();i++) {
            JSONObject row=stamps.optJSONObject(i);
            if(row!=null&&row.optInt("placementId")!=stamp.optInt("placementId")) other.add(row);
        }
        if(other.isEmpty()) return;
        String[] positions=new String[other.size()+1];
        for(int i=0;i<positions.length;i++) positions[i]=(i+1)+"番目"+(i==positions.length-1?"（末尾）":"");
        new AlertDialog.Builder(this).setTitle("移動先の位置").setItems(positions,(dialog,which) -> {
            int before=which==other.size()?0:other.get(which).optInt("placementId");
            int epoch=sessionEpoch,id=stamp.optInt("placementId");
            String day=stamp.optString("date"),csrf=snapshot.optString("csrf");
            network.execute(() -> {
                try {
                    if(epoch!=sessionEpoch) return;
                    ApiClient.request("/api/calendar-stamp-placement",new JSONObject().put("action","reorder")
                        .put("csrf",csrf).put("placementId",id).put("beforePlacementId",before).put("stampDate",day));
                    if(epoch==sessionEpoch) runOnUiThread(this::load);
                } catch(Exception error) {
                    runOnUiThread(() -> {if(epoch==sessionEpoch) Toast.makeText(this,"スタンプを並べ替えられませんでした",Toast.LENGTH_SHORT).show();});
                }
            });
        }).show();
    }
    private void loadStampAssets() { loadStampAssets(""); }
    private void loadStampAssets(String cursor) {
        if(snapshot==null) return;
        int epoch=sessionEpoch;
        network.execute(() -> {
            try {
                JSONObject result=ApiClient.request("/api/calendar-stamp-admin/assets"+
                    (cursor.isEmpty()?"":"?cursor="+cursor),null);
                runOnUiThread(() -> {
                    if(epoch!=sessionEpoch) return;
                    JSONArray assets=result.optJSONArray("assets");
                    if(assets==null) return;
                    ArrayList<String> names=new ArrayList<>();
                    for(int i=0;i<assets.length();i++) {
                        JSONObject asset=assets.optJSONObject(i);
                        names.add(asset==null?"スタンプ":(asset.optBoolean("active")?"":"（無効）")+
                            asset.optString("name")+" ・ "+("ANIMATED".equals(asset.optString("kind"))?"動く":"静止画"));
                    }
                    String next=result.optString("nextCursor","");
                    if(!next.matches("[01]:[1-9][0-9]*")) next="";
                    if(!next.isEmpty()) names.add("次のスタンプを表示");
                    if(names.isEmpty()) names.add("登録済みスタンプはありません");
                    final String nextPage=next;
                    new AlertDialog.Builder(this).setTitle("スタンプ管理")
                        .setItems(names.toArray(new String[0]),(dialog,which) -> {
                            if(which==assets.length()&&!nextPage.isEmpty()) {loadStampAssets(nextPage);return;}
                            JSONObject asset=assets.optJSONObject(which);
                            if(asset==null) return;
                            boolean active=asset.optBoolean("active");
                            new AlertDialog.Builder(this).setTitle(asset.optString("name"))
                                .setMessage(active?"無効にすると、このスタンプの配置は表示されなくなります。再度有効にできます。":"スタンプを再度表示します。")
                                .setPositiveButton(active?"無効にする":"有効にする",(d,w) -> setStampAssetActive(asset.optInt("id"),!active))
                                .setNegativeButton("戻る",null).show();
                        }).setNegativeButton("閉じる",null).show();
                });
            } catch(Exception error) {
                runOnUiThread(() -> {if(epoch==sessionEpoch) Toast.makeText(this,"スタンプ管理を開けませんでした（管理者権限が必要です）",Toast.LENGTH_LONG).show();});
            }
        });
    }
    private void setStampAssetActive(int assetId,boolean active) {
        if(snapshot==null||assetId<=0) return;
        String csrf=snapshot.optString("csrf");int epoch=sessionEpoch;
        network.execute(() -> {
            try {
                if(epoch!=sessionEpoch) return;
                ApiClient.request("/api/calendar-stamp-admin/assets",new JSONObject()
                    .put("assetId",assetId).put("active",active).put("csrf",csrf));
                if(epoch==sessionEpoch) runOnUiThread(() -> {
                    stampMonths.clear();stampGeneration++;
                    load();
                });
            } catch(Exception error) {
                runOnUiThread(() -> {if(epoch==sessionEpoch) Toast.makeText(this,"スタンプの状態を変更できませんでした",Toast.LENGTH_LONG).show();});
            }
        });
    }
    private void showStampAnimation(JSONObject stamp) {
        JSONArray frames=stamp.optJSONArray("frames");
        if(frames==null || frames.length()==0) { showAnimatedStampFile(stamp); return; }
        if(frames==null || frames.length()<2 || frames.length()>48) return;
        int epoch=sessionEpoch;String originatingTab=tab;
        Toast.makeText(this,"アニメーションを読み込みます",Toast.LENGTH_SHORT).show();
        stampMedia.execute(() -> {
            try {
                android.graphics.drawable.AnimationDrawable animation=new android.graphics.drawable.AnimationDrawable();
                animation.setOneShot(false);
                long decodedBytes=0;
                for(int i=0;i<frames.length();i++) {
                    if(epoch!=sessionEpoch) return;
                    JSONObject frame=frames.optJSONObject(i);
                    if(frame==null) throw new IllegalArgumentException("Invalid frame");
                    String path=frame.optString("url");
                    if(!path.matches("/api/calendar-stamp-media\\?asset=[1-9][0-9]*&frame=[0-9]+") &&
                        !(path.startsWith("/") && !path.contains("?") && path.endsWith(".png")))
                        throw new IllegalArgumentException("Invalid frame URL");
                    Bitmap bitmap=SnapshotCache.readStamp(this,path);
                    if(bitmap==null) {
                        bitmap=ApiClient.thumbnail(path);
                        if(epoch==sessionEpoch) SnapshotCache.writeStamp(this,path,bitmap);
                    }
                    decodedBytes+=bitmap.getByteCount();
                    if(decodedBytes>24*1024*1024) throw new IllegalStateException("Animation too large");
                    animation.addFrame(new android.graphics.drawable.BitmapDrawable(getResources(),bitmap),
                        Math.max(40,Math.min(2000,frame.optInt("durationMs",120))));
                }
                runOnUiThread(() -> {
                    if(epoch!=sessionEpoch || !tab.equals(originatingTab)) return;
                    ImageView view=new ImageView(this);view.setImageDrawable(animation);view.setAdjustViewBounds(true);
                    view.setContentDescription("アニメーションスタンプ");
                    AlertDialog dialog=new AlertDialog.Builder(this).setTitle("アニメーションスタンプ")
                        .setView(view).setPositiveButton("閉じる",null).create();
                    dialog.setOnDismissListener(ignored -> animation.stop());dialog.show();animation.start();
                });
            } catch(Exception error) {
                runOnUiThread(() -> { if(epoch==sessionEpoch) Toast.makeText(this,"アニメーションを表示できませんでした",Toast.LENGTH_LONG).show(); });
            }
        });
    }
    private void showAnimatedStampFile(JSONObject stamp) {
        if(Build.VERSION.SDK_INT<28) { Toast.makeText(this,"この端末ではアニメーションを再生できません",Toast.LENGTH_SHORT).show(); return; }
        String path=stamp.optString("fullUrl");int epoch=sessionEpoch;String originatingTab=tab;
        stampMedia.execute(() -> {
            try {
                byte[] bytes=SnapshotCache.readAnimation(this,path);
                if(bytes==null) {
                    bytes=ApiClient.animatedStampBytes(path);
                    if(epoch==sessionEpoch) SnapshotCache.writeAnimation(this,path,bytes);
                }
                android.graphics.drawable.Drawable animation=ApiClient.decodeAnimatedStamp(bytes);
                if(!(animation instanceof android.graphics.drawable.AnimatedImageDrawable)) throw new IllegalStateException("Not animated");
                runOnUiThread(() -> {
                    if(epoch!=sessionEpoch || !tab.equals(originatingTab)) return;
                    ImageView view=new ImageView(this);view.setImageDrawable(animation);view.setAdjustViewBounds(true);
                    view.setContentDescription("アニメーションスタンプ");
                    android.graphics.drawable.AnimatedImageDrawable animated=(android.graphics.drawable.AnimatedImageDrawable)animation;
                    AlertDialog dialog=new AlertDialog.Builder(this).setTitle("アニメーションスタンプ")
                        .setView(view).setPositiveButton("閉じる",null).create();
                    dialog.setOnDismissListener(ignored -> animated.stop());dialog.show();animated.start();
                });
            } catch(Exception error) {
                runOnUiThread(() -> { if(epoch==sessionEpoch) Toast.makeText(this,"アニメーションを表示できませんでした",Toast.LENGTH_LONG).show(); });
            }
        });
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
    private void chooseStaticStamp() {
        if(snapshot==null || !snapshot.optBoolean("canManageStamps")) return;
        EditText name=new EditText(this); name.setHint("スタンプ名"); name.setSingleLine(true);
        new AlertDialog.Builder(this).setTitle("新しいスタンプ画像").setView(name)
            .setPositiveButton("画像を選択",(dialog,which) -> {
                String value=name.getText().toString().trim();
                if(value.isEmpty()||value.codePointCount(0,value.length())>80) {
                    Toast.makeText(this,"スタンプ名を80文字以内で入力してください",Toast.LENGTH_SHORT).show(); return;
                }
                pendingStampName=value;
                Intent picker=new Intent(Intent.ACTION_OPEN_DOCUMENT);picker.addCategory(Intent.CATEGORY_OPENABLE);picker.setType("image/*");
                startActivityForResult(picker,43);
            }).setNegativeButton("閉じる",null).show();
    }
    private void chooseAnimatedStamp() {
        if(snapshot==null||!snapshot.optBoolean("canManageStamps")) return;
        EditText name=new EditText(this);name.setHint("スタンプ名（80文字以内）");name.setSingleLine(true);
        EditText duration=new EditText(this);duration.setHint("1コマの表示時間（40〜2000ミリ秒）");
        duration.setInputType(android.text.InputType.TYPE_CLASS_NUMBER);duration.setText("120");
        LinearLayout form=new LinearLayout(this);form.setOrientation(LinearLayout.VERTICAL);form.setPadding(32,8,32,8);
        form.addView(name);form.addView(duration);form.addView(label("PNGを2〜48枚選択します。再生順はファイル名順です。同じ縦横サイズの画像を選んでください。"));
        new AlertDialog.Builder(this).setTitle("動くPNGスタンプ").setView(form)
            .setPositiveButton("画像を選択",(dialog,which) -> {
                String value=name.getText().toString().trim();int frameMs;
                try {frameMs=Integer.parseInt(duration.getText().toString().trim());}
                catch(Exception error) {Toast.makeText(this,"表示時間を確認してください",Toast.LENGTH_SHORT).show();return;}
                if(value.isEmpty()||value.codePointCount(0,value.length())>80||frameMs<40||frameMs>2000) {
                    Toast.makeText(this,"名前・表示時間を確認してください",Toast.LENGTH_SHORT).show();return;
                }
                pendingAnimatedStampName=value;pendingAnimatedFrameMs=frameMs;
                Intent picker=new Intent(Intent.ACTION_OPEN_DOCUMENT);picker.addCategory(Intent.CATEGORY_OPENABLE);
                picker.setType("image/png");picker.putExtra(Intent.EXTRA_ALLOW_MULTIPLE,true);
                startActivityForResult(picker,44);
            }).setNegativeButton("閉じる",null).show();
    }
    private String stampFileName(android.net.Uri uri) {
        try(android.database.Cursor cursor=getContentResolver().query(uri,
            new String[]{android.provider.OpenableColumns.DISPLAY_NAME},null,null,null)) {
            if(cursor!=null&&cursor.moveToFirst()) return cursor.getString(0);
        } catch(Exception ignored) { }
        return uri.toString();
    }
    private void uploadAnimatedStamp(Intent data,int epoch) {
        String name=pendingAnimatedStampName,csrf=snapshot==null?"":snapshot.optString("csrf");
        if(name.isEmpty()||csrf.isEmpty()) return;
        ArrayList<android.net.Uri> uris=new ArrayList<>();
        android.content.ClipData clips=data.getClipData();
        if(clips!=null) for(int i=0;i<clips.getItemCount();i++) uris.add(clips.getItemAt(i).getUri());
        else if(data.getData()!=null) uris.add(data.getData());
        if(uris.size()<2||uris.size()>48||new HashSet<>(uris).size()!=uris.size()) {
            Toast.makeText(this,"重複のないPNGを2〜48枚選択してください",Toast.LENGTH_LONG).show();return;
        }
        uris.sort((left,right) -> stampFileName(left).compareToIgnoreCase(stampFileName(right)));
        for(int i=1;i<uris.size();i++) if(stampFileName(uris.get(i-1)).equalsIgnoreCase(stampFileName(uris.get(i)))) {
            Toast.makeText(this,"同じファイル名の画像は選択できません",Toast.LENGTH_LONG).show();return;
        }
        int duration=pendingAnimatedFrameMs;
        Toast.makeText(this,"PNGフレームを準備しています",Toast.LENGTH_SHORT).show();
        network.execute(() -> {
            try {
                ArrayList<MessagePhotoUpload.PngDraft> prepared=null;
                for(int edge:new int[]{256,192,128,96,64,48,32}) {
                    ArrayList<MessagePhotoUpload.PngDraft> current=new ArrayList<>();long bytes=0;
                    int width=0,height=0;
                    for(android.net.Uri uri:uris) {
                        if(epoch!=sessionEpoch) return;
                        MessagePhotoUpload.PngDraft png=MessagePhotoUpload.prepareStamp(this,uri,edge);
                        if(width==0) {width=png.width;height=png.height;}
                        else if(width!=png.width||height!=png.height) throw new IllegalArgumentException("画像サイズを揃えてください");
                        bytes+=png.png.length;
                        if(bytes>1024*1024) break;
                        current.add(png);
                    }
                    if(current.size()==uris.size()&&bytes<=1024*1024) {prepared=current;break;}
                }
                if(prepared==null) throw new IllegalArgumentException("画像を1MiB以内にできませんでした");
                if(epoch!=sessionEpoch) return;
                JSONArray frames=new JSONArray();
                for(MessagePhotoUpload.PngDraft png:prepared) {
                    if(epoch!=sessionEpoch) return;
                    JSONObject uploaded=ApiClient.uploadStampFrame(png.png,csrf);
                    frames.put(new JSONObject().put("storageKey",uploaded.getString("storageKey")).put("durationMs",duration));
                }
                JSONObject body=new JSONObject().put("csrf",csrf).put("name",name).put("storageProvider","UPLOAD")
                    .put("frames",frames).put("width",prepared.get(0).width).put("height",prepared.get(0).height);
                ApiClient.request("/api/calendar-stamp-admin/png-sequence",body);
                runOnUiThread(() -> {if(epoch==sessionEpoch) {
                    pendingAnimatedStampName="";load();Toast.makeText(this,"動くスタンプを登録しました",Toast.LENGTH_LONG).show();
                }});
            } catch(Exception error) {
                runOnUiThread(() -> {if(epoch==sessionEpoch) Toast.makeText(this,
                    "動くスタンプを登録できませんでした: "+error.getMessage(),Toast.LENGTH_LONG).show();});
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
    private void renderChecklistTasks() {
        LinearLayout section=panel(),kinds=new LinearLayout(this);
        for(boolean events:new boolean[]{false,true}) {
            Button kind=button(events?"📅 イベント":"☑ タスク",()->{checklistEvents=events;render();});
            styleButton(kind,checklistEvents==events);kinds.addView(kind,new LinearLayout.LayoutParams(0,dp(44),1));
        }
        section.addView(kinds);
        LinearLayout status=new LinearLayout(this);
        for(boolean done:new boolean[]{false,true}) {
            Button state=button(done?"完了済み":"未完了",()->{checklistCompleted=done;render();});
            styleButton(state,checklistCompleted==done);status.addView(state,new LinearLayout.LayoutParams(0,dp(44),1));
        }
        if(!checklistEvents)section.addView(status);
        JSONArray tasks=snapshot.optJSONArray("tasks");int count=0;
        if(tasks!=null)for(int i=0;i<tasks.length();i++) {
            JSONObject task=tasks.optJSONObject(i);if(task==null||!taskOnDay(task,selectedDay.toString()))continue;
            boolean event="EVENT".equalsIgnoreCase(task.optString("task_kind"));
            if(event!=checklistEvents||!event&&checklistCompleted!="completed".equals(task.optString("status")))continue;
            section.addView(checklistTaskRow(task));count++;
        }
        if(count==0)section.addView(label(checklistEvents?"この日のイベントはありません":"この日のタスクはありません"));
        LinearLayout actions=new LinearLayout(this);
        if(ApiClient.canMutate())actions.addView(button(checklistEvents?"＋ イベント":"＋ タスク",this::addTask),new LinearLayout.LayoutParams(0,dp(44),1));
        actions.addView(button("期限なし・全件",()->showWebPage("/app/tasks.php?date="+selectedDay)),new LinearLayout.LayoutParams(0,dp(44),1));
        section.addView(actions);addPanel(section);
    }
    private LinearLayout checklistTaskRow(JSONObject task) {
        LinearLayout line=new LinearLayout(this);line.setGravity(Gravity.CENTER_VERTICAL);
        boolean event="EVENT".equalsIgnoreCase(task.optString("task_kind"));
        int occurrence=task.optInt("recurrence_occurrence_id"),id=occurrence>0?occurrence:task.optInt("id");
        if(!event) {
            CheckBox box=new CheckBox(this);styleCheckBox(box);
            box.setChecked("completed".equals(task.optString("status")));
            box.setContentDescription(task.optString("title")+"の完了状態");
            box.setEnabled(id>0&&ApiClient.canMutate());
            box.setOnClickListener(v->toggle(occurrence>0?"recurrence":"task",id,box));
            line.addView(box,new LinearLayout.LayoutParams(dp(44),dp(52)));
        }
        line.addView(inlineTitle(occurrence>0?"recurrence":"task",occurrence>0?task.optInt("recurrence_rule_id"):id,task,"title"),
            new LinearLayout.LayoutParams(0,dp(52),1));
        if(!event&&occurrence==0&&id>0)line.addView(button("⤷",()->showTaskChildren(id)),new LinearLayout.LayoutParams(dp(40),dp(44)));
        if(ApiClient.canMutate())line.addView(button("ⓘ",()->{if(occurrence>0)recurringOccurrenceActions(task);else taskActions(task);}),
            new LinearLayout.LayoutParams(dp(40),dp(44)));
        return line;
    }
    private void showTaskChildren(int parentId) {
        int epoch=sessionEpoch;
        network.execute(()->{
            try {
                JSONObject result=ApiClient.request("/api/task-children?parent_id="+parentId,null);
                JSONArray children=result.optJSONArray("children");
                runOnUiThread(()->{if(epoch!=sessionEpoch)return;
                    LinearLayout list=new LinearLayout(this);list.setOrientation(LinearLayout.VERTICAL);
                    if(children!=null)for(int i=0;i<children.length();i++){
                        JSONObject child=children.optJSONObject(i);if(child!=null)list.addView(checklistTaskRow(child));
                    }
                    if(children==null||children.length()==0)list.addView(label("子タスクはありません"));
                    ScrollView scroll=new ScrollView(this);scroll.addView(list);
                    AlertDialog.Builder dialog=new AlertDialog.Builder(this).setTitle("子タスク").setView(scroll).setNegativeButton("閉じる",null);
                    if(result.optBoolean("canAddChildren")&&ApiClient.canMutate())
                        dialog.setPositiveButton("＋ 子タスク",(d,w)->showWebPage("/app/tasks.php?date="+selectedDay));
                    dialog.show();
                });
            }catch(Exception error){runOnUiThread(()->{if(epoch==sessionEpoch)Toast.makeText(this,"子タスクを取得できませんでした",Toast.LENGTH_SHORT).show();});}
        });
    }
    private void renderGoods() {
        boolean shopping=goodsKind.equals("shopping");
        if(ApiClient.canMutate()) {
            LinearLayout actions=new LinearLayout(this);
            Button add=button(shopping?"＋ 買い物":"＋ 持ち物",() -> addGoods(shopping));
            styleButton(add,true);
            actions.addView(add,new LinearLayout.LayoutParams(0,dp(48),1));
            actions.addView(button("＋ カテゴリ",() -> addCategory(shopping)),new LinearLayout.LayoutParams(0,dp(48),1));
            actions.addView(button("≡ セット",() -> loadReusableSets(shopping)),new LinearLayout.LayoutParams(0,dp(48),1));
            addPanel(actions);
        }
        JSONArray rows=snapshot.optJSONArray(shopping?"shopping":"items"); if (rows==null) return;
        LinearLayout status=new LinearLayout(this);
        for(boolean completed:new boolean[]{false,true}) {
            Button state=button(completed?"完了済み":"未完了",()->{goodsCompleted=completed;render();});
            styleButton(state,goodsCompleted==completed);
            status.addView(state,new LinearLayout.LayoutParams(0,dp(44),1));
        }
        addPanel(status);
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
        names.add("未分類");
        ArrayList<String> archived=new ArrayList<>();
        for(String category:names) {
            JSONObject meta=categoryMetadata(catalog,category);
            int total=0;
            for(int i=0;i<rows.length();i++){JSONObject row=rows.optJSONObject(i);if(row!=null&&category.equals(category(row)))total++;}
            String state=meta==null?"ACTIVE":GoodsCategoryState.state(meta.optInt("enabled",1),total,meta.optString("activated_at"),System.currentTimeMillis());
            if("DISABLED".equals(state))continue;
            String categoryKey=sessionEpoch+":"+(shopping?"shopping":"item")+":"+category;
            if(!goodsCompleted&&"ARCHIVED_EMPTY".equals(state)&&!"未分類".equals(category)&&!expandedGoodsCategories.contains(categoryKey)) {
                archived.add(category);continue;
            }
            LinearLayout group=new LinearLayout(this); group.setOrientation(LinearLayout.VERTICAL);
            int count=0;
            for(int n=0;n<rows.length();n++) {
                JSONObject row=rows.optJSONObject(n); if(row==null || !category.equals(category(row)) || goodsCompleted!="completed".equals(row.optString("status"))) continue;
                CheckBox box=new CheckBox(this);
                box.setContentDescription(row.optString("name")+"の完了状態");
                box.setChecked("completed".equals(row.optString("status")));
                box.setEnabled(ApiClient.canMutate());
                if(ApiClient.canMutate()) {
                    box.setOnClickListener(v -> toggle(shopping?"shopping":"item",row.optInt("id"),box));
                    box.setOnLongClickListener(v -> { goodsActions(shopping,row); return true; });
                }
                styleCheckBox(box);
                LinearLayout line=new LinearLayout(this);line.setGravity(Gravity.CENTER_VERTICAL);
                line.addView(box,new LinearLayout.LayoutParams(dp(44),dp(52)));
                line.addView(inlineTitle(shopping?"shopping":"item",row.optInt("id"),row,"name"),
                    new LinearLayout.LayoutParams(0,dp(52),1));
                if(ApiClient.canMutate()) {
                    Button info=button("ⓘ",() -> editGoods(shopping,row));
                    info.setTextColor(accentColor());info.setMinWidth(dp(44));
                    line.addView(info,new LinearLayout.LayoutParams(dp(48),dp(44)));
                }
                addGoodsRowGrip(line,shopping,row.optInt("id"));group.addView(line);count++;
            }
            if(count>0 || !"未分類".equals(category)) {
                LinearLayout section=panel();
                String groupKey=sessionEpoch+":"+(shopping?"shopping":"item")+":"+category;
                boolean open=expandedGoodsCategories.contains(groupKey);
                LinearLayout categoryHead=new LinearLayout(this);categoryHead.setGravity(Gravity.CENTER_VERTICAL);
                TextView grip=label("≡");grip.setPadding(0,0,0,0);grip.setGravity(Gravity.CENTER);
                grip.setContentDescription(category+"の並べ替え");installCategoryGrip(grip,shopping,category);
                categoryHead.addView(grip,new LinearLayout.LayoutParams(dp(26),dp(44)));
                TextView icon=label(shopping?"🛒":"🎒");icon.setPadding(0,0,0,0);
                categoryHead.addView(icon,new LinearLayout.LayoutParams(dp(24),dp(44)));
                EditText categoryName=inlineCategoryTitle(shopping,category);
                categoryHead.addView(categoryName,new LinearLayout.LayoutParams(0,dp(48),1));
                TextView heading=label(Integer.toString(count));heading.setPadding(0,0,0,0);heading.setGravity(Gravity.CENTER);heading.setTextColor(mutedColor());
                categoryHead.addView(heading,new LinearLayout.LayoutParams(dp(24),dp(44)));
                Button expand=button(open?"⌄":"›",()->{
                    if(expandedGoodsCategories.contains(groupKey))expandedGoodsCategories.remove(groupKey);
                    else expandedGoodsCategories.add(groupKey);
                    render();
                });expand.setContentDescription(category+"を開閉");expand.setPadding(0,0,0,0);
                categoryHead.addView(expand,new LinearLayout.LayoutParams(dp(36),dp(44)));
                if(ApiClient.canMutate()&&!"未分類".equals(category)) {
                    Button more=button("⋯",()->categoryActions(shopping,category));more.setPadding(0,0,0,0);
                    categoryHead.addView(more,new LinearLayout.LayoutParams(dp(32),dp(44)));
                }
                section.addView(categoryHead);installGoodsDropTarget(section,shopping,category);
                if(open) {
                    section.addView(group);
                    if(!goodsCompleted&&ApiClient.canMutate())section.addView(goodsComposer(shopping,category,group,rows,heading));
                }
                addPanel(section);
            }
        }
        if(!archived.isEmpty()) {
            LinearLayout cluster=panel();
            Button summary=button((emptyCategoriesExpanded?"⌄":"›")+" 空のカテゴリ  "+archived.size(),()->{emptyCategoriesExpanded=!emptyCategoriesExpanded;render();});
            summary.setContentDescription("空のカテゴリを開閉");cluster.addView(summary);
            if(emptyCategoriesExpanded)for(String name:archived) {
                LinearLayout row=new LinearLayout(this);row.setGravity(Gravity.CENTER_VERTICAL);
                row.addView(inlineCategoryTitle(shopping,name),new LinearLayout.LayoutParams(0,dp(48),1));
                Button add=button("＋ 追加",()->{expandedGoodsCategories.add(sessionEpoch+":"+(shopping?"shopping":"item")+":"+name);render();});
                add.setContentDescription(name+"に追加");row.addView(add,new LinearLayout.LayoutParams(dp(80),dp(48)));
                if(ApiClient.canMutate())row.addView(button("⋯",()->categoryActions(shopping,name)),new LinearLayout.LayoutParams(dp(44),dp(48)));
                cluster.addView(row);
            }
            addPanel(cluster);
        }
    }
    private JSONObject categoryMetadata(JSONObject catalog,String name) {
        JSONArray metadata=catalog==null?null:catalog.optJSONArray("categoryMeta");
        if(metadata!=null)for(int i=0;i<metadata.length();i++) {
            JSONObject meta=metadata.optJSONObject(i);if(meta!=null&&meta.optString("name").equalsIgnoreCase(name))return meta;
        }
        return null;
    }
    private void installCategoryGrip(TextView grip,boolean shopping,String category) {
        if(!ApiClient.canMutate()||"未分類".equals(category))return;
        grip.setOnLongClickListener(v->{
            if(!ApiClient.canMutate()||!categoryOrder(shopping).contains(category))return false;
            return v.startDragAndDrop(android.content.ClipData.newPlainText("category",""),
                new android.view.View.DragShadowBuilder(v),new String[]{shopping?"shopping":"item",category},0);
        });
    }
    private void addGoodsRowGrip(LinearLayout line,boolean shopping,int id) {
        if(!ApiClient.canMutate()||id<=0)return;
        TextView grip=label("≡");grip.setPadding(0,0,0,0);grip.setGravity(Gravity.CENTER);
        grip.setContentDescription("項目"+id+"のカテゴリ移動");
        grip.setOnLongClickListener(v->{
            if(!ApiClient.canMutate())return false;
            return v.startDragAndDrop(android.content.ClipData.newPlainText("goods",""),
                new android.view.View.DragShadowBuilder(line),new String[]{shopping?"shopping":"item","row",Integer.toString(id)},0);
        });
        line.addView(grip,0,new LinearLayout.LayoutParams(dp(24),dp(44)));
    }
    private void installGoodsDropTarget(LinearLayout section,boolean shopping,String category) {
        section.setOnDragListener((v,event)->{
            if(!ApiClient.canMutate()||!(event.getLocalState() instanceof String[]))return false;
            String[] drag=(String[])event.getLocalState();
            if(drag.length<2||!drag[0].equals(shopping?"shopping":"item"))return false;
            if(drag.length==2&&("未分類".equals(category)||drag[1].equals(category)))return false;
            if(event.getAction()==android.view.DragEvent.ACTION_DRAG_ENTERED) {
                v.setBackground(shape(softColor(),accentColor(),16));return true;
            }
            if(event.getAction()==android.view.DragEvent.ACTION_DRAG_EXITED||event.getAction()==android.view.DragEvent.ACTION_DRAG_ENDED)
                v.setBackground(shape(surfaceColor(),lineColor(),16));
            if(event.getAction()==android.view.DragEvent.ACTION_DROP) {
                v.setBackground(shape(surfaceColor(),lineColor(),16));
                if(drag.length==2)repositionCategory(shopping,drag[1],category);
                else if(drag.length==3&&"row".equals(drag[1])) {
                    try{moveGoodsCategory(shopping,Integer.parseInt(drag[2]),category);}catch(NumberFormatException ignored){}
                }
            }
            return true;
        });
    }
    private void moveGoodsCategory(boolean shopping,int id,String target) {
        if(snapshot==null||!ApiClient.canMutate()||id<=0)return;
        JSONArray rows=snapshot.optJSONArray(shopping?"shopping":"items");JSONObject selected=null;
        if(rows!=null)for(int i=0;i<rows.length();i++){JSONObject row=rows.optJSONObject(i);if(row!=null&&row.optInt("id")==id){selected=row;break;}}
        if(selected==null||category(selected).equals(target))return;
        final JSONObject row=selected;int epoch=sessionEpoch;String csrf=snapshot.optString("csrf");
        network.execute(()->{
            try{
                if(epoch!=sessionEpoch)return;
                JSONObject response=ApiClient.request(shopping?"/api/shopping":"/api/item",
                    new JSONObject().put("csrf",csrf).put("action","update_category").put("id",id).put("category","未分類".equals(target)?"":target));
                if(!response.optBoolean("ok"))throw new Exception("move");
                runOnUiThread(()->{if(epoch!=sessionEpoch)return;
                    try{row.put("category","未分類".equals(target)?"":target);}catch(Exception ignored){}
                    expandedGoodsCategories.add(epoch+":"+(shopping?"shopping":"item")+":"+target);load();
                });
            }catch(Exception error){runOnUiThread(()->{if(epoch==sessionEpoch)Toast.makeText(this,"移動できませんでした。元のカテゴリを維持しています",Toast.LENGTH_SHORT).show();});}
        });
    }
    private EditText inlineCategoryTitle(boolean shopping,String original) {
        EditText input=new EditText(this);input.setText(original);input.setTextSize(17);input.setTextColor(textColor());
        input.setTypeface(null,android.graphics.Typeface.BOLD);input.setSingleLine(true);input.setPadding(dp(2),0,dp(2),0);
        input.setBackgroundColor(Color.TRANSPARENT);input.setFilters(new android.text.InputFilter[]{new android.text.InputFilter.LengthFilter(255)});
        input.setImeOptions(android.view.inputmethod.EditorInfo.IME_ACTION_DONE);input.setFocusable(false);input.setFocusableInTouchMode(false);
        input.setContentDescription(original+"のカテゴリ名。タップして編集");
        input.setOnClickListener(v->{if(!ApiClient.canMutate()||"未分類".equals(original))return;
            input.setFocusableInTouchMode(true);input.requestFocus();input.setSelection(input.length());
            ((android.view.inputmethod.InputMethodManager)getSystemService(INPUT_METHOD_SERVICE)).showSoftInput(input,android.view.inputmethod.InputMethodManager.SHOW_IMPLICIT);
        });
        input.setOnEditorActionListener((v,action,event)->{if(action!=android.view.inputmethod.EditorInfo.IME_ACTION_DONE)return false;input.clearFocus();
            ((android.view.inputmethod.InputMethodManager)getSystemService(INPUT_METHOD_SERVICE)).hideSoftInputFromWindow(input.getWindowToken(),0);return true;});
        input.setOnFocusChangeListener((v,focused)->{
            if(focused)return;input.setFocusable(false);input.setFocusableInTouchMode(false);
            String name=input.getText().toString().trim();
            if(name.isEmpty()||name.equalsIgnoreCase(original)||"未分類".equals(name)||snapshot==null||!ApiClient.canMutate()){input.setText(original);return;}
            int epoch=sessionEpoch;String csrf=snapshot.optString("csrf");input.setError(null);input.setEnabled(false);
            network.execute(()->{
                try{
                    if(epoch!=sessionEpoch)return;
                    JSONObject response=ApiClient.request(shopping?"/api/shopping-category-mutation":"/api/item",
                        new JSONObject().put("csrf",csrf).put("kind",shopping?"shopping":"item").put("action",shopping?"rename":"category_rename").put("name",original).put("new_name",name));
                    if(!response.optBoolean("ok"))throw new Exception("rename");
                    runOnUiThread(()->{if(epoch!=sessionEpoch)return;applyCategoryRename(shopping,original,response.optString("name",name));load();});
                }catch(Exception error){runOnUiThread(()->{if(epoch!=sessionEpoch)return;input.setEnabled(true);input.setFocusableInTouchMode(true);input.requestFocus();
                    input.setError("保存できませんでした。入力内容を保持しています。カテゴリ名は未変更です");});}
            });
        });
        return input;
    }
    private void applyCategoryRename(boolean shopping,String oldName,String newName) {
        try{
            JSONArray rows=snapshot.optJSONArray(shopping?"shopping":"items");
            if(rows!=null)for(int i=0;i<rows.length();i++){JSONObject row=rows.optJSONObject(i);if(row!=null&&category(row).equalsIgnoreCase(oldName))row.put("category",newName);}
            JSONObject catalog=shopping?shoppingCategories:itemCategories;
            if(catalog!=null)for(String key:new String[]{"categories","order"}){
                JSONArray before=catalog.optJSONArray(key),after=new JSONArray();java.util.HashSet<String> seen=new java.util.HashSet<>();
                if(before!=null)for(int i=0;i<before.length();i++){String value=before.optString(i);if(value.equalsIgnoreCase(oldName))value=newName;
                    if(seen.add(value.toLowerCase(java.util.Locale.ROOT)))after.put(value);}
                catalog.put(key,after);
            }
            String prefix=sessionEpoch+":"+(shopping?"shopping":"item")+":";
            expandedGoodsCategories.remove(prefix+oldName);
            expandedGoodsCategories.add(prefix+newName);
            String[] draft=goodsComposerDrafts.remove(prefix+oldName);
            if(draft!=null){if(!goodsComposerDrafts.containsKey(prefix+newName))goodsComposerDrafts.put(prefix+newName,draft);
                else goodsComposerDrafts.put(prefix+oldName,draft);}
        }catch(Exception ignored){}
    }
    private EditText inlineTitle(String type,int id,JSONObject row,String field) {
        EditText title=new EditText(this);title.setText(row.optString(field));
        title.setTextSize(16);title.setTextColor(textColor());title.setSingleLine(true);
        title.setBackgroundColor(Color.TRANSPARENT);title.setPadding(dp(4),0,dp(4),0);
        title.setImeOptions(android.view.inputmethod.EditorInfo.IME_ACTION_DONE);
        title.setFocusable(false);title.setFocusableInTouchMode(false);
        title.setContentDescription(row.optString(field)+"。タップして編集");
        final String[] original={row.optString(field)};
        title.setOnClickListener(v -> {
            if(!ApiClient.canMutate()||id<=0)return;
            title.setFocusableInTouchMode(true);title.requestFocus();title.setSelection(title.length());
            ((android.view.inputmethod.InputMethodManager)getSystemService(INPUT_METHOD_SERVICE))
                .showSoftInput(title,android.view.inputmethod.InputMethodManager.SHOW_IMPLICIT);
        });
        title.setOnEditorActionListener((v,action,event)->{
            if(action==android.view.inputmethod.EditorInfo.IME_ACTION_DONE) {
                title.clearFocus();
                ((android.view.inputmethod.InputMethodManager)getSystemService(INPUT_METHOD_SERVICE))
                    .hideSoftInputFromWindow(title.getWindowToken(),0);return true;
            }
            return false;
        });
        title.setOnFocusChangeListener((v,focused)->{
            if(focused)return;
            title.setFocusable(false);
            String next=title.getText().toString().replaceAll("\\s+"," ").trim();
            if(next.isEmpty()||next.equals(original[0])){title.setText(original[0]);return;}
            if(next.length()>200){title.setText(original[0]);Toast.makeText(this,"200文字以内で入力してください",Toast.LENGTH_SHORT).show();return;}
            if(snapshot==null||!ApiClient.canMutate()){title.setText(original[0]);return;}
            int epoch=sessionEpoch;String csrf=snapshot.optString("csrf"),prior=original[0];
            title.setEnabled(false);
            network.execute(()->{
                try {
                    if(epoch!=sessionEpoch)return;
                    JSONObject result=ApiClient.request("/api/checklist/inline-title",new JSONObject()
                        .put("csrf",csrf).put("type",type).put("id",id).put("title",next));
                    if(!result.optBoolean("ok"))throw new Exception("save");
                    String saved=result.optString("title",next);
                    runOnUiThread(()->{if(epoch!=sessionEpoch)return;
                        try{row.put(field,saved);}catch(Exception ignored){}
                        original[0]=saved;title.setText(saved);title.setEnabled(true);
                    });
                }catch(Exception error){runOnUiThread(()->{if(epoch!=sessionEpoch)return;
                    title.setText(prior);title.setEnabled(true);
                    Toast.makeText(this,"保存できませんでした。元の名前に戻しました",Toast.LENGTH_LONG).show();
                });}
            });
        });
        return title;
    }
    private LinearLayout goodsComposer(boolean shopping,String category,LinearLayout group,JSONArray rows,TextView categoryTitle) {
        LinearLayout form=new LinearLayout(this);form.setOrientation(LinearLayout.VERTICAL);
        String key=sessionEpoch+":"+(shopping?"shopping":"item")+":"+category;
        String[] draft=goodsComposerDrafts.get(key);
        if(draft==null){draft=new String[]{"","","",java.util.UUID.randomUUID().toString()};goodsComposerDrafts.put(key,draft);}
        final String[] values=draft;
        EditText name=new EditText(this),memo=new EditText(this),url=new EditText(this);
        name.setHint(shopping?"新しい買い物":"新しい持ち物");memo.setHint("メモを追加…");url.setHint("URLを追加…");
        name.setSingleLine(true);url.setSingleLine(true);
        name.setImeOptions(android.view.inputmethod.EditorInfo.IME_ACTION_NEXT);
        for(int i=0;i<3;i++){
            EditText input=new EditText[]{name,memo,url}[i];final int index=i;
            input.setText(values[i]);input.setTextColor(textColor());input.setHintTextColor(mutedColor());
            input.setTextSize(15);
            input.addTextChangedListener(new android.text.TextWatcher(){
                public void beforeTextChanged(CharSequence x,int start,int count,int after){}
                public void onTextChanged(CharSequence x,int start,int before,int count){values[index]=x.toString();}
                public void afterTextChanged(android.text.Editable x){}
            });
        }
        LinearLayout details=new LinearLayout(this);details.setOrientation(LinearLayout.VERTICAL);
        details.addView(memo);details.addView(url);
        details.setVisibility(values[1].isEmpty()&&values[2].isEmpty()?android.view.View.GONE:android.view.View.VISIBLE);
        LinearLayout main=new LinearLayout(this);main.setGravity(Gravity.CENTER_VERTICAL);
        main.addView(name,new LinearLayout.LayoutParams(0,dp(48),1));
        main.addView(button("ⓘ",()->details.setVisibility(details.getVisibility()==android.view.View.GONE?
            android.view.View.VISIBLE:android.view.View.GONE)),new LinearLayout.LayoutParams(dp(44),dp(44)));
        TextView status=label("");status.setTextSize(12);status.setTextColor(mutedColor());
        final boolean[] saving={false};
        Runnable save=()->{
            String value=name.getText().toString().trim(),note=memo.getText().toString().trim(),link=url.getText().toString().trim();
            if(value.isEmpty()||saving[0]||snapshot==null||!ApiClient.canMutate())return;
            if(value.length()>200){status.setText("200文字以内で入力してください");return;}
            if(!link.isEmpty()) {
                android.net.Uri uri=android.net.Uri.parse(link);
                if(!("https".equals(uri.getScheme())||"http".equals(uri.getScheme()))||uri.getHost()==null||uri.getUserInfo()!=null) {
                    status.setText("URLは http:// または https:// で入力してください");details.setVisibility(android.view.View.VISIBLE);return;
                }
            }
            int epoch=sessionEpoch;String csrf=snapshot.optString("csrf"),requestId=values[3],day=selectedDay.toString();
            saving[0]=true;name.setEnabled(false);memo.setEnabled(false);url.setEnabled(false);status.setText("保存中…");
            network.execute(()->{
                try{
                    if(epoch!=sessionEpoch)return;
                    JSONObject body=new JSONObject().put("csrf",csrf).put("action","add").put("name",value)
                        .put("quantity","1").put("category","未分類".equals(category)?"":category)
                        .put("memo",note).put("url",link).put("client_request_id",requestId);
                    if(!shopping)body.put("date",day);
                    JSONObject result=ApiClient.request(shopping?"/api/shopping":"/api/item",body);
                    int id=result.optInt("id");if(!result.optBoolean("ok")||id<=0)throw new Exception("save");
                    JSONObject row=new JSONObject().put("id",id).put("name",value).put("status","pending")
                        .put("quantity","1").put("category","未分類".equals(category)?"":category).put("memo",note).put("url",link);
                    runOnUiThread(()->{if(epoch!=sessionEpoch)return;
                        rows.put(row);
                        LinearLayout line=new LinearLayout(this);line.setGravity(Gravity.CENTER_VERTICAL);
                        CheckBox box=new CheckBox(this);styleCheckBox(box);
                        box.setContentDescription(value+"の完了状態");box.setOnClickListener(v->toggle(shopping?"shopping":"item",id,box));
                        line.addView(box,new LinearLayout.LayoutParams(dp(44),dp(52)));
                        line.addView(inlineTitle(shopping?"shopping":"item",id,row,"name"),new LinearLayout.LayoutParams(0,dp(52),1));
                        line.addView(button("ⓘ",()->editGoods(shopping,row)),new LinearLayout.LayoutParams(dp(44),dp(44)));
                        addGoodsRowGrip(line,shopping,id);group.addView(line);categoryTitle.setText(Integer.toString(group.getChildCount()));
                        name.setText("");memo.setText("");url.setText("");
                        values[3]=java.util.UUID.randomUUID().toString();details.setVisibility(android.view.View.GONE);
                        saving[0]=false;name.setEnabled(true);memo.setEnabled(true);url.setEnabled(true);status.setText("");name.requestFocus();
                    });
                }catch(Exception error){runOnUiThread(()->{if(epoch!=sessionEpoch)return;
                    saving[0]=false;name.setEnabled(true);memo.setEnabled(true);url.setEnabled(true);
                    status.setText("保存できませんでした。入力内容を保持しています");name.requestFocus();
                });}
            });
        };
        name.setOnEditorActionListener((v,action,event)->{
            if(action==android.view.inputmethod.EditorInfo.IME_ACTION_NEXT){save.run();return true;}return false;
        });
        details.addView(button("追加",save));form.addView(main);form.addView(details);form.addView(status);
        return form;
    }
    private String reusableSetPath(boolean shopping) {return shopping?"/api/shopping":"/api/item";}
    private void loadReusableSets(boolean shopping) {
        if(snapshot==null) return;
        int epoch=sessionEpoch;
        network.execute(() -> {
            try {
                JSONArray sets=ApiClient.request(reusableSetPath(shopping)+"?view=reusable_sets",null).optJSONArray("sets");
                runOnUiThread(() -> {
                    if(epoch!=sessionEpoch||sets==null) return;
                    ArrayList<String> names=new ArrayList<>();names.add("＋ 表示中の項目からセットを作成");
                    for(int i=0;i<sets.length();i++) {
                        JSONObject set=sets.optJSONObject(i);
                        names.add(set==null?"セット":set.optString("name")+" ・ "+set.optInt("item_count")+"件");
                    }
                    new AlertDialog.Builder(this).setTitle(shopping?"買い物セット":"持ち物セット")
                        .setItems(names.toArray(new String[0]),(dialog,which) -> {
                            if(which==0) createReusableSet(shopping);
                            else {
                                JSONObject set=sets.optJSONObject(which-1);
                                if(set!=null) reusableSetActions(shopping,set);
                            }
                        }).setNegativeButton("閉じる",null).show();
                });
            } catch(Exception error) {runOnUiThread(() -> {if(epoch==sessionEpoch) Toast.makeText(this,"セットを読み込めませんでした",Toast.LENGTH_SHORT).show();});}
        });
    }
    private void createReusableSet(boolean shopping) {
        if(snapshot==null) return;
        JSONArray rows=snapshot.optJSONArray(shopping?"shopping":"items");
        if(rows==null||rows.length()==0) {Toast.makeText(this,"先に項目を追加してください",Toast.LENGTH_SHORT).show();return;}
        ArrayList<Integer> ids=new ArrayList<>();ArrayList<String> labels=new ArrayList<>();
        for(int i=0;i<rows.length()&&ids.size()<100;i++) {
            JSONObject row=rows.optJSONObject(i);
            if(row!=null&&row.optInt("id")>0&&"pending".equals(row.optString("status"))) {
                ids.add(row.optInt("id"));labels.add(row.optString("name"));
            }
        }
        if(ids.isEmpty()) {Toast.makeText(this,"保存する未完了項目がありません",Toast.LENGTH_SHORT).show();return;}
        boolean[] selected=new boolean[ids.size()];
        new AlertDialog.Builder(this).setTitle("セットに保存する項目")
            .setMultiChoiceItems(labels.toArray(new String[0]),selected,(dialog,which,checked) -> selected[which]=checked)
            .setPositiveButton("次へ",(dialog,which) -> {
                JSONArray chosen=new JSONArray();for(int i=0;i<ids.size();i++) if(selected[i]) chosen.put(ids.get(i));
                if(chosen.length()==0) {Toast.makeText(this,"項目を選んでください",Toast.LENGTH_SHORT).show();return;}
                EditText name=new EditText(this);name.setHint("セット名");
                new AlertDialog.Builder(this).setTitle("セット名").setView(name)
                    .setPositiveButton("保存",(d,w) -> {
                        String value=name.getText().toString().trim();
                        if(value.isEmpty()||value.length()>120) {Toast.makeText(this,"セット名を確認してください",Toast.LENGTH_SHORT).show();return;}
                        int epoch=sessionEpoch;String csrf=snapshot.optString("csrf");
                        network.execute(() -> {
                            try {
                                if(epoch!=sessionEpoch) return;
                                ApiClient.request(reusableSetPath(shopping),new JSONObject().put("csrf",csrf)
                                    .put("action","reusable_set_create").put("name",value).put("source_item_ids",chosen));
                                if(epoch==sessionEpoch) runOnUiThread(() -> loadReusableSets(shopping));
                            } catch(Exception error) {runOnUiThread(() -> {if(epoch==sessionEpoch) Toast.makeText(this,"セットを作成できませんでした",Toast.LENGTH_LONG).show();});}
                        });
                    }).setNegativeButton("閉じる",null).show();
            }).setNegativeButton("閉じる",null).show();
    }
    private void reusableSetActions(boolean shopping,JSONObject set) {
        int id=set.optInt("id");if(id<=0||snapshot==null) return;
        boolean canDelete=set.optBoolean("can_delete");
        JSONArray entries=set.optJSONArray("entries");ArrayList<String> names=new ArrayList<>();
        if(entries!=null) for(int i=0;i<entries.length();i++) {
            JSONObject entry=entries.optJSONObject(i);if(entry!=null) names.add(entry.optString("name"));
        }
        ArrayList<String> actions=new ArrayList<>();actions.add("日付を指定して呼び出す");
        if(!shopping&&set.optBoolean("can_edit")) {
            actions.add("セット名を変更");actions.add("セット内の項目を編集");
            actions.add("セットに項目を追加");actions.add("セットから項目を外す");actions.add("セット内の順序を変更");
        }
        if(canDelete) actions.add("セットを削除");
        new AlertDialog.Builder(this).setTitle(set.optString("name")+" ・ "+names.size()+"件")
            .setItems(actions.toArray(new String[0]),
                (dialog,which) -> {
                    String action=actions.get(which);
                    if(action.equals("日付を指定して呼び出す")) invokeReusableSet(shopping,set);
                    else if(action.equals("セット名を変更")) editItemSetName(set);
                    else if(action.equals("セット内の項目を編集")) editItemSetEntries(set);
                    else if(action.equals("セットに項目を追加")) addItemSetEntry(set);
                    else if(action.equals("セットから項目を外す")) removeItemSetEntry(set);
                    else if(action.equals("セット内の順序を変更")) reorderItemSetEntry(set);
                    else new AlertDialog.Builder(this).setTitle("セットを削除")
                        .setMessage("セットの登録だけを削除します。呼び出し済みの項目は残ります。")
                        .setPositiveButton("削除",(d,w) -> mutateReusableSet(shopping,id,"reusable_set_delete",null))
                        .setNegativeButton("戻る",null).show();
                }).setNegativeButton("閉じる",null).show();
    }
    private void reorderItemSetEntry(JSONObject set) {
        JSONArray entries=set.optJSONArray("entries");if(entries==null||entries.length()<2) return;
        ArrayList<String> names=new ArrayList<>();for(int i=0;i<entries.length();i++) {
            JSONObject entry=entries.optJSONObject(i);names.add((i+1)+". "+(entry==null?"項目":entry.optString("name")));
        }
        new AlertDialog.Builder(this).setTitle("移動する項目")
            .setItems(names.toArray(new String[0]),(dialog,which) ->
                new AlertDialog.Builder(this).setTitle(names.get(which))
                    .setItems(new String[]{"一つ上へ","一つ下へ"},(d,direction) -> {
                        int target=which+(direction==0?-1:1);
                        if(target<0||target>=entries.length()) return;
                        JSONArray updated=new JSONArray();
                        for(int i=0;i<entries.length();i++)
                            updated.put(entries.optJSONObject(i==which?target:i==target?which:i));
                        saveItemSet(set,set.optString("name"),updated);
                    }).setNegativeButton("戻る",null).show())
            .setNegativeButton("閉じる",null).show();
    }
    private void addItemSetEntry(JSONObject set) {
        JSONArray entries=set.optJSONArray("entries");if(entries==null||entries.length()>=100) return;
        EditText name=new EditText(this);name.setHint("持ち物名");
        EditText category=new EditText(this);category.setHint("カテゴリ（任意）");
        EditText memo=new EditText(this);memo.setHint("メモ（任意）");
        EditText url=new EditText(this);url.setHint("URL（任意）");
        LinearLayout form=new LinearLayout(this);form.setOrientation(LinearLayout.VERTICAL);form.setPadding(32,8,32,8);
        form.addView(name);form.addView(category);form.addView(memo);form.addView(url);
        new AlertDialog.Builder(this).setTitle("セットに項目を追加").setView(form)
            .setPositiveButton("追加",(dialog,which) -> {
                String item=name.getText().toString().trim(),group=category.getText().toString().trim();
                String note=memo.getText().toString().trim(),link=url.getText().toString().trim();
                if(item.isEmpty()||item.length()>200||group.length()>255||note.length()>2000||
                    !link.isEmpty()&&!(link.startsWith("https://")||link.startsWith("http://"))) {
                    Toast.makeText(this,"項目の入力を確認してください",Toast.LENGTH_LONG).show();return;
                }
                JSONArray updated=new JSONArray();for(int i=0;i<entries.length();i++) updated.put(entries.optJSONObject(i));
                try {updated.put(new JSONObject().put("name",item).put("category",group).put("memo",note).put("url",link));}
                catch(Exception error) {return;}
                saveItemSet(set,set.optString("name"),updated);
            }).setNegativeButton("閉じる",null).show();
    }
    private void removeItemSetEntry(JSONObject set) {
        JSONArray entries=set.optJSONArray("entries");if(entries==null||entries.length()<2) {
            Toast.makeText(this,"セットには1件以上必要です",Toast.LENGTH_SHORT).show();return;
        }
        ArrayList<String> names=new ArrayList<>();for(int i=0;i<entries.length();i++) {
            JSONObject entry=entries.optJSONObject(i);names.add(entry==null?"項目":entry.optString("name"));
        }
        new AlertDialog.Builder(this).setTitle("セットから項目を外す")
            .setItems(names.toArray(new String[0]),(dialog,which) ->
                new AlertDialog.Builder(this).setTitle("項目を外す").setMessage(names.get(which))
                    .setPositiveButton("外す",(d,w) -> {
                        JSONArray updated=new JSONArray();
                        for(int i=0;i<entries.length();i++) if(i!=which) updated.put(entries.optJSONObject(i));
                        saveItemSet(set,set.optString("name"),updated);
                    }).setNegativeButton("戻る",null).show())
            .setNegativeButton("閉じる",null).show();
    }
    private void editItemSetName(JSONObject set) {
        EditText name=new EditText(this);name.setText(set.optString("name"));
        new AlertDialog.Builder(this).setTitle("セット名を変更").setView(name)
            .setPositiveButton("保存",(dialog,which) -> {
                String value=name.getText().toString().trim();
                if(value.isEmpty()||value.length()>120) {Toast.makeText(this,"セット名を確認してください",Toast.LENGTH_SHORT).show();return;}
                saveItemSet(set,value,set.optJSONArray("entries"));
            }).setNegativeButton("閉じる",null).show();
    }
    private void editItemSetEntries(JSONObject set) {
        JSONArray entries=set.optJSONArray("entries");if(entries==null||entries.length()==0) return;
        ArrayList<String> names=new ArrayList<>();for(int i=0;i<entries.length();i++) {
            JSONObject entry=entries.optJSONObject(i);names.add(entry==null?"項目":entry.optString("name"));
        }
        new AlertDialog.Builder(this).setTitle("セット内の項目")
            .setItems(names.toArray(new String[0]),(dialog,which) -> {
                JSONObject entry=entries.optJSONObject(which);if(entry==null) return;
                EditText name=new EditText(this);name.setHint("持ち物名");name.setText(entry.optString("name"));
                EditText category=new EditText(this);category.setHint("カテゴリ");category.setText(entry.optString("category"));
                EditText memo=new EditText(this);memo.setHint("メモ");memo.setText(entry.optString("memo"));
                EditText url=new EditText(this);url.setHint("URL");url.setText(entry.optString("url"));
                LinearLayout form=new LinearLayout(this);form.setOrientation(LinearLayout.VERTICAL);form.setPadding(32,8,32,8);
                form.addView(name);form.addView(category);form.addView(memo);form.addView(url);
                new AlertDialog.Builder(this).setTitle("セット項目を編集").setView(form)
                    .setPositiveButton("保存",(d,w) -> {
                        String item=name.getText().toString().trim(),group=category.getText().toString().trim();
                        String note=memo.getText().toString().trim(),link=url.getText().toString().trim();
                        if(item.isEmpty()||item.length()>200||group.length()>255||note.length()>2000||
                            !link.isEmpty()&&!(link.startsWith("https://")||link.startsWith("http://"))) {
                            Toast.makeText(this,"項目の入力を確認してください",Toast.LENGTH_LONG).show();return;
                        }
                        JSONArray updated=new JSONArray();
                        for(int i=0;i<entries.length();i++) {
                            JSONObject original=entries.optJSONObject(i);if(original==null) return;
                            JSONObject copy=new JSONObject();
                            try {
                                copy.put("name",i==which?item:original.optString("name"))
                                    .put("category",i==which?group:original.optString("category"))
                                    .put("memo",i==which?note:original.optString("memo"))
                                    .put("url",i==which?link:original.optString("url"));
                            } catch(Exception error) {return;}
                            updated.put(copy);
                        }
                        saveItemSet(set,set.optString("name"),updated);
                    }).setNegativeButton("閉じる",null).show();
            }).setNegativeButton("閉じる",null).show();
    }
    private void saveItemSet(JSONObject set,String name,JSONArray entries) {
        if(snapshot==null||set.optInt("id")<=0||entries==null) return;
        int epoch=sessionEpoch;String csrf=snapshot.optString("csrf");
        network.execute(() -> {
            try {
                if(epoch!=sessionEpoch) return;
                ApiClient.request("/api/item",new JSONObject().put("csrf",csrf)
                    .put("action","reusable_set_update").put("set_id",set.optInt("id"))
                    .put("name",name).put("entries",entries));
                if(epoch==sessionEpoch) runOnUiThread(() -> loadReusableSets(false));
            } catch(Exception error) {runOnUiThread(() -> {if(epoch==sessionEpoch) Toast.makeText(this,"セットを編集できませんでした",Toast.LENGTH_LONG).show();});}
        });
    }
    private void invokeReusableSet(boolean shopping,JSONObject set) {
        LocalDate day=selectedDay;
        new DatePickerDialog(this,(picker,y,m,d) -> {
            String date=LocalDate.of(y,m+1,d).toString();
            new AlertDialog.Builder(this).setTitle(set.optString("name"))
                .setMessage(date+" に項目を追加します。")
                .setPositiveButton("追加",(confirm,which) -> mutateReusableSet(shopping,set.optInt("id"),
                    "reusable_set_invoke",date))
                .setNegativeButton("戻る",null).show();
        },day.getYear(),day.getMonthValue()-1,day.getDayOfMonth()).show();
    }
    private void mutateReusableSet(boolean shopping,int id,String action,String date) {
        if(snapshot==null||id<=0) return;
        int epoch=sessionEpoch;String csrf=snapshot.optString("csrf"),requestId=java.util.UUID.randomUUID().toString();
        network.execute(() -> {
            try {
                if(epoch!=sessionEpoch) return;
                JSONObject body=new JSONObject().put("csrf",csrf).put("action",action).put("set_id",id);
                if(date!=null) body.put("date",date).put("client_request_id",requestId);
                ApiClient.request(reusableSetPath(shopping),body);
                if(epoch==sessionEpoch) runOnUiThread(() -> {load();loadReusableSets(shopping);});
            } catch(Exception error) {runOnUiThread(() -> {if(epoch==sessionEpoch) Toast.makeText(this,"セットを操作できませんでした。項目を更新して確認してください",Toast.LENGTH_LONG).show();});}
        });
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
        actions.add("名前を変更"); actions.add("好きな位置へ移動"); actions.add("上へ移動"); actions.add("下へ移動");
        JSONObject catalog=shopping?shoppingCategories:itemCategories;
        if(catalog!=null && catalog.optBoolean("canManageCategories")) actions.add("カテゴリを削除（項目は未分類へ）");
        new AlertDialog.Builder(this).setTitle(name).setItems(actions.toArray(new String[0]),(dialog,which) -> {
            if(which==0) renameCategory(shopping,name);
            else if(which==1) chooseCategoryPosition(shopping,name);
            else if(which==2 || which==3) moveCategory(shopping,name,which==2?-1:1);
            else if(which==4) deleteCategory(shopping,name);
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
        saveCategoryOrder(shopping,names);
    }
    private void chooseCategoryPosition(boolean shopping,String name) {
        ArrayList<String> names=categoryOrder(shopping);
        if(!names.contains(name)||names.size()<2) return;
        names.remove(name);
        String[] positions=new String[names.size()+1];
        for(int i=0;i<names.size();i++) positions[i]=names.get(i)+" の前";
        positions[names.size()]="末尾";
        new AlertDialog.Builder(this).setTitle(name+" の移動先")
            .setItems(positions,(dialog,which) -> {
                ArrayList<String> latest=categoryOrder(shopping);
                if(!latest.remove(name)) return;
                String target=which==names.size()?null:names.get(which);
                int at=target==null?latest.size():latest.indexOf(target);
                if(at<0) return;
                latest.add(at,name);saveCategoryOrder(shopping,latest);
            }).show();
    }
    private void repositionCategory(boolean shopping,String source,String before) {
        ArrayList<String> names=categoryOrder(shopping);
        if(!names.remove(source)||!names.contains(before)||source.equals(before)) return;
        names.add(names.indexOf(before),source);
        saveCategoryOrder(shopping,names);
    }
    private void saveCategoryOrder(boolean shopping,ArrayList<String> names) {
        if(snapshot==null) return;
        if(names.equals(categoryOrder(shopping))) return;
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
    private void toggle(String type,int id,CheckBox box) {
        if(snapshot==null||!ApiClient.canMutate()||id<=0)return;
        int epoch=sessionEpoch;String csrf=snapshot.optString("csrf");boolean completed=box.isChecked();
        box.setEnabled(false);
        network.execute(()->{
            try {
                if(epoch!=sessionEpoch)return;
                if("task".equals(type)&&completed) {
                    JSONObject inspect=ApiClient.request("/api/task-parent-completion",new JSONObject().put("csrf",csrf).put("id",id).put("action","inspect"));
                    int children=inspect.optInt("incomplete_children");
                    if(children>0) {
                        runOnUiThread(()->{if(epoch!=sessionEpoch)return;
                            box.setChecked(false);box.setEnabled(true);
                            new AlertDialog.Builder(this).setTitle("未完了の子タスクが"+children+"件あります")
                                .setItems(new String[]{"子タスクもすべて完了する","子タスクを親タスクとして残す"},(dialog,which)->
                                    completeParentTask(id,which==0?"complete":"promote",epoch,csrf))
                                .setNegativeButton("キャンセル",null).show();
                        });return;
                    }
                }
                ApiClient.request("/api/toggle",new JSONObject().put("type",type).put("id",id).put("completed",completed).put("csrf",csrf));
                runOnUiThread(()->{if(epoch==sessionEpoch)load();});
            }catch(Exception error){runOnUiThread(()->{if(epoch!=sessionEpoch)return;
                box.setChecked(!completed);box.setEnabled(true);Toast.makeText(this,"更新できませんでした",Toast.LENGTH_SHORT).show();
            });}
        });
    }
    private void completeParentTask(int id,String policy,int epoch,String csrf) {
        network.execute(()->{
            try {
                if(epoch!=sessionEpoch)return;
                ApiClient.request("/api/task-parent-completion",new JSONObject().put("csrf",csrf).put("id",id).put("action","complete").put("child_policy",policy));
                runOnUiThread(()->{if(epoch==sessionEpoch)load();});
            }catch(Exception error){runOnUiThread(()->{if(epoch==sessionEpoch)Toast.makeText(this,"親タスクを完了できませんでした",Toast.LENGTH_LONG).show();});}
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
        CheckBox event=new CheckBox(this); event.setText("イベントとして登録");event.setChecked(tab.equals("goods")&&checklistEvents);
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
    private void loadRecurringRules() { loadRecurringRule(0); }
    private void loadRecurringRule(int id) {
        if(snapshot==null) { load(); return; }
        int epoch=sessionEpoch;
        network.execute(() -> {
            try {
                JSONObject result=ApiClient.request("/api/android/v1/recurring"+(id>0?"?id="+id:""),null);
                runOnUiThread(() -> {
                    if(epoch!=sessionEpoch) return;
                    JSONArray rules=result.optJSONArray("rules"),subjects=result.optJSONArray("subjects");
                    if(rules==null||subjects==null) return;
                    if(id>0) {
                        JSONObject rule=rules.optJSONObject(0);
                        if(rule!=null) recurringActions(rule,subjects);
                    } else showRecurringRules(rules,subjects,result.optJSONArray("excluded"),result.optBoolean("truncated"));
                });
            } catch(Exception error) {
                runOnUiThread(() -> { if(epoch==sessionEpoch) Toast.makeText(this,"定期タスクを読み込めませんでした（管理者権限が必要です）",Toast.LENGTH_LONG).show(); });
            }
        });
    }
    private void showRecurringRules(JSONArray rules,JSONArray subjects,JSONArray excluded,boolean truncated) {
        ArrayList<String> names=new ArrayList<>();names.add("＋ 定期タスクを作成");
        for(int i=0;i<rules.length();i++) {
            JSONObject rule=rules.optJSONObject(i);
            names.add(rule==null?"定期タスク":(rule.optInt("active",1)==1?"":"（停止中）")+
                rule.optString("title")+" ・ "+rule.optString("recurrence_type"));
        }
        int excludedCount=excluded==null?0:excluded.length();
        for(int i=0;i<excludedCount;i++) {
            JSONObject row=excluded.optJSONObject(i);
            names.add("復活: "+(row==null?"定期タスク":row.optString("title"))+" ・ "+
                (row==null?"":row.optString("occurrence_date")));
        }
        if(truncated) names.add("ほかの定期タスクは一覧の上限を超えています");
        new AlertDialog.Builder(this).setTitle("定期タスク")
            .setItems(names.toArray(new String[0]),(dialog,which) -> {
                if(which==0) editRecurring(null,subjects);
                else if(which<=rules.length()) {
                    JSONObject rule=rules.optJSONObject(which-1);
                    if(rule!=null) recurringActions(rule,subjects);
                } else if(which<=rules.length()+excludedCount) {
                    JSONObject row=excluded.optJSONObject(which-rules.length()-1);
                    if(row!=null) new AlertDialog.Builder(this).setTitle("除外した発生日を復活")
                        .setMessage(row.optString("title")+" ・ "+row.optString("occurrence_date"))
                        .setPositiveButton("復活",(d,w) -> {
                            try {postRecurring(new JSONObject().put("action","restore_excluded")
                                .put("occurrence_id",row.optInt("occurrence_id")));}
                            catch(Exception ignored) { }
                        }).setNegativeButton("戻る",null).show();
                }
            }).setNegativeButton("閉じる",null).show();
    }
    private void recurringActions(JSONObject rule,JSONArray subjects) {
        boolean active=rule.optInt("active",1)==1;
        new AlertDialog.Builder(this).setTitle(rule.optString("title"))
            .setItems(new String[]{"編集",active?"一時停止":"再開","シリーズ全体を削除"},(dialog,which) -> {
                if(which==0) editRecurring(rule,subjects);
                else if(which==1) {
                    try { postRecurring(new JSONObject().put("action","toggle").put("id",rule.optInt("id"))
                        .put("active",active?0:1)); } catch(Exception ignored) { }
                } else new AlertDialog.Builder(this).setTitle("定期タスクを削除")
                    .setMessage("今後の予定を含むシリーズ全体を削除します。")
                    .setPositiveButton("削除",(d,w) -> {
                        try { postRecurring(new JSONObject().put("action","delete").put("id",rule.optInt("id"))); }
                        catch(Exception ignored) { }
                    }).setNegativeButton("戻る",null).show();
            }).show();
    }
    private void recurringOccurrenceActions(JSONObject task) {
        new AlertDialog.Builder(this).setTitle(task.optString("title"))
            .setItems(new String[]{"この回だけ編集","シリーズを編集"},(dialog,which) -> {
                if(which==1) { loadRecurringRule(task.optInt("recurrence_rule_id")); return; }
                new AlertDialog.Builder(this).setTitle("この回だけ編集")
                    .setMessage("この発生日を通常のタスクに切り出します。繰り返しのシリーズは変更されません。")
                    .setPositiveButton("続ける",(confirm,index) -> convertRecurringOccurrence(task))
                    .setNegativeButton("戻る",null).show();
            }).show();
    }
    private void convertRecurringOccurrence(JSONObject occurrence) {
        if(snapshot==null||occurrence.optInt("recurrence_occurrence_id")<=0) return;
        int epoch=sessionEpoch,id=occurrence.optInt("recurrence_occurrence_id");
        String csrf=snapshot.optString("csrf");
        network.execute(() -> {
            try {
                if(epoch!=sessionEpoch) return;
                JSONObject result=ApiClient.request("/api/android/v1/occurrence-convert",
                    new JSONObject().put("csrf",csrf).put("occurrence_id",id));
                int taskId=result.optInt("task_id");
                if(taskId<=0) throw new IllegalStateException("タスクを取得できませんでした");
                JSONObject task=new JSONObject(occurrence.toString());
                task.put("id",taskId).put("task_kind","OCCURRENCE")
                    .remove("recurrence_occurrence_id");
                runOnUiThread(() -> {
                    if(epoch!=sessionEpoch||!tab.equals("calendar")) return;
                    load();editTask(task);
                });
            } catch(Exception error) {
                runOnUiThread(() -> {if(epoch==sessionEpoch) Toast.makeText(this,"この回だけの編集を開始できませんでした",Toast.LENGTH_LONG).show();});
            }
        });
    }
    private void postRecurring(JSONObject body) {
        if(snapshot==null) return;
        int epoch=sessionEpoch;String csrf=snapshot.optString("csrf");
        network.execute(() -> {
            try {
                if(epoch!=sessionEpoch) return;
                body.put("csrf",csrf);
                ApiClient.request("/api/android/v1/recurring",body);
                if(epoch==sessionEpoch) runOnUiThread(this::load);
            } catch(Exception error) {
                runOnUiThread(() -> { if(epoch==sessionEpoch) Toast.makeText(this,"定期タスクを保存できませんでした: "+error.getMessage(),Toast.LENGTH_LONG).show(); });
            }
        });
    }
    private boolean jsonContainsNumber(JSONObject row,String key,int value) {
        try {
            JSONArray values=new JSONArray(row.optString(key,"[]"));
            for(int i=0;i<values.length();i++) if(values.optInt(i,-1)==value) return true;
        } catch(Exception ignored) { }
        return false;
    }
    private void editRecurring(JSONObject rule,JSONArray subjects) {
        if(snapshot==null) return;
        final boolean editing=rule!=null;
        String[] typeCodes={"DAILY","INTERVAL_DAYS","WEEKLY","INTERVAL_WEEKS","MONTHLY_DAY",
            "MONTHLY_WEEKDAY","MONTHLY_BUSINESS_DAY","YEARLY"};
        String[] typeNames={"毎日","n日ごと","毎週","n週ごと","毎月指定日","毎月第n曜日","毎月第n営業日","毎年"};
        Spinner type=new Spinner(this);type.setAdapter(new ArrayAdapter<>(this,android.R.layout.simple_spinner_dropdown_item,typeNames));
        if(editing) type.setSelection(Math.max(0,java.util.Arrays.asList(typeCodes).indexOf(rule.optString("recurrence_type"))));
        EditText title=new EditText(this);title.setHint("タイトル");title.setText(editing?rule.optString("title"):"");
        EditText description=new EditText(this);description.setHint("説明");description.setText(editing?rule.optString("description"):"");
        EditText location=new EditText(this);location.setHint("場所");location.setText(editing?rule.optString("location"):"");
        EditText interval=new EditText(this);interval.setHint("間隔（1〜365）");interval.setInputType(android.text.InputType.TYPE_CLASS_NUMBER);
        interval.setText(editing&&!rule.isNull("interval_value")?rule.optString("interval_value"):"1");
        final String[] start={editing?rule.optString("start_date"):selectedDay.toString()};
        final String[] end={editing&&!rule.isNull("end_date")?rule.optString("end_date"):""};
        final Button[] startRef=new Button[1],endRef=new Button[1];
        Button startDate=button("開始日: "+start[0],() -> {
            LocalDate current=LocalDate.parse(start[0]);
            new DatePickerDialog(this,(picker,y,m,d) -> {
                start[0]=LocalDate.of(y,m+1,d).toString();startRef[0].setText("開始日: "+start[0]);
            },current.getYear(),current.getMonthValue()-1,current.getDayOfMonth()).show();
        });startRef[0]=startDate;
        Button endDate=button("終了日: "+(end[0].isEmpty()?"指定なし":end[0]),() -> {
            LocalDate current=end[0].isEmpty()?LocalDate.parse(start[0]):LocalDate.parse(end[0]);
            new DatePickerDialog(this,(picker,y,m,d) -> {
                end[0]=LocalDate.of(y,m+1,d).toString();endRef[0].setText("終了日: "+end[0]);
            },current.getYear(),current.getMonthValue()-1,current.getDayOfMonth()).show();
        });endRef[0]=endDate;
        CheckBox[] weekdays=new CheckBox[7],weekNumbers=new CheckBox[5];
        EditText monthdays=new EditText(this);monthdays.setHint("毎月の日付（例: 1,15,25）");
        if(editing) try {
            JSONArray values=new JSONArray(rule.optString("monthdays_json","[]"));
            ArrayList<String> parts=new ArrayList<>();for(int i=0;i<values.length();i++) parts.add(values.optString(i));
            monthdays.setText(android.text.TextUtils.join(",",parts));
        } catch(Exception ignored) { }
        EditText businessDay=new EditText(this);businessDay.setHint("第n営業日（1〜23）");
        businessDay.setInputType(android.text.InputType.TYPE_CLASS_NUMBER);
        businessDay.setText(editing&&!rule.isNull("business_day_ordinal")?rule.optString("business_day_ordinal"):"1");
        CheckBox allDay=new CheckBox(this);allDay.setText("終日");allDay.setChecked(!editing||rule.optInt("all_day",1)==1);
        String existingStart=editing?rule.optString("start_at"):"",existingEnd=editing?rule.optString("end_at"):"";
        final String[] startTime={existingStart.length()>=16?existingStart.substring(11,16):"09:00"};
        final String[] endTime={existingEnd.length()>=16?existingEnd.substring(11,16):"10:00"};
        final Button[] startTimeRef=new Button[1],endTimeRef=new Button[1];
        Button startClock=button("開始: "+startTime[0],() -> {
            String[] values=startTime[0].split(":");
            new TimePickerDialog(this,(picker,h,m) -> {
                startTime[0]=String.format(java.util.Locale.ROOT,"%02d:%02d",h,m);
                startTimeRef[0].setText("開始: "+startTime[0]);
            },Integer.parseInt(values[0]),Integer.parseInt(values[1]),true).show();
        });startTimeRef[0]=startClock;
        Button endClock=button("終了: "+endTime[0],() -> {
            String[] values=endTime[0].split(":");
            new TimePickerDialog(this,(picker,h,m) -> {
                endTime[0]=String.format(java.util.Locale.ROOT,"%02d:%02d",h,m);
                endTimeRef[0].setText("終了: "+endTime[0]);
            },Integer.parseInt(values[0]),Integer.parseInt(values[1]),true).show();
        });endTimeRef[0]=endClock;
        Spinner editScope=new Spinner(this);editScope.setAdapter(new ArrayAdapter<>(this,
            android.R.layout.simple_spinner_dropdown_item,new String[]{"シリーズ全体","指定日以降"}));
        final String[] effective={editing?selectedDay.toString():start[0]};
        final Button[] effectiveRef=new Button[1];
        Button effectiveDate=button("変更開始日: "+effective[0],() -> {
            LocalDate current=LocalDate.parse(effective[0]);
            new DatePickerDialog(this,(picker,y,m,d) -> {
                effective[0]=LocalDate.of(y,m+1,d).toString();effectiveRef[0].setText("変更開始日: "+effective[0]);
            },current.getYear(),current.getMonthValue()-1,current.getDayOfMonth()).show();
        });effectiveRef[0]=effectiveDate;
        LinearLayout form=new LinearLayout(this);form.setOrientation(LinearLayout.VERTICAL);form.setPadding(32,8,32,8);
        form.addView(title);form.addView(description);form.addView(location);
        if(editing) {form.addView(label("変更範囲"));form.addView(editScope);form.addView(effectiveDate);}
        form.addView(label("繰り返し種類"));form.addView(type);form.addView(interval);
        form.addView(startDate);form.addView(endDate);
        form.addView(button("終了日を解除",() -> {end[0]="";endRef[0].setText("終了日: 指定なし");}));
        form.addView(label("曜日（毎週・第n曜日）"));
        String[] dayNames={"日","月","火","水","木","金","土"};
        for(int i=0;i<7;i++) {
            weekdays[i]=new CheckBox(this);weekdays[i].setText(dayNames[i]);
            weekdays[i].setChecked(editing?jsonContainsNumber(rule,"weekdays_json",i):i==selectedDay.getDayOfWeek().getValue()%7);
            form.addView(weekdays[i]);
        }
        form.addView(label("第n曜日（複数選択可）"));
        for(int i=0;i<5;i++) {
            weekNumbers[i]=new CheckBox(this);weekNumbers[i].setText("第"+(i+1));
            weekNumbers[i].setChecked(editing?jsonContainsNumber(rule,"week_numbers_json",i+1):i==0);
            form.addView(weekNumbers[i]);
        }
        form.addView(monthdays);form.addView(businessDay);form.addView(allDay);form.addView(startClock);form.addView(endClock);
        CheckBox familyTemplate=new CheckBox(this);familyTemplate.setText("完了時に育児記録を作成");
        familyTemplate.setChecked(editing&&!rule.isNull("family_log_type"));form.addView(familyTemplate);
        ArrayList<String> subjectNames=new ArrayList<>();ArrayList<Integer> subjectIds=new ArrayList<>();
        subjectNames.add("対象なし（家事用）");subjectIds.add(0);
        for(int i=0;i<subjects.length();i++) {
            JSONObject row=subjects.optJSONObject(i);if(row==null) continue;
            subjectNames.add(row.optString("name"));subjectIds.add(row.optInt("id"));
        }
        Spinner subject=new Spinner(this);subject.setAdapter(new ArrayAdapter<>(this,android.R.layout.simple_spinner_dropdown_item,subjectNames));
        if(editing) subject.setSelection(Math.max(0,subjectIds.indexOf(rule.optInt("family_log_subject_id"))));
        String[] logTypes={"MILK","DIAPER","MEAL","SLEEP","BATH","TEMPERATURE","WEIGHT","HEIGHT","CONDITION",
            "BREASTFEED","MEDICINE","VACCINE","EXERCISE","WATER","TOILET","WALK","BLOOD_PRESSURE","HOUSEWORK","MEMO"};
        ArrayList<String> logNames=new ArrayList<>();for(String code:logTypes)logNames.add(logTypeName(code));
        Spinner logType=new Spinner(this);logType.setAdapter(new ArrayAdapter<>(this,android.R.layout.simple_spinner_dropdown_item,logNames));
        if(editing) logType.setSelection(Math.max(0,java.util.Arrays.asList(logTypes).indexOf(rule.optString("family_log_type"))));
        EditText logDetail=new EditText(this);logDetail.setHint("記録の詳細コード");
        EditText logAmount=new EditText(this);logAmount.setHint("数値");logAmount.setInputType(android.text.InputType.TYPE_CLASS_NUMBER|android.text.InputType.TYPE_NUMBER_FLAG_DECIMAL|android.text.InputType.TYPE_NUMBER_FLAG_SIGNED);
        EditText logUnit=new EditText(this);logUnit.setHint("単位");
        EditText logDuration=new EditText(this);logDuration.setHint("時間（分）");logDuration.setInputType(android.text.InputType.TYPE_CLASS_NUMBER);
        EditText logValue=new EditText(this);logValue.setHint("記録内容");
        EditText logNote=new EditText(this);logNote.setHint("記録メモ");
        if(editing) {
            logDetail.setText(rule.optString("family_log_detail_code"));
            if(!rule.isNull("family_log_amount")) logAmount.setText(rule.optString("family_log_amount"));
            logUnit.setText(rule.optString("family_log_unit"));
            if(!rule.isNull("family_log_duration_minutes")) logDuration.setText(rule.optString("family_log_duration_minutes"));
            logValue.setText(rule.optString("family_log_value_text"));logNote.setText(rule.optString("family_log_note"));
        }
        form.addView(label("家族ログの対象"));form.addView(subject);form.addView(label("記録種類"));form.addView(logType);
        form.addView(logDetail);form.addView(logAmount);form.addView(logUnit);form.addView(logDuration);form.addView(logValue);form.addView(logNote);
        ScrollView scroll=new ScrollView(this);scroll.addView(form);
        new AlertDialog.Builder(this).setTitle(editing?"定期タスクを編集":"定期タスクを作成").setView(scroll)
            .setPositiveButton("保存",(dialog,which) -> {
                String text=title.getText().toString().trim();
                int spacing,ordinal;
                try {spacing=Integer.parseInt(interval.getText().toString().trim());ordinal=Integer.parseInt(businessDay.getText().toString().trim());}
                catch(Exception error) {Toast.makeText(this,"間隔と営業日を確認してください",Toast.LENGTH_SHORT).show();return;}
                if(text.isEmpty()||text.length()>255||spacing<1||spacing>365||ordinal<1||ordinal>23||
                    !end[0].isEmpty()&&end[0].compareTo(start[0])<0||
                    !allDay.isChecked()&&startTime[0].compareTo(endTime[0])>0) {
                    Toast.makeText(this,"日時・タイトルを確認してください",Toast.LENGTH_LONG).show();return;
                }
                if(editing&&editScope.getSelectedItemPosition()==1&&effective[0].compareTo(rule.optString("start_date"))<=0) {
                    Toast.makeText(this,"変更開始日は元の開始日より後にしてください",Toast.LENGTH_LONG).show();return;
                }
                JSONArray days=new JSONArray(),weeks=new JSONArray();
                for(int i=0;i<7;i++) if(weekdays[i].isChecked()) days.put(i);
                for(int i=0;i<5;i++) if(weekNumbers[i].isChecked()) weeks.put(i+1);
                try {
                    JSONObject body=new JSONObject().put("action",editing?"update":"create")
                        .put("id",editing?rule.optInt("id"):0).put("title",text)
                        .put("description",description.getText().toString().trim()).put("location",location.getText().toString().trim())
                        .put("recurrence_type",typeCodes[type.getSelectedItemPosition()]).put("interval_value",spacing)
                        .put("start_date",start[0]).put("end_date",end[0]).put("weekdays",days)
                        .put("week_numbers",weeks).put("monthdays",monthdays.getText().toString().trim())
                        .put("business_day_ordinal",ordinal).put("all_day",allDay.isChecked())
                        .put("start_time",startTime[0]).put("end_time",endTime[0])
                        .put("calendar_color",editing?rule.optString("calendar_color"):"")
                        .put("edit_scope",editScope.getSelectedItemPosition()==1?"future":"all")
                        .put("effective_date",effective[0]).put("family_log_enabled",familyTemplate.isChecked());
                    if(familyTemplate.isChecked()) body.put("family_log_subject_id",subjectIds.get(subject.getSelectedItemPosition()))
                        .put("family_log_type",logTypes[logType.getSelectedItemPosition()])
                        .put("family_log_detail_code",logDetail.getText().toString().trim())
                        .put("family_log_amount",logAmount.getText().toString().trim())
                        .put("family_log_unit",logUnit.getText().toString().trim())
                        .put("family_log_duration_minutes",logDuration.getText().toString().trim())
                        .put("family_log_value_text",logValue.getText().toString().trim())
                        .put("family_log_note",logNote.getText().toString().trim());
                    postRecurring(body);
                } catch(Exception error) {Toast.makeText(this,"入力を確認してください",Toast.LENGTH_SHORT).show();}
            }).setNegativeButton("閉じる",null).show();
    }
    private void taskActions(JSONObject task) {
        new AlertDialog.Builder(this).setTitle(task.optString("title"))
            .setItems(new String[]{"編集","削除"},(dialog,which) -> {
                if(which==0) editTask(task); else deleteTask(task);
            }).show();
    }
    private void deleteTask(JSONObject task) {
        if(snapshot==null || task.optInt("id")<=0) return;
        new AlertDialog.Builder(this).setTitle("タスク・イベントを削除")
            .setMessage(task.optString("title")+" を削除します。")
            .setPositiveButton("削除",(dialog,which) -> {
                int id=task.optInt("id"),epoch=sessionEpoch; String csrf=snapshot.optString("csrf");
                network.execute(() -> {
                    try {
                        if(epoch!=sessionEpoch) return;
                        ApiClient.deleteTask(id,csrf);
                        if(epoch==sessionEpoch) runOnUiThread(this::load);
                    } catch(Exception error) {
                        runOnUiThread(() -> { if(epoch==sessionEpoch) Toast.makeText(this,"削除できませんでした",Toast.LENGTH_SHORT).show(); });
                    }
                });
            }).setNegativeButton("戻る",null).show();
    }
    private void editTask(JSONObject task) {
        if(snapshot==null || task.optInt("id")<=0) return;
        EditText title=new EditText(this); title.setText(task.optString("title")); title.setHint("タイトル");
        String oldStart=dateValue(task,"start_at","due_at"),oldEnd=dateValue(task,"end_at","due_at");
        if(oldEnd.isEmpty()) oldEnd=oldStart;
        final String[] startDate={oldStart.length()>=10?oldStart.substring(0,10):selectedDay.toString()};
        final String[] endDate={oldEnd.length()>=10?oldEnd.substring(0,10):startDate[0]};
        final Button[] startRef=new Button[1],endRef=new Button[1];
        Button startDay=button("開始日: "+startDate[0],() -> {
            LocalDate current=LocalDate.parse(startDate[0]);
            new DatePickerDialog(this,(picker,y,m,d) -> { startDate[0]=LocalDate.of(y,m+1,d).toString();startRef[0].setText("開始日: "+startDate[0]); },
                current.getYear(),current.getMonthValue()-1,current.getDayOfMonth()).show();
        }); startRef[0]=startDay;
        Button endDay=button("終了日: "+endDate[0],() -> {
            LocalDate current=LocalDate.parse(endDate[0]);
            new DatePickerDialog(this,(picker,y,m,d) -> { endDate[0]=LocalDate.of(y,m+1,d).toString();endRef[0].setText("終了日: "+endDate[0]); },
                current.getYear(),current.getMonthValue()-1,current.getDayOfMonth()).show();
        }); endRef[0]=endDay;
        CheckBox event=new CheckBox(this);event.setText("イベント");event.setChecked("EVENT".equalsIgnoreCase(task.optString("task_kind")));
        CheckBox allDay=new CheckBox(this);allDay.setText("終日");allDay.setChecked(task.optInt("all_day")==1);
        CheckBox privateTask=new CheckBox(this);privateTask.setText("自分専用");privateTask.setChecked("PRIVATE".equals(task.optString("visibility_scope")));
        CheckBox visible=new CheckBox(this);visible.setText("カレンダーに表示");visible.setChecked(task.optInt("calendar_visible",1)==1);
        final String[] startTime={oldStart.length()>=16?oldStart.substring(11,16):"09:00"};
        final String[] endTime={oldEnd.length()>=16?oldEnd.substring(11,16):"10:00"};
        final Button[] startTimeRef=new Button[1],endTimeRef=new Button[1];
        Button startClock=button("開始時刻: "+startTime[0],() -> new TimePickerDialog(this,(picker,h,m) -> {
            startTime[0]=String.format(java.util.Locale.ROOT,"%02d:%02d",h,m);startTimeRef[0].setText("開始時刻: "+startTime[0]);
        },9,0,true).show()); startTimeRef[0]=startClock;
        Button endClock=button("終了時刻: "+endTime[0],() -> new TimePickerDialog(this,(picker,h,m) -> {
            endTime[0]=String.format(java.util.Locale.ROOT,"%02d:%02d",h,m);endTimeRef[0].setText("終了時刻: "+endTime[0]);
        },10,0,true).show()); endTimeRef[0]=endClock;
        startClock.setVisibility(allDay.isChecked()?android.view.View.GONE:android.view.View.VISIBLE);
        endClock.setVisibility(allDay.isChecked()?android.view.View.GONE:android.view.View.VISIBLE);
        allDay.setOnCheckedChangeListener((v,checked) -> {
            startClock.setVisibility(checked?android.view.View.GONE:android.view.View.VISIBLE);
            endClock.setVisibility(checked?android.view.View.GONE:android.view.View.VISIBLE);
        });
        EditText description=new EditText(this);description.setHint("説明");description.setText(task.optString("description",""));
        EditText place=new EditText(this);place.setHint("場所");place.setText(task.optString("location",""));
        String rawReminder=task.optString("reminder_at","");
        final String[] reminder={rawReminder.length()>=16?rawReminder.substring(0,16).replace(' ','T'):""};
        final Button[] reminderRef=new Button[1];
        Button reminderButton=button("通知日時: "+(reminder[0].isEmpty()?"指定なし":reminder[0]),() -> {
            java.time.LocalDateTime now=java.time.LocalDateTime.now(java.time.ZoneId.of("Asia/Tokyo")).plusHours(1);
            new DatePickerDialog(this,(picker,y,m,d) -> new TimePickerDialog(this,(clock,h,min) -> {
                reminder[0]=String.format(java.util.Locale.ROOT,"%04d-%02d-%02dT%02d:%02d",y,m+1,d,h,min);
                reminderRef[0].setText("通知日時: "+reminder[0]);
            },now.getHour(),now.getMinute(),true).show(),now.getYear(),now.getMonthValue()-1,now.getDayOfMonth()).show();
        }); reminderRef[0]=reminderButton;
        LinearLayout form=new LinearLayout(this);form.setOrientation(LinearLayout.VERTICAL);form.setPadding(32,8,32,8);
        form.addView(title);form.addView(startDay);form.addView(endDay);form.addView(event);form.addView(allDay);
        form.addView(startClock);form.addView(endClock);form.addView(privateTask);form.addView(visible);
        form.addView(description);form.addView(place);form.addView(reminderButton);
        form.addView(button("通知を解除",() -> { reminder[0]="";reminderRef[0].setText("通知日時: 指定なし"); }));
        ScrollView scroll=new ScrollView(this);scroll.addView(form);
        new AlertDialog.Builder(this).setTitle("タスク・イベントを編集").setView(scroll)
            .setPositiveButton("保存",(dialog,which) -> {
                String value=title.getText().toString().trim();if(value.isEmpty()) return;
                if(endDate[0].compareTo(startDate[0])<0 || !allDay.isChecked() && endDate[0].equals(startDate[0]) && endTime[0].compareTo(startTime[0])<=0) {
                    Toast.makeText(this,"日時を確認してください",Toast.LENGTH_SHORT).show();return;
                }
                String csrf=snapshot.optString("csrf"),details=description.getText().toString().trim(),location=place.getText().toString().trim();
                int id=task.optInt("id"),epoch=sessionEpoch;String notifyAt=reminder[0];
                network.execute(() -> {
                    try {
                        if(epoch!=sessionEpoch) return;
                        ApiClient.request("/api/android/v1/task-edit?id="+id,new JSONObject().put("csrf",csrf)
                            .put("title",value).put("date",startDate[0]).put("end_date",endDate[0])
                            .put("is_event",event.isChecked()).put("all_day",allDay.isChecked())
                            .put("start_time",allDay.isChecked()?"":startTime[0]).put("end_time",allDay.isChecked()?"":endTime[0])
                            .put("is_private",privateTask.isChecked()).put("calendar_visible",visible.isChecked())
                            .put("description",details).put("location",location).put("reminder_at",notifyAt));
                        if(epoch==sessionEpoch) runOnUiThread(this::load);
                    } catch(Exception error) {
                        runOnUiThread(() -> { if(epoch==sessionEpoch) Toast.makeText(this,"編集できませんでした",Toast.LENGTH_SHORT).show(); });
                    }
                });
            }).setNegativeButton("閉じる",null).show();
    }
    private void loadFamilyLog() {
        String day=selectedDay.toString(); int epoch=sessionEpoch;
        familyLog=null; familyLogCached=false; render();
        network.execute(() -> {
            JSONObject cached=SnapshotCache.readFamilyLog(this,day);
            if(cached!=null) runOnUiThread(() -> {
                if(epoch!=sessionEpoch||!day.equals(selectedDay.toString())||familyLog!=null) return;
                if(snapshot!=null&&(cached.optInt("familyId")!=snapshot.optInt("familyId")||
                    cached.optInt("memberId")!=snapshot.optInt("memberId"))) return;
                familyLog=cached; familyLogCached=true;
                if(tab.equals("familylog")) render();
            });
            try {
                JSONObject result=ApiClient.request("/api/android/v1/family-log?date="+day,null);
                if(epoch==sessionEpoch) SnapshotCache.writeFamilyLog(this,day,result);
                runOnUiThread(() -> {
                    if(epoch!=sessionEpoch || !day.equals(selectedDay.toString())) return;
                    if(snapshot!=null && (result.optInt("familyId")!=snapshot.optInt("familyId") ||
                        result.optInt("memberId")!=snapshot.optInt("memberId"))) { showLogin(); return; }
                    familyLog=result;familyLogCached=false;
                    if(tab.equals("familylog")) render();
                });
            } catch(SecurityException error) { runOnUiThread(() -> { if(epoch==sessionEpoch) showLogin(); }); }
            catch(Exception error) { runOnUiThread(() -> {
                if(epoch==sessionEpoch && tab.equals("familylog") && familyLog==null) { content.removeAllViews(); content.addView(label("育児記録を取得できませんでした")); }
            }); }
        });
    }
    private void renderFamilyLog() {
        content.addView(heading("家族ログ"));
        boolean readOnly=familyLogCached||!ApiClient.canMutate();
        LinearLayout days=new LinearLayout(this);
        days.addView(button("‹",()->{selectedDay=selectedDay.minusDays(1);month=YearMonth.from(selectedDay);loadFamilyLog();}),new LinearLayout.LayoutParams(dp(44),dp(44)));
        days.addView(button(selectedDay.getYear()%100+"."+selectedDay.getMonthValue()+"."+selectedDay.getDayOfMonth(),()->
            new DatePickerDialog(this,(picker,y,m,d)->{selectedDay=LocalDate.of(y,m+1,d);month=YearMonth.from(selectedDay);loadFamilyLog();},
                selectedDay.getYear(),selectedDay.getMonthValue()-1,selectedDay.getDayOfMonth()).show()),new LinearLayout.LayoutParams(0,dp(44),1));
        days.addView(button("›",()->{selectedDay=selectedDay.plusDays(1);month=YearMonth.from(selectedDay);loadFamilyLog();}),new LinearLayout.LayoutParams(dp(44),dp(44)));
        days.addView(button("↻",this::loadFamilyLog),new LinearLayout.LayoutParams(dp(44),dp(44)));
        addPanel(days);
        if(pendingFamilyLogPhoto!=null && !readOnly) content.addView(button("離乳食の写真を再試行",this::sendFamilyLogPhoto));
        if(familyLog==null || !selectedDay.toString().equals(familyLog.optString("date"))) {
            content.addView(label("読み込み中…")); return;
        }
        JSONArray subjects=familyLog.optJSONArray("subjects"), logs=familyLog.optJSONArray("logs");
        if(readOnly) content.addView(label("読み取り専用で表示中（接続と認証を確認しています）"));
        if(subjects!=null&&subjects.length()>0) {
            ArrayList<String> names=new ArrayList<>();ArrayList<Integer> ids=new ArrayList<>();
            names.add("すべての記録対象");ids.add(0);
            for(int i=0;i<subjects.length();i++){JSONObject subject=subjects.optJSONObject(i);if(subject!=null){names.add(subject.optString("name"));ids.add(subject.optInt("id"));}}
            Spinner selected=new Spinner(this);selected.setAdapter(new ArrayAdapter<>(this,android.R.layout.simple_spinner_dropdown_item,names));
            int current=ids.indexOf(familyLogSubjectId);if(current<0){familyLogSubjectId=0;current=0;}selected.setSelection(current);
            selected.setOnItemSelectedListener(new android.widget.AdapterView.OnItemSelectedListener(){
                public void onNothingSelected(android.widget.AdapterView<?> parent){}
                public void onItemSelected(android.widget.AdapterView<?> parent,android.view.View view,int position,long id){
                    if(familyLogSubjectId!=ids.get(position)){familyLogSubjectId=ids.get(position);render();}
                }
            });
            content.addView(selected);
        }
        if(!readOnly)content.addView(button("⚙ 家族ログ管理",this::familyLogManageActions));
        if(subjects==null || subjects.length()==0) {
            content.addView(label("記録対象がありません。赤ちゃん・家族・ペットなどを追加してください。")); return;
        }
        if(!readOnly) {
            LinearLayout add=new LinearLayout(this);
            add.addView(button("＋ 記録",this::addFamilyLog),new LinearLayout.LayoutParams(0,dp(44),1));
            add.addView(button("＋ タイマー",this::startFamilyLogTimer),new LinearLayout.LayoutParams(0,dp(44),1));
            content.addView(add);
        }
        JSONArray timers=readOnly?null:familyLog.optJSONArray("timers");
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
        if(!readOnly&&familyLog.optBoolean("timersTruncated")) content.addView(label("実行中のタイマーは一部のみ表示しています。"));
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
        content.addView(heading("当日の記録"));
        if(logs==null || logs.length()==0) { content.addView(label("記録はありません")); return; }
        for(int i=0;i<logs.length();i++) {
            JSONObject row=logs.optJSONObject(i); if(row==null||familyLogSubjectId>0&&row.optInt("subject_id")!=familyLogSubjectId) continue;
            String time=row.optString("occurred_at");
            if(time.length()>=16) time=time.substring(11,16);
            String detail=row.optString("detail_code");
            String amount=row.isNull("amount")?"":row.optString("amount")+row.optString("unit");
            LinearLayout record=panel();
            TextView entry=label(time+"   "+
                logTypeName(row.optString("log_type"))+
                (amount.isEmpty()?"":"  "+amount));
            entry.setTextSize(17);entry.setTypeface(null,android.graphics.Typeface.BOLD);
            record.addView(entry);
            TextView details=label(row.optString("subject_name")+
                (detail.isEmpty()?"":" ・ "+familyLogDetailLabel(detail))+
                (row.optString("value_text").isEmpty()?"":" ・ "+row.optString("value_text"))+
                (row.optString("note").isEmpty()?"":"\n"+row.optString("note")));
            details.setTextSize(13);details.setTextColor(mutedColor());record.addView(details);
            if(!readOnly) record.setOnLongClickListener(v -> { familyLogActions(row); return true; });
            addPanel(record);
            int mediaId=row.optInt("media_id");
            if(!readOnly&&mediaId>0) content.addView(button("離乳食の写真",() -> new AlertDialog.Builder(this)
                .setItems(new String[]{"表示","削除"},(dialog,which) -> {
                    if(which==0) showFamilyLogPhoto(mediaId); else deleteFamilyLogPhoto(mediaId);
                }).show()));
            else if(!readOnly&&"MEAL".equals(row.optString("log_type")) && "BABY_FOOD".equals(detail) &&
                ("BABY".equals(row.optString("subject_kind"))||"CHILD".equals(row.optString("subject_kind"))))
                content.addView(button("＋ 離乳食の写真",() -> chooseFamilyLogPhoto(row.optInt("id"))));
        }
    }
    private HorizontalScrollView horizontalActions(LinearLayout actions) {
        HorizontalScrollView scroll=new HorizontalScrollView(this);
        scroll.setHorizontalScrollBarEnabled(false);scroll.addView(actions);return scroll;
    }
    private String familyLogDetailLabel(String detail) {
        switch(detail) {
            case "WET":return "おしっこ";case "DIRTY":return "うんち";case "BOTH":return "両方";
            case "BABY_FOOD":return "離乳食";case "BREAKFAST":return "朝食";case "LUNCH":return "昼食";
            case "DINNER":return "夕食";case "SNACK":return "おやつ";case "OTHER":return "その他";
            default:return detail;
        }
    }
    private void familyLogManageActions() {
        ArrayList<String> names=new ArrayList<>();ArrayList<Runnable> actions=new ArrayList<>();
        names.add("＋ 記録対象");actions.add(this::addFamilyLogSubject);
        names.add("記録対象の名前・表示");actions.add(this::manageFamilyLogSubjects);
        if(familyLog!=null&&familyLog.optBoolean("canManageSettings")){names.add("表示設定");actions.add(this::showFamilyLogSettings);}
        if(familyLog!=null&&familyLog.optBoolean("canManageQuickActions")){names.add("クイック記録");actions.add(this::manageQuickActions);}
        if(familyLog!=null&&familyLog.optBoolean("canManageChores")){names.add("日常家事");actions.add(this::manageQuickChores);}
        names.add("Web版の家族ログ管理");actions.add(()->showWebPage("/app/settings_family_log.php"));
        new AlertDialog.Builder(this).setTitle("家族ログ管理").setItems(names.toArray(new String[0]),(d,w)->actions.get(w).run()).show();
    }
    private void renderFamilyLogDock() {
        if(pageDock==null)return;pageDock.removeAllViews();
        LinearLayout dock=new LinearLayout(this);dock.setOrientation(LinearLayout.VERTICAL);
        if(familyLog!=null&&selectedDay.toString().equals(familyLog.optString("date"))) {
            boolean readOnly=familyLogCached||!ApiClient.canMutate();
            JSONArray subjects=familyLog.optJSONArray("subjects"),timers=readOnly?null:familyLog.optJSONArray("timers");
            if(subjects!=null)populateFamilyLogQuickDock(dock,subjects,timers,readOnly);
        }
        LinearLayout links=new LinearLayout(this);
        String[] names={"📓 成長日記","📖 家族日誌","🥕 食材","📊 まとめ"};
        Runnable[] actions={()->showWebPage("/app/child_journal.php"),()->showWebPage("/app/family_journal.php"),
            ()->showWebPage("/app/child_foods.php"),this::chooseFamilyLogSummary};
        for(int i=0;i<names.length;i++){Button link=button(names[i],actions[i]);link.setTextSize(11);link.setPadding(0,0,0,0);
            links.addView(link,new LinearLayout.LayoutParams(0,dp(42),1));}
        if(dock.getChildCount()>0){ScrollView quickScroll=new ScrollView(this);quickScroll.addView(dock);
            pageDock.addView(quickScroll,new LinearLayout.LayoutParams(-1,dp(132)));}
        pageDock.addView(links);
    }
    private void populateFamilyLogQuickDock(LinearLayout dock,JSONArray subjects,JSONArray timers,boolean readOnly) {
        boolean today=!readOnly&&selectedDay.equals(LocalDate.now(java.time.ZoneId.of("Asia/Tokyo")));
        JSONArray quickActions=today?familyLog.optJSONArray("quickActions"):null;
        if(today) {
            JSONArray chores=familyLog.optJSONArray("chores");
            if(chores!=null && chores.length()>0) {
                dock.addView(label("日常家事"));
                int weekday=selectedDay.getDayOfWeek().getValue()%7;
                for(int i=0;i<chores.length();i++) {
                    JSONObject chore=chores.optJSONObject(i);if(chore==null || chore.optInt("active",1)!=1 || (chore.optInt("weekday_mask",127)&(1<<weekday))==0) continue;
                    dock.addView(button(chore.optString("icon","✨")+" "+chore.optString("name"),() -> recordQuickChore(chore)));
                }
            }
        }
        for(int i=0;!readOnly&&i<subjects.length();i++) {
            JSONObject subject=subjects.optJSONObject(i);
            if(subject==null||familyLogSubjectId>0&&subject.optInt("id")!=familyLogSubjectId)continue;
            dock.addView(label(subject.optString("name")));
            LinearLayout actions=new LinearLayout(this);
            ArrayList<String> enabled=allowedLogTypes(subject);
            boolean hasQuick=false;
            if(quickActions!=null) for(int n=0;n<quickActions.length();n++) {
                JSONObject quick=quickActions.optJSONObject(n);
                if(quick==null || quick.optInt("active",1)!=1 || quick.optInt("subject_id")!=subject.optInt("id")) continue;
                hasQuick=true;
                actions.addView(button(quick.optString("icon","＋")+" "+quick.optString("name"),() -> runFamilyLogQuickAction(quick)));
            }
            if(hasQuick) { dock.addView(horizontalActions(actions)); continue; }
            if(!"BABY".equals(subject.optString("subject_kind")))continue;
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
            if(enabled.contains("MEAL")) actions.addView(button("🍚 離乳食",() -> recordBaby(subject,"MEAL","BABY_FOOD")));
            if(enabled.contains("DIAPER")) {
                actions.addView(button("💧 おしっこ",() -> recordBaby(subject,"DIAPER","WET")));
                actions.addView(button("💩 うんち",() -> recordBaby(subject,"DIAPER","DIRTY")));
            }
            if(actions.getChildCount()>0) dock.addView(horizontalActions(actions));
        }
    }
    private String logTypeIcon(String type) {
        switch(type) {
            case "MILK":return "🍼";
            case "DIAPER":return "🧷";
            case "SLEEP":return "😴";
            case "BATH":return "🛁";
            case "MEAL":return "🍚";
            default:return "✨";
        }
    }
    private void chooseFamilyLogSummary() {
        if(familyLog==null) return;
        JSONArray subjects=familyLog.optJSONArray("subjects");
        ArrayList<String> names=new ArrayList<>();ArrayList<Integer> ids=new ArrayList<>();
        names.add("表示中の全対象");ids.add(0);
        if(subjects!=null) for(int i=0;i<subjects.length();i++) {
            JSONObject subject=subjects.optJSONObject(i);
            if(subject==null) continue;
            names.add(subject.optString("name"));ids.add(subject.optInt("id"));
        }
        new AlertDialog.Builder(this).setTitle("集計する対象").setItems(names.toArray(new String[0]),(dialog,which) ->
            new AlertDialog.Builder(this).setTitle("集計期間")
                .setItems(new String[]{"今日","過去7日","過去30日","期間を指定"},(period,index) -> {
                    if(index==3) chooseFamilyLogSummaryRange(ids.get(which),names.get(which));
                    else loadFamilyLogSummary(selectedDay.minusDays((index==0?1:index==1?7:30)-1),selectedDay,ids.get(which),names.get(which));
                })
                .show()).show();
    }
    private void chooseFamilyLogSummaryRange(int subjectId,String name) {
        LocalDate[] range={selectedDay.minusDays(29),selectedDay};
        LinearLayout form=new LinearLayout(this);form.setOrientation(LinearLayout.VERTICAL);
        Button start=button("開始日: "+range[0],() -> new DatePickerDialog(this,(picker,y,m,d) -> {
            range[0]=LocalDate.of(y,m+1,d);startRangeLabel(form,0,"開始日: "+range[0]);
        },range[0].getYear(),range[0].getMonthValue()-1,range[0].getDayOfMonth()).show());
        Button end=button("終了日: "+range[1],() -> new DatePickerDialog(this,(picker,y,m,d) -> {
            range[1]=LocalDate.of(y,m+1,d);startRangeLabel(form,1,"終了日: "+range[1]);
        },range[1].getYear(),range[1].getMonthValue()-1,range[1].getDayOfMonth()).show());
        form.addView(start);form.addView(end);
        AlertDialog dialog=new AlertDialog.Builder(this).setTitle("集計期間を指定（最大366日）").setView(form)
            .setPositiveButton("集計",null).setNegativeButton("キャンセル",null).create();
        dialog.setOnShowListener(ignored -> dialog.getButton(AlertDialog.BUTTON_POSITIVE).setOnClickListener(v -> {
            long days=java.time.temporal.ChronoUnit.DAYS.between(range[0],range[1])+1;
            if(days<1||days>366) { Toast.makeText(this,"1〜366日で指定してください",Toast.LENGTH_SHORT).show();return; }
            dialog.dismiss();loadFamilyLogSummary(range[0],range[1],subjectId,name);
        }));dialog.show();
    }
    private void startRangeLabel(LinearLayout form,int index,String value) { ((Button)form.getChildAt(index)).setText(value); }
    private void loadFamilyLogSummary(LocalDate start,LocalDate end,int subjectId,String name) {
        String to=end.toString(),from=start.toString();
        int epoch=sessionEpoch;
        network.execute(() -> {
            try {
                JSONObject totals=new JSONObject();JSONArray daily=new JSONArray();
                for(LocalDate cursor=start;!cursor.isAfter(end);cursor=cursor.plusDays(30)) {
                    if(epoch!=sessionEpoch) return;
                    LocalDate chunkEnd=cursor.plusDays(29).isBefore(end)?cursor.plusDays(29):end;
                    JSONObject response=ApiClient.request("/api/android/v1/family-log-summary?from="+cursor+"&to="+chunkEnd+
                        "&subject="+(subjectId==0?"":subjectId),null);
                    JSONObject part=response.getJSONObject("totals");JSONArray rows=response.getJSONArray("daily");
                    for(String key:new String[]{"entries","milkMl","wet","dirty","sleepMinutes","meals","toilet","baths","medicine","chores"})
                        totals.put(key,totals.optDouble(key)+part.optDouble(key));
                    JSONArray combined=new JSONArray();
                    for(int i=0;i<rows.length();i++) combined.put(rows.getJSONObject(i));
                    for(int i=0;i<daily.length();i++) combined.put(daily.getJSONObject(i));
                    daily=combined;
                }
                final JSONArray resultDays=daily;
                runOnUiThread(() -> {
                    if(epoch!=sessionEpoch || !tab.equals("familylog")) return;
                    StringBuilder result=new StringBuilder(from+" 〜 "+to+"\n");
                    result.append("記録 ").append(totals.optInt("entries")).append("件 ・ ミルク ")
                        .append((int)Math.round(totals.optDouble("milkMl"))).append("ml\n")
                        .append("おしっこ ").append(totals.optInt("wet")).append("回 ・ うんち ")
                        .append(totals.optInt("dirty")).append("回 ・ 睡眠 ")
                        .append((int)Math.round(totals.optDouble("sleepMinutes"))).append("分\n")
                        .append("食事 ").append(totals.optInt("meals")).append("回 ・ トイレ ")
                        .append(totals.optInt("toilet")).append("回 ・ 入浴 ")
                        .append(totals.optInt("baths")).append("回\n")
                        .append("薬 ").append(totals.optInt("medicine")).append("回 ・ 家事 ")
                        .append(totals.optInt("chores")).append("回");
                    if(start.isBefore(end)) for(int i=0;i<resultDays.length();i++) {
                        JSONObject day=resultDays.optJSONObject(i);if(day==null) continue;
                        result.append("\n\n").append(day.optString("day")).append("：記録 ").append(day.optInt("entries"))
                            .append("件、ミルク ").append(day.optString("milkMl","0")).append("ml、睡眠 ")
                            .append(day.optString("sleepMinutes","0")).append("分");
                    }
                    ScrollView scroll=new ScrollView(this);
                    LinearLayout panel=new LinearLayout(this);panel.setOrientation(LinearLayout.VERTICAL);
                    LinearLayout chart=new LinearLayout(this);chart.setOrientation(LinearLayout.VERTICAL);
                    String[] metricNames={"ミルク量（ml）","睡眠時間（分）","記録件数","おしっこ（回）","うんち（回）",
                        "食事（回）","トイレ（回）","入浴（回）","薬（回）","家事（回）"};
                    String[] metricKeys={"milkMl","sleepMinutes","entries","wet","dirty",
                        "meals","toilet","baths","medicine","chores"};
                    Button metric=new Button(this);metric.setText("グラフ: "+metricNames[0]);
                    metric.setOnClickListener(view ->
                        new AlertDialog.Builder(this).setTitle("グラフの項目")
                            .setItems(metricNames,(dialog,which) -> {
                                chart.setTag(metricKeys[which]);
                                metric.setText("グラフ: "+metricNames[which]);
                                renderFamilyLogChart(chart,resultDays,start,end);
                            }).show());
                    chart.setTag(metricKeys[0]);renderFamilyLogChart(chart,resultDays,start,end);
                    panel.addView(metric);panel.addView(chart);
                    panel.addView(label(result.toString()));scroll.addView(panel);
                    new AlertDialog.Builder(this).setTitle(name+" の集計").setView(scroll)
                        .setPositiveButton("閉じる",null).show();
                });
            } catch(Exception error) {
                runOnUiThread(() -> { if(epoch==sessionEpoch) Toast.makeText(this,"集計を取得できませんでした",Toast.LENGTH_SHORT).show(); });
            }
        });
    }
    private void renderFamilyLogChart(LinearLayout chart,JSONArray daily,LocalDate start,LocalDate end) {
        chart.removeAllViews();
        String key=String.valueOf(chart.getTag());
        Map<String,String> titles=new HashMap<>();
        titles.put("milkMl","ミルク量（ml）");titles.put("sleepMinutes","睡眠時間（分）");
        titles.put("entries","記録件数");titles.put("wet","おしっこ（回）");titles.put("dirty","うんち（回）");
        titles.put("meals","食事（回）");titles.put("toilet","トイレ（回）");titles.put("baths","入浴（回）");
        titles.put("medicine","薬（回）");titles.put("chores","家事（回）");
        chart.addView(label(titles.getOrDefault(key,"記録")+" ・ 期間末尾の最大30日（記録がない日は0）"));
        Map<String,Double> values=new HashMap<>();
        for(int i=0;i<daily.length();i++) {
            JSONObject row=daily.optJSONObject(i);
            if(row!=null) values.put(row.optString("day"),row.optDouble(key));
        }
        LocalDate first=end.minusDays(29).isAfter(start)?end.minusDays(29):start;
        double maximum=1;
        for(LocalDate day=first;!day.isAfter(end);day=day.plusDays(1))
            maximum=Math.max(maximum,values.getOrDefault(day.toString(),0.0));
        int density=Math.max(1,Math.round(getResources().getDisplayMetrics().density));
        LinearLayout bars=new LinearLayout(this);bars.setOrientation(LinearLayout.HORIZONTAL);
        for(LocalDate day=first;!day.isAfter(end);day=day.plusDays(1)) {
            double amount=values.getOrDefault(day.toString(),0.0);
            LinearLayout column=new LinearLayout(this);column.setOrientation(LinearLayout.VERTICAL);
            column.setGravity(android.view.Gravity.BOTTOM|android.view.Gravity.CENTER_HORIZONTAL);
            TextView value=label(amount==0?"":String.valueOf((int)Math.round(amount)));
            value.setTextSize(11);value.setPadding(0,0,0,0);
            column.addView(value);
            android.view.View bar=new android.view.View(this);
            bar.setBackgroundColor("sleepMinutes".equals(key)?0xff6366f1:0xff0d9488);
            column.addView(bar,new LinearLayout.LayoutParams(22*density,Math.max(2*density,(int)(90*density*amount/maximum))));
            TextView date=label(day.getMonthValue()+"/"+day.getDayOfMonth());date.setTextSize(10);date.setPadding(0,4*density,0,0);
            column.addView(date);bars.addView(column,new LinearLayout.LayoutParams(54*density,150*density));
        }
        HorizontalScrollView horizontal=new HorizontalScrollView(this);horizontal.addView(bars);
        chart.addView(horizontal);horizontal.post(() -> horizontal.fullScroll(android.view.View.FOCUS_RIGHT));
    }
    private void runFamilyLogQuickAction(JSONObject quick) {
        String mode=quick.optString("mode");
        if("FORM".equals(mode)) { showFamilyLogEditor(null,quick); return; }
        if("SLEEP_TOGGLE".equals(mode)) {
            JSONArray timers=familyLog==null?null:familyLog.optJSONArray("timers");
            if(timers!=null) for(int i=0;i<timers.length();i++) {
                JSONObject timer=timers.optJSONObject(i);
                if(timer!=null && timer.optInt("subject_id")==quick.optInt("subject_id") && "SLEEP".equals(timer.optString("log_type"))) {
                    finishFamilyLogTimer(timer,false); return;
                }
            }
            changeFamilyLogTimer("sleep_start",quick.optInt("subject_id"),0,""); return;
        }
        if(snapshot==null || quick.optInt("id")<=0) return;
        int epoch=sessionEpoch;String csrf=snapshot.optString("csrf");
        network.execute(() -> {
            try {
                if(epoch!=sessionEpoch) return;
                ApiClient.request("/api/family-log",new JSONObject().put("action","execute_quick_action")
                    .put("csrf",csrf).put("quick_action_id",quick.optInt("id")));
                if(epoch==sessionEpoch) runOnUiThread(this::loadFamilyLog);
            } catch(Exception error) {
                runOnUiThread(() -> { if(epoch==sessionEpoch) Toast.makeText(this,"クイック記録ができませんでした",Toast.LENGTH_SHORT).show(); });
            }
        });
    }
    private void recordQuickChore(JSONObject chore) {
        if(snapshot==null || chore.optInt("id")<=0) return;
        int epoch=sessionEpoch;String csrf=snapshot.optString("csrf");
        network.execute(() -> {
            try {
                if(epoch!=sessionEpoch) return;
                ApiClient.request("/api/family-log",new JSONObject().put("action","quick_chore_record")
                    .put("csrf",csrf).put("id",chore.optInt("id")));
                if(epoch==sessionEpoch) runOnUiThread(this::loadFamilyLog);
            } catch(Exception error) {
                runOnUiThread(() -> { if(epoch==sessionEpoch) Toast.makeText(this,"家事を記録できませんでした",Toast.LENGTH_SHORT).show(); });
            }
        });
    }
    private void showFamilyLogPhoto(int mediaId) {
        int epoch=sessionEpoch;
        network.execute(() -> {
            try {
                Bitmap image=ApiClient.thumbnail("/api/family-log-media?media="+mediaId);
                runOnUiThread(() -> {
                    if(epoch!=sessionEpoch || !tab.equals("familylog")) return;
                    ImageView view=new ImageView(this); view.setImageBitmap(image); view.setAdjustViewBounds(true);
                    view.setContentDescription("離乳食の写真");
                    new AlertDialog.Builder(this).setTitle("離乳食の写真").setView(view).setPositiveButton("閉じる",null).show();
                });
            } catch(Exception error) {
                runOnUiThread(() -> { if(epoch==sessionEpoch) Toast.makeText(this,"写真を表示できませんでした",Toast.LENGTH_SHORT).show(); });
            }
        });
    }
    private void deleteFamilyLogPhoto(int mediaId) {
        if(snapshot==null) return;
        new AlertDialog.Builder(this).setTitle("写真を削除").setMessage("記録は残し、写真だけを削除します。")
            .setPositiveButton("削除",(dialog,which) -> {
                String csrf=snapshot.optString("csrf"); int epoch=sessionEpoch;
                network.execute(() -> {
                    try {
                        if(epoch!=sessionEpoch) return;
                        ApiClient.deleteFamilyLogPhoto(mediaId,csrf);
                        if(epoch==sessionEpoch) runOnUiThread(this::loadFamilyLog);
                    } catch(Exception error) {
                        runOnUiThread(() -> { if(epoch==sessionEpoch) Toast.makeText(this,"写真を削除できませんでした",Toast.LENGTH_SHORT).show(); });
                    }
                });
            }).setNegativeButton("戻る",null).show();
    }
    private void chooseFamilyLogPhoto(int logId) {
        if(snapshot==null || logId<=0) return;
        if(familyPhotoSending) return;
        pendingFamilyLogPhotoId=logId;
        Intent picker=new Intent(Intent.ACTION_OPEN_DOCUMENT); picker.addCategory(Intent.CATEGORY_OPENABLE); picker.setType("image/*");
        startActivityForResult(picker,42);
    }
    private void sendFamilyLogPhoto() {
        if(snapshot==null || pendingFamilyLogPhoto==null || pendingFamilyLogPhotoId<=0 || familyPhotoSending) return;
        familyPhotoSending=true;
        int id=pendingFamilyLogPhotoId,epoch=sessionEpoch; String csrf=snapshot.optString("csrf");
        MessagePhotoUpload.Draft draft=pendingFamilyLogPhoto;
        network.execute(() -> {
            try {
                if(epoch!=sessionEpoch) return;
                JSONObject result=ApiClient.uploadFamilyLogPhoto(id,draft.jpeg,csrf);
                if(result.isNull("media")) throw new IllegalStateException("写真が見つかりません");
                runOnUiThread(() -> { if(epoch==sessionEpoch && pendingFamilyLogPhoto==draft) {
                    familyPhotoSending=false; pendingFamilyLogPhoto=null; pendingFamilyLogPhotoId=0; loadFamilyLog();
                } });
            } catch(Exception error) {
                runOnUiThread(() -> { if(epoch==sessionEpoch) { familyPhotoSending=false;
                    Toast.makeText(this,"写真を保存できませんでした。再試行できます",Toast.LENGTH_LONG).show();
                    if(tab.equals("familylog")) render();
                } });
            }
        });
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
    private void manageQuickActions() {
        if(familyLog==null || !familyLog.optBoolean("canManageQuickActions")) return;
        JSONArray subjects=familyLog.optJSONArray("subjects");
        if(subjects==null || subjects.length()==0) return;
        ArrayList<JSONObject> rows=new ArrayList<>(); ArrayList<String> names=new ArrayList<>();
        for(int i=0;i<subjects.length();i++) {
            JSONObject subject=subjects.optJSONObject(i); if(subject==null) continue;
            rows.add(subject); names.add(subject.optString("name"));
        }
        new AlertDialog.Builder(this).setTitle("記録対象を選択")
            .setItems(names.toArray(new String[0]),(dialog,which) -> manageQuickActionsFor(rows.get(which)))
            .setNegativeButton("閉じる",null).show();
    }
    private void manageQuickActionsFor(JSONObject subject) {
        JSONArray all=familyLog==null?null:familyLog.optJSONArray("quickActions");
        ArrayList<JSONObject> rows=new ArrayList<>(); ArrayList<String> names=new ArrayList<>();
        names.add("＋ クイック記録を追加");
        if(all!=null) for(int i=0;i<all.length();i++) {
            JSONObject row=all.optJSONObject(i);
            if(row==null || row.optInt("subject_id")!=subject.optInt("id")) continue;
            rows.add(row);
            names.add((row.optInt("active",1)==1?"":"（無効）")+row.optString("icon","＋")+" "+row.optString("name"));
        }
        new AlertDialog.Builder(this).setTitle(subject.optString("name")+" のクイック記録")
            .setItems(names.toArray(new String[0]),(dialog,which) -> {
                if(which==0) editQuickAction(subject,null); else quickActionMenu(subject,rows.get(which-1));
            }).setNegativeButton("閉じる",null).show();
    }
    private void quickActionMenu(JSONObject subject,JSONObject row) {
        boolean active=row.optInt("active",1)==1;
        String[] actions=active?new String[]{"編集","上へ移動","下へ移動","無効にする"}:new String[]{"編集して再有効化"};
        new AlertDialog.Builder(this).setTitle(row.optString("name")).setItems(actions,(dialog,which) -> {
            if(!active || which==0) { editQuickAction(subject,row); return; }
            if(which==3) new AlertDialog.Builder(this).setTitle("クイック記録を無効にする")
                .setMessage(row.optString("name")+"を一覧から隠しますか？")
                .setPositiveButton("無効にする",(d,w) -> changeQuickAction("quick_action_disable",row.optInt("id"),null))
                .setNegativeButton("やめる",null).show();
            else {
                try { changeQuickAction("quick_action_reorder",row.optInt("id"),
                    new JSONObject().put("direction",which==1?"up":"down")); }
                catch(Exception ignored) { }
            }
        }).show();
    }
    private void editQuickAction(JSONObject subject,JSONObject existing) {
        if(snapshot==null) return;
        ArrayList<String> codes=allowedLogTypes(subject);
        codes.remove("HOUSEWORK"); codes.remove("TIMER");
        if(codes.isEmpty()) { Toast.makeText(this,"利用できる記録種類がありません",Toast.LENGTH_SHORT).show(); return; }
        ArrayList<String> types=new ArrayList<>(); for(String code:codes) types.add(logTypeName(code));
        EditText name=new EditText(this); name.setHint("表示名"); name.setSingleLine(true);
        EditText icon=new EditText(this); icon.setHint("アイコン"); icon.setSingleLine(true);
        EditText detail=new EditText(this); detail.setHint("詳細コード（例: WET、BABY_FOOD）"); detail.setSingleLine(true);
        EditText amount=new EditText(this); amount.setHint("量・数値（任意）"); amount.setInputType(android.text.InputType.TYPE_CLASS_NUMBER|android.text.InputType.TYPE_NUMBER_FLAG_DECIMAL|android.text.InputType.TYPE_NUMBER_FLAG_SIGNED);
        EditText unit=new EditText(this); unit.setHint("単位（例: ml）"); unit.setSingleLine(true);
        EditText value=new EditText(this); value.setHint("記録内容（任意）");
        Spinner mode=new Spinner(this),type=new Spinner(this);
        mode.setAdapter(new ArrayAdapter<>(this,android.R.layout.simple_spinner_dropdown_item,
            new String[]{"ワンタッチ","入力して記録","睡眠開始・終了"}));
        type.setAdapter(new ArrayAdapter<>(this,android.R.layout.simple_spinner_dropdown_item,types));
        if(existing!=null) {
            name.setText(existing.optString("name")); icon.setText(existing.optString("icon","＋"));
            detail.setText(existing.optString("detail_code"));
            if(!existing.isNull("amount")) amount.setText(existing.optString("amount"));
            unit.setText(existing.optString("unit")); value.setText(existing.optString("value_text"));
            String oldMode=existing.optString("mode");
            mode.setSelection("SLEEP_TOGGLE".equals(oldMode)?2:"FORM".equals(oldMode)?1:0);
            int index=codes.indexOf(existing.optString("log_type")); if(index>=0) type.setSelection(index);
        }
        LinearLayout form=new LinearLayout(this); form.setOrientation(LinearLayout.VERTICAL); form.setPadding(32,8,32,8);
        form.addView(name); form.addView(icon); form.addView(label("動作")); form.addView(mode);
        form.addView(label("記録種類")); form.addView(type); form.addView(detail); form.addView(amount); form.addView(unit); form.addView(value);
        ScrollView scroll=new ScrollView(this); scroll.addView(form);
        new AlertDialog.Builder(this).setTitle(existing==null?"クイック記録を追加":"クイック記録を編集")
            .setView(scroll).setPositiveButton("保存",(dialog,which) -> {
                String title=name.getText().toString().trim(),number=amount.getText().toString().trim();
                if(title.isEmpty()||title.length()>40||icon.length()>16||detail.length()>40||unit.length()>16||value.length()>255) {
                    Toast.makeText(this,"入力内容を確認してください",Toast.LENGTH_SHORT).show(); return;
                }
                if(!number.isEmpty()) try {
                    double n=Double.parseDouble(number); if(!Double.isFinite(n)||n<-100000||n>100000) throw new NumberFormatException();
                } catch(NumberFormatException error) {
                    Toast.makeText(this,"数値を確認してください",Toast.LENGTH_SHORT).show(); return;
                }
                String[] modes={"QUICK","FORM","SLEEP_TOGGLE"};
                String selectedMode=modes[mode.getSelectedItemPosition()];
                String selectedType=codes.get(type.getSelectedItemPosition());
                String detailCode=detail.getText().toString().trim().toUpperCase(java.util.Locale.ROOT);
                if(!quickDetailAllowed(selectedType,detailCode)) {
                    Toast.makeText(this,"詳細コードを確認してください",Toast.LENGTH_SHORT).show(); return;
                }
                if("SLEEP_TOGGLE".equals(selectedMode)&&!codes.contains("SLEEP")) {
                    Toast.makeText(this,"この対象では睡眠を記録できません",Toast.LENGTH_SHORT).show(); return;
                }
                try {
                    JSONObject body=new JSONObject().put("subject_id",subject.optInt("id"))
                        .put("name",title).put("icon",icon.getText().toString().trim())
                        .put("mode",selectedMode).put("log_type",selectedType)
                        .put("detail_code",detailCode)
                        .put("amount",number).put("unit",unit.getText().toString().trim())
                        .put("value_text",value.getText().toString().trim()).put("active",true);
                    changeQuickAction("quick_action_save",existing==null?0:existing.optInt("id"),body);
                } catch(Exception ignored) { }
            }).setNegativeButton("閉じる",null).show();
    }
    private boolean quickDetailAllowed(String type,String detail) {
        if(detail.isEmpty()) return true;
        switch(type) {
            case "DIAPER": return java.util.Arrays.asList("WET","DIRTY","BOTH").contains(detail);
            case "MEAL": return java.util.Arrays.asList("BREAKFAST","LUNCH","DINNER","SNACK","BABY_FOOD","OTHER").contains(detail);
            case "BATH": return java.util.Arrays.asList("BATH","SHOWER").contains(detail);
            case "CONDITION": return java.util.Arrays.asList("GOOD","NORMAL","TIRED","SICK","VOMIT").contains(detail);
            default: return false;
        }
    }
    private void changeQuickAction(String action,int id,JSONObject extras) {
        if(snapshot==null || familyLog==null || !familyLog.optBoolean("canManageQuickActions")) return;
        String csrf=snapshot.optString("csrf"); int epoch=sessionEpoch;
        network.execute(() -> {
            try {
                if(epoch!=sessionEpoch) return;
                JSONObject body=extras==null?new JSONObject():new JSONObject(extras.toString());
                body.put("action",action).put("csrf",csrf).put("id",id);
                ApiClient.request("/api/family-log",body);
                if(epoch==sessionEpoch) runOnUiThread(this::loadFamilyLog);
            } catch(Exception error) {
                runOnUiThread(() -> { if(epoch==sessionEpoch) Toast.makeText(this,"クイック記録を更新できませんでした",Toast.LENGTH_SHORT).show(); });
            }
        });
    }
    private void manageQuickChores() {
        if(familyLog==null || !familyLog.optBoolean("canManageChores")) return;
        JSONArray chores=familyLog.optJSONArray("chores");
        ArrayList<JSONObject> rows=new ArrayList<>(); ArrayList<String> names=new ArrayList<>();
        names.add("＋ 家事項目を追加");
        if(chores!=null) for(int i=0;i<chores.length();i++) {
            JSONObject row=chores.optJSONObject(i); if(row==null) continue;
            rows.add(row); names.add((row.optInt("active",1)==1?"":"（非表示）")+row.optString("icon","✨")+" "+row.optString("name"));
        }
        new AlertDialog.Builder(this).setTitle("ちょこっと家事").setItems(names.toArray(new String[0]),(dialog,which) -> {
            if(which==0) editQuickChore(null);
            else quickChoreActions(rows.get(which-1));
        }).setNegativeButton("閉じる",null).show();
    }
    private void quickChoreActions(JSONObject chore) {
        boolean active=chore.optInt("active",1)==1;
        String[] actions=active?new String[]{"編集","上へ移動","下へ移動","非表示にする"}:new String[]{"再表示する"};
        new AlertDialog.Builder(this).setTitle(chore.optString("name")).setItems(actions,(dialog,which) -> {
            if(!active) { changeQuickChore("quick_chore_restore",chore.optInt("id"),null); return; }
            if(which==0) editQuickChore(chore);
            else if(which==3) new AlertDialog.Builder(this).setTitle("非表示にする")
                .setMessage(chore.optString("name")+"を一覧から隠しますか？")
                .setPositiveButton("非表示",(d,w) -> changeQuickChore("quick_chore_remove",chore.optInt("id"),null))
                .setNegativeButton("やめる",null).show();
            else reorderQuickChore(chore.optInt("id"),which==1?-1:1);
        }).show();
    }
    private void reorderQuickChore(int id,int direction) {
        JSONArray chores=familyLog==null?null:familyLog.optJSONArray("chores");
        if(chores==null) return;
        ArrayList<Integer> ids=new ArrayList<>();
        for(int i=0;i<chores.length();i++) {
            JSONObject row=chores.optJSONObject(i);
            if(row!=null && row.optInt("active",1)==1) ids.add(row.optInt("id"));
        }
        int from=ids.indexOf(id),to=from+direction;
        if(from<0||to<0||to>=ids.size()) return;
        java.util.Collections.swap(ids,from,to);
        try { changeQuickChore("quick_chore_reorder",0,new JSONObject().put("ids",new JSONArray(ids))); }
        catch(Exception ignored) { }
    }
    private void editQuickChore(JSONObject existing) {
        EditText name=new EditText(this); name.setHint("名前（8文字以内）"); name.setSingleLine(true);
        EditText icon=new EditText(this); icon.setHint("絵文字"); icon.setSingleLine(true);
        if(existing!=null) { name.setText(existing.optString("name")); icon.setText(existing.optString("icon","✨")); }
        CheckBox[] days=new CheckBox[7]; String[] labels={"日","月","火","水","木","金","土"};
        LinearLayout form=new LinearLayout(this); form.setOrientation(LinearLayout.VERTICAL); form.setPadding(32,8,32,8);
        form.addView(name); form.addView(icon); form.addView(label("表示する曜日"));
        for(int i=0;i<7;i++) {
            days[i]=new CheckBox(this); days[i].setText(labels[i]);
            days[i].setChecked(existing==null || (existing.optInt("weekday_mask",127)&(1<<i))!=0);
            form.addView(days[i]);
        }
        new AlertDialog.Builder(this).setTitle(existing==null?"家事項目を追加":"家事項目を編集").setView(form)
            .setPositiveButton("保存",(dialog,which) -> {
                String title=name.getText().toString().trim(),symbol=icon.getText().toString().trim();
                if(title.isEmpty()||title.codePointCount(0,title.length())>8) {
                    Toast.makeText(this,"名前は1〜8文字です",Toast.LENGTH_SHORT).show(); return;
                }
                int mask=0; for(int i=0;i<7;i++) if(days[i].isChecked()) mask|=1<<i;
                try { changeQuickChore(existing==null?"quick_chore_add":"quick_chore_update",existing==null?0:existing.optInt("id"),
                    new JSONObject().put("name",title).put("icon",symbol.isEmpty()?"✨":symbol).put("weekday_mask",mask)); }
                catch(Exception ignored) { }
            }).setNegativeButton("閉じる",null).show();
    }
    private void changeQuickChore(String action,int id,JSONObject extras) {
        if(snapshot==null || familyLog==null || !familyLog.optBoolean("canManageChores")) return;
        String csrf=snapshot.optString("csrf"); int epoch=sessionEpoch;
        network.execute(() -> {
            try {
                if(epoch!=sessionEpoch) return;
                JSONObject body=extras==null?new JSONObject():new JSONObject(extras.toString());
                body.put("action",action).put("csrf",csrf).put("id",id);
                ApiClient.request("/api/family-log",body);
                if(epoch==sessionEpoch) runOnUiThread(this::loadFamilyLog);
            } catch(Exception error) {
                runOnUiThread(() -> { if(epoch==sessionEpoch) Toast.makeText(this,"家事項目を更新できませんでした",Toast.LENGTH_SHORT).show(); });
            }
        });
    }
    private void showFamilyLogSettings() {
        if(snapshot==null || familyLog==null || !familyLog.optBoolean("canManageSettings")) return;
        CheckBox adults=new CheckBox(this); adults.setText("大人の記録を表示"); adults.setChecked(familyLog.optBoolean("showAdultLogs",true));
        EditText presets=new EditText(this); presets.setHint("ミルク量の候補（例: 160, 240）");
        JSONArray current=familyLog.optJSONArray("milkPresets");
        ArrayList<String> values=new ArrayList<>();
        if(current!=null) for(int i=0;i<current.length();i++) values.add(String.valueOf(current.optInt(i)));
        presets.setText(android.text.TextUtils.join(", ",values));
        LinearLayout form=new LinearLayout(this); form.setOrientation(LinearLayout.VERTICAL); form.setPadding(32,8,32,8);
        form.addView(adults); form.addView(presets);
        new AlertDialog.Builder(this).setTitle("育児記録の表示設定").setView(form)
            .setPositiveButton("保存",(dialog,which) -> {
                String raw=presets.getText().toString().trim();
                String[] parts=raw.split(","); JSONArray amounts=new JSONArray();
                if(parts.length<1||parts.length>6) { Toast.makeText(this,"候補は1〜6件です",Toast.LENGTH_SHORT).show(); return; }
                try {
                    Set<Integer> seen=new HashSet<>();
                    for(String part:parts) {
                        int amount=Integer.parseInt(part.trim());
                        if(amount<=0||amount>2000||!seen.add(amount)) throw new NumberFormatException();
                        amounts.put(amount);
                    }
                } catch(NumberFormatException error) { Toast.makeText(this,"ミルク量を確認してください",Toast.LENGTH_SHORT).show(); return; }
                int epoch=sessionEpoch; String csrf=snapshot.optString("csrf");
                network.execute(() -> {
                    try {
                        if(epoch!=sessionEpoch) return;
                        ApiClient.request("/api/family-log",new JSONObject().put("action","settings_update")
                            .put("csrf",csrf).put("show_adult_logs",adults.isChecked())
                            .put("milk_amount_presets",amounts));
                        if(epoch==sessionEpoch) runOnUiThread(this::loadFamilyLog);
                    } catch(Exception error) {
                        runOnUiThread(() -> { if(epoch==sessionEpoch) Toast.makeText(this,"表示設定を保存できませんでした",Toast.LENGTH_SHORT).show(); });
                    }
                });
            }).setNegativeButton("閉じる",null).show();
    }
    private void familyLogSubjectActions(JSONObject subject) {
        boolean linked=subject.optInt("member_id")>0;
        String[] actions=linked?new String[]{"対象を編集"}:new String[]{"対象を編集","対象を非表示"};
        new AlertDialog.Builder(this).setTitle(subject.optString("name"))
            .setItems(actions,(dialog,which) -> {
                if(which==0) renameFamilyLogSubject(subject); else disableFamilyLogSubject(subject);
            }).show();
    }
    private void renameFamilyLogSubject(JSONObject subject) {
        if(snapshot==null) return;
        EditText input=new EditText(this); input.setText(subject.optString("name")); input.setSingleLine(true);
        String[] kindCodes={"BABY","CHILD","ADULT","PET","OTHER"},kindNames={"赤ちゃん","子ども","大人","ペット","その他"};
        Spinner kind=new Spinner(this); kind.setAdapter(new ArrayAdapter<>(this,android.R.layout.simple_spinner_dropdown_item,kindNames));
        int kindIndex=java.util.Arrays.asList(kindCodes).indexOf(subject.optString("subject_kind"));
        kind.setSelection(Math.max(0,kindIndex));
        final String[] birth={subject.optString("birth_date","")};
        final Button[] birthRef=new Button[1];
        Button birthButton=button("生年月日: "+(birth[0].isEmpty()?"指定なし":birth[0]),() -> {
            LocalDate date;
            try { date=birth[0].isEmpty()?selectedDay:LocalDate.parse(birth[0]); }
            catch(Exception error) { date=selectedDay; }
            new DatePickerDialog(this,(picker,y,m,d) -> {
                birth[0]=LocalDate.of(y,m+1,d).toString(); birthRef[0].setText("生年月日: "+birth[0]);
            },date.getYear(),date.getMonthValue()-1,date.getDayOfMonth()).show();
        }); birthRef[0]=birthButton;
        CheckBox auto=new CheckBox(this); auto.setText("記録で関連タスクを完了する");
        auto.setChecked(subject.optInt("auto_complete_linked_task")==1);
        CheckBox overview=new CheckBox(this); overview.setText("家族全体の一覧に表示");
        overview.setChecked(subject.optInt("show_on_family_overview")==1);
        Set<String> selectedTypes=new HashSet<>(allowedLogTypes(subject));
        Set<String> selectedOverview=new HashSet<>();
        try {
            JSONArray saved=new JSONArray(subject.optString("overview_quick_types_json","[]"));
            for(int i=0;i<saved.length();i++) selectedOverview.add(saved.optString(i));
        } catch(Exception ignored) { }
        String[] allTypes={"MILK","BREASTFEED","MEAL","DIAPER","SLEEP","BATH","TEMPERATURE","MEDICINE","VACCINE","CONDITION","WEIGHT","HEIGHT","BLOOD_PRESSURE","EXERCISE","WATER","TOILET","WALK","MEMO"};
        ArrayList<CheckBox> enabledChecks=new ArrayList<>(),overviewChecks=new ArrayList<>();
        LinearLayout form=new LinearLayout(this); form.setOrientation(LinearLayout.VERTICAL); form.setPadding(32,8,32,8);
        form.addView(label("名前")); form.addView(input); form.addView(label("対象タイプ")); form.addView(kind);
        form.addView(birthButton); form.addView(button("生年月日を解除",() -> { birth[0]=""; birthRef[0].setText("生年月日: 指定なし"); }));
        form.addView(auto); form.addView(overview); form.addView(label("利用する記録項目 / 家族全体に表示する項目"));
        for(String type:allTypes) {
            CheckBox enabled=new CheckBox(this); enabled.setText(logTypeName(type)); enabled.setChecked(selectedTypes.contains(type));
            CheckBox quick=new CheckBox(this); quick.setText("全体に表示"); quick.setChecked(selectedOverview.contains(type));
            form.addView(enabled); form.addView(quick); enabledChecks.add(enabled); overviewChecks.add(quick);
        }
        ScrollView scroll=new ScrollView(this); scroll.addView(form);
        new AlertDialog.Builder(this).setTitle("記録対象を編集").setView(scroll)
            .setPositiveButton("保存",(dialog,which) -> {
                String name=input.getText().toString().trim();
                if(name.isEmpty()||name.length()>80) { Toast.makeText(this,"名前を80文字以内で入力してください",Toast.LENGTH_SHORT).show(); return; }
                JSONArray enabled=new JSONArray(),overviewTypes=new JSONArray();
                for(int i=0;i<allTypes.length;i++) if(enabledChecks.get(i).isChecked()) {
                    enabled.put(allTypes[i]); if(overviewChecks.get(i).isChecked()) overviewTypes.put(allTypes[i]);
                }
                if(enabled.length()==0) { Toast.makeText(this,"記録項目を1つ以上選んでください",Toast.LENGTH_SHORT).show(); return; }
                int epoch=sessionEpoch; String csrf=snapshot.optString("csrf");
                String subjectKind=kindCodes[kind.getSelectedItemPosition()],birthDate=birth[0];
                network.execute(() -> {
                    try {
                        if(epoch!=sessionEpoch) return;
                        ApiClient.request("/api/family-log",new JSONObject().put("action","subject_update")
                            .put("csrf",csrf).put("id",subject.optInt("id")).put("name",name)
                            .put("subject_kind",subjectKind).put("birth_date",birthDate)
                            .put("enabled_types",enabled).put("auto_complete_linked_task",auto.isChecked())
                            .put("show_on_family_overview",overview.isChecked())
                            .put("overview_quick_types",overviewTypes));
                        if(epoch==sessionEpoch) runOnUiThread(this::loadFamilyLog);
                    } catch(Exception error) {
                        runOnUiThread(() -> { if(epoch==sessionEpoch) Toast.makeText(this,"記録対象を更新できませんでした",Toast.LENGTH_SHORT).show(); });
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
            new AlertDialog.Builder(this).setTitle(subject.optString("name")+" の"+("BABY_FOOD".equals(detail)?"離乳食":"WET".equals(detail)?"おしっこ":"うんち"))
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
    private void showFamilyLogEditor(JSONObject existing) { showFamilyLogEditor(existing,null); }
    private void showFamilyLogEditor(JSONObject existing,JSONObject quick) {
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
        int initialSubject=ids.indexOf(existing!=null?existing.optInt("subject_id"):quick!=null?quick.optInt("subject_id"):ids.get(0));
        if(initialSubject<0 && existing==null) initialSubject=0;
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
                JSONObject preset=existing!=null?existing:quick;
                if(preset!=null && ids.get(position)==preset.optInt("subject_id")) {
                    int selected=typeCodes.indexOf(preset.optString("log_type"));
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
        } else if(quick!=null) {
            if(!quick.isNull("amount")) amount.setText(quick.optString("amount"));
            unit.setText(quick.optString("unit",""));detail.setText(quick.optString("detail_code",""));
            valueText.setText(quick.optString("value_text",""));
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
        int epoch=sessionEpoch;
        network.execute(() -> {
            try {
                JSONObject result=ApiClient.request("/api/message-chat-sync?before="+(before>0?before:9007199254740991L),null);
                if(epoch!=sessionEpoch) return;
                JSONArray page=result.optJSONArray("messages");
                Map<Integer,JSONObject> stampPage=new HashMap<>();StringBuilder idsForStamps=new StringBuilder();
                if(page!=null)for(int i=0;i<page.length();i++){JSONObject row=page.optJSONObject(i);if(row!=null&&row.optBoolean("hasStamp")){if(idsForStamps.length()>0)idsForStamps.append(",");idsForStamps.append(row.optInt("id"));}}
                if(idsForStamps.length()>0)try{
                    JSONArray stamps=ApiClient.request("/api/message-stamps?ids="+idsForStamps,null).optJSONArray("stamps");
                    if(stamps!=null)for(int i=0;i<stamps.length();i++){JSONObject stamp=stamps.optJSONObject(i);if(stamp!=null)stampPage.put(stamp.optInt("messageId"),stamp);}
                }catch(Exception ignored){/* Text remains available if stamp metadata fails. */}

                runOnUiThread(() -> {
                    if(epoch!=sessionEpoch||!tab.equals("messages")) return;
                    if(before==0){messageStamps.clear();messages=page==null?new JSONArray():page;}
                    else if(page!=null) {
                        JSONArray combined=new JSONArray();
                        for(int i=0;i<page.length();i++) combined.put(page.optJSONObject(i));
                        for(int i=0;i<messages.length();i++) combined.put(messages.optJSONObject(i));
                        messages=combined;
                    }
                    messageStamps.putAll(stampPage);
                    hasOlderMessages=result.optBoolean("hasOlder"); render();
                });
                if(page!=null&&page.length()>0&&snapshot!=null) {
                    JSONArray ids=new JSONArray();
                    for(int i=0;i<Math.min(40,page.length());i++) {
                        JSONObject row=page.optJSONObject(i);
                        if(row!=null&&row.optInt("id")>0) ids.put(row.optInt("id"));
                    }
                    if(epoch==sessionEpoch&&ids.length()>0) try {
                        ApiClient.request("/api/message-chat-sync",new JSONObject()
                            .put("csrf",snapshot.optString("csrf")).put("ids",ids));
                    } catch(Exception ignored) { /* Retry on a later read. */ }
                }
            } catch(SecurityException e) { runOnUiThread(() -> {if(epoch==sessionEpoch) {monthCache.clear(); snapshot=null; showLogin();}}); }
            catch(Exception e) { runOnUiThread(() -> {if(epoch==sessionEpoch&&tab.equals("messages")) {
                content.removeAllViews(); content.addView(label("伝言を取得できませんでした"));
            }}); }
        });
    }
    private void renderMessages() {
        content.addView(heading("家族"));
        TextView subtitle=label("家族グループ");subtitle.setTextSize(12);subtitle.setTextColor(mutedColor());content.addView(subtitle);
        content.addView(button("↻ 更新",()->loadMessages(0)));
        if(hasOlderMessages&&messages.length()>0)content.addView(button("以前の伝言",()->loadMessages(messages.optJSONObject(0).optInt("id"))));
        String previousDay="";
        for(int n=0;n<messages.length();n++) {
            JSONObject row=messages.optJSONObject(n);if(row==null)continue;
            String created=row.optString("createdAt"),day=created.length()>=10?created.substring(0,10):"";
            if(!day.equals(previousDay)){TextView date=label(day);date.setTextSize(12);date.setGravity(Gravity.CENTER);date.setTextColor(mutedColor());content.addView(date);previousDay=day;}
            boolean mine=snapshot!=null&&row.optInt("senderId")==snapshot.optInt("memberId");
            LinearLayout line=new LinearLayout(this);line.setGravity(Gravity.TOP);
            LinearLayout stack=new LinearLayout(this);stack.setOrientation(LinearLayout.VERTICAL);stack.setGravity(mine?Gravity.END:Gravity.START);
            ImageView avatar=new ImageView(this);avatar.setContentDescription(row.optString("senderName"));
            avatar.setBackground(shape(softColor(),lineColor(),100));
            String avatarUrl=row.optString("avatarUrl");
            if(!avatarUrl.isEmpty())loadInlineAvatar(avatar,avatarUrl);
            else {android.graphics.drawable.GradientDrawable circle=shape(softColor(),lineColor(),100);avatar.setImageDrawable(circle);}
            if(!mine)line.addView(avatar,new LinearLayout.LayoutParams(dp(34),dp(34)));
            TextView sender=label(row.optString("senderName"));sender.setTextSize(11);sender.setTextColor(mutedColor());sender.setPadding(dp(8),0,dp(8),dp(3));stack.addView(sender);
            LinearLayout bubble=new LinearLayout(this);bubble.setOrientation(LinearLayout.VERTICAL);bubble.setPadding(dp(12),dp(6),dp(12),dp(6));
            boolean stamp=row.optBoolean("hasStamp");
            bubble.setBackground(shape(stamp?Color.TRANSPARENT:mine?Color.parseColor(darkMode()?"#3F6D46":"#8DE055"):surfaceColor(),
                stamp||mine?Color.TRANSPARENT:lineColor(),14));
            if(!row.optString("text").isEmpty()){TextView body=label(row.optString("text"));body.setTextSize(15);body.setPadding(0,0,0,0);bubble.addView(body);}
            int id=row.optInt("id");
            if(row.optBoolean("hasImage")&&id>0) {
                ImageView photo=new ImageView(this);photo.setScaleType(ImageView.ScaleType.FIT_CENTER);photo.setAdjustViewBounds(true);
                photo.setContentDescription("伝言の写真。タップで拡大");bubble.addView(photo,new LinearLayout.LayoutParams(dp(190),dp(150)));
                loadInlineMedia(photo,"/api/messages?photo="+id);photo.setOnClickListener(v->showMessagePhoto(id));
                if(ApiClient.canMutate())photo.setOnLongClickListener(v->{messageActions(row);return true;});
            }
            if(stamp&&id>0) {
                ImageView image=new ImageView(this);image.setScaleType(ImageView.ScaleType.FIT_CENTER);image.setContentDescription("スタンプ。タップで表示・再生");
                bubble.addView(image,new LinearLayout.LayoutParams(dp(160),dp(160)));
                JSONObject meta=messageStamps.get(id);
                if(meta!=null)loadInlineMedia(image,meta.optString("thumbnailUrl",meta.optString("fullUrl")));
                image.setOnClickListener(v->showMessageStamp(id));
                if(ApiClient.canMutate())image.setOnLongClickListener(v->{messageActions(row);return true;});
            }
            if(ApiClient.canMutate())bubble.setOnLongClickListener(v->{messageActions(row);return true;});
            stack.addView(bubble);
            String when=created.length()>=16?created.substring(11,16):created;
            TextView info=label(when+(mine?" ・ "+(row.optInt("readCount")>0?"既読"+row.optInt("readCount"):"未読"):""));
            info.setTextSize(10);info.setTextColor(mutedColor());info.setPadding(dp(4),dp(3),dp(4),0);stack.addView(info);
            line.addView(stack,new LinearLayout.LayoutParams(0,-2,1));
            if(mine)line.addView(avatar,new LinearLayout.LayoutParams(dp(34),dp(34)));
            LinearLayout.LayoutParams lp=new LinearLayout.LayoutParams(-1,-2);lp.setMargins(0,0,0,dp(14));content.addView(line,lp);
        }
        if(messages.length()==0)content.addView(label("まだメッセージはありません"));
    }
    private void loadInlineMedia(ImageView view,String path) {
        if(path.isEmpty())return;
        int epoch=sessionEpoch,generation=stampGeneration;
        Bitmap cached=stampImages.get(path);if(cached!=null){view.setImageBitmap(cached);return;}
        stampMedia.execute(()->{
            try {
                if(epoch!=sessionEpoch||generation!=stampGeneration)return;
                Bitmap image=ApiClient.thumbnail(path);
                runOnUiThread(()->{if(epoch!=sessionEpoch||generation!=stampGeneration)return;
                    stampImages.put(path,image);if(view.isAttachedToWindow())view.setImageBitmap(image);
                });
            }catch(Exception ignored){runOnUiThread(()->{if(epoch==sessionEpoch)view.setContentDescription(view.getContentDescription()+"。画像を取得できませんでした");});}
        });
    }
    private void loadInlineAvatar(ImageView view,String url) {
        int epoch=sessionEpoch;Bitmap cached=stampImages.get(url);if(cached!=null){view.setImageBitmap(cached);return;}
        stampMedia.execute(()->{
            try{Bitmap avatar=ApiClient.avatar(url);runOnUiThread(()->{if(epoch==sessionEpoch){stampImages.put(url,avatar);if(view.isAttachedToWindow())view.setImageBitmap(avatar);}});}
            catch(Exception ignored){/* Keep the neutral avatar when LINE media is unavailable. */}
        });
    }
    private LinearLayout messageComposer() {
        LinearLayout composer=new LinearLayout(this);composer.setGravity(Gravity.CENTER_VERTICAL);composer.setPadding(dp(6),dp(4),dp(6),dp(4));
        if(messageDraftEpoch!=sessionEpoch){messageDraftEpoch=sessionEpoch;messageDraft="";inlineMessageSending=false;}
        composer.addView(button("＋",this::messageComposerActions),new LinearLayout.LayoutParams(dp(44),dp(48)));
        EditText input=new EditText(this);input.setText(messageDraft);input.setHint("メッセージ");input.setTextColor(textColor());input.setHintTextColor(mutedColor());
        input.setMaxLines(3);input.setTextSize(15);input.setBackground(shape(pageColor(),lineColor(),22));input.setPadding(dp(12),dp(8),dp(12),dp(8));
        input.setFilters(new android.text.InputFilter[]{new android.text.InputFilter.LengthFilter(5000)});
        input.addTextChangedListener(new android.text.TextWatcher(){
            public void beforeTextChanged(CharSequence x,int start,int count,int after){}
            public void onTextChanged(CharSequence x,int start,int before,int count){messageDraft=x.toString();}
            public void afterTextChanged(android.text.Editable x){}
        });
        composer.addView(input,new LinearLayout.LayoutParams(0,-2,1));
        Button send=button("➤",()->sendInlineMessage(input));send.setContentDescription("メッセージを送信");styleButton(send,true);
        composer.addView(send,new LinearLayout.LayoutParams(dp(44),dp(48)));
        input.setEnabled(ApiClient.canMutate()&&!inlineMessageSending);send.setEnabled(ApiClient.canMutate()&&!inlineMessageSending);
        return composer;
    }
    private void updateMessageComposerReadiness() {
        if(pageDock==null||pageDock.getChildCount()==0)return;
        LinearLayout composer=(LinearLayout)pageDock.getChildAt(0);
        for(int i=0;i<composer.getChildCount();i++)composer.getChildAt(i).setEnabled(ApiClient.canMutate()&&!inlineMessageSending);
    }
    private void messageComposerActions() {
        ArrayList<String> names=new ArrayList<>();ArrayList<Runnable> actions=new ArrayList<>();
        if(ApiClient.canMutate()){
            names.add("スタンプ");actions.add(this::chooseMessageStamp);
            names.add("写真");actions.add(this::chooseMessagePhoto);
            names.add("宛先・送信予約");actions.add(this::addMessage);
            if(snapshot!=null&&snapshot.optBoolean("canManageStamps")){names.add("リアクション設定");actions.add(this::editMessageReactions);}
            if(pendingPhoto!=null){names.add("写真送信を再試行");actions.add(this::retryMessagePhoto);}
        }
        names.add("Web版の伝言");actions.add(()->showWebPage("/app/messages.php"));
        new AlertDialog.Builder(this).setTitle("伝言").setItems(names.toArray(new String[0]),(d,w)->actions.get(w).run()).show();
    }
    private void sendInlineMessage(EditText input) {
        String text=input.getText().toString().trim();
        if(text.isEmpty()||inlineMessageSending||snapshot==null||!ApiClient.canMutate())return;
        int epoch=sessionEpoch;String csrf=snapshot.optString("csrf");inlineMessageSending=true;updateMessageComposerReadiness();
        network.execute(()->{
            try {
                if(epoch!=sessionEpoch)return;
                JSONObject saved=ApiClient.request("/api/messages",new JSONObject().put("csrf",csrf).put("text",text).put("target_member_id",0).put("reminder_at",""));
                notifyMessageImmediately(saved.optInt("id"),csrf);
                runOnUiThread(()->{if(epoch!=sessionEpoch)return;inlineMessageSending=false;messageDraft="";input.setText("");updateMessageComposerReadiness();loadMessages(0);});
            }catch(Exception error){runOnUiThread(()->{if(epoch!=sessionEpoch)return;inlineMessageSending=false;updateMessageComposerReadiness();
                Toast.makeText(this,"送信を確認できませんでした。更新して確認してください。入力内容は保持しています",Toast.LENGTH_LONG).show();
            });}
        });
    }
    private void messageActions(JSONObject row) {
        int id=row.optInt("id");if(id<=0||snapshot==null) return;
        boolean canManage=row.optInt("senderId")==snapshot.optInt("memberId")||snapshot.optBoolean("canManageStamps");
        ArrayList<String> actions=new ArrayList<>();actions.add("リアクション");
        if(row.optInt("convertedShoppingId")==0) actions.add("買い物に追加");
        if(row.optInt("convertedTaskId")==0) actions.add("タスク・イベントに追加");
        if(canManage) {actions.add("編集");actions.add("削除");}
        new AlertDialog.Builder(this).setTitle("伝言の操作")
            .setItems(actions.toArray(new String[0]),(dialog,which) -> {
                String action=actions.get(which);
                if(action.equals("リアクション")) showMessageReactions(id);
                else if(action.equals("買い物に追加")) convertMessageShopping(row);
                else if(action.equals("タスク・イベントに追加")) convertMessageTask(row);
                else if(action.equals("編集")) editMessage(row);
                else deleteMessage(row);
            }).show();
    }
    private void convertMessageShopping(JSONObject row) {
        if(snapshot==null) return;
        EditText name=new EditText(this);name.setHint("商品名");name.setText(row.optString("text"));
        EditText quantity=new EditText(this);quantity.setHint("数量");quantity.setText("1");
        EditText category=new EditText(this);category.setHint("カテゴリ（任意）");
        final String[] due={""};final Button[] dueRef=new Button[1];
        Button date=button("期限: 指定なし",() -> {
            LocalDate current=due[0].isEmpty()?selectedDay:LocalDate.parse(due[0]);
            new DatePickerDialog(this,(picker,y,m,d) -> {
                due[0]=LocalDate.of(y,m+1,d).toString();dueRef[0].setText("期限: "+due[0]);
            },current.getYear(),current.getMonthValue()-1,current.getDayOfMonth()).show();
        });dueRef[0]=date;
        LinearLayout form=new LinearLayout(this);form.setOrientation(LinearLayout.VERTICAL);form.setPadding(32,8,32,8);
        form.addView(name);form.addView(quantity);form.addView(category);form.addView(date);
        form.addView(button("期限を解除",() -> {due[0]="";dueRef[0].setText("期限: 指定なし");}));
        new AlertDialog.Builder(this).setTitle("買い物に追加").setView(form)
            .setPositiveButton("追加",(dialog,which) -> {
                String value=name.getText().toString().trim();
                if(value.isEmpty()||value.length()>255) {Toast.makeText(this,"商品名を確認してください",Toast.LENGTH_SHORT).show();return;}
                String count=quantity.getText().toString().trim(),group=category.getText().toString().trim(),deadline=due[0];
                int epoch=sessionEpoch;String csrf=snapshot.optString("csrf");
                network.execute(() -> {
                    try {
                        if(epoch!=sessionEpoch) return;
                        JSONObject result=ApiClient.request("/api/messages",new JSONObject().put("csrf",csrf)
                            .put("action","convert_shopping").put("id",row.optInt("id"))
                            .put("name",value).put("quantity",count)
                            .put("category",group).put("due_date",deadline)
                            .put("message_updated_at",row.optString("updatedAt"))
                            .put("message_original_text",row.optString("text").trim()));
                        runOnUiThread(() -> {if(epoch==sessionEpoch) {
                            Toast.makeText(this,result.optBoolean("already")?"追加済みです":"買い物に追加しました",Toast.LENGTH_SHORT).show();
                            load();loadMessages(0);
                        }});
                    } catch(Exception error) {runOnUiThread(() -> {if(epoch==sessionEpoch) Toast.makeText(this,"買い物に追加できませんでした。伝言を更新して確認してください",Toast.LENGTH_LONG).show();});}
                });
            }).setNegativeButton("閉じる",null).show();
    }
    private void convertMessageTask(JSONObject row) {
        if(snapshot==null) return;
        EditText title=new EditText(this);title.setHint("タスク名");title.setText(row.optString("text"));
        EditText description=new EditText(this);description.setHint("説明");description.setText(row.optString("text"));
        CheckBox noDate=new CheckBox(this);noDate.setText("日付なし");noDate.setChecked(true);
        CheckBox isEvent=new CheckBox(this);isEvent.setText("イベントとして追加");
        final String[] day={selectedDay.toString()};final Button[] dayRef=new Button[1];
        Button date=button("日付: "+day[0],() -> {
            LocalDate current=LocalDate.parse(day[0]);
            new DatePickerDialog(this,(picker,y,m,d) -> {
                day[0]=LocalDate.of(y,m+1,d).toString();dayRef[0].setText("日付: "+day[0]);noDate.setChecked(false);
            },current.getYear(),current.getMonthValue()-1,current.getDayOfMonth()).show();
        });dayRef[0]=date;
        isEvent.setOnCheckedChangeListener((button,checked) -> {if(checked) noDate.setChecked(false);});
        LinearLayout form=new LinearLayout(this);form.setOrientation(LinearLayout.VERTICAL);form.setPadding(32,8,32,8);
        form.addView(title);form.addView(description);form.addView(isEvent);form.addView(noDate);form.addView(date);
        new AlertDialog.Builder(this).setTitle("タスク・イベントに追加").setView(form)
            .setPositiveButton("追加",(dialog,which) -> {
                String value=title.getText().toString().trim();
                if(value.isEmpty()||value.length()>255) {Toast.makeText(this,"タイトルを確認してください",Toast.LENGTH_SHORT).show();return;}
                int epoch=sessionEpoch;String csrf=snapshot.optString("csrf");boolean event=isEvent.isChecked(),undated=noDate.isChecked()&&!event;
                String details=description.getText().toString().trim(),chosenDay=day[0];
                network.execute(() -> {
                    try {
                        if(epoch!=sessionEpoch) return;
                        JSONObject result=ApiClient.request("/api/messages",new JSONObject().put("csrf",csrf)
                            .put("action","convert_task").put("id",row.optInt("id")).put("mode","new")
                            .put("title",value).put("description",details)
                            .put("date",undated?"":chosenDay).put("end_date",undated?"":chosenDay)
                            .put("no_date",undated).put("is_event",event).put("all_day",true)
                            .put("message_updated_at",row.optString("updatedAt"))
                            .put("message_original_text",row.optString("text").trim()));
                        runOnUiThread(() -> {if(epoch==sessionEpoch) {
                            Toast.makeText(this,result.optBoolean("already")?"追加済みです":"タスクに追加しました",Toast.LENGTH_SHORT).show();
                            load();loadMessages(0);
                        }});
                    } catch(Exception error) {runOnUiThread(() -> {if(epoch==sessionEpoch) Toast.makeText(this,"タスクに追加できませんでした。伝言を更新して確認してください",Toast.LENGTH_LONG).show();});}
                });
            }).setNegativeButton("閉じる",null).show();
    }
    private void editMessage(JSONObject row) {
        if(snapshot==null||row.optInt("id")<=0) return;
        EditText body=new EditText(this);body.setText(row.optString("text"));body.setMinLines(2);
        ArrayList<String> recipients=new ArrayList<>();recipients.add("家族全員");
        ArrayList<Integer> ids=new ArrayList<>();ids.add(0);
        JSONArray members=snapshot.optJSONArray("members");
        if(members!=null) for(int i=0;i<members.length();i++) {
            JSONObject member=members.optJSONObject(i);
            if(member!=null&&member.optInt("id")>0) {
                recipients.add(member.optString("name","メンバー"));ids.add(member.optInt("id"));
            }
        }
        Spinner recipient=new Spinner(this);recipient.setAdapter(new ArrayAdapter<>(this,android.R.layout.simple_spinner_dropdown_item,recipients));
        recipient.setSelection(Math.max(0,ids.indexOf(row.optInt("targetMemberId"))));
        String saved=row.optString("reminderAt");
        final String[] reminder={saved.length()>=16?saved.substring(0,16).replace(' ','T'):""};
        final Button[] whenRef=new Button[1];
        Button when=button("通知予約: "+(reminder[0].isEmpty()?"指定なし":reminder[0]),() -> {
            java.time.LocalDateTime base=java.time.LocalDateTime.now(java.time.ZoneId.of("Asia/Tokyo")).plusHours(1);
            new DatePickerDialog(this,(picker,y,m,d) ->
                new TimePickerDialog(this,(clock,h,minute) -> {
                    reminder[0]=String.format(java.util.Locale.ROOT,"%04d-%02d-%02dT%02d:%02d",y,m+1,d,h,minute);
                    whenRef[0].setText("通知予約: "+reminder[0]);
                },base.getHour(),base.getMinute(),true).show(),
                base.getYear(),base.getMonthValue()-1,base.getDayOfMonth()).show();
        });whenRef[0]=when;
        LinearLayout form=new LinearLayout(this);form.setOrientation(LinearLayout.VERTICAL);form.setPadding(32,8,32,8);
        form.addView(label("宛先"));form.addView(recipient);form.addView(body);form.addView(when);
        form.addView(button("通知予約を解除",() -> {reminder[0]="";whenRef[0].setText("通知予約: 指定なし");}));
        new AlertDialog.Builder(this).setTitle("伝言を編集").setView(form)
            .setPositiveButton("保存",(dialog,which) -> {
                String text=body.getText().toString().trim();
                if(text.isEmpty()||!reminder[0].isEmpty()&&
                    reminder[0].compareTo(java.time.LocalDateTime.now(java.time.ZoneId.of("Asia/Tokyo"))
                        .format(java.time.format.DateTimeFormatter.ofPattern("yyyy-MM-dd'T'HH:mm")))<=0) {
                    Toast.makeText(this,"本文・通知予約を確認してください",Toast.LENGTH_LONG).show();return;
                }
                int epoch=sessionEpoch,id=row.optInt("id"),target=ids.get(recipient.getSelectedItemPosition());
                String csrf=snapshot.optString("csrf"),notifyAt=reminder[0];
                network.execute(() -> {
                    try {
                        if(epoch!=sessionEpoch) return;
                        ApiClient.request("/api/messages",new JSONObject().put("csrf",csrf).put("action","edit")
                            .put("id",id).put("text",text).put("target_member_id",target).put("reminder_at",notifyAt));
                        if(epoch==sessionEpoch) runOnUiThread(() -> loadMessages(0));
                    } catch(Exception error) {runOnUiThread(() -> {if(epoch==sessionEpoch) Toast.makeText(this,"伝言を編集できませんでした",Toast.LENGTH_LONG).show();});}
                });
            }).setNegativeButton("閉じる",null).show();
    }
    private void deleteMessage(JSONObject row) {
        int id=row.optInt("id");if(snapshot==null||id<=0) return;
        new AlertDialog.Builder(this).setTitle("伝言を削除").setMessage(row.optString("text"))
            .setPositiveButton("削除",(dialog,which) -> {
                int epoch=sessionEpoch;String csrf=snapshot.optString("csrf");
                network.execute(() -> {
                    try {
                        if(epoch!=sessionEpoch) return;
                        ApiClient.request("/api/messages",new JSONObject().put("csrf",csrf).put("action","delete").put("id",id));
                        if(epoch==sessionEpoch) runOnUiThread(() -> loadMessages(0));
                    } catch(Exception error) {runOnUiThread(() -> {if(epoch==sessionEpoch) Toast.makeText(this,"伝言を削除できませんでした",Toast.LENGTH_LONG).show();});}
                });
            }).setNegativeButton("戻る",null).show();
    }
    private void showMessageReactions(int messageId) {
        if(messageId<=0||snapshot==null) return;
        int epoch=sessionEpoch;
        network.execute(() -> {
            try {
                JSONObject response=ApiClient.request("/api/message-reactions?ids="+messageId,null);
                JSONArray emojis=response.optJSONArray("emojis"),reactions=response.optJSONArray("reactions");
                if(emojis==null) return;
                runOnUiThread(() -> {
                    if(epoch!=sessionEpoch) return;
                    ArrayList<String> names=new ArrayList<>();ArrayList<String> codes=new ArrayList<>();
                    for(int i=0;i<emojis.length();i++) {
                        String emoji=emojis.optString(i);if(emoji.isEmpty()) continue;
                        int count=0;boolean mine=false;
                        if(reactions!=null) for(int n=0;n<reactions.length();n++) {
                            JSONObject row=reactions.optJSONObject(n);
                            if(row!=null&&row.optInt("messageId")==messageId&&emoji.equals(row.optString("emoji"))) {
                                count=row.optInt("count");mine=row.optBoolean("mine");break;
                            }
                        }
                        codes.add(emoji);names.add(emoji+(count>0?" "+count:"")+(mine?" ✓":""));
                    }
                    new AlertDialog.Builder(this).setTitle("リアクション")
                        .setItems(names.toArray(new String[0]),(dialog,which) -> {
                            String csrf=snapshot.optString("csrf");
                            network.execute(() -> {
                                try {
                                    if(epoch!=sessionEpoch) return;
                                    ApiClient.request("/api/message-reactions",new JSONObject().put("csrf",csrf)
                                        .put("messageId",messageId).put("emoji",codes.get(which)));
                                    if(epoch==sessionEpoch) runOnUiThread(() -> showMessageReactions(messageId));
                                } catch(Exception error) {runOnUiThread(() -> {if(epoch==sessionEpoch) Toast.makeText(this,"リアクションを更新できませんでした",Toast.LENGTH_SHORT).show();});}
                            });
                        }).setNegativeButton("閉じる",null).show();
                });
            } catch(Exception error) {runOnUiThread(() -> {if(epoch==sessionEpoch) Toast.makeText(this,"リアクションを読み込めませんでした",Toast.LENGTH_SHORT).show();});}
        });
    }
    private void editMessageReactions() {
        if(snapshot==null||!snapshot.optBoolean("canManageStamps")) return;
        int epoch=sessionEpoch;
        network.execute(() -> {
            try {
                JSONArray emojis=ApiClient.request("/api/message-reactions",null).optJSONArray("emojis");
                if(emojis==null) return;
                runOnUiThread(() -> {
                    if(epoch!=sessionEpoch) return;
                    ArrayList<String> values=new ArrayList<>();for(int i=0;i<emojis.length();i++) values.add(emojis.optString(i));
                    EditText input=new EditText(this);input.setText(android.text.TextUtils.join("、",values));
                    input.setHint("❤️、😆、👏");
                    new AlertDialog.Builder(this).setTitle("家族のリアクション候補").setView(input)
                        .setPositiveButton("保存",(dialog,which) -> {
                            String[] parts=input.getText().toString().split("[、,]");
                            JSONArray updated=new JSONArray();HashSet<String> seen=new HashSet<>();
                            for(String part:parts) {
                                String code=part.trim();
                                if(code.isEmpty()||code.codePointCount(0,code.length())>32||!seen.add(code)) {
                                    Toast.makeText(this,"候補を確認してください",Toast.LENGTH_LONG).show();return;
                                }
                                updated.put(code);
                            }
                            if(updated.length()<1||updated.length()>20) {
                                Toast.makeText(this,"候補は1〜20個にしてください",Toast.LENGTH_LONG).show();return;
                            }
                            String csrf=snapshot.optString("csrf");
                            network.execute(() -> {
                                try {
                                    if(epoch!=sessionEpoch) return;
                                    ApiClient.request("/api/message-reactions",new JSONObject().put("csrf",csrf).put("emojis",updated),"PUT");
                                    runOnUiThread(() -> {if(epoch==sessionEpoch) Toast.makeText(this,"リアクション候補を保存しました",Toast.LENGTH_SHORT).show();});
                                } catch(Exception error) {runOnUiThread(() -> {if(epoch==sessionEpoch) Toast.makeText(this,"候補を保存できませんでした",Toast.LENGTH_SHORT).show();});}
                            });
                        }).setNegativeButton("閉じる",null).show();
                });
            } catch(Exception error) {runOnUiThread(() -> {if(epoch==sessionEpoch) Toast.makeText(this,"候補を読み込めませんでした",Toast.LENGTH_SHORT).show();});}
        });
    }
    private void showMessageStamp(int messageId) {
        int epoch=sessionEpoch;
        network.execute(() -> {
            try {
                JSONObject response=ApiClient.request("/api/message-stamps?ids="+messageId,null);
                JSONArray stamps=response.optJSONArray("stamps");
                JSONObject stamp=stamps==null?null:stamps.optJSONObject(0);
                if(stamp==null||stamp.optInt("messageId")!=messageId) throw new IllegalStateException("Unavailable");
                runOnUiThread(() -> {
                    if(epoch!=sessionEpoch||!tab.equals("messages")) return;
                    if("ANIMATED".equals(stamp.optString("kind"))) {showStampAnimation(stamp);return;}
                    String path=stamp.optString("fullUrl");
                    stampMedia.execute(() -> {
                        try {
                            Bitmap image=SnapshotCache.readStamp(this,path);
                            if(image==null) {
                                image=ApiClient.thumbnail(path);
                                if(epoch==sessionEpoch) SnapshotCache.writeStamp(this,path,image);
                            }
                            Bitmap ready=image;
                            runOnUiThread(() -> {
                                if(epoch!=sessionEpoch||!tab.equals("messages")) return;
                                ImageView view=new ImageView(this);view.setImageBitmap(ready);view.setAdjustViewBounds(true);
                                view.setContentDescription("伝言のスタンプ");
                                new AlertDialog.Builder(this).setTitle("伝言のスタンプ").setView(view)
                                    .setPositiveButton("閉じる",null).show();
                            });
                        } catch(Exception error) {runOnUiThread(() -> {if(epoch==sessionEpoch) Toast.makeText(this,"スタンプを表示できませんでした",Toast.LENGTH_SHORT).show();});}
                    });
                });
            } catch(Exception error) {runOnUiThread(() -> {if(epoch==sessionEpoch) Toast.makeText(this,"スタンプを取得できませんでした",Toast.LENGTH_SHORT).show();});}
        });
    }
    private void chooseMessageStamp() {
        if(snapshot==null) {load();return;}
        int epoch=sessionEpoch;
        network.execute(() -> {
            try {
                JSONArray options=ApiClient.request("/api/calendar-stamp-options",null).optJSONArray("options");
                runOnUiThread(() -> {
                    if(epoch!=sessionEpoch||options==null) return;
                    if(options.length()==0) {Toast.makeText(this,"使えるスタンプがありません",Toast.LENGTH_SHORT).show();return;}
                    ArrayList<String> names=new ArrayList<>();
                    for(int i=0;i<options.length();i++) {
                        JSONObject option=options.optJSONObject(i);names.add(option==null?"スタンプ":option.optString("name","スタンプ"));
                    }
                    new AlertDialog.Builder(this).setTitle("送るスタンプ")
                        .setItems(names.toArray(new String[0]),(dialog,which) -> {
                            JSONObject selected=options.optJSONObject(which);
                            if(selected!=null&&selected.optInt("id")>0) composeMessageStamp(selected);
                        }).setNegativeButton("閉じる",null).show();
                });
            } catch(Exception error) {runOnUiThread(() -> {if(epoch==sessionEpoch) Toast.makeText(this,"スタンプ一覧を取得できませんでした",Toast.LENGTH_SHORT).show();});}
        });
    }
    private void composeMessageStamp(JSONObject stamp) {
        if(snapshot==null) return;
        ArrayList<String> recipients=new ArrayList<>();recipients.add("家族全員");
        ArrayList<Integer> recipientIds=new ArrayList<>();recipientIds.add(0);
        JSONArray members=snapshot.optJSONArray("members");
        if(members!=null) for(int i=0;i<members.length();i++) {
            JSONObject member=members.optJSONObject(i);
            if(member!=null&&member.optInt("id")>0) {
                recipients.add(member.optString("name","メンバー"));recipientIds.add(member.optInt("id"));
            }
        }
        Spinner recipient=new Spinner(this);recipient.setAdapter(new ArrayAdapter<>(this,android.R.layout.simple_spinner_dropdown_item,recipients));
        EditText caption=new EditText(this);caption.setHint("ひとこと（任意）");
        final String[] reminder={""};final Button[] whenRef=new Button[1];
        Button when=button("通知予約: 指定なし",() -> {
            java.time.LocalDateTime base=java.time.LocalDateTime.now(java.time.ZoneId.of("Asia/Tokyo")).plusHours(1);
            new DatePickerDialog(this,(picker,y,m,d) ->
                new TimePickerDialog(this,(clock,h,minute) -> {
                    reminder[0]=String.format(java.util.Locale.ROOT,"%04d-%02d-%02dT%02d:%02d",y,m+1,d,h,minute);
                    whenRef[0].setText("通知予約: "+reminder[0]);
                },base.getHour(),base.getMinute(),true).show(),
                base.getYear(),base.getMonthValue()-1,base.getDayOfMonth()).show();
        });whenRef[0]=when;
        LinearLayout form=new LinearLayout(this);form.setOrientation(LinearLayout.VERTICAL);form.setPadding(32,8,32,8);
        form.addView(label(stamp.optString("name","スタンプ")));form.addView(label("宛先"));form.addView(recipient);
        form.addView(caption);form.addView(when);
        form.addView(button("通知予約を解除",() -> {reminder[0]="";whenRef[0].setText("通知予約: 指定なし");}));
        new AlertDialog.Builder(this).setTitle("スタンプを送る").setView(form)
            .setPositiveButton("送る",(dialog,which) -> {
                String text=caption.getText().toString().trim();
                if(text.codePointCount(0,text.length())>5000||!reminder[0].isEmpty()&&
                    reminder[0].compareTo(java.time.LocalDateTime.now(java.time.ZoneId.of("Asia/Tokyo"))
                        .format(java.time.format.DateTimeFormatter.ofPattern("yyyy-MM-dd'T'HH:mm")))<=0) {
                    Toast.makeText(this,"本文・通知予約を確認してください",Toast.LENGTH_LONG).show();return;
                }
                int epoch=sessionEpoch,recipientId=recipientIds.get(recipient.getSelectedItemPosition());
                String csrf=snapshot.optString("csrf"),notifyAt=reminder[0];
                network.execute(() -> {
                    try {
                        if(epoch!=sessionEpoch) return;
                        JSONObject saved=ApiClient.request("/api/message-stamps",new JSONObject()
                            .put("csrf",csrf).put("assetId",stamp.optInt("id")).put("target_member_id",recipientId)
                            .put("text",text).put("reminder_at",notifyAt));
                        if(notifyAt.isEmpty()) notifyMessageImmediately(saved.optInt("id"),csrf);
                        if(epoch==sessionEpoch) runOnUiThread(() -> {load();loadMessages(0);});
                    } catch(Exception error) {runOnUiThread(() -> {if(epoch==sessionEpoch) Toast.makeText(this,"スタンプを送れませんでした。伝言一覧を更新して確認してください",Toast.LENGTH_LONG).show();});}
                });
            }).setNegativeButton("閉じる",null).show();
    }
    private void notifyMessageImmediately(int id,String csrf) {
        if(id<=0) return;
        try {ApiClient.request("/api/message-immediate-notify",new JSONObject().put("csrf",csrf).put("message_id",id));}
        catch(Exception ignored) { /* The message is saved; notification retry must not send it twice. */ }
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
        if((requestCode!=41 && requestCode!=42 && requestCode!=43 && requestCode!=44) || resultCode!=RESULT_OK || data==null) return;
        if(requestCode==44) {uploadAnimatedStamp(data,sessionEpoch);return;}
        if(data.getData()==null) return;
        android.net.Uri uri=data.getData(); int epoch=sessionEpoch,pickedLogId=pendingFamilyLogPhotoId;
        if(requestCode==43) {
            String name=pendingStampName,csrf=snapshot==null?"":snapshot.optString("csrf");
            if(name.isEmpty()||csrf.isEmpty()) return;
            Toast.makeText(this,"スタンプ画像を準備しています",Toast.LENGTH_SHORT).show();
            network.execute(() -> {
                try {
                    MessagePhotoUpload.PngDraft png=MessagePhotoUpload.prepareStamp(this,uri);
                    if(epoch!=sessionEpoch) return;
                    ApiClient.uploadStaticStamp(png,name,csrf);
                    runOnUiThread(() -> { if(epoch==sessionEpoch) { pendingStampName=""; load();
                        Toast.makeText(this,"スタンプを登録しました",Toast.LENGTH_SHORT).show(); } });
                } catch(Exception error) {
                    runOnUiThread(() -> { if(epoch==sessionEpoch) Toast.makeText(this,"スタンプを登録できませんでした",Toast.LENGTH_LONG).show(); });
                }
            });
            return;
        }
        Toast.makeText(this,"写真を準備しています",Toast.LENGTH_SHORT).show();
        network.execute(() -> {
            try {
                MessagePhotoUpload.Draft draft=MessagePhotoUpload.prepare(this,uri);
                runOnUiThread(() -> {
                    if(epoch!=sessionEpoch) return;
                    if(requestCode==42) {
                        if(pickedLogId!=pendingFamilyLogPhotoId) return;
                        pendingFamilyLogPhoto=draft; sendFamilyLogPhoto(); return;
                    }
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
                        JSONObject saved=ApiClient.request("/api/messages",new JSONObject().put("csrf",csrf).put("text",body)
                            .put("target_member_id",recipientId).put("reminder_at",notifyAt));
                        if(notifyAt.isEmpty()) notifyMessageImmediately(saved.optInt("id"),csrf);
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
                String saved=Credentials.read(this);
                String publicId=saved==null?null:saved.split(":",2)[0];
                String csrf=snapshot==null?null:snapshot.optString("csrf");
                sessionEpoch++;
                stampGeneration++;
                ApiClient.setMutationsEnabled(false);
                stopService(new Intent(this,LocationService.class)); Credentials.clear(this);
                SnapshotCache.clear(this);
                stampMedia.execute(() -> SnapshotCache.clear(this));
                monthCache.clear(); snapshot=null; messages=new JSONArray(); familyLog=null; familyLogCached=false; shoppingCategories=null; itemCategories=null;
                pendingPhoto=null; photoSending=false; pendingPhotoCaption=""; pendingPhotoReminder="";
                pendingFamilyLogPhoto=null; pendingFamilyLogPhotoId=0; familyPhotoSending=false;
                pendingStampName="";
                pendingAnimatedStampName="";
                stampMonths.clear(); stampImages.evictAll(); pendingStampImages.clear(); scheduledFramePaths.clear(); scheduledAnimationPaths.clear();
                TextView progress=new TextView(this); progress.setText("ログアウト中…"); progress.setPadding(36,36,36,36);
                setContentView(progress);
                network.execute(() -> {
                    boolean serverStopped=true;
                    if(publicId!=null&&csrf!=null) {
                        try {disableServerLocationSharing(publicId,csrf);} catch(Exception error) {serverStopped=false;}
                    }
                    boolean synced=serverStopped;
                    runOnUiThread(() -> {
                        android.webkit.CookieManager.getInstance().removeAllCookies(value -> runOnUiThread(() -> {
                            android.webkit.CookieManager.getInstance().flush();
                            showLogin();
                            if(!synced) Toast.makeText(this,"この端末の送信は停止しました。Web側の位置共有状態を確認してください",Toast.LENGTH_LONG).show();
                        }));
                    });
                });
            }).setNegativeButton("閉じる",null).show();
    }
    private void showLogin() {
        ApiClient.setMutationsEnabled(false);
        if (login != null) return;
        sessionEpoch++;
        stampGeneration++;
        memorySessionBinding=null;
        SnapshotCache.clear(this);
        stampMedia.execute(() -> SnapshotCache.clear(this));
        monthCache.clear(); snapshot=null; familyLog=null; familyLogCached=false; shoppingCategories=null; itemCategories=null;
        pendingPhoto=null; photoSending=false; pendingPhotoCaption=""; pendingPhotoReminder="";
        pendingFamilyLogPhoto=null; pendingFamilyLogPhotoId=0; familyPhotoSending=false;
        pendingStampName="";
        pendingAnimatedStampName="";
        stampMonths.clear(); stampImages.evictAll(); pendingStampImages.clear(); scheduledFramePaths.clear(); scheduledAnimationPaths.clear();
        login = new WebView(this); login.getSettings().setJavaScriptEnabled(true); login.getSettings().setDomStorageEnabled(true);
        LinearLayout frame=new LinearLayout(this); frame.setOrientation(LinearLayout.VERTICAL);
        frame.addView(button("ログイン後、ネイティブ画面に戻る", () -> { showNative(); load(); }));
        frame.addView(login,new LinearLayout.LayoutParams(-1,0,1));
        applySystemBarInsets(frame); setContentView(frame);
        login.setWebViewClient(new WebViewClient() {
            @Override public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                android.net.Uri destination=request.getUrl(),origin=android.net.Uri.parse(ApiClient.ORIGIN);
                String host=destination.getHost();
                if ("https".equals(destination.getScheme()) &&
                    (origin.getHost().equals(host) && origin.getPort()==destination.getPort() ||
                        "access.line.me".equals(host))) return false;
                startActivity(new Intent(Intent.ACTION_VIEW,request.getUrl())); return true;
            }
            @Override public void onPageFinished(WebView view,String url) {
                android.net.Uri page=android.net.Uri.parse(url);
                android.net.Uri origin=android.net.Uri.parse(ApiClient.ORIGIN);
                if(!"https".equals(page.getScheme()) || !origin.getHost().equals(page.getHost()) ||
                    origin.getPort()!=page.getPort() || page.getPath()==null || !page.getPath().startsWith("/app/")) return;
                view.post(() -> {
                    if(login!=view) return;
                    android.webkit.CookieManager.getInstance().flush();
                    showNative();load();
                });
            }
        });
        login.loadUrl(ApiClient.ORIGIN+"/login.php");
    }
    private void showSettings() {
        if(!ApiClient.canMutate()) {
            new AlertDialog.Builder(this).setTitle("位置共有")
                .setMessage("保存済みデータの表示中です。共有の開始・登録はオンラインで再読み込みした後に行ってください。共有の停止は今すぐできます。")
                .setPositiveButton("共有を停止",(d,w) -> stopLocationSharing())
                .setNegativeButton("閉じる",null).show();
            return;
        }
        LinearLayout box = new LinearLayout(this); box.setOrientation(LinearLayout.VERTICAL); box.setPadding(36,16,36,0);
        EditText id=new EditText(this); id.setHint("端末ID（loc_...）"); id.setSingleLine(true);
        EditText secret=new EditText(this); secret.setHint("Secret（64文字）"); secret.setSingleLine(true);
        box.addView(id); box.addView(secret);
        box.addView(button("このAndroidを新規登録して共有開始",this::provisionThisAndroid));
        box.addView(button("保存済み端末の共有を再開",this::resumeLocationSharing));
        box.addView(button("再起動後の位置共有を設定",this::configureBackgroundLocation));
        new AlertDialog.Builder(this).setTitle("位置情報を設定")
            .setMessage("Webの位置情報設定でAndroid端末を発行し、共有をONにしてください。共有中は通知を表示します。")
            .setView(box).setPositiveButton("保存して開始",(d,w)->{
                try { Credentials.save(this,id.getText().toString().trim(),secret.getText().toString().trim()); startSharing(); }
                catch(Exception e) { Toast.makeText(this,"端末IDとSecretを確認してください",Toast.LENGTH_LONG).show(); }
            }).setNeutralButton("共有を停止",(d,w)->stopLocationSharing())
            .setNegativeButton("閉じる",null).show();
    }
    private void stopLocationSharing() {
        String saved=Credentials.read(this);
        Credentials.setSharingEnabled(this,false);
        stopService(new Intent(this,LocationService.class));
        if(saved==null) return;
        if(snapshot==null) {
            Toast.makeText(this,"端末の共有は停止しました。Web側の共有状態も確認してください",Toast.LENGTH_LONG).show();
            return;
        }
        String publicId=saved.split(":",2)[0],csrf=snapshot.optString("csrf");int epoch=sessionEpoch;
        network.execute(() -> {
            try {
                if(epoch!=sessionEpoch) return;
                disableServerLocationSharing(publicId,csrf);
            } catch(Exception error) {
                runOnUiThread(() -> {if(epoch==sessionEpoch) Toast.makeText(this,"端末の共有は停止しました。Web側の共有状態も確認してください",Toast.LENGTH_LONG).show();});
            }
        });
    }
    private void disableServerLocationSharing(String publicId,String csrf) throws Exception {
        JSONArray devices=ApiClient.request("/api/location/devices",null).getJSONArray("devices");
        for(int i=0;i<devices.length();i++) {
            JSONObject device=devices.optJSONObject(i);
            if(device!=null&&publicId.equals(device.optString("publicId"))&&device.optInt("id")>0) {
                ApiClient.request("/api/location/devices",new JSONObject().put("csrf",csrf)
                    .put("action","sharing").put("device_id",device.optInt("id")).put("enabled",false));
                return;
            }
        }
        throw new IllegalStateException("Device not found");
    }
    private void resumeLocationSharing() {
        String saved=Credentials.read(this);
        if(saved==null||snapshot==null) {Toast.makeText(this,"先にこのAndroidを登録してください",Toast.LENGTH_LONG).show();return;}
        if(checkSelfPermission(Manifest.permission.ACCESS_FINE_LOCATION)!=PackageManager.PERMISSION_GRANTED &&
            checkSelfPermission(Manifest.permission.ACCESS_COARSE_LOCATION)!=PackageManager.PERMISSION_GRANTED) {
            requestPermissions(new String[]{Manifest.permission.ACCESS_FINE_LOCATION,Manifest.permission.ACCESS_COARSE_LOCATION},15);return;
        }
        if(!locationServicesReady()) {
            Toast.makeText(this,"端末の位置情報をONにしてから再開してください",Toast.LENGTH_LONG).show();return;
        }
        String publicId=saved.split(":",2)[0],csrf=snapshot.optString("csrf");int epoch=sessionEpoch;
        network.execute(() -> {
            try {
                JSONArray devices=ApiClient.request("/api/location/devices",null).getJSONArray("devices");
                for(int i=0;i<devices.length();i++) {
                    JSONObject device=devices.optJSONObject(i);
                    if(device!=null&&publicId.equals(device.optString("publicId"))&&device.optInt("id")>0&&
                        device.optBoolean("enabled")&&device.isNull("revokedAt")) {
                        ApiClient.request("/api/location/devices",new JSONObject().put("csrf",csrf)
                            .put("action","sharing").put("device_id",device.optInt("id")).put("enabled",true));
                        runOnUiThread(() -> {if(epoch==sessionEpoch) startSharing();});return;
                    }
                }
                throw new IllegalStateException("Device unavailable");
            } catch(Exception error) {
                runOnUiThread(() -> {if(epoch==sessionEpoch) Toast.makeText(this,"この端末を再開できませんでした。Webの位置設定を確認してください",Toast.LENGTH_LONG).show();});
            }
        });
    }
    private void provisionThisAndroid() {
        if(snapshot==null) {Toast.makeText(this,"先にログインしてください",Toast.LENGTH_LONG).show();return;}
        if(Credentials.read(this)!=null) {
            Toast.makeText(this,"この端末には登録済みの端末IDがあります。新しい登録は作成しません",Toast.LENGTH_LONG).show();return;
        }
        if(checkSelfPermission(Manifest.permission.ACCESS_FINE_LOCATION)!=PackageManager.PERMISSION_GRANTED &&
            checkSelfPermission(Manifest.permission.ACCESS_COARSE_LOCATION)!=PackageManager.PERMISSION_GRANTED) {
            Toast.makeText(this,"位置情報を許可してから、もう一度登録してください",Toast.LENGTH_LONG).show();
            requestPermissions(new String[]{Manifest.permission.ACCESS_FINE_LOCATION,Manifest.permission.ACCESS_COARSE_LOCATION},14);return;
        }
        if(!locationServicesReady()) {
            Toast.makeText(this,"端末の位置情報をONにしてから登録してください",Toast.LENGTH_LONG).show();return;
        }
        new AlertDialog.Builder(this).setTitle("このAndroidを登録")
            .setMessage("自分の位置情報端末を1台発行し、共有をONにします。共有中は通知を表示し、位置設定から停止できます。")
            .setPositiveButton("登録して開始",(dialog,which) -> {
                int epoch=sessionEpoch;String csrf=snapshot.optString("csrf");
                network.execute(() -> {
                    int deviceId=0;
                    try {
                        if(epoch!=sessionEpoch) return;
                        JSONObject result=ApiClient.request("/api/location/devices",new JSONObject()
                            .put("csrf",csrf).put("action","provision").put("provider","FAMILYTODO_ANDROID"));
                        JSONObject device=result.getJSONObject("device");
                        deviceId=device.getInt("id");
                        if(epoch!=sessionEpoch) throw new IllegalStateException("Session changed");
                        Credentials.save(this,device.getString("publicId"),device.getString("secret"));
                        ApiClient.request("/api/location/devices",new JSONObject().put("csrf",csrf)
                            .put("action","sharing").put("device_id",deviceId).put("enabled",true));
                        if(epoch!=sessionEpoch) throw new IllegalStateException("Session changed");
                        runOnUiThread(() -> {
                            if(epoch!=sessionEpoch) return;
                            startSharing();
                        });
                    } catch(Exception error) {
                        if(deviceId>0) try {ApiClient.request("/api/location/devices",new JSONObject().put("csrf",csrf)
                            .put("action","revoke").put("device_id",deviceId));} catch(Exception ignored) { }
                        if(epoch==sessionEpoch) Credentials.clear(this);
                        runOnUiThread(() -> {if(epoch==sessionEpoch) Toast.makeText(this,"端末登録に失敗しました。位置設定を確認してください",Toast.LENGTH_LONG).show();});
                    }
                });
            }).setNegativeButton("戻る",null).show();
    }
    private void configureBackgroundLocation() {
        if(checkSelfPermission(Manifest.permission.ACCESS_FINE_LOCATION)!=PackageManager.PERMISSION_GRANTED &&
            checkSelfPermission(Manifest.permission.ACCESS_COARSE_LOCATION)!=PackageManager.PERMISSION_GRANTED) {
            Toast.makeText(this,"先に位置共有を開始し、位置情報を許可してください",Toast.LENGTH_LONG).show();return;
        }
        if(Build.VERSION.SDK_INT<29) {
            Toast.makeText(this,"共有ONなら再起動後に自動再開します",Toast.LENGTH_LONG).show();return;
        }
        if(checkSelfPermission(Manifest.permission.ACCESS_BACKGROUND_LOCATION)==PackageManager.PERMISSION_GRANTED) {
            Toast.makeText(this,"再起動後の自動再開に必要な位置情報権限があります",Toast.LENGTH_LONG).show();return;
        }
        new AlertDialog.Builder(this).setTitle("再起動後も位置共有")
            .setMessage("共有ONの間、端末の再起動後にも位置共有を再開するには、位置情報を「常に許可」にしてください。共有OFFやログアウトでは再開しません。")
            .setPositiveButton("権限を設定",(dialog,which) -> {
                if(Build.VERSION.SDK_INT==29) requestPermissions(new String[]{Manifest.permission.ACCESS_BACKGROUND_LOCATION},12);
                else startActivity(new Intent(android.provider.Settings.ACTION_APPLICATION_DETAILS_SETTINGS,
                    android.net.Uri.parse("package:"+getPackageName())));
            }).setNegativeButton("戻る",null).show();
    }
    private void loadIntegrationStatus() {
        if(snapshot==null) {Toast.makeText(this,"ログイン後に確認してください",Toast.LENGTH_SHORT).show();return;}
        int epoch=sessionEpoch;
        network.execute(() -> {
            try {
                JSONObject response=ApiClient.request("/api/android/v1/integration-status",null);
                JSONObject calendar=response.getJSONObject("calendar"),tasks=response.getJSONObject("tasks");
                runOnUiThread(() -> {
                    if(epoch!=sessionEpoch) return;
                    String calendarState=calendar.optString("status");
                    String calendarLabel="ACTIVE".equals(calendarState)?"連携中":
                        "REVOKED".equals(calendarState)?"再連携が必要":
                        "DISCONNECTED".equals(calendarState)?"未連携":"状態: "+calendarState;
                    String taskState=tasks.optString("status");
                    String taskLabel="ACTIVE".equals(taskState)?"受信中":
                        "SYNCING".equals(taskState)?"同期処理中":
                        "NEEDS_LIST".equals(taskState)?"受信リスト未選択":
                        "ERROR".equals(taskState)?"同期エラー":
                        "REVOKED".equals(taskState)?"再連携が必要":
                        "DISCONNECTED".equals(taskState)?"未連携":"状態: "+taskState;
                    new AlertDialog.Builder(this).setTitle("Google連携の状態")
                        .setMessage("Google Calendar: "+calendarLabel+
                            "\\n最終送信: "+calendar.optString("lastOutboundAt","—")+
                            "\\n\\nGoogle Tasks（本人）: "+taskLabel+
                            "\\n最終受信: "+tasks.optString("lastSyncAt","—")+
                            "\\n競合の累計: "+tasks.optInt("conflictCount")+"件")
                        .setPositiveButton("閉じる",null).show();
                });
            } catch(SecurityException error) {
                runOnUiThread(() -> {if(epoch==sessionEpoch) showLogin();});
            } catch(Exception error) {
                runOnUiThread(() -> {if(epoch==sessionEpoch) Toast.makeText(this,"連携状態を取得できませんでした",Toast.LENGTH_SHORT).show();});
            }
        });
    }
    private void loadAppSettings() {
        if(snapshot==null) {Toast.makeText(this,"オンラインでログインしてください",Toast.LENGTH_SHORT).show();return;}
        int epoch=sessionEpoch;
        network.execute(() -> {
            try {
                JSONObject settings=ApiClient.request("/api/android/v1/settings",null);
                runOnUiThread(() -> {if(epoch==sessionEpoch) showAppSettings(settings);});
            } catch(Exception error) {
                runOnUiThread(() -> {if(epoch==sessionEpoch) Toast.makeText(this,"設定を読み込めませんでした",Toast.LENGTH_SHORT).show();});
            }
        });
    }
    private void showAppSettings(JSONObject settings) {
        boolean admin="OWNER".equalsIgnoreCase(settings.optString("role"))||"ADMIN".equalsIgnoreCase(settings.optString("role"));
        String[] actions=admin?new String[]{"プロフィール名","通知: "+(settings.optBoolean("notification_enabled")?"有効":"無効"),
            "家族のタイムゾーン","ホーム画面の表示名","家族メンバー","家族を招待"}:
            new String[]{"プロフィール名","通知: "+(settings.optBoolean("notification_enabled")?"有効":"無効"),"家族メンバー"};
        new AlertDialog.Builder(this).setTitle("アプリ設定").setItems(actions,(dialog,which) -> {
            if(which==0) {
                EditText input=new EditText(this);input.setSingleLine(true);input.setText(settings.optString("name"));
                new AlertDialog.Builder(this).setTitle("プロフィール名").setView(input)
                    .setPositiveButton("保存",(d,w) -> {
                        String name=input.getText().toString().trim();
                        if(name.isEmpty()||name.length()>100) {Toast.makeText(this,"名前を確認してください",Toast.LENGTH_SHORT).show();return;}
                        try {saveAppSetting("/api/settings",new JSONObject().put("action","profile").put("name",name));}
                        catch(Exception ignored) { }
                    }).setNegativeButton("戻る",null).show();
            } else if(which==1) {
                boolean enabled=!settings.optBoolean("notification_enabled");
                try {saveAppSetting("/api/settings",new JSONObject().put("action","notification").put("enabled",enabled));}
                catch(Exception ignored) { }
            } else if(which==2&&admin) {
                String[] zones={"Asia/Tokyo","UTC","America/Los_Angeles","America/New_York","Europe/London","Australia/Sydney"};
                new AlertDialog.Builder(this).setTitle("家族のタイムゾーン")
                    .setSingleChoiceItems(zones,Math.max(0,java.util.Arrays.asList(zones).indexOf(settings.optString("timezone"))),
                        (choice,index) -> {
                            choice.dismiss();
                            new AlertDialog.Builder(this).setTitle("タイムゾーンを変更")
                                .setMessage("既存の記録日時は自動変換されません。")
                                .setPositiveButton("変更",(d,w) -> {
                                    try {saveAppSetting("/api/settings",new JSONObject().put("action","family_timezone").put("timezone",zones[index]));}
                                    catch(Exception ignored) { }
                                }).setNegativeButton("戻る",null).show();
                        }).setNegativeButton("戻る",null).show();
            } else if(which==3&&admin) {
                EditText input=new EditText(this);input.setSingleLine(true);input.setText(settings.optString("display_name"));
                input.setHint("空欄で標準名に戻す");
                new AlertDialog.Builder(this).setTitle("ホーム画面の表示名").setView(input)
                    .setPositiveButton("保存",(d,w) -> {
                        String name=input.getText().toString().trim();
                        if(name.codePointCount(0,name.length())>24) {Toast.makeText(this,"24文字以内で入力してください",Toast.LENGTH_SHORT).show();return;}
                        try {saveAppSetting("/api/pwa-branding",new JSONObject().put("display_name",name));}
                        catch(Exception ignored) { }
                    }).setNegativeButton("戻る",null).show();
            } else if(which==4||which==2&&!admin) {
                showAppMembers(settings,admin);
            } else if(which==5&&admin) {
                createFamilyInvite();
            }
        }).setNegativeButton("閉じる",null).show();
    }
    private void showAppMembers(JSONObject settings,boolean admin) {
        JSONArray members=settings.optJSONArray("members");if(members==null) return;
        String[] names=new String[members.length()];
        for(int i=0;i<members.length();i++) {
            JSONObject member=members.optJSONObject(i);
            names[i]=member==null?"家族":member.optString("name")+" ・ "+member.optString("role")+
                (member.optInt("active",1)==1?"":"（停止中）")+
                (member.optInt("manage_quick_chores")==1?" ・ 家事管理可":"");
        }
        new AlertDialog.Builder(this).setTitle("家族メンバー").setItems(names,(dialog,which) -> {
            JSONObject member=members.optJSONObject(which);
            if(member==null||!admin||member.optInt("id")==settings.optInt("member_id")||
                "OWNER".equalsIgnoreCase(member.optString("role"))) return;
            boolean active=member.optInt("active",1)==1;
            boolean canManageChores=member.optInt("manage_quick_chores")==1;
            String[] actions=active?new String[]{canManageChores?"家事の管理権限を解除":"家事の管理権限を付与","メンバーを停止"}:
                new String[]{"メンバーを再開"};
            new AlertDialog.Builder(this).setTitle(member.optString("name"))
                .setItems(actions,(actionDialog,index) -> {
                    if(active&&index==0) {
                        new AlertDialog.Builder(this).setTitle(actions[0])
                            .setMessage("このメンバーのちょこっと家事の項目を管理する権限を変更します。")
                            .setPositiveButton("変更",(d,w) -> {
                                try {saveAppSetting("/api/settings",new JSONObject().put("action","member_permission")
                                    .put("member_id",member.optInt("id")).put("granted",!canManageChores));}
                                catch(Exception ignored) { }
                            }).setNegativeButton("戻る",null).show();
                    } else {
                        new AlertDialog.Builder(this).setTitle(member.optString("name"))
                            .setMessage(active?"このメンバーの利用を停止しますか。通知も停止します。":"このメンバーを再開しますか。")
                            .setPositiveButton(active?"停止":"再開",(d,w) -> {
                                try {saveAppSetting("/api/settings",new JSONObject().put("action","member_toggle")
                                    .put("member_id",member.optInt("id")));}
                                catch(Exception ignored) { }
                            }).setNegativeButton("戻る",null).show();
                    }
                }).setNegativeButton("戻る",null).show();
        }).setNegativeButton("閉じる",null).show();
    }
    private void createFamilyInvite() {
        if(snapshot==null) return;
        new AlertDialog.Builder(this).setTitle("家族を招待")
            .setMessage("7日間有効な招待リンクを発行します。リンクを知っている人だけに共有してください。")
            .setPositiveButton("発行して共有",(dialog,which) -> {
                int epoch=sessionEpoch;String csrf=snapshot.optString("csrf");
                network.execute(() -> {
                    try {
                        if(epoch!=sessionEpoch) return;
                        JSONObject response=ApiClient.request("/api/family/invite",new JSONObject()
                            .put("csrf",csrf).put("expires_days",7));
                        String url=response.optString("url");
                        if(!url.startsWith(ApiClient.ORIGIN+"/family/join.php?token=")) throw new IllegalStateException("Invalid invite URL");
                        JSONObject official=response.optJSONObject("official_account");
                        String add=official==null?"":official.optString("add_friend_url");
                        String text="FamilyToDoへの招待です。\n"+
                            (add.startsWith("https://")?"先に公式アカウントを追加してください: "+add+"\n":"")+url;
                        runOnUiThread(() -> {
                            if(epoch!=sessionEpoch) return;
                            Intent share=new Intent(Intent.ACTION_SEND).setType("text/plain").putExtra(Intent.EXTRA_TEXT,text);
                            startActivity(Intent.createChooser(share,"招待リンクを共有"));
                        });
                    } catch(Exception error) {
                        runOnUiThread(() -> {if(epoch==sessionEpoch) Toast.makeText(this,"招待リンクを発行できませんでした",Toast.LENGTH_SHORT).show();});
                    }
                });
            }).setNegativeButton("戻る",null).show();
    }
    private void saveAppSetting(String path,JSONObject body) {
        if(snapshot==null) return;
        int epoch=sessionEpoch;String csrf=snapshot.optString("csrf");
        network.execute(() -> {
            try {
                if(epoch!=sessionEpoch) return;
                body.put("csrf",csrf);ApiClient.request(path,body);
                runOnUiThread(() -> {if(epoch==sessionEpoch) {Toast.makeText(this,"設定を保存しました",Toast.LENGTH_SHORT).show();loadAppSettings();}});
            } catch(Exception error) {
                runOnUiThread(() -> {if(epoch==sessionEpoch) Toast.makeText(this,"設定を保存できませんでした",Toast.LENGTH_SHORT).show();});
            }
        });
    }
    private void pinFamilyShortcut() {
        ShortcutManager manager=getSystemService(ShortcutManager.class);
        if(manager==null||!manager.isRequestPinShortcutSupported()) {
            Toast.makeText(this,"このホーム画面ではショートカットを追加できません",Toast.LENGTH_LONG).show();return;
        }
        int epoch=sessionEpoch;
        network.execute(() -> {
            try {
                JSONObject manifest=ApiClient.pwaManifest();
                Bitmap icon=ApiClient.thumbnail("/app-icon-192.png");
                String name=manifest.optString("short_name","Family TODO");
                if(name.trim().isEmpty()) name="Family TODO";
                final String title=name;
                runOnUiThread(() -> {
                    if(epoch!=sessionEpoch||snapshot==null) return;
                    Intent launch=new Intent(this,MainActivity.class).setAction(Intent.ACTION_MAIN)
                        .addCategory(Intent.CATEGORY_LAUNCHER)
                        .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK|Intent.FLAG_ACTIVITY_CLEAR_TOP);
                    ShortcutInfo shortcut=new ShortcutInfo.Builder(this,"familytodo-home")
                        .setShortLabel(title).setIcon(Icon.createWithBitmap(icon)).setIntent(launch).build();
                    if(!manager.requestPinShortcut(shortcut,null))
                        Toast.makeText(this,"ショートカットを追加できませんでした",Toast.LENGTH_LONG).show();
                });
            } catch(Exception error) {
                runOnUiThread(() -> {if(epoch==sessionEpoch) Toast.makeText(this,"アイコンを取得できませんでした",Toast.LENGTH_LONG).show();});
            }
        });
    }
    private boolean locationServicesReady() {
        android.location.LocationManager location=getSystemService(android.location.LocationManager.class);
        if(location==null) return false;
        try {
            return checkSelfPermission(Manifest.permission.ACCESS_FINE_LOCATION)==PackageManager.PERMISSION_GRANTED &&
                    location.isProviderEnabled(android.location.LocationManager.GPS_PROVIDER) ||
                checkSelfPermission(Manifest.permission.ACCESS_COARSE_LOCATION)==PackageManager.PERMISSION_GRANTED &&
                    location.isProviderEnabled(android.location.LocationManager.NETWORK_PROVIDER);
        } catch(RuntimeException error) { return false; }
    }
    private void startSharing() {
        if (!hasLocationPermission()) {
            requestPermissions(new String[]{Manifest.permission.ACCESS_FINE_LOCATION,Manifest.permission.ACCESS_COARSE_LOCATION},11); return;
        }
        if(Build.VERSION.SDK_INT>=33 &&
            checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS)!=PackageManager.PERMISSION_GRANTED &&
            !getPreferences(MODE_PRIVATE).getBoolean("notificationPrompted",false)) {
            getPreferences(MODE_PRIVATE).edit().putBoolean("notificationPrompted",true).apply();
            requestPermissions(new String[]{Manifest.permission.POST_NOTIFICATIONS},16); return;
        }
        if(!locationServicesReady()) {
            Toast.makeText(this,"端末の位置情報をONにしてから共有を開始してください",Toast.LENGTH_LONG).show();return;
        }
        if(Credentials.read(this)==null) {
            Toast.makeText(this,"端末IDとSecretを保存してください",Toast.LENGTH_LONG).show(); return;
        }
        Credentials.setSharingEnabled(this,true);
        try {
            startForegroundService(new Intent(this,LocationService.class));
            Toast.makeText(this,"位置共有を開始しています",Toast.LENGTH_SHORT).show();
        } catch(RuntimeException error) {
            Credentials.setSharingEnabled(this,false);
            Toast.makeText(this,"位置共有を開始できませんでした。Web側の共有状態も確認してください",Toast.LENGTH_LONG).show();
        }
    }
    private boolean hasLocationPermission() {
        return checkSelfPermission(Manifest.permission.ACCESS_FINE_LOCATION)==PackageManager.PERMISSION_GRANTED ||
            checkSelfPermission(Manifest.permission.ACCESS_COARSE_LOCATION)==PackageManager.PERMISSION_GRANTED;
    }
    @Override public void onRequestPermissionsResult(int code,String[] permissions,int[] grants) {
        super.onRequestPermissionsResult(code,permissions,grants);
        if(code==11 && hasLocationPermission()) { startSharing(); return; }
        if(code==12 && checkSelfPermission(Manifest.permission.ACCESS_BACKGROUND_LOCATION)==PackageManager.PERMISSION_GRANTED) {
            Toast.makeText(this,"再起動後の自動再開を設定しました",Toast.LENGTH_LONG).show(); return;
        }
        if(code==14 && hasLocationPermission()) {
            Toast.makeText(this,"位置情報を許可しました。登録をもう一度選んでください",Toast.LENGTH_LONG).show(); return;
        }
        if(code==15 && hasLocationPermission()) { resumeLocationSharing(); return; }
        if(code==16) {
            if(checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS)!=PackageManager.PERMISSION_GRANTED)
                Toast.makeText(this,"共有中の通知は通知欄に表示されません。通知設定から許可できます",Toast.LENGTH_LONG).show();
            startSharing(); return;
        }
        Toast.makeText(this,"位置共有には権限が必要です",Toast.LENGTH_LONG).show();
    }
    @Override public void onBackPressed() {
        if(pageWeb!=null) {
            if(pageWeb.canGoBack())pageWeb.goBack();
            else returnFromWebPage();
        } else if(login!=null&&login.canGoBack()) login.goBack();
        else super.onBackPressed();
    }
    @Override protected void onDestroy() { network.shutdownNow(); stampMedia.shutdown(); if (login!=null) login.destroy(); super.onDestroy(); }
}
