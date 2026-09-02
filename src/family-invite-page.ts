import type { AppContext } from './app-context';
import { layout } from './app-shell';
import { lineOfficialAccountInfo } from './line-official-account';
import { html } from './response';
import { APP_VERSION } from './version';

type Row = Record<string, unknown>;

const esc = (v: unknown) => String(v ?? '')
  .replaceAll('&','&amp;')
  .replaceAll('<','&lt;')
  .replaceAll('>','&gt;')
  .replaceAll('"','&quot;')
  .replaceAll("'",'&#39;');

const nowJst = () => new Intl.DateTimeFormat('sv-SE',{
  timeZone:'Asia/Tokyo',year:'numeric',month:'2-digit',day:'2-digit',
  hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23',
}).format(new Date()).replace(' ','T').replace('T',' ');

/** Canonical server-rendered family invitation/join page. */
export async function invitePage(ctx: AppContext, token: string): Promise<Response> {
  const trimmed = token.trim();
  if (!trimmed) return html(layout('家族に参加','<div class="card"><h1>家族に参加</h1><p>招待情報がありません。</p></div>'));
  const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(trimmed));
  const tokenHash=Array.from(new Uint8Array(digest)).map(v=>v.toString(16).padStart(2,'0')).join('');
  const invite=await ctx.env.DB.prepare(`SELECT i.id,i.expires_at,i.used_at,i.family_log_subject_id,s.name subject_name,s.subject_kind
    FROM family_invitations i
    LEFT JOIN family_log_subjects s ON s.id=i.family_log_subject_id AND s.family_id=i.family_id AND s.active=1
    WHERE i.token_hash=? LIMIT 1`).bind(tokenHash).first<Row>();
  if(!invite||invite.used_at||String(invite.expires_at||'')<nowJst())return html(layout('家族に参加','<div class="card"><h1>家族に参加</h1><p>この招待リンクは無効・使用済み・期限切れのいずれかです。</p></div>'));
  if(Number(invite.family_log_subject_id||0)>0&&!String(invite.subject_name||'').trim())return html(layout('家族に参加','<div class="card"><h1>家族に参加</h1><p>本登録対象の家族ログプロフィールが無効です。管理者に新しい招待リンクを発行してもらってください。</p></div>'));
  const subjectName=String(invite.subject_name||'').trim();
  const official=await lineOfficialAccountInfo(ctx.env);
  const friendHtml=official
    ? `<div class="invite-official"><div><strong>${esc(official.display_name)}</strong><div class="small">${esc(official.basic_id)}</div></div><a class="btn line-friend-btn" href="${esc(official.add_friend_url)}" target="_blank" rel="noopener noreferrer">LINE公式アカウントを友だち追加</a></div>`
    : `<p class="small">公式アカウント情報を自動取得できませんでした。管理者から共有された友だち追加リンクを利用してください。</p>`;
  const title=subjectName?`${subjectName} のLINE本登録`:'家族に参加';
  const intro=subjectName?`これまで「${esc(subjectName)}」として保存した家族ログを、このLINEアカウントへ引き継いで本登録します。`:'この招待リンクから家族に参加できます。';
  const defaultName=subjectName||String(ctx.session.lineDisplayName||'');
  return html(layout('家族に参加',`<div class="card"><h1>${esc(title)}</h1><p>${intro}</p><div class="invite-guide"><strong>参加前に確認</strong><ol><li>Family TODO LINE 公式アカウントを友だち追加</li><li>このページをLINE内で開く</li><li>名前を確認して参加</li></ol>${friendHtml}</div><div id="familyActionError" class="error" style="display:none"></div><form id="join" data-family-endpoint="/api/family/join"><input type="hidden" name="token" value="${esc(trimmed)}"><label>あなたの名前</label><input name="member_name" value="${esc(defaultName)}" required><button>${subjectName?'本登録して参加する':'家族に参加する'}</button></form></div><script src="/assets/family-onboarding.js?v=${APP_VERSION}"></script>`));
}
