import { layout } from './app-shell';
import { validateLiffNext } from './liff-target';
import { html } from './response';
import { APP_VERSION } from './version';

/** Retained LIFF entry page independent from the legacy app.ts monolith. */
export function liffEntryPage(env: Env, options: {next?: string; loginRedirect?: string} = {}): Response {
  const safeNext = validateLiffNext(options.next) || '/app/index.php';
  const loginRedirect = /^\/liff(?:\/[^?\r\n\\]*)?(?:\?[^\r\n\\]*)?$/.test(options.loginRedirect || '') ? options.loginRedirect : '/liff';
  const payload=JSON.stringify({liffId:String(env.LINE_LIFF_ID||''),next:safeNext,loginRedirect}).replaceAll('<','\\u003c').replaceAll('>','\\u003e').replaceAll('&','\\u0026');
  const body = `<div class="card liff-entry"><h1>Family TODO LINE</h1><p id="status" class="meta">LINE認証を準備しています…</p><div id="error" class="error" style="display:none"></div><button id="retry" style="display:none" class="btn" type="button">再試行</button></div><script src="https://static.line-scdn.net/liff/edge/2/sdk.js"></script><script type="application/json" id="liffAuthPayload">${payload}</script><script src="/assets/liff-auth.js?v=${APP_VERSION}"></script>`;
  return html(layout('LINE認証',body));
}
