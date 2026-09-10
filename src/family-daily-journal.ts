import type {AppContext} from './app-context';
import {AuthRequired,BadRequest} from './errors';
import {layout} from './app-shell';
import {html} from './response';

type Row=Record<string,unknown>;
type LocationSummary={memberId:number;name:string;routePointCount:number;stays:Array<{from:string;to:string;minutes:number;place:string}>};
type TaskSummary={taskId:number;title:string;memberId:number;memberName:string;completedAt:string};
type HouseworkSummary={name:string;memberId:number;memberName:string;occurredAt:string};
const MAX_FAMILIES=40,REPAIR_DAYS=7,MAX_ITEMS=200,MAX_SEARCH=50,MAX_SUMMARY_DETAILS=3,MAX_SUMMARY_DETAIL_CHARS=60,JOURNAL_REFRESH_MS=24*60*60*1000;
const esc=(v:unknown)=>String(v??'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&#39;');
const validDate=(v:string)=>/^\d{4}-\d{2}-\d{2}$/.test(v)&&Number.isFinite(Date.parse(`${v}T00:00:00Z`));
const validMonth=(v:string)=>/^\d{4}-\d{2}$/.test(v)&&Number.isFinite(Date.parse(`${v}-01T00:00:00Z`));
const shiftDate=(date:string,days:number)=>{const d=new Date(`${date}T12:00:00Z`);d.setUTCDate(d.getUTCDate()+days);return d.toISOString().slice(0,10);};
const shiftMonth=(month:string,delta:number)=>{const d=new Date(`${month}-01T12:00:00Z`);d.setUTCMonth(d.getUTCMonth()+delta);return d.toISOString().slice(0,7);};
const todayJst=()=>new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Tokyo',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
const parseArray=<T>(raw:unknown):T[]=>{try{const v=JSON.parse(String(raw??'[]'));return Array.isArray(v)?v as T[]:[];}catch{return [];}};
const timeOnly=(v:string)=>/^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}/.test(v)?v.slice(11,16):'';
const journalFresh=(raw:unknown,nowMs:number)=>{const generated=Date.parse(String(raw||''));return Number.isFinite(generated)&&generated<=nowMs&&nowMs-generated<JOURNAL_REFRESH_MS;};

async function readLocation(db:D1Database,familyId:number,date:string):Promise<LocationSummary[]>{
  const [days,stays]=await Promise.all([
    db.prepare(`SELECT a.member_id,m.name,a.route_point_count FROM location_history_archive_days a JOIN members m ON m.id=a.member_id AND m.family_id=a.family_id WHERE a.family_id=? AND a.local_date=? ORDER BY m.id`).bind(familyId,date).all<Row>(),
    db.prepare(`SELECT member_id,started_at,ended_at,duration_minutes,COALESCE(NULLIF(address_label,''),place_label) place_label FROM location_history_stays WHERE family_id=? AND local_date=? ORDER BY member_id,started_at,id LIMIT 300`).bind(familyId,date).all<Row>(),
  ]);
  const grouped=new Map<number,LocationSummary['stays']>();
  for(const row of stays.results){const id=Number(row.member_id),list=grouped.get(id)||[];list.push({from:String(row.started_at||''),to:String(row.ended_at||''),minutes:Number(row.duration_minutes||0),place:String(row.place_label||'未登録地点付近')});grouped.set(id,list);}
  return days.results.map(row=>({memberId:Number(row.member_id),name:String(row.name||'家族'),routePointCount:Number(row.route_point_count||0),stays:grouped.get(Number(row.member_id))||[]}));
}

async function readTasks(db:D1Database,familyId:number,date:string):Promise<TaskSummary[]>{
  const rows=await db.prepare(`SELECT task_id,title,member_id,member_name,occurred_at FROM (SELECT h.task_id,t.title,h.member_id,m.name member_name,h.action,h.occurred_at,h.id,ROW_NUMBER() OVER(PARTITION BY h.task_id,h.member_id ORDER BY h.occurred_at DESC,h.id DESC) rn FROM task_completion_history h JOIN tasks t ON t.id=h.task_id AND t.family_id=? AND t.visibility_scope='FAMILY' JOIN members m ON m.id=h.member_id AND m.family_id=t.family_id WHERE date(h.occurred_at)=? AND (t.task_kind IS NULL OR lower(t.task_kind)<>'event')) latest WHERE rn=1 AND action='COMPLETED' ORDER BY occurred_at,id LIMIT ?`).bind(familyId,date,MAX_ITEMS).all<Row>();
  return rows.results.map(row=>({taskId:Number(row.task_id),title:String(row.title||'タスク'),memberId:Number(row.member_id),memberName:String(row.member_name||'家族'),completedAt:String(row.occurred_at||'')}));
}

async function readHousework(db:D1Database,familyId:number,date:string):Promise<HouseworkSummary[]>{
  const rows=await db.prepare(`SELECT l.value_text,l.created_by,m.name member_name,l.occurred_at FROM family_logs l LEFT JOIN members m ON m.id=l.created_by AND m.family_id=l.family_id WHERE l.family_id=? AND l.log_type='HOUSEWORK' AND l.deleted_at IS NULL AND date(l.occurred_at)=? ORDER BY l.occurred_at,l.id LIMIT ?`).bind(familyId,date,MAX_ITEMS).all<Row>();
  return rows.results.map(row=>({name:String(row.value_text||'家事'),memberId:Number(row.created_by||0),memberName:String(row.member_name||'家族'),occurredAt:String(row.occurred_at||'')}));
}

function summaryDetails(values:string[]):string{
  const seen=new Set<string>(),out:string[]=[];
  for(const value of values){const normalized=String(value||'').trim().replace(/\s+/g,' ').slice(0,MAX_SUMMARY_DETAIL_CHARS);if(!normalized||seen.has(normalized))continue;seen.add(normalized);out.push(normalized);if(out.length>=MAX_SUMMARY_DETAILS)break;}
  return out.join('・');
}

function summary(location:LocationSummary[],tasks:TaskSummary[],housework:HouseworkSummary[]):string{
  const out:string[]=[];
  if(location.length){const stays=location.flatMap(member=>member.stays),details=summaryDetails(stays.map(stay=>stay.place));out.push(`位置記録${location.length}人分・滞在${stays.length}件${details?`（${details}）`:''}。`);}
  if(tasks.length){const details=summaryDetails(tasks.map(task=>task.title));out.push(`完了タスク${tasks.length}件${details?`（${details}）`:''}。`);}
  if(housework.length){const details=summaryDetails(housework.map(item=>item.name));out.push(`家事${housework.length}件${details?`（${details}）`:''}。`);}
  return out.join('')||'この日は、日次総括に残す記録がありませんでした。';
}

export async function generateFamilyDailyJournal(db:D1Database,familyId:number,date:string):Promise<void>{
  if(!Number.isSafeInteger(familyId)||familyId<=0||!validDate(date)||date>=todayJst())return;
  const [location,tasks,housework]=await Promise.all([readLocation(db,familyId,date),readTasks(db,familyId,date),readHousework(db,familyId,date)]),now=new Date().toISOString();
  await db.prepare(`INSERT INTO family_daily_journals(family_id,journal_date,summary_text,location_json,tasks_json,housework_json,generated_at,updated_at,content_version,storage_tier,archive_object_key,archived_at) VALUES(?,?,?,?,?,?,?,?,1,'HOT',NULL,NULL) ON CONFLICT(family_id,journal_date) DO UPDATE SET summary_text=excluded.summary_text,location_json=excluded.location_json,tasks_json=excluded.tasks_json,housework_json=excluded.housework_json,generated_at=excluded.generated_at,updated_at=excluded.updated_at,content_version=family_daily_journals.content_version+1 WHERE family_daily_journals.storage_tier='HOT'`).bind(familyId,date,summary(location,tasks,housework),JSON.stringify(location),JSON.stringify(tasks),JSON.stringify(housework),now,now).run();
}

export async function generateFamilyDailyJournals(env:Env):Promise<void>{
  const families=await env.DB.prepare('SELECT id FROM families ORDER BY id LIMIT ?').bind(MAX_FAMILIES).all<Row>(),yesterday=shiftDate(todayJst(),-1),dates=Array.from({length:REPAIR_DAYS},(_,i)=>shiftDate(yesterday,-i)),nowMs=Date.now();
  for(const row of families.results){
    const id=Number(row.id);if(!Number.isSafeInteger(id)||id<=0)continue;
    const freshDates=new Set<string>();
    try{const existing=await env.DB.prepare(`SELECT journal_date,generated_at FROM family_daily_journals WHERE family_id=? AND storage_tier='HOT' AND journal_date>=? AND journal_date<=? ORDER BY journal_date`).bind(id,dates[dates.length-1],dates[0]).all<Row>();for(const journal of existing.results){if(journalFresh(journal.generated_at,nowMs))freshDates.add(String(journal.journal_date));}}catch{}
    for(const date of dates){if(freshDates.has(date))continue;try{await generateFamilyDailyJournal(env.DB,id,date);}catch{}}
  }
}

function calendar(month:string,rows:Map<string,Row>,selected:string):string{
  const first=new Date(`${month}-01T12:00:00Z`),days=new Date(Date.UTC(first.getUTCFullYear(),first.getUTCMonth()+1,0,12)).getUTCDate(),cells:string[]=[];
  for(let i=0;i<(first.getUTCDay()+6)%7;i+=1)cells.push('<div class="family-journal-day muted"></div>');
  for(let day=1;day<=days;day+=1){const date=`${month}-${String(day).padStart(2,'0')}`,row=rows.get(date),tasks=parseArray<TaskSummary>(row?.tasks_json).length,chores=parseArray<HouseworkSummary>(row?.housework_json).length,stays=parseArray<LocationSummary>(row?.location_json).reduce((n,m)=>n+m.stays.length,0);cells.push(`<a class="family-journal-day${row?' has-entry':''}${date===selected?' selected':''}" href="/app/family_journal.php?month=${month}&date=${date}"><strong>${day}</strong>${row?`<small>${tasks?'✅'+tasks+' ':''}${chores?'🧹'+chores+' ':''}${stays?'📍'+stays:''}</small>`:''}</a>`);}return cells.join('');
}

export async function familyDailyJournalPage(request:Request,ctx:AppContext):Promise<Response>{
  if(!ctx.member)throw new AuthRequired();const familyId=Number(ctx.member.family_id);if(!Number.isSafeInteger(familyId)||familyId<=0)throw new AuthRequired();
  const url=new URL(request.url),today=todayJst(),month=String(url.searchParams.get('month')||today.slice(0,7));if(!validMonth(month))throw new BadRequest('月の指定が不正です。');
  const asked=String(url.searchParams.get('date')||''),selectedDate=validDate(asked)&&asked.startsWith(`${month}-`)?asked:'';
  const monthRows=await ctx.env.DB.prepare('SELECT journal_date,summary_text,location_json,tasks_json,housework_json FROM family_daily_journals WHERE family_id=? AND storage_tier=\'HOT\' AND journal_date>=? AND journal_date<? ORDER BY journal_date').bind(familyId,`${month}-01`,`${shiftMonth(month,1)}-01`).all<Row>(),byDate=new Map(monthRows.results.map(row=>[String(row.journal_date),row])),selected=selectedDate?byDate.get(selectedDate):undefined;
  const q=String(url.searchParams.get('q')||'').trim().slice(0,80),pattern=`%${q.replaceAll('\\','\\\\').replaceAll('%','\\%').replaceAll('_','\\_')}%`;
  const found=q?await ctx.env.DB.prepare(`SELECT journal_date,summary_text FROM family_daily_journals WHERE family_id=? AND storage_tier='HOT' AND summary_text LIKE ? ESCAPE '\\' ORDER BY journal_date DESC LIMIT ?`).bind(familyId,pattern,MAX_SEARCH).all<Row>():{results:[] as Row[]};
  const location=parseArray<LocationSummary>(selected?.location_json),tasks=parseArray<TaskSummary>(selected?.tasks_json),housework=parseArray<HouseworkSummary>(selected?.housework_json);
  const search=q?`<section class="card"><h2>「${esc(q)}」の振り返り</h2>${found.results.length?found.results.map(r=>`<a class="journal-result" href="/app/family_journal.php?month=${esc(String(r.journal_date).slice(0,7))}&date=${esc(r.journal_date)}"><strong>${esc(r.journal_date)}</strong><span>${esc(r.summary_text)}</span></a>`).join(''):'<p class="small">一致する総括はありません。</p>'}</section>`:'';
  const detail=selected?`<section class="card"><h2>${esc(selectedDate)} の総括</h2><p>${esc(selected.summary_text)}</p></section><section class="card"><h2>📍 移動・滞在</h2>${location.length?location.map(m=>`<div class="journal-member"><strong>${esc(m.name)}</strong><small> 簡略ルート${m.routePointCount}点</small>${m.stays.map(s=>`<p>${esc(timeOnly(s.from))}〜${esc(timeOnly(s.to))} ${esc(s.place)}・${s.minutes}分</p>`).join('')||'<p class="small">まとまった滞在なし</p>'}</div>`).join(''):'<p class="small">位置記録なし</p>'}</section><section class="card"><h2>✅ 完了タスク</h2>${tasks.map(t=>`<p>${esc(timeOnly(t.completedAt))} ${esc(t.title)} <small>・${esc(t.memberName)}</small></p>`).join('')||'<p class="small">完了タスクなし</p>'}</section><section class="card"><h2>🧹 家事</h2>${housework.map(h=>`<p>${esc(timeOnly(h.occurredAt))} ${esc(h.name)} <small>・${esc(h.memberName)}</small></p>`).join('')||'<p class="small">家事記録なし</p>'}</section>`:'<section class="card"><p class="small">日付を選ぶと、その日の総括を表示します。総括は翌日以降に自動生成します。</p></section>';
  const body=`<div class="page-head"><h1>📘 家族日記</h1><a class="btn gray small" href="/app/family_log.php">家族ログへ</a></div><p class="small">移動・滞在、家族共有タスクの完了、家事を1日単位で長期保存します。位置RAWは日記生成では削除しません。</p><form method="get" class="card"><label>日記を検索</label><div class="actions"><input name="q" maxlength="80" value="${esc(q)}" placeholder="場所・タスク・家事などで検索"><button class="btn small">検索</button></div></form>${search}<section class="card"><div class="section-head"><a class="btn gray small" href="?month=${shiftMonth(month,-1)}">‹ 前月</a><h2>${esc(month.replace('-','年'))}月</h2><a class="btn gray small" href="?month=${shiftMonth(month,1)}">翌月 ›</a></div><div class="journal-week"><span>月</span><span>火</span><span>水</span><span>木</span><span>金</span><span>土</span><span>日</span></div><div class="journal-grid">${calendar(month,byDate,selectedDate)}</div></section>${detail}<style>.journal-week,.journal-grid{display:grid;grid-template-columns:repeat(7,minmax(0,1fr));gap:4px}.journal-week span{text-align:center;font-size:12px}.family-journal-day{min-height:54px;padding:6px;border:1px solid #e5e7eb;border-radius:10px;text-decoration:none;color:inherit;display:flex;flex-direction:column;gap:3px}.family-journal-day.muted{border-color:transparent}.family-journal-day.selected{outline:2px solid currentColor}.family-journal-day small{font-size:10px}.journal-member{padding:8px 0;border-bottom:1px solid #eee}.journal-member p{margin:5px 0}.journal-result{display:flex;gap:12px;padding:8px 0;border-bottom:1px solid #eee;text-decoration:none;color:inherit}.journal-result span{flex:1}</style>`;
  const response=html(layout('家族日記',body,'/app/family_log.php'));response.headers.set('cache-control','no-store');return response;
}
