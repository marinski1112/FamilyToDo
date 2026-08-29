import assert from 'node:assert/strict';
import fs from 'node:fs';
const ai=fs.readFileSync('src/family-ai.ts','utf8');
const cal=fs.readFileSync('src/google-calendar.ts','utf8')+fs.readFileSync('src/google-calendar-core.ts','utf8');
const pkg=JSON.parse(fs.readFileSync('package.json','utf8'));

assert.match(ai,/GEMINI_MODEL_DEFAULT='gemini-3\.[15]-flash-lite'/);
assert.ok(!ai.includes('gemini-2.0-flash'));
assert.match(ai,/env\.GEMINI_MODEL\?\.trim\(\)\|\|GEMINI_MODEL_DEFAULT/);
for(const category of ['NOT_CONFIGURED','API_KEY_INVALID','MODEL_NOT_FOUND','RATE_LIMIT_UNKNOWN','UPSTREAM_UNAVAILABLE','UNKNOWN'])assert.ok(ai.includes(category));
for(const status of ['status===400','status===404','status===429','status>=500'])assert.ok(ai.includes(status));
for(const privacy of ['tok.question','FAMILY_AI_FUNCTIONS','maxItems:3','generationConfig:{maxOutputTokens:512}','synthetic connectivity test; no user data is included'])assert.ok(ai.includes(privacy));
assert.ok(!/await r\.text|console\.(?:log|error).*gemini/i.test(ai));
assert.match(ai,/質問を解析できませんでした。表現を少し変えてください。/);
for(const ui of ['受信対象カレンダー: Family TODO','sync token:','使用モデル:'])assert.ok(cal.includes(ui));
// Historical Wave103 contract: diagnostics must expose the outbound pending state,
// but the human-readable label is intentionally not part of this smoke contract.
assert.match(cal,/pending_count/);
assert.match(cal,/status IN \('PENDING','ERROR'\)/);
assert.match(cal,/pending_before/);
assert.match(cal,/pending_after/);
for(const guardrail of ["calendar.app.created","q.set('syncToken',syncToken)",'e.status===410',"status='ACTIVE'", "1,'EVENT'"])assert.ok(cal.includes(guardrail));
assert.ok(!cal.includes('googleapis.com/tasks'));
assert.ok(!/UPDATE tasks SET[^'\n]*task_kind/.test(cal));
console.log('wave103 smoke: Gemini diagnostics/privacy and dedicated Calendar incremental sync ok');
