import type {AppContext} from './app-context';
import {BadRequest} from './errors';
import {mealText,mealDate,mealId,mealHash,mealShoppingNeeds,type MealIngredient} from './meal-domain';
import {familyDate,DEFAULT_FAMILY_TIMEZONE} from './timezone';
import {readMealPlan} from './meal-repository';
import {mealWeek} from './meal-domain';
type Lot={id:string;name:string;tracking:string;remaining_ticks:number;unit:string;present:number;storage:string;purchased_on:string;expires_on:string|null;revision:string;archived:number};
export const inventoryToday=(ctx:AppContext)=>familyDate(String(ctx.member!.family_timezone||ctx.env.APP_TIMEZONE||DEFAULT_FAMILY_TIMEZONE));
const ticks=(value:unknown)=>{if(typeof value!=='number'||!Number.isFinite(value)||value<0||value>100000)throw new BadRequest('在庫の数量は0〜100000で入力してください。');const n=Math.round(value*10000);if(value>0&&n===0)throw new BadRequest('数量は0.0001以上で入力してください。');return n;};
export function normalizeLot(raw:any){
 if(!raw||typeof raw!=='object')throw new BadRequest('在庫を入力してください。');
 const tracking=String(raw.tracking||'');if(!['EXACT','APPROXIMATE','PRESENCE','UNTRACKED'].includes(tracking))throw new BadRequest('在庫の管理方法を選んでください。');
 const quantified=['EXACT','APPROXIMATE'].includes(tracking),quantity=quantified?ticks(raw.quantity):0;
 const present=quantified?Number(quantity>0):tracking==='PRESENCE'?(raw.present===true?1:raw.present===false?0:-1):0;if(present<0)throw new BadRequest('在庫の有無を選んでください。');
 const storage=String(raw.storage||'');if(!['PANTRY','FRIDGE','FREEZER'].includes(storage))throw new BadRequest('保存場所を選んでください。');
 return {name:mealText(raw.name,100),tracking,remaining_ticks:quantity,unit:quantified?mealText(raw.unit,20):'',present,storage,purchased_on:mealDate(raw.purchased_on),expires_on:raw.expires_on?mealDate(raw.expires_on):null};
}
export async function readMealInventory(db:D1Database,familyId:number){
 // One SQL statement gives revision and rows from the same database snapshot.
 const rows=await db.prepare('SELECT COALESCE(s.revision,0) inventory_revision,l.id,l.name,l.tracking,l.remaining_ticks,l.unit,l.present,l.storage,l.purchased_on,l.expires_on,l.revision,l.archived FROM (SELECT ? family_id) f LEFT JOIN meal_inventory_state s ON s.family_id=f.family_id LEFT JOIN inventory_lots l ON l.family_id=f.family_id AND l.archived=0 ORDER BY l.expires_on IS NULL,l.expires_on,l.purchased_on,l.id LIMIT 200').bind(familyId).all<Lot&{inventory_revision:number}>();
 return {revision:Number(rows.results[0]?.inventory_revision||0),lots:rows.results.filter(l=>l.id).map(({inventory_revision,...l})=>({...l,quantity:l.remaining_ticks/10000}))};
}
/** The operation claim, lot write, revision trigger and audit event share one D1 transaction. */
export async function changeMealInventory(ctx:AppContext,raw:any,kind:'ADD'|'ADJUST'|'ARCHIVE'){
 const db=ctx.env.MEALS_DB!,m=ctx.member!,familyId=Number(m.family_id),id=mealId(raw.request_id),lotId=kind==='ADD'?id:mealId(raw.id),value=kind==='ARCHIVE'?null:normalizeLot(raw.lot),revision=kind==='ADD'?'':mealId(raw.revision);
 const hash=await mealHash({kind,lotId,revision,value}),receipt=()=>db.prepare('SELECT payload_hash,operation_token FROM meal_inventory_operations WHERE family_id=? AND id=?').bind(familyId,id).first<{payload_hash:string;operation_token:string}>();
 const oldReceipt=await receipt();if(oldReceipt){if(oldReceipt.payload_hash!==hash)throw new BadRequest('同じ操作の内容が変わっています。画面を開き直してください。');return {deduplicated:true};}
 const before=kind==='ADD'?null:await db.prepare('SELECT name,tracking,remaining_ticks,unit,present,storage,purchased_on,expires_on,archived FROM inventory_lots WHERE family_id=? AND id=? AND revision=? AND archived=0').bind(familyId,lotId,revision).first<Lot>();
 if(kind!=='ADD'&&!before)throw new BadRequest('在庫が更新されています。読み込み直してください。');
 const token=crypto.randomUUID(),next=crypto.randomUUID(),now=new Date().toISOString();
 const claim=kind==='ADD'?db.prepare('INSERT OR IGNORE INTO meal_inventory_operations(family_id,id,payload_hash,operation_token,created_at) SELECT ?,?,?,?,? WHERE NOT EXISTS(SELECT 1 FROM inventory_lots WHERE family_id=? AND id=?) AND (SELECT COUNT(*) FROM inventory_lots WHERE family_id=? AND archived=0)<200').bind(familyId,id,hash,token,now,familyId,lotId,familyId):db.prepare('INSERT OR IGNORE INTO meal_inventory_operations(family_id,id,payload_hash,operation_token,created_at) SELECT ?,?,?,?,? WHERE EXISTS(SELECT 1 FROM inventory_lots WHERE family_id=? AND id=? AND revision=? AND archived=0)').bind(familyId,id,hash,token,now,familyId,lotId,revision);
 const owned='EXISTS(SELECT 1 FROM meal_inventory_operations WHERE family_id=? AND id=? AND operation_token=?)';
 let write:D1PreparedStatement;
 if(kind==='ADD')write=db.prepare(`INSERT INTO inventory_lots(family_id,id,name,tracking,remaining_ticks,unit,present,storage,purchased_on,expires_on,revision,created_by,created_at,updated_at) SELECT ?,?,?,?,?,?,?,?,?,?,?,?,?,? WHERE ${owned}`).bind(familyId,lotId,value!.name,value!.tracking,value!.remaining_ticks,value!.unit,value!.present,value!.storage,value!.purchased_on,value!.expires_on,next,m.id,now,now,familyId,id,token);
 else if(kind==='ARCHIVE')write=db.prepare(`UPDATE inventory_lots SET archived=1,revision=?,updated_at=? WHERE family_id=? AND id=? AND revision=? AND ${owned}`).bind(next,now,familyId,lotId,revision,familyId,id,token);
 else write=db.prepare(`UPDATE inventory_lots SET name=?,tracking=?,remaining_ticks=?,unit=?,present=?,storage=?,purchased_on=?,expires_on=?,revision=?,updated_at=? WHERE family_id=? AND id=? AND revision=? AND ${owned}`).bind(value!.name,value!.tracking,value!.remaining_ticks,value!.unit,value!.present,value!.storage,value!.purchased_on,value!.expires_on,next,now,familyId,lotId,revision,familyId,id,token);
 await db.batch([claim,write,db.prepare(`INSERT INTO inventory_events(family_id,operation_id,lot_id,kind,before_ticks,after_ticks,unit,before_json,after_json,created_by,created_at) SELECT ?,?,?,?,?,?,?,?,?,?,? WHERE ${owned}`).bind(familyId,id,lotId,kind,before?.remaining_ticks||0,value?.remaining_ticks??before?.remaining_ticks??0,value?.unit??before?.unit??'',JSON.stringify(before),JSON.stringify(kind==='ARCHIVE'?{...before,archived:1}:value),m.id,now,familyId,id,token)]);
 const final=await receipt();if(!final)throw new BadRequest('在庫が更新されたか、登録数が200件に達しました。読み込み直してください。');if(final.payload_hash!==hash)throw new BadRequest('別の内容が先に保存されました。読み込み直してください。');return {deduplicated:final.operation_token!==token};
}
const usable=(lot:Lot,date:string)=>lot.tracking==='EXACT'&&lot.remaining_ticks>0&&lot.purchased_on<=date&&(!lot.expires_on||lot.expires_on>=date);
export function inventoryNeeds(needs:MealIngredient[],lots:Lot[],date:string){
 return needs.map(n=>{if(n.quantity===null)return {...n,required_quantity:null,available_quantity:null};const available=lots.filter(l=>usable(l,date)&&l.name===n.name&&l.unit===n.unit).reduce((sum,l)=>sum+l.remaining_ticks,0),required=Math.round(n.quantity*10000),used=Math.min(required,available);return {...n,required_quantity:n.quantity,available_quantity:available/10000,quantity:(required-used)/10000};});
}
export async function mealShoppingInventory(ctx:AppContext,plan:any){
 const db=ctx.env.MEALS_DB!,familyId=Number(ctx.member!.family_id),[inventory,cooked]=await Promise.all([readMealInventory(db,familyId),db.prepare('SELECT meal_date FROM cooked_events WHERE family_id=? AND plan_revision=?').bind(familyId,plan.revision).all<{meal_date:string}>()]);
 const done=new Set(cooked.results.map(x=>x.meal_date)),needs=inventoryNeeds(mealShoppingNeeds(plan.items.filter((i:any)=>!done.has(i.date))),inventory.lots,inventoryToday(ctx));
 return {needs,inventory_revision:inventory.revision};
}
export async function mealCookingPreview(ctx:AppContext,date:string){
 const db=ctx.env.MEALS_DB!,familyId=Number(ctx.member!.family_id),plan=await readMealPlan(db,familyId,mealWeek(date)),item=plan?.items.find((i:any)=>i.date===date);
 if(!item||plan!.status!=='CONFIRMED')throw new BadRequest('この日の献立を確定してください。');
 const inventory=await readMealInventory(db,familyId),today=inventoryToday(ctx),useDate=date>today?date:today,needs=mealShoppingNeeds([item]),allocations:Array<{id:string;revision:string;name:string;unit:string;quantity:number;before_ticks:number;ticks:number}>=[];
 for(const n of needs){if(n.quantity===null)continue;let remaining=Math.round(n.quantity*10000);for(const lot of inventory.lots){if(!remaining||allocations.length>=16)break;if(usable(lot,useDate)&&lot.name===n.name&&lot.unit===n.unit){const amount=Math.min(remaining,lot.remaining_ticks);allocations.push({id:lot.id,revision:lot.revision,name:lot.name,unit:lot.unit,quantity:amount/10000,before_ticks:lot.remaining_ticks,ticks:amount});remaining-=amount;}}}
 const contents={date,revision:plan!.revision,inventory_revision:inventory.revision,needs,allocations,allocation_limited:allocations.length>=16};return {...contents,preview_hash:await mealHash(contents)};
}
export async function completeMealCooking(ctx:AppContext,raw:any){
 const db=ctx.env.MEALS_DB!,m=ctx.member!,familyId=Number(m.family_id),date=mealDate(raw.date),revision=mealId(raw.revision);
 const previous=await db.prepare('SELECT inventory_result_json FROM cooked_events WHERE family_id=? AND meal_date=? AND plan_revision=?').bind(familyId,date,revision).first<{inventory_result_json:string|null}>();if(previous)return {deduplicated:true,consumed:previous.inventory_result_json?JSON.parse(previous.inventory_result_json):[]};
 const preview=await mealCookingPreview(ctx,date);if(preview.revision!==revision)throw new BadRequest('献立が更新されています。開き直してください。');
 const consume=raw.consume_inventory===true;if(consume&&raw.preview_hash!==preview.preview_hash)throw new BadRequest('在庫が更新されています。確認し直してください。');
 const allocations=consume?preview.allocations:[],token=crypto.randomUUID(),now=new Date().toISOString(),consumed=allocations.map(a=>({name:a.name,quantity:a.quantity,unit:a.unit}));
 const claim=db.prepare("INSERT OR IGNORE INTO cooked_events(family_id,meal_date,plan_revision,cooked_by,cooked_at,operation_id,inventory_result_json) SELECT ?,?,?,?,?,?,? WHERE (?=0 OR COALESCE((SELECT revision FROM meal_inventory_state WHERE family_id=?),0)=?) AND EXISTS(SELECT 1 FROM weekly_plans WHERE family_id=? AND week_start=? AND revision=? AND status='CONFIRMED')").bind(familyId,date,revision,m.id,now,token,JSON.stringify(consumed),consume?1:0,familyId,preview.inventory_revision,familyId,mealWeek(date),revision);
 const owned='EXISTS(SELECT 1 FROM cooked_events WHERE family_id=? AND meal_date=? AND plan_revision=? AND operation_id=?)';
 await db.batch([claim,...allocations.flatMap(a=>[
  db.prepare(`UPDATE inventory_lots SET remaining_ticks=remaining_ticks-?,present=CASE WHEN remaining_ticks-?>0 THEN 1 ELSE 0 END,revision=?,updated_at=? WHERE family_id=? AND id=? AND revision=? AND remaining_ticks>=? AND ${owned}`).bind(a.ticks,a.ticks,crypto.randomUUID(),now,familyId,a.id,a.revision,a.ticks,familyId,date,revision,token),
  db.prepare(`INSERT INTO inventory_events(family_id,operation_id,lot_id,kind,before_ticks,after_ticks,unit,created_by,created_at) SELECT ?,?,?,'CONSUME',?,?,?,?,? WHERE ${owned}`).bind(familyId,token,a.id,a.before_ticks,a.before_ticks-a.ticks,a.unit,m.id,now,familyId,date,revision,token)
 ])]);
 const saved=await db.prepare('SELECT inventory_result_json,operation_id FROM cooked_events WHERE family_id=? AND meal_date=? AND plan_revision=?').bind(familyId,date,revision).first<{inventory_result_json:string;operation_id:string}>();if(!saved)throw new BadRequest('献立または在庫が更新されています。確認し直してください。');return {deduplicated:saved.operation_id!==token,consumed:JSON.parse(saved.inventory_result_json||'[]')};
}
