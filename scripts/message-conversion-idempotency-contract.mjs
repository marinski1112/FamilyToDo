import fs from 'node:fs';

const handler=fs.readFileSync('src/messages-api.ts','utf8');
const claim=fs.readFileSync('src/message-conversion-claim.ts','utf8');
const migration=fs.readFileSync('migrations/0082_message_conversion_idempotency.sql','utf8');

for(const marker of [
  "acquireMessageConversionClaim(ctx.env.DB,m.family_id,id,'shopping','shopping',sourceUpdatedAt)",
  "acquireMessageConversionClaim(ctx.env.DB,m.family_id,id,'task','existing',sourceUpdatedAt,requestedTaskId)",
  "acquireMessageConversionClaim(ctx.env.DB,m.family_id,id,'task','new',sourceUpdatedAt)",
  "SELECT id FROM shopping_items WHERE family_id=? AND source_message_id=? LIMIT 1",
  "SELECT id FROM tasks WHERE family_id=? AND source_message_id=? LIMIT 1",
  "finalizeMessageConversionClaimStatement(ctx.env.DB,m.family_id,id,'shopping'",
  "finalizeMessageConversionClaimStatement(ctx.env.DB,m.family_id,id,'task'",
]) if(!handler.includes(marker))throw new Error(`message conversion idempotency handler marker missing: ${marker}`);

const shoppingSql="INSERT OR IGNORE INTO shopping_items(family_id,name,quantity,category,memo,due_date,status,created_by,created_at,updated_at,url,source_message_id) VALUES(?,?,?,?,?,?,'pending',?,?,?,?,?)";
const taskSql='INSERT OR IGNORE INTO tasks(family_id,title,description,due_at,status,completion_mode,created_by,created_at,updated_at,start_at,end_at,location,all_day,calendar_visible,calendar_color,task_kind,sort_order,reminder_at,source_message_id) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)';
if(!handler.includes(shoppingSql))throw new Error('shopping source-message insert SQL/placeholder contract changed');
if(!handler.includes(taskSql))throw new Error('task source-message insert SQL/placeholder contract changed');
if(handler.includes('updated_at,task_id,url,source_message_id'))throw new Error('shopping source-message insert must not restore task linkage');
if(handler.includes('INSERT OR IGNORE INTO shopping_assignees')||handler.includes('INSERT OR IGNORE INTO task_assignees'))throw new Error('message conversion must not persist assignees');

for(const marker of [
  "INSERT OR IGNORE INTO message_conversion_claims",
  "datetime('now','+5 minutes')",
  "source_updated_at",
  "storedMode!==mode",
  "status='PROCESSING'",
  "status='DONE'",
]) if(!claim.includes(marker))throw new Error(`message conversion claim marker missing: ${marker}`);

for(const marker of [
  'ALTER TABLE shopping_items ADD COLUMN source_message_id INTEGER NULL;',
  'ALTER TABLE tasks ADD COLUMN source_message_id INTEGER NULL;',
  'CREATE UNIQUE INDEX IF NOT EXISTS idx_shopping_items_source_message',
  'CREATE UNIQUE INDEX IF NOT EXISTS idx_tasks_source_message',
  'CREATE TABLE IF NOT EXISTS message_conversion_claims',
  'PRIMARY KEY (message_id, conversion_type)',
  'source_updated_at TEXT NOT NULL',
]) if(!migration.includes(marker))throw new Error(`message conversion migration marker missing: ${marker}`);

const shoppingClaim=handler.indexOf("acquireMessageConversionClaim(ctx.env.DB,m.family_id,id,'shopping'");
const shoppingInsert=handler.indexOf('INSERT OR IGNORE INTO shopping_items',shoppingClaim);
if(shoppingClaim<0||shoppingInsert<0||shoppingClaim>shoppingInsert)throw new Error('shopping claim must precede the domain insert');
const newTaskClaim=handler.indexOf("acquireMessageConversionClaim(ctx.env.DB,m.family_id,id,'task','new'");
const newTaskInsert=handler.indexOf('INSERT OR IGNORE INTO tasks',newTaskClaim);
if(newTaskClaim<0||newTaskInsert<0||newTaskClaim>newTaskInsert)throw new Error('new-task claim must precede the domain insert');

console.log('message conversion idempotency contract ok');
