import type { AppContext } from './app-context';
import { bodyJson, RequestBodyParseError } from './request-body';
import { json } from './response';
import { commitSession } from './session';
import { taskChildVisibilitySql } from './task-visibility';
import { handleShoppingReusableSetAction, readShoppingReusableSets } from './shopping-reusable-set-api';

type Row=Record<string,unknown>;

const nowJst=()=>new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Tokyo',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'}).format(new Date()).replace(' ','T').replace('T',' ');
const bad=(message:string)=>json({ok:false,error:message,code:'BAD_REQUEST'},400);

async function requireBody(request:Request):Promise<Record<string,unknown>|Response>{
  try{return await bodyJson(request);}
  catch(error){
    if(error instanceof RequestBodyParseError)return bad(error.message||'入力内容が不正です。');
    throw error;
  }
}

function csrfResponse(ctx:AppContext,token:unknown):Response|null{
  if(!ctx.session.csrfToken)ctx.session.csrfToken=crypto.randomUUID();
  if(typeof token!=='string'||token!==ctx.session.csrfToken)return json({ok:false,error:'CSRF検証に失敗しました。',code:'FORBIDDEN'},403);
  return null;
}

/** Canonical Shopping mutation API. The retired standalone list page is not rendered here. */
export async function shopping(request:Request,ctx:AppContext):Promise<Response>{
  const m=ctx.member;
  if(!m)return json({ok:false,error:'ログインが必要です。',code:'AUTH_REQUIRED'},401);
  if(request.method==='GET'&&new URL(request.url).searchParams.get('view')==='reusable_sets')return await readShoppingReusableSets(ctx,m);
  if(request.method!=='POST')return json({ok:false,error:'Method Not Allowed',code:'METHOD_NOT_ALLOWED'},405);

  const parsed=await requireBody(request);
  if(parsed instanceof Response)return parsed;
  const b=parsed;
  const csrfFailure=csrfResponse(ctx,b.csrf);
  if(csrfFailure)return csrfFailure;
  const action=String(b.action??'add');
  const reusableSetResponse=await handleShoppingReusableSetAction(ctx,m,b);
  if(reusableSetResponse)return reusableSetResponse;

  if(action==='to_task')return json({ok:false,error:'買い物とタスクの紐づけは廃止されました。',code:'RETIRED_ACTION'},410);
  if((action==='add'||action==='add_batch')&&((b.task_id!=null&&b.task_id!==''&&b.task_id!==0)||(Array.isArray(b.assignees)&&b.assignees.length)))return bad('担当者・タスク紐づけは廃止されました。画面を再読み込みしてください。');

  if(action==='toggle'){
    const id=Number(b.id),completed=Boolean(b.completed),now=nowJst();
    const current=await ctx.env.DB.prepare(`SELECT s.id FROM shopping_items s WHERE s.id=? AND s.family_id=? AND ${taskChildVisibilitySql('s')}`).bind(id,m.family_id,m.id).first<Row>();
    if(!current)return json({ok:false,error:'買い物が見つかりません。'},404);
    await ctx.env.DB.batch([
      ctx.env.DB.prepare('UPDATE shopping_items SET status=?,completed_by=?,completed_at=?,updated_at=? WHERE id=? AND family_id=?').bind(completed?'completed':'pending',completed?m.id:null,completed?now:null,now,id,m.family_id),
      ctx.env.DB.prepare('INSERT INTO shopping_completion_history(shopping_item_id,member_id,action,occurred_at) VALUES(?,?,?,?)').bind(id,m.id,completed?'COMPLETED':'UNCOMPLETED',now),
    ]);
    return commitSession(json({ok:true}),ctx.session,ctx.env.APP_SECRET);
  }

  if(action==='update_category'){
    const id=Number(b.id||0);
    if(!Number.isInteger(id)||id<=0)return bad('買い物項目が不正です。');
    const category=String(b.category??'').trim();
    if(category.length>255)return bad('カテゴリー名は255文字以内で入力してください。');
    const current=await ctx.env.DB.prepare(`SELECT s.id FROM shopping_items s WHERE s.id=? AND s.family_id=? AND ${taskChildVisibilitySql('s')} LIMIT 1`).bind(id,m.family_id,m.id).first<Row>();
    if(!current)return json({ok:false,error:'買い物が見つかりません。'},404);
    await ctx.env.DB.prepare('UPDATE shopping_items SET category=?,updated_at=? WHERE id=? AND family_id=?').bind(category||null,nowJst(),id,m.family_id).run();
    return commitSession(json({ok:true,id,category}),ctx.session,ctx.env.APP_SECRET);
  }

  if(action==='add_batch'){
    const products=Array.isArray(b.products)?b.products as unknown[]:[];
    const normalized=products.map(v=>({name:String((v as any)?.name??'').trim(),quantity:String((v as any)?.quantity??'1').trim()||'1',url:String((v as any)?.url??'').trim()})).filter(v=>v.name);
    if(!normalized.length)return bad('商品名を1つ以上入力してください。');
    if(normalized.length>50)return bad('一度に登録できる商品は50件までです。');
    for(const p of normalized){if(p.url){try{const u=new URL(p.url);if(!['http:','https:'].includes(u.protocol))throw new Error();}catch{return bad('商品URLが不正です。');}}}
    const category=String(b.category??'').trim()||null;
    const memo=String(b.memo??'').trim()||null;
    let due=String(b.due_date??'').trim()||null;
    if(due&&!/^\d{4}-\d{2}-\d{2}$/.test(due))return bad('期限の日付が不正です。');
    const now=nowJst();
    const statements=normalized.map(p=>ctx.env.DB.prepare("INSERT INTO shopping_items(family_id,name,quantity,category,memo,due_date,status,created_by,created_at,updated_at,url,visibility_scope,private_owner_id) VALUES(?,?,?,?,?,?,'pending',?,?,?,?,'FAMILY',NULL)").bind(m.family_id,p.name,p.quantity,category,memo,due,m.id,now,now,p.url||null));
    await ctx.env.DB.batch(statements);
    return commitSession(json({ok:true,count:normalized.length}),ctx.session,ctx.env.APP_SECRET);
  }

  if(action==='add'){
    const name=String(b.name??'').trim();
    if(!name)return bad('商品名を入力してください。');
    const quantity=String(b.quantity??'1').trim()||'1';
    const category=String(b.category??'').trim()||null;
    const memo=String(b.memo??'').trim()||null;
    let due=String(b.due_date??'').trim()||null;
    if(due&&!/^\d{4}-\d{2}-\d{2}$/.test(due))return bad('期限の日付が不正です。');
    const rawUrl=String(b.url??'').trim();
    if(rawUrl){try{const u=new URL(rawUrl);if(!['http:','https:'].includes(u.protocol))throw new Error();}catch{return bad('商品URLが不正です。');}}
    const now=nowJst();
    const created=await ctx.env.DB.prepare("INSERT INTO shopping_items(family_id,name,quantity,category,memo,due_date,status,created_by,created_at,updated_at,url,visibility_scope,private_owner_id) VALUES(?,?,?,?,?,?,'pending',?,?,?,?,'FAMILY',NULL)").bind(m.family_id,name,quantity,category,memo,due,m.id,now,now,rawUrl||null).run();
    const shoppingId=Number(created.meta.last_row_id);
    return commitSession(json({ok:true,id:shoppingId,name,category:category||'',due_date:due}),ctx.session,ctx.env.APP_SECRET);
  }

  return bad('未対応の操作です。');
}
