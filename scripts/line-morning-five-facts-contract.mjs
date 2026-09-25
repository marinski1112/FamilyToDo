import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {webcrypto} from 'node:crypto';
import {stripTypeScriptTypes} from 'node:module';

const source=fs.readFileSync('src/line-daily-digest.ts','utf8');
const code=path=>stripTypeScriptTypes(fs.readFileSync(path,'utf8').replace(/^import .*$/gm,''),{mode:'strip'}).replace(/\bexport /g,'');
const payload=(tasks=['□ 自分の秘密の提出物'])=>({
  localDate:'2026-09-25',previousDate:'2026-09-24',
  today:{events:['14:00 懇談'],tasks,bringItems:['□ 水筒'],shopping:['牛乳'],completed:1,incomplete:1,overdue:0},
  familyLog:{previous:['昨日の秘密'],today:[]},location:{previous:['位置の秘密'],today:[]},fortune:{message:'占いの秘密'},
});
const rows=new Map(),sent=[],prompts=[];
let responseText=JSON.stringify({message:'提出物を確認し、懇談には水筒を持参してください。買い物は牛乳が残っています。自宅は晴れです。'});
let status=200;
const ctx=vm.createContext({Date,JSON,Number,String,Set,Map,Math,Error,SyntaxError,Response,TextEncoder,Uint8Array,crypto:webcrypto,
  familyAiProvider:()=> 'GEMINI',formatMorningWeather:()=> '晴れ 24℃',
  resolveFeatureModels:async()=>({models:['gemini-3.8-flash','gemini-3.5-flash'],source:'FAMILY_SETTING'}),
  readFinalizedMorningDigestFrame:async(_db,_family,key)=>rows.get(key)||null,
  finalizeMorningDigestFrame:async(_db,_family,key,raw)=>{rows.set(key,raw);sent.push(JSON.parse(raw));},
  reserveMorningDigestAiRequest:async(_db,_family,key,_retry,limit)=>{assert.equal(limit,1);assert.match(key,/^2026-09-25:v4:[0-9a-f]{24}$/);return true;},
  blockMorningDigestAiAfter429:async()=>{},
  geminiFetch:async(_env,model,body)=>{prompts.push(body.contents[0].parts[0].text);assert.equal(model,'gemini-3.8-flash');return {ok:status===200,status,json:async()=>({candidates:[{content:{parts:[{text:responseText}]}}]})};},
});
vm.runInContext(code('src/line-digest-generation.ts')+'\n'+code('src/line-daily-digest.ts')+'\nthis.renderMorningMessage=renderMorningMessage;',ctx);
const env={DB:{},GEMINI_API_KEY:'test'};
const first=await ctx.renderMorningMessage(env,10,'2026-09-25','line-recipient-A',payload(),{});
assert.ok(first.includes('提出物'));
assert.equal(prompts.length,1);
for(const fact of ['remaining_tasks','remaining_shopping','today_bring_items','today_events','home_weather'])assert.ok(prompts[0].includes(fact),fact);
for(const forbidden of ['昨日の秘密','位置の秘密','占いの秘密','personality_note','PRIVATEタスク'])assert.ok(!prompts[0].includes(forbidden),forbidden);
assert.ok(!first.includes('【今日のタスク】')&&!first.includes('おはようございます'));
assert.ok(!JSON.stringify(sent).includes('提出物'),'cached diagnostics must not retain PRIVATE message text');
const retry=await ctx.renderMorningMessage(env,10,'2026-09-25','line-recipient-A',payload(),{});
assert.equal(prompts.length,1,'same destination retries without another Gemini request');
assert.ok(retry.includes('【残りタスク】')&&!retry.includes('昨日'));
assert.ok(retry.includes('【自宅の今日の天気】'));
responseText=JSON.stringify({message:'懇談の前に水筒をご用意ください。牛乳の買い物と提出物Bも残っています。自宅は晴れです。'});
await ctx.renderMorningMessage(env,10,'2026-09-25','line-recipient-B',payload(['□ 提出物B']),{});
assert.equal(prompts.length,2);
assert.ok(!prompts[1].includes('自分の秘密の提出物'),'other destination receives only its own facts');
assert.equal(rows.size,2);
status=429;
const failed=await ctx.renderMorningMessage(env,10,'2026-09-25','line-recipient-C',payload(['□ 提出物C']),null);
assert.ok(failed.includes('【残りタスク】')&&failed.includes('提出物C'));
assert.equal(prompts.length,3,'429 must not try a second model');
assert.equal(sent.at(-1).generation.reason,'RATE_LIMIT');
status=403;
const forbidden=await ctx.renderMorningMessage(env,10,'2026-09-25','line-recipient-D',payload(['□ 提出物D']),null);
assert.ok(forbidden.includes('提出物D'));
assert.equal(sent.at(-1).generation.attempts[0].reason,'HTTP_ERROR');
assert.equal(prompts.length,4);
status=200;responseText='broken';
const invalid=await ctx.renderMorningMessage(env,10,'2026-09-25','line-recipient-E',payload(['□ 提出物E']),null);
assert.ok(invalid.includes('提出物E'));
assert.equal(sent.at(-1).generation.attempts[0].reason,'MODEL_OUTPUT_JSON_INVALID');
assert.equal(prompts.length,5);
responseText=JSON.stringify({message:'おはようございます。今日も頑張りましょう。'});
const greeting=await ctx.renderMorningMessage(env,10,'2026-09-25','line-recipient-F',payload(['□ 提出物F']),null);
assert.ok(greeting.includes('【残りタスク】')&&!greeting.includes('おはようございます'));
assert.equal(sent.at(-1).generation.reason,'INVALID_OUTPUT');
assert.equal(prompts.length,6);
console.log('morning five facts: destination isolation, one AI request, no stored private text, five-fact fallback and no retry generation');
