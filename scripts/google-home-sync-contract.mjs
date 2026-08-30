import assert from 'node:assert/strict';
import fs from 'node:fs';

const read=p=>fs.readFileSync(p,'utf8');
const requestSync=read('src/google-home-request-sync.ts');
const docs=read('docs/GOOGLE_HOME_VOICE_SETUP.md');

for(const marker of ['GOOGLE_HOME_SERVICE_ACCOUNT_JSON','RSASSA-PKCS1-v1_5','https://www.googleapis.com/auth/homegraph','devices:requestSync','agentUserId:`ft-member-${memberId}`'])assert.ok(requestSync.includes(marker),`missing Google Home Request Sync marker: ${marker}`);
assert.ok(docs.includes('HomeGraph API'),'Google Home setup docs must retain HomeGraph API guidance');

console.log('google-home-sync-contract: service account, JWT scope and HomeGraph request-sync contracts ok');
