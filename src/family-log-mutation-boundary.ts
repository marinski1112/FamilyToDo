import type { AppContext } from './app-context';
import { familyLogApi } from './family-log-api';
import { bodyJson, RequestBodyParseError } from './request-body';
import { json } from './response';

type Row=Record<string,unknown>;

/**
 * Retained HTTP boundary for Family Log mutations that need response-level
 * tenant validation without duplicating the canonical mutation implementation.
 * familyLogApi remains responsible for auth, CSRF, role checks and the mutation.
 */
export async function familyLogMutationBoundary(request:Request,ctx:AppContext):Promise<Response>{
  if(request.method!=='POST')return familyLogApi(request,ctx);
  let body:Record<string,unknown>;
  try{body=await bodyJson(request.clone());}catch(error){
    if(error instanceof RequestBodyParseError)return familyLogApi(request,ctx);
    throw error;
  }
  if(String(body.action||'')!=='quick_action_disable')return familyLogApi(request,ctx);

  const id=Number(body.id||0);
  const response=await familyLogApi(request,ctx);
  if(!response.ok)return response;
  if(!Number.isSafeInteger(id)||id<=0)return json({ok:false,error:'クイック記録が不正です。'},400);
  const familyId=Number(ctx.member?.family_id||0);
  if(!Number.isSafeInteger(familyId)||familyId<=0)return response;
  const row=await ctx.env.DB.prepare('SELECT id FROM family_log_quick_actions WHERE id=? AND family_id=? LIMIT 1').bind(id,familyId).first<Row>();
  if(!row)return json({ok:false,error:'クイック記録が見つかりません。'},404);
  return response;
}
