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
        CheckBox checkbox(String value);
        void styleInput(EditText field);
        void tab(Button button,boolean active);
        void web(String path);
        void login();
        void shoppingList();
    }
    private final Activity activity;
    private final Host host;
    private final ExecutorService io=Executors.newSingleThreadExecutor();
    private final Handler clock=new Handler(android.os.Looper.getMainLooper());
    private LinearLayout root,body;
    private TextView status;
    private final java.util.Map<String,Button> tabs=new java.util.LinkedHashMap<>();
    private int dp(float value){return Math.round(value*activity.getResources().getDisplayMetrics().density);}
    private LinearLayout.LayoutParams compactAction(){LinearLayout.LayoutParams params=new LinearLayout.LayoutParams(LinearLayout.LayoutParams.WRAP_CONTENT,LinearLayout.LayoutParams.WRAP_CONTENT);params.setMargins(0,dp(3),0,dp(3));return params;}
    private JSONObject overview;
    private String week=monday(today()),page="today";
    private int generation;
    private boolean busy,dirty;
    private volatile boolean closed;
    private long deadline;
    private String requestCsrf="";
    private Runnable timerTick;
    private AlertDialog leaveDialog;
    private PopupMenu wishMenu;
    private final String session=SnapshotCache.currentSessionBinding();
    MealScreen(Activity activity,Host host){this.activity=activity;this.host=host;}
    static String today(){return LocalDate.now(ZoneId.of("Asia/Tokyo")).toString();}
    static String monday(String day){LocalDate date=LocalDate.parse(day);return date.minusDays(date.getDayOfWeek().getValue()-1).toString();}
    private boolean valid(int request){return !closed&&request==generation&&host.active()&&java.util.Objects.equals(session,SnapshotCache.currentSessionBinding());}
    void attach(LinearLayout target){
        root=target;root.removeAllViews();root.addView(host.text("ごはん・献立管理"));
        HorizontalScrollView scroll=new HorizontalScrollView(activity);scroll.setHorizontalScrollBarEnabled(false);LinearLayout nav=new LinearLayout(activity);tabs.clear();
        String[] keys={"today","week","recipes","wishlist","inbox","inventory","more"},names={"今回作る","献立","レシピ","食べたい","LINE受信箱","在庫","その他"};
        for(int i=0;i<keys.length;i++){String key=keys[i];Button tab=host.button(names[i],()->leave(()->{page=key;draw();}));tabs.put(key,tab);nav.addView(tab);}
        scroll.addView(nav);root.addView(scroll);status=host.text("");status.setVisibility(View.GONE);root.addView(status);
        body=new LinearLayout(activity);body.setOrientation(LinearLayout.VERTICAL);root.addView(body);
        if(overview==null)refresh();else draw();
    }
    void pauseTimer(){clock.removeCallbacksAndMessages(null);}
    void resumeTimer(){if(timerTick!=null&&!closed)timerTick.run();}
    void close(){if(wishMenu!=null)wishMenu.dismiss();if(leaveDialog!=null)leaveDialog.dismiss();closed=true;generation++;clock.removeCallbacksAndMessages(null);io.shutdownNow();overview=null;root=null;body=null;}
    private interface Work {JSONObject run()throws Exception;}
    private interface Done {void accept(JSONObject result)throws Exception;}
    private void request(Work work,Done done){
        if(busy||closed)return;
        int request=++generation;requestCsrf=host.csrf();busy=true;say("読み込み・保存中…");java.util.IdentityHashMap<View,Boolean> enabled=new java.util.IdentityHashMap<>();remember(body,enabled);enable(body,false);
        io.execute(()->{
            try{if(!valid(request))return;JSONObject result=work.run();activity.runOnUiThread(()->{
                if(!valid(request))return;busy=false;restore(enabled);
                try{done.accept(result);if(!busy)say("");}catch(Exception e){say("入力を確認してください。");}
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
    private void say(String text){if(status!=null){status.setText(text);status.setVisibility(text.isEmpty()?View.GONE:View.VISIBLE);}}
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
    private Button button(String value,Runnable run){Button button=host.button(value,run);body.addView(button,compactAction());return button;}
    private Button write(String value,Runnable run){return button(value,()->{if(!ApiClient.canMutate()){say("通信の確認後に編集できます。ホームを更新してください。");return;}run.run();});}
    private EditText input(LinearLayout into,String name,String value,boolean number){TextView label=host.text(name);label.setTextSize(13);label.setPadding(dp(8),dp(6),dp(8),dp(3));EditText field=new EditText(activity);field.setId(View.generateViewId());field.setContentDescription(name);field.setText(value);field.setInputType(number?InputType.TYPE_CLASS_NUMBER:InputType.TYPE_CLASS_TEXT|InputType.TYPE_TEXT_FLAG_MULTI_LINE);host.styleInput(field);label.setLabelFor(field.getId());label.setOnClickListener(v->field.requestFocus());into.addView(label);into.addView(field);if(!name.startsWith("タイマー"))field.addTextChangedListener(new android.text.TextWatcher(){public void beforeTextChanged(CharSequence s,int start,int count,int after){}public void onTextChanged(CharSequence s,int start,int before,int count){dirty=true;}public void afterTextChanged(android.text.Editable value){}});return field;}
    private EditText input(String name,String value,boolean number){return input(body,name,value,number);}
    private static String value(EditText field){return field.getText().toString().trim();}
    AlertDialog confirmLeave(Runnable action){
        if(busy)return null;
        if(leaveDialog!=null&&leaveDialog.isShowing())return leaveDialog;
        if(!dirty){action.run();return null;}
        AlertDialog dialog=new AlertDialog.Builder(activity).setMessage("入力した内容を破棄して移動しますか？").setPositiveButton("移動",(d,w)->{dirty=false;action.run();}).setNegativeButton("入力に戻る",null).create();leaveDialog=dialog;dialog.setOnDismissListener(d->leaveDialog=null);dialog.show();return dialog;
    }
    private void leave(Runnable action){confirmLeave(action);}
    private void refresh(){request(()->get("?week="+week),result->{overview=result;dirty=false;draw();});}
    private JSONObject item(String date){for(int i=0;i<array(overview.optJSONObject("plan"),"items").length();i++){JSONObject item=array(overview.optJSONObject("plan"),"items").optJSONObject(i);if(date.equals(item.optString("date")))return item;}return null;}
    private boolean recorded(String date){JSONObject plan=overview.optJSONObject("plan");if(plan==null)return false;JSONArray cooked=array(overview,"cooked");for(int i=0;i<cooked.length();i++){JSONObject row=cooked.optJSONObject(i);if(date.equals(row.optString("meal_date"))&&plan.optString("revision").equals(row.optString("plan_revision")))return true;}return false;}
    private String mealName(JSONObject item){if(item==null)return "まだ決まっていません";String name=item.optJSONObject("recipe").optString("name");JSONArray sides=array(item,"sides");for(int i=0;i<sides.length();i++)name+=" ＋ "+sides.optJSONObject(i).optString("name");return name;}
    private void draw(){
        if(body==null||closed)return;for(java.util.Map.Entry<String,Button> tab:tabs.entrySet())host.tab(tab.getValue(),tab.getKey().equals(page));clock.removeCallbacksAndMessages(null);deadline=0;timerTick=null;body.removeAllViews();dirty=false;
        if(overview==null){text("献立を読み込めませんでした。");button("再試行",this::refresh);return;}
        if(page.equals("recipes")){recipes();return;}
        if(page.equals("wishlist")){wishes();return;}
        if(page.equals("inbox")){inbox();return;}
        if(page.equals("more")){more();return;}
        if(page.equals("inventory")){inventory();return;}
        if(page.equals("week")){weekly();return;}
        if(!week.equals(monday(today()))){week=monday(today());overview=null;refresh();return;}
        queueList();
        if(overview.optJSONObject("plan")!=null&&array(overview.optJSONObject("plan"),"items").length()>0){text("日付を決めた献立 · "+today());JSONObject item=item(today());text(mealName(item));
        if(item!=null){if(recorded(item.optString("date")))text("✓ 調理済み");button("料理を始める",()->cooking(item));}
        JSONObject tomorrow=item(LocalDate.parse(today()).plusDays(1).toString());if(tomorrow==null&&week.equals(monday(today())))tomorrow=overview.optJSONObject("tomorrow_item");text("明日："+mealName(tomorrow));
        JSONObject plan=overview.optJSONObject("plan");text(plan==null?"今週の献立は未作成です。":"CONFIRMED".equals(plan.optString("status"))?"今週の献立：確定済み":"今週の献立：下書き");
        }
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
        body.removeAllViews();text(recipe.optString("name"));text(recipe.optBoolean("is_main")?"✓ 主菜":"副菜など");text(recipe.optInt("servings")+"人分 · "+recipe.optInt("minutes")+"分");ingredients(recipe,1);
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
        String id=recipe==null?UUID.randomUUID().toString():recipe.optString("id");CheckBox main=host.checkbox("主菜として使う");main.setChecked(recipe!=null&&recipe.optBoolean("is_main"));body.addView(main);text("チェックなしは副菜・汁物・お菓子など。後から変更できます。");
        EditText name=input("料理名",recipe==null?"":recipe.optString("name"),false),servings=input("何人分",recipe==null?"2":recipe.optString("servings"),true),minutes=input("所要時間（分）",recipe==null?"30":recipe.optString("minutes"),true),source=input("出典URL（任意）",recipe==null?"":recipe.optString("source_url"),false);
        text("分量は適量・少々・お好みでも入力できます。補足や範囲は自由入力を選択してください。自由入力は人数換算・在庫の自動計算をしません。");
        LinearLayout rows=new LinearLayout(activity);rows.setOrientation(LinearLayout.VERTICAL);body.addView(rows);ArrayList<IngredientFields> fields=new ArrayList<>();
        java.util.function.Consumer<JSONObject> add=initial->{
            LinearLayout row=new LinearLayout(activity);row.setOrientation(LinearLayout.VERTICAL);rows.addView(row);IngredientFields field=new IngredientFields();fields.add(field);
            field.name=input(row,"材料名",initial==null?"":initial.optString("name"),false);
            field.amount=input(row,"数量・分量",initial==null?"":initial.isNull("quantity")?initial.optString("quantity_text"):initial.optString("quantity"),false);
            field.unit=input(row,"単位",initial==null?"g":initial.optString("unit"),false);
            field.custom=host.checkbox("自由入力（例：お好みで（1〜2つまみ））");row.addView(field.custom);
            field.custom.setOnCheckedChangeListener((b,c)->field.unit.setEnabled(!c));field.custom.setChecked(initial!=null&&initial.isNull("quantity"));
            row.addView(host.button("材料を削除",()->{rows.removeView(row);fields.remove(field);}),compactAction());
        };
        JSONArray original=array(recipe,"ingredients");if(original.length()==0)add.accept(null);else for(int i=0;i<original.length();i++)add.accept(original.optJSONObject(i));
        button("＋ 材料を追加",()->add.accept(null));
        StringBuilder lines=new StringBuilder();JSONArray steps=array(recipe,"steps");for(int i=0;i<steps.length();i++){if(i>0)lines.append('\n');lines.append(steps.optString(i));}
        EditText instructions=input("作り方（1行に1手順）",lines.toString(),false);
        write("レシピを保存",()->{
            try{
                JSONArray ingredients=new JSONArray(),nextSteps=new JSONArray();for(IngredientFields field:fields)ingredients.put(ingredient(value(field.name),value(field.amount),value(field.unit),field.custom.isChecked()));
                for(String line:value(instructions).split("\\n"))if(!line.trim().isEmpty())nextSteps.put(line.trim());
                JSONObject next=new JSONObject().put("id",id).put("is_main",main.isChecked()).put("name",value(name)).put("servings",Integer.parseInt(value(servings))).put("minutes",Integer.parseInt(value(minutes))).put("source_url",value(source)).put("ingredients",ingredients).put("steps",nextSteps);
                if(recipe!=null)next.put("revision",recipe.optString("revision"));
                request(()->post(put(action("save_recipe"),"recipe",next)),r->{dirty=false;refresh();});
            }catch(Exception error){say(error.getMessage()==null?"料理名・人数・時間・材料・手順を確認してください。":error.getMessage());}
        });button("戻る",()->leave(this::draw));
    }
    private void wishes(){
        EditText wish=input("食べたい料理", "",false);CheckBox main=host.checkbox("主菜");body.addView(main);text("チェックなしは副菜・汁物・お菓子など。");final String[] last={"",""};
        write("食べたいものに追加",()->{String name=value(wish);if(name.isEmpty()){say("料理名を入力してください。");return;}String key=name+"|"+main.isChecked();if(!last[0].equals(key)){last[0]=key;last[1]=UUID.randomUUID().toString();}JSONObject payload=put(put(put(action("wishlist_add"),"id",last[1]),"name",name),"is_main",main.isChecked());request(()->post(payload),r->refresh());});
        JSONArray wishes=array(overview,"wishlist");if(wishes.length()==0)text("家族が食べたい料理をここに集められます。");
        for(int i=0;i<wishes.length();i++){
            JSONObject row=wishes.optJSONObject(i);if(row==null)continue;
            LinearLayout line=new LinearLayout(activity);line.setGravity(android.view.Gravity.TOP);LinearLayout labels=new LinearLayout(activity);labels.setOrientation(LinearLayout.VERTICAL);
            labels.addView(host.text(row.optString("name")));CheckBox role=host.checkbox("主菜");role.setContentDescription(row.optString("name")+"を主菜にする");role.setChecked(row.optBoolean("is_main"));labels.addView(role);role.setOnClickListener(v->{if(busy||!ApiClient.canMutate()){role.setChecked(row.optBoolean("is_main"));return;}JSONObject payload=put(put(put(action("wishlist_main"),"id",row.optString("id")),"is_main",role.isChecked()),"expected_revision",row.optInt("recipe_link_revision"));request(()->{try{return post(payload);}catch(Exception e){activity.runOnUiThread(()->{if(role.isAttachedToWindow())role.setChecked(row.optBoolean("is_main"));});throw e;}},r->refresh());});String linked=nullable(row,"linked_recipe_id");JSONObject recipe=findRecipe(linked);
            if(!linked.isEmpty()){
                labels.addView(host.text("📖 "+(nullable(row,"recipe_name").isEmpty()?(recipe==null?"紐づけ先のレシピ":recipe.optString("name")):nullable(row,"recipe_name"))+(row.optBoolean("recipe_available")?"":"（非表示）")));
                String model=hotcookModel((nullable(row,"recipe_source_url").isEmpty()?(recipe==null?"":recipe.optString("source_url")):nullable(row,"recipe_source_url")));if(!model.isEmpty())labels.addView(host.text("ホットクック · "+model));
            }
            line.addView(labels,new LinearLayout.LayoutParams(0,-2,1));Button adopt=host.button("採用",()->{if(!ApiClient.canMutate()){say("通信の確認後に編集できます。ホームを更新してください。");return;}leave(()->queueAdopt(row));});line.addView(adopt,compactAction());Button menu=host.button("⋯",()->wishActions(row));menu.setContentDescription(row.optString("name")+"の操作");line.addView(menu,new LinearLayout.LayoutParams(dp(44),dp(44)));body.addView(line);
        }
        rejectedWishes();
    }
    private void rejectedWishes(){JSONArray rejected=array(overview.optJSONObject("queue"),"rejected");if(rejected.length()>0)button("却下したもの",()->{body.removeAllViews();for(int i=0;i<rejected.length();i++){JSONObject row=rejected.optJSONObject(i);text(row.optString("name"));write("候補に戻す",()->request(()->post(put(put(action("wish_restore"),"id",row.optString("id")),"expected_revision",row.optInt("recipe_link_revision"))),r->refresh()));}button("戻る",this::draw);});}
    private static String nullable(JSONObject row,String key){return row.isNull(key)?"":row.optString(key);}
    private JSONObject findRecipe(String id){JSONArray recipes=array(overview,"recipes");for(int i=0;i<recipes.length();i++){JSONObject recipe=recipes.optJSONObject(i);if(recipe!=null&&id.equals(recipe.optString("id")))return recipe;}return null;}
    static String hotcookModel(String source){
        try{java.net.URI uri=new java.net.URI(source);java.util.regex.Matcher match=java.util.regex.Pattern.compile("^/kitchen/recipe/hotcook/(KN-[A-Z]{2}\\d{2}[A-Z])/R\\d{4,15}/?$").matcher(uri.getPath());return "https".equals(uri.getScheme())&&"cocoroplus.jp.sharp".equals(uri.getHost())&&uri.getUserInfo()==null&&uri.getPort()==-1&&match.matches()?match.group(1):"";}catch(Exception error){return "";}
    }
    private void wishActions(JSONObject row){
        if(busy)return;Button anchor=(Button)findWishAction(body,row.optString("name")+"の操作");if(anchor==null)return;
        wishMenu=new PopupMenu(activity,anchor);if(row.optBoolean("recipe_available"))wishMenu.getMenu().add(0,1,0,"レシピを開く");wishMenu.getMenu().add(0,2,1,"紐づけを変更");wishMenu.getMenu().add(0,3,2,"却下");
        wishMenu.setOnMenuItemClickListener(item->{if(busy)return true;if(item.getItemId()==1)leave(()->request(()->get("?view=recipe&id="+nullable(row,"linked_recipe_id")),r->detail(r.getJSONObject("recipe"))));else if(!ApiClient.canMutate())say("通信の確認後に編集できます。ホームを更新してください。");else if(item.getItemId()==2)leave(()->wishLinkEditor(row));else new AlertDialog.Builder(activity).setMessage("却下しますか？ レシピは残り、却下履歴から戻せます。").setPositiveButton("却下",(d,w)->{if(!ApiClient.canMutate())return;request(()->post(put(put(action("wish_reject"),"id",row.optString("id")),"expected_revision",row.optInt("recipe_link_revision"))),r->refresh());}).setNegativeButton("戻る",null).show();return true;});wishMenu.show();
    }
    private static View findWishAction(View view,String description){if(description.contentEquals(view.getContentDescription()==null?"":view.getContentDescription()))return view;if(view instanceof android.view.ViewGroup){android.view.ViewGroup group=(android.view.ViewGroup)view;for(int i=0;i<group.getChildCount();i++){View found=findWishAction(group.getChildAt(i),description);if(found!=null)return found;}}return null;}
    private void wishLinkEditor(JSONObject row){
        body.removeAllViews();text(row.optString("name")+" · 紐づけを変更");ArrayList<String> names=new ArrayList<>(),ids=new ArrayList<>();names.add("紐づけなし");ids.add("");JSONArray recipes=array(overview,"recipes");String linked=nullable(row,"linked_recipe_id");
        for(int i=0;i<recipes.length();i++){JSONObject recipe=recipes.optJSONObject(i);if(recipe==null)continue;ids.add(recipe.optString("id"));names.add(recipe.optString("name")+(hotcookModel(recipe.optString("source_url")).isEmpty()?"":" · ホットクック"));}
        if(!linked.isEmpty()&&!ids.contains(linked)){ids.add(linked);names.add(row.optString("recipe_name","紐づけ先のレシピ")+(row.optBoolean("recipe_available")?"":"（非表示）"));}
        Spinner selection=choice("紐づけ先のレシピ",names,ids.indexOf(linked));dirty=true;
        write("紐づけを保存",()->{String id=ids.get(selection.getSelectedItemPosition());JSONObject payload=put(put(put(put(action("wishlist_link"),"id",row.optString("id")),"recipe_id",id.isEmpty()?JSONObject.NULL:id),"expected_recipe_id",row.isNull("recipe_id")?JSONObject.NULL:row.optString("recipe_id")),"expected_revision",row.optInt("recipe_link_revision"));request(()->post(payload),r->{dirty=false;refresh();});});
        button("戻る",()->leave(this::draw));button("最新の紐づけを読み直す",()->leave(this::refresh));
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
        text(week+"からの献立");button("献立を更新",()->leave(this::refresh));button("前の週",()->leave(()->{week=LocalDate.parse(week).minusWeeks(1).toString();refresh();}));button("次の週",()->leave(()->{week=LocalDate.parse(week).plusWeeks(1).toString();refresh();}));
        JSONObject plan=overview.optJSONObject("plan");text(plan==null?"未作成":"CONFIRMED".equals(plan.optString("status"))?"確定済み":"下書き");
        for(int i=0;i<7;i++){String date=LocalDate.parse(week).plusDays(i).toString();JSONObject item=item(date);text(date+" · "+mealName(item)+(recorded(date)?" · ✓ 調理済み":""));if(item!=null)button(date+"の料理",()->cooking(item));}
        write("献立を編集",this::planEditor);button("AI献立・未登録の副菜提案（Web）",()->host.web("/app/meals.php?view=week&week="+week));
        button("買う食材を確認",()->request(()->get("?view=shopping_preview&week="+week),this::shopping));
    }
    private Spinner planChoice(String label,JSONArray recipes,boolean main,JSONObject selected){
        ArrayList<String> names=new ArrayList<>(),ids=new ArrayList<>();names.add("選ばない");ids.add("");String selectedId=selected==null?"":selected.optString("id");JSONObject current=selected;
        for(int i=0;i<recipes.length();i++){JSONObject row=recipes.optJSONObject(i);if(row==null)continue;if(row.optString("id").equals(selectedId))current=row;if(row.optBoolean("is_main")==main){ids.add(row.optString("id"));names.add(row.optString("name"));}}
        if(!selectedId.isEmpty()&&!ids.contains(selectedId)){ids.add(selectedId);names.add(current.optString("name")+"（選択済み・分類変更）");}
        Spinner spinner=new Spinner(activity);spinner.setContentDescription(label);spinner.setAdapter(new ArrayAdapter<>(activity,android.R.layout.simple_spinner_dropdown_item,names));spinner.setTag(ids);spinner.setSelection(Math.max(0,ids.indexOf(selectedId)));return spinner;
    }
    private String planChoiceId(Spinner spinner){return ((java.util.List<?>)spinner.getTag()).get(spinner.getSelectedItemPosition()).toString();}
    private void addPlanSide(LinearLayout container,ArrayList<Spinner> fields,JSONArray recipes,JSONObject selected,String date){
        if(fields.size()>=10){say("副菜などは1日10品までです。");return;}
        LinearLayout row=new LinearLayout(activity);Spinner spinner=planChoice(date+"の副菜など"+(fields.size()+1),recipes,false,selected);fields.add(spinner);row.addView(spinner,new LinearLayout.LayoutParams(0,-2,1));Button remove=host.button("×",()->{if(busy)return;container.removeView(row);fields.remove(spinner);dirty=true;});remove.setContentDescription("副菜の欄を削除");row.addView(remove,compactAction());container.addView(row);
    }
    private void planEditor(){
        body.removeAllViews();dirty=true;text("献立を編集 · "+week);text("主菜はチェック済み、副菜などは未チェックのレシピから選びます。");JSONArray recipes=array(overview,"recipes");
        ArrayList<Spinner> mains=new ArrayList<>();ArrayList<ArrayList<Spinner>> sides=new ArrayList<>();ArrayList<EditText> servings=new ArrayList<>();
        JSONObject original=overview.optJSONObject("plan");String editWeek=week;
        for(int i=0;i<7;i++){String date=LocalDate.parse(editWeek).plusDays(i).toString();JSONObject saved=item(date);
            text(date);Spinner main=planChoice(date+"の主菜・中心の料理",recipes,true,saved==null?null:saved.optJSONObject("recipe"));mains.add(main);body.addView(main);servings.add(input(date+"の人数",saved==null?"2":saved.optString("servings"),true));text("副菜・汁物・お菓子など");LinearLayout container=new LinearLayout(activity);container.setOrientation(LinearLayout.VERTICAL);body.addView(container);ArrayList<Spinner> fields=new ArrayList<>();sides.add(fields);JSONArray selected=array(saved,"sides");if(selected.length()==0)addPlanSide(container,fields,recipes,null,date);else for(int j=0;j<selected.length();j++)addPlanSide(container,fields,recipes,selected.optJSONObject(j),date);button("＋ 副菜などを追加",()->{if(!busy){addPlanSide(container,fields,recipes,null,date);dirty=true;}});}
        java.util.function.Consumer<String> save=status->{try{JSONArray items=new JSONArray();for(int i=0;i<7;i++){String main=planChoiceId(mains.get(i));JSONArray selected=new JSONArray();java.util.HashSet<String> seen=new java.util.HashSet<>();for(Spinner field:sides.get(i)){String side=planChoiceId(field);if(side.isEmpty())continue;if(side.equals(main)||!seen.add(side))throw new IllegalArgumentException("同じ料理が重複しています。選択を確認してください。");selected.put(side);}if(main.isEmpty()){if(selected.length()>0)throw new IllegalArgumentException("副菜などがある日は中心の料理も選んでください。");continue;}JSONObject row=new JSONObject().put("date",LocalDate.parse(editWeek).plusDays(i).toString()).put("recipe_id",main).put("servings",Integer.parseInt(value(servings.get(i))));if(selected.length()>0)row.put("side_recipe_ids",selected);items.put(row);}
            JSONObject plan=new JSONObject().put("week_start",editWeek).put("status",status).put("items",items);if(original!=null)plan.put("revision",original.optString("revision"));request(()->post(put(action("save_plan"),"plan",plan)),r->{dirty=false;refresh();});
        }catch(Exception e){say(e.getMessage()==null?"主菜・副菜・人数を確認してください。":e.getMessage());}};
        write("献立の下書きを保存",()->save.accept("DRAFT"));write("献立を確定",()->new AlertDialog.Builder(activity).setMessage("表示した1週間の献立を確定しますか？").setPositiveButton("確定",(d,w)->save.accept("CONFIRMED")).setNegativeButton("戻る",null).show());button("戻る",()->leave(this::draw));
    }
    private void shopping(JSONObject preview){
        body.removeAllViews();text("買う食材を確認");text("正確な在庫を差し引いた不足量です。自由入力の分量は計算しません。追加する食材を選んでください。同じ週の追加は1回までです。");ArrayList<CheckBox> boxes=new ArrayList<>();JSONArray needs=array(preview,"needs");
        for(int i=0;i<needs.length();i++){JSONObject need=needs.optJSONObject(i);CheckBox box=host.checkbox(need.optString("name")+"："+amount(need,1));box.setEnabled(need.isNull("quantity")||need.optDouble("quantity")>0);body.addView(box);boxes.add(box);}
        write("買い物リストに追加",()->{JSONArray selected=new JSONArray();for(int i=0;i<boxes.size();i++)if(boxes.get(i).isChecked())selected.put(i);if(selected.length()==0){say("追加する食材を選択してください。");return;}JSONObject payload=put(put(put(put(action("shopping_confirm"),"week_start",preview.optString("week_start")),"revision",preview.optString("revision")),"preview_hash",preview.optString("preview_hash")),"selected",selected);request(()->post(payload),r->{dirty=false;body.removeAllViews();text("買い物リストに追加しました。");button("買い物リストを開く",host::shoppingList);button("献立へ戻る",this::draw);});});button("戻る",this::draw);
    }
    private void cooking(JSONObject item){
        body.removeAllViews();JSONObject recipe=item.optJSONObject("recipe");text(mealName(item)+" · "+item.optInt("servings")+"人分");ingredients(recipe,item.optDouble("servings")/recipe.optDouble("servings"));JSONArray sides=array(item,"sides");for(int i=0;i<sides.length();i++){JSONObject side=sides.optJSONObject(i);text("副菜など："+side.optString("name"));ingredients(side,item.optDouble("servings")/side.optDouble("servings"));JSONArray steps=array(side,"steps");for(int j=0;j<steps.length();j++)text((j+1)+". "+steps.optString(j));}
        text("自由入力の分量は人数で換算していません。");JSONArray steps=array(recipe,"steps");final int[] position={0};TextView step=host.text("");body.addView(step);Runnable update=()->step.setText("手順 "+(position[0]+1)+" / "+steps.length()+"\n"+steps.optString(position[0]));update.run();button("前の手順",()->{position[0]=Math.max(0,position[0]-1);update.run();});button("次の手順",()->{position[0]=Math.min(steps.length()-1,position[0]+1);update.run();});
        EditText minutes=input("タイマー（1〜180分）","5",true);TextView timer=host.text("タイマー停止中");body.addView(timer);
        Runnable tick=new Runnable(){public void run(){if(closed||!host.active()||timer.getParent()==null)return;long seconds=Math.max(0,(deadline-SystemClock.elapsedRealtime()+999)/1000);timer.setText(seconds>0?"タイマー "+seconds/60+":"+String.format(java.util.Locale.ROOT,"%02d",seconds%60):"タイマー終了");if(seconds>0)clock.postDelayed(this,500);}};
        button("タイマー開始",()->{try{timerTick=tick;int duration=Integer.parseInt(value(minutes));if(duration<1||duration>180)throw new IllegalArgumentException();if(deadline>SystemClock.elapsedRealtime()){new AlertDialog.Builder(activity).setMessage("現在のタイマーを置き換えますか？").setPositiveButton("開始",(d,w)->{clock.removeCallbacksAndMessages(null);deadline=SystemClock.elapsedRealtime()+duration*60000L;tick.run();}).setNegativeButton("戻る",null).show();}else{deadline=SystemClock.elapsedRealtime()+duration*60000L;tick.run();}}catch(Exception e){say("タイマーは1〜180分で入力してください。");}});button("タイマー停止",()->{clock.removeCallbacksAndMessages(null);deadline=0;timerTick=null;timer.setText("タイマー停止中");});text("タイマーはこの画面を表示している間に確認できます。");
        button("Cooking Live・音声相談（ブラウザ）",()->{try{activity.startActivity(new android.content.Intent(android.content.Intent.ACTION_VIEW,android.net.Uri.parse(ApiClient.ORIGIN+(item.has("wish_id")?"/app/meals.php?view=cook&queue="+item.optString("id"):"/app/meals.php?view=cook&date="+item.optString("date")))));}catch(android.content.ActivityNotFoundException e){say("Webブラウザを利用できません。");}});
        if(item.has("wish_id"))write("料理完了と在庫を確認",()->request(()->get("?view=queue_cooking_preview&id="+item.optString("id")),r->queueComplete(r.getJSONObject("preview"))));else if(recorded(item.optString("date")))text("✓ 調理済み・在庫の再差引きは行いません。");else write("作った記録と在庫を確認",()->request(()->get("?view=cooking_preview&date="+item.optString("date")),r->cooked(r.getJSONObject("preview"))));button("戻る",this::draw);
    }
    private void cooked(JSONObject preview){
        body.removeAllViews();text("作った記録と在庫を確認");JSONArray needs=array(preview,"needs"),allocations=array(preview,"allocations");for(int i=0;i<needs.length();i++){JSONObject row=needs.optJSONObject(i);text(row.optString("name")+" · 使用量 "+amount(row,1));}text("在庫から減らす購入分：");for(int i=0;i<allocations.length();i++){JSONObject row=allocations.optJSONObject(i);text(row.optString("name")+"："+amount(row,1));}
        text("自由入力・おおよその在庫・ある／なしは自動で減らしません。表示した購入分だけを減らします。");CheckBox consume=host.checkbox("表示した数量を在庫から減らす");consume.setEnabled(allocations.length()>0);body.addView(consume);
        write("作った記録を保存",()->{JSONObject payload=put(put(put(put(action("cooked"),"date",preview.optString("date")),"revision",preview.optString("revision")),"preview_hash",preview.optString("preview_hash")),"consume_inventory",consume.isChecked());request(()->post(payload),r->refresh());});button("戻る",this::draw);
    }


    private void queueList(){
        JSONObject queue=overview.optJSONObject("queue");text("今回作るもの · 次の買い物まで");text("日付・レシピなしでも採用できます。買い物が済んでも未調理のものは残ります。");JSONArray items=array(queue,"items");if(items.length()==0)text("食べたいものから採用してください。");
        for(int i=0;i<items.length();i++){
            JSONObject row=items.optJSONObject(i);JSONObject recipe=row.optJSONObject("recipe");LinearLayout line=new LinearLayout(activity);LinearLayout labels=new LinearLayout(activity);labels.setOrientation(LinearLayout.VERTICAL);labels.addView(host.text(row.optString("name")));labels.addView(host.text(row.optBoolean("is_main")?"✓ 主菜":"副菜など"));labels.addView(host.text(recipe==null?"買い物："+row.optString("shopping_text"):"📖 "+recipe.optString("name")+" · "+row.optInt("servings")+"人分"));if(recipe!=null&&!hotcookModel(recipe.optString("source_url")).isEmpty())labels.addView(host.text("ホットクック · "+hotcookModel(recipe.optString("source_url"))));if(!nullable(row,"shopping_job_id").isEmpty())labels.addView(host.text("買い物追加の選択済み · 変更分は買い物で調整"));line.addView(labels,new LinearLayout.LayoutParams(0,-2,1));Button cook=host.button(recipe==null?"完了":"調理",()->{if(recipe==null)request(()->get("?view=queue_cooking_preview&id="+row.optString("id")),r->queueComplete(r.getJSONObject("preview")));else request(()->get("?view=queue_item&id="+row.optString("id")),r->cooking(r.getJSONObject("item")));});line.addView(cook,compactAction());Button menu=host.button("⋯",()->{});menu.setContentDescription(row.optString("name")+"の今回作る操作");menu.setOnClickListener(v->{if(busy)return;PopupMenu popup=new PopupMenu(activity,menu);wishMenu=popup;popup.getMenu().add(0,1,0,"レシピ・買うものを変更");popup.getMenu().add(0,2,1,"食べたいものに戻す");popup.setOnMenuItemClickListener(a->{if(busy||!ApiClient.canMutate())return true;if(a.getItemId()==1)leave(()->queueEdit(row));else new AlertDialog.Builder(activity).setMessage("食べたいものに戻しますか？追加済みの買い物は残ります。").setPositiveButton("戻す",(d,w)->request(()->post(put(put(action("queue_return"),"id",row.optString("id")),"revision",row.optString("revision"))),r->refresh())).setNegativeButton("取消",null).show();return true;});popup.show();});line.addView(menu,new LinearLayout.LayoutParams(dp(44),dp(44)));body.addView(line);
        }
        if(items.length()>0)button("買うものをまとめて確認",()->request(()->get("?view=queue_shopping_preview"),this::queueShopping));
        JSONArray pending=array(queue,"pending_shopping");for(int i=0;i<pending.length();i++){JSONObject job=pending.optJSONObject(i);write("買い物追加を再試行",()->request(()->post(put(action("queue_shopping_resume"),"request_id",job.optString("id"))),r->refresh()));}
        button("食べたいものから選ぶ",()->{page="wishlist";draw();});JSONArray history=array(queue,"history");if(history.length()>0)button("料理・取り消しの履歴",()->{body.removeAllViews();for(int i=0;i<history.length();i++){JSONObject row=history.optJSONObject(i);text(row.optString("name")+" · "+("COOKED".equals(row.optString("status"))?"料理完了":"候補に戻した"));}button("戻る",this::draw);});
    }
    private void queueAdopt(JSONObject row){
        body.removeAllViews();text(row.optString("name")+" · 今回作るものに採用");boolean linked=row.optBoolean("recipe_available");JSONObject recipe=findRecipe(nullable(row,"linked_recipe_id"));if(linked)text("📖 "+nullable(row,"recipe_name"));EditText servings=linked?input("人数",recipe==null?"2":recipe.optString("servings","2"),true):null;EditText shopping=linked?null:input("買い物に追加する内容",row.optString("name"),false);text("買い物への追加は採用後にまとめて確認できます。");String id=UUID.randomUUID().toString();dirty=true;
        write("採用する",()->{try{JSONObject payload=put(put(put(put(put(action("wish_adopt"),"request_id",id),"id",row.optString("id")),"expected_revision",row.optInt("recipe_link_revision")),"servings",linked?Integer.parseInt(value(servings)):2),"shopping_text",linked?row.optString("name"):value(shopping));request(()->post(payload),r->{dirty=false;page="today";refresh();});}catch(Exception e){say("人数・買うものを確認してください。");}});button("戻る",()->leave(this::draw));
    }
    private void queueEdit(JSONObject row){
        body.removeAllViews();text(row.optString("name")+" · レシピ・買うものを変更");ArrayList<String> names=new ArrayList<>(),ids=new ArrayList<>();names.add("レシピなし");ids.add("");JSONArray recipes=array(overview,"recipes");for(int i=0;i<recipes.length();i++){JSONObject recipe=recipes.optJSONObject(i);names.add(recipe.optString("name"));ids.add(recipe.optString("id"));}JSONObject current=row.optJSONObject("recipe");if(current!=null&&!ids.contains(current.optString("id"))){ids.add(current.optString("id"));names.add(current.optString("name"));}Spinner selection=choice("今回作るレシピ",names,current==null?0:ids.indexOf(current.optString("id")));EditText servings=input("人数",row.optString("servings"),true),shopping=input("レシピなしの場合の買うもの",row.optString("shopping_text").isEmpty()?row.optString("name"):row.optString("shopping_text"),false);if(!nullable(row,"shopping_job_id").isEmpty())text("追加済みの買い物は変更しません。変更分は買い物リストで調整してください。");dirty=true;
        write("今回作るものを保存",()->{try{String id=ids.get(selection.getSelectedItemPosition());JSONObject payload=put(put(put(put(put(action("queue_edit"),"id",row.optString("id")),"revision",row.optString("revision")),"recipe_id",id.isEmpty()?JSONObject.NULL:id),"servings",Integer.parseInt(value(servings))),"shopping_text",value(shopping));request(()->post(payload),r->{dirty=false;refresh();});}catch(Exception e){say("人数・買うものを確認してください。");}});button("戻る",()->leave(this::draw));
    }
    private void queueShopping(JSONObject preview){
        body.removeAllViews();text("買うものをまとめて確認");text("未追加の料理をまとめ、正確な在庫を差し引きます。選ばなかったものは買い物で後から追加できます。");ArrayList<CheckBox> boxes=new ArrayList<>();JSONArray needs=array(preview,"needs");for(int i=0;i<needs.length();i++){JSONObject need=needs.optJSONObject(i);CheckBox box=host.checkbox(need.optString("name")+"："+amount(need,1));boolean needed=need.isNull("quantity")||need.optDouble("quantity")>0;box.setEnabled(needed);box.setChecked(needed);body.addView(box);boxes.add(box);}String id=UUID.randomUUID().toString();dirty=true;
        write("選択分を買い物に追加",()->{JSONArray selected=new JSONArray();for(int i=0;i<boxes.size();i++)if(boxes.get(i).isChecked())selected.put(i);if(selected.length()==0){say("追加するものを選んでください。");return;}JSONObject payload=put(put(put(action("queue_shopping_confirm"),"request_id",id),"preview_hash",preview.optString("preview_hash")),"selected",selected);request(()->post(payload),r->{dirty=false;body.removeAllViews();text("買い物リストに追加しました。");button("買い物リストを開く",host::shoppingList);button("今回作るものへ戻る",()->{page="today";refresh();});});});button("戻る",()->leave(this::draw));
    }
    private void queueComplete(JSONObject preview){
        body.removeAllViews();text("料理完了 · 在庫の確認");JSONArray allocations=array(preview,"allocations");for(int i=0;i<allocations.length();i++){JSONObject row=allocations.optJSONObject(i);text(row.optString("name")+"："+amount(row,1));}CheckBox consume=host.checkbox("表示した数量を在庫から減らす");consume.setEnabled(allocations.length()>0);body.addView(consume);text("完了すると今回作るものから外れ、履歴に残ります。");dirty=true;
        write("料理完了を保存",()->{JSONObject payload=put(put(put(put(action("queue_cooked"),"id",preview.optString("id")),"revision",preview.optString("revision")),"preview_hash",preview.optString("preview_hash")),"consume_inventory",consume.isChecked());request(()->post(payload),r->{dirty=false;page="today";refresh();});});button("戻る",()->leave(this::draw));
    }

    private static final String[] TRACKING={"EXACT","APPROXIMATE","PRESENCE","UNTRACKED"};
    private static final String[] TRACKING_LABELS={"正確な数量","おおよそ","ある／なし","管理しない"};
    private static final String[] STORAGE={"PANTRY","FRIDGE","FREEZER"};
    private static final String[] STORAGE_LABELS={"常温","冷蔵","冷凍"};
    private static int index(String[] values,String key){for(int i=0;i<values.length;i++)if(values[i].equals(key))return i;return 0;}
    private static String lotAmount(JSONObject lot){
        String tracking=lot.optString("tracking");
        if("PRESENCE".equals(tracking))return lot.optInt("present")==1?"ある":"ない";
        if("UNTRACKED".equals(tracking))return "数量を管理しない";
        return ("APPROXIMATE".equals(tracking)?"約 ":"")+java.math.BigDecimal.valueOf(lot.optDouble("quantity",0)).stripTrailingZeros().toPlainString()+lot.optString("unit");
    }
    private void inventory(){
        body.removeAllViews();text("食材の在庫");button("在庫を更新",this::inventory);
        request(()->get("?view=inventory"),result->{
            body.removeAllViews();text("食材の在庫");text("期限の近い購入分から表示します。買い物・調理で自動計算するのは、期限内の正確な在庫だけです。");
            write("＋ 在庫を登録",()->lotEditor(null));button("在庫を更新",this::inventory);
            JSONArray lots=array(result.getJSONObject("inventory"),"lots");if(lots.length()==0)text("食材の在庫はまだありません。");
            for(int i=0;i<lots.length();i++){
                JSONObject lot=lots.optJSONObject(i);text(lot.optString("name")+"："+lotAmount(lot));
                text(TRACKING_LABELS[index(TRACKING,lot.optString("tracking"))]+" · "+STORAGE_LABELS[index(STORAGE,lot.optString("storage"))]+"\n購入 "+lot.optString("purchased_on")+" · 期限 "+(lot.isNull("expires_on")||lot.optString("expires_on").isEmpty()?"未設定":lot.optString("expires_on")));
                write("調整："+lot.optString("name"),()->lotEditor(lot));
            }
        });
    }
    static JSONObject lotValue(String name,String tracking,String rawQuantity,String unit,boolean present,String storage,String purchased,String expires)throws Exception{
        boolean quantified="EXACT".equals(tracking)||"APPROXIMATE".equals(tracking);
        double quantity=0;
        if(quantified){
            quantity=Double.parseDouble(java.text.Normalizer.normalize(rawQuantity.trim(),java.text.Normalizer.Form.NFKC));
            if(!Double.isFinite(quantity)||quantity<0||quantity>100000||(quantity>0&&Math.round(quantity*10000)==0))throw new IllegalArgumentException("数量は0〜100000、最小0.0001で入力してください。");
            if(unit.trim().isEmpty())throw new IllegalArgumentException("単位を入力してください。");
        }
        if(name.trim().isEmpty()||name.trim().length()>100)throw new IllegalArgumentException("食材名は1〜100文字で入力してください。");
        if(!purchased.matches("\\d{4}-\\d{2}-\\d{2}")||!LocalDate.parse(purchased).toString().equals(purchased))throw new IllegalArgumentException("購入日はYYYY-MM-DDで入力してください。");
        if(!expires.isEmpty()&&(!expires.matches("\\d{4}-\\d{2}-\\d{2}")||!LocalDate.parse(expires).toString().equals(expires)))throw new IllegalArgumentException("期限はYYYY-MM-DDで入力してください。");
        return new JSONObject().put("name",name.trim()).put("tracking",tracking).put("quantity",quantity).put("unit",quantified?unit.trim():"").put("present",present).put("storage",storage).put("purchased_on",purchased).put("expires_on",expires);
    }
    private void lotEditor(JSONObject original){
        body.removeAllViews();dirty=true;text(original==null?"在庫を登録":"購入分の在庫を調整");
        EditText name=input("食材名",original==null?"":original.optString("name"),false);
        Spinner tracking=choice("在庫の管理方法",new ArrayList<>(java.util.Arrays.asList(TRACKING_LABELS)),original==null?0:index(TRACKING,original.optString("tracking")));
        EditText quantity=input("在庫の数量",original==null?"1":original.optString("quantity"),true);quantity.setInputType(InputType.TYPE_CLASS_NUMBER|InputType.TYPE_NUMBER_FLAG_DECIMAL);
        EditText unit=input("在庫の単位",original==null?"g":original.optString("unit"),false);
        CheckBox present=host.checkbox("食材がある");present.setChecked(original==null||original.optInt("present")==1);body.addView(present);
        Spinner storage=choice("保存場所",new ArrayList<>(java.util.Arrays.asList(STORAGE_LABELS)),original==null?0:index(STORAGE,original.optString("storage")));
        EditText purchased=input("購入日（YYYY-MM-DD）",original==null?today():original.optString("purchased_on"),false);
        EditText expires=input("期限（YYYY-MM-DD・空欄可）",original==null||original.isNull("expires_on")?"":original.optString("expires_on"),false);
        text("正確な数量だけが買い物・調理の自動計算に使われます。おおよそ・ある／なし・管理しないは自動で差し引きません。");
        Runnable updateMode=()->{boolean quantified=tracking.getSelectedItemPosition()<2;quantity.setEnabled(quantified);unit.setEnabled(quantified);present.setEnabled(tracking.getSelectedItemPosition()==2);};
        tracking.setOnItemSelectedListener(new android.widget.AdapterView.OnItemSelectedListener(){public void onItemSelected(android.widget.AdapterView<?> parent,View view,int position,long id){updateMode.run();}public void onNothingSelected(android.widget.AdapterView<?> parent){}});updateMode.run();
        final String[] pending={"",""};
        write("在庫を保存",()->{
            try{
                JSONObject lot=lotValue(value(name),TRACKING[tracking.getSelectedItemPosition()],value(quantity),value(unit),present.isChecked(),STORAGE[storage.getSelectedItemPosition()],value(purchased),value(expires));
                String key=lot.toString();if(!key.equals(pending[0])){pending[0]=key;pending[1]=UUID.randomUUID().toString();}
                JSONObject payload=new JSONObject().put("action",original==null?"inventory_add":"inventory_adjust").put("request_id",pending[1]).put("lot",lot);
                if(original!=null)payload.put("id",original.optString("id")).put("revision",original.optString("revision"));
                request(()->post(payload),r->{dirty=false;inventory();});
            }catch(Exception error){say(error instanceof java.time.format.DateTimeParseException?"購入日・期限をYYYY-MM-DDで確認してください。":error.getMessage()==null?"食材名・数量・単位・日付を確認してください。":error.getMessage());}
        });
        if(original!=null){String archiveId=UUID.randomUUID().toString();write("この購入分を一覧から外す",()->new AlertDialog.Builder(activity).setMessage("登録済みの「"+original.optString("name")+"」を在庫一覧から外しますか？ 未保存の編集は保存されません。").setPositiveButton("一覧から外す",(d,w)->{JSONObject payload=put(put(put(action("inventory_archive"),"request_id",archiveId),"id",original.optString("id")),"revision",original.optString("revision"));request(()->post(payload),r->{dirty=false;inventory();});}).setNegativeButton("戻る",null).show());}
        button("戻る",()->leave(this::inventory));
    }

    private void more(){
        text("AI献立・公開サイト検索・URL取り込み・レシート・離乳食・Cooking Liveは、同じ家族データを使うWeb画面で利用できます。");String[] views={"search","recipes","receipts","baby","ai-check"},names={"クラシル・デリッシュキッチンから探す","URL・動画からレシピを取り込む","レシートを確認","離乳食の確認","AI接続を確認"};for(int i=0;i<views.length;i++){String path="/app/meals.php?view="+views[i];button(names[i]+"（Web）",()->host.web(path));}
    }
}
