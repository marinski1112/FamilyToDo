package jp.marinski.familytodo;

import android.app.Activity;
import android.app.Instrumentation;
import android.content.Intent;
import android.os.Bundle;
import android.view.View;
import android.view.ViewGroup;
import android.widget.CheckBox;
import android.widget.EditText;
import android.widget.TextView;
import org.json.JSONArray;
import org.json.JSONObject;
import java.lang.reflect.Field;
import java.lang.reflect.Method;
import java.time.LocalDate;
import java.time.YearMonth;
import java.util.concurrent.atomic.AtomicReference;

/** Runs real native renderers with synthetic data and an in-memory API transport. */
public final class UiParityInstrumentation extends Instrumentation {
    private MainActivity activity;
    private JSONObject snapshot;
    private int nextId=100;
    private int checks;
    private volatile int taskCreates;
    private volatile JSONObject lastTaskCreate;
    private volatile int backgroundWrites;
    private volatile String lastBackgroundScope,lastBackgroundMethod;
    private volatile int failedMoves;
    @Override public void onCreate(Bundle arguments){super.onCreate(arguments);start();}
    @Override public void onStart(){
        Bundle status=new Bundle();status.putString("id","InstrumentationTestRunner");
        status.putInt("numtests",1);status.putInt("current",1);
        status.putString("class",getClass().getName());status.putString("test","allPagesAndChecklistInteractions");
        sendStatus(1,status);
        try{
            if(!BuildConfig.UI_TEST_MODE)throw new AssertionError("UI fixture variant required");
            long midnight=java.time.Instant.parse("2026-09-30T15:00:00Z").toEpochMilli();
            long one=java.time.Instant.parse("2026-09-30T16:00:00Z").toEpochMilli();
            check(GoodsCategoryState.archiveAt("2026-09-30T13:59:00Z")==midnight,"22:59 JST archives at midnight");
            check(GoodsCategoryState.archiveAt("2026-09-30T14:00:00Z")==one,"23:00 JST archives at 01:00");
            check(GoodsCategoryState.archiveAt("2026-09-30T23:59:00+09:00")==one,"23:59 JST archives at 01:00");
            check("FRESH_EMPTY".equals(GoodsCategoryState.state(1,0,"2026-09-30T13:59:00Z",midnight-1)),"fresh before boundary");
            check("ARCHIVED_EMPTY".equals(GoodsCategoryState.state(1,0,"2026-09-30T13:59:00Z",midnight)),"archive at exact boundary");
            check("ACTIVE".equals(GoodsCategoryState.state(1,1,"invalid",midnight)),"content keeps category active");
            check("DISABLED".equals(GoodsCategoryState.state(0,1,"invalid",midnight)),"disabled takes precedence");
            check(GoodsCategoryState.archiveAt("2026-09-30 22:59:00")==0,"timezone required");
            check("国民の休日".equals(CalendarHolidays.name(LocalDate.parse("2026-09-22"))),"Web citizen holiday");
            check("振替休日".equals(CalendarHolidays.name(LocalDate.parse("2026-05-06"))),"Web substitute holiday");
            check("成人の日".equals(CalendarHolidays.name(LocalDate.parse("2026-01-12"))),"Web Monday holiday");
            check(CalendarHolidays.name(LocalDate.parse("2026-09-30"))==null,"ordinary weekday");
            JSONObject dashboard=HomeDashboardParser.parse(homeHtml());
            check(dashboard.getJSONArray("counts").getInt(3)==7,"home server family-log count");
            check(dashboard.getJSONArray("alerts").length()==1,"home rejects external action link");
            check(dashboard.optString("journalText").equals("昨日 & 今日"),"home decodes escaped journal text");
            boolean rejected=false;try{HomeDashboardParser.parse("<html>login</html>");}catch(Exception expected){rejected=true;}check(rejected,"login page cannot become dashboard");
            rejected=false;try{HomeDashboardParser.parse(homeHtml().replace("<strong>7</strong>","<strong>unknown</strong>"));}catch(Exception expected){rejected=true;}check(rejected,"changed count contract fails closed");
            ApiClient.fixtureTransport=this::response;
            activity=(MainActivity)startActivitySync(new Intent(getTargetContext(),MainActivity.class).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK));
            String day=LocalDate.now(java.time.ZoneId.of("Asia/Tokyo")).toString();
            snapshot=new JSONObject().put("ok",true).put("month",day.substring(0,7)).put("csrf","synthetic")
                .put("familyId",1).put("memberId",1).put("canManageStamps",true)
                .put("members",new JSONArray("[{\"id\":1,\"name\":\"テスト家族\"}]"))
                .put("tasks",new JSONArray().put(new JSONObject().put("id",10).put("title","今日のタスク").put("task_kind","TASK").put("status","pending").put("due_at",day))
                    .put(new JSONObject().put("id",11).put("title","予定のテスト").put("task_kind","EVENT").put("status","pending").put("start_at",day+" 09:00:00").put("calendar_color","#22C55E"))
                    .put(new JSONObject().put("id",12).put("title","二つ目の予定").put("task_kind","EVENT").put("status","pending").put("start_at",day+" 10:00:00").put("calendar_color","#EC4899"))
                    .put(new JSONObject().put("id",13).put("title","三つ目の予定").put("task_kind","EVENT").put("status","pending").put("start_at",day+" 11:00:00").put("calendar_color","#38BDF8"))
                    .put(new JSONObject().put("id",14).put("title","四つ目の予定").put("task_kind","EVENT").put("start_at",day+" 12:00:00"))
                    .put(new JSONObject().put("id",15).put("title","五つ目の予定").put("task_kind","EVENT").put("start_at",day+" 13:00:00"))
                    .put(new JSONObject().put("id",16).put("title","日跨ぎ予定").put("task_kind","EVENT").put("all_day",1).put("start_at",LocalDate.parse(day).minusDays(1).toString()).put("end_at",LocalDate.parse(day).plusDays(1).toString()))
                    .put(new JSONObject().put("id",17).put("title","重なる日跨ぎ予定").put("task_kind","EVENT").put("all_day",1).put("start_at",LocalDate.parse(day).minusDays(1).toString()).put("end_at",LocalDate.parse(day).plusDays(1).toString())))
                .put("shopping",new JSONArray("[{\"id\":1,\"name\":\"買い物のテスト\",\"category\":\"スーパー\",\"status\":\"pending\",\"quantity\":\"1\"}]"))
                .put("items",new JSONArray("[{\"id\":2,\"name\":\"持ち物のテスト\",\"category\":\"保育園\",\"status\":\"pending\"}]"));
            JSONObject family=new JSONObject().put("date",day).put("familyId",1).put("memberId",1)
                .put("subjects",new JSONArray("[{\"id\":1,\"name\":\"テスト対象\",\"subject_kind\":\"BABY\"}]"))
                .put("logs",new JSONArray().put(new JSONObject().put("id",1).put("subject_id",1).put("subject_name","テスト対象")
                    .put("log_type","MILK").put("amount",160).put("unit","ml").put("occurred_at",day+" 09:00:00")))
                .put("quickActions",new JSONArray("[{\"id\":1,\"subject_id\":1,\"active\":1,\"name\":\"160\",\"icon\":\"🍼\",\"log_type\":\"MILK\"}]"))
                .put("timers",new JSONArray()).put("chores",new JSONArray());
            JSONArray messages=new JSONArray().put(new JSONObject().put("id",1).put("senderId",1).put("senderName","テスト家族")
                .put("text","伝言のテスト").put("createdAt",day+" 09:00:00").put("readCount",1))
                .put(new JSONObject().put("id",2).put("senderId",2).put("senderName","テスト相手").put("text","").put("hasImage",true)
                    .put("hasStamp",true).put("createdAt",day+" 10:00:00"));
            onUi(()->{
                try{
                    field("snapshot",snapshot);field("month",YearMonth.parse(day.substring(0,7)));field("selectedDay",LocalDate.parse(day));
                    field("homeDashboard",dashboard);field("tab","home");field("familyLog",family);field("messages",messages);
                    field("shoppingCategories",new JSONObject("{\"categories\":[\"スーパー\",\"子供\"],\"order\":[\"スーパー\",\"子供\"]}"));
                    field("itemCategories",new JSONObject("{\"categories\":[\"保育園\"],\"order\":[\"保育園\"]}"));
                    field("locationLatest",new JSONObject("{\"members\":[{\"id\":1,\"name\":\"テスト家族\",\"sharingEnabled\":true,\"registeredPlaceLabel\":\"登録地点\",\"latest\":{\"recordedAt\":\"09:00\"}}]}"));
                    @SuppressWarnings("unchecked") java.util.Map<Integer,JSONObject> stamps=(java.util.Map<Integer,JSONObject>)value("messageStamps");
                    stamps.put(2,new JSONObject().put("thumbnailUrl","/fixture.png"));
                    ApiClient.setMutationsEnabled(true);invoke("showNative");
                }catch(Exception e){throw new RuntimeException(e);}
            });
            onUi(()->{try{
                @SuppressWarnings("unchecked") java.util.Map<String,JSONArray> stamps=(java.util.Map<String,JSONArray>)value("stampMonths");JSONArray placements=new JSONArray();for(int i=0;i<4;i++)placements.put(new JSONObject().put("placementId",i+1).put("date",day).put("name","カレンダーテスト").put("thumbnailUrl","/fixture.png"));stamps.put(day.substring(0,7),placements);
                @SuppressWarnings("unchecked") java.util.Map<String,JSONObject> stickers=(java.util.Map<String,JSONObject>)value("stickerMonths");stickers.put(day.substring(0,7),new JSONObject().put("options",new JSONArray().put(new JSONObject().put("id",1).put("name","背景テスト").put("url","/fixture.png"))).put("days",new JSONArray().put(new JSONObject().put("date",day).put("scope","FAMILY").put("url","/fixture.png").put("canRemove",true)).put(new JSONObject().put("date",day).put("scope","PRIVATE").put("url","/fixture.png").put("name","個人背景"))));
                Method lookup=MainActivity.class.getDeclaredMethod("stickerOnDay",String.class);lookup.setAccessible(true);JSONObject selected=(JSONObject)lookup.invoke(activity,day);check(selected.optString("name").equals("個人背景"),"private sticker overlays shared background");
            }catch(Exception e){throw new RuntimeException(e);}});
            settle();check(hasContaining("今日のタスク"),"home contains today's task");
            check(hasText("🛒 買い物残り"),"home stat grid");check(hasText("家族日誌"),"home shortcuts");check(hasContaining("期限切れタスク 2件"),"native attention alert");check(hasText("昨日 & 今日"),"native journal body");screenshot("home");
            navigate("チェックリスト");check(hasText("☑ タスク"),"task section exists");
            onUi(()->{TextView label=findText(root(),"チェックリスト");check(label.getLayout()!=null&&label.getLayout().getLineWidth(0)<=label.getWidth()-label.getCompoundPaddingLeft()-label.getCompoundPaddingRight(),"navigation label fits slot");});
            clickDescription("タスクを検索");
            onUi(()->{EditText search=findHint(root(),"タスクを検索");search.setText("一致しない検索");View title=findText(root(),"今日のタスク");check(((View)title.getParent()).getVisibility()==View.GONE,"task search hides nonmatching row");search.setText(" 今日のタスク ");check(((View)title.getParent()).getVisibility()==View.VISIBLE,"task search trims query and restores match");});
            clickDescription("タスクを検索");
            onUi(()->check(((View)findText(root(),"今日のタスク").getParent()).getVisibility()==View.VISIBLE,"closing search restores rows"));
            clickDescription("スーパーを開閉");check(hasText("買い物のテスト"),"category expands");
            AtomicReference<EditText> editor=new AtomicReference<>();
            onUi(()->{EditText input=(EditText)findText(root(),"買い物のテスト");editor.set(input);input.performClick();
                CheckBox box=findBox((ViewGroup)input.getParent());check(!box.isChecked(),"title tap must not complete");
                input.setText("名前を直接編集");input.clearFocus();});
            waitText("名前を直接編集");check(hasText("名前を直接編集"),"inline title persists");
            onUi(()->{EditText input=editor.get();input.performClick();input.setText("失敗ケース");input.clearFocus();});
            waitText("名前を直接編集");check(hasText("名前を直接編集"),"failed save rolls back");
            onUi(()->{EditText input=findHint(root(),"新しい買い物");check(input!=null,"category composer exists");input.setText("連続追加一件目");input.onEditorAction(android.view.inputmethod.EditorInfo.IME_ACTION_NEXT);});
            waitText("連続追加一件目");check(hasText("連続追加一件目"),"first continuous entry added");
            onUi(()->{EditText input=findHint(root(),"新しい買い物");check(input.getText().length()==0,"composer clears after success");input.setText("連続追加二件目");input.onEditorAction(android.view.inputmethod.EditorInfo.IME_ACTION_NEXT);});
            waitText("連続追加二件目");check(hasText("連続追加二件目"),"second continuous entry added");
            onUi(()->{EditText category=(EditText)findText(root(),"スーパー");category.performClick();category.setText("食品");category.clearFocus();});
            waitText("食品");check(hasText("食品"),"category name saved inline");check(hasText("連続追加二件目"),"renamed category remains expanded");
            onUi(()->{EditText category=(EditText)findText(root(),"食品");category.performClick();category.setText("失敗カテゴリ");category.clearFocus();});
            waitText("失敗カテゴリ");check(hasText("失敗カテゴリ"),"category rename failure retains draft");
            check("食品".equals(snapshot.optJSONArray("shopping").optJSONObject(1).optString("category")),"failed rename leaves saved category unchanged");
            onUi(()->{EditText category=(EditText)findText(root(),"失敗カテゴリ");category.setText("食品");category.setError(null);category.clearFocus();});
            onUi(()->{try{Method move=MainActivity.class.getDeclaredMethod("moveGoodsCategory",boolean.class,int.class,String.class);move.setAccessible(true);move.invoke(activity,true,1,"子供");}catch(Exception e){throw new RuntimeException(e);}});
            waitCategory(1,"子供");check(hasText("名前を直接編集"),"moved row remains visible in expanded target");
            onUi(()->{try{Method move=MainActivity.class.getDeclaredMethod("moveGoodsCategory",boolean.class,int.class,String.class);move.setAccessible(true);move.invoke(activity,true,1,"失敗移動");}catch(Exception e){throw new RuntimeException(e);}});
            for(int i=0;i<100&&failedMoves==0;i++)Thread.sleep(30);check(failedMoves==1,"move failure exercised");settle();
            waitCategory(1,"子供");check("保育園".equals(snapshot.optJSONArray("items").optJSONObject(0).optString("category")),"shopping move does not modify item catalog");
            onUi(()->{try{
                JSONObject catalog=(JSONObject)value("shoppingCategories");
                catalog.put("categories",new JSONArray().put("食品").put("子供").put("新しい空").put("古い空"));
                catalog.put("categoryMeta",new JSONArray()
                    .put(new JSONObject().put("name","新しい空").put("enabled",1).put("activated_at",java.time.Instant.now().toString()))
                    .put(new JSONObject().put("name","古い空").put("enabled",1).put("activated_at","2020-01-01T00:00:00Z")));
                invoke("render");
            }catch(Exception e){throw new RuntimeException(e);}});
            check(hasText("新しい空"),"fresh empty category at normal position");
            check(!hasText("古い空"),"archived empty hidden behind cluster");
            clickDescription("空のカテゴリを開閉");check(hasText("古い空"),"archived category inside cluster");
            clickDescription("古い空に追加");check(findHintOnUi("新しい買い物")!=null,"archived category can reopen for entry");
            screenshot("checklist");
            clickText("🎒 持ち物");clickDescription("保育園を開閉");check(hasText("持ち物のテスト"),"item catalog stays separate");screenshot("items");
            navigate("カレンダー");check(hasContaining("予定のテスト"),"calendar event renders");
            onUi(()->{View cell=findDescription(root(),day+" 予定8件");check(cell!=null,"today's calendar cell exists");
                check(((ViewGroup)cell.getParent()).indexOfChild(cell)==LocalDate.parse(day).getDayOfWeek().getValue()%7,"calendar date matches weekday");});
            check(hasContaining("二つ目の予定"),"second calendar event visible");check(hasText("＋1件"),"calendar overflow count visible");check(hasContaining("四つ目の予定"),"Web four-event cap");
            onUi(()->{
                String span=LocalDate.parse(day).minusDays(1)+"〜"+LocalDate.parse(day).plusDays(1);
                View first=findDescription(root(),"日跨ぎ予定 "+span),second=findDescription(root(),"重なる日跨ぎ予定 "+span);
                check(first!=null&&second!=null,"cross-day bands render");
                check(first.getWidth()>0,"cross-day band measured");
                check(((android.widget.FrameLayout.LayoutParams)first.getLayoutParams()).topMargin!=((android.widget.FrameLayout.LayoutParams)second.getLayoutParams()).topMargin,"overlapping ranges get distinct lanes");
            });
            check(hasText("+1"),"overlapping stamp overflow");
            onUi(()->{check(findDescription(root(),"スタンプ カレンダーテスト")!=null,"calendar contains stamp thumbnail");});
            screenshot("calendar");
            testBackgroundSave(LocalDate.parse(day),"PRIVATE",99,false);
            check("PRIVATE".equals(lastBackgroundScope),"background retains scope on failed save");
            testBackgroundSave(LocalDate.parse(day),"FAMILY",1,true);
            check("POST".equals(lastBackgroundMethod)&&"FAMILY".equals(lastBackgroundScope),"background family placement request");
            testBackgroundSave(LocalDate.parse(day),"PRIVATE",0,true);
            check("DELETE".equals(lastBackgroundMethod)&&"PRIVATE".equals(lastBackgroundScope),"background private removal request");
            ApiClient.setMutationsEnabled(false);int previousWrites=backgroundWrites;testBackgroundSave(LocalDate.parse(day),"FAMILY",1,false);check(backgroundWrites==previousWrites,"read-only background cannot write");ApiClient.setMutationsEnabled(true);
            navigate("位置情報");check(hasText("テスト家族"),"location summary renders");screenshot("location");
            navigate("家族ログ");check(hasText("📓 成長日記"),"journal navigation exists");check(hasText("📊 まとめ"),"summary navigation exists");screenshot("familylog");
            navigate("伝言");check(hasText("伝言のテスト"),"message renders");check(findHintOnUi("メッセージ")!=null,"bottom composer exists");
            onUi(()->{View body=findText(root(),"伝言のテスト"),bubble=(View)body.getParent(),stack=(View)bubble.getParent();
                check(bubble.getWidth()<stack.getWidth(),"own bubble fits short text");
                check(bubble.getRight()==stack.getWidth(),"own bubble aligned right");
            });screenshot("messages");
            testChildComposer();
            status.putString("stream","\nPassed "+checks+" native UI checks.\n");sendStatus(0,status);
            Bundle results=new Bundle();results.putString("stream","\nOK (1 test)\n");finish(Activity.RESULT_OK,results);
        }catch(Throwable error){
            status.putString("stack",android.util.Log.getStackTraceString(error));status.putString("stream",error.toString());sendStatus(-2,status);
            Bundle results=new Bundle();results.putString("stream","FAILURES!!!\n"+android.util.Log.getStackTraceString(error));finish(Activity.RESULT_CANCELED,results);
        }
    }
    private void testChildComposer()throws Exception{
        AtomicReference<android.app.AlertDialog> popup=new AtomicReference<>();AtomicReference<EditText> title=new AtomicReference<>();
        onUi(()->{try{
            Method add=MainActivity.class.getDeclaredMethod("addTask",JSONObject.class);add.setAccessible(true);
            JSONObject parent=new JSONObject().put("id",10).put("kind","TASK").put("visibilityScope","PRIVATE");
            android.app.AlertDialog dialog=(android.app.AlertDialog)add.invoke(activity,parent);popup.set(dialog);View form=dialog.getWindow().getDecorView();title.set(findHint(form,"タイトル"));
            check(findContaining(form,"自分だけ（親タスクと同じ）")!=null,"child inherits private scope label");
            CheckBox event=(CheckBox)findText(form,"イベントとして登録");check(!event.isChecked()&&!event.isEnabled(),"child cannot become event");
            dialog.getButton(android.app.AlertDialog.BUTTON_POSITIVE).performClick();check(taskCreates==0&&dialog.isShowing(),"empty title remains open without write");
            title.get().setText("子タスクのテスト");((CheckBox)findText(form,"期限なし")).setChecked(true);
        }catch(Exception e){throw new RuntimeException(e);}});
        screenshot("child-composer");
        onUi(()->{popup.get().getButton(android.app.AlertDialog.BUTTON_POSITIVE).performClick();popup.get().getButton(android.app.AlertDialog.BUTTON_POSITIVE).performClick();});
        for(int i=0;i<100&&taskCreates<1;i++)Thread.sleep(20);settle();
        String firstKey=lastTaskCreate.optString("idempotency_key");
        onUi(()->{check(taskCreates==1,"child creation double submit blocked");check(popup.get().isShowing()&&title.get().getText().toString().equals("子タスクのテスト"),"failed child save retains title");check(popup.get().getButton(android.app.AlertDialog.BUTTON_POSITIVE).isEnabled(),"child save failure permits retry");check(findContaining(popup.get().getWindow().getDecorView(),"保存できませんでした")!=null,"child save error visible");popup.get().getButton(android.app.AlertDialog.BUTTON_POSITIVE).performClick();});
        for(int i=0;i<100&&taskCreates<2;i++)Thread.sleep(20);settle();
        check(lastTaskCreate.optInt("parent_task_id")==10&&"PRIVATE".equals(lastTaskCreate.optString("visibility_scope")),"child request carries parent and matching scope");
        check(lastTaskCreate.optBoolean("noDate")&&lastTaskCreate.optString("dateOnly").isEmpty()&&!lastTaskCreate.optBoolean("is_event"),"undated child task request");
        check(firstKey.equals(lastTaskCreate.optString("idempotency_key")),"unchanged child retry reuses idempotency key");
        onUi(()->{check(!popup.get().isShowing(),"successful child save closes composer");try{Method add=MainActivity.class.getDeclaredMethod("addTask",JSONObject.class);add.setAccessible(true);
            check(add.invoke(activity,new JSONObject().put("id",10).put("isChild",true))==null,"nested child creation rejected");
            check(add.invoke(activity,new JSONObject().put("id",10).put("kind","EVENT"))==null,"event parent rejected");
            ApiClient.setMutationsEnabled(false);check(add.invoke(activity,new JSONObject().put("id",10))==null,"read-only child creation blocked");ApiClient.setMutationsEnabled(true);
        }catch(Exception e){throw new RuntimeException(e);}});
    }
    private void testBackgroundSave(LocalDate day,String scope,int asset,boolean success)throws Exception{
        AtomicReference<android.app.AlertDialog> dialog=new AtomicReference<>();AtomicReference<TextView> error=new AtomicReference<>();boolean[] saving={false};int previous=backgroundWrites;
        onUi(()->{try{android.app.AlertDialog popup=new android.app.AlertDialog.Builder(activity).setTitle("背景保存テスト").create();popup.show();dialog.set(popup);TextView message=new TextView(activity);error.set(message);Method save=MainActivity.class.getDeclaredMethod("saveCalendarBackground",LocalDate.class,String.class,int.class,android.app.AlertDialog.class,TextView.class,boolean[].class);save.setAccessible(true);save.invoke(activity,day,scope,asset,popup,message,saving);}catch(Exception e){throw new RuntimeException(e);}});
        if(ApiClient.canMutate()){for(int i=0;i<100&&backgroundWrites==previous;i++)Thread.sleep(20);settle();onUi(()->{if(success)check(!dialog.get().isShowing(),"successful background save closes chooser");else{check(dialog.get().isShowing(),"failed background save retains chooser");check(!saving[0]&&error.get().getText().toString().contains("保存できません"),"failed background save enables retry");}});}
        onUi(()->dialog.get().dismiss());
    }
    private String homeHtml(){return "<div class=\"home-dashboard\"><header class=\"home-dashboard-hero\"><h1>🏠 テスト家族</h1><p>今日と昨日の様子</p></header><section class=\"home-alert-list\"><a class=\"home-alert danger\" href=\"/app/tasks.php?date=2026-09-30\"><strong>期限切れタスク 2件</strong><small>確認する</small></a><a class=\"home-alert\" href=\"https://invalid.example/\"><strong>外部リンク</strong></a></section><section class=\"home-today-grid\"><a class=\"home-stat\" href=\"/app/tasks.php\"><strong>1</strong></a><a class=\"home-stat\"><strong>5</strong></a><a class=\"home-stat\"><strong>1</strong></a><a class=\"home-stat\"><strong>7</strong></a></section><section class=\"card home-journal-card\"><h2>昨日の家族日誌</h2><a href=\"/app/family_journal.php?date=2026-09-29\">詳しく</a><p class=\"home-journal-text\">昨日 &amp; 今日</p><div class=\"home-journal-stats\"><span>完了 3</span></div></section><details class=\"card home-fortune\"><summary>🔮 今日の占い ★★★</summary><p>テスト家族さんの今日</p><p>今日の運勢</p></details></div>";}
    private JSONObject response(String path,JSONObject body,String method)throws Exception{
        if(path.equals("/api/task")){lastTaskCreate=new JSONObject(body.toString());taskCreates++;if(taskCreates==1)throw new IllegalStateException("synthetic task creation failure");return new JSONObject().put("ok",true).put("id",++nextId);}
        if(path.equals("/api/calendar-stickers")){backgroundWrites++;lastBackgroundScope=body.optString("visibilityScope");lastBackgroundMethod=method;if(body.optInt("assetId")==99)throw new IllegalStateException("synthetic background save failure");return new JSONObject().put("ok",true);}
        if(path.equals("/api/checklist/inline-title")){
            if(body.optString("title").equals("失敗ケース"))throw new IllegalStateException("synthetic failure");
            return new JSONObject().put("ok",true).put("title",body.optString("title"));
        }
        if(path.equals("/api/shopping-category-mutation")||path.equals("/api/item")&&body!=null&&body.optString("action").equals("category_rename")){
            if(body.optString("new_name").equals("失敗カテゴリ"))throw new IllegalStateException("synthetic category failure");
            return new JSONObject().put("ok",true).put("name",body.optString("new_name"));
        }
        if((path.equals("/api/shopping")||path.equals("/api/item"))&&body!=null&&body.optString("action").equals("update_category")){
            if(body.optString("category").equals("失敗移動")){failedMoves++;throw new IllegalStateException("synthetic move failure");}
            return new JSONObject().put("ok",true);
        }
        if(path.equals("/api/shopping")||path.equals("/api/item"))return new JSONObject().put("ok",true).put("id",++nextId);
        if(path.equals("/api/task-parent-completion"))return new JSONObject().put("ok",true).put("incomplete_children",0);
        if(path.equals("/api/toggle"))return new JSONObject().put("ok",true);
        throw new IllegalStateException("Unconfigured fixture request: "+path);
    }
    private void navigate(String name)throws Exception{
        onUi(()->{TextView label=findText(root(),name);check(label!=null,"navigation label "+name);((View)label.getParent()).performClick();});settle();
    }
    private void clickText(String text)throws Exception{onUi(()->{TextView node=findText(root(),text);check(node!=null,"click "+text);node.performClick();});settle();}
    private void clickTextContaining(String text)throws Exception{onUi(()->{TextView node=findContaining(root(),text);check(node!=null,"click category "+text);node.performClick();});settle();}
    private void clickDescription(String description)throws Exception{onUi(()->{View node=findDescription(root(),description);check(node!=null,"click "+description);node.performClick();});settle();}
    private void waitCategory(int id,String category)throws Exception{for(int i=0;i<100;i++){
        AtomicReference<Boolean> found=new AtomicReference<>(false);onUi(()->{JSONArray rows=snapshot.optJSONArray("shopping");for(int n=0;n<rows.length();n++){JSONObject row=rows.optJSONObject(n);if(row.optInt("id")==id&&category.equals(row.optString("category")))found.set(true);}});
        if(found.get())return;Thread.sleep(30);waitForIdleSync();}throw new AssertionError("category timeout: "+category);}
    private void onUi(Runnable action){AtomicReference<Throwable> failure=new AtomicReference<>();runOnMainSync(()->{try{action.run();}catch(Throwable error){failure.set(error);}});if(failure.get()!=null)throw new AssertionError(failure.get());}
    private View root(){return activity.getWindow().getDecorView();}
    private boolean hasContaining(String text){AtomicReference<Boolean> result=new AtomicReference<>();onUi(()->result.set(findContaining(root(),text)!=null));return result.get();}
    private boolean hasText(String text){AtomicReference<Boolean> result=new AtomicReference<>();onUi(()->result.set(findText(root(),text)!=null));return result.get();}
    private EditText findHintOnUi(String hint){AtomicReference<EditText> result=new AtomicReference<>();onUi(()->result.set(findHint(root(),hint)));return result.get();}
    private TextView findText(View view,String text){
        if(view instanceof TextView&&((TextView)view).getText().toString().equals(text))return (TextView)view;
        if(view instanceof ViewGroup)for(int i=0;i<((ViewGroup)view).getChildCount();i++){TextView found=findText(((ViewGroup)view).getChildAt(i),text);if(found!=null)return found;}return null;
    }
    private TextView findContaining(View view,String text){
        if(view instanceof TextView&&((TextView)view).getText().toString().contains(text))return (TextView)view;
        if(view instanceof ViewGroup)for(int i=0;i<((ViewGroup)view).getChildCount();i++){TextView found=findContaining(((ViewGroup)view).getChildAt(i),text);if(found!=null)return found;}return null;
    }
    private EditText findHint(View view,String hint){
        if(view instanceof EditText&&hint.equals(String.valueOf(((EditText)view).getHint())))return (EditText)view;
        if(view instanceof ViewGroup)for(int i=0;i<((ViewGroup)view).getChildCount();i++){EditText found=findHint(((ViewGroup)view).getChildAt(i),hint);if(found!=null)return found;}return null;
    }
    private View findDescription(View view,String description){
        if(description.equals(String.valueOf(view.getContentDescription())))return view;
        if(view instanceof ViewGroup)for(int i=0;i<((ViewGroup)view).getChildCount();i++){View found=findDescription(((ViewGroup)view).getChildAt(i),description);if(found!=null)return found;}return null;
    }
    private CheckBox findBox(ViewGroup view){for(int i=0;i<view.getChildCount();i++)if(view.getChildAt(i) instanceof CheckBox)return (CheckBox)view.getChildAt(i);throw new AssertionError("checkbox missing");}
    private void check(boolean value,String name){if(!value)throw new AssertionError(name);checks++;}
    private void waitText(String text)throws Exception{for(int i=0;i<100;i++){AtomicReference<Boolean> ready=new AtomicReference<>(false);onUi(()->{TextView node=findText(root(),text);ready.set(node!=null&&node.isEnabled());});if(ready.get())return;Thread.sleep(30);waitForIdleSync();}throw new AssertionError("timeout: "+text);}
    private void settle()throws Exception{waitForIdleSync();Thread.sleep(250);waitForIdleSync();}
    private Object value(String name)throws Exception{Field f=MainActivity.class.getDeclaredField(name);f.setAccessible(true);return f.get(activity);}
    private void field(String name,Object value)throws Exception{Field f=MainActivity.class.getDeclaredField(name);f.setAccessible(true);f.set(activity,value);}
    private void invoke(String name)throws Exception{Method m=MainActivity.class.getDeclaredMethod(name);m.setAccessible(true);m.invoke(activity);}
    private void screenshot(String name)throws Exception{
        settle();
        String theme=(getTargetContext().getResources().getConfiguration().uiMode&android.content.res.Configuration.UI_MODE_NIGHT_MASK)==android.content.res.Configuration.UI_MODE_NIGHT_YES?"dark":"light";
        String destination="/sdcard/Download/familytodo-ui-fixture/"+theme+"-"+name+".png";
        shellOutput("mkdir -p /sdcard/Download/familytodo-ui-fixture");
        shellOutput("screencap -p "+destination);
        if(!shellOutput("ls "+destination).contains(name+".png"))throw new AssertionError("screenshot missing: "+destination);
    }
    private String shellOutput(String command)throws Exception{
        android.os.ParcelFileDescriptor result=getUiAutomation().executeShellCommand(command);
        try(java.io.InputStream input=new android.os.ParcelFileDescriptor.AutoCloseInputStream(result)){
            java.io.ByteArrayOutputStream bytes=new java.io.ByteArrayOutputStream();byte[] chunk=new byte[1024];int count;
            while((count=input.read(chunk))!=-1)bytes.write(chunk,0,count);
            return new String(bytes.toByteArray(),java.nio.charset.StandardCharsets.UTF_8);
        }
    }
}
