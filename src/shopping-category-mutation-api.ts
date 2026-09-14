import type { AppContext } from './app-context';
import { json } from './response';
import { commitSession } from './session';
import { normalizeShoppingCategoryName,isValidShoppingCategoryName,shoppingCategoryKey } from './shopping-categories';

const ORDER_KEY='shopping_category_order';
const UNCLASSIFIED='未分類';

export async function shoppingCategoryMutationApi(request:Request,ctx:AppContext):Promise<Response>{
  const member=ctx.member;
  if(!member)return json({ok:false,error:'ログインが必要です。'},401);
  if(request.method!=='POST')return json({ok:false,error:'POST only'},405);
  const body=await request.json().catch(()=>null) as Record<string,unknown>|null;
  if(!body)return json({ok:false,error:'JSONが不正です。'},400);
  if(String(body.csrf||'')!==String(ctx.session.csrfToken||''))return json({ok:false,error:'CSRF検証に失敗しました。'},403);
  if(String(body.action||'')!=='rename')return json({ok:false,error:'未対応の操作です。'},400);

  const oldName=normalizeShoppingCategoryName(body.name);
  const newName=normalizeShoppingCategoryName(body.new_name);
  const renamingUnclassified=shoppingCategoryKey(oldName)===shoppingCategoryKey(UNCLASSIFIED);
  if((!renamingUnclassified&&!isValidShoppingCategoryName(oldName))||!isValidShoppingCategoryName(newName))return json({ok:false,error:'カテゴリー名は1〜255文字で入力してください。'},400);
  if(!renamingUnclassified&&shoppingCategoryKey(oldName)===shoppingCategoryKey(newName))return commitSession(json({ok:true,name:newName}),ctx.session,ctx.env.APP_SECRET);

  const now=new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Tokyo',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'}).format(new Date()).replace('T',' ');
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
