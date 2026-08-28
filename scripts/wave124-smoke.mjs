import assert from 'node:assert/strict';import fs from 'node:fs';
const read=p=>fs.readFileSync(p,'utf8'),css=read('public/assets/family.css'),home=read('src/google-home-request-sync.ts'),tasks=read('src/google-tasks.ts'),app=read('src/app.ts'),docs=read('docs/GOOGLE_HOME_VOICE_SETUP.md');
assert.match(css,/family-quick-chore-grid\{display:grid;grid-template-columns:repeat\(4/);assert.match(css,/word-break:keep-all/);assert.doesNotMatch(css,/family-quick-chore-record strong\{[^}]*ellipsis/);
for(const value of ['GOOGLE_HOME_SERVICE_ACCOUNT_JSON','RSASSA-PKCS1-v1_5','https://www.googleapis.com/auth/homegraph','devices:requestSync','agentUserId:`ft-member-${memberId}`'])assert.ok(home.includes(value),value);
for(const value of ["type:'FAMILY_LOG_RECORD'",'occurredOffsetMinutes','AMBIGUOUS_SUBJECT','PET_SUBJECT_REQUIRED','recordConfiguredQuickActionDomain','recordGoogleVoiceFamilyLogDomain'])assert.ok(tasks.includes(value),value);
assert.ok(app.includes('Array.from(name).length>8'));assert.ok(docs.includes('HomeGraph API'));console.log('wave124 smoke ok');
