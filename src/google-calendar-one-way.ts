import { json } from './response';
import type { AppContext } from './app';
import { CALENDAR_MAX_RETRIES } from './google-calendar-core';
import { processCalendarOutbox } from './google-calendar';
import { utcNow } from './timezone';

type Row = Record<string, unknown>;
const PROVIDER = 'GOOGLE_CALENDAR';
const OUTBOX_LIMIT = 20;
const now = () => utcNow();

export async function calendarSyncOutboundOnly(request: Request, ctx: AppContext) {
  if (!ctx.member) return json({ ok: false, error: '認証が必要です' }, 401);
  const role = String(ctx.member.role || '').toUpperCase();
  if (role !== 'OWNER' && role !== 'ADMIN') return json({ ok: false, error: '管理者権限が必要です' }, 403);
  if (request.method !== 'POST') return json({ ok: false, error: 'POST only' }, 405);
  const body = await request.json().catch(() => ({})) as Record<string, unknown>;
  if (String(body.csrf || '') !== String(ctx.session.csrfToken || '')) return json({ ok: false, error: 'CSRF検証に失敗しました' }, 403);

  const familyId = ctx.member.family_id;
  const pendingCount = async () => Number((await ctx.env.DB.prepare("SELECT COUNT(*) c FROM calendar_sync_outbox WHERE family_id=? AND provider=? AND status IN ('PENDING','ERROR') AND retry_count<?")
    .bind(familyId, PROVIDER, CALENDAR_MAX_RETRIES).first<Row>())?.c || 0);
  const pendingBefore = await pendingCount();
  const outgoing = await processCalendarOutbox(ctx.env, OUTBOX_LIMIT, familyId);
  const pendingAfter = await pendingCount();
  const errors = outgoing.errors;
  const more = pendingAfter > 0;
  const unchanged = outgoing.sent === 0 && errors === 0 && !more;
  return json({
    ok: errors === 0,
    sent: outgoing.sent,
    received: 0,
    unchanged,
    errors,
    pending_before: pendingBefore,
    pending_after: pendingAfter,
    inbound_more: false,
    more,
    batch_size: { outbound: OUTBOX_LIMIT, inbound: 0 },
  });
}

export async function calendarWatchNotificationOnly(request: Request, env: Env) {
  if (request.method !== 'POST') return new Response(null, { status: 405 });
  const channel = request.headers.get('X-Goog-Channel-ID') || '';
  const resource = request.headers.get('X-Goog-Resource-ID') || '';
  const token = request.headers.get('X-Goog-Channel-Token') || '';
  if (!channel || !resource || !token) return new Response(null, { status: 400 });
  const row = await env.DB.prepare("SELECT * FROM external_calendar_watch_channels WHERE channel_id=? AND resource_id=? AND status='ACTIVE'")
    .bind(channel, resource).first<Row>();
  if (!row) return new Response(null, { status: 403 });
  const expected = String(row.token_hash || '');
  const actual = [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token)))]
    .map(x => x.toString(16).padStart(2, '0')).join('');
  if (expected !== actual) return new Response(null, { status: 403 });
  await env.DB.prepare('UPDATE external_calendar_watch_channels SET last_notification_at=?,updated_at=? WHERE id=?')
    .bind(now(), now(), row.id).run();
  return new Response(null, { status: 204 });
}
