import assert from 'node:assert/strict';
import fs from 'node:fs';

const api=fs.readFileSync('src/task-rough-input-api.ts','utf8');
const guard=fs.readFileSync('src/task-rough-input-ai-guard.ts','utf8');
const budgetMigration=fs.readFileSync('migrations/0065_task_rough_input_ai_cost_guard.sql','utf8');
const circuitMigration=fs.readFileSync('migrations/0066_task_rough_input_ai_circuit.sql','utf8');

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
  'task_rough_input_ai_circuit',
  'ON CONFLICT(family_id,local_date) DO UPDATE SET request_count=task_rough_input_ai_family_daily.request_count+1',
  'ON CONFLICT(budget_date) DO UPDATE SET request_count=task_rough_input_ai_global_daily.request_count+1',
  'UPDATE task_rough_input_ai_family_daily SET request_count=request_count-1',
  'addWallClockMinutes(now,ROUGH_INPUT_AI_429_BACKOFF_MINUTES)',
  'ON CONFLICT(singleton_id) DO UPDATE SET blocked_until=CASE',
])assert.ok(guard.includes(marker),`rough-input AI guard marker missing: ${marker}`);

const circuitGate='NOT EXISTS (SELECT 1 FROM task_rough_input_ai_circuit WHERE singleton_id=1 AND blocked_until>?)';
assert.equal(guard.split(circuitGate).length-1,2,'global insert and update paths must both consult the date-independent 429 circuit');
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
])assert.ok(budgetMigration.includes(marker),`rough-input AI budget migration marker missing: ${marker}`);

for(const marker of [
  'CREATE TABLE IF NOT EXISTS task_rough_input_ai_circuit',
  'singleton_id INTEGER PRIMARY KEY CHECK(singleton_id = 1)',
  'blocked_until TEXT NOT NULL',
])assert.ok(circuitMigration.includes(marker),`rough-input AI circuit migration marker missing: ${marker}`);
assert.ok(!circuitMigration.includes('budget_date'),'429 circuit must not be keyed by a daily budget date');

for(const marker of [
  'const explicitDueDateLine=/^(?:期限|締切)\\s*[:：]\\s*(\\d{4}-\\d{2}-\\d{2})\\s*$/u;',
  'const continuationRelativeDateHint=/(?:今日|本日|明日|あした|明後日|あさって|今週|来週|再来週|今月|来月|再来月|月末|来月末|週末)/u;',
  'const continuationWeekdayHint=/(?:月|火|水|木|金|土|日)(?:曜|曜日)/u;',
  'function explicitDueDate(block:RoughBlock):string|null{',
  'function dueDateNeedsModel(block:RoughBlock):boolean{',
  'if(httpUrlOnly.test(line))continue;',
  'if(index>0&&(continuationRelativeDateHint.test(line)||continuationWeekdayHint.test(line)))return true;',
  "const source=block.lines.join('\\n'),dueDate=explicitDueDate(block);",
  'if(dueIntentHint.test(source)&&!dueDate)return true;',
  'if(dueDate&&dueDateNeedsModel(block))return true;',
])assert.ok(api.includes(marker),`rough-input due-date boundary marker missing: ${marker}`);

const fixtureDueIntent=/(?:^|[\s、,])(?:期限|締切)\s*[:：]/u;
const fixtureDueLine=/^(?:期限|締切)\s*[:：]\s*(\d{4}-\d{2}-\d{2})\s*$/u;
const fixtureHttpUrlOnly=/^https?:\/\/\S+$/u;
const fixtureAbsoluteDateHint=/(?:^|[^\d])(?:\d{4}[\/.\-]\d{1,2}[\/.\-]\d{1,2}|\d{1,2}[\/.\-]\d{1,2}|\d{1,2}\s*月\s*\d{1,2}\s*日)(?:$|[^\d])/u;
const fixtureRelativeDateHint=/(?:今日|本日|明日|あした|明後日|あさって|今週|来週|再来週|今月|来月|再来月|月末|来月末|週末)(?=$|[\s、,。.!！?？]|(?:の|まで|中|午前|午後|朝|昼|夕方|夜|\d))/u;
const fixtureContinuationRelativeDateHint=/(?:今日|本日|明日|あした|明後日|あさって|今週|来週|再来週|今月|来月|再来月|月末|来月末|週末)/u;
const fixtureWeekdayHint=/(?:月|火|水|木|金|土|日)(?:曜|曜日)(?=$|[\s、,。.!！?？]|(?:の|まで|午前|午後|朝|昼|夕方|夜|\d))/u;
const fixtureContinuationWeekdayHint=/(?:月|火|水|木|金|土|日)(?:曜|曜日)/u;
const fixtureTimeHint=/(?:^|[^\d])(?:[01]?\d|2[0-3])\s*[:：]\s*[0-5]\d(?:$|[^\d])|(?:午前|午後)?\s*(?:[01]?\d|2[0-3])\s*時(?:\s*[0-5]?\d\s*分)?/u;
const fixtureValidDate=value=>{
  if(!/^\d{4}-\d{2}-\d{2}$/.test(value))return false;
  const [y,m,d]=value.split('-').map(Number),date=new Date(Date.UTC(y,m-1,d));
  return date.getUTCFullYear()===y&&date.getUTCMonth()===m-1&&date.getUTCDate()===d;
};
const extractExplicitDueFixture=lines=>{
  let found=null;
  for(let index=0;index<lines.length;index++){
    const line=lines[index],match=line.match(fixtureDueLine);
    if(match?.[1]){
      if(index===0||!fixtureValidDate(match[1]))return null;
      if(found&&found!==match[1])return null;
      found=match[1];
      continue;
    }
    if(fixtureDueIntent.test(line))return null;
  }
  return found;
};
const temporalIntentFixture=value=>fixtureAbsoluteDateHint.test(value)||fixtureRelativeDateHint.test(value)||fixtureWeekdayHint.test(value)||fixtureTimeHint.test(value);
const dueNeedsModelFixture=lines=>{
  const due=extractExplicitDueFixture(lines);
  if(!due)return fixtureDueIntent.test(lines.join('\n'));
  for(let index=0;index<lines.length;index++){
    const line=lines[index],match=line.match(fixtureDueLine);
    if(index>0&&match?.[1])continue;
    if(fixtureHttpUrlOnly.test(line))continue;
    if(temporalIntentFixture(line))return true;
    if(index>0&&(fixtureContinuationRelativeDateHint.test(line)||fixtureContinuationWeekdayHint.test(line)))return true;
  }
  return false;
};

assert.equal(extractExplicitDueFixture(['牛乳','期限: 2026-09-10']),'2026-09-10','exact labeled ISO due date must be safely extractable');
assert.equal(dueNeedsModelFixture(['牛乳','期限: 2026-09-10']),false,'exact due-only block must stay deterministic');
assert.equal(extractExplicitDueFixture(['薬','締切：2026-09-11']),'2026-09-11','full-width colon must remain safely extractable');
assert.equal(extractExplicitDueFixture(['牛乳','期限: 2026-02-30']),null,'invalid calendar date must not be extracted');
assert.equal(dueNeedsModelFixture(['牛乳','期限: 2026-09-10 18:00']),true,'time on a non-exact due line must remain model-eligible');
assert.equal(extractExplicitDueFixture(['会議','期限: 2026-09-10','18:00']),'2026-09-10','safe exact due date must survive deterministic fallback with a separate time');
assert.equal(dueNeedsModelFixture(['会議','期限: 2026-09-10','18:00']),true,'separate continuation time must remain model-eligible');
assert.equal(extractExplicitDueFixture(['会議','期限: 2026-09-10','メモ: 明日確認']),'2026-09-10','safe exact due date must survive fallback with relative-date context');
assert.equal(dueNeedsModelFixture(['会議','期限: 2026-09-10','メモ: 明日確認']),true,'concatenated Japanese continuation relative date must remain model-eligible');
assert.equal(extractExplicitDueFixture(['会議','期限: 2026-09-10','メモ: 月曜確認']),'2026-09-10','safe exact due date must survive fallback with weekday context');
assert.equal(dueNeedsModelFixture(['会議','期限: 2026-09-10','メモ: 月曜確認']),true,'concatenated Japanese continuation weekday must remain model-eligible');
assert.equal(temporalIntentFixture('月末'),true,'month-end intent must remain model-eligible rather than falling through as a simple undated input');
assert.equal(temporalIntentFixture('来月末'),true,'next-month-end intent must remain model-eligible without deterministic date calculation');
assert.equal(extractExplicitDueFixture(['会議','期限: 2026-09-10','メモ: 来月末確認']),'2026-09-10','safe exact due date must survive fallback with month-end context');
assert.equal(dueNeedsModelFixture(['会議','期限: 2026-09-10','メモ: 来月末確認']),true,'month-end continuation intent must remain model-eligible');
assert.equal(extractExplicitDueFixture(['牛乳 期限: 2026-09-10']),null,'inline/title due syntax must not be extracted');
assert.equal(extractExplicitDueFixture(['牛乳','期限: 2026-09-10','締切: 2026-09-11']),null,'conflicting due metadata must not be extracted');
assert.equal(extractExplicitDueFixture(['牛乳','期限: 2026-09-10','https://example.com/2025/12/31']),'2026-09-10','URL-only metadata must not affect safe due extraction');
assert.equal(dueNeedsModelFixture(['牛乳','期限: 2026-09-10','https://example.com/2025/12/31']),false,'URL-only date text must not trigger a paid model call');

const deterministicGate=api.indexOf("if(!parsed.summarize&&!needsModel(parsed.fields))return fallback('SIMPLE_INPUT');");
const modelLoop=api.indexOf('for(const model of [ROUGH_INPUT_GEMINI_MODEL_PRIMARY,ROUGH_INPUT_GEMINI_MODEL_FALLBACK])');
const reserveCall=api.indexOf('try{reserved=await reserveTaskRoughInputAiRequest');
const categoryRead=api.indexOf("SELECT name,enabled FROM shopping_category_catalog WHERE family_id=?");
const modelCall=api.indexOf('const response=await geminiFetch(env,model,bodyForModel);');
assert.ok(deterministicGate>=0&&deterministicGate<modelLoop&&modelLoop<reserveCall,'deterministic drafts must exit before the budgeted model loop');
assert.ok(reserveCall<categoryRead&&categoryRead<modelCall,'paid-call reservation must precede category D1 enrichment and Gemini');
assert.ok(api.includes("catch{return fallback('STORAGE');}"),'guard failures must fail closed to deterministic output');
assert.ok(api.includes("if(!reserved)return fallback('BUDGET');"),'exhausted family/global budget must stop paid calls');
assert.ok(api.includes('if(response.status===429){try{await blockTaskRoughInputAiAfter429(env.DB);'),'429 responses must open the rough-input circuit');
assert.ok(api.includes('break;}\n      if(!response.ok)continue;'),'429 handling must stop fallback rather than create a retry storm');
assert.equal((api.match(/geminiFetch\(/g)||[]).length,1,'rough-input must retain one bounded Gemini call site inside the two-model loop');

console.log('rough-input AI cost guard contract: safe ISO due fallback, month-end/continuation temporal model eligibility, URL metadata exclusion, durable budgets, date-independent 429 circuit, and bounded model calls ok');
await import('./message-ai-draft-contract.mjs');
