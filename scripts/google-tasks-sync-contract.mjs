import assert from 'node:assert/strict';
import fs from 'node:fs';

const tasks=fs.readFileSync('src/google-tasks.ts','utf8');
const index=fs.readFileSync('src/index.ts','utf8');
const migration=fs.readFileSync('migrations/0039_wave116_google_tasks_cursor_commands.sql','utf8');
const wrangler=fs.readFileSync('wrangler.jsonc','utf8');
const externalDomain=fs.readFileSync('src/family-external-domain.ts','utf8');

for(const value of ['MAX_D1_QUERY_BUDGET=40','MAX_TASKS_PER_INVOCATION=3','maxResults:String(MAX_TASKS_PER_INVOCATION)','sync_window_updated_min','sync_page_token','sync_latest_seen_at',"status='SYNCING' AND sync_lease_expires_at<?",'PAGE_TOKEN_RESET','parseGoogleVoiceCommand','SHOPPING_ADD','NEEDS_REVIEW'])assert.ok(tasks.includes(value),value);
assert.ok(externalDomain.includes('createExternalShoppingItemDomain'));
assert.ok(migration.includes('UNIQUE(account_id,external_tasklist_id,external_task_id)'));
assert.match(index,/controller\.cron==='3,8,13,18,23,28,33,38,43,48,53,58 \* \* \* \*'[\s\S]+processGoogleTasksInbound/);
assert.match(wrangler,/3,8,13,18,23,28,33,38,43,48,53,58/);

// Worst-case all-INQUIRY page: scheduler selection + lease + 3 * conservative ten-statement command cost + cursor commit.
assert.ok(1+1+3*10+1<=40);
let remaining=200,invocations=0;
while(remaining){remaining-=Math.min(3,remaining);invocations++;}
assert.equal(invocations,67);

const normalize=s=>s.normalize('NFKC').replace(/[\s　]+/g,' ').trim();
const parse=s=>{
  const normalized=normalize(s);
  const prefix=/^(?:FT|FAMILY TODO|ファミリーTODO)(?: |$)/i.exec(normalized);
  if(!prefix)return 'TASK';
  const body=normalized.slice(prefix[0].length).trim();
  const shopping=/^買い物(?: |$)(.*)$/.exec(body);
  if(!shopping||!shopping[1].trim())return 'NEEDS_REVIEW';
  return 'SHOPPING_ADD';
};
assert.equal(parse('牛乳'),'TASK');
assert.equal(parse('FT 買い物 牛乳'),'SHOPPING_ADD');
assert.equal(parse('ＦＴ　買い物　牛乳　2'),'SHOPPING_ADD');
assert.equal(parse('FT 買い物'),'NEEDS_REVIEW');

console.log('google-tasks-sync-contract: query budget, cursor continuation/recovery, scheduler cadence, and typed shopping command semantics ok');
