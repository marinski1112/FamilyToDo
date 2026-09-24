import { goodsVisibilitySql } from './goods-visibility';
import { json } from './response';
type Row=Record<string,unknown>;
const now=()=>new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Tokyo',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'}).format(new Date()).replace(' ',' ');
const bad=(error:string,status=400)=>json({ok:false,error},status);
const ids=(v:unknown)=>[...new Set((Array.isArray(v)?v:[]).map(Number).filter(n=>Number.isInteger(n)&&n>0))];
const parseIds=(v:unknown)=>{try{return ids(JSON.parse(String(v??'[]')))}catch{return []}};
export async function readShoppingReusableSets(ctx:any,m:any):Promise<Response>{
 const s=await ctx.env.DB.prepare('SELECT id,name,created_by_member_id,updated_at FROM shopping_reusable_sets WHERE family_id=? ORDER BY updated_at DESC,id DESC').bind(m.family_id).all();
 const e=await ctx.env.DB.prepare('SELECT e.* FROM shopping_reusable_set_entries e JOIN shopping_reusable_sets s ON s.id=e.set_id WHERE s.family_id=? ORDER BY e.set_id,e.position,e.id').bind(m.family_id).all();
 const by=new Map<number,Row[]>();for(const x of (e.results||[]) as Row[]){const a=by.get(Number(x.set_id))||[];a.push(x);by.set(Number(x.set_id),a)}
 return json({ok:true,sets:((s.results||[]) as Row[]).map(x=>({id:Number(x.id),name:String(x.name||''),item_count:(by.get(Number(x.id))||[]).length,entries:by.get(Number(x.id))||[],can_edit:Number(x.created_by_member_id)===Number(m.id)||['OWNER','ADMIN'].includes(String(m.role||'').toUpperCase()),can_delete:Number(x.created_by_member_id)===Number(m.id)||['OWNER','ADMIN'].includes(String(m.role||'').toUpperCase())}))});
}
export async function handleShoppingReusableSetAction(ctx:any,m:any,b:Record<string,unknown>):Promise<Response|null>{
 const action=String(b.action||'');if(!action.startsWith('reusable_set_'))return null;
 if(action==='reusable_set_create'){
  const name=String(b.name||'').trim(),source=ids(b.source_item_ids);if(!name||!source.length)return bad('セット名と買い物を指定してください。');if(source.length>100)return bad('1つのセットは100件までです。');
  const ph=source.map(()=>'?').join(','),q=await ctx.env.DB.prepare(`SELECT s.id,s.name,s.quantity,s.category,s.memo,s.url,s.visibility_scope FROM shopping_items s WHERE s.family_id=? AND s.id IN (${ph}) AND ${goodsVisibilitySql('s')}`).bind(m.family_id,...source,m.id).all(),rows=(q.results||[]) as Row[];
  if(rows.length!==source.length)return bad('表示中の買い物が更新されています。',409);
  const map=new Map(rows.map(x=>[Number(x.id),x])),visible=source.map(id=>map.get(id)!),ordered=visible.filter(x=>x.visibility_scope==='FAMILY'),skippedPrivate=visible.length-ordered.length;
  if(!ordered.length)return bad('非公開の買い物だけでは共有セットを作成できません。');
  const t=now();let setId=0;
  try{
   const r=await ctx.env.DB.prepare('INSERT INTO shopping_reusable_sets(family_id,name,created_by_member_id,created_at,updated_at) VALUES(?,?,?,?,?)').bind(m.family_id,name,m.id,t,t).run();setId=Number(r.meta.last_row_id||0);if(!setId)throw new Error('set id missing');
   await ctx.env.DB.batch(ordered.map((x,i)=>ctx.env.DB.prepare('INSERT INTO shopping_reusable_set_entries(set_id,position,name,quantity,category,memo,url) VALUES(?,?,?,?,?,?,?)').bind(setId,i,String(x.name||''),String(x.quantity||'1'),String(x.category||'')||null,String(x.memo||'')||null,String(x.url||'')||null)));
   return json({ok:true,id:setId,name,item_count:ordered.length,skipped_private:skippedPrivate},201)
  }catch{
   if(setId)await ctx.env.DB.prepare('DELETE FROM shopping_reusable_sets WHERE id=? AND family_id=?').bind(setId,m.family_id).run().catch(()=>{});
   return bad('同じ名前のセットがあるか、保存に失敗しました。',409)
  }
 }
 const setId=Number(b.set_id||0),set=(await ctx.env.DB.prepare('SELECT id,created_by_member_id,name FROM shopping_reusable_sets WHERE id=? AND family_id=?').bind(setId,m.family_id).first()) as Row|null;if(!set)return bad('セットが見つかりません。',404);const manage=Number(set.created_by_member_id)===Number(m.id)||['OWNER','ADMIN'].includes(String(m.role||'').toUpperCase());
 if(action==='reusable_set_delete'){if(!manage)return bad('このセットを削除する権限がありません。',403);await ctx.env.DB.prepare('DELETE FROM shopping_reusable_sets WHERE id=? AND family_id=?').bind(setId,m.family_id).run();return json({ok:true,id:setId})}
 if(action==='reusable_set_invoke'){
  const date=String(b.date||'').trim(),rid=String(b.client_request_id||'').trim();if(!/^\d{4}-\d{2}-\d{2}$/.test(date)||!rid||rid.length>72)return bad('日付またはリクエストIDが不正です。');
  const old=(await ctx.env.DB.prepare('SELECT set_id_snapshot,due_date,created_by_member_id,created_item_ids FROM shopping_reusable_set_invocations WHERE family_id=? AND client_request_id=? LIMIT 1').bind(m.family_id,rid).first()) as Row|null;
  if(old){if(Number(old.created_by_member_id)!==Number(m.id)||Number(old.set_id_snapshot)!==setId||String(old.due_date)!==date)return bad('同じリクエストIDが別のセット呼び出しに使用されています。',409);const recorded=parseIds(old.created_item_ids);if(recorded.length)return json({ok:true,set_id:setId,date,item_ids:recorded,deduplicated:true})}
  const e=await ctx.env.DB.prepare('SELECT * FROM shopping_reusable_set_entries WHERE set_id=? ORDER BY position,id').bind(setId).all(),rows=(e.results||[]) as Row[];if(!rows.length)return bad('このセットには買い物がありません。',409);if(rows.length>100)return bad('セットの件数が上限を超えています。',409);
  const t=now();await ctx.env.DB.prepare("INSERT OR IGNORE INTO shopping_reusable_set_invocations(family_id,set_id_snapshot,due_date,client_request_id,created_by_member_id,created_item_ids,created_at,updated_at) VALUES(?,?,?,?,?,'[]',?,?)").bind(m.family_id,setId,date,rid,m.id,t,t).run();
  const ledger=(await ctx.env.DB.prepare('SELECT set_id_snapshot,due_date,created_by_member_id,created_item_ids FROM shopping_reusable_set_invocations WHERE family_id=? AND client_request_id=? LIMIT 1').bind(m.family_id,rid).first()) as Row|null;
  if(!ledger||Number(ledger.created_by_member_id)!==Number(m.id)||Number(ledger.set_id_snapshot)!==setId||String(ledger.due_date)!==date)return bad('セット呼び出しの重複を安全に確認できませんでした。',409);
  const recorded=parseIds(ledger.created_item_ids);if(recorded.length)return json({ok:true,set_id:setId,date,item_ids:recorded,deduplicated:true});
  const requestKeys=rows.map(x=>`set:${rid}:${Number(x.id)}`);
  try{await ctx.env.DB.batch(rows.map((x,i)=>ctx.env.DB.prepare("INSERT OR IGNORE INTO shopping_items(family_id,name,quantity,category,memo,due_date,status,created_by,created_at,updated_at,url,client_request_id) VALUES(?,?,?,?,?,?,'pending',?,?,?,?,?)").bind(m.family_id,String(x.name||''),String(x.quantity||'1'),String(x.category||'')||null,String(x.memo||'')||null,date,m.id,t,t,String(x.url||'')||null,requestKeys[i])))}catch{return bad('セットから買い物を作成できませんでした。',500)}
  const ph=requestKeys.map(()=>'?').join(','),result=await ctx.env.DB.prepare(`SELECT id,client_request_id FROM shopping_items WHERE family_id=? AND client_request_id IN (${ph})`).bind(m.family_id,...requestKeys).all(),created=(result.results||[]) as Row[],byRequest=new Map(created.map(x=>[String(x.client_request_id||''),x])),ordered=requestKeys.map(key=>byRequest.get(key)).filter(Boolean) as Row[];
  if(ordered.length!==rows.length)return bad('セットの保存結果を確認できませんでした。',500);
  const out=ordered.map(x=>Number(x.id));await ctx.env.DB.prepare('UPDATE shopping_reusable_set_invocations SET created_item_ids=?,updated_at=? WHERE family_id=? AND client_request_id=?').bind(JSON.stringify(out),now(),m.family_id,rid).run();return json({ok:true,set_id:setId,date,item_ids:out,deduplicated:false},201)
 }
 return bad('未対応のセット操作です。');
}
