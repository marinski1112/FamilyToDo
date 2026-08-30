import assert from 'node:assert/strict';
import fs from 'node:fs';

const ai=fs.readFileSync('src/family-ai.ts','utf8');
const index=fs.readFileSync('src/index.ts','utf8');
const app=fs.readFileSync('src/app.ts','utf8');
const wrangler=fs.readFileSync('wrangler.jsonc','utf8');
const calendar=fs.readFileSync('src/google-calendar.ts','utf8')+fs.readFileSync('src/google-calendar-core.ts','utf8');
const home=fs.readFileSync('src/google-home.ts','utf8');
const docs=fs.readFileSync('docs/EXTERNAL_SERVICE_COSTS.md','utf8');

assert.ok(ai.includes("new URL('https://generativelanguage.googleapis.com/v1beta/models')"));
assert.ok(ai.includes("'x-goog-api-key':env.GEMINI_API_KEY"));
assert.ok(index.includes('/api/family-ai/model-catalog'));
assert.ok(index.includes('/api/family-ai/model-probe'));

const catalog=ai.slice(ai.indexOf('export async function familyAiModelCatalog'));
assert.ok(catalog.includes('listGeminiModels'));
assert.ok(catalog.includes('autoSwitch:false'));
assert.ok(ai.includes("methods.includes('generateContent')"));
assert.ok(ai.includes('.slice(0,8)'));
assert.ok(ai.includes('nextPageToken'));
assert.ok(ai.includes("pageSize','1000'"));
assert.match(ai,/GEMINI_MODEL_DEFAULT='gemini-3\.1-flash-lite'/);
assert.ok(ai.includes('resolveFamilyGeminiModel'));
assert.match(ai,/'x-goog-api-key':key/);
assert.ok(!ai.includes('generateContent?key='));
assert.ok((ai.match(/geminiFetch\(/g)||[]).length>=2);
for(const marker of ['quotaViolations','FREE_TIER_QUOTA_ZERO','RATE_LIMIT_RPD','RATE_LIMIT_RPM','RATE_LIMIT_TPM','RATE_LIMIT_TEMPORARY','RATE_LIMIT_UNKNOWN','quotaMetric','quotaId','quotaDimensions','quotaValue','retryDelay','API_KEY_INVALID','PERMISSION_DENIED','INVALID_REQUEST','FAILED_PRECONDITION','MODEL_NOT_FOUND','UPSTREAM_UNAVAILABLE'])assert.ok(ai.includes(marker),marker);
assert.ok(!ai.includes('error.message'));
assert.match(ai,/if\(!res\.ok\)throw new GeminiUpstreamError/);
assert.match(ai,/e\.status===429\?429:503/);
assert.ok(ai.includes(':generateContent'));
assert.ok(ai.includes('functionCallingConfig'));
assert.ok(ai.includes('maxItems:3'));
assert.ok(ai.includes('family_statistics'));
assert.ok(ai.includes('tokenized question')||docs.includes('tokenized question'));
assert.ok(docs.includes('Paid Tier'));
assert.ok(docs.includes('課金関連API'));

for(const marker of ['interface FamilyAiPlanner','class GeminiPlanner','class WorkersAiPlanner','FAMILY_AI_PROVIDER','WORKERS_AI_MODEL_DEFAULT','response_format','validate(plan.name','executeFamilyAiTool'])assert.ok(ai.includes(marker),marker);
assert.match(wrangler,/"ai"\s*:\s*\{\s*"binding"\s*:\s*"AI"/);
assert.ok(!ai.includes('AUTO'));
assert.match(ai,/if\(!authorizedAdmin\(ctx\)\)return json\(\{ok:false,error:'管理者権限が必要です。'\},403\)/);
assert.ok(app.includes('!managementMode&&familyLogIsAdmin'));

for(const marker of ['model-compatibility','calendar.app.created',"1,'EVENT'",'syncToken',"visibility_scope='FAMILY'",'calendar_sync_outbox'])assert.ok(calendar.includes(marker),marker);
for(const marker of ['oauth-redirect.googleusercontent.com','oauth-redirect-sandbox.googleusercontent.com','GOOGLE_HOME_PROJECT_ID','action.devices.types.SCENE','action.devices.commands.ActivateScene','external_command_receipts'])assert.ok(home.includes(marker),marker);

console.log('family-ai-provider-contract: provider catalog, quota/error diagnostics, model probing, planner boundary, admin gate, and integration prerequisites ok');
