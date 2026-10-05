import {BadRequest} from './errors';
import {mealHash,type MealIngredient} from './meal-domain';
/** Existing shopping_items is the only shopping authority. Atomic DB batch bridges a reviewed snapshot. */
export async function projectMealShopping(db:D1Database,familyId:number,memberId:number,week:string,products:MealIngredient[]):Promise<{item_ids:number[];deduplicated:boolean}>{
 if(!products.length||products.length>100)throw new BadRequest('追加する食材を選択してください。');
 const hash=await mealHash(products),now=new Date().toISOString(),operation=crypto.randomUUID();
 const ledger=await db.prepare('SELECT payload_hash FROM meal_shopping_projections WHERE family_id=? AND week_start=?').bind(familyId,week).first<{payload_hash:string}>();
 if(ledger&&ledger.payload_hash!==hash)throw new BadRequest('この週の食材は既に買い物へ追加済みです。買い物画面で調整してください。');
 const keys=products.map((_,i)=>`meal:${week}:${hash.slice(0,24)}:${i}`);
 await db.batch([
 db.prepare('INSERT OR IGNORE INTO meal_shopping_projections(family_id,week_start,payload_hash,operation_id,created_by,created_at) VALUES(?,?,?,?,?,?)').bind(familyId,week,hash,operation,memberId,now),
 db.prepare("INSERT OR IGNORE INTO shopping_items(family_id,name,quantity,memo,due_date,status,created_by,created_at,updated_at,client_request_id,visibility_scope,private_owner_id) SELECT ?,json_extract(j.value,'$.name'),json_extract(j.value,'$.quantity'),?,?,'pending',?,?,?,json_extract(j.value,'$.key'),'FAMILY',NULL FROM json_each(?) j WHERE EXISTS(SELECT 1 FROM meal_shopping_projections WHERE family_id=? AND week_start=? AND payload_hash=? AND operation_id=?)").bind(familyId,`献立 ${week} の食材`,null,memberId,now,now,JSON.stringify(products.map((p,i)=>({name:p.name,quantity:p.quantity===null?p.quantity_text:`${p.quantity}${p.unit}`,key:keys[i]}))),familyId,week,hash,operation),
 ]);
 const final=await db.prepare('SELECT payload_hash FROM meal_shopping_projections WHERE family_id=? AND week_start=?').bind(familyId,week).first<{payload_hash:string}>();if(final?.payload_hash!==hash)throw new BadRequest('別の食材が先に追加されました。買い物画面を確認してください。');
 // Retrying after an item was removed must not recreate it: the ledger closes the operation.
 const rows=await db.prepare('SELECT id FROM shopping_items WHERE family_id=? AND client_request_id IN (SELECT value FROM json_each(?)) ORDER BY id').bind(familyId,JSON.stringify(keys)).all<{id:number}>();
 return {item_ids:rows.results.map(x=>x.id),deduplicated:!!ledger};
}
