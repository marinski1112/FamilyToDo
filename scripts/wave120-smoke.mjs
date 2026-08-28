import fs from 'node:fs';import assert from 'node:assert/strict';
const read=p=>fs.readFileSync(p,'utf8'),oauth=read('src/oauth-continuation.ts'),app=read('src/app.ts'),liff=read('public/assets/liff-auth.js'),docs=read('docs/GOOGLE_HOME_VOICE_SETUP.md'),css=read('public/assets/calendar.css'),migration=read('migrations/0040_wave120_family_log_quick_actions.sql'),pkg=JSON.parse(read('package.json'));

for(const x of ['/oauth/line/google-home/start','https://access.line.me/oauth2/v2.1/authorize','https://api.line.me/oauth2/v2.1/token','code_challenge_method','S256','LINE_STATE_MISMATCH','SESSION_COMMIT_FAILED'])assert.ok(oauth.includes(x));
assert.ok(!liff.includes('googleHome'));assert.ok(liff.includes("fetch('/__cf/auth-health'") );assert.ok(liff.indexOf('await window.liff.init')<liff.indexOf('const current=resolve()'));
for(const p of ['tasks.php','calendar.php','shopping.php','family_log.php','messages.php','settings.php'])assert.ok(docs.includes(`{LIFF_ID}/?next=%2Fapp%2F${p}`));
for(const x of ['family_log_quick_actions',"'QUICK','FORM','SLEEP_TOGGLE'",'subject_id','sort_order'])assert.ok(migration.includes(x));
for(const x of ["action==='execute_quick_action'","action==='quick_action_save'",'quick_action_id:quickActionId','selectedQuickActions'])assert.ok(app.includes(x));
for(const x of ['width:min(300px,calc(100vw - 24px))','minmax(0,.65fr)','min-width:0','--calendar-no-band-content-top:29px'])assert.ok(css.includes(x));
assert.ok(!oauth.includes('`/liff?flow=google_home'));
console.log('wave120 smoke: ok');
