import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import { stripTypeScriptTypes } from 'node:module';

const source=p=>fs.readFileSync(p,'utf8');
const compile=s=>stripTypeScriptTypes(s.replace(/^import .*$/gm,''),{mode:'strip'}).replace(/export /g,'');
const daily=source('src/line-daily-digest.ts');
const helper=source('src/line-digest-generation.ts');
const settings=source('src/settings-ai-diagnostics.ts');
const fact={localDate:'2026-09-10',previousDate:'2026-09-09',familyLog:{previous:[],today:[]},today:{events:[],tasks:[],bringItems:[],completed:0,incomplete:0,overdue:0}};
async function run(responses,{reserve=true,persisted=null,enabled=true}={}){
  let calls=0,stored=null;
  const context=vm.createContext({Date,JSON,Number,String,Set,Map,Math,Error,SyntaxError,Response,
    familyAiProvider:()=> 'GEMINI',loadSafeFamilyAiProfileContext:async()=>[],
    readFinalizedMorningDigestFrame:async()=>persisted,reserveMorningDigestAiRequest:async()=>reserve,
    finalizeMorningDigestFrame:async(_db,_f,_d,value)=>{stored=JSON.parse(value);},
    blockMorningDigestAiAfter429:async()=>{},
    geminiFetch:async()=>{const value=responses[Math.min(calls++,responses.length-1)];if(value instanceof Error)throw value;return value();},
  });
  vm.runInContext(compile(helper)+'\n'+compile(daily)+'\nthis.choose=chooseFrame;',context);
  await context.choose({DB:{},GEMINI_API_KEY:'test',MORNING_DIGEST_AI_ENABLED:enabled?'1':'0'},'FRIENDLY',1,'2026-09-10',fact,null,[{id:1,name:'member'}]);
  return {calls,stored,context};
}
const ok=()=>Response.json({candidates:[{content:{parts:[{text:JSON.stringify({recap:'穏やかな朝を迎えましょう。',members:[{memberId:1,note:'無理せず過ごしてね。',fortune:'好きな音楽が気分を明るくしてくれそう。'}]})}]}}]});
let result=await run([ok]);
assert.equal(result.calls,1);assert.equal(result.stored.generation.status,'AI');assert.equal(result.stored.generation.attempts[0].reason,'OK');
for(const [response,reason,stage] of [
  [()=>new Response('',{status:403}),'HTTP_ERROR','PROVIDER_RESPONSE'],
  [()=>new Response('broken'),'RESPONSE_BODY_JSON_INVALID','RESPONSE_PARSE'],
  [()=>Response.json({candidates:[]}),'CANDIDATE_TEXT_MISSING','OUTPUT_PARSE'],
  [()=>Response.json({candidates:[{content:{parts:[{text:'broken'}]}}]}),'MODEL_OUTPUT_JSON_INVALID','OUTPUT_PARSE'],
  [Object.assign(new Error('private upstream content'),{name:'AbortError'}),'PROVIDER_TIMEOUT','PROVIDER_FETCH'],
  [new Error('private upstream content'),'NETWORK_ERROR','PROVIDER_FETCH'],
]){
  result=await run([response]);assert.equal(result.calls,2);
  assert.equal(result.stored.generation.status,'FALLBACK');
  assert.equal(result.stored.generation.attempts[0].reason,reason);
  assert.equal(result.stored.generation.attempts[0].stage,stage);
  assert.ok(!JSON.stringify(result.stored.generation).includes('private'));
}
result=await run([ok],{reserve:false});assert.equal(result.calls,0);assert.equal(result.stored.generation.reason,'BUDGET_OR_CIRCUIT');
const rejected=(recap,note)=>()=>Response.json({candidates:[{content:{parts:[{text:JSON.stringify({recap,members:[{memberId:1,note,fortune:'晴れやかな気分で過ごせそう。'}]})}]}}]});
result=await run([rejected('3件が完了しました。','穏やかに。')]);assert.equal(result.stored.generation.attempts[0].stage,'RECAP_VALIDATION');assert.equal(result.stored.generation.attempts[0].reason,'NUMERIC_CLAIM');
result=await run([rejected('穏やかに過ごしましょう。','5分の休憩を。')]);assert.equal(result.stored.generation.attempts[0].stage,'MEMBER_VALIDATION');assert.equal(result.stored.generation.attempts[0].reason,'NUMERIC_CLAIM');
result=await run([ok],{persisted:JSON.stringify({narrativeVersion:3,recap:null})});assert.equal(result.calls,0);assert.equal(result.stored,null);
const context=vm.createContext({Set,Number,Array});
vm.runInContext(compile(helper)+'\nthis.sanitize=safeDigestAttempts;',context);
assert.equal(JSON.stringify(context.sanitize([{model:'test',httpStatus:200,stage:'COMPLETE',reason:'OK',durationMs:10,secret:'hidden',prompt:'hidden'}])),JSON.stringify([{model:'test',httpStatus:200,stage:'COMPLETE',reason:'OK',durationMs:10}]));
assert.equal(context.sanitize([{model:'secret/value',stage:'COMPLETE',reason:'OK'}]).length,0);
assert.ok(settings.indexOf('if(!baseResponse.ok)return baseResponse')<settings.indexOf('SELECT local_date'));
assert.ok(settings.includes('WHERE family_id=? AND finalized=1'));
assert.equal((daily.match(/geminiFetch\(/g)||[]).length,1);
console.log('Morning attempt evidence: success, failure, timeout, budget, frame reuse, privacy and authorization contracts pass.');
