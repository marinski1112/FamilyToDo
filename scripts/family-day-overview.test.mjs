import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {DatabaseSync} from 'node:sqlite';
import {dailySummaryRedirect,isDailySummaryDate} from '../src/daily-view-policy.ts';
import {familyDayOverview,familyDayHeader} from '../src/family-day-overview.ts';
import {familyDailyJournalPageWithAi} from '../src/family-daily-journal-ai-page.ts';
import {formatFamilyDateTime} from '../src/timezone.ts';
function db(dir){const sql=new DatabaseSync(':memory:');for(const file of fs.readdirSync(dir).filter(x=>x.endsWith('.sql')).sort())sql.exec(fs.readFileSync(`${dir}/${file}`,'utf8'));
 const calls=[];const wrap=(q,args=[])=>({bind(...v){return wrap(q,v);},async first(){calls.push(q);return sql.prepare(q).get(...args)||null;},async all(){calls.push(q);return {results:sql.prepare(q).all(...args)};},async run(){throw Error('page must never write');}});return {sql,calls,DB:{prepare:wrap}};}
function fixture(){const main=db('migrations'),meals=db('meals-migrations');main.sql.exec("INSERT INTO families(id,family_code,name,created_at,updated_at) VALUES(1,'f1','f1','x','x'),(2,'f2','f2','x','x'); INSERT INTO members(id,family_id,line_user_id,name,role,active,created_at,updated_at) VALUES(1,1,'m1','m1','OWNER',1,'x','x'),(2,1,'m2','m2','MEMBER',1,'x','x'),(3,2,'m3','m3','OWNER',1,'x','x');");return {main,meals,ctx:{env:{DB:main.DB,MEALS_DB:meals.DB,MEALS_ENABLED:'true',APP_TIMEZONE:'Asia/Tokyo'},member:{id:1,family_id:1,role:'OWNER',active:1},session:{csrfToken:'fixture'}}};}
const date='2026-10-03',today='2026-10-05';
test('calendar cutoff keeps yesterday and future editable through month/year/leap boundaries',()=>{
 for(const [d,t,expected] of [[date,today,true],['2026-10-04',today,false],[today,today,false],['2026-10-06',today,false],['2025-12-30','2026-01-01',true],['2024-02-29','2024-03-02',true],['2024-03-01','2024-03-02',false],['2026-02-30',today,false]])assert.equal(isDailySummaryDate(d,t),expected);
 const instant=new Date('2026-10-05T16:00:00Z');assert.equal(isDailySummaryDate('2026-10-04',formatFamilyDateTime(instant,'Asia/Tokyo').slice(0,10)),true);assert.equal(isDailySummaryDate('2026-10-04',formatFamilyDateTime(instant,'America/Los_Angeles').slice(0,10)),false);
 const get=new Request('https://fixture.invalid/app/tasks.php?date='+date);
 assert.equal(dailySummaryRedirect(get,date,today,true),'/app/family_journal.php?month=2026-10&date=2026-10-03&view=day');assert.equal(dailySummaryRedirect(get,date,today,false),null);assert.equal(dailySummaryRedirect(new Request(get.url,{method:'POST'}),date,today,true),null);assert.equal(dailySummaryRedirect(new Request(get.url+'&overdue=tasks'),date,today,true),null);
 assert(familyDayHeader(date,today).includes('/app/tasks.php?date=2026-10-04'));
});
test('overview isolates family and private tasks, escapes text, retains pending and separates planned/cooked revisions',async()=>{
 const {main,meals,ctx}=fixture();const ins=main.sql.prepare("INSERT INTO tasks(id,family_id,title,status,task_kind,due_at,created_by,created_at,updated_at,visibility_scope,private_owner_id) VALUES(?, ?, ?, 'pending', ?, ?, ?, 'x','x',?,?)");
 ins.run(1,1,'event <script>','event',date+' 12:00:00',1,'FAMILY',null);ins.run(2,1,'pending reminder','task',date+' 13:00:00',1,'FAMILY',null);ins.run(3,1,'hidden private','event',date+' 12:00:00',2,'PRIVATE',2);ins.run(4,2,'other family','event',date+' 12:00:00',3,'FAMILY',null);ins.run(5,1,'my private','event',date+' 12:00:00',1,'PRIVATE',1);
 meals.sql.prepare("INSERT INTO weekly_plans VALUES(1,'2026-09-28','current','CONFIRMED',?,'hash',1,'x')").run(JSON.stringify([{date,servings:2,recipe:{name:'planned recipe'},sides:[{name:'side'}]}]));meals.sql.prepare("INSERT INTO cooked_events(family_id,meal_date,plan_revision,cooked_by,cooked_at) VALUES(1,?,'old',1,'x')").run(date);
 const before=main.sql.prepare('SELECT * FROM tasks').all();let html=await familyDayOverview(ctx,date,today);assert(html.includes('event &lt;script&gt;'));assert(!html.includes('hidden private'));assert(!html.includes('other family'));assert(html.includes('my private'));assert(html.includes('pending reminder'));assert(html.includes('planned recipe ／ side'));assert(html.includes('別の版の献立'));assert(!html.includes('現在の献立に対する調理済みの記録があります'));assert.deepEqual(main.sql.prepare('SELECT * FROM tasks').all(),before);
 meals.sql.prepare("INSERT INTO cooked_events(family_id,meal_date,plan_revision,cooked_by,cooked_at) VALUES(1,?,'current',1,'x')").run(date);html=await familyDayOverview(ctx,date,today);assert(html.includes('現在の献立に対する調理済みの記録があります'));
});
test('logs obey adult display setting and never include deleted or other-family rows',async()=>{
 const {main,ctx}=fixture();main.sql.exec("INSERT INTO family_log_subjects(id,family_id,name,subject_kind,active,created_by,created_at,updated_at) VALUES(1,1,'adult','ADULT',1,1,'x','x'),(2,1,'child','CHILD',1,1,'x','x'); INSERT INTO family_log_settings(family_id,show_adult_logs,created_at,updated_at) VALUES(1,0,'x','x');");
 const ins=main.sql.prepare("INSERT INTO family_logs(family_id,subject_id,log_type,occurred_at,value_text,created_by,created_at,updated_at,deleted_at) VALUES(?,?,'MEMO',?,?,1,'x','x',?)");ins.run(1,1,date+' 12:00:00','adult hidden',null);ins.run(1,2,date+' 12:00:00','visible <note>',null);ins.run(1,2,date+' 12:00:00','deleted','x');ins.run(2,null,date+' 12:00:00','other family',null);
 const html=await familyDayOverview(ctx,date,today);assert(html.includes('visible &lt;note&gt;'));assert(!html.includes('adult hidden'));assert(!html.includes('deleted'));assert(!html.includes('other family'));
});
test('a failed source is marked unavailable while other sections remain visible',async()=>{
 const {ctx}=fixture();ctx.env.MEALS_DB={prepare(){throw Error('offline');}};const html=await familyDayOverview(ctx,date,today);assert(html.includes('読み込めませんでした'));assert(html.includes('予定'));assert(html.includes('家族ログ'));assert(!html.includes('調理済みの記録はありません'));
});
test('day view without a saved journal is explicit and does not repair, write or read AI',async()=>{
 const {ctx,main,meals}=fixture();const req=new Request('https://fixture.invalid/app/family_journal.php?date=2026-09-03&view=day');ctx.request=req;const response=await familyDailyJournalPageWithAi(req,ctx);assert.equal(response.status,200);assert.equal(response.headers.get('cache-control'),'no-store');const html=await response.text();assert(html.includes('その日の総括'));assert(html.includes('2026-09-03'));assert(html.includes('記録がないとは限りません'));assert(html.includes('日付'));assert.equal(main.sql.prepare('SELECT count(*) n FROM family_daily_journals').get().n,0);assert([...main.calls,...meals.calls].every(q=>!q.includes('ai_summary_text')));
 const now=new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Tokyo',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());const redirect=await familyDailyJournalPageWithAi(new Request('https://fixture.invalid/app/family_journal.php?date='+now+'&view=day'),ctx);assert.equal(redirect.status,302);assert.equal(redirect.headers.get('location'),'/app/tasks.php?date='+now);
});
test('saved history remains untouched and day view avoids broad location inference and cached AI',async()=>{
 const {ctx,main}=fixture();main.sql.prepare("INSERT INTO family_daily_journals(family_id,journal_date,summary_text,location_json,tasks_json,housework_json,generated_at,updated_at) VALUES(1,?,'old',?,?,?,'x','x')").run(date,JSON.stringify([{memberId:1,name:'member',routePointCount:2,stays:[{from:date+'T00:00:00Z',to:date+'T00:10:00Z',minutes:10,place:'自宅'}]}]),JSON.stringify([{taskId:1,title:'saved complete',memberId:1,memberName:'member',completedAt:date+' 13:00:00'}]),'[]');
 main.sql.exec("UPDATE family_daily_journals SET ai_status='AI_OK',ai_summary_text='cached story'");const before=main.sql.prepare('SELECT * FROM family_daily_journals').all();const req=new Request('https://fixture.invalid/app/family_journal.php?date='+date+'&view=day');ctx.request=req;const html=await (await familyDailyJournalPageWithAi(req,ctx)).text();assert(html.includes('saved complete'));assert(html.includes('自宅・10分'));assert(html.includes('取得できない時間の滞在を示しません'));assert(!html.includes('cached story'));assert(!html.includes('自宅で過ごしました'));assert.deepEqual(main.sql.prepare('SELECT * FROM family_daily_journals').all(),before);
});
