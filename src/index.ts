import { withDb, execute, query } from './db';
import { verifyLineIdToken } from './line';
import { openSession, commitSession, getSessionCookie } from './session';
import { verifyLineSignature } from './security';
import { html, json, redirect } from './response';
import type { CurrentMember, SessionData } from './types';

const PORTING_ROUTES = [
  '/', '/today.php', '/tomorrow.php', '/app/index.php', '/app/calendar.php',
  '/app/tasks.php', '/app/items.php', '/app/shopping.php', '/app/messages.php',
  '/app/settings.php', '/family/create.php', '/family/join.php', '/task/new.php',
  '/task/view.php', '/task/edit.php', '/item/new.php', '/item/edit.php',
];

async function memberFromSession(session: SessionData, env: Env): Promise<CurrentMember | null> {
  if (!session.memberId) return null;
  return withDb(env, async (db) => {
    const [rows] = await execute(
      db,
      'SELECT * FROM members WHERE id = ? AND active = 1 LIMIT 1',
      [session.memberId],
    );
    const member = Array.isArray(rows) && rows.length > 0 ? rows[0] as CurrentMember : null;
    return member;
  });
}

async function liffLogin(request: Request, env: Env, session: SessionData): Promise<Response> {
  if (request.method !== 'POST') return json({ ok: false, error: 'POST only' }, 405);
  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  const idToken = typeof body?.id_token === 'string' ? body.id_token.trim() : '';
  if (!idToken) return json({ ok: false, error: 'LINE IDトークンがありません。LIFFのopenid権限を確認してください。' }, 400);

  if (env.LINE_LIFF_ID && env.LINE_LIFF_ID.includes('-')) {
    const [liffChannelId] = env.LINE_LIFF_ID.split('-', 1);
    if (liffChannelId !== env.LINE_CHANNEL_ID) {
      return json({ ok: false, error: 'LINE Channel IDとLIFF IDの所属Channel IDが一致していません。' }, 500);
    }
  }

  const verified = await verifyLineIdToken(idToken, env.LINE_CHANNEL_ID).catch(() => null);
  if (!verified) return json({ ok: false, error: 'LINE IDトークンの検証に失敗しました。LINE DevelopersのLIFF/Channel設定を確認してください。' }, 401);

  session.lineUserId = verified.sub;
  session.lineDisplayName = typeof verified.name === 'string' ? verified.name : '';
  let target = '/family/create.php';

  try {
    const member = await withDb(env, async (db) => {
      const [rows] = await execute(
        db,
        'SELECT id, family_id, name FROM members WHERE line_user_id = ? AND active = 1 LIMIT 1',
        [verified.sub],
      );
      return Array.isArray(rows) && rows.length > 0 ? rows[0] as { id: number; family_id: number } : null;
    });
    if (member?.family_id) {
      session.memberId = Number(member.id);
      session.familyId = Number(member.family_id);
      target = '/app/index.php';
    }
  } catch (error) {
    console.error('LIFF member lookup failed', error);
  }

  const response = json({ ok: true, redirect: target });
  return commitSession(response, session, env.APP_SECRET);
}

async function webhook(request: Request, env: Env): Promise<Response> {
  const body = await request.text();
  const signature = request.headers.get('x-line-signature') ?? '';
  try {
    const valid = await verifyLineSignature(body, signature, env.LINE_CHANNEL_SECRET);
    if (!valid) {
      console.warn('[Family TODO LINE Webhook] invalid signature or empty body');
      return new Response('OK', { status: 200 });
    }
    const data = JSON.parse(body) as { events?: unknown[] };
    console.log('[Family TODO LINE Webhook] events=', data.events?.length ?? 0);
    // DB更新やPush Messageは、現行PHP版の挙動を確認しながらここへ段階的に移植する。
  } catch (error) {
    console.error('[Family TODO LINE Webhook]', error);
  }
  return new Response('OK', { status: 200, headers: { 'content-type': 'text/plain; charset=UTF-8' } });
}

function migrationHome(env: Env): Response {
  return html(`<!doctype html><html lang="ja"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Family TODO LINE - Cloudflare staging</title><link rel="stylesheet" href="/assets/family.css"></head><body><div class="wrap"><div class="card"><h1>Family TODO LINE</h1><p>Cloudflare移行用の土台です。現在はXREA版を変更せず、Cloudflare側で段階的に機能を移植します。</p><p><strong>Environment:</strong> ${escapeHtml(env.ENVIRONMENT)}</p><p><strong>Database:</strong> D1 binding configured</p><p><strong>LINE:</strong> Webhook / LIFF verify routes prepared</p></div></div></body></html>`);
}

function escapeHtml(value: string): string {
  return value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#039;');
}

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);
    const session = await openSession(getSessionCookie(request), env.APP_SECRET);

    if (url.pathname === '/__cf/health') {
      return json({ ok: true, service: 'familytodo-cloudflare', environment: env.ENVIRONMENT });
    }

    if (url.pathname === '/__cf/db-health') {
      try {
        const result = await withDb(env, async (db) => {
          const rows = await query(db, 'SELECT 1 AS ok');
          return rows;
        });
        return json({ ok: true, database: 'reachable', result });
      } catch (error) {
        console.error(error);
        return json({ ok: false, database: 'unreachable' }, 503);
      }
    }

    if (url.pathname === '/app/api/liff_login.php' || url.pathname === '/app/api/liff_login') {
      return liffLogin(request, env, session);
    }

    if (url.pathname === '/app/api/webhook.php' || url.pathname === '/app/api/webhook') {
      return webhook(request, env);
    }

    if (url.pathname === '/login.php' || url.pathname === '/login') {
      return json({ ok: true, mode: 'cloudflare-staging', next: 'LIFF client integration will be ported here', liff_id_configured: Boolean(env.LINE_LIFF_ID) });
    }

    if (PORTING_ROUTES.includes(url.pathname)) {
      const member = await memberFromSession(session, env).catch(() => null);
      return html(`<!doctype html><html lang="ja"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Migration placeholder</title><link rel="stylesheet" href="/assets/family.css"></head><body><div class="wrap"><div class="card"><h1>Cloudflare移行中</h1><p>このURLはv12.35から移植対象として確保済みです。</p><p>Path: <code>${escapeHtml(url.pathname)}</code></p><p>Member session: ${member ? 'authenticated' : 'not authenticated'}</p><p>画面本体は既存XREA版の機能を確認しながら順次移植します。</p></div></div></body></html>`);
    }

    return env.ASSETS.fetch(request);
  },

  async scheduled(controller: ScheduledController, env: Env, ctx: ExecutionContext): Promise<void> {
    console.log(`[Family TODO LINE] scheduled handler invoked: ${controller.cron}; notify_mode=${env.NOTIFY_MODE}`);
    // 現行版は notify_mode=manual のため、まだ自動通知処理を有効化しない。
  },
} satisfies ExportedHandler<Env>;
