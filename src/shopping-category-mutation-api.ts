import type { AppContext } from './app-context';
import { json } from './response';
import { commitSession } from './session';
import { DEFAULT_SHOPPING_CATEGORY_NAMES, normalizeShoppingCategoryName,isValidShoppingCategoryName,shoppingCategoryKey } from './shopping-categories';

const ORDER_KEY='shopping_category_order';
const ITEM_ORDER_KEY='item_category_order';
const UNCLASSIFIED='未分類';

const nowJst=()=>new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Tokyo',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'}).format(new Date()).replace('T',' ');
const categoryKey=(value:unknown)=>String(value??'').trim().toLocaleLowerCase('ja-JP');
const uniqueDeleteNames=(values:unknown[])=>{
  const out:string[]=[];const seen=new Set<string>();
  for(const value of values){
    const name=String(value??'').trim();const key=categoryKey(name);
    if(!name||name===UNCLASSIFIED||name.length>255||seen.has(key))continue;
    seen.add(key);out.push(name);
    if(out.length>=100)break;
  }
  return out;
};

async function readOrder(ctx:AppContext,familyId:number,key:string):Promise<string[]>{
  const row=await ctx.env.DB.prepare('SELECT setting_value FROM family_settings WHERE family_id=? AND setting_key=? LIMIT 1').bind(familyId,key).first<{setting_value?:string}>();
  try{const parsed=JSON.parse(String(row?.setting_value||'[]'));return Array.isArray(parsed)?parsed.map(v=>String(v)).filter(Boolean):[];}catch{return [];}
}

export async function shoppingCategoryMutationApi(request:Request,ctx:AppContext):Promise<Response>{
  const member=ctx.member;
  if(!member)return json({ok:false,error:'ログインが必要です。'},401);
  if(request.method!=='POST')return json({ok:false,error:'POST only'},405);
  const body=await request.json().catch(()=>null) as Record<string,unknown>|null;
  if(!body)return json({ok:false,error:'JSONが不正です。'},400);
  if(String(body.csrf||'')!==String(ctx.session.csrfToken||''))return json({ok:false,error:'CSRF検証に失敗しました。'},403);

  const action=String(body.action||'');
  if(action==='delete_many'){
    const role=String(member.role||'').toUpperCase();
    if(role!=='OWNER'&&role!=='ADMIN')return json({ok:false,error:'管理者権限が必要です。',code:'FORBIDDEN'},403);
    const kind=String(body.kind||'shopping');
    if(kind!=='shopping'&&kind!=='item'&&kind!=='shared')return json({ok:false,error:'カテゴリ種別が不正です。'},400);
    const itemPolicy=String(body.item_policy||'unclassified');
    if(itemPolicy!=='unclassified'&&itemPolicy!=='delete')return json({ok:false,error:'カテゴリ内項目の扱いが不正です。'},400);
    const names=uniqueDeleteNames(Array.isArray(body.names)?body.names:[]);
    if(!names.length)return commitSession(json({ok:true,deleted:[]}),ctx.session,ctx.env.APP_SECRET);

    const orderKeys=kind==='shared'?[ORDER_KEY,ITEM_ORDER_KEY]:[kind==='shopping'?ORDER_KEY:ITEM_ORDER_KEY];
    const removedKeys=new Set(names.map(categoryKey));
    const now=nowJst();
    const statements=[];
    const defaultShoppingKeys=new Set(DEFAULT_SHOPPING_CATEGORY_NAMES.map(shoppingCategoryKey));

    for(const name of names){
      if(kind==='shopping'||kind==='shared'){
        const isCustom=defaultShoppingKeys.has(shoppingCategoryKey(name))?0:1;
        if(itemPolicy==='delete')statements.push(ctx.env.DB.prepare('DELETE FROM shopping_items WHERE family_id=? AND category=? COLLATE NOCASE').bind(member.family_id,name));
        else statements.push(ctx.env.DB.prepare('UPDATE shopping_items SET category=NULL,updated_at=? WHERE family_id=? AND category=? COLLATE NOCASE').bind(now,member.family_id,name));
        statements.push(ctx.env.DB.prepare(`INSERT OR IGNORE INTO shopping_category_catalog(family_id,name,enabled,is_custom,created_by_member_id,created_at,updated_at)
          VALUES(?,?,0,?,?,?,?)`).bind(member.family_id,name,isCustom,member.id,now,now));
        statements.push(ctx.env.DB.prepare('UPDATE shopping_category_catalog SET enabled=0,updated_at=? WHERE family_id=? AND name=? COLLATE NOCASE').bind(now,member.family_id,name));
      }
      if(kind==='item'||kind==='shared'){
        if(itemPolicy==='delete')statements.push(ctx.env.DB.prepare('DELETE FROM items WHERE family_id=? AND category=? COLLATE NOCASE').bind(member.family_id,name));
        else statements.push(ctx.env.DB.prepare('UPDATE items SET category=NULL,updated_at=? WHERE family_id=? AND category=? COLLATE NOCASE').bind(now,member.family_id,name));
        statements.push(ctx.env.DB.prepare(`INSERT OR IGNORE INTO item_category_catalog(family_id,name,enabled,is_custom,created_by_member_id,created_at,updated_at)
          VALUES(?,?,0,1,?,?,?)`).bind(member.family_id,name,member.id,now,now));
        statements.push(ctx.env.DB.prepare('UPDATE item_category_catalog SET enabled=0,updated_at=? WHERE family_id=? AND name=? COLLATE NOCASE').bind(now,member.family_id,name));
      }
    }
    for(const orderKey of orderKeys){const currentOrder=await readOrder(ctx,member.family_id,orderKey);const nextOrder=currentOrder.filter(name=>!removedKeys.has(categoryKey(name)));statements.push(ctx.env.DB.prepare(`INSERT INTO family_settings(family_id,setting_key,setting_value,updated_at) VALUES(?,?,?,?)
      ON CONFLICT(family_id,setting_key) DO UPDATE SET setting_value=excluded.setting_value,updated_at=excluded.updated_at`).bind(member.family_id,orderKey,JSON.stringify(nextOrder),now));}
    await ctx.env.DB.batch(statements);
    return commitSession(json({ok:true,deleted:names,kind,item_policy:itemPolicy}),ctx.session,ctx.env.APP_SECRET);
  }

  if(action!=='rename')return json({ok:false,error:'未対応の操作です。'},400);

  const oldName=normalizeShoppingCategoryName(body.name);
  const newName=normalizeShoppingCategoryName(body.new_name);
  const renamingUnclassified=shoppingCategoryKey(oldName)===shoppingCategoryKey(UNCLASSIFIED);
  if((!renamingUnclassified&&!isValidShoppingCategoryName(oldName))||!isValidShoppingCategoryName(newName))return json({ok:false,error:'カテゴリー名は1〜255文字で入力してください。'},400);
  if(!renamingUnclassified&&shoppingCategoryKey(oldName)===shoppingCategoryKey(newName))return commitSession(json({ok:true,name:newName}),ctx.session,ctx.env.APP_SECRET);

  const now=nowJst();
  const orderRow=await ctx.env.DB.prepare('SELECT setting_value FROM family_settings WHERE family_id=? AND setting_key=? LIMIT 1').bind(member.family_id,ORDER_KEY).first<{setting_value?:string}>();
  let order:string[]=[];
  try{const parsed=JSON.parse(String(orderRow?.setting_value||'[]'));if(Array.isArray(parsed))order=parsed.map(v=>String(v));}catch{/* keep empty */}
  order=[...new Set(order.map(v=>shoppingCategoryKey(v)===shoppingCategoryKey(oldName)?newName:v))];

  const statements=renamingUnclassified?[
    ctx.env.DB.prepare("UPDATE shopping_items SET category=?,updated_at=? WHERE family_id=? AND (category IS NULL OR trim(category)='')").bind(newName,now,member.family_id),
    ctx.env.DB.prepare(`INSERT OR IGNORE INTO shopping_category_catalog(family_id,name,enabled,is_custom,created_by_member_id,created_at,updated_at)
      VALUES(?,?,1,1,?,?,?)`).bind(member.family_id,newName,member.id,now,now),
  ]:[
    ctx.env.DB.prepare('UPDATE shopping_items SET category=?,updated_at=? WHERE family_id=? AND category=? COLLATE NOCASE').bind(newName,now,member.family_id,oldName),
    ctx.env.DB.prepare(`INSERT OR IGNORE INTO shopping_category_catalog(family_id,name,enabled,is_custom,created_by_member_id,created_at,updated_at)
      VALUES(?,?,1,1,?,?,?)`).bind(member.family_id,newName,member.id,now,now),
    ctx.env.DB.prepare('UPDATE shopping_category_catalog SET enabled=0,updated_at=? WHERE family_id=? AND name=? COLLATE NOCASE').bind(now,member.family_id,oldName),
  ];
  if(order.length)statements.push(ctx.env.DB.prepare(`INSERT INTO family_settings(family_id,setting_key,setting_value,updated_at) VALUES(?,?,?,?)
    ON CONFLICT(family_id,setting_key) DO UPDATE SET setting_value=excluded.setting_value,updated_at=excluded.updated_at`).bind(member.family_id,ORDER_KEY,JSON.stringify(order),now));
  await ctx.env.DB.batch(statements);
  return commitSession(json({ok:true,name:newName,old_name:oldName,renamed_unclassified:renamingUnclassified}),ctx.session,ctx.env.APP_SECRET);
}