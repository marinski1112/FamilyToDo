import assert from 'node:assert/strict';
import fs from 'node:fs';
import { retainedAppContractSource } from './retained-app-contract-source.mjs';

const app=retainedAppContractSource();
const lifecycle=fs.readFileSync('src/lifecycle.ts','utf8');
const schema=fs.readFileSync('database/schema.d1.sql','utf8');
const checklistDraft=fs.readFileSync('src/checklist-input-draft.ts','utf8');
const roughInputApi=fs.readFileSync('src/task-rough-input-api.ts','utf8');
const roughInputUi=fs.readFileSync('public/assets/task-rough-input-ai.js','utf8');
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
  "if(typeof fallbackPreview==='function')fallbackPreview.call(button)",
  'const fields=fieldPayload(),requestSnapshot=snapshot(fields)',
  'if(snapshot(fieldPayload())!==requestSnapshot)return;',
  'firstHttpUrl(item.originalText)',
  'class="rough-draft-category"',
  '<details class="rough-advanced"><summary>詳細設定</summary>',
  '<details class="rough-row-details"><summary>詳細設定</summary>',
  '<details class="rough-row-details"><summary>期限など</summary>',
  'class="rough-main-calendar-visible"',
  'class="rough-main-calendar-color"',
  'class="rough-main-completion"',
  'class="rough-main-assignees"',
  'class="rough-main-private"',
  'class="rough-main-start-date"',
  'class="rough-main-end-date"',
  'class="rough-draft-url"',
  '必要な項目だけ確認し、間違いがあれば修正してください。詳細設定は必要なときだけ開けます。',
])assert.ok(roughInputUi.includes(marker),`rough-input progressive confirmation marker missing: ${marker}`);
assert.ok(!roughInputUi.includes("fetch('/api/task',"),'confirmation-only UI must not persist tasks');
assert.ok(!roughInputUi.includes("fetch('/api/shopping',"),'confirmation-only UI must not persist Shopping');
assert.ok(!roughInputUi.includes("fetch('/api/item',"),'confirmation-only UI must not persist Items');
assert.ok(!/<details[^>]*\sopen(?:\s|>)/i.test(roughInputUi),'advanced confirmation sections must start collapsed');
assert.ok(appShell.includes("compactBody.includes('id=\"taskNewPayload\"')"),'rough-input AI companion must be scoped to the server-rendered task-new marker');
assert.ok(appShell.includes('/assets/task-rough-input-ai.js?v=${APP_VERSION}-confirm-ui1'),'rough-input confirmation UI asset must be cache-versioned');

console.log('core contract smoke: visibility, task/event, recurrence, lifecycle, checklist draft, bounded Gemini analysis, and progressive confirmation UI contracts ok');
