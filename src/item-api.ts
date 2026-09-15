import { taskVisibilitySql } from './task-visibility';
import { json } from './response';

const nowJst = () => new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Tokyo',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'}).format(new Date()).replace(' ',' ');
const UNCLASSIFIED='未分類';
const CATEGORY_ORDER_KEY='item_category_order';
type Row=Record<string,unknown>;

const bad=(error:string,status=400,code='BAD_REQUEST')=>json({ok:false,error,code},status);
const normalizeCategory=(value:unknown)=>{
  const raw=String(value??'').trim();
  return !raw||raw===UNCLASSIFIED?'':raw;
};
const uniqueNames=(values:unknown[])=>{
  const out:string[]=[];const seen=new Set<string>();
  for(const value of values){const name=String(value??'').trim();const key=name.toLocaleLowerCase('ja-JP');if(!name||name===UNCLASSIFIED||seen.has(key))continue;seen.add(key);out.push(name);}
  return out;
};
const validUrl=(raw:string)=>{
  if(!raw)return true;
  if(raw.length>2048)return false;
  try{const value=new URL(raw);return (value.protocol==='http:'||value.protocol==='https:')&&!value.username&&!value.password;}catch{return false;}
};

async function readCategoryOrder(ctx:any,familyId:number):Promise<string[]>{
  const row=(await ctx.env.DB.prepare('SELECT setting_value FROM family_settings WHERE family_id=? AND setting_key=? LIMIT 1').bind(familyId,CATEGORY_ORDER_KEY).first()) as Row|null;
  if(!row?.setting_value)return [];
  try{const parsed=JSON.parse(String(row.setting_value));return uniqueNames(Array.isArray(parsed)?parsed:[]);}catch{return [];}
}
async function writeCategoryOrder(ctx:any,familyId:number,order:string[]):Promise<void>{
  await ctx.env.DB.prepare("INSERT INTO family_settings(family_id,setting_key,setting_value,updated_at) VALUES(?,?,?,?) ON CONFLICT(family_id,setting_key) DO UPDATE SET setting_value=excluded.setting_value,updated_at=excluded.updated_at").bind(familyId,CATEGORY_ORDER_KEY,JSON.stringify(uniqueNames(order)),nowJst()).run();
}
async function upsertCatalogCategory(ctx:any,familyId:number,memberId:number,name:string):Promise<void>{
  if(!name)return;
  await ctx.env.DB.batch([
    ctx.env.DB.prepare(`INSERT OR IGNORE INTO item_category_catalog(family_id,name,enabled,is_custom,created_by_member_id,created_at,updated_at)
      VALUES(?,?,1,1,?,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)`).bind(familyId,name,memberId),
    ctx.env.DB.prepare('UPDATE item_category_catalog SET enabled=1,updated_at=CURRENT_TIMESTAMP WHERE family_id=? AND name=? COLLATE NOCASE').bind(familyId,name),
  ]);
}
async function visibleRequestRow(ctx:any,familyId:number,memberId:number,requestId:string):Promise<Row|null>{
  if(!requestId)return null;
  return (await ctx.env.DB.prepare(`SELECT i.id,i.name,i.memo,i.url,i.category,i.due_at,i.task_id
    FROM items i LEFT JOIN tasks t ON t.id=i.task_id AND t.family_id=i.family_id
    WHERE i.family_id=? AND i.client_request_id=? AND (i.task_id IS NULL OR ${taskVisibilitySql('t')}) LIMIT 1`)
    .bind(familyId,requestId,memberId).first()) as Row|null;
}
function sameRequest(row:Row,name:string,memo:string,url:string,category:string,dueDate:string|null,taskId:number|null):boolean{
  return String(row.name??'')===name
    && String(row.memo??'')===memo
    && String(row.url??'')===url
    && normalizeCategory(row.category)===category
    && String(row.due_at??'').slice(0,10)===(dueDate||'')
    && (Number(row.task_id??0)||null)===taskId;
}

async function readCategories(request:Request,ctx:any,m:any):Promise<Response>{
  const url=new URL(request.url);
  const date=String(url.searchParams.get('date')||'');
  const [catalogResult,order]=await Promise.all([
    ctx.env.DB.prepare('SELECT name FROM item_category_catalog WHERE family_id=? AND enabled=1 ORDER BY name COLLATE NOCASE').bind(m.family_id).all(),
    readCategoryOrder(ctx,m.family_id),
  ]);
  const catalog=(catalogResult?.results||[]) as Row[];
  let items:Row[]=[];
  if(/^\d{4}-\d{2}-\d{2}$/.test(date)){
    const result=await ctx.env.DB.prepare(`SELECT i.id,i.category,i.memo,i.url,i.status
      FROM items i LEFT JOIN tasks t ON t.id=i.task_id AND t.family_id=i.family_id
      WHERE i.family_id=? AND (i.task_id IS NULL OR ${taskVisibilitySql('t')})
        AND i.due_at IS NOT NULL AND date(i.due_at)=date(?)
      ORDER BY i.status,i.id`).bind(m.family_id,m.id,date).all();
    items=(result?.results||[]) as Row[];
  }
  return json({ok:true,categories:catalog.map((row:Row)=>String(row.name||'')).filter(Boolean),order,items});
}

export async function itemApi(request:Request,ctx:any):Promise<Response>{
  const m=ctx.member;if(!m)return json({ok:false,error:'ログインが必要です。'},401);
  if(request.method==='GET')return await readCategories(request,ctx,m);
  if(request.method!=='POST') return json({ok:false,error:'POST only'},405);
  const b=await request.json().catch(()=>null) as Record<string,unknown>|null;
  if(!b)return json({ok:false,error:'JSONが不正です。'},400);
  if(String(b.csrf||'')!==String(ctx.session.csrfToken||'')) return json({ok:false,error:'CSRF検証に失敗しました。'},403);
  const action=String(b.action??'add');

  if(action==='category_reorder'){
    const order=uniqueNames(Array.isArray(b.order)?b.order:[]);
    await writeCategoryOrder(ctx,m.family_id,order);
    return json({ok:true,order});
  }
  if(action==='category_add'){
    const name=normalizeCategory(b.name);
    if(!name)return bad('カテゴリ名を入力してください。');
    if(name.length>255)return bad('カテゴリ名は255文字以内で入力してください。');
    await upsertCatalogCategory(ctx,m.family_id,m.id,name);
    const order=await readCategoryOrder(ctx,m.family_id);
    if(!order.some(value=>value.toLocaleLowerCase('ja-JP')===name.toLocaleLowerCase('ja-JP')))await writeCategoryOrder(ctx,m.family_id,[...order,name]);
    return json({ok:true,name});
  }
  if(action==='category_disable'){
    const role=String(m.role||'').toUpperCase();
    if(role!=='OWNER'&&role!=='ADMIN')return bad('カテゴリを無効化する権限がありません。',403,'FORBIDDEN');
    const name=normalizeCategory(b.name);
    if(!name)return bad('カテゴリ名が不正です。');
    await ctx.env.DB.batch([
      ctx.env.DB.prepare(`INSERT OR IGNORE INTO item_category_catalog(family_id,name,enabled,is_custom,created_by_member_id,created_at,updated_at)
        VALUES(?,?,0,1,?,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)`).bind(m.family_id,name,m.id),
      ctx.env.DB.prepare('UPDATE item_category_catalog SET enabled=0,updated_at=CURRENT_TIMESTAMP WHERE family_id=? AND name=? COLLATE NOCASE').bind(m.family_id,name),
    ]);
    const order=(await readCategoryOrder(ctx,m.family_id)).filter(value=>value.toLocaleLowerCase('ja-JP')!==name.toLocaleLowerCase('ja-JP'));
    await writeCategoryOrder(ctx,m.family_id,order);
    return json({ok:true,name});
  }
  if(action==='category_rename'){
    const oldRaw=String(b.name??b.old_name??'').trim();
    const oldName=oldRaw||UNCLASSIFIED;
    const newName=normalizeCategory(b.new_name);
    if(!newName)return bad('新しいカテゴリ名を入力してください。');
    if(newName.length>255)return bad('カテゴリ名は255文字以内で入力してください。');
    const now=nowJst();
    const updateItems=oldName===UNCLASSIFIED
      ?ctx.env.DB.prepare("UPDATE items SET category=?,updated_at=? WHERE family_id=? AND (category IS NULL OR trim(category)='')").bind(newName,now,m.family_id)
      :ctx.env.DB.prepare('UPDATE items SET category=?,updated_at=? WHERE family_id=? AND category=? COLLATE NOCASE').bind(newName,now,m.family_id,oldName);
    await updateItems.run();
    await upsertCatalogCategory(ctx,m.family_id,m.id,newName);
    if(oldName!==UNCLASSIFIED&&oldName.toLocaleLowerCase('ja-JP')!==newName.toLocaleLowerCase('ja-JP')){
      await ctx.env.DB.prepare('UPDATE item_category_catalog SET enabled=0,updated_at=? WHERE family_id=? AND name=? COLLATE NOCASE').bind(now,m.family_id,oldName).run();
    }
    const current=await readCategoryOrder(ctx,m.family_id);
    const replaced=current.map(value=>value.toLocaleLowerCase('ja-JP')===oldName.toLocaleLowerCase('ja-JP')?newName:value);
    if(oldName===UNCLASSIFIED&&!replaced.some(value=>value.toLocaleLowerCase('ja-JP')===newName.toLocaleLowerCase('ja-JP')))replaced.push(newName);
    await writeCategoryOrder(ctx,m.family_id,replaced);
    return json({ok:true,name:newName});
  }
  if(action==='update_category'){
    const id=Number(b.id||0);if(!Number.isInteger(id)||id<=0)return bad('持ち物が不正です。');
    const category=normalizeCategory(b.category);if(category.length>255)return bad('カテゴリ名は255文字以内で入力してください。');
    const current=(await ctx.env.DB.prepare(`SELECT i.id FROM items i LEFT JOIN tasks t ON t.id=i.task_id AND t.family_id=i.family_id
      WHERE i.id=? AND i.family_id=? AND (i.task_id IS NULL OR ${taskVisibilitySql('t')}) LIMIT 1`).bind(id,m.family_id,m.id).first()) as Row|null;
    if(!current)return json({ok:false,error:'持ち物が見つかりません。'},404);
    await ctx.env.DB.prepare('UPDATE items SET category=?,updated_at=? WHERE id=? AND family_id=?').bind(category||null,nowJst(),id,m.family_id).run();
    if(category)await upsertCatalogCategory(ctx,m.family_id,m.id,category);
    return json({ok:true,id,category});
  }
  if(action!=='add')return bad('未対応の操作です。');

  const name=String(b.name??'').trim(); const date=String(b.date??'').trim();
  if(!name)return json({ok:false,error:'持ち物名を入力してください。'},400);
  if(name.length>200)return bad('持ち物名は200文字以内で入力してください。');
  const memo=String(b.memo??'').trim();if(memo.length>2000)return bad('メモは2000文字以内で入力してください。');
  const category=normalizeCategory(b.category);if(category.length>255)return bad('カテゴリ名は255文字以内で入力してください。');
  const itemUrl=String(b.url??'').trim();if(!validUrl(itemUrl))return bad('URLは http:// または https:// で入力してください。');
  const clientRequestId=String(b.client_request_id??'').trim();if(clientRequestId.length>120)return bad('リクエストIDが長すぎます。');
  const taskId=Number(b.task_id??0)||null; let dueDate=/^\d{4}-\d{2}-\d{2}$/.test(date)?date:null;
  let privateOwner=0;if(taskId){const t=await ctx.env.DB.prepare(`SELECT id,start_at,end_at,due_at,visibility_scope,private_owner_id FROM tasks t WHERE id=? AND family_id=? AND ${taskVisibilitySql('t')}`).bind(taskId,m.family_id,m.id).first();if(!t)return json({ok:false,error:'関連タスクが見つかりません。'},400);dueDate=String(t.start_at||t.due_at||'').slice(0,10)||dueDate;privateOwner=String(t.visibility_scope)==='PRIVATE'?Number(t.private_owner_id):0;}

  if(clientRequestId){
    const existing=await visibleRequestRow(ctx,m.family_id,m.id,clientRequestId);
    if(existing){
      if(!sameRequest(existing,name,memo,itemUrl,category,dueDate,taskId))return bad('同じリクエストIDが別の持ち物に使用されています。',409,'IDEMPOTENCY_CONFLICT');
      return json({ok:true,id:Number(existing.id),date:dueDate,category,deduplicated:true},200);
    }
  }

  const now=nowJst();
  const insertSql=clientRequestId
    ?`INSERT OR IGNORE INTO items(family_id,name,memo,due_at,status,completion_mode,created_by,created_at,updated_at,task_id,category,url,client_request_id) VALUES(?,?,?,?,'pending','ANY',?,?,?,?,?,?,?)`
    :`INSERT INTO items(family_id,name,memo,due_at,status,completion_mode,created_by,created_at,updated_at,task_id,category,url,client_request_id) VALUES(?,?,?,?,'pending','ANY',?,?,?,?,?,?,?)`;
  const r=await ctx.env.DB.prepare(insertSql).bind(m.family_id,name,memo||null,dueDate?`${dueDate} 00:00:00`:null,m.id,now,now,taskId,category||null,itemUrl||null,clientRequestId||null).run();
  let id=Number(r.meta.last_row_id||0);let inserted=Number(r.meta.changes||0)>0;
  if(clientRequestId){
    const resolved=await visibleRequestRow(ctx,m.family_id,m.id,clientRequestId);
    if(!resolved)return bad('保存結果を確認できませんでした。',409,'IDEMPOTENCY_CONFLICT');
    if(!sameRequest(resolved,name,memo,itemUrl,category,dueDate,taskId))return bad('同じリクエストIDが別の持ち物に使用されています。',409,'IDEMPOTENCY_CONFLICT');
    id=Number(resolved.id);inserted=inserted&&id>0;
  }
  if(!id)return bad('持ち物を保存できませんでした。',500,'SAVE_FAILED');
  if(inserted){
    const ids=privateOwner?[privateOwner]:Array.isArray(b.assignees)?(b.assignees as unknown[]).map(Number).filter(n=>n>0):[];
    if(ids.length) await ctx.env.DB.batch(ids.map(mid=>ctx.env.DB.prepare('INSERT OR IGNORE INTO item_assignees(item_id,member_id) SELECT ?,id FROM members WHERE id=? AND family_id=? AND active=1').bind(id,mid,m.family_id)));
    if(category)await upsertCatalogCategory(ctx,m.family_id,m.id,category);
    if(!privateOwner)await ctx.env.DB.prepare('INSERT INTO activity_logs(family_id,member_id,action,target_type,target_id,metadata,occurred_at) VALUES(?,?,?,?,?,?,?)').bind(m.family_id,m.id,'CREATED','item',id,JSON.stringify({name}),nowJst()).run().catch(()=>{});
  }
  return json({ok:true,id,date:dueDate,category,deduplicated:!inserted},inserted?201:200);
}
