import fs from 'node:fs';
import {spawnSync} from 'node:child_process';

const index=fs.readFileSync('src/index.ts','utf8');
const apiRoutes=fs.readFileSync('src/context-api-routes.ts','utf8');
const taskApi=fs.readFileSync('src/task-api.ts','utf8');
const taskCreate=fs.readFileSync('src/task-create.ts','utf8');
const idempotency=fs.readFileSync('src/task-create-idempotency.ts','utf8');
const migration=fs.readFileSync('migrations/0090_task_create_idempotency.sql','utf8');
const manual=fs.readFileSync('public/assets/task-entry-manual.js','utf8');
const roughSave=fs.readFileSync('public/assets/task-rough-input-save.js','utf8');
const entryPage=fs.readFileSync('src/task-entry-page.ts','utf8');
const shell=fs.readFileSync('src/app-shell.ts','utf8');

if(!apiRoutes.includes("import { taskApi } from './task-api';")) throw new Error('context API dispatcher must import task API module');
if(index.includes('async function taskApi(')||index.includes('function calendarVisibleFlag(')) throw new Error('task API implementation/helper must not remain in index.ts');
if(!apiRoutes.includes("if(url.pathname==='/api/task') return await taskApi(request,context);")) throw new Error('task API route wiring changed');
if(!taskApi.includes('export async function taskApi(request:Request,ctx:any):Promise<Response>{')) throw new Error('task API module must export taskApi');
for(const sentinel of [
  "if(request.method==='DELETE')",
  "String(ctx.session.csrfToken||'')",
  "taskVisibilitySql('t')",
  'archiveRecurrenceRuleOccurrenceStatements',
  'archiveTaskCompletionStatements',
  'queueCalendarProjectionAfterMutation',
  'wakeCalendarOutbox',
  'buildStoredTaskRange',
  "reminderRaw && /^\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}$/",
  "visibility_scope,private_owner_id",
  'hasNonEmptyLegacyGoodsPayload',
  "code:'GOODS_LINKAGE_RETIRED'",
  'createTaskIdempotently(ctx.env.DB',
  "result.state==='CONFLICT'",
  "result.state==='GONE'",
  "IDEMPOTENCY_TARGET_DELETED",
  "result.state==='BUSY'",
  "result.state==='LEASE_LOST'",
  "replayed:result.state==='REPLAY'",
]){
  if(!taskApi.includes(sentinel)) throw new Error(`task API behavior sentinel missing: ${sentinel}`);
}
for(const retired of [
  'archiveShoppingCompletionStatements',
  'archiveItemCompletionStatements',
  'INSERT INTO shopping_items',
  'INSERT INTO items',
  'DELETE FROM shopping_items',
  'DELETE FROM items',
]) if(taskApi.includes(retired)) throw new Error(`task API must not mutate linked goods: ${retired}`);

for(const sentinel of [
  "export const TASK_CREATE_SCOPE = 'TASK_CREATE_V1'",
  'TASK_CREATE_LEASE_MS = 120000',
  "| { state: 'GONE' }",
  'LEFT JOIN tasks t ON t.id=r.task_id AND t.family_id=r.family_id',
  'task_exists',
  'JOIN tasks t ON t.id=r.task_id AND t.family_id=r.family_id',
  'UNIQUE (family_id, member_id, scope, idempotency_key)',
  'idx_tasks_create_request',
]){
  const source=sentinel.startsWith('UNIQUE')||sentinel.startsWith('idx_')?migration:idempotency;
  if(!source.includes(sentinel)) throw new Error(`task idempotency contract missing: ${sentinel}`);
}

for(const sentinel of [
  "const guard = `r.family_id=? AND r.member_id=? AND r.scope=? AND r.idempotency_key=? AND r.request_hash=? AND r.status='PROCESSING' AND r.lease_token=? AND COALESCE(r.lease_expires_at,'')>?`",
  'JOIN json_each(?) a',
  'db.batch(statements)',
  "SET status='DONE',task_id=(SELECT id FROM tasks WHERE create_request_id=task_create_requests.id)",
  'readCompletedTaskCreate',
  'markTaskCreateClaimError',
]){
  if(!taskCreate.includes(sentinel)) throw new Error(`atomic task create sentinel missing: ${sentinel}`);
}
for(const retired of ['TaskCreateShoppingInput','shoppingItems','itemNames','shoppingCategory','shopping_assignees','item_assignees']){
  if(taskCreate.includes(retired)) throw new Error(`atomic task create must remain goods-independent: ${retired}`);
}
if(taskCreate.includes('logTaskCreationCleanupFailure')) throw new Error('idempotent create must not depend on best-effort partial cleanup');
if(!manual.includes("'Idempotency-Key':taskCreateKey")) throw new Error('manual task create must send a stable idempotency key');
if(!roughSave.includes('row.dataset.taskCreateKey=crypto.randomUUID()')) throw new Error('rough task rows must own stable idempotency keys');
if(!roughSave.includes("idempotency_key:item.taskCreateKey||''")) throw new Error('rough task create payload must send the row idempotency key');
if(!roughSave.includes('resetTaskCreateKeys(rows);')) throw new Error('successful rough rollback must rotate task create keys before a new logical create');
if(!entryPage.includes('task-entry-manual.js?v=${APP_VERSION}-task-idem2')) throw new Error('manual idempotency asset must be cache-busted');
if(!shell.includes('task-rough-input-save.js?v=${APP_VERSION}-explicit-save1-${TASK_ENTRY_UI_REVISION}-task-idem1')) throw new Error('rough idempotency asset must be cache-busted');

const python=String.raw`
import sqlite3, pathlib
con=sqlite3.connect(':memory:')
con.execute('PRAGMA foreign_keys=ON')
con.executescript('''
CREATE TABLE families(id INTEGER PRIMARY KEY);
CREATE TABLE members(id INTEGER PRIMARY KEY,family_id INTEGER NOT NULL,FOREIGN KEY(family_id) REFERENCES families(id));
CREATE TABLE tasks(id INTEGER PRIMARY KEY AUTOINCREMENT,family_id INTEGER NOT NULL,title TEXT,created_by INTEGER);
INSERT INTO families(id) VALUES(1);
INSERT INTO members(id,family_id) VALUES(10,1);
''')
con.executescript(pathlib.Path('migrations/0090_task_create_idempotency.sql').read_text())
args=(1,10,'TASK_CREATE_V1','same-key','hash-a','PROCESSING','token-a','2099-01-01T00:00:00.000Z','2026-01-01T00:00:00.000Z','2026-01-01T00:00:00.000Z')
sql='''INSERT OR IGNORE INTO task_create_requests(family_id,member_id,scope,idempotency_key,request_hash,status,lease_token,lease_expires_at,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?)'''
assert con.execute(sql,args).rowcount==1
assert con.execute(sql,args[:-4]+('token-b',)+args[-3:]).rowcount==0
request_id=con.execute("SELECT id FROM task_create_requests WHERE idempotency_key='same-key'").fetchone()[0]
con.execute('INSERT INTO tasks(family_id,title,created_by,create_request_id) VALUES(1,\'once\',10,?)',(request_id,))
task_id=con.execute('SELECT id FROM tasks WHERE create_request_id=?',(request_id,)).fetchone()[0]
con.execute("UPDATE task_create_requests SET status='DONE',task_id=?,lease_token=NULL,lease_expires_at=NULL WHERE id=?",(task_id,request_id))
assert con.execute("SELECT task_id FROM task_create_requests WHERE family_id=1 AND member_id=10 AND scope='TASK_CREATE_V1' AND idempotency_key='same-key' AND request_hash='hash-a' AND status='DONE'").fetchone()[0]==task_id
assert con.execute("SELECT COUNT(*) FROM task_create_requests WHERE idempotency_key='same-key' AND request_hash='other-hash'").fetchone()[0]==0
try:
    con.execute('INSERT INTO tasks(family_id,title,created_by,create_request_id) VALUES(1,\'duplicate\',10,?)',(request_id,))
    raise AssertionError('duplicate create_request_id unexpectedly inserted')
except sqlite3.IntegrityError:
    pass
con.execute(sql,(1,10,'TASK_CREATE_V1','stale-key','hash-b','PROCESSING','old-token','2000-01-01T00:00:00.000Z','2026-01-01T00:00:00.000Z','2026-01-01T00:00:00.000Z'))
changed=con.execute("UPDATE task_create_requests SET lease_token='new-token',lease_expires_at='2099-01-01T00:00:00.000Z' WHERE family_id=1 AND member_id=10 AND scope='TASK_CREATE_V1' AND idempotency_key='stale-key' AND request_hash='hash-b' AND status='PROCESSING' AND lease_expires_at<='2026-01-01T00:00:00.000Z'").rowcount
assert changed==1
old=con.execute("INSERT INTO tasks(family_id,title,created_by,create_request_id) SELECT 1,'old-writer',10,r.id FROM task_create_requests r WHERE r.idempotency_key='stale-key' AND r.lease_token='old-token'").rowcount
assert old==0
new=con.execute("INSERT INTO tasks(family_id,title,created_by,create_request_id) SELECT 1,'new-writer',10,r.id FROM task_create_requests r WHERE r.idempotency_key='stale-key' AND r.lease_token='new-token'").rowcount
assert new==1
assert con.execute("SELECT COUNT(*) FROM tasks WHERE title IN ('old-writer','new-writer')").fetchone()[0]==1
con.execute(sql,(1,10,'TASK_CREATE_V1','deleted-key','hash-c','PROCESSING','token-c','2099-01-01T00:00:00.000Z','2026-01-01T00:00:00.000Z','2026-01-01T00:00:00.000Z'))
deleted_request_id=con.execute("SELECT id FROM task_create_requests WHERE idempotency_key='deleted-key'").fetchone()[0]
con.execute("INSERT INTO tasks(family_id,title,created_by,create_request_id) VALUES(1,'delete-me',10,?)",(deleted_request_id,))
deleted_task_id=con.execute("SELECT id FROM tasks WHERE create_request_id=?",(deleted_request_id,)).fetchone()[0]
con.execute("UPDATE task_create_requests SET status='DONE',task_id=?,lease_token=NULL,lease_expires_at=NULL WHERE id=?",(deleted_task_id,deleted_request_id))
con.execute("DELETE FROM tasks WHERE id=?",(deleted_task_id,))
assert con.execute("SELECT status,task_id FROM task_create_requests WHERE id=?",(deleted_request_id,)).fetchone()==('DONE',deleted_task_id)
assert con.execute("""SELECT r.task_id FROM task_create_requests r JOIN tasks t ON t.id=r.task_id AND t.family_id=r.family_id
  WHERE r.family_id=1 AND r.member_id=10 AND r.scope='TASK_CREATE_V1' AND r.idempotency_key='deleted-key' AND r.request_hash='hash-c' AND r.status='DONE'""").fetchone() is None
`;
const sqlite=spawnSync('python3',['-c',python],{encoding:'utf8'});
if(sqlite.status!==0) throw new Error(`task idempotency SQLite regression failed: ${sqlite.stderr||sqlite.stdout}`);

console.log('task API modularity/idempotency contract: claim uniqueness, live replay, stale lease fencing and goods-independent create/delete boundaries ok');