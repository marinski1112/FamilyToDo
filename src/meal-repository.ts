import {BadRequest} from './errors';
import {mealHash,mealId,normalizeMealRecipe,mealWeek,mealDate,shiftMealDate,mealInteger,type MealRecipe,type MealPlanItem} from './meal-domain';
type Row=Record<string,any>;
const recipeFrom=(r:Row):MealRecipe=>({id:r.id,name:r.name,servings:r.servings,minutes:r.minutes,source_url:r.source_url||'',ingredients:JSON.parse(r.ingredients_json),steps:JSON.parse(r.steps_json),revision:r.revision});
export async function mealRecipes(db:D1Database,familyId:number):Promise<MealRecipe[]>{const r=await db.prepare('SELECT * FROM recipes WHERE family_id=? AND archived=0 ORDER BY updated_at DESC,id LIMIT 200').bind(familyId).all<Row>();return r.results.map(recipeFrom);}
async function recipeSource(db:D1Database,familyId:number,id:string,url:string){if(!/^https:\/\/www\.youtube\.com\/watch\?v=[a-zA-Z0-9_-]{11}$/.test(url))return null;const row=await db.prepare('SELECT metadata_json FROM recipe_sources WHERE family_id=? AND recipe_id=? AND source_url=? ORDER BY confirmed_at DESC,import_id LIMIT 1').bind(familyId,id,url).first<Row>();return row?JSON.parse(row.metadata_json):null;}
export async function mealRecipe(db:D1Database,familyId:number,id:string):Promise<MealRecipe|null>{const r=await db.prepare('SELECT * FROM recipes WHERE family_id=? AND id=? AND archived=0').bind(familyId,id).first<Row>();return r?{...recipeFrom(r),source:await recipeSource(db,familyId,id,r.source_url||'')}:null;}
export async function saveMealRecipe(db:D1Database,familyId:number,memberId:number,raw:any,addToWishlist:unknown=false,wishlistId:unknown=null,wishRevision:unknown=0):Promise<MealRecipe>{
 if(typeof addToWishlist!=='boolean')throw new BadRequest('食べたいものへの追加を確認してください。');
 const r=normalizeMealRecipe(raw),hash=await mealHash(r),revision=crypto.randomUUID(),now=new Date().toISOString();
 const wish=wishlistId==null?null:mealId(wishlistId);
 if(wish&&(!Number.isSafeInteger(wishRevision)||Number(wishRevision)<0))throw new BadRequest('紐づけを読み込み直してください。');
 const guard="EXISTS(SELECT 1 FROM meal_wishlist WHERE family_id=? AND id=? AND status='PENDING' AND (recipe_id IS NULL OR recipe_id=?) AND (recipe_link_revision=? OR recipe_id=?))";
 let provenance:{id:string;metadata:string}|null=null;
 if(raw.import_request_id){const id=mealId(raw.import_request_id),job=await db.prepare("SELECT result_json FROM meal_url_imports WHERE family_id=? AND id=? AND status='READY'").bind(familyId,id).first<Row>();const draft=job?JSON.parse(job.result_json)?.draft:null;
  if(!draft||draft.analysis?.kind!=='YOUTUBE'||draft.source_url!==r.source_url)throw new BadRequest('取り込み元が変わっています。出典を確認し直してください。');provenance={id,metadata:JSON.stringify(draft.analysis)};
 }
 const update='UPDATE recipes SET name=?,servings=?,minutes=?,source_url=?,ingredients_json=?,steps_json=?,revision=?,payload_hash=?,updated_at=? WHERE family_id=? AND id=? AND archived=0 AND (revision=? OR payload_hash=?)';
 const insert='INSERT OR IGNORE INTO recipes(family_id,id,name,servings,minutes,source_url,ingredients_json,steps_json,revision,payload_hash,created_by,created_at,updated_at) SELECT ?,?,?,?,?,?,?,?,?,?,?,?,?';
 const args=raw.revision?[r.name,r.servings,r.minutes,r.source_url||null,JSON.stringify(r.ingredients),JSON.stringify(r.steps),revision,hash,now,familyId,r.id,String(raw.revision),hash]:[familyId,r.id,r.name,r.servings,r.minutes,r.source_url||null,JSON.stringify(r.ingredients),JSON.stringify(r.steps),revision,hash,memberId,now,now];
 const write=db.prepare((raw.revision?update:insert)+(wish?(raw.revision?' AND ':' WHERE ')+guard:'')).bind(...args,...(wish?[familyId,wish,r.id,wishRevision,r.id]:[]));
 const writes=[write];
 if(provenance)writes.push(db.prepare('INSERT OR IGNORE INTO recipe_sources(family_id,recipe_id,import_id,source_url,metadata_json,confirmed_by,confirmed_at) SELECT ?,?,?,?,?,?,? WHERE EXISTS(SELECT 1 FROM recipes WHERE family_id=? AND id=? AND archived=0 AND payload_hash=?)'+(wish?' AND '+guard:'')).bind(familyId,r.id,provenance.id,r.source_url,provenance.metadata,memberId,now,familyId,r.id,hash,...(wish?[familyId,wish,r.id,wishRevision,r.id]:[])));
 if(wish)writes.push(db.prepare("UPDATE meal_wishlist SET recipe_id=?,recipe_link_set=1,recipe_link_revision=recipe_link_revision+1 WHERE family_id=? AND id=? AND status='PENDING' AND (recipe_id IS NULL OR recipe_id=?) AND (recipe_link_revision=? OR recipe_id=?) AND EXISTS(SELECT 1 FROM recipes WHERE family_id=? AND id=? AND archived=0 AND payload_hash=?)").bind(r.id,familyId,wish,r.id,wishRevision,r.id,familyId,r.id,hash));
 else if(addToWishlist){const wishId='recipe-'+await mealHash({recipe_id:r.id});writes.push(db.prepare('INSERT OR IGNORE INTO meal_wishlist(family_id,id,name,source_url,created_by,created_at,recipe_id,recipe_link_set) SELECT family_id,?,name,source_url,?,?,id,1 FROM recipes WHERE family_id=? AND id=? AND archived=0 AND payload_hash=? AND NOT EXISTS(SELECT 1 FROM meal_wishlist WHERE family_id=? AND recipe_id=?)').bind(wishId,memberId,now,familyId,r.id,hash,familyId,r.id));writes.push(db.prepare("UPDATE meal_wishlist SET recipe_id=?,recipe_link_set=1,recipe_link_revision=recipe_link_revision+1 WHERE family_id=? AND id=? AND recipe_id IS NULL AND recipe_link_set=0 AND EXISTS(SELECT 1 FROM recipes WHERE family_id=? AND id=? AND archived=0 AND payload_hash=?)").bind(r.id,familyId,wishId,familyId,r.id,hash));}
 if(writes.length>1)await db.batch(writes);else await write.run();
 const saved=await db.prepare('SELECT * FROM recipes WHERE family_id=? AND id=? AND archived=0').bind(familyId,r.id).first<Row>();
 if(wish){const linked=await db.prepare('SELECT recipe_id FROM meal_wishlist WHERE family_id=? AND id=?').bind(familyId,wish).first<Row>();if(linked?.recipe_id!==r.id)throw new BadRequest('元の食べたいものが更新されています。確認し直してください。');}
 if(!saved||saved.payload_hash!==hash)throw new BadRequest('レシピが更新されています。開き直して確認してください。');return {...recipeFrom(saved),source:await recipeSource(db,familyId,r.id,r.source_url)};
}

export async function readMealWishlist(db:D1Database,familyId:number,id?:string):Promise<Row[]>{
 const rows=(await db.prepare("SELECT w.id,w.name,w.source_url,w.recipe_id,w.recipe_link_set,w.recipe_link_revision,w.status,r.name recipe_name,r.source_url recipe_source_url,r.archived recipe_archived FROM meal_wishlist w LEFT JOIN recipes r ON r.family_id=w.family_id AND r.id=w.recipe_id WHERE w.family_id=? AND w.status='PENDING'"+(id?" AND w.id=?":"")+" ORDER BY w.created_at DESC,w.id LIMIT 200").bind(familyId,...(id?[mealId(id)]:[])).all<Row>()).results;
 // #1191 generated IDs carry an exact identity even before the column existed.
 const needsLegacy=rows.some(w=>!w.recipe_link_set&&!w.recipe_id&&/^recipe-[a-f0-9]{64}$/.test(w.id));
 const recipes=needsLegacy?await mealRecipeSummaries(db,familyId):[],legacy=new Map<string,Row>();
 await Promise.all(recipes.map(async r=>legacy.set('recipe-'+await mealHash({recipe_id:r.id}),r)));
 return rows.map(w=>{const known=w.recipe_link_set?undefined:legacy.get(w.id);return {...w,linked_recipe_id:w.recipe_id||known?.id||null,recipe_name:w.recipe_name||known?.name||null,recipe_source_url:w.recipe_source_url||known?.source_url||null,recipe_available:w.recipe_id?!!w.recipe_name&&!w.recipe_archived:!!known};});
}
export async function readMealPlan(db:D1Database,familyId:number,week:string):Promise<Row|null>{const r=await db.prepare('SELECT * FROM weekly_plans WHERE family_id=? AND week_start=?').bind(familyId,mealWeek(week)).first<Row>();return r?{week_start:r.week_start,revision:r.revision,status:r.status,items:JSON.parse(r.items_json)}:null;}
export async function saveMealPlan(db:D1Database,familyId:number,memberId:number,raw:any):Promise<Row>{
 const week=mealWeek(raw.week_start);if(week!==raw.week_start)throw new BadRequest('週の開始は月曜日を指定してください。');
 if(!Array.isArray(raw.items)||!raw.items.length||raw.items.length>7)throw new BadRequest('献立を1〜7日分選択してください。');
 const dates=new Set<string>(),items:MealPlanItem[]=[];
 for(const item of raw.items){const date=mealDate(item.date);if(date<week||date>shiftMealDate(week,6)||dates.has(date))throw new BadRequest('献立の日付が不正です。');dates.add(date);const recipe=await mealRecipe(db,familyId,String(item.recipe_id||''));if(!recipe)throw new BadRequest('この家族のレシピを選択してください。');const {revision,source,...snapshot}=recipe;const sideIds=item.side_recipe_ids??[];if(!Array.isArray(sideIds)||sideIds.length>1||sideIds.some((id:any)=>typeof id!=='string'||id===recipe.id))throw new BadRequest('副菜は主菜と異なる料理を1品選択してください。');const sides:MealRecipe[]=[];for(const id of sideIds){const side=await mealRecipe(db,familyId,mealId(id));if(!side)throw new BadRequest('この家族の副菜を選択してください。');const {revision,source,...savedSide}=side;sides.push(savedSide);}items.push({date,servings:mealInteger(item.servings,30),recipe:snapshot,...(sides.length?{sides}:{})});}
 items.sort((a,b)=>a.date.localeCompare(b.date));const status=raw.status==='CONFIRMED'?'CONFIRMED':'DRAFT',hash=await mealHash({items,status}),revision=crypto.randomUUID(),now=new Date().toISOString();
 if(raw.revision)await db.prepare('UPDATE weekly_plans SET revision=?,status=?,items_json=?,payload_hash=?,updated_by=?,updated_at=? WHERE family_id=? AND week_start=? AND (revision=? OR payload_hash=?)').bind(revision,status,JSON.stringify(items),hash,memberId,now,familyId,week,String(raw.revision),hash).run();
 else await db.prepare('INSERT OR IGNORE INTO weekly_plans(family_id,week_start,revision,status,items_json,payload_hash,updated_by,updated_at) VALUES(?,?,?,?,?,?,?,?)').bind(familyId,week,revision,status,JSON.stringify(items),hash,memberId,now).run();
 const saved=await db.prepare('SELECT payload_hash FROM weekly_plans WHERE family_id=? AND week_start=?').bind(familyId,week).first<Row>();if(!saved||saved.payload_hash!==hash)throw new BadRequest('献立が更新されています。開き直して確認してください。');return (await readMealPlan(db,familyId,week))!;
}

export async function mealRecipeSummaries(db:D1Database,familyId:number):Promise<Row[]>{const r=await db.prepare('SELECT id,name,servings,minutes,source_url,revision,json_array_length(ingredients_json) ingredient_count FROM recipes WHERE family_id=? AND archived=0 ORDER BY updated_at DESC,id LIMIT 200').bind(familyId).all<Row>();return r.results;}
