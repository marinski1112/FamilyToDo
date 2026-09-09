import assert from 'node:assert/strict';
import fs from 'node:fs';

const home=fs.readFileSync('src/google-home.ts','utf8');
const diagnostics=fs.readFileSync('src/google-home-execute-diagnostics.ts','utf8');
const publicRoutes=fs.readFileSync('src/public-routes.ts','utf8');
const pageRoutes=fs.readFileSync('src/page-routes.ts','utf8');
const docs=fs.readFileSync('docs/GOOGLE_HOME_VOICE_SETUP.md','utf8');

for(const value of ['oauth-redirect.googleusercontent.com/r/${project}','oauth-redirect-sandbox.googleusercontent.com/r/${project}','GOOGLE_HOME_REDIRECT_URI','safeEqual(clientId',"responseType==='code'",'CODE_SECONDS=300','ACCESS_SECONDS=3600'])assert.ok(home.includes(value),value);
assert.match(home,/subject_kind IN \('BABY','CHILD'\)/);
assert.match(home,/family_quick_chores WHERE family_id=\? AND active=1/);
for(const value of ['ft:sleep:start:','ft:sleep:stop:','ft:chore:','action.devices.types.SCENE','action.devices.traits.Scene','sceneReversible:false','willReportState:false','agentUserId:`ft-member-${member.id}`'])assert.ok(home.includes(value),value);
assert.match(home,/SCENE_NAME_MAX=60/);
assert.match(home,/normalize\('NFKC'\)/);
assert.match(home,/Google Homeで同名の操作があります/);
assert.match(home,/slice\(0,15\)/);
for(const value of ['startDedicatedSleepDomain','stopDedicatedSleepDomain','recordQuickChoreDomain','external_command_receipts','GOOGLE_HOME_DISCONNECTED','GOOGLE_HOME_SYNCED','GOOGLE_HOME_TOKEN_ISSUED','GOOGLE_HOME_AUTHORIZE_STARTED','GoogleとFamily TODO'])assert.ok(home.includes(value),value);
assert.match(home,/requestId,key/);
assert.match(home,/linked member|連携したメンバー/);
assert.match(home,/payload:\{devices:\{\}\}/);
assert.match(home,/refreshedAccessToken/);
assert.match(home,/refresh token\n    \/\/ is deterministic|deterministic for the current minute/);
assert.doesNotMatch(home,/access_token_hash=\?,access_expires_at=\?/);
assert.match(home,/credential値は表示しません/);
assert.match(home,/最終Google Home実行/);
assert.match(home,/最終SYNC/);
assert.match(home,/Scene count/);
assert.doesNotMatch(home,/escapeHtml\(ctx\.env\.GOOGLE_HOME_CLIENT_SECRET/);

for(const value of [
  'summarizeGoogleHomeExecute',
  "action='GOOGLE_HOME_EXECUTE_ENVELOPE'",
  'utteranceLikeFieldPresent',
  'scalarArgumentPresent',
  'params keys',
  '発話テキスト系field',
  '受信payload本文・発話文・Scene ID本体・params値・OAuth token・stateは保存/表示しません。',
  "request.clone().json()",
  "external_command_receipts WHERE provider='GOOGLE_HOME' AND request_id=?",
])assert.ok(diagnostics.includes(value),`execute diagnostic marker missing: ${value}`);
assert.ok(!diagnostics.includes('JSON.stringify(diagnosticBody)'),'raw Google Home request payload must never be persisted');
assert.ok(!diagnostics.includes('request.headers.get(\'authorization\')'),'diagnostic wrapper must not duplicate or persist OAuth bearer handling');
assert.match(publicRoutes,/googleFulfillmentWithExecuteDiagnostics/,'public fulfillment route must pass through the privacy-safe diagnostic wrapper');
assert.match(pageRoutes,/googleHomeSettingsWithExecuteDiagnostics/,'Google Home settings page must render the receive-envelope diagnostic');

for(const value of ['family-todo-home','Test integration','Home Graph/Test Suite','再linkまたはGoogle側の再同期','certification/release対象外','GOOGLE_CALENDAR_CLIENT_ID','架空device type/traitは追加しません','Report State非対応'])assert.ok(docs.includes(value),value);

console.log('google-home-voice-contract: OAuth lifecycle, bounded Scene SYNC, idempotent voice execution, privacy-safe received-envelope diagnostics, documented capability bounds, and refresh-race guards ok');
