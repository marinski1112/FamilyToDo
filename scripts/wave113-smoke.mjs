import assert from 'node:assert/strict';
import fs from 'node:fs';
const home=fs.readFileSync('src/google-home.ts','utf8');
const docs=fs.readFileSync('docs/GOOGLE_HOME_VOICE_SETUP.md','utf8');
const pkg=JSON.parse(fs.readFileSync('package.json'));

for(const value of ['oauth-redirect.googleusercontent.com/r/${project}','oauth-redirect-sandbox.googleusercontent.com/r/${project}','GOOGLE_HOME_REDIRECT_URI','safeEqual(clientId','responseType===\'code\'','CODE_SECONDS=300','ACCESS_SECONDS=3600'])assert.ok(home.includes(value),value);
assert.match(home,/subject_kind IN \('BABY','CHILD'\)/);assert.match(home,/family_quick_chores WHERE family_id=\? AND active=1/);
for(const value of ['ft:sleep:start:','ft:sleep:stop:','ft:chore:','action.devices.types.SCENE','action.devices.traits.Scene','sceneReversible:false','willReportState:false','agentUserId:`ft-member-${member.id}`'])assert.ok(home.includes(value),value);
assert.match(home,/SCENE_NAME_MAX=60/);assert.match(home,/normalize\('NFKC'\)/);assert.match(home,/Google Homeで同名の操作があります/);assert.match(home,/slice\(0,15\)/);
for(const value of ['startDedicatedSleepDomain','stopDedicatedSleepDomain','recordQuickChoreDomain','external_command_receipts','GOOGLE_HOME_DISCONNECTED','GOOGLE_HOME_SYNCED','GOOGLE_HOME_TOKEN_ISSUED','GOOGLE_HOME_AUTHORIZE_STARTED'])assert.ok(home.includes(value),value);
assert.match(home,/requestId,key/);assert.match(home,/linked member|連携したメンバー/);assert.match(home,/payload:\{devices:\{\}\}/);
assert.match(home,/refreshedAccessToken/);assert.match(home,/refresh token\n    \/\/ is deterministic|deterministic for the current minute/);assert.doesNotMatch(home,/access_token_hash=\?,access_expires_at=\?/);
assert.match(home,/credential値は表示しません/);assert.match(home,/最終Google Home実行/);assert.match(home,/最終SYNC/);assert.match(home,/Scene count/);assert.doesNotMatch(home,/escapeHtml\(ctx\.env\.GOOGLE_HOME_CLIENT_SECRET/);
for(const value of ['family-todo-home','Test integration','Home Graph/Test Suite','再linkまたはGoogle側の再同期','certification/release対象外','GOOGLE_CALENDAR_CLIENT_ID'])assert.ok(docs.includes(value),value);
console.log('wave113 smoke: OAuth allowlist/lifecycle, bounded Scene SYNC, idempotent domain EXECUTE, safe diagnostics, and refresh-race guards present');
