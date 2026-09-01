import fs from 'node:fs';

const index=fs.readFileSync('src/index.ts','utf8');
const digest=fs.readFileSync('src/line-daily-digest.ts','utf8');

if(!index.includes("import { processLineDailyDigests } from './line-daily-digest';")) throw new Error('index.ts must import LINE daily digest job');
if(index.includes('export async function processLineDailyDigests(')||index.includes('async function processLineDailyDigests(')) throw new Error('LINE daily digest job must not remain defined in index.ts');
if(!index.includes('ctx.waitUntil(processLineDailyDigests(env));')) throw new Error('scheduled handler must still enqueue LINE daily digest job');
if(!digest.includes('export async function processLineDailyDigests(env:Env):Promise<void>{')) throw new Error('LINE daily digest module must export processLineDailyDigests');
for(const sentinel of [
  'line_daily_digest_settings',
  'line_daily_digest_recipients',
  'line_daily_digest_receipts',
  "visibility_scope='FAMILY' OR (visibility_scope='PRIVATE' AND private_owner_id=?)",
  'LIMIT 12',
  "const {pushLineMessage}=await import('./line')",
  'lines.join(',
  '.slice(0,1000)',
  'attempt_count=attempt_count+1',
]){
  if(!digest.includes(sentinel)) throw new Error(`LINE daily digest behavior sentinel missing: ${sentinel}`);
}
console.log('LINE daily digest modularity contract: ok');
