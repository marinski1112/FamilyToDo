import assert from 'node:assert/strict';
import fs from 'node:fs';

const api=fs.readFileSync('src/task-rough-input-api.ts','utf8');
const recorder=fs.readFileSync('src/ai-generation-diagnostics.ts','utf8');
const migration=fs.readFileSync('migrations/0067_ai_generation_diagnostics.sql','utf8');
const settings=fs.readFileSync('src/settings-diagnostics.ts','utf8');

for(const marker of [
  'CREATE TABLE IF NOT EXISTS ai_generation_diagnostics',
  "feature TEXT NOT NULL CHECK(feature IN ('ROUGH_INPUT','MORNING_DIGEST'))",
  "final_status TEXT NOT NULL CHECK(final_status IN ('AI_NOT_NEEDED','AI_OK','FALLBACK_DETERMINISTIC','BUDGET_OR_CIRCUIT','NOT_CONFIGURED','DISABLED','STORAGE'))",
  'attempt_count INTEGER NOT NULL DEFAULT 0 CHECK(attempt_count >= 0 AND attempt_count <= 4)',
  'attempts_json TEXT NOT NULL DEFAULT \'[]\'',
  'FOREIGN KEY(family_id) REFERENCES families(id) ON DELETE CASCADE',
  'idx_ai_generation_diagnostics_family_feature_id',
])assert.ok(migration.includes(marker),`AI diagnostics migration marker missing: ${marker}`);

const columnNames=[...migration.matchAll(/^\s{2}([a-z_]+)\s+/gm)].map(match=>match[1]);
for(const forbidden of ['raw_input','input_text','prompt','response','response_body','error','error_body','url','secret','token','message','content']){
  assert.ok(!columnNames.includes(forbidden),`AI diagnostics must not persist private/raw column: ${forbidden}`);
}

for(const marker of [
  'AI_DIAGNOSTIC_ROWS_PER_FAMILY_FEATURE=100',
  'AI_DIAGNOSTIC_MAX_ATTEMPTS=4',
  "AiDiagnosticAttemptStatus='AI_OK'|'INVALID_OUTPUT'|'RATE_LIMIT'|'HTTP_ERROR'",
  "AiDiagnosticFinalStatus='AI_NOT_NEEDED'|'AI_OK'|'FALLBACK_DETERMINISTIC'|'BUDGET_OR_CIRCUIT'|'NOT_CONFIGURED'|'DISABLED'|'STORAGE'",
  "model:safeModel(attempt.model)??'unknown'",
  'httpStatus:safeHttpStatus(attempt.httpStatus)',
  'if(value===null||value===undefined)return null;',
  'JSON.stringify(attempts)',
  'ORDER BY id DESC LIMIT ?',
])assert.ok(recorder.includes(marker),`AI diagnostics recorder marker missing: ${marker}`);
const itemCountGuard=recorder.indexOf('if(value===null||value===undefined)return null;');
const itemCountCoercion=recorder.indexOf('const count=Number(value);');
assert.ok(itemCountGuard>=0&&itemCountCoercion>itemCountGuard,'nullable itemCount must stay null before numeric coercion');
assert.ok(!recorder.includes('JSON.stringify(event)'), 'diagnostics must serialize only the sanitized attempt projection, never the source event');
assert.ok(!/rawInput|originalText|prompt|responseBody|errorBody|requestBody|privateUrl|authorization|secret/i.test(recorder),'diagnostic recorder must not accept raw/private payload fields');

for(const marker of [
  "import { recordAiGenerationDiagnostic, type AiDiagnosticAttempt, type AiDiagnosticFinalStatus } from './ai-generation-diagnostics';",
  "feature:'ROUGH_INPUT'",
  "reason==='SIMPLE_INPUT'?'AI_NOT_NEEDED'",
  "reason==='STORAGE'?'STORAGE'",
  "reason==='BUDGET'?'BUDGET_OR_CIRCUIT'",
  "return fallback('DISABLED','NOT_CONFIGURED');",
  "return fallback('DISABLED');",
  "return fallback('SIMPLE_INPUT');",
  "catch{return fallback('STORAGE');}",
  "if(!reserved)return fallback('BUDGET');",
  "status:response.status===429?'RATE_LIMIT':'HTTP_ERROR'",
  "status:'INVALID_OUTPUT'",
  "status:'AI_OK'",
  "await recordDiagnostic('AI_OK',model,items.length);",
  'return fallback();',
  'catch{/* Diagnostics must never alter rough-input behavior. */}',
])assert.ok(api.includes(marker),`rough-input diagnostic marker missing: ${marker}`);

const recorderCall=api.match(/recordAiGenerationDiagnostic\(env\.DB,\{([^}]*)\}\)/s)?.[1]||'';
assert.ok(recorderCall,'rough-input must write through the shared diagnostic recorder');
for(const forbidden of ['body','parsed','fields','originalText','bodyForModel','decoded','text','context']){
  assert.ok(!recorderCall.includes(forbidden),`rough-input diagnostics must not pass raw/model payload data: ${forbidden}`);
}
assert.equal((api.match(/recordAiGenerationDiagnostic\(/g)||[]).length,1,'rough-input must keep one centralized diagnostic write call');
assert.equal((api.match(/geminiFetch\(/g)||[]).length,1,'diagnostics must not add provider calls');

const readerColumns=['feature','final_status','ai_called','attempt_count','accepted_model','item_count','attempts_json','created_at'];
for(const column of readerColumns)assert.ok(columnNames.includes(column),`AI diagnostics reader column must exist in migration: ${column}`);
for(const marker of [
  'AI実行履歴',
  '/api/settings/diagnostics-detail?issue=ai_generation',
  "if(issue==='ai_generation')",
  'SELECT feature,final_status,ai_called,attempt_count,accepted_model,item_count,attempts_json,created_at FROM ai_generation_diagnostics WHERE family_id=? ORDER BY id DESC LIMIT 20',
  '.bind(m.family_id).all<Row>()',
  "JSON.parse(String(x.attempts_json||'[]'))",
  'final_status:String(x.final_status||\'\')',
  'ai_called:Number(x.ai_called||0)===1',
  'model:acceptedModel||lastModel',
  'http_status:httpStatus',
  'item_count:x.item_count==null?null:Number(x.item_count)',
  'limited:20',
])assert.ok(settings.includes(marker),`AI diagnostics reader marker missing: ${marker}`);
const aiReader=settings.match(/if\(issue==='ai_generation'\)\{([\s\S]*?)\n  \}/)?.[1]||'';
assert.ok(aiReader,'AI diagnostics reader must remain an explicit bounded detail path');
for(const forbidden of ['raw_input','input_text','originalText','prompt','response','error_body','url','secret','token','message','content']){
  assert.ok(!aiReader.toLowerCase().includes(forbidden.toLowerCase()),`AI diagnostics reader must not expose private/raw field: ${forbidden}`);
}
assert.ok(!aiReader.includes('attempts_json:'),'AI diagnostics reader must never expose attempts_json verbatim');
assert.ok(settings.indexOf("if(issue==='ai_generation')")<settings.indexOf('const d=DIAGNOSTIC_DEFINITIONS.find'), 'AI history must stay outside integrity summary definitions');
assert.ok(!settings.match(/DIAGNOSTIC_DEFINITIONS[^;]*ai_generation/s),'AI history must not add an initial-load integrity query');

console.log('rough-input AI diagnostics contract: coarse statuses, bounded retention/reader, schema-aligned derived attempt metadata, family scope, sanitized fields, nullable item counts, and zero raw payload persistence ok');
