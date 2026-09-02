import type { AppContext } from './app-context';
import { bodyJson, RequestBodyParseError } from './request-body';
import { json } from './response';
import { commitSession } from './session';

const nowJst = () => new Intl.DateTimeFormat('sv-SE',{
  timeZone:'Asia/Tokyo',year:'numeric',month:'2-digit',day:'2-digit',
  hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23',
}).format(new Date()).replace(' ','T').replace('T',' ');

/** Canonical family-creation API independent from the legacy app.ts monolith. */
export async function createFamily(request: Request, ctx: AppContext): Promise<Response> {
  if (request.method !== 'POST') return json({ok:false,error:'POST only'},405);
  if (!ctx.session.lineUserId) return json({ok:false,error:'LINE認証が必要です。'},401);
  let body: Record<string, unknown>;
  try {
    body = await bodyJson(request);
  } catch (error) {
    if (error instanceof RequestBodyParseError) return json({ok:false,error:error.message||'入力内容が不正です。',code:'BAD_REQUEST'},400);
    throw error;
  }
  const familyName = String(body.family_name ?? '').trim();
  const memberName = String(body.member_name ?? ctx.session.lineDisplayName ?? '').trim() || 'メンバー';
  if (!familyName || familyName.length>255) return json({ok:false,error:'家族名を入力してください（255文字以内）。'},400);
  const now=nowJst();
  const familyCode = crypto.randomUUID().replaceAll('-','').slice(0,16).toUpperCase();
  const existing = await ctx.env.DB.prepare('SELECT id,family_id FROM members WHERE line_user_id=? AND active=1 LIMIT 1').bind(ctx.session.lineUserId).first<{id:number;family_id:number}>();
  if (existing) { ctx.session.memberId=existing.id;ctx.session.familyId=existing.family_id;return commitSession(json({ok:true,redirect:'/app/index.php'}),ctx.session,ctx.env.APP_SECRET); }
  const familyInsert = await ctx.env.DB.prepare('INSERT INTO families(family_code,name,created_at,updated_at) VALUES(?,?,?,?)').bind(familyCode,familyName,now,now).run();
  const familyId = Number(familyInsert.meta.last_row_id ?? 0);
  if(!familyId) throw new Error('家族IDを取得できませんでした。');
  const memberResult = await ctx.env.DB.prepare('INSERT INTO members(family_id,line_user_id,name,member_type,role,notification_enabled,active,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?)').bind(familyId,ctx.session.lineUserId,memberName,'ADULT','OWNER',1,1,now,now).run();
  const memberId = Number(memberResult.meta.last_row_id);
  await ctx.env.DB.batch([
    ctx.env.DB.prepare('INSERT OR IGNORE INTO family_settings(family_id,setting_key,setting_value,updated_at) VALUES(?,?,?,?)').bind(familyId,'timezone',JSON.stringify('Asia/Tokyo'),now),
    ctx.env.DB.prepare('INSERT OR IGNORE INTO family_settings(family_id,setting_key,setting_value,updated_at) VALUES(?,?,?,?)').bind(familyId,'week_start',JSON.stringify('MONDAY'),now),
    ctx.env.DB.prepare('INSERT OR IGNORE INTO family_settings(family_id,setting_key,setting_value,updated_at) VALUES(?,?,?,?)').bind(familyId,'default_completion_mode',JSON.stringify('ANY'),now)
  ]);
  ctx.session.memberId=memberId;ctx.session.familyId=familyId;
  return commitSession(json({ok:true,redirect:'/app/index.php',family_id:familyId}),ctx.session,ctx.env.APP_SECRET);
}
