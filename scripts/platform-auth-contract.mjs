import fs from 'node:fs';
import assert from 'node:assert/strict';
import { resolveLiffDestination, validateLiffNext } from '../src/liff-target.ts';
import { safeLineTokenErrorCategory } from '../src/line-oauth-diagnostics.ts';

const read=p=>fs.readFileSync(p,'utf8');
const wrangler=JSON.parse(read('wrangler.jsonc'));

assert.equal(wrangler.keep_vars,true);
assert.ok(['src/index.ts','src/calendar-perf-worker.ts'].includes(wrangler.main),'Worker entry must remain the canonical app or the temporary Calendar diagnostics wrapper');
if(wrangler.main==='src/calendar-perf-worker.ts'){
  const perf=read('src/calendar-perf-worker.ts');
  assert.ok(perf.includes("import baseWorker from './index'"),'diagnostic Worker entry must delegate to canonical src/index.ts');
  assert.ok(perf.includes("return baseWorker.fetch(request, env, ctx)"),'diagnostic Worker entry must preserve non-Calendar fetch routing');
  assert.ok(perf.includes("return baseWorker.scheduled(controller, env, ctx)"),'diagnostic Worker entry must preserve scheduled routing');
}
assert.equal(fs.existsSync('src/index-wave117.ts'),false);
assert.equal(wrangler.vars.GOOGLE_HOME_CLIENT_ID,'Family_ToDo');
assert.equal(wrangler.vars.GOOGLE_HOME_PROJECT_ID,'family-todo-home');
assert.equal('GOOGLE_HOME_CLIENT_SECRET' in wrangler.vars,false);
assert.ok(wrangler.assets.run_worker_first.includes('/')&&wrangler.assets.run_worker_first.includes('/index.php'));
assert.ok(read('wrangler.jsonc').includes('"/liff/*"'),'LIFF path routing must remain worker-first');

const types=read('worker-configuration.d.ts');
for(const name of ['LINE_CHANNEL_ID','VAPID_PUBLIC_KEY','FAMILY_AI_PROVIDER','GOOGLE_CALENDAR_TOKEN_KEY','GOOGLE_TASKS_TOKEN_KEY','GOOGLE_HOME_PROJECT_ID','LINE_LOGIN_CHANNEL_ID?:string','LINE_LOGIN_CHANNEL_SECRET?:string'])assert.ok(types.includes(name),`missing worker binding type: ${name}`);

const health=read('src/environment-health.ts');
assert.ok(health.includes('Object.values(calendar).every(Boolean)'));
assert.ok(health.includes("env.GOOGLE_TASKS_CLIENT_ID||env.GOOGLE_CALENDAR_CLIENT_ID"));
assert.ok(health.includes("env.FAMILY_AI_PROVIDER||'GEMINI'"));

const targets=read('src/liff-target.ts');
for(const path of ['/app/tasks.php','/app/calendar.php','/app/shopping.php','/app/family_log.php','/app/messages.php','/app/settings.php'])assert.ok(targets.includes(`'${path}'`));
for(const route of ['tasks','calendar','shopping','family-log','messages','settings','resolveLiffDestination','liff.state'])assert.ok(targets.includes(route),`missing LIFF route target: ${route}`);
for(const rejected of ['/oauth/google/token','/oauth/google/authorize?client_id=x','https://evil.example','//evil.example','javascript:alert(1)','/app/calendar.php\r\nLocation: //evil','/app\\calendar.php'])assert.equal(validateLiffNext(rejected),null);
assert.equal(validateLiffNext('/app/calendar.php'),'/app/calendar.php');
assert.equal(validateLiffNext('/oauth/google/continue?resume=abc.DEF'),'/oauth/google/continue?resume=abc.DEF');
assert.equal(resolveLiffDestination(new URL('https://example.test/liff/calendar')),'/app/calendar.php');
assert.equal(resolveLiffDestination(new URL('https://example.test/liff?next=%2Fapp%2Fcalendar.php')),'/app/calendar.php');
assert.equal(resolveLiffDestination(new URL('https://example.test/liff?liff.state=%2Fcalendar')),'/app/calendar.php');
assert.equal(resolveLiffDestination(new URL('https://example.test/liff?next=https%3A%2F%2Fevil.test')),'/app/index.php');

const continuation=read('src/oauth-continuation.ts');
for(const token of ['AES-GCM','p.exp>=Date.now()',"u.searchParams.get('flow')==='google_home'",'liffDispatcher','/oauth/line/google-home/start?resume=','INVALID_LEGACY_CONTINUATION','loginRedirect:u.pathname+u.search','Google Home連携情報が無効か、有効期限が切れました。','SESSION_COMMIT_FAILED','LINE_WEB_AUTH_STARTED',"stage:'LIFF_PRIMARY_RECEIVED'",'/oauth/line/google-home/start','https://access.line.me/oauth2/v2.1/authorize','https://api.line.me/oauth2/v2.1/token','code_challenge_method','S256','LINE_STATE_MISMATCH','client_secret:e.LINE_LOGIN_CHANNEL_SECRET',"e.LINE_LOGIN_CHANNEL_ID||e.LINE_CHANNEL_ID",'LINE_LOGIN_NOT_CONFIGURED'])assert.ok(continuation.includes(token),token);
assert.ok(!continuation.includes('client_secret:e.LINE_CHANNEL_SECRET'),'LINE Login OAuth must not use the Messaging API channel secret');
for(const category of ['invalid_request','invalid_grant','invalid_client','unsupported_grant_type','http_status','error_category'])assert.ok(read('src/line-oauth-diagnostics.ts').includes(category)||continuation.includes(category),`missing LINE OAuth diagnostic category: ${category}`);
assert.ok(!continuation.includes('`/liff?flow=google_home'),'Google Home OAuth must not route through the retired LIFF flow parameter');
const normalLiff=continuation.slice(continuation.indexOf('export async function normalLiff'),continuation.indexOf('export async function liffDispatcher'));
assert.ok(!normalLiff.includes('ctx.member)return go'),'normal LIFF flow must not bypass continuation after member lookup');
const index=read('src/index.ts');
assert.ok(index.includes('return await liffDispatcher(request,env)'));
assert.ok(index.includes("verifyLineWebhook(body,sig,env.LINE_CHANNEL_SECRET)"),'LINE webhook must continue using the Messaging API channel secret');
assert.ok(index.includes("url.pathname.startsWith('/liff/')"),'path-based LIFF routing must stay wired');
assert.ok(index.includes("code:'AUTH_REQUIRED'"),'LIFF auth-required response must stay explicit');
assert.ok(index.includes('encodeURIComponent(next)'),'LIFF continuation target must remain URL encoded');
assert.ok(read('src/app.ts').includes('validateLiffNext(body.next)'));

const client=read('public/assets/liff-auth.js');
assert.ok(client.includes('await window.liff.init'));
assert.ok(client.indexOf('await window.liff.init')<client.indexOf('const current=resolve()'),'LIFF must initialize before resolving the current target');
assert.ok(client.includes("url.searchParams.get('next')"),'LIFF target resolution must honor next');
assert.ok(client.includes('return valid(payload.next)'),'LIFF payload next must be validated');
assert.ok(client.includes("fetch('/__cf/auth-health'"),'LIFF auth flow must retain auth-health diagnostics');
assert.ok(client.includes('セッションを確認できません'),'LIFF auth failures must remain user-visible');
assert.ok(client.includes('next:current'));
assert.ok(client.includes('const target=valid(data.redirect)'));
assert.ok(!client.includes("data.redirect||'/app/index.php'"));
assert.ok(!client.includes('googleHome'),'LIFF client must stay generic and not embed Google Home flow state');

const voiceSetup=read('docs/GOOGLE_HOME_VOICE_SETUP.md');
for(const page of ['tasks.php','calendar.php','shopping.php','family_log.php','messages.php','settings.php'])assert.ok(voiceSetup.includes(`{LIFF_ID}/?next=%2Fapp%2F${page}`),`missing LIFF setup example for ${page}`);
assert.ok(voiceSetup.includes('LINE Login channel → Basic settings'),'Google Home setup docs must distinguish LINE Login channel configuration');
assert.ok(voiceSetup.includes('{LIFF_ID}/calendar'),'Google Home setup docs must retain path-style LIFF example');

assert.equal(safeLineTokenErrorCategory('invalid_client'),'invalid_client');
assert.equal(safeLineTokenErrorCategory('invalid_grant'),'invalid_grant');
assert.equal(safeLineTokenErrorCategory('credential-value'),'unknown');

for(const secret of ['GOOGLE_HOME_CLIENT_SECRET','GEMINI_API_KEY','VAPID_PRIVATE_KEY'])assert.equal(Object.hasOwn(wrangler.vars,secret),false);
assert.equal(JSON.parse(read('package.json')).version,JSON.parse(read('source_inventory.json')).version);

console.log('platform-auth-contract: LIFF targets, OAuth continuation and environment configuration ok');
