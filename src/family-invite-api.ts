import type { AppContext } from './app-context';
import { lineOfficialAccountInfo } from './line-official-account';
import { bodyJson, RequestBodyParseError } from './request-body';
import { json } from './response';

type Row = Record<string, unknown>;

const nowJst = () => new Intl.DateTimeFormat('sv-SE', {
  timeZone: 'Asia/Tokyo', year: 'numeric', month: '2-digit', day: '2-digit',
  hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
}).format(new Date()).replace(' ', 'T').replace('T', ' ');

const familyLogSubjectKind = (value: unknown): string => {
  const kind = String(value || 'ADULT').toUpperCase();
  return ['BABY', 'CHILD', 'ADULT', 'PET', 'OTHER'].includes(kind) ? kind : 'OTHER';
};

const authRequired = () => json({ ok: false, error: 'ログインが必要です。', code: 'AUTH_REQUIRED' }, 401);
const badRequest = (message: string) => json({ ok: false, error: message || '入力内容が不正です。', code: 'BAD_REQUEST' }, 400);
const forbidden = (message: string) => json({ ok: false, error: message || 'この操作は許可されていません。', code: 'FORBIDDEN' }, 403);

async function logInviteActivity(
  ctx: AppContext,
  action: string,
  targetType: 'family_invitation' | 'family_log_subject',
  targetId: number | null,
  metadata: Row = {},
): Promise<void> {
  const member = ctx.member;
  if (!member) return;
  try {
    await ctx.env.DB.prepare(
      'INSERT INTO activity_logs(family_id,member_id,action,target_type,target_id,metadata,occurred_at) VALUES(?,?,?,?,?,?,?)',
    ).bind(
      member.family_id,
      member.id,
      action,
      targetType,
      targetId,
      JSON.stringify(metadata),
      nowJst(),
    ).run();
  } catch (error) {
    console.error('[Family TODO LINE] activity log', error);
  }
}

/** Canonical family invitation create/revoke API independent from the legacy app.ts monolith. */
export async function inviteCreate(request: Request, ctx: AppContext): Promise<Response> {
  const m = ctx.member;
  if (!m) return authRequired();
  if (request.method !== 'POST') return json({ ok: false, error: 'POST only' }, 405);

  let b: Record<string, unknown>;
  try {
    b = await bodyJson(request);
  } catch (error) {
    if (error instanceof RequestBodyParseError) return badRequest(error.message);
    throw error;
  }

  if (!ctx.session.csrfToken) ctx.session.csrfToken = crypto.randomUUID();
  if (typeof b.csrf !== 'string' || b.csrf !== ctx.session.csrfToken) return forbidden('CSRF検証に失敗しました。');

  const role = String(m.role || '').toUpperCase();
  if (role !== 'OWNER' && role !== 'ADMIN') return json({ ok: false, error: '管理者権限が必要です。' }, 403);

  const action = String(b.action || 'create');
  if (action === 'revoke') {
    const id = Number(b.id || 0);
    if (!id) return json({ ok: false, error: '招待IDが不正です。' }, 400);
    const inv = await ctx.env.DB.prepare(
      'SELECT id,used_at,family_log_subject_id FROM family_invitations WHERE id=? AND family_id=? LIMIT 1',
    ).bind(id, m.family_id).first<Row>();
    if (!inv) return json({ ok: false, error: '招待が見つかりません。' }, 404);
    if (inv.used_at) return json({ ok: false, error: '使用済みの招待は取り消せません。' }, 400);
    const now = nowJst();
    await ctx.env.DB.prepare(
      'UPDATE family_invitations SET expires_at=? WHERE id=? AND family_id=? AND used_at IS NULL',
    ).bind(now, id, m.family_id).run();
    await logInviteActivity(ctx, 'REVOKED', 'family_invitation', id, {
      family_log_subject_id: Number(inv.family_log_subject_id || 0) || null,
    });
    return json({ ok: true, id });
  }

  if (action !== 'create') return json({ ok: false, error: '操作が不正です。' }, 400);

  const subjectId = Number(b.subject_id || 0) || 0;
  let subject: Row | undefined;
  if (subjectId) {
    subject = await ctx.env.DB.prepare(
      'SELECT id,name,subject_kind,member_id FROM family_log_subjects WHERE id=? AND family_id=? AND active=1 LIMIT 1',
    ).bind(subjectId, m.family_id).first<Row>() || undefined;
    if (!subject) return json({ ok: false, error: '本登録する家族ログ対象が見つかりません。' }, 404);
    if (Number(subject.member_id || 0) > 0) return json({ ok: false, error: 'この対象はすでに家族メンバーへ本登録済みです。' }, 409);
    if (!['BABY', 'CHILD', 'ADULT'].includes(familyLogSubjectKind(subject.subject_kind))) {
      return json({ ok: false, error: 'この対象タイプはLINE本登録の対象外です。' }, 400);
    }
  }

  const expiresDays = Math.min(30, Math.max(1, Number(b.expires_days || 7)));
  const token = `${crypto.randomUUID().replaceAll('-', '')}${crypto.randomUUID().replaceAll('-', '')}`;
  const hashBuf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token));
  const tokenHash = Array.from(new Uint8Array(hashBuf)).map(v => v.toString(16).padStart(2, '0')).join('');
  const expiresDate = new Date(Date.now() + expiresDays * 86400000);
  const expires = new Intl.DateTimeFormat('sv-SE', {
    timeZone: 'Asia/Tokyo', year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
  }).format(expiresDate);
  const now = nowJst();

  if (subjectId) {
    await ctx.env.DB.prepare(
      'UPDATE family_invitations SET expires_at=? WHERE family_id=? AND family_log_subject_id=? AND used_at IS NULL AND expires_at>?',
    ).bind(now, m.family_id, subjectId, now).run();
  }

  const inserted = await ctx.env.DB.prepare(
    'INSERT INTO family_invitations(family_id,token_hash,created_by,expires_at,created_at,family_log_subject_id) VALUES(?,?,?,?,?,?)',
  ).bind(m.family_id, tokenHash, m.id, expires, now, subjectId || null).run();
  const invitationId = Number(inserted.meta.last_row_id || 0);
  const base = (ctx.env.APP_URL || new URL(ctx.request.url).origin).replace(/\/$/, '');
  const official = await lineOfficialAccountInfo(ctx.env);

  await logInviteActivity(ctx, 'CREATED', 'family_invitation', invitationId, {
    expires_at: expires,
    family_log_subject_id: subjectId || null,
    subject_name: String(subject?.name || ''),
  });
  if (subjectId) {
    await logInviteActivity(ctx, 'INVITED', 'family_log_subject', subjectId, {
      invitation_id: invitationId,
      expires_at: expires,
    });
  }

  return json({
    ok: true,
    token,
    expires_at: expires,
    url: `${base}/family/join.php?token=${encodeURIComponent(token)}`,
    official_account: official,
    subject: subjectId ? {
      id: subjectId,
      name: String(subject?.name || ''),
      subject_kind: familyLogSubjectKind(subject?.subject_kind),
    } : null,
  });
}
