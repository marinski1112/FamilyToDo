import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import {stripTypeScriptTypes} from 'node:module';
const read=p=>fs.readFileSync(p,'utf8');
const code=p=>stripTypeScriptTypes(read(p).replace(/^import .*$/gm,'').replace(/^export /gm,''));
const settings=new Map(),queries=[],writes=[];
const db={prepare(sql){return {bind(...args){this.args=args;return this;},async first(){queries.push({sql,args:this.args});return {setting_value:settings.get(this.args.join('|'))};},async run(){writes.push({sql,args:this.args});return {};}};}};
let catalogCalls=0;
const context=vm.createContext({Request,Response,Set,Number,Array,Date,JSON,
  listGeminiModels:async()=>{catalogCalls++;return [{model:'gemini-test-owner'},{model:'gemini-test-member'}];},
  familyAiModelCatalog:async()=>new Response('{}',{status:200}),
  layout:(_title,body)=>body,html:body=>new Response(body,{headers:{'Content-Type':'text/html'}}),
});
vm.runInContext(code('src/ai-model-routing.ts')+'\n'+code('src/settings-ai-model-routing.ts')+'\nthis.resolve=resolveFeatureModels;this.page=settingsAiModelRouting;',context);
settings.set('1|ai_model_route_v1_ROUGH_INPUT_OWNER','["gemini-test-owner","gemini-test-owner"]');
settings.set('1|ai_model_route_v1_ROUGH_INPUT_MEMBER','["gemini-test-member"]');
settings.set('1|ai_model_route_v1_MESSAGE_DRAFT_OWNER','["gemini-message"]');
assert.deepEqual(Array.from((await context.resolve(db,1,'ROUGH_INPUT','OWNER')).models),['gemini-test-owner']);
assert.deepEqual(Array.from((await context.resolve(db,1,'ROUGH_INPUT','ADMIN')).models),['gemini-test-member']);
assert.deepEqual(Array.from((await context.resolve(db,1,'MESSAGE_DRAFT','OWNER')).models),['gemini-message']);
assert.deepEqual(Array.from((await context.resolve(db,1,'FAMILY_DAILY_JOURNAL','OWNER')).models),['gemini-3.6-flash','gemini-3.5-flash']);
assert.deepEqual(Array.from((await context.resolve(db,1,'MORNING_DIGEST','OWNER')).models),['gemini-3.8-flash','gemini-3.5-flash']);
assert.equal((await context.resolve(db,2,'ROUGH_INPUT','OWNER')).source,'FEATURE_DEFAULT');
settings.set('2|ai_model_route_v1_ROUGH_INPUT_OWNER','["https://private.invalid/secret"]');
assert.equal((await context.resolve(db,2,'ROUGH_INPUT','OWNER')).source,'FEATURE_DEFAULT');
assert.equal(catalogCalls,0,'runtime resolution must not query the provider');
const ctx={member:{id:1,family_id:1,role:'OWNER'},session:{csrfToken:'test'},env:{DB:db}};
const request=data=>new Request('https://example.invalid/app/settings_ai_models.php',{method:'POST',body:new URLSearchParams(data)});
let response=await context.page(new Request('https://example.invalid'),ctx);
assert.equal(response.status,200);assert.equal(catalogCalls,0);assert.equal(writes.length,0,'GET cannot mutate or generate');
response=await context.page(request({csrf:'test',action:'save',feature:'ROUGH_INPUT',audience:'OWNER',primary:'gemini-test-owner'}),{...ctx,member:{...ctx.member,role:'MEMBER'}});
assert.equal(response.status,403);assert.equal(catalogCalls,0);assert.equal(writes.length,0);
response=await context.page(request({csrf:'wrong',action:'save'}),ctx);assert.equal(response.status,403);
response=await context.page(request({csrf:'test',action:'save',feature:'ROUGH_INPUT',audience:'OWNER',primary:'gemini-invented'}),ctx);
assert.equal(response.status,400);assert.equal(writes.length,0,'unknown IDs must fail closed');
response=await context.page(request({csrf:'test',action:'save',feature:'ROUGH_INPUT',audience:'MEMBER',primary:'gemini-test-member',fallback:'gemini-test-member',familyId:'999'}),ctx);
assert.equal(response.status,303);assert.deepEqual(writes[0].args.slice(0,3),[1,'ai_model_route_v1_ROUGH_INPUT_MEMBER','["gemini-test-member"]']);
assert.equal(response.headers.get('Cache-Control'),'private, no-store');
const rough=read('src/task-rough-input-api.ts'),page=read('src/settings-ai-model-routing.ts');
assert(rough.indexOf("return fallback('SIMPLE_INPUT')")<rough.indexOf('await resolveFeatureModels'),'simple input must not even read routing');
assert(rough.includes("context.modelFeature||'ROUGH_INPUT',member.role"),'role comes from trusted context, not request fields');
assert(!page.includes('geminiFetch('),'settings never generates content');
assert(read('src/message-ai-draft.ts').includes("modelFeature:'MESSAGE_DRAFT'"));
console.log('Model routing: tenant/role/feature separation, catalog validation, no generation on reads, bounded deduplicated attempts, admin and CSRF pass.');
