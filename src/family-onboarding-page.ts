import type { AppContext } from './app-context';
import { layout } from './app-shell';
import { html } from './response';
import { APP_VERSION } from './version';

const esc = (v: unknown) => String(v ?? '')
  .replaceAll('&','&amp;')
  .replaceAll('<','&lt;')
  .replaceAll('>','&gt;')
  .replaceAll('"','&quot;')
  .replaceAll("'",'&#39;');

/** Canonical server-rendered family create/join onboarding page. */
export async function createFamilyPage(ctx: AppContext): Promise<Response> {
  const body=`<div class="card"><h1>家族を作成</h1><p class="meta">LINEアカウント：${esc(ctx.session.lineDisplayName||'')}</p><div id="familyActionError" class="error" style="display:none"></div><form id="familyCreate" data-family-endpoint="/api/family/create"><label>家族名</label><input name="family_name" maxlength="255" required placeholder="例：田中家"><label>あなたの名前</label><input name="member_name" maxlength="255" value="${esc(ctx.session.lineDisplayName||'')}" required><button type="submit">家族を作成する</button></form><hr><p>既存の家族に参加する場合は家族コードを入力してください。</p><form id="familyJoin" data-family-endpoint="/api/family/join"><label>家族コード</label><input name="family_code" maxlength="32" required><label>あなたの名前</label><input name="member_name" value="${esc(ctx.session.lineDisplayName||'')}" required><button type="submit">家族に参加する</button></form></div><script src="/assets/family-onboarding.js?v=${APP_VERSION}"></script>`;
  return html(layout('家族を作成',body));
}
