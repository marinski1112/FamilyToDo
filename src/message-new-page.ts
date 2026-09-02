import type { AppContext } from './app-context';
import { layout } from './app-shell';
import { html, redirect } from './response';
import { APP_VERSION } from './version';

type Row = Record<string, unknown>;

const esc = (v: unknown) => String(v ?? '')
  .replaceAll('&','&amp;')
  .replaceAll('<','&lt;')
  .replaceAll('>','&gt;')
  .replaceAll('"','&quot;')
  .replaceAll("'",'&#39;');

/** Canonical server-rendered new-message page independent from the legacy app.ts monolith. */
export async function messageNew(ctx:AppContext):Promise<Response>{
  const m=ctx.member;
  if(!m)return redirect('/login.php?next=%2Fapp%2Fmessage_new.php');
  const members=await ctx.env.DB.prepare('SELECT id,name FROM members WHERE family_id=? AND active=1 ORDER BY id').bind(m.family_id).all<Row>();
  const body=`<div class="page-head"><div><div class="eyebrow">Family TODO LINE</div><h1>💬 伝言</h1></div><a class="btn gray" href="/app/messages.php">戻る</a></div><div class="card form-card"><form id="messageNew"><input type="hidden" name="csrf" value="${esc(ctx.session.csrfToken||'')}"><label>宛先</label><select name="target_member_id"><option value="0">家族全員</option>${members.results.map(r=>`<option value="${r.id}">${esc(r.name)}</option>`).join('')}</select><label>伝言</label><textarea name="text" maxlength="5000" required autofocus placeholder="家族への伝言を入力してください。"></textarea><label>通知日時（任意）</label><input type="datetime-local" name="reminder_at"><p class="small">指定すると宛先へその日時に伝言内容を設定した通知方法で通知します。</p><button>伝言する</button></form></div><script src="/assets/message-new.js?v=${APP_VERSION}"></script>`;
  return html(layout('伝言',body,'/app/messages.php'));
}
