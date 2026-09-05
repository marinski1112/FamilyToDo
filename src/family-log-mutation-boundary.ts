import type { AppContext } from './app-context';
import { logActivity } from './activity-log';
import { familyLogApi } from './family-log-api';
import { cleanupFamilyLogMediaForLog } from './family-log-media-api';
import { bodyJson, RequestBodyParseError } from './request-body';
import { json } from './response';

type Row=Record<string,unknown>;

/**
 * Retained HTTP boundary for Family Log mutations that need a stricter
 * request-level tenant check without duplicating the canonical mutation body.
 * familyLogApi remains the mutation owner and repeats auth/CSRF/role checks.
 */
export async function familyLogMutationBoundary(request:Request,ctx:AppContext):Promise<Response>{
  if(request.method!=='POST')return familyLogApi(request,ctx);
  let body:Record<string,unknown>;
  try{body=await bodyJson(request.clone());}catch(error){
    if(error instanceof RequestBodyParseError)return familyLogApi(request,ctx);
    throw error;
  }
  const action=String(body.action||'');
  if(action==='delete'){
    const familyId=Number(ctx.member?.family_id||0),logId=Number(body.id||0);
    const response=await familyLogApi(request,ctx);
    if(response.ok&&Number.isSafeInteger(familyId)&&familyId>0&&Number.isSafeInteger(logId)&&logId>0){
      await cleanupFamilyLogMediaForLog(ctx.env,familyId,logId).catch(()=>{});
    }
    return response;
  }
  if(String(body.action||'')!=='quick_action_disable')return familyLogApi(request,ctx);

  const member=ctx.member;
  if(!member)return familyLogApi(request,ctx);
  const expectedCsrf=String(ctx.session?.csrfToken||''),csrf=String(body.csrf||'');
  if(!expectedCsrf||!csrf||csrf!==expectedCsrf)return json({ok:false,error:'CSRF検証に失敗しました。'},403);
  const role=String(member.role||'').toUpperCase();
  if(role!=='OWNER'&&role!=='ADMIN')return json({ok:false,error:'管理者のみ操作できます。'},403);

  const id=Number(body.id||0);
  if(!Number.isSafeInteger(id)||id<=0)return json({ok:false,error:'クイック記録が不正です。'},400);
  const familyId=Number(member.family_id||0);
  if(!Number.isSafeInteger(familyId)||familyId<=0)return json({ok:false,error:'家族情報が不正です。'},400);
  const row=await ctx.env.DB.prepare('SELECT id,active,name FROM family_log_quick_actions WHERE id=? AND family_id=? LIMIT 1').bind(id,familyId).first<Row>();
  if(!row)return json({ok:false,error:'クイック記録が見つかりません。'},404);

  const wasActive=Number(row.active||0)===1;
  const response=await familyLogApi(request,ctx);
  if(response.ok&&wasActive){
    await logActivity(ctx,'DISABLED','family_log_quick_action',id,{name:String(row.name||'')});
  }
  return response;
}
