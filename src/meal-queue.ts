import type {AppContext} from './app-context';
import {BadRequest} from './errors';
import {mealId,mealText,mealInteger,mealHash,mealShoppingNeeds,type MealRecipe,type MealIngredient} from './meal-domain';
import {mealRecipe,readMealWishlist} from './meal-repository';
import {readMealInventory,assertCompleteMealInventory,inventoryNeeds,inventoryToday,mealCookingAllocations} from './meal-inventory';
import {projectMealShopping} from './meal-shopping-service';
type Row=Record<string,any>;
const queueSummary="id,wish_id,name,is_main,servings,shopping_text,revision,status,shopping_job_id,created_at,updated_at,completed_at,completed_by,CASE WHEN recipe_json IS NULL THEN NULL ELSE json_object('id',json_extract(recipe_json,'$.id'),'name',json_extract(recipe_json,'$.name'),'servings',json_extract(recipe_json,'$.servings'),'minutes',json_extract(recipe_json,'$.minutes'),'source_url',json_extract(recipe_json,'$.source_url')) END recipe_json";
const changed=()=>new BadRequest('内容が更新されています。読み込み直して確認してください。');
const family=(ctx:AppContext)=>Number(ctx.member!.family_id);
const decode=(r:Row,full=false):Row=>{const recipe=r.recipe_json?JSON.parse(r.recipe_json):null;return {...r,is_main:!!r.is_main,recipe:recipe&&(full?recipe:{id:recipe.id,name:recipe.name,servings:recipe.servings,minutes:recipe.minutes,source_url:recipe.source_url}),recipe_json:undefined,inventory_result_json:undefined,completion_token:undefined,adoption_hash:undefined,edit_hash:undefined};};
export async function readMealQueue(ctx:AppContext){
 const db=ctx.env.MEALS_DB!,f=family(ctx);
 const [active,history,rejected,jobs]=await Promise.all([
  db.prepare(`SELECT ${queueSummary} FROM meal_cooking_queue WHERE family_id=? AND status='ACTIVE' ORDER BY created_at,id LIMIT 100`).bind(f).all<Row>(),
  db.prepare(`SELECT ${queueSummary} FROM meal_cooking_queue WHERE family_id=? AND status!='ACTIVE' ORDER BY updated_at DESC,id LIMIT 50`).bind(f).all<Row>(),
  db.prepare("SELECT id,name,recipe_link_revision FROM meal_wishlist WHERE family_id=? AND status='REJECTED' ORDER BY decision_at DESC,id LIMIT 50").bind(f).all<Row>(),
  db.prepare("SELECT id FROM meal_queue_shopping_jobs WHERE family_id=? AND status='PENDING' ORDER BY created_at LIMIT 10").bind(f).all<Row>()]);
 return {items:active.results.map(r=>decode(r)),history:history.results.map(r=>decode(r)),rejected:rejected.results,pending_shopping:jobs.results};
}
async function queueRow(ctx:AppContext,id:unknown){const r=await ctx.env.MEALS_DB!.prepare('SELECT * FROM meal_cooking_queue WHERE family_id=? AND id=?').bind(family(ctx),mealId(id)).first<Row>();if(!r)throw changed();return r;}
async function recipeSnapshot(ctx:AppContext,id:unknown):Promise<MealRecipe|null>{if(id==null)return null;const r=await mealRecipe(ctx.env.MEALS_DB!,family(ctx),mealId(id));if(!r)throw new BadRequest('表示中の家族のレシピを選択してください。');const {source,revision,...snapshot}=r;return snapshot;}
export async function adoptMealWish(ctx:AppContext,b:any){
 const db=ctx.env.MEALS_DB!,f=family(ctx),id=mealId(b.request_id),wishId=mealId(b.id),adoptionHash=await mealHash({wishId,expected_revision:b.expected_revision,servings:b.servings,shopping_text:b.shopping_text}),old=await db.prepare('SELECT wish_id,adoption_hash FROM meal_cooking_queue WHERE family_id=? AND id=?').bind(f,id).first<Row>();
 if(old){if(old.wish_id!==wishId||old.adoption_hash!==adoptionHash)throw changed();return {deduplicated:true};}
 const wish=(await readMealWishlist(db,f,wishId)).find(w=>w.id===wishId);if(!wish||wish.status!=='PENDING'||wish.recipe_link_revision!==b.expected_revision)throw changed();
 const recipe=wish.recipe_available?await recipeSnapshot(ctx,wish.linked_recipe_id):null,servings=mealInteger(b.servings,30),shoppingText=recipe?'':mealText(b.shopping_text,120),now=new Date().toISOString();
 await db.batch([
 db.prepare("INSERT OR IGNORE INTO meal_cooking_queue(family_id,id,wish_id,name,is_main,recipe_json,servings,shopping_text,adoption_hash,revision,status,created_by,created_at,updated_at) SELECT ?,?,?,?,?,?,?,?,?,?,'ACTIVE',?,?,? WHERE EXISTS(SELECT 1 FROM meal_wishlist WHERE family_id=? AND id=? AND status='PENDING' AND recipe_link_revision=?) AND (SELECT COUNT(*) FROM meal_cooking_queue WHERE family_id=? AND status='ACTIVE')<100").bind(f,id,wishId,wish.name,Number(wish.is_main),recipe?JSON.stringify(recipe):null,servings,shoppingText,adoptionHash,crypto.randomUUID(),ctx.member!.id,now,now,f,wishId,b.expected_revision,f),
 db.prepare("UPDATE meal_wishlist SET status='ADOPTED',decision_at=?,recipe_link_revision=recipe_link_revision+1 WHERE family_id=? AND id=? AND status='PENDING' AND recipe_link_revision=? AND EXISTS(SELECT 1 FROM meal_cooking_queue WHERE family_id=? AND id=? AND wish_id=?)").bind(now,f,wishId,b.expected_revision,f,id,wishId)]);
 const saved=await db.prepare('SELECT wish_id FROM meal_cooking_queue WHERE family_id=? AND id=?').bind(f,id).first<Row>();if(saved?.wish_id!==wishId)throw changed();return {deduplicated:false};
}
export async function decideMealWish(ctx:AppContext,b:any,restore=false){
 const f=family(ctx),db=ctx.env.MEALS_DB!,id=mealId(b.id);if(!Number.isSafeInteger(b.expected_revision)||b.expected_revision<0)throw changed();
 const from=restore?'REJECTED':'PENDING',to=restore?'PENDING':'REJECTED';
 await db.prepare('UPDATE meal_wishlist SET status=?,decision_at=?,recipe_link_revision=recipe_link_revision+1 WHERE family_id=? AND id=? AND status=? AND recipe_link_revision=?').bind(to,new Date().toISOString(),f,id,from,b.expected_revision).run();
 const row=await db.prepare('SELECT status FROM meal_wishlist WHERE family_id=? AND id=?').bind(f,id).first<Row>();if(row?.status!==to)throw changed();return {};
}
export async function editMealQueue(ctx:AppContext,b:any){
 const r=await queueRow(ctx,b.id),editHash=await mealHash({revision:b.revision,recipe_id:b.recipe_id,servings:b.servings,shopping_text:b.shopping_text});if(r.status!=='ACTIVE')throw changed();if(r.edit_hash===editHash)return {deduplicated:true};if(r.revision!==b.revision)throw changed();
 const current=r.recipe_json?JSON.parse(r.recipe_json):null,recipe=current&&current.id===b.recipe_id?current:await recipeSnapshot(ctx,b.recipe_id),servings=mealInteger(b.servings,30),shoppingText=recipe?'':mealText(b.shopping_text,120),f=family(ctx),revision=crypto.randomUUID();
 const result=await ctx.env.MEALS_DB!.prepare("UPDATE meal_cooking_queue SET recipe_json=?,servings=?,shopping_text=?,edit_hash=?,revision=?,updated_at=? WHERE family_id=? AND id=? AND status='ACTIVE' AND revision=?").bind(recipe?JSON.stringify(recipe):null,servings,shoppingText,editHash,revision,new Date().toISOString(),f,r.id,r.revision).run();if(!result.meta.changes)throw changed();return {};
}
export async function returnMealQueue(ctx:AppContext,b:any){
 const r=await queueRow(ctx,b.id),f=family(ctx),db=ctx.env.MEALS_DB!,now=new Date().toISOString();if(r.status==='DROPPED')return {deduplicated:true};if(r.status!=='ACTIVE'||r.revision!==b.revision)throw changed();
 const revision=crypto.randomUUID();await db.batch([
 db.prepare("UPDATE meal_cooking_queue SET status='DROPPED',revision=?,updated_at=? WHERE family_id=? AND id=? AND status='ACTIVE' AND revision=?").bind(revision,now,f,r.id,r.revision),
 db.prepare("UPDATE meal_wishlist SET status='PENDING',recipe_link_revision=recipe_link_revision+1 WHERE family_id=? AND id=? AND status='ADOPTED' AND EXISTS(SELECT 1 FROM meal_cooking_queue WHERE family_id=? AND id=? AND status='DROPPED' AND revision=?)").bind(f,r.wish_id,f,r.id,revision)]);return {};
}
export async function queueCookingPreview(ctx:AppContext,id:unknown){const r=await queueRow(ctx,id);if(r.status!=='ACTIVE')throw changed();const preview=await mealCookingAllocations(ctx,{revision:r.revision,servings:r.servings,recipe:r.recipe_json?JSON.parse(r.recipe_json):{ingredients:[],servings:r.servings}},inventoryToday(ctx));return {...preview,id:r.id};}
export async function completeQueueCooking(ctx:AppContext,b:any){
 const r=await queueRow(ctx,b.id);if(r.status==='COOKED'){if(r.revision!==b.revision)throw changed();return {deduplicated:true};}if(r.status!=='ACTIVE'||r.revision!==b.revision)throw changed();
 const preview=await queueCookingPreview(ctx,r.id),consume=b.consume_inventory===true;if(consume&&preview.preview_hash!==b.preview_hash)throw changed();
 const f=family(ctx),db=ctx.env.MEALS_DB!,token=crypto.randomUUID(),now=new Date().toISOString(),allocations=consume?preview.allocations:[],consumed=allocations.map(a=>({name:a.name,quantity:a.quantity,unit:a.unit}));
 const owned="EXISTS(SELECT 1 FROM meal_cooking_queue WHERE family_id=? AND id=? AND status='COOKED' AND completion_token=?)";
 await db.batch([
 db.prepare("UPDATE meal_cooking_queue SET status='COOKED',completed_at=?,completed_by=?,updated_at=?,completion_token=?,inventory_result_json=? WHERE family_id=? AND id=? AND status='ACTIVE' AND revision=? AND (?=0 OR COALESCE((SELECT revision FROM meal_inventory_state WHERE family_id=?),0)=?)").bind(now,ctx.member!.id,now,token,JSON.stringify(consumed),f,r.id,r.revision,consume?1:0,f,preview.inventory_revision),
 ...allocations.flatMap(a=>[
 db.prepare(`UPDATE inventory_lots SET remaining_ticks=remaining_ticks-?,present=CASE WHEN remaining_ticks-?>0 THEN 1 ELSE 0 END,revision=?,updated_at=? WHERE family_id=? AND id=? AND revision=? AND remaining_ticks>=? AND ${owned}`).bind(a.ticks,a.ticks,crypto.randomUUID(),now,f,a.id,a.revision,a.ticks,f,r.id,token),
 db.prepare(`INSERT INTO inventory_events(family_id,operation_id,lot_id,kind,before_ticks,after_ticks,unit,created_by,created_at) SELECT ?,?,?,'CONSUME',?,?,?,?,? WHERE ${owned}`).bind(f,token,a.id,a.before_ticks,a.before_ticks-a.ticks,a.unit,ctx.member!.id,now,f,r.id,token)])]);
 const final=await queueRow(ctx,r.id);if(final.status!=='COOKED')throw changed();return {deduplicated:final.completion_token!==token,consumed:JSON.parse(final.inventory_result_json||'[]')};
}
export async function queueShoppingPreview(ctx:AppContext){
 const rows=await ctx.env.MEALS_DB!.prepare("SELECT id,revision,servings,shopping_text,CASE WHEN recipe_json IS NULL THEN NULL ELSE json_object('id',json_extract(recipe_json,'$.id'),'name',json_extract(recipe_json,'$.name'),'servings',json_extract(recipe_json,'$.servings'),'ingredients',json_extract(recipe_json,'$.ingredients')) END recipe_json FROM meal_cooking_queue WHERE family_id=? AND status='ACTIVE' AND shopping_job_id IS NULL ORDER BY created_at,id LIMIT 100").bind(family(ctx)).all<Row>();const items=rows.results.map(r=>decode(r,true)),inventory=await readMealInventory(ctx.env.MEALS_DB!,family(ctx));
 assertCompleteMealInventory(inventory);
 const recipes=items.filter(r=>r.recipe).map(r=>({date:inventoryToday(ctx),recipe:r.recipe,servings:r.servings})),vague=items.filter(r=>!r.recipe).map(r=>({name:r.shopping_text,quantity:null,unit:'' as const,quantity_text:'必要なら購入'}));
 const needs=inventoryNeeds(mealShoppingNeeds(recipes),inventory.lots,inventoryToday(ctx));for(const n of vague)if(!needs.some(x=>x.name===n.name&&x.quantity===null&&x.quantity_text===n.quantity_text))needs.push({...n,required_quantity:null,available_quantity:null});
 if(needs.length>100)throw new BadRequest('食材が100件を超えています。料理を分けてください。');const entries=items.map(r=>({id:r.id,revision:r.revision})),contents={entries,needs,inventory_revision:inventory.revision};return {...contents,preview_hash:await mealHash(contents)};
}
export async function confirmQueueShopping(ctx:AppContext,b:any){
 const db=ctx.env.MEALS_DB!,f=family(ctx),id=mealId(b.request_id);let job=await db.prepare('SELECT * FROM meal_queue_shopping_jobs WHERE family_id=? AND id=?').bind(f,id).first<Row>();
 if(!job){
 const preview=await queueShoppingPreview(ctx);if(preview.preview_hash!==b.preview_hash||!preview.entries.length)throw changed();
 if(!Array.isArray(b.selected)||!b.selected.length||new Set(b.selected).size!==b.selected.length||b.selected.some((n:any)=>!Number.isInteger(n)||n<0||n>=preview.needs.length))throw new BadRequest('追加する食材を選択してください。');
 const products:MealIngredient[]=b.selected.slice().sort((a:number,c:number)=>a-c).map((i:number)=>{const n=preview.needs[i];if(n.quantity!==null&&n.quantity<=0)throw new BadRequest('不足している食材を選択してください。');return n.quantity===null?{name:n.name,quantity:null,unit:'',quantity_text:n.quantity_text}:{name:n.name,quantity:n.quantity,unit:n.unit};});
 const entries=JSON.stringify(preview.entries),token=crypto.randomUUID(),hash=await mealHash({preview_hash:b.preview_hash,selected:b.selected.slice().sort((a:number,c:number)=>a-c)}),guard="NOT EXISTS(SELECT 1 FROM json_each(?) j LEFT JOIN meal_cooking_queue q ON q.family_id=? AND q.id=json_extract(j.value,'$.id') WHERE q.id IS NULL OR q.status!='ACTIVE' OR q.shopping_job_id IS NOT NULL OR q.revision!=json_extract(j.value,'$.revision')) AND COALESCE((SELECT revision FROM meal_inventory_state WHERE family_id=?),0)=?";
 await db.batch([
 db.prepare(`INSERT OR IGNORE INTO meal_queue_shopping_jobs(family_id,id,payload_hash,products_json,entries_json,status,operation_token,created_by,created_at) SELECT ?,?,?,?,?,'PENDING',?,?,? WHERE ${guard}`).bind(f,id,hash,JSON.stringify(products),entries,token,ctx.member!.id,new Date().toISOString(),entries,f,f,preview.inventory_revision),
 db.prepare("UPDATE meal_cooking_queue SET shopping_job_id=? WHERE family_id=? AND id IN (SELECT json_extract(value,'$.id') FROM json_each(?)) AND EXISTS(SELECT 1 FROM meal_queue_shopping_jobs WHERE family_id=? AND id=? AND operation_token=?)").bind(id,f,entries,f,id,token)]);
 job=await db.prepare('SELECT * FROM meal_queue_shopping_jobs WHERE family_id=? AND id=?').bind(f,id).first<Row>();if(!job||job.payload_hash!==hash)throw changed();
 }else if(b.action!=='queue_shopping_resume'&&job.payload_hash!==await mealHash({preview_hash:b.preview_hash,selected:Array.isArray(b.selected)?b.selected.slice().sort((a:number,c:number)=>a-c):[]}))throw changed();
 const result=await projectMealShopping(ctx.env.DB,f,ctx.member!.id,'cycle-'+id,JSON.parse(job.products_json));
 await db.prepare("UPDATE meal_queue_shopping_jobs SET status='DONE' WHERE family_id=? AND id=?").bind(f,id).run();return result;
}

export async function queueCookingItem(ctx:AppContext,id:unknown,revision:unknown){const row=await queueRow(ctx,id);if(row.status!=='ACTIVE'||row.revision!==revision||!row.recipe_json)throw changed();return {recipe:JSON.parse(row.recipe_json),servings:row.servings};}

export async function readQueueItem(ctx:AppContext,id:unknown){const row=await queueRow(ctx,id);if(row.status!=='ACTIVE')throw changed();return decode(row,true);}
