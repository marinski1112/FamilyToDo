import assert from 'node:assert/strict';
import fs from 'node:fs';

const ai=fs.readFileSync('src/family-ai.ts','utf8');
const index=fs.readFileSync('src/index.ts','utf8');
const apiRoutes=fs.readFileSync('src/context-api-routes.ts','utf8');

for(const marker of [
  'daily_family_log_aggregate',
  'quick_chore_stats',
  'task_stats',
  'schedule_lookup',
  'family_log_latest',
  'functionDeclarations',
  'GEMINI_API_KEY',
  'deleted_at IS NULL',
  'SQL is forbidden',
]) assert.ok(ai.includes(marker),marker);

assert.ok(ai.includes('substr(occurred_at,1,10)'),'Family AI must retain local-date aggregation');
assert.ok(apiRoutes.includes('/api/family-ai/query'),'Family AI query route must remain registered');

console.log('family-ai-foundation-contract: tools, privacy/query guardrails, local-date aggregation, and route registration ok');
