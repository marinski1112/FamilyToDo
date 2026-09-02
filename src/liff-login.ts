import type { AppContext } from './app-context';
import { verifyLineIdToken } from './line';
import { validateLiffNext } from './liff-target';
import { bodyJson, RequestBodyParseError } from './request-body';
import { json } from './response';
import { commitSession } from './session';

/** Canonical LIFF ID-token login POST handler independent from the app.ts monolith. */
export async function liffLogin(request: Request, ctx: AppContext): Promise<Response> {
  if (request.method !== 'POST') return json({ok:false,error:'POST only'},405);
  let body: Record<string, unknown>;
  try {
    body = await bodyJson(request);
  } catch (error) {
    if (error instanceof RequestBodyParseError) return json({ok:false,error:error.message||'入力内容が不正です。',code:'BAD_REQUEST'},400);
    throw error;
  }
  const idToken = typeof body.id_token === 'string' ? body.id_token.trim() : '';
  if (!idToken) return json({ok:false,error:'LINE IDトークンがありません。'},400);
  if (!ctx.env.LINE_CHANNEL_ID) return json({ok:false,error:'LINE_CHANNEL_IDが未設定です。'},500);
  const verified = await verifyLineIdToken(idToken, ctx.env.LINE_CHANNEL_ID).catch(() => null);
  if (!verified) return json({ok:false,error:'LINE IDトークンの検証に失敗しました。'},401);

  ctx.session.lineUserId = verified.sub;
  ctx.session.lineDisplayName = verified.name ?? '';
  ctx.session.csrfToken ??= crypto.randomUUID();
  const member = await ctx.env.DB.prepare('SELECT id,family_id FROM members WHERE line_user_id=? AND active=1 LIMIT 1').bind(verified.sub).first<{id:number;family_id:number}>();
  if (member) { ctx.session.memberId=Number(member.id); ctx.session.familyId=Number(member.family_id); }
  else { delete ctx.session.memberId; delete ctx.session.familyId; }
  const requestedNext = validateLiffNext(body.next);
  console.log(JSON.stringify({stage:'LIFF_LOGIN_POST',provider:'LINE',has_next:Boolean(requestedNext),flow:Boolean(body.google_home),member_present:Boolean(member)}));
  const response = json({ok:true,redirect:member?(requestedNext || '/app/index.php'):'/family/create.php'});
  console.log(JSON.stringify({stage:'LIFF_SESSION_COMMITTED',provider:'LINE',member_present:Boolean(member)}));
  return commitSession(response,ctx.session,ctx.env.APP_SECRET);
}
