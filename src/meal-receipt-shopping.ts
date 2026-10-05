import type {AppContext} from './app-context';
import {BadRequest} from './errors';
import {mealId,mealHash} from './meal-domain';
export const receiptShoppingName=(name:string)=>name.normalize('NFKC').toLocaleLowerCase('ja').replace(/\s/g,'');
export async function receiptShoppingConfirmations(ctx:AppContext,id:string){return (await ctx.env.DB.prepare('SELECT item_index,shopping_item_id FROM meal_receipt_shopping_confirmations WHERE family_id=? AND receipt_id=? ORDER BY item_index LIMIT 40').bind(ctx.member!.family_id,id).all<{item_index:number;shopping_item_id:number}>()).results;}
/** Explicitly reviewed label -> one chosen shared shopping item; quantity is never inferred from OCR. */
export async function confirmReceiptShopping(ctx:AppContext,raw:any){
 const id=mealId(raw.id),index=raw.item_index,x=raw.shopping,m=ctx.member!,familyId=Number(m.family_id),db=ctx.env.DB;
 if(!Number.isSafeInteger(index)||index<0||index>=40||raw.purchase_confirmed!==true||!x||!Number.isSafeInteger(x.id)||x.id<=0||typeof x.name!=='string'||!x.name||x.name.length>255||!(x.quantity===null||typeof x.quantity==='string'&&x.quantity.length<=500)||typeof x.updated_at!=='string'||x.updated_at.length>64)throw new BadRequest('購入した買い物と必要数量を確認してください。');
 const hash=await mealHash({id:x.id,name:x.name,quantity:x.quantity,updated_at:x.updated_at}),read=()=>db.prepare('SELECT shopping_item_id,payload_hash,operation_token FROM meal_receipt_shopping_confirmations WHERE family_id=? AND receipt_id=? AND item_index=?').bind(familyId,id,index).first<{shopping_item_id:number;payload_hash:string;operation_token:string}>();
 const old=await read();if(old){if(old.payload_hash!==hash)throw new BadRequest('この品目の買い物への反映は記録済みです。買い物画面で確認してください。');return {deduplicated:true,shopping_item_id:old.shopping_item_id};}
 const item=await ctx.env.MEALS_DB!.prepare("SELECT i.label FROM receipt_items i JOIN receipt_imports r ON r.family_id=i.family_id AND r.id=i.import_id WHERE i.family_id=? AND i.import_id=? AND i.item_index=? AND r.status='READY' AND r.error_code IS NULL").bind(familyId,id,index).first<{label:string}>();
 if(!item||receiptShoppingName(item.label)!==receiptShoppingName(x.name))throw new BadRequest('照合するレシート品目が見つかりません。');
 const token=crypto.randomUUID(),now=new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Tokyo',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'}).format(new Date());
 const owned='EXISTS(SELECT 1 FROM meal_receipt_shopping_confirmations WHERE family_id=? AND receipt_id=? AND item_index=? AND operation_token=?)';
 // The item snapshot, ledger claim, status and existing completion history commit together in the master DB.
 await db.batch([
  db.prepare("INSERT OR IGNORE INTO meal_receipt_shopping_confirmations(family_id,receipt_id,item_index,shopping_item_id,payload_hash,operation_token,completed_by,completed_at) SELECT ?,?,?,?,?,?,?,? WHERE EXISTS(SELECT 1 FROM shopping_items WHERE family_id=? AND id=? AND status='pending' AND visibility_scope='FAMILY' AND name=? AND quantity IS ? AND updated_at IS ?)").bind(familyId,id,index,x.id,hash,token,m.id,now,familyId,x.id,x.name,x.quantity,x.updated_at),
  db.prepare(`UPDATE shopping_items SET status='completed',completed_by=?,completed_at=?,updated_at=? WHERE family_id=? AND id=? AND status='pending' AND ${owned}`).bind(m.id,now,now,familyId,x.id,familyId,id,index,token),
  db.prepare(`INSERT INTO shopping_completion_history(shopping_item_id,member_id,action,occurred_at) SELECT ?,?,'COMPLETED',? WHERE ${owned}`).bind(x.id,m.id,now,familyId,id,index,token)
 ]);
 const saved=await read();if(!saved)throw new BadRequest('買い物が変更・完了・削除されています。品目を開き直して確認してください。');if(saved.payload_hash!==hash)throw new BadRequest('この品目は別の買い物へ反映済みです。買い物画面で確認してください。');
 return {deduplicated:saved.operation_token!==token,shopping_item_id:saved.shopping_item_id};
}
