import assert from 'node:assert/strict';
import {database,context,loadTs} from './goods-category-test-support.mjs';
const db=database(),ctx=context(db),day='2026-09-23';
const create=(title,parentId=null,scope='FAMILY',owner=null,kind='TASK')=>Number(db.prepare(`INSERT INTO tasks(family_id,title,task_kind,parent_task_id,due_at,status,calendar_visible,visibility_scope,private_owner_id,created_at,updated_at) VALUES(1,?,?,?,?, 'pending',0,?,?,'2026-09-01','2026-09-01')`).run(title,kind,parentId,day,scope,owner).lastInsertRowid);
try{
 db.exec("INSERT INTO members(id,family_id,line_user_id,name,role,active,created_at,updated_at) VALUES(3,1,'goods-c','C','MEMBER',1,'2000-01-01','2000-01-01')");
 const parent=create('親');for(let n=0;n<3;n++)create('子'+n,parent);
 create('自分専用',null,'PRIVATE',1);create('他人専用',null,'PRIVATE',3);
 db.prepare("INSERT INTO shopping_items(family_id,name,due_date,status,created_at,updated_at) VALUES(1,? ,?,'pending','2026-09-01','2026-09-01')").run('買い物',day);
 db.prepare("INSERT INTO items(family_id,name,due_at,status,created_at,updated_at) VALUES(1,? ,?,'pending','2026-09-01','2026-09-01')").run('持ち物',day);
 db.prepare("INSERT INTO tasks(family_id,title,task_kind,start_at,due_at,calendar_visible,created_at,updated_at) VALUES(1,'イベント','EVENT',?, ?,1,'2026-09-01','2026-09-01')").run(`${day} 10:00:00`,`${day} 10:00:00`);
 const {calendar}=loadTs('src/calendar-page.ts');
 const html=await(await calendar(new Request('https://familytodo.test/app/calendar.php'),ctx,'2026-09')).text();
 const cell=html.match(/<button[^>]*class="calendar-cell[^>]*data-date="2026-09-23"[^>]*>(.*?)<\/button>/s)?.[1];
 assert(cell,'Date cell present');assert(cell.includes('✅🛒🎒 6件'),'Three children, one private Task of the owner, one shopping and one item count as six');
 assert(!cell.includes('親')&&!cell.includes('他人専用'),'Task titles are not individually displayed');
 assert(cell.includes('イベント'),'Events appear individually ahead of the summary');
 for(let n=0;n<2;n++){
  const task=db.prepare("INSERT INTO tasks(family_id,title,task_kind,start_at,end_at,calendar_visible,created_at,updated_at) VALUES(1,?,'RECURRING',?,?,0,'2026-09-01','2026-09-01')").run('定期'+n,`${day} 09:00:00`,`${day} 09:00:00`);
  db.prepare("INSERT INTO recurrence_rules(family_id,task_id,name,recurrence_type,start_date,end_date,created_at,updated_at) VALUES(1,?,?,'DAILY',?,?, '2026-09-01','2026-09-01')").run(task.lastInsertRowid,'定期'+n,day,day);
 }
 const recurringHtml=await(await calendar(new Request('https://familytodo.test/app/calendar.php'),ctx,'2026-09')).text();
 const recurringCell=recurringHtml.match(/<button[^>]*class="calendar-cell[^>]*data-date="2026-09-23"[^>]*>(.*?)<\/button>/s)?.[1];
 assert(recurringCell.includes('✅🛒🎒 8件'),'Recurring tasks count regardless of legacy Calendar visibility');
 const redirect=await calendar(new Request('https://familytodo.test/app/calendar.php?open='+day),ctx,'2026-09');assert.equal(redirect.headers.get('location'),'/app/tasks.php?date='+day);
}finally{db.close()}
console.log('Calendar summary: children replace parent; Shopping/Item combined; private Task owner only; date opens Checklist');
