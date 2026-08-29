export * from './google-calendar-core';

import { json } from './response';
import type { AppContext } from './app';
import { DEFAULT_FAMILY_TIMEZONE, utcNow } from './timezone';
import {
  CALENDAR_MAX_RETRIES,
  applyInbound,
  calendarBackfill as coreCalendarBackfill,
  decryptRefreshToken,
  integrationsSettings as coreIntegrationsSettings,
  processCalendarOutbox as coreProcessCalendarOutbox,
} from './google-calendar-core';

type Row = Record<string, unknown>;
const PROVIDER = 'GOOGLE_CALENDAR';
const PAGE_PREFIX = 'PAGE:';
const INBOUND_PAGE_SIZE = 25;
const OUTBOX_LIMIT = 20;
const now = () => utcNow();
const syncLeases = new Map<number, Promise<number>>();

class GoogleError extends Error {
  constructor(public status: number) {
    super(`Google Calendar HTTP ${status}`);
  }
}

async function googleApi(path: string, access: string, init?: RequestInit) {
  const response = await fetch(`https://www.googleapis.com/calendar/v3${path}`, {
    ...init,
    headers: {
      authorization: `Bearer ${access}`,
      'content-type': 'application/json',
      ...(init?.headers || {}),
    },
  });
  if (!response.ok) throw new GoogleError(response.status);
  return response.status === 204 ? {} : response.json();
}

async function accessToken(env: Env, account: Row) {
  const refresh = await decryptRefreshToken(String(account.refresh_token_ciphertext), env.GOOGLE_CALENDAR_TOKEN_KEY!);
  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: env.GOOGLE_CALENDAR_CLIENT_ID!,
      client_secret: env.GOOGLE_CALENDAR_CLIENT_SECRET!,
      refresh_token: refresh,
      grant_type: 'refresh_token',
    }),
  });
  if (!response.ok) {
    const body = await response.text();
    if (response.status === 400 && body.includes('invalid_grant')) throw new Error('REAUTH_REQUIRED');
    throw new Error('token refresh failed');
  }
  return String((await response.json() as { access_token?: string }).access_token || '');
}

function encodePageState(syncToken: string, pageToken: string) {
  return PAGE_PREFIX + btoa(JSON.stringify({ syncToken, pageToken }));
}

function decodePageState(raw: string) {
  if (!raw.startsWith(PAGE_PREFIX)) return { syncToken: raw, pageToken: '' };
  try {
    const parsed = JSON.parse(atob(raw.slice(PAGE_PREFIX.length))) as { syncToken?: string; pageToken?: string };
    return { syncToken: String(parsed.syncToken || ''), pageToken: String(parsed.pageToken || '') };
  } catch {
    return { syncToken: '', pageToken: '' };
  }
}

async function syncCalendarAccountPage(env: Env, account: Row) {
  const state = await env.DB.prepare('SELECT sync_token FROM calendar_sync_state WHERE family_id=? AND provider=? AND calendar_id=?')
    .bind(account.family_id, PROVIDER, account.calendar_id).first<Row>();
  let { syncToken, pageToken } = decodePageState(String(state?.sync_token || ''));
  const token = await accessToken(env, account);

  let data: any;
  for (let attempt = 0; attempt < 2; attempt++) {
    const query = new URLSearchParams({ singleEvents: 'true', showDeleted: 'true', maxResults: String(INBOUND_PAGE_SIZE) });
    if (syncToken) query.set('syncToken', syncToken);
    if (pageToken) query.set('pageToken', pageToken);
    try {
      data = await googleApi(`/calendars/${encodeURIComponent(String(account.calendar_id))}/events?${query}`, token);
      break;
    } catch (error) {
      if (attempt === 0 && error instanceof GoogleError && error.status === 410 && syncToken) {
        syncToken = '';
        pageToken = '';
        await env.DB.prepare('UPDATE calendar_sync_state SET sync_token=NULL,updated_at=? WHERE family_id=? AND provider=? AND calendar_id=?')
          .bind(now(), account.family_id, PROVIDER, account.calendar_id).run();
        continue;
      }
      throw error;
    }
  }
  if (!data) throw new Error('calendar page unavailable');

  let received = 0;
  for (const event of data.items || []) received += await applyInbound(env, account, event);

  const nextPageToken = String(data.nextPageToken || '');
  const n = now();
  if (nextPageToken) {
    await env.DB.prepare(`INSERT INTO calendar_sync_state(family_id,provider,calendar_id,sync_token,last_synced_at,updated_at)
      VALUES(?,?,?,?,NULL,?)
      ON CONFLICT(family_id,provider,calendar_id) DO UPDATE SET sync_token=excluded.sync_token,updated_at=excluded.updated_at`)
      .bind(account.family_id, PROVIDER, account.calendar_id, encodePageState(syncToken, nextPageToken), n).run();
    await env.DB.prepare('UPDATE external_calendar_accounts SET last_error=NULL,updated_at=? WHERE id=?').bind(n, account.id).run();
    return { received, more: true };
  }

  const nextSyncToken = String(data.nextSyncToken || '');
  if (!nextSyncToken) throw new Error('missing nextSyncToken');
  await env.DB.prepare(`INSERT INTO calendar_sync_state(family_id,provider,calendar_id,sync_token,last_synced_at,updated_at)
    VALUES(?,?,?,?,?,?)
    ON CONFLICT(family_id,provider,calendar_id) DO UPDATE SET sync_token=excluded.sync_token,last_synced_at=excluded.last_synced_at,updated_at=excluded.updated_at`)
    .bind(account.family_id, PROVIDER, account.calendar_id, nextSyncToken, n, n).run();
  await env.DB.prepare('UPDATE external_calendar_accounts SET last_synced_at=?,last_error=NULL,updated_at=? WHERE id=?').bind(n, n, account.id).run();
  return { received, more: false };
}

export async function syncCalendarAccount(env: Env, account: Row) {
  const id = Number(account.family_id);
  const running = syncLeases.get(id);
  if (running) return running;
  const work = syncCalendarAccountPage(env, account).then(result => result.received);
  syncLeases.set(id, work);
  try {
    return await work;
  } finally {
    if (syncLeases.get(id) === work) syncLeases.delete(id);
  }
}

export async function processCalendarInbound(env: Env, limit = 10, familyId?: number) {
  const result = { received: 0, errors: 0, more: false };
  const familyFilter = familyId ? ' AND a.family_id=?' : '';
  const accounts = await env.DB.prepare(`SELECT a.*,f.timezone FROM external_calendar_accounts a JOIN families f ON f.id=a.family_id
    WHERE a.provider=? AND a.status='ACTIVE' AND a.calendar_id IS NOT NULL${familyFilter}
    ORDER BY COALESCE(a.last_synced_at,'') LIMIT ?`)
    .bind(...(familyId ? [PROVIDER, familyId, Math.min(limit, 1)] : [PROVIDER, Math.min(limit, 1)])).all<Row>();
  for (const account of accounts.results) {
    try {
      const page = await syncCalendarAccountPage(env, account);
      result.received += page.received;
      result.more ||= page.more;
    } catch (error) {
      result.errors++;
      const message = String(error instanceof Error ? error.message : error);
      await env.DB.prepare("UPDATE external_calendar_accounts SET status=CASE WHEN ?='REAUTH_REQUIRED' THEN 'REVOKED' ELSE status END,last_error=?,updated_at=? WHERE id=?")
        .bind(message, message.slice(0, 500), now(), account.id).run().catch(() => {});
    }
  }
  return result;
}

export async function processCalendarOutbox(env: Env, limit = 10, familyId?: number) {
  return coreProcessCalendarOutbox(env, Math.min(Math.max(1, limit), OUTBOX_LIMIT), familyId);
}

export async function calendarSyncNow(request: Request, ctx: AppContext) {
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
  const incoming = await processCalendarInbound(ctx.env, 1, familyId);
  const pendingAfter = await pendingCount();
  const errors = outgoing.errors + incoming.errors;
  const more = pendingAfter > 0 || incoming.more;
  const unchanged = outgoing.sent === 0 && incoming.received === 0 && errors === 0 && !more;
  return json({
    ok: errors === 0,
    sent: outgoing.sent,
    received: incoming.received,
    unchanged,
    errors,
    pending_before: pendingBefore,
    pending_after: pendingAfter,
    inbound_more: incoming.more,
    more,
    batch_size: { outbound: OUTBOX_LIMIT, inbound: INBOUND_PAGE_SIZE },
  });
}

export async function calendarBackfill(request: Request, ctx: AppContext) {
  const forwarded = request.clone();
  if (!ctx.member) return json({ ok: false }, 401);
  const role = String(ctx.member.role || '').toUpperCase();
  if (!['OWNER', 'ADMIN'].includes(role)) return json({ ok: false }, 403);
  if (request.method !== 'POST') return json({ ok: false }, 405);
  const body = await request.json().catch(() => ({})) as Record<string, unknown>;
  if (String(body.csrf || '') !== String(ctx.session.csrfToken || '')) return json({ ok: false }, 403);
  const action = String(body.action || 'preview');
  if (action === 'diagnose_projection' || action === 'rebind_projection' || String(body.scope || 'normal') !== 'event_history') {
    return coreCalendarBackfill(forwarded, ctx);
  }

  const familyId = ctx.member.family_id;
  const count = Number((await ctx.env.DB.prepare("SELECT COUNT(*) c FROM tasks WHERE family_id=? AND task_kind='EVENT' AND visibility_scope='FAMILY' AND calendar_visible=1 AND recurrence_rule IS NULL AND (start_at IS NOT NULL OR due_at IS NOT NULL)")
    .bind(familyId).first<Row>())?.c || 0);
  if (action !== 'enqueue') return json({ ok: true, target_count: count, enqueued: 0, scope: 'event_history', paged: true, policy: '全履歴のFAMILY EVENT（PRIVATEは除外）' });

  const n = now();
  const result = await ctx.env.DB.prepare(`INSERT INTO calendar_sync_outbox(family_id,task_id,provider,operation,status,next_retry_at,created_at,updated_at)
    SELECT t.family_id,t.id,?,
      CASE WHEN EXISTS(SELECT 1 FROM external_calendar_links l WHERE l.family_id=t.family_id AND l.provider=? AND l.task_id=t.id AND l.deleted_at IS NULL) THEN 'UPDATE' ELSE 'CREATE' END,
      'PENDING',?,?,?
    FROM tasks t
    WHERE t.family_id=? AND t.task_kind='EVENT' AND t.visibility_scope='FAMILY' AND t.calendar_visible=1 AND t.recurrence_rule IS NULL AND (t.start_at IS NOT NULL OR t.due_at IS NOT NULL)
    ON CONFLICT(provider,task_id) DO UPDATE SET
      operation=CASE WHEN calendar_sync_outbox.operation='CREATE' THEN 'CREATE' ELSE excluded.operation END,
      status='PENDING',retry_count=0,next_retry_at=excluded.next_retry_at,last_error=NULL,updated_at=excluded.updated_at`)
    .bind(PROVIDER, PROVIDER, n, n, n, familyId).run();
  return json({ ok: true, target_count: count, enqueued: Number(result.meta.changes || 0), scope: 'event_history', paged: true, policy: '全履歴のFAMILY EVENT（PRIVATEは除外）' });
}

export async function integrationsSettings(request: Request, ctx: AppContext) {
  const response = await coreIntegrationsSettings(request, ctx);
  const type = response.headers.get('content-type') || '';
  if (!type.includes('text/html')) return response;
  let source = await response.text();
  const enhancement = `<style>.calendar-backfill-limit{display:none!important}</style><script>(()=>{const clean=()=>document.querySelectorAll('.calendar-backfill-limit').forEach(el=>el.remove());clean();new MutationObserver(clean).observe(document.body,{childList:true,subtree:true});const history=document.getElementById('calendarHistoryBackfill');if(history&&!document.getElementById('calendarBatchNote')){const note=document.createElement('div');note.id='calendarBatchNote';note.className='small';note.textContent='全履歴EVENTは全件キュー登録できます。Google APIへの送受信はWorker上限を避けるため小分けで処理します。';history.insertAdjacentElement('afterend',note)}const old=document.getElementById('calendarSync');if(old){const button=old.cloneNode(true);old.replaceWith(button);button.addEventListener('click',async()=>{const out=document.getElementById('calendarResult');button.disabled=true;try{const r=await fetch('/api/google-calendar/sync',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({csrf})});const d=await r.json().catch(()=>({ok:false,error:'応答を解析できません'}));if(!r.ok||d.ok===false)throw new Error(d.error||('HTTP '+r.status));out.textContent=d.unchanged?'変更はありません':('送信 '+d.sent+'件 / 受信 '+d.received+'件 / エラー '+d.errors+'件'+(d.more?' / 続きあり（もう一度押してください）':''));}catch(error){out.textContent='同期失敗: '+(error instanceof Error?error.message:String(error));}finally{button.disabled=false}})}})();</script>`;
  source = source.replace('</body>', `${enhancement}</body>`);
  const headers = new Headers(response.headers);
  headers.delete('content-length');
  return new Response(source, { status: response.status, statusText: response.statusText, headers });
}

export async function calendarWatchWebhook(request: Request, env: Env, executionContext: ExecutionContext) {
  if (request.method !== 'POST') return new Response(null, { status: 405 });
  const channel = request.headers.get('X-Goog-Channel-ID') || '';
  const resource = request.headers.get('X-Goog-Resource-ID') || '';
  const token = request.headers.get('X-Goog-Channel-Token') || '';
  if (!channel || !resource || !token) return new Response(null, { status: 400 });
  const row = await env.DB.prepare("SELECT * FROM external_calendar_watch_channels WHERE channel_id=? AND resource_id=? AND status='ACTIVE'").bind(channel, resource).first<Row>();
  if (!row) return new Response(null, { status: 403 });
  const expected = String(row.token_hash || '');
  const actual = [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token)))].map(x => x.toString(16).padStart(2, '0')).join('');
  if (expected !== actual) return new Response(null, { status: 403 });
  await env.DB.prepare('UPDATE external_calendar_watch_channels SET last_notification_at=?,updated_at=? WHERE id=?').bind(now(), now(), row.id).run();
  executionContext.waitUntil(processCalendarInbound(env, 1, Number(row.family_id)));
  return new Response(null, { status: 204 });
}
