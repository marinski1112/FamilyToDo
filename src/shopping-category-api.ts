import type { AppContext } from './app-context';
import { bodyJson, RequestBodyParseError } from './request-body';
import { commitSession } from './session';
import { json } from './response';
import { isValidShoppingCategoryName, normalizeShoppingCategoryName } from './shopping-categories';

function bad(message:string):Response{
  return json({ok:false,error:message,code:'BAD_REQUEST'},400);
}

/** Register or re-enable one reusable Shopping category for the signed-in family. */
export async function shoppingCategoryApi(request:Request,ctx:AppContext):Promise<Response>{
  const member=ctx.member;
  if(!member)return json({ok:false,error:'ログインが必要です。',code:'AUTH_REQUIRED'},401);
  if(request.method!=='POST')return json({ok:false,error:'Method Not Allowed',code:'METHOD_NOT_ALLOWED'},405);

  let body:Record<string,unknown>;
  try{body=await bodyJson(request);}
  catch(error){
    if(error instanceof RequestBodyParseError)return bad(error.message||'入力内容が不正です。');
    throw error;
  }

  if(!ctx.session.csrfToken)ctx.session.csrfToken=crypto.randomUUID();
  if(typeof body.csrf!=='string'||body.csrf!==ctx.session.csrfToken){
    return json({ok:false,error:'CSRF検証に失敗しました。',code:'FORBIDDEN'},403);
  }

  const name=normalizeShoppingCategoryName(body.name);
  if(!isValidShoppingCategoryName(name))return bad('カテゴリー名は1〜255文字で入力してください。');

  await ctx.env.DB.batch([
    ctx.env.DB.prepare(`INSERT OR IGNORE INTO shopping_category_catalog(family_id,name,enabled,is_custom,created_by_member_id,created_at,updated_at)
      VALUES(?,?,1,1,?,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)`).bind(member.family_id,name,member.id),
    ctx.env.DB.prepare(`UPDATE shopping_category_catalog SET enabled=1,updated_at=CURRENT_TIMESTAMP
      WHERE family_id=? AND name=? COLLATE NOCASE`).bind(member.family_id,name),
  ]);

  return commitSession(json({ok:true,name}),ctx.session,ctx.env.APP_SECRET);
}
