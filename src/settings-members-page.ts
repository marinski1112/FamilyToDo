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

const nowJst = () => new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Tokyo',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'}).format(new Date()).replace(' ','T').replace('T',' ');

/** Canonical server-rendered family-member administration page. Mutation stays in existing APIs. */
export async function settingsMembers(_request:Request,ctx:AppContext):Promise<Response>{
  const m=ctx.member;
  if(!m)return redirect('/login.php?next=%2Fapp%2Fsettings_members.php');
  const role=String(m.role||'').toUpperCase();
  if(role!=='OWNER'&&role!=='ADMIN')return new Response('管理者権限が必要です。',{status:403});
  const [members,invitations]=await Promise.all([
    ctx.env.DB.prepare("SELECT m.id,m.name,m.member_type,m.role,m.active,m.deleted_at,m.created_at,EXISTS(SELECT 1 FROM member_permissions p WHERE p.family_id=m.family_id AND p.member_id=m.id AND p.permission_key='MANAGE_QUICK_CHORES') manage_quick_chores FROM members m WHERE m.family_id=? ORDER BY m.id").bind(m.family_id).all<Row>(),
    ctx.env.DB.prepare('SELECT i.id,i.expires_at,i.used_at,i.created_at,i.family_log_subject_id,c.name created_by_name,u.name used_by_name,s.name subject_name FROM family_invitations i LEFT JOIN members c ON c.id=i.created_by LEFT JOIN members u ON u.id=i.used_by LEFT JOIN family_log_subjects s ON s.id=i.family_log_subject_id AND s.family_id=i.family_id WHERE i.family_id=? ORDER BY i.id DESC LIMIT 20').bind(m.family_id).all<Row>()
  ]);
  const now=nowJst();
  const invitationRows=invitations.results.map(i=>{const used=Boolean(i.used_at),active=!used&&String(i.expires_at||'')>now;const status=used?'使用済み':active?'有効':'期限切れ/取消済み';const subject=i.subject_name?`<div class="meta invite-subject-link">🐣 ${esc(i.subject_name)} のLINE本登録</div>`:'';return `<div class="invite-history-row"><div><strong>${status}</strong>${subject}<div class="meta">発行 ${esc(String(i.created_at||'').slice(0,16))}${i.created_by_name?' ・ '+esc(i.created_by_name):''}</div><div class="meta">期限 ${esc(String(i.expires_at||'').slice(0,16))}${used&&i.used_at?' ・ 使用 '+esc(String(i.used_at).slice(0,16)):''}${used&&i.used_by_name?' ・ '+esc(i.used_by_name):''}</div></div>${active?`<button type="button" class="btn danger small invite-revoke" data-id="${i.id}">取消</button>`:''}</div>`}).join('')||'<p class="empty">発行履歴はありません。</p>';
  const payload=JSON.stringify({csrf:ctx.session.csrfToken||''}).replaceAll('<','\\u003c').replaceAll('>','\\u003e').replaceAll('&','\\u0026');
  const body=`<div class="page-head"><div><div class="eyebrow">管理</div><h1>👨‍👩‍👧 家族メンバー</h1></div><a class="btn gray" href="/app/settings.php">戻る</a></div><div class="card member-list">${members.results.map(x=>`<div class="member-row"><div><strong>${esc(x.name)}</strong><div class="meta">${esc(x.member_type||'ADULT')} / ${esc(x.role||'MEMBER')} / ${x.deleted_at?'削除済み':(Number(x.active)?'有効':'停止中')}</div>${String(x.role||'').toUpperCase()==='MEMBER'&&!x.deleted_at?`<label class="checkrow small"><input type="checkbox" class="quick-chore-permission" data-id="${x.id}" ${Number(x.manage_quick_chores)?'checked':''}> ちょこっと家事項目を管理</label>`:''}</div>${Number(x.id)!==m.id&&String(x.role||'').toUpperCase()!=='OWNER'&&!x.deleted_at?`<div class="actions"><button class="btn gray small member-toggle" data-id="${x.id}">${Number(x.active)?'停止':'再開'}</button><button class="btn danger small member-del" data-id="${x.id}">削除</button></div>`:''}</div>`).join('')}</div><div class="card"><h2>招待</h2><div class="invite-guide"><strong>招待前の流れ</strong><ol><li>招待相手に Family TODO LINE 公式アカウントを友だち追加してもらう</li><li>7日間有効の招待リンクを発行してLINEで送る</li><li>相手はLINE内でリンクを開き、名前を確認して参加する</li></ol><p class="small">招待リンク発行時に公式アカウント情報を自動取得し、友だち追加URLも一緒に共有できます。</p></div><button id="invite" class="btn">招待リンクを発行</button><div id="inviteOut"></div><details class="invite-history" open><summary>発行済み招待リンク</summary>${invitationRows}</details></div><script type="application/json" id="settingsMembersPayload">${payload}</script><script src="/assets/settings-members.js?v=${APP_VERSION}"></script>`;
  return html(layout('家族メンバー',body,'/app/settings.php'));
}
