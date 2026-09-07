import assert from 'node:assert/strict';
import fs from 'node:fs';

const api=fs.readFileSync('src/task-rough-input-api.ts','utf8');
const guard=fs.readFileSync('src/task-rough-input-ai-guard.ts','utf8');
const migration=fs.readFileSync('migrations/0065_task_rough_input_ai_cost_guard.sql','utf8');

for(const marker of [
  'DEFAULT_ROUGH_INPUT_AI_REQUESTS_PER_FAMILY_DAY=20',
  'DEFAULT_ROUGH_INPUT_AI_REQUESTS_GLOBAL_DAY=200',
  'MAX_ROUGH_INPUT_AI_REQUESTS_PER_FAMILY_DAY=100',
  'MAX_ROUGH_INPUT_AI_REQUESTS_GLOBAL_DAY=1000',
  'ROUGH_INPUT_AI_429_BACKOFF_MINUTES=15',
  'ROUGH_INPUT_AI_MAX_FAMILY_REQUESTS_PER_DAY',
  'ROUGH_INPUT_AI_MAX_GLOBAL_REQUESTS_PER_DAY',
  'task_rough_input_ai_family_daily',
  'task_rough_input_ai_global_daily',
  'ON CONFLICT(family_id,local_date) DO UPDATE SET request_count=task_rough_input_ai_family_daily.request_count+1',
  'ON CONFLICT(budget_date) DO UPDATE SET request_count=task_rough_input_ai_global_daily.request_count+1',
  "COALESCE(task_rough_input_ai_global_daily.blocked_until,'')<=?",
  'UPDATE task_rough_input_ai_family_daily SET request_count=request_count-1',
  'addWallClockMinutes(now,ROUGH_INPUT_AI_429_BACKOFF_MINUTES)',
])assert.ok(guard.includes(marker),`rough-input AI guard marker missing: ${marker}`);

assert.ok(guard.includes('`utc-v1:${now.slice(0,10)}`'),'global rough-input budget must use an infrastructure UTC-day key');
assert.ok(!guard.includes('line_daily_digest_ai_'),'rough-input AI budget must stay independent from morning-digest accounting');
const familyReservation=guard.indexOf('const familyReservation=');
const globalReservation=guard.indexOf('const globalReservation=');
assert.ok(familyReservation>=0&&globalReservation>familyReservation,'family budget must reserve before global budget');
assert.ok(!/generativelanguage|geminiFetch|fetch\(/.test(guard),'rough-input AI guard must not make live external API calls');

for(const marker of [
  'CREATE TABLE IF NOT EXISTS task_rough_input_ai_family_daily',
  'PRIMARY KEY(family_id, local_date)',
  'FOREIGN KEY(family_id) REFERENCES families(id) ON DELETE CASCADE',
  'CREATE TABLE IF NOT EXISTS task_rough_input_ai_global_daily',
  'budget_date TEXT PRIMARY KEY',
  'blocked_until TEXT',
])assert.ok(migration.includes(marker),`rough-input AI guard migration marker missing: ${marker}`);

const deterministicGate=api.indexOf("if(!needsModel(parsed.fields))return fallback();");
const reserveCall=api.indexOf('try{reserved=await reserveTaskRoughInputAiRequest');
const categoryRead=api.indexOf("SELECT name,enabled FROM shopping_category_catalog WHERE family_id=?");
const modelCall=api.indexOf('const response=await geminiFetch(env,model,bodyForModel);');
assert.ok(deterministicGate>=0&&deterministicGate<reserveCall,'deterministic drafts must exit before any rough-input budget D1 work');
assert.ok(reserveCall<categoryRead&&categoryRead<modelCall,'paid-call reservation must precede category D1 enrichment and Gemini');
assert.ok(api.includes('catch{return fallback();}'),'guard failures must fail closed to deterministic output');
assert.ok(api.includes('if(!reserved)break;'),'exhausted family/global budget must stop paid calls');
assert.ok(api.includes('if(response.status===429){try{await blockTaskRoughInputAiAfter429(env.DB);'),'429 responses must open the rough-input circuit');
assert.ok(api.includes('break;}\n      if(!response.ok)continue;'),'429 handling must stop fallback rather than create a retry storm');
assert.equal((api.match(/geminiFetch\(/g)||[]).length,1,'rough-input must retain one bounded Gemini call site inside the two-model loop');

console.log('rough-input AI cost guard contract: deterministic-first, durable budgets, bounded overrides, and 429 circuit ok');
