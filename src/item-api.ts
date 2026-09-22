import { checklistCompletionSql } from './checklist-completion';
import { goodsVisibilitySql } from './goods-visibility';
import { json } from './response';
import { handleItemReusableSetAction, readItemReusableSets } from './item-reusable-set-api';

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
  return (await ctx.env.DB.prepare(`SELECT i.id,i.name,i.memo,i.url,i.category,i.due_at
    FROM items i
    WHERE i.family_id=? AND i.client_request_id=? AND ${goodsVisibilitySql('i')} LIMIT 1`)
    .bind(familyId,requestId,memberId).first()) as Row|null;
}
function sameRequest(row:Row,name:string,memo:string,url:string,category:string,dueDate:string|null):boolean{
  return String(row.name??'')===name
    && String(row.memo??'')===memo
    && String(row.url??'')===url
    && normalizeCategory(row.category)===category
    && String(row.due_at??'').slice(0,10)===(dueDate||'');
}

async function readCategories(request:Request,ctx:any,m:any):Promise<Response>{
  const url=new URL(request.url);
  const date=String(url.searchParams.get('date')||'');
  const [catalogResult,order]=await Promise.all([
    ctx.env.DB.prepare('SELECT name,created_at,activated_at,enabled FROM item_category_catalog WHERE family_id=? ORDER BY name COLLATE NOCASE').bind(m.family_id).all(),
    readCategoryOrder(ctx,m.family_id),
  ]);
  const catalog=(catalogResult?.results||[]) as Row[];
  let items:Row[]=[];
  if(/^\d{4}-\d{2}-\d{2}$/.test(date)){
    const result=await ctx.env.DB.prepare(`SELECT i.id,i.category,i.memo,i.url,i.status
      FROM items i
      WHERE i.family_id=? AND ${goodsVisibilitySql('i')}
        AND ${checklistCompletionSql('i')}
        AND ((i.due_at IS NOT NULL AND date(i.due_at)=date(?)) OR i.due_at IS NULL OR i.status='completed')
      ORDER BY i.status,i.id`).bind(m.family_id,m.id,date).all();
    items=(result?.results||[]) as Row[];
  }
  const categoryMeta=catalog.map((row:Row)=>({name:String(row.name||'').trim(),created_at:String(row.created_at||''),activated_at:String(row.activated_at||''),enabled:Number(row.enabled)})).filter(row=>row.name);
  return json({ok:true,categories:categoryMeta.filter(row=>row.enabled===1).map(row=>row.name),categoryMeta,order,items,canManageCategories:['OWNER','ADMIN'].includes(String(m.role||'').toUpperCase())});
}

export async function itemApi(request:Request,ctx:any):Promise<Response>{
  const m=ctx.member;if(!m)return json({ok:false,error:'ログインが必要です。'},401);
  if(request.method==='GET'){
    if(new URL(request.url).searchParams.get('view')==='reusable_sets')return await readItemReusableSets(ctx,m);
    return await readCategories(request,ctx,m);
  }
  if(request.method!=='POST') return json({ok:false,error:'POST only'},405);
  const b=await request.json().catch(()=>null) as Record<string,unknown>|null;
  if(!b)return json({ok:false,error:'JSONが不正です。'},400);
  if(String(b.csrf||'')!==String(ctx.session.csrfToken||'')) return json({ok:false,error:'CSRF検証に失敗しました。'},403);
  const action=String(b.action??'add');
  const reusableSetResponse=await handleItemReusableSetAction(ctx,m,b);
  if(reusableSetResponse)return reusableSetResponse;

  if(action==='update_category'){
    const id=Number(b.id||0);if(!Number.isInteger(id)||id<=0)return bad('持ち物が不正です。');
    const category=normalizeCategory(b.category);if(category.length>255)return bad('カテゴリ名は255文字以内で入力してください。');
    const current=await ctx.env.DB.prepare(`SELECT i.id FROM items i WHERE i.id=? AND i.family_id=? AND ${goodsVisibilitySql('i')} LIMIT 1`).bind(id,m.family_id,m.id).first();
    if(!current)return json({ok:false,error:'持ち物が見つかりません。'},404);
    const now=nowJst();await ctx.env.DB.prepare('UPDATE items SET category=?,updated_at=? WHERE id=? AND family_id=?').bind(category||null,now,id,m.family_id).run();
    if(category)await upsertCatalogCategory(ctx,m.family_id,m.id,category);
    return json({ok:true,id,category});
  }
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
    const created=await ctx.env.DB.prepare('SELECT created_at,activated_at FROM item_category_catalog WHERE family_id=? AND name=? COLLATE NOCASE LIMIT 1').bind(m.family_id,name).first() as Row|null;
    return json({ok:true,name,created_at:String(created?.created_at||''),activated_at:String(created?.activated_at||'')});
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
    const statements=[updateItems,
      ctx.env.DB.prepare("INSERT OR IGNORE INTO item_category_catalog(family_id,name,enabled,is_custom,created_by_member_id) VALUES(?,?,1,1,?)").bind(m.family_id,newName,m.id),
      ctx.env.DB.prepare("UPDATE item_category_catalog SET enabled=1,updated_at=CURRENT_TIMESTAMP,activated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE family_id=? AND name=? COLLATE NOCASE").bind(m.family_id,newName),
    ];
    if(oldName!==UNCLASSIFIED&&oldName.toLocaleLowerCase('ja-JP')!==newName.toLocaleLowerCase('ja-JP'))statements.push(ctx.env.DB.prepare('UPDATE item_category_catalog SET enabled=0,updated_at=? WHERE family_id=? AND name=? COLLATE NOCASE').bind(now,m.family_id,oldName));
    const current=await readCategoryOrder(ctx,m.family_id);
    const replaced=current.map(value=>value.toLocaleLowerCase('ja-JP')===oldName.toLocaleLowerCase('ja-JP')?newName:value);
    if(oldName===UNCLASSIFIED&&!replaced.some(value=>value.toLocaleLowerCase('ja-JP')===newName.toLocaleLowerCase('ja-JP')))replaced.push(newName);
    statements.push(ctx.env.DB.prepare("INSERT INTO family_settings(family_id,setting_key,setting_value,updated_at) VALUES(?,?,?,?) ON CONFLICT(family_id,setting_key) DO UPDATE SET setting_value=excluded.setting_value,updated_at=excluded.updated_at").bind(m.family_id,CATEGORY_ORDER_KEY,JSON.stringify(uniqueNames(replaced)),now));
    await ctx.env.DB.batch(statements);
    return json({ok:true,name:newName});
  }
  if(action!=='add')return bad('未対応の操作です。');

  const name=String(b.name??'').trim(); const date=String(b.date??'').trim();
  if(!name)return json({ok:false,error:'持ち物名を入力してください。'},400);
  if(name.length>200)return bad('持ち物名は200文字以内で入力してください。');
  const memo=String(b.memo??'').trim();if(memo.length>2000)return bad('メモは2000文字以内で入力してください。');
  const category=normalizeCategory(b.category);if(category.length>255)return bad('カテゴリ名は255文字以内で入力してください。');
  const itemUrl=String(b.url??'').trim();if(!validUrl(itemUrl))return bad('URLは http:// または https:// で入力してください。');
  const clientRequestId=String(b.client_request_id??'').trim();if(clientRequestId.length>120)return bad('リクエストIDが長すぎます。');
  if(b.task_id!=null&&b.task_id!==''&&b.task_id!==0)return bad('タスクとの紐づけは廃止されました。画面を再読み込みしてください。');
  if(Array.isArray(b.assignees)&&b.assignees.length)return bad('持ち物の担当者指定は廃止されました。画面を再読み込みしてください。');
  const dueDate=/^\d{4}-\d{2}-\d{2}$/.test(date)?date:null;

  if(clientRequestId){
    const existing=await visibleRequestRow(ctx,m.family_id,m.id,clientRequestId);
    if(existing){
      if(!sameRequest(existing,name,memo,itemUrl,category,dueDate))return bad('同じリクエストIDが別の持ち物に使用されています。',409,'IDEMPOTENCY_CONFLICT');
      return json({ok:true,id:Number(existing.id),date:dueDate,category,deduplicated:true},200);
    }
  }

  const now=nowJst();
  const insertSql=clientRequestId
    ?`INSERT OR IGNORE INTO items(family_id,name,memo,due_at,status,completion_mode,created_by,created_at,updated_at,category,url,client_request_id,visibility_scope,private_owner_id) VALUES(?,?,?,?,'pending','ANY',?,?,?,?,?,?,'FAMILY',NULL)`
    :`INSERT INTO items(family_id,name,memo,due_at,status,completion_mode,created_by,created_at,updated_at,category,url,client_request_id,visibility_scope,private_owner_id) VALUES(?,?,?,?,'pending','ANY',?,?,?,?,?,?,'FAMILY',NULL)`;
  const r=await ctx.env.DB.prepare(insertSql).bind(m.family_id,name,memo||null,dueDate?`${dueDate} 00:00:00`:null,m.id,now,now,category||null,itemUrl||null,clientRequestId||null).run();
  let id=Number(r.meta.last_row_id||0);let inserted=Number(r.meta.changes||0)>0;
  if(clientRequestId){
    const resolved=await visibleRequestRow(ctx,m.family_id,m.id,clientRequestId);
    if(!resolved)return bad('保存結果を確認できませんでした。',409,'IDEMPOTENCY_CONFLICT');
    if(!sameRequest(resolved,name,memo,itemUrl,category,dueDate))return bad('同じリクエストIDが別の持ち物に使用されています。',409,'IDEMPOTENCY_CONFLICT');
    id=Number(resolved.id);inserted=inserted&&id>0;
  }
  if(!id)return bad('持ち物を保存できませんでした。',500,'SAVE_FAILED');
  if(inserted){
    if(category)await upsertCatalogCategory(ctx,m.family_id,m.id,category);
    await ctx.env.DB.prepare('INSERT INTO activity_logs(family_id,member_id,action,target_type,target_id,metadata,occurred_at) VALUES(?,?,?,?,?,?,?)').bind(m.family_id,m.id,'CREATED','item',id,JSON.stringify({name}),nowJst()).run().catch(()=>{});
  }
  return json({ok:true,id,date:dueDate,category,deduplicated:!inserted},inserted?201:200);
}
