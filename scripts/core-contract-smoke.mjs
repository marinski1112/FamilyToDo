import assert from 'node:assert/strict';
import fs from 'node:fs';
import { retainedAppContractSource } from './retained-app-contract-source.mjs';

const app=retainedAppContractSource();
const lifecycle=fs.readFileSync('src/lifecycle.ts','utf8');
const schema=fs.readFileSync('database/schema.d1.sql','utf8');
const checklistDraft=fs.readFileSync('src/checklist-input-draft.ts','utf8');
const roughInputApi=fs.readFileSync('src/task-rough-input-api.ts','utf8');
const roughInputUi=fs.readFileSync('public/assets/task-rough-input-ai.js','utf8');
const roughInputSave=fs.readFileSync('public/assets/task-rough-input-save.js','utf8');
const appShell=fs.readFileSync('src/app-shell.ts','utf8');

assert.ok(app.includes('export function taskVisibilitySql'),'current task visibility predicate must remain centralized');
assert.ok(app.includes("visibility_scope,'FAMILY'")&&app.includes("visibility_scope='PRIVATE'"),'FAMILY/PRIVATE visibility contract must remain explicit');
assert.ok(app.includes('private_owner_id'),'PRIVATE ownership must remain part of access control');
assert.ok(app.includes('recurrence_rules')&&app.includes('recurrence_occurrences'),'recurring task rule/occurrence model must remain active');
assert.ok(app.includes("task_kind")&&app.includes("'EVENT'")||app.includes("'event'"),'TASK/EVENT kind model must remain available');
assert.ok(lifecycle.includes('deleted_completion_history'),'completion lifecycle must preserve archive history before destructive cleanup');
assert.ok(schema.includes('CREATE TABLE IF NOT EXISTS tasks')||schema.includes('CREATE TABLE tasks'),'tasks must remain the canonical scheduled entity table');
assert.ok(schema.includes('recurrence_rules'),'recurrence schema must remain present');

for(const marker of [
  'CHECKLIST_INPUT_MAX_CHARS=4000',
  'CHECKLIST_INPUT_MAX_ITEMS=20',
  'additionalProperties:false',
  'requiresConfirmation:true',
  "source:'deterministic'",
  "'INPUT_TOO_LONG'|'TOO_MANY_ITEMS'|'INVALID_DRAFT'",
  "intent:ChecklistDraftIntent='unknown'",
  "category:null,dueDate:null,dueTime:null,groupHint:null",
])assert.ok(checklistDraft.includes(marker),`checklist rough-input safety contract missing: ${marker}`);
assert.ok(!/(INSERT|UPDATE|DELETE)\s+/i.test(checklistDraft),'checklist draft parser must not persist model or local parser output');
assert.ok(!/GEMINI_API_KEY|generativelanguage\.googleapis\.com|:generateContent/.test(checklistDraft),'deterministic draft contract must not call Gemini');

for(const marker of [
  "ROUGH_INPUT_GEMINI_MODEL_PRIMARY='gemini-3.5-flash-lite'",
  "ROUGH_INPUT_GEMINI_MODEL_FALLBACK='gemini-3.5-flash'",
  'const MAX_CHARS=4000',
  'const MAX_ITEMS=20',
  "fields[0]?.destination!==primaryType",
  "primaryType==='task'||primaryType==='event'",
  "String(body.csrf||'')!==String(ctx.session?.csrfToken||'')",
  "familyAiProvider(env)!=='GEMINI'",
  "requiresConfirmation:true",
  'deterministicItems(parsed.fields)',
  'sourceIndex',
  "field.lines.includes(originalText)",
  'observed=new Map<string,number>()',
  'required=new Map<string,number>()',
  "if((observed.get(key)||0)<count)return null",
])assert.ok(roughInputApi.includes(marker),`rough-input Gemini safety marker missing: ${marker}`);
assert.ok(!/\b(?:INSERT|UPDATE|DELETE)\b/i.test(roughInputApi),'rough-input analysis endpoint must not persist model output');
assert.ok(!roughInputApi.includes('resolveFamilyGeminiModel'),'rough-input must not inherit arbitrary family-selected Gemini models');

for(const marker of [
  "fetch('/api/task-rough-input'",
  'firstHttpUrl(item.originalText)',
  "!u.username&&!u.password",
  'class="rough-draft-category"',
  '<details class="rough-advanced"><summary>詳細設定</summary>',
  'class="rough-main-calendar-visible"',
  'class="rough-main-calendar-color"',
  'class="rough-main-completion"',
  'rough-main-assignees',
  'class="rough-main-private"',
  'class="rough-main-start-date"',
  'class="rough-main-end-date"',
  'class="rough-main-description"',
  'class="rough-child-completion"',
  'rough-child-assignees',
  'rough-item-assignees',
  'class="rough-draft-url"',
  "item.dueTime?false:",
  "selectedRowAssignees",
  "syncItemFromRow(item,row)",
  '必要な項目だけ確認し、間違いがあれば修正してください。詳細設定は必要なときだけ開けます。',
])assert.ok(roughInputUi.includes(marker),`rough-input progressive confirmation marker missing: ${marker}`);
assert.ok(!/<details[^>]*\sopen(?:\s|>)/i.test(roughInputUi),'advanced confirmation sections must start collapsed');

for(const marker of [
  "id=\"roughConfirmSave\"",
  'AIの下書きは、このボタンを押すまで登録されません。',
  'if(!confirm(',
  "postJson('/api/task'",
  "postJson('/api/shopping'",
  "postJson('/api/item'",
  "method:'DELETE'",
  "headers:{'x-csrf':csrf()}",
  'parent_task_id:parentTaskId',
  "if(roots.length>1&&related.length)",
  'rollbackTasks(createdTaskIds)',
  "action:'add'",
  "action:'add_batch'",
  "products:[{name:item.title,quantity:item.quantity||'1',url:item.url||''}]",
  "assignees});",
  "item.dueDate!==roots[0].startDate",
  "task_id:taskId||0",
  "const structuredPreview=preview.querySelector('.rough-advanced,.rough-row-details')",
  'if(preview.hidden||!rows.length||!structuredPreview)return;',
  "response.status>=500||!data||response.ok",
  "!u.username&&!u.password",
])assert.ok(roughInputSave.includes(marker),`rough-input explicit save guard missing: ${marker}`);
assert.ok(!/GEMINI_API_KEY|generativelanguage\.googleapis\.com|:generateContent/.test(roughInputSave),'save companion must never call Gemini directly');
assert.ok(roughInputSave.indexOf('if(!confirm(')<roughInputSave.indexOf('try{const result=await saveRows(rows)'),'explicit user confirmation must occur before save orchestration');
assert.ok(appShell.includes("compactBody.includes('id=\"taskNewPayload\"')"),'rough-input companions must be scoped to the server-rendered task-new marker');
assert.ok(appShell.includes('/assets/task-rough-input-ai.js?v=${APP_VERSION}-explicit-save1'),'rough-input AI asset must be cache-versioned for explicit save');
assert.ok(appShell.includes('/assets/task-rough-input-save.js?v=${APP_VERSION}-explicit-save1'),'rough-input save companion must be cache-versioned');

console.log('core contract smoke: visibility, task/event, recurrence, lifecycle, bounded Gemini analysis, progressive confirmation, and explicit save boundaries ok');
