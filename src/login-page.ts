import { layout } from './app-shell';
import { validateLiffNext } from './liff-target';
import { html } from './response';

/** Retained login page independent from the legacy app.ts monolith. */
export function loginPage(env: Env, nextPath = '/app/index.php'): Response {
  const safeNext=validateLiffNext(nextPath)||'/app/index.php';
  const payload=JSON.stringify({
    liffId:String(env.LINE_LIFF_ID||''),
    next:safeNext,
    loginRedirect:`/liff?next=${encodeURIComponent(safeNext)}`,
  }).replaceAll('<','\\u003c').replaceAll('>','\\u003e').replaceAll('&','\\u0026');
  const body = `<div class="card liff-entry"><h1>Family TODO LINE</h1><p>LINE認証を開始します。</p><p id="status" class="meta">認証を準備しています…</p><div id="error" class="error" style="display:none"></div><button id="retry" style="display:none" class="btn" type="button">再試行</button></div><script src="https://static.line-scdn.net/liff/edge/2/sdk.js"></script><script type="application/json" id="liffAuthPayload">${payload}</script><script src="/assets/liff-auth.js?v=12.147.0-wave128"></script>`;
  return html(layout('LINE認証',body));
}
