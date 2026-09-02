import { html, redirect } from './response';
import { AuthRequired, Forbidden } from './errors';
import { layout } from './app-shell';
import { logActivity } from './activity-log';
import type { AppContext } from './app-context';
import { DEFAULT_FAMILY_TIMEZONE, familyDate, familyNow } from './timezone';
import { childJournalCalendarStatus, processChildJournalCalendarOutbox } from './child-journal-calendar';
import { childJournalFoundationReady, childJournalSchemaStatus } from './child-journal-schema';

type Row = Record<string, unknown>;
type JournalInputKind = 'STAND'|'FIRST_STEP'|'FIRST_TOOTH'|'TOOTH'|'HEIGHT'|'WEIGHT'|'MEMO';

const MILESTONES: Record<string,{label:string;code:string}> = {
  STAND:{label:'立った',code:'STAND'},
  FIRST_STEP:{label:'歩いた',code:'FIRST_STEP'},
  FIRST_TOOTH:{label:'最初の歯',code:'FIRST_TOOTH'},
  TOOTH:{label:'歯',code:'TOOTH'},
};
const esc=(value:unknown)=>String(value??'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&#39;');

function requireMember(ctx:AppContext){if(!ctx.member)throw new AuthRequired();return ctx.member;}
function ensureCsrf(ctx:AppContext,token:unknown){if(!ctx.session.csrfToken)ctx.session.csrfToken=crypto.randomUUID();if(typeof token!=='string'||token!==ctx.session.csrfToken)throw new Forbidden('CSRF検証に失敗しました。');}
function validDate(value:string){if(!/^\d{4}-\d{2}-\d{2}$/.test(value))return false;const d=new Date(`${value}T00:00:00Z`);return Number.isFinite(d.getTime())&&d.toISOString().slice(0,10)===value;}
function validMonth(value:string){if(!/^\d{4}-\d{2}$/.test(value))return false;return validDate(`${value}-01`);}
function shiftMonth(month:string,delta:number){const d=new Date(`${month}-01T00:00:00Z`);d.setUTCMonth(d.getUTCMonth()+delta);return d.toISOString().slice(0,7);}
function daysInMonth(month:string){const [year,mon]=month.split('-').map(Number);return new Date(Date.UTC(year,mon,0)).getUTCDate();}
function journalLabel(row:Row){const code=String(row.milestone_code||'');if(code&&Object.values(MILESTONES).some(x=>x.code===code))return Object.values(MILESTONES).find(x=>x.code===code)!.label;if(String(row.log_type)==='HEIGHT')return `身長 ${Number(row.amount)}${String(row.unit||'cm')}`;if(String(row.log_type)==='WEIGHT')return `体重 ${Number(row.amount)}${String(row.unit||'kg')}`;return String(row.value_text||'メモ');}

export async function childJournalApi(request:Request,ctx:AppContext):Promise<Response>{
  const member=requireMember(ctx);if(request.method!=='POST')return new Response('Method Not Allowed',{status:405});if(!(await childJournalFoundationReady(ctx.env.DB)))return new Response('成長日記のデータベース更新が必要です。',{status:503});
  const form=await request.formData();ensureCsrf(ctx,form.get('csrf'));
  const subjectId=Number(form.get('subject_id')||0);const occurredDate=String(form.get('occurred_date')||'');const kind=String(form.get('kind')||'').toUpperCase() as JournalInputKind;const note=String(form.get('note')||'').trim().slice(0,2000);const rawValue=String(form.get('value')||'').trim();
  if(!subjectId||!validDate(occurredDate)||!['STAND','FIRST_STEP','FIRST_TOOTH','TOOTH','HEIGHT','WEIGHT','MEMO'].includes(kind))return new Response('入力内容が不正です。',{status:400});
  const subject=await ctx.env.DB.prepare("SELECT id,subject_kind FROM family_log_subjects WHERE id=? AND family_id=? AND active=1 AND subject_kind IN ('BABY','CHILD') LIMIT 1").bind(subjectId,member.family_id).first<Row>();
  if(!subject)return new Response('子どもの記録対象が見つかりません。',{status:404});
  const timezone=String(member.family_timezone||ctx.env.APP_TIMEZONE||DEFAULT_FAMILY_TIMEZONE);const now=familyNow(timezone);const occurredAt=`${occurredDate} 12:00:00`;
  let logType='MEMO',detailCode='JOURNAL_MEMO',amount:number|null=null,unit:string|null=null,valueText:string|null=note||'成長メモ',entryKind:'MILESTONE'|'MEASUREMENT'|'MEMO'='MEMO',milestoneCode:string|null=null;
  if(MILESTONES[kind]){const milestone=MILESTONES[kind];detailCode=`JOURNAL_${milestone.code}`;valueText=milestone.label;entryKind='MILESTONE';milestoneCode=milestone.code;}
  else if(kind==='HEIGHT'){const value=Number(rawValue);if(!Number.isFinite(value)||value<20||value>250)return new Response('身長は20〜250cmで入力してください。',{status:400});logType='HEIGHT';detailCode='JOURNAL_HEIGHT';amount=Math.round(value*10)/10;unit='cm';valueText=null;entryKind='MEASUREMENT';}
  else if(kind==='WEIGHT'){const value=Number(rawValue);if(!Number.isFinite(value)||value<0.2||value>300)return new Response('体重は0.2〜300kgで入力してください。',{status:400});logType='WEIGHT';detailCode='JOURNAL_WEIGHT';amount=Math.round(value*100)/100;unit='kg';valueText=null;entryKind='MEASUREMENT';}
  else if(!note)return new Response('メモを入力してください。',{status:400});

  const inserted=await ctx.env.DB.prepare('INSERT INTO family_logs(family_id,subject_id,log_type,occurred_at,detail_code,amount,unit,duration_minutes,value_text,note,linked_task_id,linked_occurrence_id,created_by,created_at,updated_at,deleted_at) VALUES(?,?,?,?,?,?,?,NULL,?,?,NULL,NULL,?,?,?,NULL)')
    .bind(member.family_id,subjectId,logType,occurredAt,detailCode,amount,unit,valueText,note||null,member.id,now,now).run();
  const logId=Number(inserted.meta.last_row_id||0);if(!logId)return new Response('成長日記を保存できませんでした。',{status:500});
  try{
    await ctx.env.DB.prepare("INSERT INTO family_log_journal_entries(log_id,family_id,subject_id,journal_kind,entry_kind,milestone_code,google_sync_enabled,created_by,created_at,updated_at) VALUES(?,?,?,'CHILD',?,?,1,?,?,?)")
      .bind(logId,member.family_id,subjectId,entryKind,milestoneCode,member.id,now,now).run();
  }catch(error){await ctx.env.DB.prepare('DELETE FROM family_logs WHERE id=? AND family_id=?').bind(logId,member.family_id).run().catch(()=>{});throw error;}
  await logActivity(ctx,'CREATED','family_log',logId,{source:'child_journal',entry_kind:entryKind});
  ctx.executionContext?.waitUntil(processChildJournalCalendarOutbox(ctx.env,5,member.family_id));
  return redirect(`/app/child_journal.php?month=${occurredDate.slice(0,7)}&subject_id=${subjectId}`,303);
}

export async function childJournalPage(request:Request,ctx:AppContext):Promise<Response>{
  const member=requireMember(ctx);if(!ctx.session.csrfToken)ctx.session.csrfToken=crypto.randomUUID();const url=new URL(request.url);const timezone=String(member.family_timezone||ctx.env.APP_TIMEZONE||DEFAULT_FAMILY_TIMEZONE);const today=familyDate(timezone);const requestedMonth=String(url.searchParams.get('month')||'');const month=validMonth(requestedMonth)?requestedMonth:today.slice(0,7);const requestedSubject=Number(url.searchParams.get('subject_id')||0);
  const schema=await childJournalSchemaStatus(ctx.env.DB);if(!schema.foundation){const body='<div class="card"><h1>📔 成長日記</h1><p>データベース更新の反映待ちです。管理側でmigration適用後に自動で利用可能になります。</p><a class="btn gray" href="/app/family_log.php">家族ログへ戻る</a></div>';return html(layout('成長日記',body,'/app/family_log.php'));}
  const [subjects,calendarSync]=await Promise.all([
    ctx.env.DB.prepare("SELECT id,name,subject_kind,icon FROM family_log_subjects WHERE family_id=? AND active=1 AND subject_kind IN ('BABY','CHILD') ORDER BY COALESCE(sort_order,9999),id").bind(member.family_id).all<Row>(),
    childJournalCalendarStatus(ctx.env.DB,member.family_id),
  ]);
  const selected=subjects.results.find(x=>Number(x.id)===requestedSubject)||subjects.results[0]||null;const subjectId=selected?Number(selected.id):0;
  const from=`${month}-01`;const to=`${shiftMonth(month,1)}-01`;
  const entries=subjectId?await ctx.env.DB.prepare(`SELECT j.log_id,j.entry_kind,j.milestone_code,l.log_type,l.occurred_at,l.amount,l.unit,l.value_text,l.note,s.name subject_name
    FROM family_log_journal_entries j JOIN family_logs l ON l.id=j.log_id AND l.family_id=j.family_id AND l.deleted_at IS NULL JOIN family_log_subjects s ON s.id=j.subject_id AND s.family_id=j.family_id
    WHERE j.family_id=? AND j.subject_id=? AND substr(l.occurred_at,1,10)>=? AND substr(l.occurred_at,1,10)<? ORDER BY l.occurred_at,l.id`).bind(member.family_id,subjectId,from,to).all<Row>():{results:[] as Row[]};
  const byDate=new Map<string,Row[]>();for(const row of entries.results){const date=String(row.occurred_at||'').slice(0,10);const list=byDate.get(date)||[];list.push(row);byDate.set(date,list);}
  const totalDays=daysInMonth(month),firstDow=new Date(`${month}-01T00:00:00Z`).getUTCDay();const cells:string[]=[];for(let i=0;i<firstDow;i++)cells.push('<div class="child-journal-day muted"></div>');
  for(let day=1;day<=totalDays;day++){const date=`${month}-${String(day).padStart(2,'0')}`;const rows=byDate.get(date)||[];cells.push(`<div class="child-journal-day${date===today?' today':''}"><strong>${day}</strong>${rows.map(row=>`<div class="child-journal-entry"><span>${esc(journalLabel(row))}</span>${row.note&&String(row.note)!==String(row.value_text||'')?`<small>${esc(row.note)}</small>`:''}</div>`).join('')}</div>`);}
  while(cells.length%7)cells.push('<div class="child-journal-day muted"></div>');
  const chips=subjects.results.map(s=>`<a class="${Number(s.id)===subjectId?'active':''}" href="/app/child_journal.php?month=${month}&subject_id=${Number(s.id)}">${esc(s.icon||(String(s.subject_kind)==='BABY'?'👶':'🧒'))} ${esc(s.name)}</a>`).join('');
  const csrf=String(ctx.session.csrfToken||'');const subjectOptions=subjects.results.map(s=>`<option value="${Number(s.id)}" ${Number(s.id)===subjectId?'selected':''}>${esc(s.name)}</option>`).join('');
  const syncText=!calendarSync.schemaReady?'Google Calendar同期のDB更新待ち':!calendarSync.oauthLinked?'Google Calendar未連携':calendarSync.errors?`同期エラー ${calendarSync.errors}件`:calendarSync.pending?`同期待ち ${calendarSync.pending}件`:calendarSync.calendarCreated?`${calendarSync.calendarName} に自動同期中`:'連携済み・最初の記録時に専用カレンダーを作成';
  const syncAction=calendarSync.oauthLinked?'':'<a class="btn gray small" href="/app/settings_integrations.php">連携設定</a>';
  const syncCard=`<div class="card"><div class="section-head"><h2>📅 Google Calendar</h2>${syncAction}</div><p>${esc(syncText)}</p><p class="small">成長日記専用カレンダーへFamilyToDo → Googleの一方向で同期します。Google側の編集はFamilyToDoへ取り込みません。</p></div>`;
  const form=selected?`<div class="card"><div class="section-head"><h2>＋ 成長を記録</h2></div><form method="post" action="/api/child-journal"><input type="hidden" name="csrf" value="${esc(csrf)}"><label>子ども</label><select name="subject_id" required>${subjectOptions}</select><label>日付</label><input type="date" name="occurred_date" value="${today}" required><label>記録</label><select name="kind" required><option value="STAND">立った</option><option value="FIRST_STEP">歩いた</option><option value="FIRST_TOOTH">最初の歯</option><option value="TOOTH">歯</option><option value="HEIGHT">身長</option><option value="WEIGHT">体重</option><option value="MEMO">メモ</option></select><label>数値 <small>身長はcm、体重はkg</small></label><input type="number" name="value" step="0.1" inputmode="decimal" placeholder="身長・体重のときだけ"><label>メモ</label><textarea name="note" maxlength="2000" rows="3" placeholder="できたこと、様子など"></textarea><button type="submit">記録する</button></form></div>`:`<div class="card"><h2>成長日記を始める</h2><p>家族ログ管理で「赤ちゃん」または「子ども」の記録対象を追加してください。</p><a class="btn" href="/app/settings_family_log.php">家族ログ管理を開く</a></div>`;
  const body=`<style>.child-journal-head{display:flex;align-items:center;justify-content:space-between;gap:12px}.child-journal-subjects{display:flex;gap:8px;overflow:auto;padding:4px 0 12px}.child-journal-subjects a{white-space:nowrap;padding:8px 12px;border-radius:999px;background:#fff;text-decoration:none}.child-journal-subjects a.active{font-weight:700;box-shadow:0 0 0 2px currentColor inset}.child-journal-month-nav{display:flex;justify-content:space-between;align-items:center;margin:10px 0}.child-journal-calendar{display:grid;grid-template-columns:repeat(7,minmax(0,1fr));gap:4px}.child-journal-weekday{text-align:center;font-size:12px;font-weight:700;padding:4px}.child-journal-day{min-height:88px;border:1px solid #e5e7eb;border-radius:8px;padding:5px;background:#fff;overflow:hidden}.child-journal-day.today{box-shadow:0 0 0 2px currentColor inset}.child-journal-day.muted{background:transparent;border-color:transparent}.child-journal-entry{margin-top:4px;padding:4px;border-radius:6px;background:#f3f4f6;font-size:11px;line-height:1.25}.child-journal-entry span,.child-journal-entry small{display:block;overflow-wrap:anywhere}@media(max-width:640px){.child-journal-day{min-height:70px;padding:3px}.child-journal-entry{font-size:10px}}</style><div class="child-journal-head"><div><div class="eyebrow">Family Log</div><h1>📔 成長日記</h1></div><a class="btn gray" href="/app/family_log.php">家族ログへ</a></div>${syncCard}<div class="child-journal-subjects">${chips}</div><div class="card"><div class="child-journal-month-nav"><a class="btn gray" href="/app/child_journal.php?month=${shiftMonth(month,-1)}${subjectId?`&subject_id=${subjectId}`:''}">‹</a><strong>${esc(month.replace('-','年'))}月</strong><a class="btn gray" href="/app/child_journal.php?month=${shiftMonth(month,1)}${subjectId?`&subject_id=${subjectId}`:''}">›</a></div><div class="child-journal-calendar">${['日','月','火','水','木','金','土'].map(x=>`<div class="child-journal-weekday">${x}</div>`).join('')}${cells.join('')}</div></div>${form}`;
  return html(layout('成長日記',body,'/app/family_log.php'));
}
