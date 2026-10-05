import {BadRequest} from './errors';
import {mealHash,mealId,normalizeMealRecipe,mealWeek,mealDate,shiftMealDate,mealInteger,type MealRecipe,type MealPlanItem} from './meal-domain';
type Row=Record<string,any>;
const recipeFrom=(r:Row):MealRecipe=>({id:r.id,name:r.name,servings:r.servings,minutes:r.minutes,source_url:r.source_url||'',ingredients:JSON.parse(r.ingredients_json),steps:JSON.parse(r.steps_json),revision:r.revision});
export async function mealRecipes(db:D1Database,familyId:number):Promise<MealRecipe[]>{const r=await db.prepare('SELECT * FROM recipes WHERE family_id=? AND archived=0 ORDER BY updated_at DESC,id LIMIT 200').bind(familyId).all<Row>();return r.results.map(recipeFrom);}
async function recipeSource(db:D1Database,familyId:number,id:string,url:string){if(!/^https:\/\/www\.youtube\.com\/watch\?v=[a-zA-Z0-9_-]{11}$/.test(url))return null;const row=await db.prepare('SELECT metadata_json FROM recipe_sources WHERE family_id=? AND recipe_id=? AND source_url=? ORDER BY confirmed_at DESC,import_id LIMIT 1').bind(familyId,id,url).first<Row>();return row?JSON.parse(row.metadata_json):null;}
export async function mealRecipe(db:D1Database,familyId:number,id:string):Promise<MealRecipe|null>{const r=await db.prepare('SELECT * FROM recipes WHERE family_id=? AND id=? AND archived=0').bind(familyId,id).first<Row>();return r?{...recipeFrom(r),source:await recipeSource(db,familyId,id,r.source_url||'')}:null;}
export async function saveMealRecipe(db:D1Database,familyId:number,memberId:number,raw:any):Promise<MealRecipe>{
 const r=normalizeMealRecipe(raw),hash=await mealHash(r),revision=crypto.randomUUID(),now=new Date().toISOString();
 let provenance:{id:string;metadata:string}|null=null;
 if(raw.import_request_id){const id=mealId(raw.import_request_id),job=await db.prepare("SELECT result_json FROM meal_url_imports WHERE family_id=? AND id=? AND status='READY'").bind(familyId,id).first<Row>();const draft=job?JSON.parse(job.result_json)?.draft:null;
  if(!draft||draft.analysis?.kind!=='YOUTUBE'||draft.source_url!==r.source_url)throw new BadRequest('取り込み元が変わっています。出典を確認し直してください。');provenance={id,metadata:JSON.stringify(draft.analysis)};
 }
 const write=raw.revision?db.prepare('UPDATE recipes SET name=?,servings=?,minutes=?,source_url=?,ingredients_json=?,steps_json=?,revision=?,payload_hash=?,updated_at=? WHERE family_id=? AND id=? AND archived=0 AND (revision=? OR payload_hash=?)').bind(r.name,r.servings,r.minutes,r.source_url||null,JSON.stringify(r.ingredients),JSON.stringify(r.steps),revision,hash,now,familyId,r.id,String(raw.revision),hash):db.prepare('INSERT OR IGNORE INTO recipes(family_id,id,name,servings,minutes,source_url,ingredients_json,steps_json,revision,payload_hash,created_by,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)').bind(familyId,r.id,r.name,r.servings,r.minutes,r.source_url||null,JSON.stringify(r.ingredients),JSON.stringify(r.steps),revision,hash,memberId,now,now);
 if(provenance)await db.batch([write,db.prepare('INSERT OR IGNORE INTO recipe_sources(family_id,recipe_id,import_id,source_url,metadata_json,confirmed_by,confirmed_at) SELECT ?,?,?,?,?,?,? WHERE EXISTS(SELECT 1 FROM recipes WHERE family_id=? AND id=? AND archived=0 AND payload_hash=?)').bind(familyId,r.id,provenance.id,r.source_url,provenance.metadata,memberId,now,familyId,r.id,hash)]);else await write.run();
 const saved=await db.prepare('SELECT * FROM recipes WHERE family_id=? AND id=? AND archived=0').bind(familyId,r.id).first<Row>();
 if(!saved||saved.payload_hash!==hash)throw new BadRequest('レシピが更新されています。開き直して確認してください。');return {...recipeFrom(saved),source:await recipeSource(db,familyId,r.id,r.source_url)};
}
export async function readMealPlan(db:D1Database,familyId:number,week:string):Promise<Row|null>{const r=await db.prepare('SELECT * FROM weekly_plans WHERE family_id=? AND week_start=?').bind(familyId,mealWeek(week)).first<Row>();return r?{week_start:r.week_start,revision:r.revision,status:r.status,items:JSON.parse(r.items_json)}:null;}
export async function saveMealPlan(db:D1Database,familyId:number,memberId:number,raw:any):Promise<Row>{
 const week=mealWeek(raw.week_start);if(week!==raw.week_start)throw new BadRequest('週の開始は月曜日を指定してください。');
 if(!Array.isArray(raw.items)||!raw.items.length||raw.items.length>7)throw new BadRequest('献立を1〜7日分選択してください。');
 const dates=new Set<string>(),items:MealPlanItem[]=[];
 for(const item of raw.items){const date=mealDate(item.date);if(date<week||date>shiftMealDate(week,6)||dates.has(date))throw new BadRequest('献立の日付が不正です。');dates.add(date);const recipe=await mealRecipe(db,familyId,String(item.recipe_id||''));if(!recipe)throw new BadRequest('この家族のレシピを選択してください。');const {revision,source,...snapshot}=recipe;items.push({date,servings:mealInteger(item.servings,30),recipe:snapshot});}
 items.sort((a,b)=>a.date.localeCompare(b.date));const status=raw.status==='CONFIRMED'?'CONFIRMED':'DRAFT',hash=await mealHash({items,status}),revision=crypto.randomUUID(),now=new Date().toISOString();
 if(raw.revision)await db.prepare('UPDATE weekly_plans SET revision=?,status=?,items_json=?,payload_hash=?,updated_by=?,updated_at=? WHERE family_id=? AND week_start=? AND (revision=? OR payload_hash=?)').bind(revision,status,JSON.stringify(items),hash,memberId,now,familyId,week,String(raw.revision),hash).run();
 else await db.prepare('INSERT OR IGNORE INTO weekly_plans(family_id,week_start,revision,status,items_json,payload_hash,updated_by,updated_at) VALUES(?,?,?,?,?,?,?,?)').bind(familyId,week,revision,status,JSON.stringify(items),hash,memberId,now).run();
 const saved=await db.prepare('SELECT payload_hash FROM weekly_plans WHERE family_id=? AND week_start=?').bind(familyId,week).first<Row>();if(!saved||saved.payload_hash!==hash)throw new BadRequest('献立が更新されています。開き直して確認してください。');return (await readMealPlan(db,familyId,week))!;
}

export async function mealRecipeSummaries(db:D1Database,familyId:number):Promise<Row[]>{const r=await db.prepare('SELECT id,name,servings,minutes,source_url,revision,json_array_length(ingredients_json) ingredient_count FROM recipes WHERE family_id=? AND archived=0 ORDER BY updated_at DESC,id LIMIT 200').bind(familyId).all<Row>();return r.results;}
