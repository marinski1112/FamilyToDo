import fs from 'node:fs';
import assert from 'node:assert/strict';
import { validateLiffNext } from '../src/liff-target.ts';

const read=p=>fs.readFileSync(p,'utf8');
const wrangler=JSON.parse(read('wrangler.jsonc'));

assert.equal(wrangler.keep_vars,true);
assert.equal(wrangler.main,'src/index.ts');
assert.equal(fs.existsSync('src/index-wave117.ts'),false);
assert.equal(wrangler.vars.GOOGLE_HOME_CLIENT_ID,'Family_ToDo');
assert.equal(wrangler.vars.GOOGLE_HOME_PROJECT_ID,'family-todo-home');
assert.equal('GOOGLE_HOME_CLIENT_SECRET' in wrangler.vars,false);
assert.ok(wrangler.assets.run_worker_first.includes('/')&&wrangler.assets.run_worker_first.includes('/index.php'));

const types=read('worker-configuration.d.ts');
for(const name of ['LINE_CHANNEL_ID','VAPID_PUBLIC_KEY','FAMILY_AI_PROVIDER','GOOGLE_CALENDAR_TOKEN_KEY','GOOGLE_TASKS_TOKEN_KEY','GOOGLE_HOME_PROJECT_ID'])assert.ok(types.includes(name));

const health=read('src/environment-health.ts');
assert.ok(health.includes('Object.values(calendar).every(Boolean)'));
assert.ok(health.includes("env.GOOGLE_TASKS_CLIENT_ID||env.GOOGLE_CALENDAR_CLIENT_ID"));
assert.ok(health.includes("env.FAMILY_AI_PROVIDER||'GEMINI'"));

const targets=read('src/liff-target.ts');
for(const path of ['/app/tasks.php','/app/calendar.php','/app/shopping.php','/app/family_log.php','/app/messages.php','/app/settings.php'])assert.ok(targets.includes(`'${path}'`));
for(const rejected of ['/oauth/google/token','/oauth/google/authorize?client_id=x','https://evil.example','//evil.example','javascript:alert(1)','/app/calendar.php\r\nLocation: //evil','/app\\calendar.php'])assert.equal(validateLiffNext(rejected),null);
assert.equal(validateLiffNext('/app/calendar.php'),'/app/calendar.php');
assert.equal(validateLiffNext('/oauth/google/continue?resume=abc.DEF'),'/oauth/google/continue?resume=abc.DEF');

const continuation=read('src/oauth-continuation.ts');
for(const token of ['AES-GCM','p.exp>=Date.now()',"u.searchParams.get('flow')==='google_home'",'liffDispatcher','/oauth/line/google-home/start?resume=','INVALID_LEGACY_CONTINUATION','loginRedirect:u.pathname+u.search','Google Home連携情報が無効か、有効期限が切れました。','SESSION_COMMIT_FAILED'])assert.ok(continuation.includes(token),token);
assert.ok(read('src/index.ts').includes('return await liffDispatcher(request,env)'));
assert.ok(read('src/app.ts').includes('validateLiffNext(body.next)'));

const client=read('public/assets/liff-auth.js');
assert.ok(client.includes('await window.liff.init'));
assert.ok(client.includes('next:current'));
assert.ok(client.includes('const target=valid(data.redirect)'));
assert.ok(!client.includes("data.redirect||'/app/index.php'"));

for(const secret of ['GOOGLE_HOME_CLIENT_SECRET','GEMINI_API_KEY','VAPID_PRIVATE_KEY'])assert.equal(Object.hasOwn(wrangler.vars,secret),false);
assert.equal(JSON.parse(read('package.json')).version,JSON.parse(read('source_inventory.json')).version);

console.log('platform-auth-contract: LIFF targets, OAuth continuation and environment configuration ok');
