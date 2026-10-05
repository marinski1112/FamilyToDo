import {importMealReceipt,readMealReceipt,confirmMealReceiptItem} from './meal-receipts';
import {familyDate,DEFAULT_FAMILY_TIMEZONE} from './timezone';
import type {AppContext} from './app-context';
import {json} from './response';
import {BadRequest} from './errors';
import {mealEnabled,mealDate,mealWeek,mealId,mealText,mealHash,shiftMealDate} from './meal-domain';
import {mealRecipeSummaries,mealRecipe,saveMealRecipe,readMealPlan,saveMealPlan} from './meal-repository';
import {readMealInventory,changeMealInventory,mealShoppingInventory,mealCookingPreview,completeMealCooking} from './meal-inventory';
import {importMealUrl} from './meal-url-import';
import {suggestMealWeek} from './meal-weekly-suggestions';
import {projectMealShopping} from './meal-shopping-service';
const out=(value:unknown,status=200)=>json(value,status,{'cache-control':'private, no-store'});
export async function mealApi(request:Request,ctx:AppContext):Promise<Response>{
 const m=ctx.member;if(!m)return out({ok:false,error:'ログインが必要です。'},401);
 if(!mealEnabled(ctx.env))return out({ok:false,error:'ごはん機能は準備中です。',code:'MEALS_NOT_CONFIGURED'},503);
 const db=ctx.env.MEALS_DB!,familyId=Number(m.family_id),url=new URL(request.url);
 if(request.method==='GET'){
  const view=url.searchParams.get('view')||'overview',week=mealWeek(url.searchParams.get('week')||new Date().toISOString().slice(0,10));
  if(view==='receipt')return out({ok:true,receipt:await readMealReceipt(ctx,mealId(url.searchParams.get('id')))});
  if(view==='receipts')return out({ok:true,receipts:(await db.prepare('SELECT id,mode,status,error_code,created_at FROM receipt_imports WHERE family_id=? ORDER BY created_at DESC LIMIT 30').bind(familyId).all()).results});
  if(view==='inventory')return out({ok:true,inventory:await readMealInventory(db,familyId)});
  if(view==='cooking_preview')return out({ok:true,preview:await mealCookingPreview(ctx,mealDate(url.searchParams.get('date')))});
  if(view==='inbox')return out({ok:true,inbox:(await db.prepare("SELECT id,kind,content,created_at FROM meal_inbox WHERE family_id=? AND status='PENDING' ORDER BY created_at DESC,id LIMIT 100").bind(familyId).all()).results});
  if(view==='recipe'){const recipe=await mealRecipe(db,familyId,mealId(url.searchParams.get('id')));return out({ok:!!recipe,recipe},recipe?200:404);}
  if(view==='shopping_preview'){const plan=await readMealPlan(db,familyId,week);if(!plan||plan.status!=='CONFIRMED')return out({ok:false,error:'献立を確定してください。'},409);const {needs,inventory_revision}=await mealShoppingInventory(ctx,plan);return out({ok:true,week_start:week,revision:plan.revision,needs,inventory_revision,preview_hash:await mealHash({revision:plan.revision,needs,inventory_revision})});}
  const [recipes,wishlist,plan,cooked]=await Promise.all([mealRecipeSummaries(db,familyId),db.prepare('SELECT id,name FROM meal_wishlist WHERE family_id=? ORDER BY created_at DESC,id LIMIT 200').bind(familyId).all(),readMealPlan(db,familyId,week),db.prepare('SELECT meal_date,plan_revision FROM cooked_events WHERE family_id=? AND meal_date BETWEEN ? AND ? LIMIT 100').bind(familyId,week,new Date(Date.parse(week+'T12:00:00Z')+6*86400000).toISOString().slice(0,10)).all()]);
  const today=familyDate(String(m.family_timezone||ctx.env.APP_TIMEZONE||DEFAULT_FAMILY_TIMEZONE)),tomorrowDate=shiftMealDate(today,1);let tomorrow_item=null;
  if(week===mealWeek(today)&&mealWeek(tomorrowDate)!==week){const next=await readMealPlan(db,familyId,mealWeek(tomorrowDate));tomorrow_item=next?.items.find((i:any)=>i.date===tomorrowDate)||null;}
  return out({ok:true,recipes,wishlist:wishlist.results,plan,cooked:cooked.results,week_start:week,tomorrow_item});
 }
 if(request.method!=='POST')return out({ok:false,error:'POST only'},405);
 const length=Number(request.headers.get('content-length')||0);if(length>800000)return out({ok:false,error:'入力が大きすぎます。'},413);
 const text=await request.text();if(text.length>750000)return out({ok:false,error:'入力が大きすぎます。'},413);
 let b:any;try{b=JSON.parse(text);}catch{return out({ok:false,error:'入力形式が不正です。'},400);}
 if(text.length>150000&&b?.action!=='receipt_import')return out({ok:false,error:'入力が大きすぎます。'},413);
 if(!ctx.session.csrfToken||!b?.csrf||b.csrf!==ctx.session.csrfToken)return out({ok:false,error:'画面を開き直してください。'},403);
 try{
  if(b.action==='inbox_dismiss'){await db.prepare("UPDATE meal_inbox SET status='DISMISSED',updated_at=? WHERE family_id=? AND id=? AND status='PENDING'").bind(new Date().toISOString(),familyId,mealId(b.id)).run();return out({ok:true});}
  if(b.action==='inbox_wish'){
   const id=mealId(b.id),row=await db.prepare('SELECT kind,status FROM meal_inbox WHERE family_id=? AND id=?').bind(familyId,id).first<{kind:string;status:string}>();
   if(!row||row.kind!=='WISH')return out({ok:false,error:'受信した料理が見つかりません。'},404);
   if(row.status==='DISMISSED')return out({ok:false,error:'この受信内容は確認済みです。'},409);
   const now=new Date().toISOString();
   await db.batch([db.prepare("INSERT OR IGNORE INTO meal_wishlist(family_id,id,name,created_by,created_at) SELECT family_id,id,content,?,? FROM meal_inbox WHERE family_id=? AND id=? AND kind='WISH' AND status='PENDING'").bind(m.id,now,familyId,id),db.prepare("UPDATE meal_inbox SET status='CONFIRMED',updated_at=? WHERE family_id=? AND id=? AND kind='WISH' AND status='PENDING'").bind(now,familyId,id)]);return out({ok:true});
  }
  if(b.action==='receipt_import')return out({ok:true,receipt:await importMealReceipt(ctx,b)});
  if(b.action==='receipt_confirm')return out({ok:true,...await confirmMealReceiptItem(ctx,b)});
  if(b.action==='inventory_add')return out({ok:true,...await changeMealInventory(ctx,b,'ADD')});
  if(b.action==='inventory_adjust')return out({ok:true,...await changeMealInventory(ctx,b,'ADJUST')});
  if(b.action==='inventory_archive')return out({ok:true,...await changeMealInventory(ctx,b,'ARCHIVE')});
  if(b.action==='import_url')return out({ok:true,draft:await importMealUrl(ctx,b)});
  if(b.action==='suggest_week')return out({ok:true,suggestion:await suggestMealWeek(ctx,b)});
  if(b.action==='save_recipe')return out({ok:true,recipe:await saveMealRecipe(db,familyId,m.id,b.recipe)});
  if(b.action==='archive_recipe'){await db.prepare('UPDATE recipes SET archived=1,updated_at=? WHERE family_id=? AND id=?').bind(new Date().toISOString(),familyId,mealId(b.id)).run();return out({ok:true});}
  if(b.action==='wishlist_add'){const id=mealId(b.id),name=mealText(b.name,120);await db.prepare('INSERT OR IGNORE INTO meal_wishlist(family_id,id,name,created_by,created_at) VALUES(?,?,?,?,?)').bind(familyId,id,name,m.id,new Date().toISOString()).run();const saved=await db.prepare('SELECT name FROM meal_wishlist WHERE family_id=? AND id=?').bind(familyId,id).first<{name:string}>();if(saved?.name!==name)return out({ok:false,error:'食べたいものは既に保存されています。画面を開き直してください。'},409);return out({ok:true});}
  if(b.action==='wishlist_delete'){await db.prepare('DELETE FROM meal_wishlist WHERE family_id=? AND id=?').bind(familyId,mealId(b.id)).run();return out({ok:true});}
  if(b.action==='save_plan')return out({ok:true,plan:await saveMealPlan(db,familyId,m.id,b.plan)});
  if(b.action==='shopping_confirm'){
   const week=mealWeek(b.week_start),plan=await readMealPlan(db,familyId,week);if(!plan||plan.status!=='CONFIRMED'||plan.revision!==b.revision) return out({ok:false,error:'献立が更新されています。食材を確認し直してください。'},409);
   const {needs,inventory_revision}=await mealShoppingInventory(ctx,plan);if(b.preview_hash!==await mealHash({revision:plan.revision,needs,inventory_revision}))return out({ok:false,error:'食材を確認し直してください。'},409);
   if(!Array.isArray(b.selected)||!b.selected.length||b.selected.some((x:unknown)=>!Number.isInteger(x)||Number(x)<0||Number(x)>=needs.length)||new Set(b.selected).size!==b.selected.length)throw new BadRequest('追加する食材を選択してください。');
   const selected=[...b.selected].sort((a:number,c:number)=>a-c).map((i:number)=>({name:needs[i].name,quantity:needs[i].quantity,unit:needs[i].unit}));if(selected.some(p=>p.quantity<=0))throw new BadRequest('不足している食材だけを選択してください。');return out({ok:true,...await projectMealShopping(ctx.env.DB,familyId,m.id,week,selected)});
  }
  if(b.action==='cooked'){
   const date=mealDate(b.date),plan=await readMealPlan(db,familyId,mealWeek(date));if(!plan||plan.status!=='CONFIRMED'||plan.revision!==b.revision||!plan.items.some((i:any)=>i.date===date))return out({ok:false,error:'献立を開き直してください。'},409);
   return out({ok:true,...await completeMealCooking(ctx,b)});
  }
  return out({ok:false,error:'未対応の操作です。'},400);
 }catch(e){if(e instanceof BadRequest)return out({ok:false,error:e.message},400);throw e;}
}
