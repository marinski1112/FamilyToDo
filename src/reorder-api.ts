import { json } from './response';
import { taskVisibilitySql } from './task-visibility';

export async function reorderApi(request:Request,ctx:any):Promise<Response>{
  const m=ctx.member;if(!m)return json({ok:false,error:'ログインが必要です。'},401);if(request.method!=='POST')return json({ok:false,error:'POST only'},405);
  const b=await request.json().catch(()=>null) as Record<string,unknown>|null;if(!b)return json({ok:false,error:'JSONが不正です。'},400);
  if(String(b.csrf||'')!==String(ctx.session.csrfToken||''))return json({ok:false,error:'CSRF検証に失敗しました。'},403);
  const ids=[...new Set(Array.isArray(b.ids)?(b.ids as unknown[]).map(Number).filter(n=>Number.isInteger(n)&&n>0):[])];if(!ids.length)return json({ok:false,error:'順序がありません。'},400);
  if(ids.length>100)return json({ok:false,error:'一度に並べ替えできる件数を超えています。'},400);
  const placeholders=ids.map(()=>'?').join(',');
  const valid=await ctx.env.DB.prepare(`SELECT id FROM tasks t WHERE family_id=? AND id IN (${placeholders}) AND ${taskVisibilitySql('t')}`).bind(m.family_id,...ids,m.id).all();
  if(valid.results.length!==ids.length)return json({ok:false,error:'家族外または削除済みのタスクが含まれています。'},400);
  const now=new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Tokyo',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'}).format(new Date());
  await ctx.env.DB.batch(ids.map((id:number,i:number)=>ctx.env.DB.prepare('UPDATE tasks SET sort_order=?,updated_at=? WHERE id=? AND family_id=?').bind(i*10,now,id,m.family_id)));
  return json({ok:true,ids});
}
