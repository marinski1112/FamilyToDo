import { goodsVisibilitySql } from './goods-visibility';
import { json } from './response';

type Row=Record<string,unknown>;
type EditableSetEntry={name:string;memo:string;url:string;category:string};
const UNCLASSIFIED='未分類';
const CATEGORY_ORDER_KEY='item_category_order';
const MAX_SET_ITEMS=100;

const nowJst=()=>new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Tokyo',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'}).format(new Date()).replace(' ',' ');
const bad=(error:string,status=400,code='BAD_REQUEST')=>json({ok:false,error,code},status);
const normalizeCategory=(value:unknown)=>{const raw=String(value??'').trim();return !raw||raw===UNCLASSIFIED?'':raw;};
const validUrl=(raw:string)=>{if(!raw)return true;if(raw.length>2048)return false;try{const value=new URL(raw);return (value.protocol==='http:'||value.protocol==='https:')&&!value.username&&!value.password;}catch{return false;}};
const uniquePositiveIds=(value:unknown)=>{
  const out:number[]=[];const seen=new Set<number>();
  for(const raw of Array.isArray(value)?value:[]){const id=Number(raw);if(!Number.isInteger(id)||id<=0||seen.has(id))continue;seen.add(id);out.push(id);}
  return out;
};
const parseIds=(value:unknown)=>{try{const parsed=JSON.parse(String(value??'[]'));return uniquePositiveIds(parsed);}catch{return [];}};
const canManageSet=(m:any,row:Row)=>{const role=String(m.role||'').toUpperCase();return Number(row.created_by_member_id)===Number(m.id)||role==='OWNER'||role==='ADMIN';};
const parseEditableEntries=(value:unknown):{entries:EditableSetEntry[];error:string}=>{
  if(!Array.isArray(value)||!value.length)return {entries:[],error:'セットには1件以上の持ち物が必要です。'};
  if(value.length>MAX_SET_ITEMS)return {entries:[],error:`1つのセットは${MAX_SET_ITEMS}件までです。`};
  const entries:EditableSetEntry[]=[];
  for(const raw of value){
    const row=(raw&&typeof raw==='object'?raw:{}) as Row;
    const name=String(row.name??'').trim(),memo=String(row.memo??'').trim(),url=String(row.url??'').trim(),category=normalizeCategory(row.category);
    if(!name||name.length>200)return {entries:[],error:'持ち物名は1〜200文字で入力してください。'};
    if(memo.length>2000)return {entries:[],error:'メモは2000文字以内で入力してください。'};
    if(category.length>255)return {entries:[],error:'カテゴリ名は255文字以内で入力してください。'};
    if(!validUrl(url))return {entries:[],error:'URLはhttp:// または https:// で入力してください。'};
    entries.push({name,memo,url,category});
  }
  return {entries,error:''};
};

async function readCategoryOrder(ctx:any,familyId:number):Promise<string[]>{
  const row=(await ctx.env.DB.prepare('SELECT setting_value FROM family_settings WHERE family_id=? AND setting_key=? LIMIT 1').bind(familyId,CATEGORY_ORDER_KEY).first()) as Row|null;
  if(!row?.setting_value)return [];
  try{const parsed=JSON.parse(String(row.setting_value));return (Array.isArray(parsed)?parsed:[]).map((value:unknown)=>String(value??'').trim()).filter(Boolean);}catch{return [];}
}
async function ensureCategories(ctx:any,familyId:number,memberId:number,categories:string[]):Promise<void>{
  const unique:string[]=[];const seen=new Set<string>();
  for(const raw of categories){const name=normalizeCategory(raw),key=name.toLocaleLowerCase('ja-JP');if(!name||seen.has(key))continue;seen.add(key);unique.push(name);}
  if(!unique.length)return;
  const statements:any[]=[];
  for(const name of unique){
    statements.push(ctx.env.DB.prepare(`INSERT OR IGNORE INTO item_category_catalog(family_id,name,enabled,is_custom,created_by_member_id,created_at,updated_at)
      VALUES(?,?,1,1,?,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)`).bind(familyId,name,memberId));
    statements.push(ctx.env.DB.prepare('UPDATE item_category_catalog SET enabled=1,updated_at=CURRENT_TIMESTAMP WHERE family_id=? AND name=? COLLATE NOCASE').bind(familyId,name));
  }
  await ctx.env.DB.batch(statements);
  const order=await readCategoryOrder(ctx,familyId),keys=new Set(order.map(name=>name.toLocaleLowerCase('ja-JP')));let changed=false;
  for(const name of unique){const key=name.toLocaleLowerCase('ja-JP');if(keys.has(key))continue;keys.add(key);order.push(name);changed=true;}
  if(changed)await ctx.env.DB.prepare("INSERT INTO family_settings(family_id,setting_key,setting_value,updated_at) VALUES(?,?,?,?) ON CONFLICT(family_id,setting_key) DO UPDATE SET setting_value=excluded.setting_value,updated_at=excluded.updated_at").bind(familyId,CATEGORY_ORDER_KEY,JSON.stringify(order),nowJst()).run();
}

async function rowsByIds(ctx:any,familyId:number,memberId:number,ids:number[]):Promise<Row[]>{
  if(!ids.length)return [];
  const placeholders=ids.map(()=>'?').join(',');
  const result=await ctx.env.DB.prepare(`SELECT i.id,i.name,i.category FROM items i WHERE i.family_id=? AND i.id IN (${placeholders}) AND ${goodsVisibilitySql('i')}`).bind(familyId,...ids,memberId).all();
  const byId=new Map(((result?.results||[]) as Row[]).map(row=>[Number(row.id),row]));
  return ids.map(id=>byId.get(id)).filter(Boolean) as Row[];
}

export async function readItemReusableSets(ctx:any,m:any):Promise<Response>{
  const result=await ctx.env.DB.prepare(`SELECT s.id,s.name,s.created_by_member_id,s.updated_at,COUNT(e.id) AS item_count
    FROM item_reusable_sets s LEFT JOIN item_reusable_set_entries e ON e.set_id=s.id
    WHERE s.family_id=?
    GROUP BY s.id,s.name,s.created_by_member_id,s.updated_at
    ORDER BY s.updated_at DESC,s.id DESC`).bind(m.family_id).all();
  const entryResult=await ctx.env.DB.prepare(`SELECT e.set_id,e.position,e.name,e.memo,e.url,e.category
    FROM item_reusable_set_entries e JOIN item_reusable_sets s ON s.id=e.set_id
    WHERE s.family_id=? ORDER BY e.set_id,e.position,e.id`).bind(m.family_id).all();
  const entriesBySet=new Map<number,EditableSetEntry[]>();
  for(const row of (entryResult?.results||[]) as Row[]){
    const setId=Number(row.set_id),entries=entriesBySet.get(setId)||[];
    entries.push({name:String(row.name||''),memo:String(row.memo||''),url:String(row.url||''),category:normalizeCategory(row.category)});
    entriesBySet.set(setId,entries);
  }
  const sets=((result?.results||[]) as Row[]).map(row=>{
    const manageable=canManageSet(m,row),id=Number(row.id);
    return {id,name:String(row.name||''),item_count:Number(row.item_count||0),can_edit:manageable,can_delete:manageable,entries:entriesBySet.get(id)||[]};
  });
  return json({ok:true,sets});
}

async function createSet(ctx:any,m:any,b:Record<string,unknown>):Promise<Response>{
  const name=String(b.name??'').trim();
  if(!name)return bad('セット名を入力してください。');
  if(name.length>120)return bad('セット名は120文字以内で入力してください。');
  const sourceIds=uniquePositiveIds(b.source_item_ids);
  if(!sourceIds.length)return bad('セットに保存する持ち物がありません。');
  if(sourceIds.length>MAX_SET_ITEMS)return bad(`1つのセットは${MAX_SET_ITEMS}件までです。`);
  const placeholders=sourceIds.map(()=>'?').join(',');
  const result=await ctx.env.DB.prepare(`SELECT i.id,i.name,i.memo,i.url,i.category,i.visibility_scope
    FROM items i
    WHERE i.family_id=? AND i.id IN (${placeholders}) AND ${goodsVisibilitySql('i')}`)
    .bind(m.family_id,...sourceIds,m.id).all();
  const found=(result?.results||[]) as Row[],byId=new Map(found.map(row=>[Number(row.id),row]));
  if(sourceIds.some(id=>!byId.has(id)))return bad('表示中の持ち物が更新されています。画面を開き直してから再度保存してください。',409,'SOURCE_CHANGED');
  const ordered=sourceIds.map(id=>byId.get(id)!).filter(row=>row.visibility_scope==='FAMILY');
  const skippedPrivate=sourceIds.length-ordered.length;
  if(!ordered.length)return bad('非公開の持ち物だけでは共有セットを作成できません。',400,'PRIVATE_SOURCE_ONLY');
  for(const row of ordered){
    if(!String(row.name||'').trim()||String(row.name||'').trim().length>200)return bad('セットに保存できない持ち物名が含まれています。');
    if(String(row.memo||'').length>2000)return bad('セットに保存できない長さのメモが含まれています。');
    if(normalizeCategory(row.category).length>255)return bad('セットに保存できないカテゴリ名が含まれています。');
    if(!validUrl(String(row.url||'').trim()))return bad('セットに保存できないURLが含まれています。');
  }
  const exists=await ctx.env.DB.prepare('SELECT id FROM item_reusable_sets WHERE family_id=? AND name=? COLLATE NOCASE LIMIT 1').bind(m.family_id,name).first();
  if(exists)return bad('同じ名前のセットがあります。',409,'SET_NAME_CONFLICT');
  const now=nowJst();let setId=0;
  try{
    const created=await ctx.env.DB.prepare('INSERT INTO item_reusable_sets(family_id,name,created_by_member_id,created_at,updated_at) VALUES(?,?,?,?,?)').bind(m.family_id,name,m.id,now,now).run();
    setId=Number(created.meta.last_row_id||0);if(!setId)throw new Error('set id missing');
    await ctx.env.DB.batch(ordered.map((row,index)=>ctx.env.DB.prepare(`INSERT INTO item_reusable_set_entries(set_id,position,name,memo,url,category) VALUES(?,?,?,?,?,?)`)
      .bind(setId,index,String(row.name||'').trim(),String(row.memo||'').trim()||null,String(row.url||'').trim()||null,normalizeCategory(row.category)||null)));
  }catch(error){
    if(setId)await ctx.env.DB.prepare('DELETE FROM item_reusable_sets WHERE id=? AND family_id=?').bind(setId,m.family_id).run().catch(()=>{});
    const message=String((error as Error)?.message||error||'');
    if(/unique/i.test(message))return bad('同じ名前のセットがあります。',409,'SET_NAME_CONFLICT');
    return bad('セットを保存できませんでした。',500,'SET_SAVE_FAILED');
  }
  return json({ok:true,id:setId,name,item_count:ordered.length,skipped_private:skippedPrivate},201);
}

async function updateSet(ctx:any,m:any,b:Record<string,unknown>):Promise<Response>{
  const setId=Number(b.set_id||0);if(!Number.isInteger(setId)||setId<=0)return bad('セットが不正です。');
  const name=String(b.name??'').trim();if(!name)return bad('セット名を入力してください。');if(name.length>120)return bad('セット名は120文字以内で入力してください。');
  const parsed=parseEditableEntries(b.entries);if(parsed.error)return bad(parsed.error);
  const row=(await ctx.env.DB.prepare('SELECT id,created_by_member_id FROM item_reusable_sets WHERE id=? AND family_id=? LIMIT 1').bind(setId,m.family_id).first()) as Row|null;
  if(!row)return bad('セットが見つかりません。',404,'NOT_FOUND');
  if(!canManageSet(m,row))return bad('このセットを編集する権限がありません。',403,'FORBIDDEN');
  const conflict=await ctx.env.DB.prepare('SELECT id FROM item_reusable_sets WHERE family_id=? AND name=? COLLATE NOCASE AND id<>? LIMIT 1').bind(m.family_id,name,setId).first();
  if(conflict)return bad('同じ名前のセットがあります。',409,'SET_NAME_CONFLICT');
  const now=nowJst();
  try{
    const statements:any[]=[
      ctx.env.DB.prepare('UPDATE item_reusable_sets SET name=?,updated_at=? WHERE id=? AND family_id=?').bind(name,now,setId,m.family_id),
      ctx.env.DB.prepare('DELETE FROM item_reusable_set_entries WHERE set_id=?').bind(setId),
      ...parsed.entries.map((entry,index)=>ctx.env.DB.prepare('INSERT INTO item_reusable_set_entries(set_id,position,name,memo,url,category) VALUES(?,?,?,?,?,?)')
        .bind(setId,index,entry.name,entry.memo||null,entry.url||null,entry.category||null)),
    ];
    await ctx.env.DB.batch(statements);
  }catch(error){
    const message=String((error as Error)?.message||error||'');
    if(/unique/i.test(message))return bad('同じ名前のセットがあります。',409,'SET_NAME_CONFLICT');
    return bad('セットを更新できませんでした。',500,'SET_UPDATE_FAILED');
  }
  return json({ok:true,id:setId,name,item_count:parsed.entries.length,entries:parsed.entries});
}

async function deleteSet(ctx:any,m:any,b:Record<string,unknown>):Promise<Response>{
  const setId=Number(b.set_id||0);if(!Number.isInteger(setId)||setId<=0)return bad('セットが不正です。');
  const row=(await ctx.env.DB.prepare('SELECT id,created_by_member_id FROM item_reusable_sets WHERE id=? AND family_id=? LIMIT 1').bind(setId,m.family_id).first()) as Row|null;
  if(!row)return bad('セットが見つかりません。',404,'NOT_FOUND');
  if(!canManageSet(m,row))return bad('このセットを削除する権限がありません。',403,'FORBIDDEN');
  await ctx.env.DB.prepare('DELETE FROM item_reusable_sets WHERE id=? AND family_id=?').bind(setId,m.family_id).run();
  return json({ok:true,id:setId});
}

async function invokeSet(ctx:any,m:any,b:Record<string,unknown>):Promise<Response>{
  const setId=Number(b.set_id||0);if(!Number.isInteger(setId)||setId<=0)return bad('セットが不正です。');
  const date=String(b.date??'').trim();if(!/^\d{4}-\d{2}-\d{2}$/.test(date))return bad('日付が不正です。');
  const requestId=String(b.client_request_id??'').trim();
  if(!requestId)return bad('リクエストIDが必要です。');
  if(requestId.length>72)return bad('リクエストIDが長すぎます。');
  const existing=(await ctx.env.DB.prepare('SELECT set_id_snapshot,due_date,created_by_member_id,created_item_ids FROM item_reusable_set_invocations WHERE family_id=? AND client_request_id=? LIMIT 1').bind(m.family_id,requestId).first()) as Row|null;
  if(existing){
    if(Number(existing.created_by_member_id)!==Number(m.id)||Number(existing.set_id_snapshot)!==setId||String(existing.due_date)!==date)return bad('同じリクエストIDが別のセット呼び出しに使用されています。',409,'IDEMPOTENCY_CONFLICT');
    const recorded=parseIds(existing.created_item_ids);
    if(recorded.length){const rows=await rowsByIds(ctx,m.family_id,m.id,recorded);return json({ok:true,set_id:setId,date,items:rows.map(row=>({id:Number(row.id),name:String(row.name||''),category:normalizeCategory(row.category)})),deduplicated:true});}
  }
  const setRow=(await ctx.env.DB.prepare('SELECT id,name FROM item_reusable_sets WHERE id=? AND family_id=? LIMIT 1').bind(setId,m.family_id).first()) as Row|null;
  if(!setRow)return bad('セットが見つかりません。',404,'NOT_FOUND');
  const entryResult=await ctx.env.DB.prepare('SELECT id,position,name,memo,url,category FROM item_reusable_set_entries WHERE set_id=? ORDER BY position,id').bind(setId).all();
  const entries=(entryResult?.results||[]) as Row[];
  if(!entries.length)return bad('このセットには持ち物がありません。',409,'EMPTY_SET');
  if(entries.length>MAX_SET_ITEMS)return bad('セットの件数が上限を超えています。',409,'SET_TOO_LARGE');
  const now=nowJst();
  await ctx.env.DB.prepare(`INSERT OR IGNORE INTO item_reusable_set_invocations(family_id,set_id_snapshot,due_date,client_request_id,created_by_member_id,created_item_ids,created_at,updated_at)
    VALUES(?,?,?,?,?,'[]',?,?)`).bind(m.family_id,setId,date,requestId,m.id,now,now).run();
  const ledger=(await ctx.env.DB.prepare('SELECT set_id_snapshot,due_date,created_by_member_id,created_item_ids FROM item_reusable_set_invocations WHERE family_id=? AND client_request_id=? LIMIT 1').bind(m.family_id,requestId).first()) as Row|null;
  if(!ledger||Number(ledger.created_by_member_id)!==Number(m.id)||Number(ledger.set_id_snapshot)!==setId||String(ledger.due_date)!==date)return bad('セット呼び出しの重複を安全に確認できませんでした。',409,'IDEMPOTENCY_CONFLICT');
  const already=parseIds(ledger.created_item_ids);
  if(already.length){const rows=await rowsByIds(ctx,m.family_id,m.id,already);return json({ok:true,set_id:setId,date,items:rows.map(row=>({id:Number(row.id),name:String(row.name||''),category:normalizeCategory(row.category)})),deduplicated:true});}
  const requestKeys=entries.map(row=>`set:${requestId}:${Number(row.id)}`);
  try{
    await ctx.env.DB.batch(entries.map((row,index)=>ctx.env.DB.prepare(`INSERT OR IGNORE INTO items(family_id,name,memo,due_at,status,completion_mode,created_by,created_at,updated_at,category,url,client_request_id)
      VALUES(?,?,?,?,'pending','ANY',?,?,?,?,?,?)`)
      .bind(m.family_id,String(row.name||'').trim(),String(row.memo||'').trim()||null,`${date} 00:00:00`,m.id,now,now,normalizeCategory(row.category)||null,String(row.url||'').trim()||null,requestKeys[index])));
  }catch{return bad('セットから持ち物を作成できませんでした。',500,'INVOKE_SAVE_FAILED');}
  const placeholders=requestKeys.map(()=>'?').join(',');
  const itemResult=await ctx.env.DB.prepare(`SELECT id,name,category,client_request_id FROM items WHERE family_id=? AND client_request_id IN (${placeholders})`).bind(m.family_id,...requestKeys).all();
  const itemRows=(itemResult?.results||[]) as Row[],byRequest=new Map(itemRows.map(row=>[String(row.client_request_id||''),row]));
  const ordered=requestKeys.map(key=>byRequest.get(key)).filter(Boolean) as Row[];
  if(ordered.length!==entries.length)return bad('セットの保存結果を確認できませんでした。',500,'INVOKE_VERIFY_FAILED');
  const itemIds=ordered.map(row=>Number(row.id));
  await ctx.env.DB.prepare('UPDATE item_reusable_set_invocations SET created_item_ids=?,updated_at=? WHERE family_id=? AND client_request_id=?').bind(JSON.stringify(itemIds),nowJst(),m.family_id,requestId).run();
  await ensureCategories(ctx,m.family_id,m.id,entries.map(row=>normalizeCategory(row.category))).catch(()=>{});
  return json({ok:true,set_id:setId,set_name:String(setRow.name||''),date,items:ordered.map(row=>({id:Number(row.id),name:String(row.name||''),category:normalizeCategory(row.category)})),deduplicated:false},201);
}

export async function handleItemReusableSetAction(ctx:any,m:any,b:Record<string,unknown>):Promise<Response|null>{
  const action=String(b.action??'');
  if(action==='reusable_set_create')return await createSet(ctx,m,b);
  if(action==='reusable_set_update')return await updateSet(ctx,m,b);
  if(action==='reusable_set_delete')return await deleteSet(ctx,m,b);
  if(action==='reusable_set_invoke')return await invokeSet(ctx,m,b);
  return null;
}
