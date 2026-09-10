import type {AppContext} from './app-context';
import {AuthRequired, BadRequest} from './errors';
import {layout} from './app-shell';
import {html} from './response';

type Row=Record<string,unknown>;
type LocationMemberSummary={memberId:number;name:string;routePointCount:number;rawPointCount:number;stays:Array<{from:string;to:string;minutes:number;place:string}>};
type TaskSummary={taskId:number;title:string;memberId:number;memberName:string;completedAt:string};
type HouseworkSummary={name:string;memberId:number;memberName:string;occurredAt:string};

const MAX_FAMILIES_PER_RUN=40;
const REPAIR_DAYS=7;
const MAX_TASKS_PER_DAY=200;
const MAX_HOUSEWORK_PER_DAY=200;
const MAX_SEARCH_RESULTS=50;

const esc=(value:unknown)=>String(value??'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&#39;');
const validDate=(value:string)=>/^\d{4}-\d{2}-\d{2}$/.test(value)&&Number.isFinite(Date.parse(`${value}T00:00:00Z`));
const validMonth=(value:string)=>/^\d{4}-\d{2}$/.test(value)&&Number.isFinite(Date.parse(`${value}-01T00:00:00Z`));
const dateShift=(date:string,days:number)=>{const d=new Date(`${date}T12:00:00Z`);d.setUTCDate(d.getUTCDate()+days);return d.toISOString().slice(0,10);};
const monthShift=(month:string,delta:number)=>{const d=new Date(`${month}-01T12:00:00Z`);d.setUTCMonth(d.getUTCMonth()+delta);return d.toISOString().slice(0,7);};
const todayJst=()=>new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Tokyo',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
const nowIso=()=>new Date().toISOString();

function safeArray<T>(raw:unknown):T[]{
  try{const value=JSON.parse(String(raw??'[]'));return Array.isArray(value)?value as T[]:[];}catch{return [];}
}

async function readLocationSummary(db:D1Database,familyId:number,date:string):Promise<LocationMemberSummary[]>{
  const days=await db.prepare(`
    SELECT a.member_id,m.name,a.raw_point_count,a.route_point_count
    FROM location_history_archive_days a
    JOIN members m ON m.id=a.member_id AND m.family_id=a.family_id
    WHERE a.family_id=? AND a.local_date=?
    ORDER BY m.id
  `).bind(familyId,date).all<Row>();
  const stays=await db.prepare(`
    SELECT s.member_id,s.started_at,s.ended_at,s.duration_minutes,
           COALESCE(NULLIF(s.address_label,''),s.place_label) place_label
    FROM location_history_stays s
    WHERE s.family_id=? AND s.local_date=?
    ORDER BY s.member_id,s.started_at,s.id
    LIMIT 300
  `).bind(familyId,date).all<Row>();
  const byMember=new Map<number,Array<{from:string;to:string;minutes:number;place:string}>>();
  for(const row of stays.results){
    const memberId=Number(row.member_id),list=byMember.get(memberId)||[];
    list.push({from:String(row.started_at||''),to:String(row.ended_at||''),minutes:Number(row.duration_minutes||0),place:String(row.place_label||'未登録地点付近')});
    byMember.set(memberId,list);
  }
  return days.results.map(row=>({
    memberId:Number(row.member_id),name:String(row.name||'家族'),rawPointCount:Number(row.raw_point_count||0),
    routePointCount:Number(row.route_point_count||0),stays:byMember.get(Number(row.member_id))||[],
  }));
}

async function readCompletedTasks(db:D1Database,familyId:number,date:string):Promise<TaskSummary[]>{
  const rows=await db.prepare(`
    SELECT task_id,title,member_id,member_name,occurred_at
    FROM (
      SELECT h.task_id,t.title,h.member_id,m.name member_name,h.action,h.occurred_at,h.id,
             ROW_NUMBER() OVER(PARTITION BY h.task_id,h.member_id ORDER BY h.occurred_at DESC,h.id DESC) rn
      FROM task_completion_history h
      JOIN tasks t ON t.id=h.task_id AND t.family_id=? AND t.visibility_scope='FAMILY'
      JOIN members m ON m.id=h.member_id AND m.family_id=t.family_id
      WHERE date(h.occurred_at)=?
        AND (t.task_kind IS NULL OR lower(t.task_kind)<>'event')
    ) latest
    WHERE rn=1 AND action='COMPLETED'
    ORDER BY occurred_at,id
    LIMIT ?
  `).bind(familyId,date,MAX_TASKS_PER_DAY).all<Row>();
  return rows.results.map(row=>({taskId:Number(row.task_id),title:String(row.title||'タスク'),memberId:Number(row.member_id),memberName:String(row.member_name||'家族'),completedAt:String(row.occurred_at||'')}));
}

async function readHousework(db:D1Database,familyId:number,date:string):Promise<HouseworkSummary[]>{
  const rows=await db.prepare(`
    SELECT l.value_text,l.created_by,m.name member_name,l.occurred_at
    FROM family_logs l
    LEFT JOIN members m ON m.id=l.created_by AND m.family_id=l.family_id
    WHERE l.family_id=? AND l.log_type='HOUSEWORK' AND l.deleted_at IS NULL AND date(l.occurred_at)=?
    ORDER BY l.occurred_at,l.id
    LIMIT ?
  `).bind(familyId,date,MAX_HOUSEWORK_PER_DAY).all<Row>();
  return rows.results.map(row=>({name:String(row.value_text||'家事'),memberId:Number(row.created_by||0),memberName:String(row.member_name||'家族'),occurredAt:String(row.occurred_at||'')}));
}

function buildSummary(location:LocationMemberSummary[],tasks:TaskSummary[],housework:HouseworkSummary[]):string{
  const parts:string[]=[];
  if(location.length){
    const stayCount=location.reduce((sum,member)=>sum+member.stays.length,0);
    const movers=location.filter(member=>member.routePointCount>0).map(member=>member.name);
    parts.push(`位置記録は${movers.length}人分、滞在${stayCount}件をまとめました${movers.length?`（${movers.slice(0,4).join('、')}）`:''}。`);
  }
  if(tasks.length){
    const names=[...new Set(tasks.map(task=>task.memberName))];
    parts.push(`完了タスクは${tasks.length}件${names.length?`（${names.slice(0,4).join('、')}）`:''}。`);
  }
  if(housework.length){
    const names=[...new Set(housework.map(chore=>chore.memberName))];
    parts.push(`家事は${housework.length}件${names.length?`（${names.slice(0,4).join('、')}）`:''}。`);
  }
  return parts.join('')||'この日は、日次総括に残す記録がありませんでした。';
}

export async function generateFamilyDailyJournal(db:D1Database,familyId:number,date:string):Promise<void>{
  if(!Number.isSafeInteger(familyId)||familyId<=0||!validDate(date)||date>=todayJst())return;
  const [location,tasks,housework]=await Promise.all([
    readLocationSummary(db,familyId,date),readCompletedTasks(db,familyId,date),readHousework(db,familyId,date),
  ]);
  const generatedAt=nowIso();
  await db.prepare(`
    INSERT INTO family_daily_journals(
      family_id,journal_date,summary_text,location_json,tasks_json,housework_json,
      generated_at,updated_at,content_version,storage_tier,archive_object_key,archived_at
    ) VALUES(?,?,?,?,?,?,?,?,1,'HOT',NULL,NULL)
    ON CONFLICT(family_id,journal_date) DO UPDATE SET
      summary_text=excluded.summary_text,
      location_json=excluded.location_json,
      tasks_json=excluded.tasks_json,
      housework_json=excluded.housework_json,
      generated_at=excluded.generated_at,
      updated_at=excluded.updated_at,
      content_version=family_daily_journals.content_version+1
    WHERE family_daily_journals.storage_tier='HOT'
  `).bind(familyId,date,buildSummary(location,tasks,housework),JSON.stringify(location),JSON.stringify(tasks),JSON.stringify(housework),generatedAt,generatedAt).run();
}

/** Refresh yesterday plus a bounded repair window for late edits/completions. */
export async function generateFamilyDailyJournals(env:Env):Promise<void>{
  const families=await env.DB.prepare(`SELECT id FROM families ORDER BY id LIMIT ?`).bind(MAX_FAMILIES_PER_RUN).all<Row>();
  const yesterday=dateShift(todayJst(),-1);
  for(const family of families.results){
    const familyId=Number(family.id);if(!Number.isSafeInteger(familyId)||familyId<=0)continue;
    for(let offset=0;offset<REPAIR_DAYS;offset+=1){
      try{await generateFamilyDailyJournal(env.DB,familyId,dateShift(yesterday,-offset));}catch{/* One family/day must not stop the bounded repair pass. */}
    }
  }
}

function calendarCells(month:string,byDate:Map<string,Row>,selectedDate:string):string{
  const first=new Date(`${month}-01T12:00:00Z`),year=first.getUTCFullYear(),monthIndex=first.getUTCMonth();
  const days=new Date(Date.UTC(year,monthIndex+1,0,12)).getUTCDate();
  const mondayOffset=(first.getUTCDay()+6)%7;
  const cells:string[]=[];
  for(let i=0;i<mondayOffset;i+=1)cells.push('<div class="family-journal-day muted" aria-hidden="true"></div>');
  for(let day=1;day<=days;day+=1){
    const date=`${month}-${String(day).padStart(2,'0')}`,row=byDate.get(date);
    const tasks=safeArray<TaskSummary>(row?.tasks_json).length,chores=safeArray<HouseworkSummary>(row?.housework_json).length,location=safeArray<LocationMemberSummary>(row?.location_json);
    const stays=location.reduce((sum,item)=>sum+item.stays.length,0);
    const meta=row?`<small>${tasks?'✅'+tasks+' ':''}${chores?'🧹'+chores+' ':''}${stays?'📍'+stays:''}</small>`:'';
    cells.push(`<a class="family-journal-day${date===selectedDate?' selected':''}${row?' has-entry':''}" href="/app/family_journal.php?month=${month}&date=${date}"><strong>${day}</strong>${meta}</a>`);
  }
  return cells.join('');
}

function timeOnly(value:string):string{return /^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}/.test(value)?value.slice(11,16):'';}

export async function familyDailyJournalPage(request:Request,ctx:AppContext):Promise<Response>{
  const member=ctx.member;if(!member)throw new AuthRequired();
  const familyId=Number(member.family_id);if(!Number.isSafeInteger(familyId)||familyId<=0)throw new AuthRequired();
  const url=new URL(request.url),today=todayJst();
  const requestedMonth=String(url.searchParams.get('month')||today.slice(0,7));
  if(!validMonth(requestedMonth))throw new BadRequest('月の指定が不正です。');
  const requestedDate=String(url.searchParams.get('date')||'');
  const selectedDate=validDate(requestedDate)&&requestedDate.startsWith(`${requestedMonth}-`)?requestedDate:'';
  const monthRows=await ctx.env.DB.prepare(`SELECT journal_date,summary_text,location_json,tasks_json,housework_json,storage_tier FROM family_daily_journals WHERE family_id=? AND journal_date>=? AND journal_date<? ORDER BY journal_date`).bind(familyId,`${requestedMonth}-01`,`${monthShift(requestedMonth,1)}-01`).all<Row>();
  const byDate=new Map(monthRows.results.map(row=>[String(row.journal_date),row]));
  const selected=selectedDate?byDate.get(selectedDate):undefined;
  const q=String(url.searchParams.get('q')||'').trim().slice(0,80);
  const search=q?await ctx.env.DB.prepare(`SELECT journal_date,summary_text FROM family_daily_journals WHERE family_id=? AND storage_tier='HOT' AND summary_text LIKE ? ESCAPE '\\' ORDER BY journal_date DESC LIMIT ?`).bind(familyId,`%${q.replaceAll('\\','\\\\').replaceAll('%','\\%').replaceAll('_','\\_')}%`,MAX_SEARCH_RESULTS).all<Row>():{results:[] as Row[]};
  const location=safeArray<LocationMemberSummary>(selected?.location_json),tasks=safeArray<TaskSummary>(selected?.tasks_json),housework=safeArray<HouseworkSummary>(selected?.housework_json);
  const detail=selected?`<section class="card"><h2>${esc(selectedDate)} の総括</h2><p>${esc(selected.summary_text)}</p></section>
    <section class="card"><h2>📍 移動・滞在</h2>${location.length?location.map(item=>`<div class="family-journal-member"><strong>${esc(item.name)}</strong><small>簡略ルート ${item.routePointCount}点</small>${item.stays.length?item.stays.map(stay=>`<p>${esc(timeOnly(stay.from))}〜${esc(timeOnly(stay.to))} ${esc(stay.place)}・${stay.minutes}分</p>`).join(''):'<p class="small">まとまった滞在記録なし</p>'}</div>`).join(''):'<p class="small">位置記録なし</p>'}<a class="btn gray small" href="/app/location.php">位置情報を開く</a></section>
    <section class="card"><h2>✅ 完了タスク</h2>${tasks.length?tasks.map(task=>`<p>${esc(timeOnly(task.completedAt))} ${esc(task.title)} <small>・${esc(task.memberName)}</small></p>`).join(''):'<p class="small">完了タスクなし</p>'}</section>
    <section class="card"><h2>🧹 家事</h2>${housework.length?housework.map(chore=>`<p>${esc(timeOnly(chore.occurredAt))} ${esc(chore.name)} <small>・${esc(chore.memberName)}</small></p>`).join(''):'<p class="small">家事記録なし</p>'}</section>`:'<section class="card"><p class="small">カレンダーの日付を選ぶと、その日の総括を表示します。日次総括は翌日以降に自動生成されます。</p></section>';
  const searchHtml=q?`<section class="card"><h2>「${esc(q)}」の振り返り</h2>${search.results.length?search.results.map(row=>`<a class="family-journal-search-row" href="/app/family_journal.php?month=${esc(String(row.journal_date).slice(0,7))}&date=${esc(row.journal_date)}"><strong>${esc(row.journal_date)}</strong><span>${esc(row.summary_text)}</span></a>`).join(''):'<p class="small">一致する総括はありません。</p>'}</section>`:'';
  const body=`<div class="page-head"><h1>📘 家族日記</h1><a class="btn gray small" href="/app/family_log.php">家族ログへ</a></div>
    <p class="small">移動・滞在、家族共有タスクの完了、家事を1日単位で固定して振り返れます。位置RAWはこの日記生成では削除しません。</p>
    <form method="get" class="card"><label>日記を検索</label><div class="actions"><input name="q" value="${esc(q)}" maxlength="80" placeholder="総括の言葉で検索"><button type="submit" class="btn small">検索</button></div></form>${searchHtml}
    <section class="card family-journal-calendar"><div class="section-head"><a class="btn gray small" href="/app/family_journal.php?month=${monthShift(requestedMonth,-1)}">‹ 前月</a><h2>${esc(requestedMonth.replace('-','年'))}月</h2><a class="btn gray small" href="/app/family_journal.php?month=${monthShift(requestedMonth,1)}">翌月 ›</a></div><div class="family-journal-week"><span>月</span><span>火</span><span>水</span><span>木</span><span>金</span><span>土</span><span>日</span></div><div class="family-journal-grid">${calendarCells(requestedMonth,byDate,selectedDate)}</div></section>${detail}
    <style>.family-journal-week,.family-journal-grid{display:grid;grid-template-columns:repeat(7,minmax(0,1fr));gap:4px}.family-journal-week span{text-align:center;font-size:12px}.family-journal-day{min-height:54px;padding:6px;border:1px solid #e5e7eb;border-radius:10px;text-decoration:none;color:inherit;display:flex;flex-direction:column;gap:3px}.family-journal-day.has-entry{background:#fff}.family-journal-day.selected{outline:2px solid currentColor}.family-journal-day small{font-size:10px;line-height:1.2}.family-journal-day.muted{border-color:transparent}.family-journal-member{padding:8px 0;border-bottom:1px solid #eee}.family-journal-member>small{margin-left:8px}.family-journal-member p{margin:5px 0}.family-journal-search-row{display:flex;gap:12px;padding:8px 0;border-bottom:1px solid #eee;text-decoration:none;color:inherit}.family-journal-search-row span{flex:1}</style>`;
  return html(layout('家族日記',body,'/app/family_log.php'),200,{'cache-control':'no-store'});
}
