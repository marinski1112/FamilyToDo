import baseWorker from './index';
import { makeContext } from './app';

const CONTINUE_COOKIE = 'family_google_home_continue';
const CONTINUE_SECONDS = 10 * 60;

type ContinuePayload = {
  path: string;
  exp: number;
};

function b64url(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', '');
}

function unb64url(value: string): Uint8Array {
  const normalized = value.replaceAll('-', '+').replaceAll('_', '/').padEnd(Math.ceil(value.length / 4) * 4, '=');
  const binary = atob(normalized);
  return Uint8Array.from(binary, ch => ch.charCodeAt(0));
}

async function continueKey(secret: string): Promise<CryptoKey> {
  const raw = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`wave117-google-home:${secret}`));
  return crypto.subtle.importKey('raw', raw, 'AES-GCM', false, ['encrypt', 'decrypt']);
}

function safeContinuePath(value: unknown): string | null {
  const path = String(value ?? '');
  if (!path || path.length > 2048) return null;
  if (!/^\/oauth\/google\/authorize(?:\?|$)/.test(path)) return null;
  if (!/^\/(?!\/)[^\r\n\\]*$/.test(path)) return null;
  return path;
}

async function sealContinue(path: string, secret: string): Promise<string> {
  const key = await continueKey(secret);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const payload: ContinuePayload = { path, exp: Date.now() + CONTINUE_SECONDS * 1000 };
  const data = new TextEncoder().encode(JSON.stringify(payload));
  const encrypted = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, data));
  return `${b64url(iv)}.${b64url(encrypted)}`;
}

async function openContinue(token: string, secret: string): Promise<string | null> {
  try {
    const [ivPart, dataPart] = String(token || '').split('.', 2);
    if (!ivPart || !dataPart) return null;
    const key = await continueKey(secret);
    const plaintext = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: unb64url(ivPart) },
      key,
      unb64url(dataPart),
    );
    const parsed = JSON.parse(new TextDecoder().decode(plaintext)) as ContinuePayload;
    if (!parsed || Number(parsed.exp) < Date.now()) return null;
    return safeContinuePath(parsed.path);
  } catch {
    return null;
  }
}

function cookieValue(request: Request, name: string): string {
  const header = request.headers.get('cookie') || '';
  for (const part of header.split(';')) {
    const [key, ...rest] = part.trim().split('=');
    if (key === name) return rest.join('=');
  }
  return '';
}

function continueCookie(token: string): string {
  return `${CONTINUE_COOKIE}=${token}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${CONTINUE_SECONDS}`;
}

function clearContinueCookie(): string {
  return `${CONTINUE_COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`;
}

function redirectResponse(request: Request, target: string, cookie?: string): Response {
  const destination = new URL(target, request.url);
  const headers = new Headers({ Location: destination.toString(), 'Cache-Control': 'no-store' });
  if (cookie) headers.append('Set-Cookie', cookie);
  return new Response(null, { status: 302, headers });
}

function safeJsonForHtml(value: unknown): string {
  return JSON.stringify(value)
    .replaceAll('<', '\\u003c')
    .replaceAll('>', '\\u003e')
    .replaceAll('&', '\\u0026');
}

function liffPage(env: Env, resumeToken: string): Response {
  const payload = safeJsonForHtml({
    liffId: String(env.LINE_LIFF_ID || ''),
    resume: resumeToken,
  });
  const html = `<!doctype html>
<html lang="ja">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="light">
<title>LINE認証 - Family TODO LINE</title>
<style>
body{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;margin:0;background:#f7f7fb;color:#222}
.wrap{max-width:560px;margin:0 auto;padding:24px 16px}
.card{background:#fff;border-radius:16px;padding:22px;box-shadow:0 1px 5px #0001}
.meta{color:#666}.error{color:#b42318;white-space:pre-wrap}
button{font:inherit;padding:10px 16px;border:0;border-radius:10px;background:#4f46e5;color:#fff}
</style>
</head>
<body>
<div class="wrap"><div class="card">
<h1>Family TODO LINE</h1>
<p id="status" class="meta">LINE認証を準備しています…</p>
<div id="error" class="error" hidden></div>
<button id="retry" type="button" hidden>再試行</button>
</div></div>
<script src="https://static.line-scdn.net/liff/edge/2/sdk.js"></script>
<script type="application/json" id="wave117Payload">${payload}</script>
<script>
(()=>{
'use strict';
const payloadEl=document.getElementById('wave117Payload');
const status=document.getElementById('status');
const error=document.getElementById('error');
const retry=document.getElementById('retry');
let payload={};
try{payload=JSON.parse(payloadEl?.textContent||'{}')}catch{}
const resume=String(payload.resume||'');
const resumeQuery=resume?'?resume='+encodeURIComponent(resume):'';
const setError=(message)=>{
  if(status)status.textContent='認証に失敗しました。';
  if(error){error.textContent=String(message||'認証に失敗しました。');error.hidden=false;}
  if(retry)retry.hidden=false;
};
async function run(){
  try{
    if(retry)retry.hidden=true;
    if(error)error.hidden=true;
    if(!window.liff)throw new Error('LIFF SDKを読み込めませんでした。');
    const liffId=String(payload.liffId||'');
    if(!liffId)throw new Error('LIFF IDが設定されていません。');
    if(status)status.textContent='LINEを初期化しています…';
    await window.liff.init({liffId});
    if(!window.liff.isLoggedIn()){
      if(status)status.textContent='LINEログインを開始します…';
      window.liff.login({redirectUri:location.origin+'/liff'+resumeQuery});
      return;
    }
    if(status)status.textContent='認証情報を確認しています…';
    const idToken=window.liff.getIDToken();
    if(!idToken)throw new Error('LINE IDトークンを取得できませんでした。');
    const response=await fetch('/app/api/liff_login.php',{
      method:'POST',
      headers:{'Content-Type':'application/json','Accept':'application/json'},
      credentials:'same-origin',
      body:JSON.stringify({id_token:idToken})
    });
    const data=await response.json().catch(()=>null);
    if(!response.ok||!data?.ok)throw new Error(data?.error||('LINEログインに失敗しました（HTTP '+response.status+'）。'));
    if(status)status.textContent='ログインしました。連携画面へ戻ります…';
    if(String(data.redirect||'')==='/family/create.php'){
      location.replace('/family/create.php');
      return;
    }
    location.replace('/oauth/google/continue'+resumeQuery);
  }catch(e){
    setError(e&&e.message?e.message:String(e));
  }
}
if(retry)retry.addEventListener('click',run);
run();
})();
</script>
</body>
</html>`;
  return new Response(html, {
    status: 200,
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'no-store',
    },
  });
}

async function continuationToken(request: Request, env: Env): Promise<string> {
  const url = new URL(request.url);
  const queryToken = String(url.searchParams.get('resume') || '');
  if (queryToken && await openContinue(queryToken, String(env.APP_SECRET || ''))) return queryToken;
  const cookieToken = cookieValue(request, CONTINUE_COOKIE);
  if (cookieToken && await openContinue(cookieToken, String(env.APP_SECRET || ''))) return cookieToken;
  return '';
}

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);

    // Google Home OAuth validation remains owned by the existing Wave116 handler.
    // We only intercept its already-validated "login required" redirect and preserve
    // the exact same-origin authorize continuation across the LINE/LIFF app switch.
    if (url.pathname === '/oauth/google/authorize' && request.method === 'GET') {
      const existing = await baseWorker.fetch(request, env, ctx);
      if (existing.status !== 302) return existing;

      const location = existing.headers.get('location') || '';
      const login = new URL(location || '/login.php', request.url);
      if (login.origin !== url.origin || login.pathname !== '/login.php') return existing;

      const continuePath = safeContinuePath(login.searchParams.get('next'));
      if (!continuePath) return existing;

      const token = await sealContinue(continuePath, String(env.APP_SECRET || ''));
      console.log(JSON.stringify({
        category: 'GOOGLE_HOME_AUTH_CONTINUE_STORED',
        provider: 'GOOGLE_HOME',
        result: 'success',
      }));
      return redirectResponse(request, `/liff?resume=${encodeURIComponent(token)}`, continueCookie(token));
    }

    if (url.pathname === '/liff' || url.pathname === '/liff/') {
      const token = await continuationToken(request, env);
      const context = await makeContext(request, env);
      if (context.member) {
        return redirectResponse(
          request,
          token ? `/oauth/google/continue?resume=${encodeURIComponent(token)}` : '/app/index.php',
        );
      }
      return liffPage(env, token);
    }

    if (url.pathname === '/oauth/google/continue') {
      const token = await continuationToken(request, env);
      const path = token ? await openContinue(token, String(env.APP_SECRET || '')) : null;
      const context = await makeContext(request, env);

      if (!context.member) {
        return redirectResponse(
          request,
          token ? `/liff?resume=${encodeURIComponent(token)}` : '/liff',
        );
      }

      if (!path) {
        return redirectResponse(request, '/app/index.php', clearContinueCookie());
      }

      console.log(JSON.stringify({
        category: 'GOOGLE_HOME_AUTH_CONTINUE_RESUMED',
        family_id: context.member.family_id,
        member_id: context.member.id,
        provider: 'GOOGLE_HOME',
        result: 'success',
      }));
      return redirectResponse(request, path, clearContinueCookie());
    }

    // Everything else stays on the canonical Wave116 implementation.
    return baseWorker.fetch(request, env, ctx);
  },

  async scheduled(controller: ScheduledController, env: Env, ctx: ExecutionContext): Promise<void> {
    await baseWorker.scheduled(controller, env, ctx);
  },
};
