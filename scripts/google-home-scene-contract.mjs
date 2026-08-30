import assert from 'node:assert/strict';
import fs from 'node:fs';

const home=fs.readFileSync('src/google-home.ts','utf8');
const docs=fs.readFileSync('docs/GOOGLE_HOME_VOICE_SETUP.md','utf8');

assert.ok(home.includes("r.status='SUCCESS'"),'Google Home scene execution must retain SUCCESS status reporting');
assert.ok(home.includes('Google Home側は${syncCount}件同期済み / 現在${scenes.length}件'),'Google Home staged diagnostics must remain visible');
assert.ok(docs.includes('action.devices.types.SCENE'),'Google Home setup docs must retain SCENE device acceptance guidance');
assert.ok(docs.includes('ActivateScene'),'Google Home setup docs must retain ActivateScene guidance');

console.log('google-home-scene-contract: scene execution and diagnostics contracts ok');
