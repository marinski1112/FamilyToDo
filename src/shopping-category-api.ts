import type { AppContext } from './app-context';
import { bodyJson, RequestBodyParseError } from './request-body';
import { commitSession } from './session';
import { json } from './response';
import { DEFAULT_SHOPPING_CATEGORY_NAMES, isValidShoppingCategoryName, normalizeShoppingCategoryName, shoppingCategoryKey } from './shopping-categories';

function bad(message:string):Response{
  return json({ok:false,error:message,code:'BAD_REQUEST'},400);
}

const ORDER_KEY='shopping_category_order';

async function readOrder(ctx:AppContext,familyId:number):Promise<string[]>{
  const row=await ctx.env.DB.prepare('SELECT setting_value FROM family_settings WHERE family_id=? AND setting_key=? LIMIT 1').bind(familyId,ORDER_KEY).first<{setting_value?:string}>();
  try{
    const parsed=JSON.parse(String(row?.setting_value||'[]'));
    return Array.isArray(parsed)?parsed.map(v=>String(v).trim()).filter(Boolean).slice(0,100):[];
  }catch{return [];}
}

/** Reusable Shopping category catalog plus checklist display ordering. */
export async function shoppingCategoryApi(request:Request,ctx:AppContext):Promise<Response>{
  const member=ctx.member;
  if(!member)return json({ok:false,error:'ログインが必要です。',code:'AUTH_REQUIRED'},401);

  if(request.method==='GET'){
    const [order,catalogResult]=await Promise.all([
      readOrder(ctx,member.family_id),
      ctx.env.DB.prepare('SELECT name,created_at,activated_at,enabled FROM shopping_category_catalog WHERE family_id=? ORDER BY name COLLATE NOCASE').bind(member.family_id).all<{name?:string}>(),
    ]);
    const catalog=(catalogResult.results||[]) as Array<{name?:string;created_at?:string;activated_at?:string;enabled?:number}>;
    const categories=catalog.filter(row=>Number(row.enabled)===1).map(row=>String(row.name||'').trim()).filter(Boolean);
    const categoryMeta=catalog.map(row=>({name:String(row.name||'').trim(),created_at:String(row.created_at||''),activated_at:String(row.activated_at||''),enabled:Number(row.enabled)})).filter(row=>row.name);
    const role=String(member.role||'').toUpperCase();
    return json({ok:true,order,categories,categoryMeta,canManageCategories:role==='OWNER'||role==='ADMIN'});
  }
  if(request.method!=='POST')return json({ok:false,error:'Method Not Allowed',code:'METHOD_NOT_ALLOWED'},405);

  let body:Record<string,unknown>;
  try{body=await bodyJson(request);}
  catch(error){
    if(error instanceof RequestBodyParseError)return bad(error.message||'入力内容が不正です。');
    throw error;
  }

  if(!ctx.session.csrfToken)ctx.session.csrfToken=crypto.randomUUID();
  if(typeof body.csrf!=='string'||body.csrf!==ctx.session.csrfToken)return json({ok:false,error:'CSRF検証に失敗しました。',code:'FORBIDDEN'},403);

  if(body.action==='reorder'){
    const raw=Array.isArray(body.order)?body.order:[];
    const order=[...new Set(raw.map(v=>normalizeShoppingCategoryName(v)).filter(isValidShoppingCategoryName))].slice(0,100);
    const now=new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Tokyo',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'}).format(new Date()).replace('T',' ');
    await ctx.env.DB.prepare(`INSERT INTO family_settings(family_id,setting_key,setting_value,updated_at) VALUES(?,?,?,?)
      ON CONFLICT(family_id,setting_key) DO UPDATE SET setting_value=excluded.setting_value,updated_at=excluded.updated_at`).bind(member.family_id,ORDER_KEY,JSON.stringify(order),now).run();
    return commitSession(json({ok:true,order}),ctx.session,ctx.env.APP_SECRET);
  }

  const name=normalizeShoppingCategoryName(body.name);
  if(!isValidShoppingCategoryName(name))return bad('カテゴリー名は1〜255文字で入力してください。');

  if(body.action==='disable'){
    const role=String(member.role||'').toUpperCase();
    if(role!=='OWNER'&&role!=='ADMIN')return json({ok:false,error:'管理者権限が必要です。',code:'FORBIDDEN'},403);
    const defaultKeys=new Set(DEFAULT_SHOPPING_CATEGORY_NAMES.map(shoppingCategoryKey));
    const isCustom=defaultKeys.has(shoppingCategoryKey(name))?0:1;
    await ctx.env.DB.batch([
      ctx.env.DB.prepare(`INSERT OR IGNORE INTO shopping_category_catalog(family_id,name,enabled,is_custom,created_by_member_id,created_at,updated_at)
        VALUES(?,?,0,?,?,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)`).bind(member.family_id,name,isCustom,member.id),
      ctx.env.DB.prepare(`UPDATE shopping_category_catalog SET enabled=0,updated_at=CURRENT_TIMESTAMP
        WHERE family_id=? AND name=? COLLATE NOCASE`).bind(member.family_id,name),
    ]);
    return commitSession(json({ok:true,name,enabled:false}),ctx.session,ctx.env.APP_SECRET);
  }

  await ctx.env.DB.batch([
    ctx.env.DB.prepare(`INSERT OR IGNORE INTO shopping_category_catalog(family_id,name,enabled,is_custom,created_by_member_id,created_at,updated_at)
      VALUES(?,?,1,1,?,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)`).bind(member.family_id,name,member.id),
    ctx.env.DB.prepare(`UPDATE shopping_category_catalog SET enabled=1,updated_at=CURRENT_TIMESTAMP
      WHERE family_id=? AND name=? COLLATE NOCASE`).bind(member.family_id,name),
  ]);

  const created=await ctx.env.DB.prepare('SELECT created_at,activated_at FROM shopping_category_catalog WHERE family_id=? AND name=? COLLATE NOCASE LIMIT 1').bind(member.family_id,name).first<{created_at?:string;activated_at?:string;enabled?:number}>();
  return commitSession(json({ok:true,name,created_at:String(created?.created_at||''),activated_at:String(created?.activated_at||'')}),ctx.session,ctx.env.APP_SECRET);
}