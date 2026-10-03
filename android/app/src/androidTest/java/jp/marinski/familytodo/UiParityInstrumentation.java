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
    private volatile int reactionWrites;
    private volatile boolean reactionSelected;
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
            testPresentationHelpers();
            testSpeechServer();
            testSpeechRequests();
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
            testChecklistDates();
            testMonthSwipes("goods");
            clickDescription("保育園を開閉");check(hasText("持ち物のテスト"),"items visible while shopping selected");clickDescription("保育園を開閉");
            clickText("🎒 持ち物");check(hasText("スーパー"),"shopping remains visible while item selected");
            clickText("🛒 買い物");
            testUnifiedGoodsSearch();
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
                JSONObject itemCatalog=(JSONObject)value("itemCategories");itemCatalog.put("categories",new JSONArray().put("保育園").put("古い持ち物"));itemCatalog.put("categoryMeta",new JSONArray().put(new JSONObject().put("name","古い持ち物").put("enabled",1).put("activated_at","2020-01-01T00:00:00Z")));
                invoke("render");
            }catch(Exception e){throw new RuntimeException(e);}});
            check(hasText("新しい空"),"fresh empty category at normal position");
            check(!hasText("古い空"),"archived empty hidden behind cluster");
            onUi(()->check(countDescription(root(),"空のカテゴリを開閉")==1,"both kinds share one empty cluster"));
            clickDescription("空のカテゴリを開閉");check(hasText("古い空"),"archived category inside cluster");check(hasText("古い持ち物"),"item archive joins shared cluster");
            clickDescription("古い空に追加");check(findHintOnUi("新しい買い物")!=null,"archived category can reopen for entry");
            screenshot("checklist");onUi(()->{TextView event=findText(root(),"📅 イベント");check(event!=null&&event.getLineCount()==1,"event tab stays on one line beside AI input");check(event.getLayout()!=null&&event.getLayout().getEllipsisCount(0)==0&&event.getPaint().measureText(event.getText().toString())<=event.getWidth()-event.getPaddingLeft()-event.getPaddingRight(),"event tab text fits available width");});
            clickText("🎒 持ち物");clickDescription("保育園を開閉");check(hasText("持ち物のテスト"),"item catalog stays separate");screenshot("items");
            testGoodsCompletionDisplay();
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
            onUi(()->{View stamp=findDescription(root(),"スタンプ カレンダーテスト");check(stamp!=null,"calendar contains stamp thumbnail");
                View summary=findText(root(),"✅ 1件");int[] stampAt=new int[2],summaryAt=new int[2];stamp.getLocationOnScreen(stampAt);summary.getLocationOnScreen(summaryAt);
                check(stampAt[1]>=summaryAt[1]+summary.getHeight(),"calendar stamps do not cover checklist count with four events and bands");});
            testCalendarPresses();
            testCalendarDates();
            testCalendarFilters();
            testCalendarOrder();
            testNavigationBounds();
            testMonthSwipes("calendar");
            screenshot("calendar");
            testBackgroundSave(LocalDate.parse(day),"PRIVATE",99,false);
            check("PRIVATE".equals(lastBackgroundScope),"background retains scope on failed save");
            testBackgroundSave(LocalDate.parse(day),"FAMILY",1,true);
            check("POST".equals(lastBackgroundMethod)&&"FAMILY".equals(lastBackgroundScope),"background family placement request");
            testBackgroundSave(LocalDate.parse(day),"PRIVATE",0,true);
            check("DELETE".equals(lastBackgroundMethod)&&"PRIVATE".equals(lastBackgroundScope),"background private removal request");
            ApiClient.setMutationsEnabled(false);int previousWrites=backgroundWrites;testBackgroundSave(LocalDate.parse(day),"FAMILY",1,false);check(backgroundWrites==previousWrites,"read-only background cannot write");ApiClient.setMutationsEnabled(true);
            navigate("位置情報");check(hasText("テスト家族"),"location summary renders");screenshot("location");
            onUi(()->{try{field("selectedDay",LocalDate.parse(day));field("month",YearMonth.parse(day.substring(0,7)));field("familyLog",family);}catch(Exception e){throw new RuntimeException(e);}});navigate("家族ログ");check(hasText("📓 成長日記"),"journal navigation exists");check(hasText("📊 まとめ"),"summary navigation exists");onUi(()->{try{
                View clock=findText(root(),"09:00"),entry=findText(root(),"ミルク  160ml");
                check(clock!=null&&entry!=null,"family log exposes clock and content");
                check(clock.getParent().getParent()==entry.getParent().getParent(),"family log clock and content share a horizontal record");
                ViewGroup dock=(ViewGroup)value("pageDock");check(dock.getHeight()<140*activity.getResources().getDisplayMetrics().density,"quick dock leaves room for timeline");
                JSONArray subjects=family.getJSONArray("subjects");subjects.put(new JSONObject().put("id",999).put("name","記録なしの対象").put("subject_kind","BABY"));field("familyLogSubjectId",999);invoke("render");check(findText(root(),"記録はありません。")!=null,"selected subject with no records has an empty state");subjects.remove(subjects.length()-1);field("familyLogSubjectId",0);invoke("render");
            }catch(Exception e){throw new RuntimeException(e);}});settle();screenshot("familylog");
            navigate("伝言");check(hasText("伝言のテスト"),"message renders");check(findHintOnUi("メッセージ")!=null,"bottom composer exists");
            onUi(()->{View body=findText(root(),"伝言のテスト"),bubble=(View)body.getParent(),stack=(View)bubble.getParent();
                check(bubble.getWidth()<stack.getWidth(),"own bubble fits short text");
                check(bubble.getRight()==stack.getWidth(),"own bubble aligned right");
            });screenshot("messages");
            JSONArray history=new JSONArray().put(new JSONObject().put("id",1)).put(new JSONObject().put("id",2));
            JSONArray latest=new JSONArray().put(new JSONObject().put("id",2).put("text","updated")).put(new JSONObject().put("id",3));
            JSONArray merged=MainActivity.mergeMessagePage(history,latest,0,true);
            check(merged.length()==3&&merged.optJSONObject(0).optInt("id")==1,"latest refresh retains previously loaded history");
            check(merged.optJSONObject(1).optString("text").equals("updated"),"latest refresh updates existing message");
            check(MainActivity.mergeMessagePage(merged,history,2,true).length()==3,"repeated older page deduplicates IDs");
            check(MainActivity.mergeMessagePage(merged,latest,0,false).length()==2,"complete refresh removes stale history");
            onUi(()->{View speech=findText(root(),"外出先読み上げ: ＋メニューで設定");
                check(speech instanceof CheckBox&&!speech.isEnabled(),"fixture APK cannot enable unconfigured remote speech");});
            testMessageScroll(messages);
            testReactionChips();
            onUi(()->{try{field("tab","goods");field("goodsKind","shopping");invoke("render");if(ApiClient.canMutate()){check(findDescription(root(),"タスク・イベントのAI入力")!=null,"task AI entry exists");check(findDescription(root(),"買い物のAI入力")!=null,"shopping AI entry exists");field("goodsKind","item");invoke("render");check(findDescription(root(),"持ち物のAI入力")!=null,"item AI entry exists");field("goodsKind","shopping");invoke("render");}}catch(Exception e){throw new RuntimeException(e);}});
            testChildComposer();
            testSelectedSets();
            testSettingsHub();
            testSummaryWindow();
            testMeasurementSummary();
            testSummaryCancellation();
            status.putString("stream","\nPassed "+checks+" native UI checks.\n");sendStatus(0,status);
            Bundle results=new Bundle();results.putString("stream","\nOK (1 test)\n");finish(Activity.RESULT_OK,results);
        }catch(Throwable error){
            status.putString("stack",android.util.Log.getStackTraceString(error));status.putString("stream",error.toString());sendStatus(-2,status);
            Bundle results=new Bundle();results.putString("stream","FAILURES!!!\n"+android.util.Log.getStackTraceString(error));finish(Activity.RESULT_CANCELED,results);
        }
    }
    private void testCalendarPresses()throws Exception {
        onUi(()->{
            int[] counts={0,0,0};View target=new View(activity);target.setOnClickListener(v->counts[0]++);target.setOnLongClickListener(v->{counts[2]++;return true;});
            CalendarPressListener listener=new CalendarPressListener(target,()->counts[1]++);
            long base=android.os.SystemClock.uptimeMillis();
            for(long duration:new long[]{100,299,300,650,899,900,1100}){
                android.view.MotionEvent down=android.view.MotionEvent.obtain(base,base,0,5,5,0),up=android.view.MotionEvent.obtain(base,base+duration,1,5,5,0);
                listener.onTouch(target,down);listener.onTouch(target,up);down.recycle();up.recycle();
            }
            check(counts[0]==2&&counts[1]==3&&counts[2]==2,"short/preview/menu boundaries dispatch once");
            android.view.MotionEvent down=android.view.MotionEvent.obtain(base,base,0,5,5,0),move=android.view.MotionEvent.obtain(base,base+400,2,300,5,0),up=android.view.MotionEvent.obtain(base,base+650,1,300,5,0);
            listener.onTouch(target,down);listener.onTouch(target,move);listener.onTouch(target,up);down.recycle();move.recycle();up.recycle();
            check(counts[0]==2&&counts[1]==3&&counts[2]==2,"drag cannot open preview or menu");
            down=android.view.MotionEvent.obtain(base,base,0,5,5,0);android.view.MotionEvent cancel=android.view.MotionEvent.obtain(base,base+400,3,5,5,0);up=android.view.MotionEvent.obtain(base,base+650,1,5,5,0);
            listener.onTouch(target,down);listener.onTouch(target,cancel);listener.onTouch(target,up);down.recycle();cancel.recycle();up.recycle();check(counts[1]==3,"parent scroll cancellation cannot preview");
        });
    }
    private void testSpeechRequests(){
        SpeechRequestGate gate=new SpeechRequestGate();Object speaker=new Object(),other=new Object();
        String first=gate.begin(speaker);check(first!=null&&gate.busy(),"speech begins busy");
        check(gate.begin(speaker)==null,"double tap cannot queue duplicate speech");
        gate.cancel();String retry=gate.begin(other);
        check(!gate.prepare(first)&&gate.current(retry),"late synthesis from disconnected speaker cannot affect retry");
        check(gate.prepare(retry)&&!gate.prepare(retry),"duplicate TTS completion cannot send twice");
        check(!gate.load(retry,speaker),"speech cannot transfer to a different Cast session");
        check(gate.load(retry,other)&&!gate.load(retry,other),"media request accepted once for original session");
        check(gate.accepted(retry)&&!gate.busy(),"load acknowledgement permits another deliberate request");
        String next=gate.begin(other);check(next!=null&&!gate.accepted(retry),"stale load callback cannot release a newer request");
        gate.cancel();check(!gate.current(next)&&gate.begin(speaker)!=null,"timeout cancellation allows retry");
        gate.close();check(gate.begin(speaker)==null&&!gate.prepare(next),"closed speech dialog rejects queued work");
    }
    private void testSpeechServer()throws Exception {
        java.io.File audio=java.io.File.createTempFile("speech-test-",".wav",getTargetContext().getCacheDir());java.nio.file.Files.write(audio.toPath(),new byte[]{1,2,3,4,5});
        try(SpeechAudioServer server=new SpeechAudioServer(java.net.InetAddress.getByName("127.0.0.1"),audio)){
            java.net.URI uri=java.net.URI.create(server.url());String path=uri.getPath();
            String full=speechRequest(uri,path,"GET","");check(full.contains("200 OK")&&full.contains("Content-Length: 5"),"Cast WAV GET provides length");
            String range=speechRequest(uri,path,"GET","Range: bytes=1-3\r\n");check(range.contains("206 Partial Content")&&range.endsWith(new String(new byte[]{2,3,4},java.nio.charset.StandardCharsets.ISO_8859_1)),"Cast WAV range returns requested bytes");
            String head=speechRequest(uri,path,"HEAD","");check(head.endsWith("\r\n\r\n")&&head.contains("Content-Length: 5"),"Cast WAV HEAD omits audio body");
            check(speechRequest(uri,"/unknown","GET","").contains("404"),"other file paths are inaccessible");
            check(speechRequest(uri,path,"GET","Range: bytes=99-\r\n").contains("416"),"invalid Cast range rejected");
            try(java.net.Socket incomplete=new java.net.Socket(uri.getHost(),uri.getPort())){
                incomplete.setSoTimeout(2000);incomplete.getOutputStream().write(("GET "+path+" HTTP/1.1\r\nHost: localhost").getBytes(java.nio.charset.StandardCharsets.US_ASCII));incomplete.shutdownOutput();
                check(incomplete.getInputStream().read()==-1,"incomplete headers cannot fetch speech audio");
            }

        }finally{audio.delete();}
        java.io.File shortAudio=java.io.File.createTempFile("speech-expiry-",".wav",getTargetContext().getCacheDir());java.nio.file.Files.write(shortAudio.toPath(),new byte[]{1});
        try(SpeechAudioServer server=new SpeechAudioServer(java.net.InetAddress.getByName("127.0.0.1"),shortAudio,1000)){
            java.net.URI uri=java.net.URI.create(server.url());
            try(java.net.Socket stalled=new java.net.Socket(uri.getHost(),uri.getPort())){
                stalled.setSoTimeout(5000);stalled.getOutputStream().write("GET /".getBytes(java.nio.charset.StandardCharsets.US_ASCII));
                boolean ended=false;try{ended=stalled.getInputStream().read()==-1;}catch(java.net.SocketException closed){ended=true;}
                check(ended,"audio expiry closes an active incomplete request");
            }
        }finally{shortAudio.delete();}
    }
    private String speechRequest(java.net.URI uri,String path,String method,String headers)throws Exception {
        try(java.net.Socket socket=new java.net.Socket(uri.getHost(),uri.getPort())){
            socket.setSoTimeout(4000);socket.getOutputStream().write((method+" "+path+" HTTP/1.1\r\nHost: localhost\r\n"+headers+"\r\n").getBytes(java.nio.charset.StandardCharsets.US_ASCII));
            java.io.ByteArrayOutputStream response=new java.io.ByteArrayOutputStream();byte[] buffer=new byte[1024];int n;while((n=socket.getInputStream().read(buffer))!=-1)response.write(buffer,0,n);return response.toString("ISO-8859-1");
        }
    }
    private JSONObject settingsFixture(String role)throws Exception {
        return new JSONObject().put("role",role).put("member_id",1).put("name","テスト家族")
            .put("notification_enabled",true).put("timezone","Asia/Tokyo").put("display_name","家族")
            .put("members",new JSONArray().put(new JSONObject().put("id",1).put("name","テスト家族").put("role",role)));
    }
    private void testSettingsHub()throws Exception {
        AtomicReference<android.app.AlertDialog> popup=new AtomicReference<>();AtomicReference<EditText> input=new AtomicReference<>();
        onUi(()->{try{
            Method hub=MainActivity.class.getDeclaredMethod("showAppSettings",JSONObject.class);hub.setAccessible(true);
            for(String role:new String[]{"MEMBER","ADMIN","OWNER"}) {
                android.app.AlertDialog d=(android.app.AlertDialog)hub.invoke(activity,settingsFixture(role));View view=d.getWindow().getDecorView();
                check(findText(view,"自分・端末")!=null&&findText(view,"家族")!=null&&findText(view,"外部連携")!=null,"grouped settings "+role);
                check((findText(view,"家族を招待")!=null)==!role.equals("MEMBER"),"invite role boundary "+role);
                check((findText(view,"家族のタイムゾーン")!=null)==!role.equals("MEMBER"),"timezone role boundary "+role);
                check(findText(view,"位置共有・端末の権限")!=null,"native location still reachable");
                if(role.equals("ADMIN"))popup.set(d);else d.dismiss();
                if(role.equals("ADMIN"))d.dismiss();
            }
            popup.set((android.app.AlertDialog)hub.invoke(activity,settingsFixture("OWNER")));
        }catch(Exception e){throw new RuntimeException(e);}});screenshot("settings-hub");onUi(()->popup.get().dismiss());
        onUi(()->{try{
            Method edit=MainActivity.class.getDeclaredMethod("editAppSettingText",String.class,String.class,boolean.class);edit.setAccessible(true);
            popup.set((android.app.AlertDialog)edit.invoke(activity,"プロフィール名","元の名前",false));
            input.set(findText(popup.get().getWindow().getDecorView(),"元の名前") instanceof EditText?(EditText)findText(popup.get().getWindow().getDecorView(),"元の名前"):null);
            check(input.get()!=null,"profile editor present");input.get().setText("");popup.get().getButton(-1).performClick();
            check(popup.get().isShowing()&&input.get().getError()!=null&&settingsWrites==0,"invalid profile keeps editor without request");
            input.get().setText("失敗プロフィール");popup.get().getButton(-1).performClick();popup.get().getButton(-1).performClick();
        }catch(Exception e){throw new RuntimeException(e);}});
        for(int i=0;i<100&&settingsWrites<1;i++)Thread.sleep(20);settle();
        onUi(()->{check(settingsWrites==1&&popup.get().isShowing(),"failure remains open and no duplicate write");check(input.get().getText().toString().equals("失敗プロフィール")&&input.get().getError()!=null,"failed profile retains draft");
            ApiClient.setMutationsEnabled(false);input.get().setText("成功プロフィール");popup.get().getButton(-1).performClick();check(settingsWrites==1,"read-only setting cannot write");ApiClient.setMutationsEnabled(true);
            popup.get().getButton(-1).performClick();});
        for(int i=0;i<100&&settingsWrites<2;i++)Thread.sleep(20);settle();
        onUi(()->check(!popup.get().isShowing()&&settingsWrites==2,"retry succeeds once"));
        // Closing the refreshed hub via Back keeps the fixture activity available.
        shellOutput("input keyevent 4");settle();
    }
    private final java.util.concurrent.CountDownLatch summaryStarted=new java.util.concurrent.CountDownLatch(1),summaryRelease=new java.util.concurrent.CountDownLatch(1);
    private volatile int summaryRequests;
    private void testSummaryCancellation()throws Exception {
        AtomicReference<android.app.AlertDialog> popup=new AtomicReference<>();AtomicReference<java.util.concurrent.ExecutorService> executor=new AtomicReference<>();
        onUi(()->{try {
            field("tab","familylog");Method load=MainActivity.class.getDeclaredMethod("loadFamilyLogSummary",LocalDate.class,LocalDate.class,int.class,String.class);load.setAccessible(true);
            check(load.invoke(activity,LocalDate.of(1999,12,31),LocalDate.of(2000,1,1),0,"テスト")==null,"API year bounds validated before request");
            popup.set((android.app.AlertDialog)load.invoke(activity,LocalDate.of(2024,1,1),LocalDate.of(2026,12,31),0,"テスト"));executor.set((java.util.concurrent.ExecutorService)value("network"));
        }catch(Exception e){throw new RuntimeException(e);}});
        check(summaryStarted.await(5,java.util.concurrent.TimeUnit.SECONDS),"summary first chunk started");
        onUi(()->popup.get().getButton(-2).performClick());summaryRelease.countDown();executor.get().submit(()->{}).get(5,java.util.concurrent.TimeUnit.SECONDS);settle();
        check(summaryRequests==1,"cancel stops remaining three-year chunk requests");onUi(()->check(!popup.get().isShowing(),"cancel closes progress"));
    }
    private void testMeasurementSummary()throws Exception {
        JSONObject latest=new JSONObject();
        FamilyLogMeasurements.mergeLatest(latest,new JSONArray().put(new JSONObject().put("id",1).put("log_type","WEIGHT").put("amount",99).put("occurred_at","2026-08-01 09:00:00")));
        FamilyLogMeasurements.mergeLatest(latest,new JSONArray().put(new JSONObject().put("id",2).put("log_type","WEIGHT").put("amount",0).put("occurred_at","2026-09-01 09:00:00")));
        FamilyLogMeasurements.mergeLatest(latest,new JSONArray().put(new JSONObject().put("id",3).put("log_type","WEIGHT").put("amount",1).put("occurred_at","2026-09-01 09:00:00")));
        check(latest.getJSONObject("WEIGHT").getDouble("amount")==1,"latest merges by timestamp then id across chunks");
        JSONArray days=new JSONArray().put(new JSONObject().put("day","2026-09-01").put("temperatureMax",39.1)).put(new JSONObject().put("day","2026-09-02").put("temperatureMax",JSONObject.NULL)).put(new JSONObject().put("day","2026-09-03").put("temperatureMax",0));
        check(FamilyLogMeasurements.points(days,"temperatureMax",LocalDate.parse("2026-09-01"),LocalDate.parse("2026-09-03")).size()==2,"chart keeps zero and excludes missing measurement");
        AtomicReference<android.app.AlertDialog> popup=new AtomicReference<>();
        onUi(()->{FamilyLogMeasurements.Chart chart=new FamilyLogMeasurements.Chart(activity,days,"temperatureMax",LocalDate.parse("2026-09-01"),LocalDate.parse("2026-09-03"));
            android.widget.LinearLayout panel=new android.widget.LinearLayout(activity);panel.addView(chart,new android.widget.LinearLayout.LayoutParams(-1,440));
            popup.set(new android.app.AlertDialog.Builder(activity).setTitle("体温の推移").setView(panel).setPositiveButton("閉じる",null).show());
            check(chart.getContentDescription().toString().contains("39.1"),"chart exposes measurements for accessibility");});screenshot("measurement-chart");onUi(()->popup.get().dismiss());
    }
    private void testSummaryWindow()throws Exception {
        AtomicReference<android.app.AlertDialog> popup=new AtomicReference<>();LocalDate first=LocalDate.of(2026,7,1),last=LocalDate.of(2026,9,30);
        onUi(()->{try{
            Method show=MainActivity.class.getDeclaredMethod("showFamilyLogSummary",JSONArray.class,JSONObject.class,LocalDate.class,LocalDate.class,String.class);show.setAccessible(true);
            JSONArray days=new JSONArray().put(new JSONObject().put("day","2026-07-01").put("milkMl",120)).put(new JSONObject().put("day","2026-09-30").put("milkMl",160));
            popup.set((android.app.AlertDialog)show.invoke(activity,days,new JSONObject().put("milkMl",280),first,last,"テスト"));View view=popup.get().getWindow().getDecorView();
            check(!findText(view,"次の30日 ›").isEnabled(),"graph starts at latest boundary");
            findText(view,"‹ 前の30日").performClick();check(findContaining(view,"2026-08-02 〜 2026-08-31")!=null,"graph reaches previous fetched month");
            findText(view,"‹ 前の30日").performClick();findText(view,"‹ 前の30日").performClick();
            check(!findText(view,"‹ 前の30日").isEnabled()&&findContaining(view,"2026-07-01 〜 2026-07-02")!=null,"graph reaches exact range start");
            check(findText(view,"120")!=null,"earliest record visible");findText(view,"次の30日 ›").performClick();check(findContaining(view,"2026-07-03 〜 2026-08-01")!=null,"graph advances without lost dates");
        }catch(Exception e){throw new RuntimeException(e);}});screenshot("summary-history");onUi(()->popup.get().dismiss());
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
            title.get().setText("子タスクのテスト");check(((CheckBox)findText(form,"期限なし")).isChecked(),"child defaults to undated as Web inline composer");
        }catch(Exception e){throw new RuntimeException(e);}});
        screenshot("child-composer");
        onUi(()->{popup.get().getButton(android.app.AlertDialog.BUTTON_POSITIVE).performClick();popup.get().getButton(android.app.AlertDialog.BUTTON_POSITIVE).performClick();});
        for(int i=0;i<100&&taskCreates<1;i++)Thread.sleep(20);settle();
        String firstKey=lastTaskCreate.optString("idempotency_key");
        onUi(()->{check(taskCreates==1,"child creation double submit blocked");check(popup.get().isShowing()&&title.get().getText().toString().equals("子タスクのテスト"),"failed child save retains title");check(popup.get().getButton(android.app.AlertDialog.BUTTON_POSITIVE).isEnabled(),"child save failure permits retry");check(findContaining(popup.get().getWindow().getDecorView(),"保存できませんでした")!=null,"child save error visible");popup.get().getButton(android.app.AlertDialog.BUTTON_POSITIVE).performClick();});
        for(int i=0;i<100&&taskCreates<2;i++)Thread.sleep(20);settle();
        check(lastTaskCreate.optInt("parent_task_id")==10&&"PRIVATE".equals(lastTaskCreate.optString("visibility_scope")),"child request carries parent and matching scope");
        check(lastTaskCreate.optBoolean("noDate")&&lastTaskCreate.optString("dateOnly").isEmpty()&&!lastTaskCreate.optBoolean("is_event")&&!lastTaskCreate.optBoolean("calendar_visible"),"undated child task request");
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
    private volatile int selectedSetWrites;
    private volatile JSONObject lastSelectedSet;
    private void testSelectedSets()throws Exception {
        for(boolean shopping:new boolean[]{true,false}){
            AtomicReference<android.app.AlertDialog> popup=new AtomicReference<>();
            JSONObject set=new JSONObject().put("id",1).put("name","選択セット").put("entries",new JSONArray()
                .put(new JSONObject().put("id",11).put("name","選ぶ項目").put("quantity","2"))
                .put(new JSONObject().put("id",12).put("name","選ばない項目")));
            onUi(()->{try{Method method=MainActivity.class.getDeclaredMethod("chooseReusableSetItems",boolean.class,JSONObject.class,String.class);method.setAccessible(true);popup.set((android.app.AlertDialog)method.invoke(activity,shopping,set,"2026-10-03"));}catch(Exception e){throw new RuntimeException(e);}});settle();
            onUi(()->{View form=popup.get().getWindow().getDecorView();CheckBox chosen=(CheckBox)findText(form,shopping?"選ぶ項目 × 2":"選ぶ項目");CheckBox other=(CheckBox)findText(form,shopping?"選ばない項目 × 1":"選ばない項目");check(!chosen.isChecked()&&!other.isChecked(),"set starts without selections");chosen.setChecked(true);popup.get().getButton(-1).performClick();});settle();
            String rid=lastSelectedSet.optString("client_request_id");
            onUi(()->{View form=popup.get().getWindow().getDecorView();check(popup.get().isShowing(),"failed set remains open");check(((CheckBox)findText(form,shopping?"選ぶ項目 × 2":"選ぶ項目")).isChecked(),"failed set retains selection");popup.get().getButton(-1).performClick();popup.get().getButton(-1).performClick();});settle();
            check(lastSelectedSet.optJSONArray("entry_ids").length()==1&&lastSelectedSet.optJSONArray("entry_ids").optInt(0)==11,"only chosen entry sent");check(lastSelectedSet.optString("target_category").isEmpty(),"unclassified category explicit");check(rid.equals(lastSelectedSet.optString("client_request_id")),"retry retains request id");
            onUi(()->check(!popup.get().isShowing(),"successful set closes chooser"));
        }
    }
    private volatile int settingsWrites;
    private JSONObject response(String path,JSONObject body,String method)throws Exception{
        if(path.startsWith("/api/android/v1/family-log-summary?")){summaryRequests++;summaryStarted.countDown();summaryRelease.await(5,java.util.concurrent.TimeUnit.SECONDS);return new JSONObject().put("totals",new JSONObject()).put("daily",new JSONArray());}

        if(path.equals("/api/android/v1/settings"))return settingsFixture("OWNER");
        if(path.equals("/api/settings")&&body!=null){settingsWrites++;if(body.optString("name").equals("失敗プロフィール"))throw new IllegalStateException("synthetic settings failure");return new JSONObject().put("ok",true);}

        if(path.equals("/api/message-reactions")){reactionWrites++;if(body.optString("emoji").equals("失敗"))throw new IllegalStateException("synthetic reaction failure");reactionSelected=!reactionSelected;return new JSONObject().put("ok",true);}
        if(path.startsWith("/api/message-reactions?ids="))return new JSONObject().put("ok",true).put("emojis",new JSONArray().put("👍")).put("reactions",new JSONArray().put(new JSONObject().put("messageId",1).put("emoji","👍").put("count",reactionSelected?3:2).put("mine",reactionSelected)));
        if((path.equals("/api/item")||path.equals("/api/shopping"))&&body!=null&&body.optString("action").equals("reusable_set_invoke_selected")){
            lastSelectedSet=new JSONObject(body.toString());selectedSetWrites++;if(selectedSetWrites%2==1)throw new IllegalStateException("synthetic set failure");return new JSONObject().put("ok",true);
        }
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
    private int countDescription(View view,String description){int count=description.contentEquals(view.getContentDescription()==null?"":view.getContentDescription())?1:0;if(view instanceof ViewGroup){ViewGroup group=(ViewGroup)view;for(int i=0;i<group.getChildCount();i++)count+=countDescription(group.getChildAt(i),description);}return count;}
    private void testChecklistDates()throws Exception {
        AtomicReference<LocalDate> initial=new AtomicReference<>();AtomicReference<android.app.DatePickerDialog> picker=new AtomicReference<>();
        onUi(()->{try{initial.set((LocalDate)value("selectedDay"));}catch(Exception e){throw new RuntimeException(e);}});
        clickDescription("前日を表示");onUi(()->{try{check(value("selectedDay").equals(initial.get().minusDays(1)),"previous day navigation");}catch(Exception e){throw new RuntimeException(e);}});
        clickDescription("翌日を表示");onUi(()->{try{check(value("selectedDay").equals(initial.get()),"next day navigation");Method pick=MainActivity.class.getDeclaredMethod("pickChecklistDate");pick.setAccessible(true);picker.set((android.app.DatePickerDialog)pick.invoke(activity));}catch(Exception e){throw new RuntimeException(e);}});settle();
        onUi(()->{java.time.ZoneId zone=java.time.ZoneId.systemDefault();check(java.time.Instant.ofEpochMilli(picker.get().getDatePicker().getMinDate()).atZone(zone).toLocalDate().equals(LocalDate.of(2000,1,1)),"date picker follows overview lower date bound");check(java.time.Instant.ofEpochMilli(picker.get().getDatePicker().getMaxDate()).atZone(zone).toLocalDate().equals(LocalDate.of(2100,12,31)),"date picker follows overview upper date bound");picker.get().getDatePicker().updateDate(2028,1,29);});settle();
        onUi(()->{check(picker.get().getButton(-1).isEnabled(),"picked date can confirm");picker.get().getButton(-1).performClick();});settle();
        onUi(()->{try{check(value("selectedDay").equals(LocalDate.of(2028,2,29)),"date picker accepts leap day: "+value("selectedDay"));check(value("month").equals(YearMonth.of(2028,2)),"date picker changes overview month");field("selectedDay",initial.get());field("month",YearMonth.from(initial.get()));invoke("render");}catch(Exception e){throw new RuntimeException(e);}});settle();
    }
    private void testCalendarDates()throws Exception {
        AtomicReference<android.app.AlertDialog> picker=new AtomicReference<>();
        onUi(()->{try{Method pick=MainActivity.class.getDeclaredMethod("pickCalendarMonth");pick.setAccessible(true);picker.set((android.app.AlertDialog)pick.invoke(activity));}catch(Exception e){throw new RuntimeException(e);}});settle();
        onUi(()->{View form=picker.get().getWindow().getDecorView();((android.widget.Spinner)findDescription(form,"移動する年")).setSelection(28);((android.widget.Spinner)findDescription(form,"移動する月")).setSelection(1);});settle();
        onUi(()->picker.get().getButton(-1).performClick());settle();
        onUi(()->{try{check(value("month").equals(YearMonth.of(2028,2)),"calendar month picker confirms year and month: "+value("month"));}catch(Exception e){throw new RuntimeException(e);}});
        clickDescription("今月のカレンダーを表示");onUi(()->{try{check(value("month").equals(YearMonth.now(java.time.ZoneId.of("Asia/Tokyo"))),"calendar returns to current JST month");}catch(Exception e){throw new RuntimeException(e);}});
        clickDescription("カレンダーの表示設定");clickDescription("今日のチェックリストを表示");onUi(()->{try{check(value("tab").equals("goods"),"calendar today opens checklist");check(value("selectedDay").equals(LocalDate.now(java.time.ZoneId.of("Asia/Tokyo"))),"today checklist selects JST date");field("calendarFiltersExpanded",false);}catch(Exception e){throw new RuntimeException(e);}});navigate("カレンダー");
    }
    private void testGoodsCompletionDisplay()throws Exception {
        onUi(()->{try{JSONArray original=snapshot.optJSONArray("shopping");boolean initial=(boolean)value("goodsCompleted");
            JSONArray rows=new JSONArray(original.toString());rows.put(new JSONObject().put("id",901).put("name","古い完了履歴").put("status","completed").put("completed_at","2000-01-01 12:00:00"));
            rows.put(new JSONObject().put("id",902).put("name","直近の完了").put("status","completed").put("completed_at",java.time.Instant.now().toString()));
            snapshot.put("shopping",rows);field("goodsCompleted",true);invoke("render");
            check(findText(root(),"完了済み 1")!=null,"completed count excludes expired rows across kinds");
            // Rows are constructed even when their category is collapsed.
            check(rows.length()==original.length()+2&&snapshot.optJSONArray("shopping")==rows,"checklist completion filter does not mutate calendar snapshot");
            @SuppressWarnings("unchecked") java.util.Set<String> expanded=(java.util.Set<String>)value("expandedGoodsCategories");String key=value("sessionEpoch")+":shopping:未分類";boolean wasOpen=expanded.contains(key);expanded.add(key);invoke("render");
            check(findText(root(),"直近の完了")!=null&&findText(root(),"古い完了履歴")==null,"only retained completed rows render in category");
            if(!wasOpen)expanded.remove(key);snapshot.put("shopping",original);field("goodsCompleted",initial);invoke("render");
        }catch(Exception e){throw new RuntimeException(e);}});settle();
    }
    private void testPresentationHelpers()throws Exception {
        JSONObject task=new JSONObject().put("start_at","2026-10-02 09:00:00").put("title","９：００ ～ 登園");
        check(CalendarPresentation.label(task,true).equals("09:00 登園"),"NFKC matching time prefix removed");
        task.put("title","9:00 登園");check(CalendarPresentation.label(task,true).equals("09:00 登園"),"short hour matching prefix removed");
        task.put("title","10:00 登園");check(CalendarPresentation.label(task,true).equals("09:00 10:00 登園"),"different title time retained");
        task.put("title","9:00");check(CalendarPresentation.label(task,true).equals("09:00 9:00"),"empty stripped title falls back like Web");
        task.put("all_day",1);check(CalendarPresentation.label(task,true).equals("9:00"),"all-day title unchanged");
        task.put("all_day",0);check(CalendarPresentation.label(task,false).equals("9:00"),"band title unchanged");
        task.put("start_at","invalid");check(CalendarPresentation.label(task,true).equals("9:00"),"invalid start has no time prefix");
        java.util.ArrayList<JSONObject> rows=new java.util.ArrayList<>();JSONObject parent=new JSONObject().put("id",100);rows.add(parent);
        check(CalendarPresentation.checklistCount(rows,null)==1,"standalone task count");
        rows.add(new JSONObject().put("id",101).put("parent_task_id",100));rows.add(new JSONObject().put("id",102).put("parent_task_id",100));
        check(CalendarPresentation.checklistCount(rows,null)==2,"dated children replace parent count");
        JSONArray undated=new JSONArray().put(new JSONObject().put("id",103).put("parent_task_id",100)).put(new JSONObject().put("id",104).put("parent_task_id",999));
        check(CalendarPresentation.checklistCount(rows,undated)==3,"dated and undated children combine only for visible parent");
        rows.remove(0);check(CalendarPresentation.checklistCount(rows,undated)==2,"hidden parent undated children not counted");
        rows.clear();rows.add(parent);check(CalendarPresentation.checklistCount(rows,undated)==1,"undated child replaces parent count");
        rows.add(new JSONObject().put("id",-200));check(CalendarPresentation.checklistCount(rows,undated)==2,"recurring task counts independently");
        long midnight=java.time.Instant.parse("2026-10-01T15:00:00Z").toEpochMilli(),one=midnight+3600000;
        JSONObject goods=new JSONObject().put("status","completed").put("completed_at","2026-10-01 23:00:00");
        check(GoodsCompletion.visible(goods,midnight),"23:00 completion remains at midnight");
        check(!GoodsCompletion.visible(goods,one),"previous day completion expires at 01:00 JST");
        goods.put("completed_at","2026-10-01T14:00:00Z");check(GoodsCompletion.visible(goods,one-1),"UTC completion uses JST grace");
        goods.put("completed_at","2026-10-01 22:59:59");check(!GoodsCompletion.visible(goods,midnight),"before 23:00 expires at midnight");
        goods.put("completed_at",JSONObject.NULL).put("updated_at","2026-10-02 00:00:00");check(GoodsCompletion.visible(goods,one),"timestamp fallback keeps today's completion");
        goods.put("updated_at","bad");check(!GoodsCompletion.visible(goods,one),"malformed timestamp excluded");
        goods.remove("updated_at");check(GoodsCompletion.visible(goods,one),"legacy overview omission remains compatible");
        goods.put("status","pending").put("completed_at","bad");check(GoodsCompletion.visible(goods,one),"undo remains visible");
        check(GoodsCompletion.nextBoundary(midnight)==one&&GoodsCompletion.nextBoundary(one)==midnight+86400000,"completion timer matches midnight and 01:00 boundaries");
    }
    private void testCalendarOrder()throws Exception {
        AtomicReference<JSONArray> original=new AtomicReference<>();
        onUi(()->{try{original.set(snapshot.optJSONArray("tasks"));String day=((LocalDate)value("selectedDay")).toString();
            snapshot.put("tasks",new JSONArray()
                .put(new JSONObject().put("id",91).put("sort_order",2).put("title","順序後").put("task_kind","EVENT").put("all_day",1).put("start_at",day+" 00:00:00"))
                .put(new JSONObject().put("id",93).put("sort_order",1).put("title","09:00 順序先").put("task_kind","EVENT").put("start_at",day+" 09:00:00"))
                .put(new JSONObject().put("id",92).put("sort_order",1).put("title","同順序小ID").put("task_kind","EVENT").put("start_at",day+" 15:00:00")));
            invoke("render");View first=findText(root(),"15:00 同順序小ID"),second=findText(root(),"09:00 順序先"),third=findText(root(),"順序後");
            check(first!=null&&second!=null&&third!=null,"calendar chips use de-duplicated display labels");
            ViewGroup group=(ViewGroup)first.getParent();check(group.indexOfChild(first)<group.indexOfChild(second)&&group.indexOfChild(second)<group.indexOfChild(third),"calendar honours sort_order then id regardless of time or all-day");
            check("09:00 順序先".contentEquals(second.getContentDescription()),"calendar accessibility includes time without duplication");
            JSONArray originalChildren=snapshot.optJSONArray("undatedChildren");
            snapshot.put("tasks",new JSONArray().put(new JSONObject().put("id",100).put("task_kind","TASK").put("due_at",day))
                .put(new JSONObject().put("id",101).put("parent_task_id",100).put("task_kind","TASK").put("due_at",day))
                .put(new JSONObject().put("id",102).put("parent_task_id",100).put("task_kind","TASK").put("due_at",day)));
            snapshot.put("undatedChildren",new JSONArray().put(new JSONObject().put("id",103).put("parent_task_id",100)));invoke("render");
            check(findText(root(),"✅ 3件")!=null,"calendar rendered badge counts children without additional parent");
            if(originalChildren==null)snapshot.remove("undatedChildren");else snapshot.put("undatedChildren",originalChildren);
            snapshot.put("tasks",original.get());invoke("render");
        }catch(Exception e){throw new RuntimeException(e);}});settle();
    }
    private void testNavigationBounds()throws Exception {
        onUi(()->{try{YearMonth initial=(YearMonth)value("month");LocalDate initialDay=(LocalDate)value("selectedDay");
            Method change=MainActivity.class.getDeclaredMethod("changeMonth",int.class);change.setAccessible(true);
            field("month",YearMonth.of(2000,1));change.invoke(activity,-1);check(value("month").equals(YearMonth.of(2000,1)),"month swipe lower API bound");
            field("month",YearMonth.of(2100,12));change.invoke(activity,1);check(value("month").equals(YearMonth.of(2100,12)),"month swipe upper API bound");
            Method select=MainActivity.class.getDeclaredMethod("selectChecklistDate",LocalDate.class);select.setAccessible(true);
            select.invoke(activity,LocalDate.of(1999,12,31));check(value("selectedDay").equals(initialDay),"invalid previous day cannot trigger request");
            select.invoke(activity,LocalDate.of(2101,1,1));check(value("selectedDay").equals(initialDay),"invalid next day cannot trigger request");
            field("month",initial);field("selectedDay",initialDay);invoke("render");
        }catch(Exception e){throw new RuntimeException(e);}});settle();
    }
    private void testCalendarFilters()throws Exception {
        clickDescription("カレンダーの表示設定");
        AtomicReference<JSONArray> original=new AtomicReference<>();
        onUi(()->{try{original.set(snapshot.optJSONArray("tasks"));JSONArray tasks=new JSONArray(original.get().toString());String day=((LocalDate)value("selectedDay")).toString();tasks.put(new JSONObject().put("id",80).put("title","個人予定フィルタ").put("task_kind","EVENT").put("visibility_scope","PRIVATE").put("start_at",day+" 14:00:00"));tasks.put(new JSONObject().put("id",-81).put("title","個人定期フィルタ").put("task_kind","EVENT").put("visibility_scope","PRIVATE").put("start_at",day+" 15:00:00"));snapshot.put("tasks",tasks);invoke("render");}catch(Exception e){throw new RuntimeException(e);}});settle();
        clickDescription("カレンダー: 自分専用");check(hasContaining("個人予定フィルタ")&&hasContaining("個人定期フィルタ"),"private calendar includes stored and recurring personal events");check(!hasContaining("予定のテスト"),"private calendar excludes family events");
        clickDescription("カレンダー: 共通");check(hasContaining("予定のテスト"),"common calendar includes family events");check(!hasContaining("個人予定フィルタ"),"common calendar excludes private events");
        onUi(()->{try{check(snapshot.optJSONArray("tasks").length()==original.get().length()+2,"calendar filtering never mutates overview");snapshot.put("tasks",original.get());}catch(Exception e){throw new RuntimeException(e);}});clickDescription("カレンダー: すべて");clickDescription("カレンダーの表示設定");
    }
    private void testUnifiedGoodsSearch()throws Exception {
        clickDescription("買い物・持ち物を検索");
        onUi(()->{EditText query=findHint(root(),"買い物・持ち物を検索");query.setText("持ち物のテスト");check(((View)findText(root(),"スーパー").getParent().getParent()).getVisibility()==View.GONE,"unified search hides nonmatching shopping category");check(((View)findText(root(),"保育園").getParent().getParent()).getVisibility()==View.VISIBLE,"unified search matches names in collapsed item category");});
        clickText("🎒 持ち物");onUi(()->check(findHint(root(),"買い物・持ち物を検索").getText().toString().equals("持ち物のテスト"),"search query survives creation kind change"));
        clickDescription("買い物・持ち物を検索");clickText("🛒 買い物");
        onUi(()->{try{JSONObject catalog=(JSONObject)value("itemCategories");catalog.put("categoryMeta",new JSONArray().put(new JSONObject().put("name","保育園").put("enabled",0)));invoke("render");check(findText(root(),"保育園")==null,"disabled category hidden");check(findText(root(),"未分類")!=null,"disabled category surviving rows remain reachable");catalog.remove("categoryMeta");invoke("render");}catch(Exception e){throw new RuntimeException(e);}});settle();
    }
    private void testReactionChips()throws Exception {
        onUi(()->{try{@SuppressWarnings("unchecked") java.util.Map<Integer,JSONArray> cache=(java.util.Map<Integer,JSONArray>)value("messageReactions");cache.put(1,new JSONArray().put(new JSONObject().put("messageId",1).put("emoji","👍").put("count",2).put("mine",false)));invoke("render");}catch(Exception e){throw new RuntimeException(e);}});settle();
        check(hasText("👍 2"),"message reaction count visible");
        onUi(()->{try{Method toggle=MainActivity.class.getDeclaredMethod("toggleMessageReaction",int.class,String.class);toggle.setAccessible(true);toggle.invoke(activity,1,"👍");toggle.invoke(activity,1,"👍");}catch(Exception e){throw new RuntimeException(e);}});waitText("👍 3");check(reactionWrites==1,"reaction double submission blocked");
        onUi(()->check(findDescription(root(),"👍 3件、自分も選択中")!=null,"own reaction is marked"));
        onUi(()->{try{Method toggle=MainActivity.class.getDeclaredMethod("toggleMessageReaction",int.class,String.class);toggle.setAccessible(true);toggle.invoke(activity,1,"失敗");}catch(Exception e){throw new RuntimeException(e);}});
        for(int i=0;i<100&&reactionWrites<2;i++)Thread.sleep(20);settle();check(hasText("👍 3"),"failed reaction keeps previous count");
        onUi(()->{try{ApiClient.setMutationsEnabled(false);invoke("render");check(!findDescription(root(),"👍 3件、自分も選択中").isEnabled(),"read-only reaction chip disabled");Method toggle=MainActivity.class.getDeclaredMethod("toggleMessageReaction",int.class,String.class);toggle.setAccessible(true);toggle.invoke(activity,1,"👍");ApiClient.setMutationsEnabled(true);invoke("render");}catch(Exception e){throw new RuntimeException(e);}});check(reactionWrites==2,"read-only reaction cannot write");screenshot("message-reactions");
    }
    private void testMonthSwipes(String screen)throws Exception {
        AtomicReference<YearMonth> initial=new AtomicReference<>();
        onUi(()->{try{initial.set((YearMonth)value("month"));field("selectedDay",initial.get().atEndOfMonth());}catch(Exception e){throw new RuntimeException(e);}});
        swipePage(0.80f,0.20f,12,12);
        onUi(()->{try{check(value("month").equals(initial.get().plusMonths(1)),screen+" left swipe advances month");
            LocalDate day=(LocalDate)value("selectedDay");check(day.getDayOfMonth()==(screen.equals("calendar")?1:Math.min(initial.get().lengthOfMonth(),initial.get().plusMonths(1).lengthOfMonth())),screen+" month boundary date valid");}catch(Exception e){throw new RuntimeException(e);}});
        swipePage(0.20f,0.80f,12,12);
        onUi(()->{try{check(value("month").equals(initial.get()),screen+" right swipe returns month");}catch(Exception e){throw new RuntimeException(e);}});
        swipePage(0.50f,0.54f,12,12);
        swipePage(0.50f,0.50f,12,100);
        onUi(()->{try{check(value("month").equals(initial.get()),screen+" short and vertical gestures keep month");field("selectedDay",LocalDate.now(java.time.ZoneId.of("Asia/Tokyo")));invoke("render");((android.widget.ScrollView)value("pageScroll")).scrollTo(0,0);}catch(Exception e){throw new RuntimeException(e);}});settle();
    }
    private void swipePage(float from,float to,int fromY,int toY)throws Exception {
        onUi(()->{try{
            android.widget.ScrollView scroll=(android.widget.ScrollView)value("pageScroll");
            float density=activity.getResources().getDisplayMetrics().density;
            long time=android.os.SystemClock.uptimeMillis();
            for(int i=0;i<=8;i++){
                float ratio=i/8f;int action=i==0?android.view.MotionEvent.ACTION_DOWN:i==8?android.view.MotionEvent.ACTION_UP:android.view.MotionEvent.ACTION_MOVE;
                android.view.MotionEvent event=android.view.MotionEvent.obtain(time,time+i*25,action,scroll.getWidth()*(from+(to-from)*ratio),(fromY+(toY-fromY)*ratio)*density,0);
                scroll.dispatchTouchEvent(event);event.recycle();
            }
        }catch(Exception e){throw new RuntimeException(e);}});settle();
    }
    private void testMessageScroll(JSONArray original)throws Exception {
        onUi(()->{try{JSONArray rows=new JSONArray();for(int i=1;i<=35;i++)rows.put(new JSONObject().put("id",i).put("senderId",1).put("text","伝言スクロール "+i).put("createdAt","2026-10-01 10:00:00"));field("messages",rows);field("messageScrollLatest",true);invoke("render");}catch(Exception e){throw new RuntimeException(e);}});settle();
        onUi(()->{try{android.widget.ScrollView scroll=(android.widget.ScrollView)value("pageScroll");check(scroll.getScrollY()>=scroll.getChildAt(0).getHeight()-scroll.getHeight()-2,"messages initially at latest bottom");scroll.scrollTo(0,300);}catch(Exception e){throw new RuntimeException(e);}});
        AtomicReference<Integer> y=new AtomicReference<>();
        onUi(()->{try{y.set(((android.widget.ScrollView)value("pageScroll")).getScrollY());invoke("render");}catch(Exception e){throw new RuntimeException(e);}});settle();
        onUi(()->{try{check(((android.widget.ScrollView)value("pageScroll")).getScrollY()==y.get(),"message refresh keeps history reading position");
            JSONArray rows=(JSONArray)value("messages"),combined=new JSONArray().put(new JSONObject().put("id",99).put("senderId",1).put("text","以前の伝言テスト").put("createdAt","2026-09-30 10:00:00"));
            for(int i=0;i<rows.length();i++)combined.put(rows.optJSONObject(i));field("messages",combined);invoke("render");
        }catch(Exception e){throw new RuntimeException(e);}});settle();
        onUi(()->{try{check(((android.widget.ScrollView)value("pageScroll")).getScrollY()>y.get(),"older prepend preserves visible message anchor");field("messages",original);field("messageScrollLatest",true);invoke("render");}catch(Exception e){throw new RuntimeException(e);}});settle();
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
