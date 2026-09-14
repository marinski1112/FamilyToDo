import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { retainedAppContractSource } from './retained-app-contract-source.mjs';

const ai=fs.readFileSync('src/family-ai.ts','utf8');
const index=fs.readFileSync('src/index.ts','utf8');
const apiRoutes=fs.readFileSync('src/context-api-routes.ts','utf8');
const app=retainedAppContractSource();
const wrangler=fs.readFileSync('wrangler.jsonc','utf8');
const calendar=fs.readFileSync('src/google-calendar.ts','utf8')+fs.readFileSync('src/google-calendar-core.ts','utf8');
const oneWay=fs.readFileSync('src/google-calendar-one-way.ts','utf8');
const home=fs.readFileSync('src/google-home.ts','utf8');
const docs=fs.readFileSync('docs/EXTERNAL_SERVICE_COSTS.md','utf8');

// Exercise the real inline browser handler with the current catalog schema:
// available/generateContentSupported are not returned by this API.
const integrationSource=fs.readFileSync('src/google-calendar-core.ts','utf8');
const handler=integrationSource.slice(integrationSource.indexOf('async function act('),integrationSource.indexOf("document.getElementById('calendarSync')"));
assert.ok(handler.startsWith('async function act('));
let payload={ok:true,provider:'GEMINI',results:[{model:'gemini-test',supportedGenerationMethods:['generateContent']}]},fetches=0;
const label={textContent:''};
const browser=vm.createContext({csrf:'fixture',aiMessages:{PERMISSION_DENIED:'権限を確認してください'},
  fetch:async()=>{fetches++;return {json:async()=>payload};},
  document:{getElementById:()=>label},location:{reload:()=>assert.fail('catalog must not reload')},
});
vm.runInContext(handler+';this.invoke=act;',browser);
await browser.invoke('/api/family-ai/model-catalog');
assert.match(label.textContent,/一覧を取得.*1件/);
assert.match(label.textContent,/未確認/);
assert.ok(!label.textContent.includes('利用不可'));
payload={ok:false,category:'PERMISSION_DENIED'};
await browser.invoke('/api/family-ai/model-catalog');
assert.equal(label.textContent,'権限を確認してください');
payload={ok:true,results:[]};
await browser.invoke('/api/family-ai/model-catalog');
assert.match(label.textContent,/0件/);
assert.equal(fetches,3,'one request per catalog action, no generation probes');

assert.ok(ai.includes("new URL('https://generativelanguage.googleapis.com/v1beta/models')"));
assert.ok(ai.includes("'x-goog-api-key':env.GEMINI_API_KEY"));
assert.ok(apiRoutes.includes('/api/family-ai/model-catalog'));
assert.ok(apiRoutes.includes('/api/family-ai/model-probe'));

const catalog=ai.slice(ai.indexOf('export async function familyAiModelCatalog'));
assert.ok(catalog.includes('listGeminiModels'));
assert.ok(catalog.includes('autoSwitch:false'));
assert.ok(ai.includes("methods.includes('generateContent')"));
assert.ok(ai.includes('.slice(0,8)'));
assert.ok(ai.includes('nextPageToken'));
assert.ok(ai.includes("pageSize','1000'"));
assert.match(ai,/GEMINI_MODEL_DEFAULT='gemini-3\.1-flash-lite'/);
assert.ok(!ai.includes('gemini-2.0-flash'));
assert.match(ai,/env\.GEMINI_MODEL\?\.trim\(\)\|\|GEMINI_MODEL_DEFAULT/);
assert.ok(ai.includes('resolveFamilyGeminiModel'));
assert.match(ai,/'x-goog-api-key':key/);
assert.ok(!ai.includes('generateContent?key='));
assert.ok((ai.match(/geminiFetch\(/g)||[]).length>=2);
for(const marker of ['quotaViolations','FREE_TIER_QUOTA_ZERO','RATE_LIMIT_RPD','RATE_LIMIT_RPM','RATE_LIMIT_TPM','RATE_LIMIT_TEMPORARY','RATE_LIMIT_UNKNOWN','quotaMetric','quotaId','quotaDimensions','quotaValue','retryDelay','NOT_CONFIGURED','API_KEY_INVALID','PERMISSION_DENIED','INVALID_REQUEST','FAILED_PRECONDITION','MODEL_NOT_FOUND','UPSTREAM_UNAVAILABLE','UNKNOWN'])assert.ok(ai.includes(marker),marker);
for(const status of ['status===400','status===404','status===429','status>=500'])assert.ok(ai.includes(status),status);
assert.ok(!ai.includes('error.message'));
assert.ok(!/await r\.text|console\.(?:log|error).*gemini/i.test(ai));
assert.match(ai,/if\(!res\.ok\)throw new GeminiUpstreamError/);
assert.match(ai,/e\.status===429\?429:503/);
assert.ok(ai.includes(':generateContent'));
assert.ok(ai.includes('functionCallingConfig'));
assert.ok(ai.includes('maxItems:3'));
assert.ok(ai.includes('family_statistics'));
for(const privacy of ['tok.question','FAMILY_AI_FUNCTIONS','generationConfig:{maxOutputTokens:512}','synthetic connectivity test; no user data is included'])assert.ok(ai.includes(privacy),privacy);
assert.match(ai,/質問を解析できませんでした。表現を少し変えてください。/);
assert.ok(ai.includes('tokenized question')||docs.includes('tokenized question'));
assert.ok(docs.includes('Paid Tier'));
assert.ok(docs.includes('課金関連API'));

for(const marker of ['interface FamilyAiPlanner','class GeminiPlanner','class WorkersAiPlanner','FAMILY_AI_PROVIDER','WORKERS_AI_MODEL_DEFAULT','response_format','validate(plan.name','executeFamilyAiTool'])assert.ok(ai.includes(marker),marker);
assert.match(wrangler,/"ai"\s*:\s*\{\s*"binding"\s*:\s*"AI"/);
assert.ok(!ai.includes('AUTO'));
assert.match(ai,/if\(!authorizedAdmin\(ctx\)\)return json\(\{ok:false,error:'管理者権限が必要です。'\},403\)/);
assert.ok(app.includes('const aiEntry=managementMode&&familyLogIsAdmin?'),'FamilyAI entry must be restricted to admin management');
assert.ok(!app.includes('const aiEntry=!managementMode'),'FamilyAI entry must stay off the daily log page');

for(const marker of ['model-compatibility','calendar.app.created',"visibility_scope='FAMILY'",'calendar_sync_outbox','familyTodoTaskId','processCalendarOutbox'])assert.ok(calendar.includes(marker),marker);
assert.ok(oneWay.includes('received: 0')&&oneWay.includes('inbound_more: false'),'Family AI integration prerequisites must not depend on Google Calendar inbound');
for(const retired of ['processCalendarInbound','applyInbound','syncCalendarAccount'])assert.ok(!calendar.includes(retired),`retired normal Calendar inbound must stay absent: ${retired}`);
for(const marker of ['oauth-redirect.googleusercontent.com','oauth-redirect-sandbox.googleusercontent.com','GOOGLE_HOME_PROJECT_ID','action.devices.types.SCENE','action.devices.commands.ActivateScene','external_command_receipts'])assert.ok(home.includes(marker),marker);

console.log('family-ai-provider-contract: provider catalog, quota/error diagnostics, privacy guardrails, model probing, planner boundary, admin gate, and one-way integration prerequisites ok');
