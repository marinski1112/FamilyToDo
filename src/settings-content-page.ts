import type { AppContext } from './app-context';
import { layout } from './app-shell';
import { FAMILY_LOG_TYPE_META } from './family-log-type-meta';
import { html, redirect } from './response';
import { taskChildVisibilitySql, taskVisibilitySql } from './task-visibility';

type Row = Record<string, unknown>;

const esc = (v: unknown) => String(v ?? '')
  .replaceAll('&','&amp;')
  .replaceAll('<','&lt;')
  .replaceAll('>','&gt;')
  .replaceAll('"','&quot;')
  .replaceAll("'",'&#39;');

/** Read-only content administration page retained outside the legacy app.ts monolith. */
export async function settingsContent(ctx:AppContext):Promise<Response>{
  const m=ctx.member;
  if(!m)return redirect('/login.php?next=%2Fapp%2Fsettings_content.php');
  const role=String(m.role||'').toUpperCase(),admin=role==='OWNER'||role==='ADMIN';
  const [tasks,items,shops,msgs,familyLogs]=await Promise.all([
    ctx.env.DB.prepare(`SELECT id,title,status,created_at,created_by FROM tasks t WHERE family_id=? AND ${taskVisibilitySql('t')} ORDER BY id DESC LIMIT 30`).bind(m.family_id,m.id).all<Row>(),
    ctx.env.DB.prepare(`SELECT i.id,i.name,i.status,i.created_at,i.created_by FROM items i WHERE i.family_id=? AND ${taskChildVisibilitySql('i')} ORDER BY i.id DESC LIMIT 30`).bind(m.family_id,m.id).all<Row>(),
    ctx.env.DB.prepare(`SELECT s.id,s.name,s.status,s.created_at,s.created_by FROM shopping_items s WHERE s.family_id=? AND ${taskChildVisibilitySql('s')} ORDER BY s.id DESC LIMIT 30`).bind(m.family_id,m.id).all<Row>(),
    ctx.env.DB.prepare('SELECT id,text,created_at,sender_id FROM messages WHERE family_id=? ORDER BY id DESC LIMIT 30').bind(m.family_id).all<Row>(),
    ctx.env.DB.prepare("SELECT l.id,l.log_type,l.occurred_at,l.created_at,l.created_by,s.name subject_name FROM family_logs l LEFT JOIN family_log_subjects s ON s.id=l.subject_id WHERE l.family_id=? AND l.deleted_at IS NULL ORDER BY l.occurred_at DESC,l.id DESC LIMIT 30").bind(m.family_id).all<Row>()
  ]);
  const own=(id:unknown)=>admin||Number(id)===m.id;
  const section=(title:string,icon:string,rows:{results:Row[]},link:(r:Row)=>string,name:(r:Row)=>string)=>`<div class="card content-admin"><h2>${icon} ${title}</h2>${rows.results.map(r=>`<div class="content-row"><div><strong>${esc(name(r))}</strong><div class="meta">${esc(r.created_at||'')} / ${esc(r.status||'')}</div></div>${own(r.created_by??r.sender_id)?`<a class="btn gray small" href="${link(r)}">開く</a>`:''}</div>`).join('')||'<p class="empty">ありません。</p>'}</div>`;
  const body=`<div class="page-head"><div><div class="eyebrow">管理</div><h1>📋 投稿管理</h1></div><a class="btn gray" href="/app/settings.php">戻る</a></div>${section('タスク','📝',tasks,r=>`/task/view.php?id=${r.id}`,r=>String(r.title||''))}${section('持ち物','🎒',items,r=>`/item/edit.php?id=${r.id}`,r=>String(r.name||''))}${section('買い物','🛒',shops,r=>`/app/shopping_edit.php?id=${r.id}`,r=>String(r.name||''))}${section('伝言','💬',msgs,r=>`/app/messages.php`,r=>String(r.text||''))}${section('家族ログ','🐣',familyLogs,r=>`/app/family_log.php?date=${String(r.occurred_at||'').slice(0,10)}`,r=>`${FAMILY_LOG_TYPE_META[String(r.log_type||'MEMO')]?.label||String(r.log_type||'記録')}${r.subject_name?' / '+String(r.subject_name):''}`)}`;
  return html(layout('投稿管理',body,'/app/settings.php'));
}
