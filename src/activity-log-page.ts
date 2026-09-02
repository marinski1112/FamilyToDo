import { layout } from './app';
import { activityLogVisibilitySql } from './task-visibility';
import { html, redirect } from './response';
import { DEFAULT_FAMILY_TIMEZONE, formatStoredUtcForFamily } from './timezone';

const esc = (v: unknown) => String(v ?? '').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('\"','&quot;').replaceAll("'",'&#39;');
const nowJst = () => new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Tokyo',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'}).format(new Date()).replace(' ',' ');

export async function logsPage(ctx:any):Promise<Response>{
  const m=ctx.member;if(!m)return redirect('/login.php');
  const role=String(m.role||'').toUpperCase();
  if(role!=='OWNER'&&role!=='ADMIN') return html(layout('活動ログ','<div class="card"><h1>📊 家族の活動ログ</h1><p>活動ログを見るには管理者権限が必要です。</p><a class="btn" href="/app/settings.php">管理へ戻る</a></div>','/app/settings.php'));
  const u=new URL(ctx.request.url), days=String(u.searchParams.get('days')||'7'), member=Number(u.searchParams.get('member')||0), type=String(u.searchParams.get('type')||''), action=String(u.searchParams.get('action')||''), page=Math.max(1,Number(u.searchParams.get('page')||1)||1);
  const from=String(u.searchParams.get('from')||''),to=String(u.searchParams.get('to')||'');
  const where:string[]=['a.family_id=?',activityLogVisibilitySql('a')], params:any[]=[m.family_id,m.id,m.id,m.id];
  if(member>0){where.push('a.member_id=?');params.push(member);}
  const groups:Record<string,string[]>= {task:['task'],item:['item'],shopping:['shopping'],message:['message'],family_log:['family_log','family_log_subject'],chore:['family_quick_chore'],recurring:['recurrence_rule','recurrence_occurrence'],admin:['member','family','invitation','settings']};
  if(groups[type]){where.push(`a.target_type IN (${groups[type].map(()=>'?').join(',')})`);params.push(...groups[type]);}
  const actions:Record<string,string[]>= {CREATED:['CREATED'],UPDATED:['UPDATED'],COMPLETED:['COMPLETED'],UNCOMPLETED:['UNCOMPLETED'],DELETED:['DELETED'],OTHER:['CREATED','UPDATED','COMPLETED','UNCOMPLETED','DELETED']};
  if(action&&action!=='OTHER'){where.push('a.action=?');params.push(action);}else if(action==='OTHER'){where.push(`a.action NOT IN (${actions.OTHER.map(()=>'?').join(',')})`);params.push(...actions.OTHER);}
  if(days==='custom'&&/^\d{4}-\d{2}-\d{2}$/.test(from)&&/^\d{4}-\d{2}-\d{2}$/.test(to)){where.push("date(a.occurred_at) BETWEEN date(?) AND date(?)");params.push(from,to);}
  else {const n=days==='today'?0:([7,30].includes(Number(days))?Number(days)-1:6);where.push("date(a.occurred_at)>=date(?,'-'||?||' days')");params.push(nowJst(),n);}
  const rows=await ctx.env.DB.prepare(`SELECT a.*,m.name member_name,fl.log_type family_log_type,fl.occurred_at family_log_occurred_at,fl.detail_code family_log_detail_code,fl.amount family_log_amount,fl.unit family_log_unit,fl.duration_minutes family_log_duration_minutes,fl.value_text family_log_value_text,fs.name family_log_subject_name,fss.name target_subject_name FROM activity_logs a LEFT JOIN members m ON m.id=a.member_id LEFT JOIN family_logs fl ON a.target_type='family_log' AND fl.id=a.target_id AND fl.family_id=a.family_id LEFT JOIN family_log_subjects fs ON fs.id=fl.subject_id AND fs.family_id=fl.family_id LEFT JOIN family_log_subjects fss ON a.target_type='family_log_subject' AND fss.id=a.target_id AND fss.family_id=a.family_id WHERE ${where.join(' AND ')} ORDER BY a.occurred_at DESC,a.id DESC LIMIT 51 OFFSET ?`).bind(...params,(page-1)*50).all();
  const hasMore=rows.results.length>50;rows.results=rows.results.slice(0,50);
  const members=await ctx.env.DB.prepare('SELECT id,name FROM members WHERE family_id=? ORDER BY id').bind(m.family_id).all();
  const timeZone=String(m.family_timezone||ctx.env.APP_TIMEZONE||DEFAULT_FAMILY_TIMEZONE);
  const label=(x:string)=>({COMPLETED:'完了',UNCOMPLETED:'未完了に戻す',CREATED:'作成',UPDATED:'更新',DELETED:'削除'} as Record<string,string>)[x]||x;
  const rowHtml=(rows.results as any[]).map(r=>`<div class="row"><strong>${esc(label(String(r.action||'')))}</strong><div class="meta">${esc(r.member_name||'不明')} ・ ${esc(formatStoredUtcForFamily(String(r.occurred_at||''),timeZone))}</div><div class="meta">${esc(r.target_type||'')}${r.target_id?` #${esc(r.target_id)}`:''}</div></div>`).join('');
  const selected=(v:any,x:any)=>String(v)===String(x)?'selected':'';
  const form=`<details class="card" open><summary><strong>絞り込み</strong></summary><form method="get"><label>期間</label><select name="days"><option value="today" ${selected(days,'today')}>今日</option><option value="7" ${selected(days,'7')}>7日</option><option value="30" ${selected(days,'30')}>30日</option><option value="custom" ${selected(days,'custom')}>期間指定</option></select><div class="date-grid"><input type="date" name="from" value="${esc(from)}"><input type="date" name="to" value="${esc(to)}"></div><label>メンバー</label><select name="member"><option value="0">全員</option>${members.results.map((x:any)=>`<option value="${x.id}" ${selected(member,x.id)}>${esc(x.name)}</option>`).join('')}</select><label>種類</label><select name="type"><option value="">全て</option>${[['task','タスク'],['item','持ち物'],['shopping','買い物'],['message','伝言'],['family_log','家族ログ'],['chore','ちょこっと家事'],['recurring','定期タスク'],['admin','メンバー/管理操作']].map(x=>`<option value="${x[0]}" ${selected(type,x[0])}>${x[1]}</option>`).join('')}</select><label>アクション</label><select name="action"><option value="">全て</option>${[['CREATED','作成'],['UPDATED','更新'],['COMPLETED','完了'],['UNCOMPLETED','未完了へ戻す'],['DELETED','削除'],['OTHER','その他']].map(x=>`<option value="${x[0]}" ${selected(action,x[0])}>${x[1]}</option>`).join('')}</select><button>適用</button></form></details>`;
  const q=new URLSearchParams(u.searchParams);q.set('page',String(page+1));
  const prev=new URLSearchParams(u.searchParams);prev.set('page',String(page-1));
  const paging=`<div class="actions">${page>1?`<a class="btn gray" href="?${prev}">前へ</a>`:''}${hasMore?`<a class="btn" href="?${q}">さらに読み込む</a>`:''}</div>`;
  return html(layout('活動ログ',`<div class="page-head"><div><div class="eyebrow">管理</div><h1>📊 家族の活動ログ</h1></div><a class="btn gray" href="/app/settings.php">戻る</a></div>${form}<div class="card history-card"><p class="small">表示時刻: ${esc(timeZone)} / 1ページ50件・activity_logsはUTC保存で31日保持です。</p>${rowHtml||'<p class="empty">ログはありません。</p>'}${paging}</div>`,'/app/settings.php'));
}