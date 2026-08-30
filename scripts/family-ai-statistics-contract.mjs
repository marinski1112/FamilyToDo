import assert from 'node:assert/strict';
import fs from 'node:fs';

const ai=fs.readFileSync('src/family-ai.ts','utf8');

for(const marker of [
  "'family_statistics'",
  'maxItems:3',
  "['QUERY','COMPARE']",
  'queries.length>3',
  'comparison requires two queries',
  'SQL is forbidden',
  ' HAVING ',
  'created_by',
  'familyNow(timezone)',
  'tok.question',
  'statisticsAnswer',
  'synthetic connectivity test',
  'no user data is included',
  '対象:',
  '期間:',
  '集計方法:',
]) assert.ok(ai.includes(marker),marker);

for(const marker of [
  'FAMILY_LOG','QUICK_CHORE','TASK','SCHEDULE',
  'SUM_AMOUNT','AVG_DURATION','LATEST_AMOUNT',
  'MEMBER','CHORE','MONTH','order_by','threshold',
]) assert.ok(ai.includes(marker),marker);

assert.doesNotMatch(ai,/contents:\s*\[[\s\S]{0,300}(rows|result)/,'raw query results must not be sent to Gemini');

console.log('family-ai-statistics-contract: typed bounded statistics plans, aggregate filters, result labels, and Worker-side privacy boundary ok');
