import type { AppContext } from './app-context';
import { json } from './response';

export async function authHealth(ctx: AppContext): Promise<Response> {
  return json({
    ok: true,
    cookie_session: Boolean(ctx.session && ctx.session.iat),
    line_user_id_present: Boolean(ctx.session.lineUserId),
    member_id_present: Boolean(ctx.session.memberId),
    family_id_present: Boolean(ctx.session.familyId),
    csrf_present: Boolean(ctx.session.csrfToken),
    member_exists: Boolean(ctx.member),
    member_active: Boolean(ctx.member?.active),
  });
}
