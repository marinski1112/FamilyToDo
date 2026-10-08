import {readQueueItem,readMealQueue,adoptMealWish,decideMealWish,editMealQueue,returnMealQueue,queueCookingPreview,completeQueueCooking,queueShoppingPreview,confirmQueueShopping} from './meal-queue';
import {readRecipeCatalog,restoreRecipe} from './meal-recipe-catalog';
import {guideMealBaby} from './meal-baby-guidance';
import {startMealLive,endMealLive} from './meal-live';
import {searchMealPublisher} from './meal-publisher-search';
import {confirmReceiptShopping} from './meal-receipt-shopping';
import {readLineReceipts,prepareLineReceipt,dismissLineReceipt,completeLineReceipt} from './meal-line-receipts';
import {importMealYouTube} from './meal-youtube';
import {readMealBaby,saveMealBaby,previewMealBaby} from './meal-baby';
import {importMealReceipt,readMealReceipt,confirmMealReceiptItem} from './meal-receipts';
import {familyDate,DEFAULT_FAMILY_TIMEZONE} from './timezone';
import type {AppContext} from './app-context';
import {json} from './response';
import {BadRequest} from './errors';
import {mealEnabled,mealMain,mealDate,mealWeek,mealId,mealText,mealHash,shiftMealDate} from './meal-domain';
import {mealRecipeSummaries,mealRecipe,saveMealRecipe,readMealPlan,saveMealPlan,readMealWishlist} from './meal-repository';
import {readMealInventory,changeMealInventory,mealShoppingInventory,mealCookingPreview,completeMealCooking} from './meal-inventory';
import {importMealUrl} from './meal-url-import';
import {suggestMealWeek} from './meal-weekly-suggestions';
import {projectMealShopping} from './meal-shopping-service';
const out=(value:unknown,status=200)=>json(value,status,{'cache-control':'private, no-store'});
async function mealInputText(request:Request):Promise<string|null>{
 const reader=request.body?.getReader();if(!reader)return '';const decoder=new TextDecoder();let size=0,text='';
 try{for(;;){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>800000)return null;text+=decoder.decode(value,{stream:true});}return text+decoder.decode();}
 finally{await reader.cancel().catch(()=>{});}
}
export async function mealApi(request:Request,ctx:AppContext):Promise<Response>{
 const m=ctx.member;if(!m)return out({ok:false,error:'ログインが必要です。'},401);
 if(!mealEnabled(ctx.env))return out({ok:false,error:'ごはん機能は準備中です。',code:'MEALS_NOT_CONFIGURED'},503);
 const db=ctx.env.MEALS_DB!,familyId=Number(m.family_id),url=new URL(request.url);
 if(request.method==='GET'){try{
  const view=url.searchParams.get('view')||'overview',week=mealWeek(url.searchParams.get('week')||new Date().toISOString().slice(0,10));
  if(view==='recipe_catalog')return out({ok:true,catalog:await readRecipeCatalog(db,familyId,url)});
  if(view==='ai_status'){
   if(!['OWNER','ADMIN'].includes(String(m.role||'').toUpperCase()))return out({ok:false,error:'管理者のみ利用できます。'},403);
   const [guidance,live]=await Promise.all([
    db.prepare('SELECT status,result_json,created_at FROM meal_baby_guidance WHERE family_id=? ORDER BY created_at DESC LIMIT 10').bind(familyId).all<any>(),
    db.prepare('SELECT status,model,error_code,created_at FROM meal_live_sessions WHERE family_id=? ORDER BY created_at DESC LIMIT 10').bind(familyId).all<any>()
   ]);
   return out({ok:true,guidance:guidance.results.map(r=>{let result:any={};try{result=JSON.parse(r.result_json||'{}');}catch{}return {status:r.status,mode:result.mode||'',reason:result.reason||'',created_at:r.created_at};}),live:live.results});
  }
  if(view==='baby')return out({ok:true,baby:await readMealBaby(ctx)});
  if(view==='receipt')return out({ok:true,receipt:await readMealReceipt(ctx,mealId(url.searchParams.get('id')))});
  if(view==='receipts')return out({ok:true,receipts:(await db.prepare('SELECT id,mode,status,error_code,created_at FROM receipt_imports WHERE family_id=? ORDER BY created_at DESC LIMIT 30').bind(familyId).all()).results});
  if(view==='inventory')return out({ok:true,inventory:await readMealInventory(db,familyId)});
  if(view==='cooking_preview')return out({ok:true,preview:await mealCookingPreview(ctx,mealDate(url.searchParams.get('date')))});
  if(view==='inbox')return out({ok:true,line_receipts:await readLineReceipts(ctx),inbox:(await db.prepare("SELECT id,kind,content,created_at FROM meal_inbox WHERE family_id=? AND status='PENDING' ORDER BY created_at DESC,id LIMIT 100").bind(familyId).all()).results});
  if(view==='recipe'){const recipe=await mealRecipe(db,familyId,mealId(url.searchParams.get('id')));return out({ok:!!recipe,recipe},recipe?200:404);}
  if(view==='queue_item')return out({ok:true,item:await readQueueItem(ctx,url.searchParams.get('id'))});
  if(view==='queue')return out({ok:true,queue:await readMealQueue(ctx)});
  if(view==='queue_shopping_preview')return out({ok:true,...await queueShoppingPreview(ctx)});
  if(view==='queue_cooking_preview')return out({ok:true,preview:await queueCookingPreview(ctx,url.searchParams.get('id'))});
  if(view==='shopping_preview'){const plan=await readMealPlan(db,familyId,week);if(!plan||plan.status!=='CONFIRMED')return out({ok:false,error:'献立を確定してください。'},409);const {needs,inventory_revision}=await mealShoppingInventory(ctx,plan);return out({ok:true,week_start:week,revision:plan.revision,needs,inventory_revision,preview_hash:await mealHash({revision:plan.revision,needs,inventory_revision})});}
  const [queue,recipes,wishlist,plan,cooked]=await Promise.all([readMealQueue(ctx),mealRecipeSummaries(db,familyId),readMealWishlist(db,familyId),readMealPlan(db,familyId,week),db.prepare('SELECT meal_date,plan_revision FROM cooked_events WHERE family_id=? AND meal_date BETWEEN ? AND ? LIMIT 100').bind(familyId,week,new Date(Date.parse(week+'T12:00:00Z')+6*86400000).toISOString().slice(0,10)).all()]);
  const today=familyDate(String(m.family_timezone||ctx.env.APP_TIMEZONE||DEFAULT_FAMILY_TIMEZONE)),tomorrowDate=shiftMealDate(today,1);let tomorrow_item=null;
  if(week===mealWeek(today)&&mealWeek(tomorrowDate)!==week){const next=await readMealPlan(db,familyId,mealWeek(tomorrowDate));tomorrow_item=next?.items.find((i:any)=>i.date===tomorrowDate)||null;}
  return out({ok:true,queue,recipes,wishlist,plan,cooked:cooked.results,week_start:week,tomorrow_item});
 }catch(e){if(e instanceof BadRequest)return out({ok:false,error:e.message},400);throw e;}
 }
 if(request.method!=='POST')return out({ok:false,error:'POST only'},405);
 const length=Number(request.headers.get('content-length')||0);if(length>800000)return out({ok:false,error:'入力が大きすぎます。'},413);
 const text=await mealInputText(request);if(text===null||text.length>750000)return out({ok:false,error:'入力が大きすぎます。'},413);
 let b:any;try{b=JSON.parse(text);}catch{return out({ok:false,error:'入力形式が不正です。'},400);}
 if(text.length>150000&&b?.action!=='receipt_import')return out({ok:false,error:'入力が大きすぎます。'},413);
 if(!ctx.session.csrfToken||!b?.csrf||b.csrf!==ctx.session.csrfToken)return out({ok:false,error:'画面を開き直してください。'},403);
 try{
  if(b.action==='line_receipt_image')return out({ok:true,...await prepareLineReceipt(ctx,b.id)});
  if(b.action==='line_receipt_dismiss'){await dismissLineReceipt(ctx,mealId(b.id));return out({ok:true});}
  if(b.action==='line_receipt_complete'){await completeLineReceipt(ctx,mealId(b.id));return out({ok:true});}
  if(b.action==='inbox_dismiss'){await db.prepare("UPDATE meal_inbox SET status='DISMISSED',updated_at=? WHERE family_id=? AND id=? AND status='PENDING'").bind(new Date().toISOString(),familyId,mealId(b.id)).run();return out({ok:true});}
  if(b.action==='inbox_wish'){
   const id=mealId(b.id),row=await db.prepare('SELECT kind,status,content FROM meal_inbox WHERE family_id=? AND id=?').bind(familyId,id).first<{kind:string;status:string;content:string}>();
   if(!row||!['WISH','RECIPE_URL'].includes(row.kind))return out({ok:false,error:'受信した料理が見つかりません。'},404);
   if(row.status==='DISMISSED')return out({ok:false,error:'この受信内容は確認済みです。'},409);
   // A confirmed receipt remains consumed even if its wish is later deleted.
   if(row.status==='CONFIRMED')return out({ok:true});
   const name=row.kind==='WISH'?row.content:mealText(b.name,120),source=row.kind==='RECIPE_URL'?row.content:null,now=new Date().toISOString();
   await db.batch([db.prepare("INSERT OR IGNORE INTO meal_wishlist(family_id,id,name,source_url,created_by,created_at) SELECT family_id,id,?,?,?,? FROM meal_inbox WHERE family_id=? AND id=? AND status='PENDING'").bind(name,source,m.id,now,familyId,id),db.prepare("UPDATE meal_inbox SET status='CONFIRMED',updated_at=? WHERE family_id=? AND id=? AND status='PENDING'").bind(now,familyId,id)]);return out({ok:true});
  }
  if(b.action==='baby_save')return out({ok:true,profile:await saveMealBaby(ctx,b)});
  if(b.action==='baby_guidance')return out({ok:true,...await guideMealBaby(ctx,b)});
  if(b.action==='baby_preview')return out({ok:true,review:await previewMealBaby(ctx,b)});
  if(b.action==='receipt_import')return out({ok:true,receipt:await importMealReceipt(ctx,b)});
  if(b.action==='receipt_shopping_confirm')return out({ok:true,...await confirmReceiptShopping(ctx,b)});
  if(b.action==='receipt_confirm')return out({ok:true,...await confirmMealReceiptItem(ctx,b)});
  if(b.action==='inventory_add')return out({ok:true,...await changeMealInventory(ctx,b,'ADD')});
  if(b.action==='inventory_adjust')return out({ok:true,...await changeMealInventory(ctx,b,'ADJUST')});
  if(b.action==='inventory_archive')return out({ok:true,...await changeMealInventory(ctx,b,'ARCHIVE')});
  if(b.action==='import_youtube')return out({ok:true,draft:await importMealYouTube(ctx,b)});
  if(b.action==='search_recipes')return out({ok:true,search:await searchMealPublisher(ctx,b)});
  if(b.action==='import_url')return out({ok:true,draft:await importMealUrl(ctx,b)});
  if(b.action==='live_start')return out({ok:true,live:await startMealLive(ctx,b)});
  if(b.action==='live_end')return out({ok:true,...await endMealLive(ctx,b)});
  if(b.action==='suggest_week')return out({ok:true,suggestion:await suggestMealWeek(ctx,b)});
  if(b.action==='wish_adopt')return out({ok:true,...await adoptMealWish(ctx,b)});
  if(b.action==='wish_reject'||b.action==='wish_restore')return out({ok:true,...await decideMealWish(ctx,b,b.action==='wish_restore')});
  if(b.action==='queue_edit')return out({ok:true,...await editMealQueue(ctx,b)});
  if(b.action==='queue_return')return out({ok:true,...await returnMealQueue(ctx,b)});
  if(b.action==='queue_cooked')return out({ok:true,...await completeQueueCooking(ctx,b)});
  if(b.action==='queue_shopping_confirm'||b.action==='queue_shopping_resume')return out({ok:true,...await confirmQueueShopping(ctx,b)});
  if(b.action==='save_recipe')return out({ok:true,recipe:await saveMealRecipe(db,familyId,m.id,b.recipe,b.add_to_wishlist,b.wishlist_id,b.wishlist_revision)});
  if(b.action==='wishlist_main'){
   const id=mealId(b.id),main=mealMain(b.is_main),revision=b.expected_revision;if(!Number.isSafeInteger(revision)||revision<0)throw new BadRequest('内容を読み込み直してください。');
   await db.prepare("UPDATE meal_wishlist SET is_main=?,recipe_link_revision=recipe_link_revision+1 WHERE family_id=? AND id=? AND status='PENDING' AND recipe_link_revision=?").bind(Number(main),familyId,id,revision).run();
   const saved=await db.prepare("SELECT is_main,recipe_link_revision FROM meal_wishlist WHERE family_id=? AND id=? AND status='PENDING'").bind(familyId,id).first<any>();
   if(!saved||!!saved.is_main!==main||saved.recipe_link_revision!==revision+1)return out({ok:false,error:'内容が更新されています。読み込み直してください。'},409);return out({ok:true});
  }
  if(b.action==='wishlist_link'){
   const expectedRevision=b.expected_revision??0;if(!Number.isSafeInteger(expectedRevision)||expectedRevision<0)throw new BadRequest('紐づけを読み込み直してください。');
   const id=mealId(b.id),target=b.recipe_id==null?null:mealId(b.recipe_id),expected=b.expected_recipe_id==null?null:mealId(b.expected_recipe_id);
   if(target&&!await mealRecipe(db,familyId,target))throw new BadRequest('この家族の表示中のレシピを選択してください。');
   await db.prepare("UPDATE meal_wishlist SET recipe_id=?,recipe_link_set=1,recipe_link_revision=recipe_link_revision+1 WHERE family_id=? AND id=? AND status='PENDING' AND (recipe_id IS ? OR recipe_id IS ?) AND (recipe_link_revision=? OR (recipe_id IS ? AND recipe_link_set=1)) AND (? IS NULL OR EXISTS(SELECT 1 FROM recipes WHERE family_id=? AND id=? AND archived=0))").bind(target,familyId,id,expected,target,expectedRevision,target,target,familyId,target).run();
   const saved=await db.prepare("SELECT recipe_id FROM meal_wishlist WHERE family_id=? AND id=? AND status='PENDING'").bind(familyId,id).first<any>();
   if(!saved||saved.recipe_id!==target)return out({ok:false,error:'紐づけが更新されています。読み込み直してください。'},409);
   return out({ok:true});
  }
  if(b.action==='restore_recipe')return out({ok:true,...await restoreRecipe(db,familyId,b)});
  if(b.action==='archive_recipe'){await db.prepare('UPDATE recipes SET archived=1,updated_at=? WHERE family_id=? AND id=?').bind(new Date().toISOString(),familyId,mealId(b.id)).run();return out({ok:true});}
  if(b.action==='wishlist_add'){const id=mealId(b.id),name=mealText(b.name,120),main=mealMain(b.is_main);await db.prepare('INSERT OR IGNORE INTO meal_wishlist(family_id,id,name,is_main,created_by,created_at) VALUES(?,?,?,?,?,?)').bind(familyId,id,name,Number(main),m.id,new Date().toISOString()).run();const saved=await db.prepare('SELECT name,is_main FROM meal_wishlist WHERE family_id=? AND id=?').bind(familyId,id).first<{name:string;is_main:number}>();if(saved?.name!==name||!!saved?.is_main!==main)return out({ok:false,error:'食べたいものは既に保存されています。画面を開き直してください。'},409);return out({ok:true});}
  if(b.action==='wishlist_delete'){await db.prepare("UPDATE meal_wishlist SET status='REJECTED',decision_at=?,recipe_link_revision=recipe_link_revision+1 WHERE family_id=? AND id=? AND status='PENDING'").bind(new Date().toISOString(),familyId,mealId(b.id)).run();return out({ok:true});}
  if(b.action==='save_plan')return out({ok:true,plan:await saveMealPlan(db,familyId,m.id,b.plan)});
  if(b.action==='shopping_confirm'){
   const week=mealWeek(b.week_start),plan=await readMealPlan(db,familyId,week);if(!plan||plan.status!=='CONFIRMED'||plan.revision!==b.revision) return out({ok:false,error:'献立が更新されています。食材を確認し直してください。'},409);
   const {needs,inventory_revision}=await mealShoppingInventory(ctx,plan);if(b.preview_hash!==await mealHash({revision:plan.revision,needs,inventory_revision}))return out({ok:false,error:'食材を確認し直してください。'},409);
   if(!Array.isArray(b.selected)||!b.selected.length||b.selected.some((x:unknown)=>!Number.isInteger(x)||Number(x)<0||Number(x)>=needs.length)||new Set(b.selected).size!==b.selected.length)throw new BadRequest('追加する食材を選択してください。');
   const selected=[...b.selected].sort((a:number,c:number)=>a-c).map((i:number)=>{const n=needs[i];return n.quantity===null?{name:n.name,quantity:null,unit:'' as const,quantity_text:n.quantity_text}:{name:n.name,quantity:n.quantity,unit:n.unit};});if(selected.some(p=>p.quantity!==null&&p.quantity<=0))throw new BadRequest('不足している食材だけを選択してください。');return out({ok:true,...await projectMealShopping(ctx.env.DB,familyId,m.id,week,selected)});
  }
  if(b.action==='cooked'){
   const date=mealDate(b.date),plan=await readMealPlan(db,familyId,mealWeek(date));if(!plan||plan.status!=='CONFIRMED'||plan.revision!==b.revision||!plan.items.some((i:any)=>i.date===date))return out({ok:false,error:'献立を開き直してください。'},409);
   return out({ok:true,...await completeMealCooking(ctx,b)});
  }
  return out({ok:false,error:'未対応の操作です。'},400);
 }catch(e){if(e instanceof BadRequest)return out({ok:false,error:e.message},400);throw e;}
}
