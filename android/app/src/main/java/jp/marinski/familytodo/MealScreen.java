package jp.marinski.familytodo;

import android.app.Activity;
import android.app.AlertDialog;
import android.os.Handler;
import android.os.SystemClock;
import android.text.InputType;
import android.view.View;
import android.widget.*;
import org.json.JSONArray;
import org.json.JSONObject;
import java.time.LocalDate;
import java.time.ZoneId;
import java.util.ArrayList;
import java.util.UUID;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/** Native meal UI. Workers remains authoritative for revisions, quantities and confirmations. */
final class MealScreen {
    interface Host {
        String csrf();
        boolean active();
        TextView text(String value);
        Button button(String value,Runnable action);
        void web(String path);
        void login();
    }
    private final Activity activity;
    private final Host host;
    private final ExecutorService io=Executors.newSingleThreadExecutor();
    private final Handler clock=new Handler(android.os.Looper.getMainLooper());
    private LinearLayout root,body;
    private TextView status;
    private JSONObject overview;
    private String week=monday(today()),page="today";
    private int generation;
    private boolean busy,dirty;
    private volatile boolean closed;
    private long deadline;
    private String requestCsrf="";
    private Runnable timerTick;
    private final String session=SnapshotCache.currentSessionBinding();
    MealScreen(Activity activity,Host host){this.activity=activity;this.host=host;}
    static String today(){return LocalDate.now(ZoneId.of("Asia/Tokyo")).toString();}
    static String monday(String day){LocalDate date=LocalDate.parse(day);return date.minusDays(date.getDayOfWeek().getValue()-1).toString();}
    private boolean valid(int request){return !closed&&request==generation&&host.active()&&java.util.Objects.equals(session,SnapshotCache.currentSessionBinding());}
    void attach(LinearLayout target){
        root=target;root.removeAllViews();root.addView(host.text("ごはん・献立管理"));
        HorizontalScrollView scroll=new HorizontalScrollView(activity);LinearLayout nav=new LinearLayout(activity);
        String[] keys={"today","week","recipes","wishlist","inbox","more"},names={"今日","献立","レシピ","食べたい","LINE受信箱","その他"};
        for(int i=0;i<keys.length;i++){String key=keys[i];nav.addView(host.button(names[i],()->leave(()->{page=key;draw();})));}
        scroll.addView(nav);root.addView(scroll);status=host.text("");root.addView(status);
        body=new LinearLayout(activity);body.setOrientation(LinearLayout.VERTICAL);root.addView(body);
        if(overview==null)refresh();else draw();
    }
    void pauseTimer(){clock.removeCallbacksAndMessages(null);}
    void resumeTimer(){if(timerTick!=null&&!closed)timerTick.run();}
    void close(){closed=true;generation++;clock.removeCallbacksAndMessages(null);io.shutdownNow();overview=null;root=null;body=null;}
    private interface Work {JSONObject run()throws Exception;}
    private interface Done {void accept(JSONObject result)throws Exception;}
    private void request(Work work,Done done){
        if(busy||closed)return;
        int request=++generation;requestCsrf=host.csrf();busy=true;say("読み込み・保存中…");java.util.IdentityHashMap<View,Boolean> enabled=new java.util.IdentityHashMap<>();remember(body,enabled);enable(body,false);
        io.execute(()->{
            try{if(!valid(request))return;JSONObject result=work.run();activity.runOnUiThread(()->{
                if(!valid(request))return;busy=false;restore(enabled);
                try{done.accept(result);say("");}catch(Exception e){say("入力を確認してください。");}
            });}catch(Exception e){activity.runOnUiThread(()->{
                if(!valid(request))return;busy=false;restore(enabled);
                if(e instanceof SecurityException){host.login();return;}
                say(e.getMessage()==null?"通信を確認して再試行してください。":e.getMessage());
            });}
        });
    }
    private static void remember(View view,java.util.Map<View,Boolean> states){if(view==null)return;states.put(view,view.isEnabled());if(view instanceof android.view.ViewGroup){android.view.ViewGroup g=(android.view.ViewGroup)view;for(int i=0;i<g.getChildCount();i++)remember(g.getChildAt(i),states);}}
    private static void restore(java.util.Map<View,Boolean> states){for(java.util.Map.Entry<View,Boolean> entry:states.entrySet())entry.getKey().setEnabled(entry.getValue());}
    private static void enable(View view,boolean enabled){if(view==null)return;view.setEnabled(enabled);if(view instanceof android.view.ViewGroup){android.view.ViewGroup group=(android.view.ViewGroup)view;for(int i=0;i<group.getChildCount();i++)enable(group.getChildAt(i),enabled);}}
    private void say(String text){if(status!=null)status.setText(text);}
    private JSONObject get(String query)throws Exception{return ApiClient.request("/api/meals/v1"+query,null);}
    private JSONObject post(JSONObject value)throws Exception{
        if(closed||!host.active()||!java.util.Objects.equals(session,SnapshotCache.currentSessionBinding()))throw new SecurityException("ログインしてください。");
        if(requestCsrf.isEmpty())throw new IllegalStateException("ホームを更新してから開き直してください。");
        return ApiClient.request("/api/meals/v1",value.put("csrf",requestCsrf));
    }
    private static JSONObject object(){return new JSONObject();}
    private static JSONObject put(JSONObject object,String key,Object value){try{return object.put(key,value);}catch(Exception e){throw new IllegalArgumentException(e);}}
    private static JSONObject action(String name){return put(object(),"action",name);}
    private static JSONArray array(JSONObject value,String key){JSONArray a=value==null?null:value.optJSONArray(key);return a==null?new JSONArray():a;}
    private void text(String value){body.addView(host.text(value));}
    private Button button(String value,Runnable run){Button button=host.button(value,run);body.addView(button);return button;}
    private Button write(String value,Runnable run){return button(value,()->{if(!ApiClient.canMutate()){say("通信の確認後に編集できます。ホームを更新してください。");return;}run.run();});}
    private EditText input(LinearLayout into,String name,String value,boolean number){into.addView(host.text(name));EditText field=new EditText(activity);field.setContentDescription(name);field.setText(value);field.setInputType(number?InputType.TYPE_CLASS_NUMBER:InputType.TYPE_CLASS_TEXT|InputType.TYPE_TEXT_FLAG_MULTI_LINE);into.addView(field);return field;}
    private EditText input(String name,String value,boolean number){return input(body,name,value,number);}
    private static String value(EditText field){return field.getText().toString().trim();}
    private void leave(Runnable action){if(busy)return;if(dirty)new AlertDialog.Builder(activity).setMessage("入力した内容を破棄して移動しますか？").setPositiveButton("移動",(d,w)->{dirty=false;action.run();}).setNegativeButton("入力に戻る",null).show();else action.run();}
    private void refresh(){request(()->get("?week="+week),result->{overview=result;dirty=false;draw();});}
    private JSONObject item(String date){for(int i=0;i<array(overview.optJSONObject("plan"),"items").length();i++){JSONObject item=array(overview.optJSONObject("plan"),"items").optJSONObject(i);if(date.equals(item.optString("date")))return item;}return null;}
    private String mealName(JSONObject item){if(item==null)return "まだ決まっていません";String name=item.optJSONObject("recipe").optString("name");JSONArray sides=array(item,"sides");for(int i=0;i<sides.length();i++)name+=" ＋ "+sides.optJSONObject(i).optString("name");return name;}
    private void draw(){
        if(body==null||closed)return;clock.removeCallbacksAndMessages(null);deadline=0;timerTick=null;body.removeAllViews();dirty=false;
        if(overview==null){text("献立を読み込めませんでした。");button("再試行",this::refresh);return;}
        if(page.equals("recipes")){recipes();return;}
        if(page.equals("wishlist")){wishes();return;}
        if(page.equals("inbox")){inbox();return;}
        if(page.equals("more")){more();return;}
        if(page.equals("week")){weekly();return;}
        if(!week.equals(monday(today()))){week=monday(today());overview=null;refresh();return;}
        text("今日のごはん · "+today());JSONObject item=item(today());text(mealName(item));
        if(item!=null)button("料理を始める",()->cooking(item));
        JSONObject tomorrow=item(LocalDate.parse(today()).plusDays(1).toString());if(tomorrow==null&&week.equals(monday(today())))tomorrow=overview.optJSONObject("tomorrow_item");text("明日："+mealName(tomorrow));
        JSONObject plan=overview.optJSONObject("plan");text(plan==null?"今週の献立は未作成です。":"CONFIRMED".equals(plan.optString("status"))?"今週の献立：確定済み":"今週の献立：下書き");
        button("1週間の献立を開く",()->{page="week";draw();});button("更新",this::refresh);
    }
    private void recipes(){
        write("＋ レシピを登録",()->editor(null));
        JSONArray recipes=array(overview,"recipes");if(recipes.length()==0)text("レシピを登録すると献立に選べます。");
        for(int i=0;i<recipes.length();i++){JSONObject recipe=recipes.optJSONObject(i);button(recipe.optString("name")+" · "+recipe.optInt("minutes")+"分",()->request(()->get("?view=recipe&id="+recipe.optString("id")),r->detail(r.getJSONObject("recipe"))));}
    }
    static String amount(JSONObject ingredient,double ratio){
        if(ingredient.isNull("quantity"))return ingredient.optString("quantity_text","要確認");
        double quantity=Math.round(ingredient.optDouble("quantity")*ratio*10000)/10000d;
        return java.math.BigDecimal.valueOf(quantity).stripTrailingZeros().toPlainString()+ingredient.optString("unit");
    }
    private void ingredients(JSONObject recipe,double ratio){JSONArray ingredients=array(recipe,"ingredients");for(int i=0;i<ingredients.length();i++){JSONObject row=ingredients.optJSONObject(i);text(row.optString("name")+"："+amount(row,ratio));}}
    private void detail(JSONObject recipe){
        body.removeAllViews();text(recipe.optString("name"));text(recipe.optInt("servings")+"人分 · "+recipe.optInt("minutes")+"分");ingredients(recipe,1);
        JSONArray steps=array(recipe,"steps");for(int i=0;i<steps.length();i++)text((i+1)+". "+steps.optString(i));
        if(!recipe.optString("source_url").isEmpty())text("出典："+recipe.optString("source_url"));
        write("レシピを編集",()->editor(recipe));button("一覧に戻る",this::draw);
    }
    private static final class IngredientFields {EditText name,amount,unit;CheckBox custom;}
    static JSONObject ingredient(String name,String raw,String unit,boolean custom)throws Exception{
        String amount=java.text.Normalizer.normalize(raw.trim(),java.text.Normalizer.Form.NFKC);
        if(!custom&&amount.matches("(?:[0-9]+(?:\\.[0-9]*)?|\\.[0-9]+)")){
            double n=Double.parseDouble(amount);if(n<=0||n>100000||unit.trim().isEmpty())throw new IllegalArgumentException("数量と単位を確認してください。");
            return new JSONObject().put("name",name).put("quantity",n).put("unit",unit.trim());
        }
        if(!custom&&amount.matches(".*[0-9].*"))throw new IllegalArgumentException("補足付き分量は「自由入力」を選んでください。");
        if(amount.isEmpty()||amount.length()>80||amount.matches("[+-]?(?:[0-9]+(?:\\.[0-9]*)?|\\.[0-9]+)")||amount.matches("(?i)(?:NaN|[+-]?Infinity)")||!amount.matches("(?s).*[\\p{L}\\p{N}].*")||amount.matches("(?s).*[\\p{Cntrl}].*"))throw new IllegalArgumentException("分量を入力してください。");
        return new JSONObject().put("name",name).put("quantity",JSONObject.NULL).put("unit","").put("quantity_text",amount);
    }
    private void editor(JSONObject recipe){
        body.removeAllViews();dirty=true;text(recipe==null?"レシピを登録":"レシピを編集");
        String id=recipe==null?UUID.randomUUID().toString():recipe.optString("id");
        EditText name=input("料理名",recipe==null?"":recipe.optString("name"),false),servings=input("何人分",recipe==null?"2":recipe.optString("servings"),true),minutes=input("所要時間（分）",recipe==null?"30":recipe.optString("minutes"),true),source=input("出典URL（任意）",recipe==null?"":recipe.optString("source_url"),false);
        text("分量は適量・少々・お好みでも入力できます。補足や範囲は自由入力を選択してください。自由入力は人数換算・在庫の自動計算をしません。");
        LinearLayout rows=new LinearLayout(activity);rows.setOrientation(LinearLayout.VERTICAL);body.addView(rows);ArrayList<IngredientFields> fields=new ArrayList<>();
        java.util.function.Consumer<JSONObject> add=initial->{
            LinearLayout row=new LinearLayout(activity);row.setOrientation(LinearLayout.VERTICAL);rows.addView(row);IngredientFields field=new IngredientFields();fields.add(field);
            field.name=input(row,"材料名",initial==null?"":initial.optString("name"),false);
            field.amount=input(row,"数量・分量",initial==null?"":initial.isNull("quantity")?initial.optString("quantity_text"):initial.optString("quantity"),false);
            field.unit=input(row,"単位",initial==null?"g":initial.optString("unit"),false);
            field.custom=new CheckBox(activity);field.custom.setText("自由入力（例：お好みで（1〜2つまみ））");row.addView(field.custom);
            field.custom.setOnCheckedChangeListener((b,c)->field.unit.setEnabled(!c));field.custom.setChecked(initial!=null&&initial.isNull("quantity"));
            row.addView(host.button("材料を削除",()->{rows.removeView(row);fields.remove(field);}));
        };
        JSONArray original=array(recipe,"ingredients");if(original.length()==0)add.accept(null);else for(int i=0;i<original.length();i++)add.accept(original.optJSONObject(i));
        button("＋ 材料を追加",()->add.accept(null));
        StringBuilder lines=new StringBuilder();JSONArray steps=array(recipe,"steps");for(int i=0;i<steps.length();i++){if(i>0)lines.append('\n');lines.append(steps.optString(i));}
        EditText instructions=input("作り方（1行に1手順）",lines.toString(),false);
        write("レシピを保存",()->{
            try{
                JSONArray ingredients=new JSONArray(),nextSteps=new JSONArray();for(IngredientFields field:fields)ingredients.put(ingredient(value(field.name),value(field.amount),value(field.unit),field.custom.isChecked()));
                for(String line:value(instructions).split("\\n"))if(!line.trim().isEmpty())nextSteps.put(line.trim());
                JSONObject next=new JSONObject().put("id",id).put("name",value(name)).put("servings",Integer.parseInt(value(servings))).put("minutes",Integer.parseInt(value(minutes))).put("source_url",value(source)).put("ingredients",ingredients).put("steps",nextSteps);
                if(recipe!=null)next.put("revision",recipe.optString("revision"));
                request(()->post(put(action("save_recipe"),"recipe",next)),r->{dirty=false;refresh();});
            }catch(Exception error){say(error.getMessage()==null?"料理名・人数・時間・材料・手順を確認してください。":error.getMessage());}
        });button("戻る",()->leave(this::draw));
    }
    private void wishes(){
        EditText wish=input("食べたい料理", "",false);final String[] last={"",""};
        write("食べたいものに追加",()->{String name=value(wish);if(name.isEmpty()){say("料理名を入力してください。");return;}if(!last[0].equals(name)){last[0]=name;last[1]=UUID.randomUUID().toString();}JSONObject payload=put(put(action("wishlist_add"),"id",last[1]),"name",name);request(()->post(payload),r->refresh());});
        JSONArray wishes=array(overview,"wishlist");for(int i=0;i<wishes.length();i++){JSONObject row=wishes.optJSONObject(i);text(row.optString("name"));if(!row.isNull("source_url"))text(row.optString("source_url"));write("削除："+row.optString("name"),()->new AlertDialog.Builder(activity).setMessage("食べたいものから削除しますか？").setPositiveButton("削除",(d,w)->request(()->post(put(action("wishlist_delete"),"id",row.optString("id"))),r->refresh())).setNegativeButton("戻る",null).show());}
    }
    private void inbox(){
        request(()->get("?view=inbox"),r->{body.removeAllViews();JSONArray inbox=array(r,"inbox");if(inbox.length()==0)text("未確認の希望メニュー・URLはありません。");
            for(int i=0;i<inbox.length();i++){JSONObject row=inbox.optJSONObject(i);text(row.optString("content"));boolean url="RECIPE_URL".equals(row.optString("kind"));EditText name=url?input("URLの料理名","",false):null;
                write("希望メニューにする",()->{String dish=url?value(name):row.optString("content");if(dish.isEmpty()){say("料理名を入力してください。");return;}JSONObject payload=put(put(action("inbox_wish"),"id",row.optString("id")),"name",dish);request(()->post(payload),saved->refresh());});
            }
            if(array(r,"line_receipts").length()>0)button("LINEのレシートをWebで確認",()->host.web("/app/meals.php?view=inbox"));
        });
    }
    private Spinner choice(String name,ArrayList<String> names,int selected){text(name);Spinner spinner=new Spinner(activity);spinner.setContentDescription(name);spinner.setAdapter(new ArrayAdapter<>(activity,android.R.layout.simple_spinner_dropdown_item,names));spinner.setSelection(Math.max(0,selected));body.addView(spinner);return spinner;}
    private void weekly(){
        text(week+"からの献立");button("前の週",()->leave(()->{week=LocalDate.parse(week).minusWeeks(1).toString();refresh();}));button("次の週",()->leave(()->{week=LocalDate.parse(week).plusWeeks(1).toString();refresh();}));
        JSONObject plan=overview.optJSONObject("plan");text(plan==null?"未作成":"CONFIRMED".equals(plan.optString("status"))?"確定済み":"下書き");
        for(int i=0;i<7;i++){String date=LocalDate.parse(week).plusDays(i).toString();JSONObject item=item(date);text(date+" · "+mealName(item));if(item!=null)button(date+"の料理",()->cooking(item));}
        write("献立を編集",this::planEditor);button("AI献立・未登録の副菜提案（Web）",()->host.web("/app/meals.php?view=week&week="+week));
        button("買う食材を確認",()->request(()->get("?view=shopping_preview&week="+week),this::shopping));
    }
    private void planEditor(){
        body.removeAllViews();dirty=true;text("献立を編集 · "+week);JSONArray recipes=array(overview,"recipes");ArrayList<String> names=new ArrayList<>(),ids=new ArrayList<>();names.add("選ばない");ids.add("");for(int i=0;i<recipes.length();i++){JSONObject row=recipes.optJSONObject(i);names.add(row.optString("name"));ids.add(row.optString("id"));}
        ArrayList<Spinner> mains=new ArrayList<>(),sides=new ArrayList<>();ArrayList<EditText> servings=new ArrayList<>();
        JSONObject original=overview.optJSONObject("plan");String editWeek=week;
        for(int i=0;i<7;i++){String date=LocalDate.parse(editWeek).plusDays(i).toString();JSONObject item=item(date);String main=item==null?"":item.optJSONObject("recipe").optString("id"),side=item==null||array(item,"sides").length()==0?"":array(item,"sides").optJSONObject(0).optString("id");
            text(date);mains.add(choice(date+"の主菜",names,ids.indexOf(main)));sides.add(choice(date+"の副菜",names,ids.indexOf(side)));servings.add(input(date+"の人数",item==null?"2":item.optString("servings"),true));}
        java.util.function.Consumer<String> save=status->{try{JSONArray items=new JSONArray();for(int i=0;i<7;i++){String main=ids.get(mains.get(i).getSelectedItemPosition()),side=ids.get(sides.get(i).getSelectedItemPosition());if(main.isEmpty()){if(!side.isEmpty())throw new IllegalArgumentException("副菜がある日は主菜も選んでください。");continue;}JSONObject row=new JSONObject().put("date",LocalDate.parse(editWeek).plusDays(i).toString()).put("recipe_id",main).put("servings",Integer.parseInt(value(servings.get(i))));if(!side.isEmpty())row.put("side_recipe_ids",new JSONArray().put(side));items.put(row);}
            JSONObject plan=new JSONObject().put("week_start",editWeek).put("status",status).put("items",items);if(original!=null)plan.put("revision",original.optString("revision"));request(()->post(put(action("save_plan"),"plan",plan)),r->{dirty=false;refresh();});
        }catch(Exception e){say(e.getMessage()==null?"主菜・副菜・人数を確認してください。":e.getMessage());}};
        write("献立の下書きを保存",()->save.accept("DRAFT"));write("献立を確定",()->new AlertDialog.Builder(activity).setMessage("表示した1週間の献立を確定しますか？").setPositiveButton("確定",(d,w)->save.accept("CONFIRMED")).setNegativeButton("戻る",null).show());button("戻る",()->leave(this::draw));
    }
    private void shopping(JSONObject preview){
        body.removeAllViews();text("買う食材を確認");text("正確な在庫を差し引いた不足量です。自由入力の分量は計算しません。追加する食材を選んでください。同じ週の追加は1回までです。");ArrayList<CheckBox> boxes=new ArrayList<>();JSONArray needs=array(preview,"needs");
        for(int i=0;i<needs.length();i++){JSONObject need=needs.optJSONObject(i);CheckBox box=new CheckBox(activity);box.setText(need.optString("name")+"："+amount(need,1));box.setEnabled(need.isNull("quantity")||need.optDouble("quantity")>0);body.addView(box);boxes.add(box);}
        write("買い物リストに追加",()->{JSONArray selected=new JSONArray();for(int i=0;i<boxes.size();i++)if(boxes.get(i).isChecked())selected.put(i);if(selected.length()==0){say("追加する食材を選択してください。");return;}JSONObject payload=put(put(put(put(action("shopping_confirm"),"week_start",preview.optString("week_start")),"revision",preview.optString("revision")),"preview_hash",preview.optString("preview_hash")),"selected",selected);request(()->post(payload),r->{body.removeAllViews();text("買い物リストに追加しました。");button("献立へ戻る",this::draw);});});button("戻る",this::draw);
    }
    private void cooking(JSONObject item){
        body.removeAllViews();JSONObject recipe=item.optJSONObject("recipe");text(mealName(item)+" · "+item.optInt("servings")+"人分");ingredients(recipe,item.optDouble("servings")/recipe.optDouble("servings"));JSONArray sides=array(item,"sides");for(int i=0;i<sides.length();i++){JSONObject side=sides.optJSONObject(i);text("副菜："+side.optString("name"));ingredients(side,item.optDouble("servings")/side.optDouble("servings"));JSONArray steps=array(side,"steps");for(int j=0;j<steps.length();j++)text((j+1)+". "+steps.optString(j));}
        text("自由入力の分量は人数で換算していません。");JSONArray steps=array(recipe,"steps");final int[] position={0};TextView step=host.text("");body.addView(step);Runnable update=()->step.setText("手順 "+(position[0]+1)+" / "+steps.length()+"\n"+steps.optString(position[0]));update.run();button("前の手順",()->{position[0]=Math.max(0,position[0]-1);update.run();});button("次の手順",()->{position[0]=Math.min(steps.length()-1,position[0]+1);update.run();});
        EditText minutes=input("タイマー（1〜180分）","5",true);TextView timer=host.text("タイマー停止中");body.addView(timer);
        Runnable tick=new Runnable(){public void run(){if(closed||!host.active()||timer.getParent()==null)return;long seconds=Math.max(0,(deadline-SystemClock.elapsedRealtime()+999)/1000);timer.setText(seconds>0?"タイマー "+seconds/60+":"+String.format(java.util.Locale.ROOT,"%02d",seconds%60):"タイマー終了");if(seconds>0)clock.postDelayed(this,500);}};
        button("タイマー開始",()->{try{timerTick=tick;int duration=Integer.parseInt(value(minutes));if(duration<1||duration>180)throw new IllegalArgumentException();if(deadline>SystemClock.elapsedRealtime()){new AlertDialog.Builder(activity).setMessage("現在のタイマーを置き換えますか？").setPositiveButton("開始",(d,w)->{clock.removeCallbacksAndMessages(null);deadline=SystemClock.elapsedRealtime()+duration*60000L;tick.run();}).setNegativeButton("戻る",null).show();}else{deadline=SystemClock.elapsedRealtime()+duration*60000L;tick.run();}}catch(Exception e){say("タイマーは1〜180分で入力してください。");}});button("タイマー停止",()->{clock.removeCallbacksAndMessages(null);deadline=0;timerTick=null;timer.setText("タイマー停止中");});text("タイマーはこの画面を表示している間に確認できます。");
        button("Cooking Live・音声相談（Web）",()->host.web("/app/meals.php?view=cook&date="+item.optString("date")));
        write("作った記録と在庫を確認",()->request(()->get("?view=cooking_preview&date="+item.optString("date")),r->cooked(r.getJSONObject("preview"))));button("戻る",this::draw);
    }
    private void cooked(JSONObject preview){
        body.removeAllViews();text("作った記録と在庫を確認");JSONArray needs=array(preview,"needs"),allocations=array(preview,"allocations");for(int i=0;i<needs.length();i++){JSONObject row=needs.optJSONObject(i);text(row.optString("name")+" · 使用量 "+amount(row,1));}text("在庫から減らす購入分：");for(int i=0;i<allocations.length();i++){JSONObject row=allocations.optJSONObject(i);text(row.optString("name")+"："+amount(row,1));}
        text("自由入力・おおよその在庫・ある／なしは自動で減らしません。表示した購入分だけを減らします。");CheckBox consume=new CheckBox(activity);consume.setText("表示した数量を在庫から減らす");consume.setEnabled(allocations.length()>0);body.addView(consume);
        write("作った記録を保存",()->{JSONObject payload=put(put(put(put(action("cooked"),"date",preview.optString("date")),"revision",preview.optString("revision")),"preview_hash",preview.optString("preview_hash")),"consume_inventory",consume.isChecked());request(()->post(payload),r->refresh());});button("戻る",this::draw);
    }
    private void more(){
        text("AI献立・公開サイト検索・URL取り込み・在庫・レシート・離乳食・Cooking Liveは、同じ家族データを使うWeb画面で利用できます。");String[] views={"search","recipes","inventory","receipts","baby","ai-check"},names={"クラシル・デリッシュキッチンから探す","URL・動画からレシピを取り込む","食材の在庫","レシートを確認","離乳食の確認","AI接続を確認"};for(int i=0;i<views.length;i++){String path="/app/meals.php?view="+views[i];button(names[i]+"（Web）",()->host.web(path));}
    }
}
