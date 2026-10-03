import { json } from './response';
import { goodsVisibilitySql } from './goods-visibility';

type Row=Record<string,any>;
const bad=(error:string,status=400)=>json({ok:false,error},status);
const normalizeCategory=(value:string)=>value.trim()==='未分類'?'':value.trim();

// Selected calls keep their request snapshot in the existing JSON ledger field.
// Legacy whole-set calls continue to store an array; the two formats cannot reuse a key.
export async function invokeSelectedSet(ctx:any,m:any,b:Row,kind:'item'|'shopping'):Promise<Response>{
  const setId=b.set_id,date=b.date,rid=b.client_request_id,selected=b.entry_ids;
  if(!Number.isSafeInteger(setId)||setId<=0||typeof date!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(date)||
    !Number.isFinite(Date.parse(date+'T00:00:00Z'))||new Date(date+'T00:00:00Z').toISOString().slice(0,10)!==date)return bad('セットまたは日付が不正です。');
  if(typeof rid!=='string'||!rid.trim()||rid.length>72)return bad('リクエストIDが不正です。');
  if(!Array.isArray(selected)||!selected.length||selected.length>100||selected.some(id=>!Number.isSafeInteger(id)||id<=0)||new Set(selected).size!==selected.length)return bad('追加する項目を1〜100件選んでください。');
  if(typeof b.target_category!=='string'||b.target_category.trim().length>255)return bad('追加先カテゴリを指定してください。');
  const category=normalizeCategory(b.target_category),selection=[...selected].sort((a,b)=>a-b);
  const signature=JSON.stringify({entry_ids:selection,category});
  const ledgerTable=kind+'_reusable_set_invocations',entryTable=kind+'_reusable_set_entries',setTable=kind+'_reusable_sets';
  const table=kind==='item'?'items':'shopping_items';
  const readLedger=()=>ctx.env.DB.prepare(`SELECT set_id_snapshot,due_date,created_by_member_id,created_item_ids FROM ${ledgerTable} WHERE family_id=? AND client_request_id=? LIMIT 1`).bind(m.family_id,rid).first();
  const unpack=(ledger:Row|null)=>{
    if(!ledger)return null;
    try{const value=JSON.parse(ledger.created_item_ids);if(Number(ledger.set_id_snapshot)!==setId||ledger.due_date!==date||Number(ledger.created_by_member_id)!==Number(m.id)||value.signature!==signature||!Array.isArray(value.ids))return false;return value;}catch{return false;}
  };
  const respond=async(ids:number[],deduplicated:boolean)=>{
    const found=await ctx.env.DB.prepare(`SELECT g.id,g.name,g.category FROM ${table} g WHERE g.family_id=? AND g.id IN (SELECT value FROM json_each(?)) AND ${goodsVisibilitySql('g')}`).bind(m.family_id,JSON.stringify(ids),m.id).all();
    const byId=new Map((found.results||[]).map((r:Row)=>[Number(r.id),r]));
    const items=ids.map(id=>byId.get(id)).filter(Boolean);
    return json({ok:true,set_id:setId,date,items,item_ids:items.map((r:any)=>Number(r.id)),deduplicated},deduplicated?200:201);
  };
  let ledger=unpack(await readLedger());
  if(ledger===false)return bad('同じリクエストIDが別の内容に使用されています。',409);
  if(ledger?.ids.length)return respond(ledger.ids,true);
  const set=await ctx.env.DB.prepare(`SELECT id FROM ${setTable} WHERE family_id=? AND id=?`).bind(m.family_id,setId).first();
  if(!set)return bad('セットが見つかりません。',404);
  const result=await ctx.env.DB.prepare(`SELECT * FROM ${entryTable} WHERE set_id=? ORDER BY position,id`).bind(setId).all();
  const rows=(result.results||[]).filter((r:Row)=>selection.includes(Number(r.id))) as Row[];
  if(rows.length!==selection.length)return bad('セットが更新されています。開き直して選び直してください。',409);
  if(category){const target=await ctx.env.DB.prepare(`SELECT name FROM ${kind}_category_catalog WHERE family_id=? AND name=? COLLATE NOCASE AND enabled=1`).bind(m.family_id,category).first();if(!target)return bad('追加先カテゴリが変更されています。選び直してください。',409);}
  const stamp=new Date().toISOString();
  await ctx.env.DB.prepare(`INSERT OR IGNORE INTO ${ledgerTable}(family_id,set_id_snapshot,due_date,client_request_id,created_by_member_id,created_item_ids,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?)`).bind(m.family_id,setId,date,rid,m.id,JSON.stringify({signature,ids:[]}),stamp,stamp).run();
  ledger=unpack(await readLedger());
  if(!ledger)return bad('セット呼び出しの重複を確認できませんでした。',409);
  if(ledger.ids.length)return respond(ledger.ids,true);
  const keys=rows.map(row=>`set:${rid}:${row.id}`);
  try{
    const statements=rows.map((row,index)=>kind==='item'
      ?ctx.env.DB.prepare(`INSERT OR IGNORE INTO items(family_id,name,memo,due_at,status,completion_mode,created_by,created_at,updated_at,category,url,client_request_id) VALUES(?,?,?,?,'pending','ANY',?,?,?,?,?,?)`).bind(m.family_id,row.name,row.memo||null,date+' 00:00:00',m.id,stamp,stamp,category||null,row.url||null,keys[index])
      :ctx.env.DB.prepare(`INSERT OR IGNORE INTO shopping_items(family_id,name,quantity,category,memo,due_date,status,created_by,created_at,updated_at,url,client_request_id) VALUES(?,?,?,?,?,?,'pending',?,?,?,?,?)`).bind(m.family_id,row.name,row.quantity||'1',category||null,row.memo||null,date,m.id,stamp,stamp,row.url||null,keys[index]));
    if(category)statements.push(ctx.env.DB.prepare(`UPDATE ${kind}_category_catalog SET activated_at=?,updated_at=? WHERE family_id=? AND name=? COLLATE NOCASE AND enabled=1`).bind(stamp,stamp,m.family_id,category));
    await ctx.env.DB.batch(statements);
    const created=await ctx.env.DB.prepare(`SELECT id,client_request_id FROM ${table} WHERE family_id=? AND client_request_id IN (SELECT value FROM json_each(?))`).bind(m.family_id,JSON.stringify(keys)).all();
    const byKey=new Map((created.results||[]).map((r:Row)=>[r.client_request_id,Number(r.id)]));
    const ids=keys.map(key=>byKey.get(key)) as number[];
    if(ids.some(id=>!id))return bad('保存結果を確認できませんでした。同じ内容で再試行してください。',500);
    await ctx.env.DB.prepare(`UPDATE ${ledgerTable} SET created_item_ids=?,updated_at=? WHERE family_id=? AND client_request_id=?`).bind(JSON.stringify({signature,ids}),stamp,m.family_id,rid).run();
    return respond(ids,false);
  }catch{return bad('追加できませんでした。選択を保持して再試行してください。',500);}
}
