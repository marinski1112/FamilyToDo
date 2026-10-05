import type {AppContext} from './app-context';
import {BadRequest} from './errors';
import {previewMealBaby} from './meal-baby';
import {mealHash,mealId} from './meal-domain';
import {familyAiProvider,geminiFetch} from './family-ai';
import {resolveFeatureModels} from './ai-model-routing';

/** AI may order checklist codes only. Medical wording and the full review stay in normal code. */
export function validateBabyGuidance(value:any,codes:string[]):string[]|null{
 if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).length!==1||!Array.isArray(value.codes)||value.codes.length!==Math.min(3,codes.length))return null;
 return value.codes.every((c:unknown)=>typeof c==='string'&&codes.includes(c))&&new Set(value.codes).size===value.codes.length?value.codes:null;
}
export async function guideMealBaby(ctx:AppContext,raw:any){
 if(raw.consent!==true)throw new BadRequest('確認項目の種類をAIへ送信することに同意してください。');
 const review=await previewMealBaby(ctx,raw);
 // Do not ask a model to reinterpret a block or send sensitive child/food information.
 if(review.status==='BLOCKED')return {review,guidance:{mode:'RULES',reason:'BLOCKED',codes:[]}};
 const codes=[...new Set(review.notices.map(n=>n.code))].filter(c=>c!=='FINAL_REVIEW');
 if(!codes.length)return {review,guidance:{mode:'RULES',reason:'NO_PENDING_CHECKS',codes:[]}};
 const db=ctx.env.MEALS_DB!,familyId=Number(ctx.member!.family_id),memberId=Number(ctx.member!.id),id=mealId(raw.request_id);
 const hash=await mealHash({memberId,subject_id:raw.subject_id,profile_revision:raw.profile_revision||'',recipe_id:raw.recipe_id,recipe_revision:raw.recipe_revision,review});
 const read=()=>db.prepare('SELECT payload_hash,status,result_json FROM meal_baby_guidance WHERE family_id=? AND id=?').bind(familyId,id).first<any>();
 const cached=(row:any)=>{if(row.payload_hash!==hash)throw new BadRequest('確認条件が変わっています。確認事項を表示し直してください。');if(row.status!=='READY')throw new BadRequest('処理中です。同じ操作で確認してください。');return {review,guidance:JSON.parse(row.result_json)};};
 const previous=await read();if(previous)return cached(previous);
 const now=new Date().toISOString(),claim=await db.prepare("INSERT OR IGNORE INTO meal_baby_guidance(family_id,id,payload_hash,status,created_at) SELECT ?,?,?,'RUNNING',? WHERE (SELECT COUNT(*) FROM meal_baby_guidance WHERE family_id=? AND created_at>=?)<10").bind(familyId,id,hash,now,familyId,now.slice(0,10)).run();
 if(!claim.meta.changes){const previous=await read();if(previous)return cached(previous);throw new BadRequest('AIによる整理は家族で1日10回までです。表示された確認事項を確認してください。');}
 let guidance={mode:'RULES',reason:'NOT_CONFIGURED',codes:[] as string[]};
 let phase='CONFIGURATION';
 if(ctx.env.GEMINI_API_KEY&&familyAiProvider(ctx.env)==='GEMINI')try{
  const route=await resolveFeatureModels(ctx.env.DB,familyId,'MEAL_BABY_GUIDANCE',ctx.member!.role);
  const body={systemInstruction:{parts:[{text:'Order up to three supplied baby meal checklist codes to help a caregiver organize pending checks. Select exactly min(3, number of supplied codes) distinct codes. These are checklist types, not medical patient data. Do not infer age, readiness, allergies, ingredients, suitability or safety. Return ONLY JSON {"codes":["code"]}, with no explanation or extra fields. Never approve feeding or remove checklist requirements.'}]},contents:[{role:'user',parts:[{text:JSON.stringify({pending_codes:codes})}]}],generationConfig:{responseMimeType:'application/json',temperature:0,maxOutputTokens:1024,...(route.models[0]==='gemini-3.5-flash'?{thinkingConfig:{thinkingLevel:'MINIMAL'}}:{})}};
  phase='REQUEST';
  const response=await geminiFetch(ctx.env,route.models[0],body,{familyId,feature:'MEAL_BABY_GUIDANCE',trigger:'user',attempt:0});
  phase='RESPONSE';
  guidance.reason=response.status===429?'RATE_LIMIT_OR_BUDGET':response.status===404?'MODEL_UNAVAILABLE':response.status===400?'INVALID_REQUEST':response.status===401||response.status===403?'ACCESS_DENIED':response.status>=500?'UPSTREAM_UNAVAILABLE':'HTTP_ERROR';
  if(response.ok){
   guidance.reason='INVALID_RESPONSE';
   // Bound body consumption independently of the provider token limit.
   const reader=response.body?.getReader();let bytes=0,text='';const decoder=new TextDecoder(),timer=setTimeout(()=>{void reader?.cancel();},10_000);
   try{if(reader)for(;;){const chunk=await reader.read();if(chunk.done)break;bytes+=chunk.value.length;if(bytes>16384)throw new Error();text+=decoder.decode(chunk.value,{stream:true});}text+=decoder.decode();}finally{clearTimeout(timer);await reader?.cancel().catch(()=>{});}
   const data=JSON.parse(text),candidate=data?.candidates?.[0];
   const content=candidate?.content?.parts?.filter((p:any)=>!p.thought&&typeof p.text==='string').map((p:any)=>p.text).join('')||'';
   guidance.reason=candidate?.finishReason==='MAX_TOKENS'?'OUTPUT_LIMIT':data?.promptFeedback?.blockReason?'SAFETY_BLOCK':'INVALID_OUTPUT';
   let parsed:unknown;try{parsed=JSON.parse(content);}catch{parsed=null;}
   const chosen=!data?.promptFeedback?.blockReason&&(!candidate?.finishReason||candidate.finishReason==='STOP')&&content.length<=2048?validateBabyGuidance(parsed,codes):null;
   guidance=chosen?{mode:'AI',reason:'',codes:chosen}:{mode:'RULES',reason:guidance.reason,codes:[]};
  }else await response.body?.cancel().catch(()=>{});
 }catch(e){const timeout=e instanceof Error&&(e.name==='AbortError'||e.name==='TimeoutError');guidance={mode:'RULES',reason:timeout?'TIMEOUT':phase==='REQUEST'?'NETWORK':phase==='CONFIGURATION'?'CONFIGURATION_ERROR':'INVALID_RESPONSE',codes:[]};}
 await db.prepare("UPDATE meal_baby_guidance SET status='READY',result_json=? WHERE family_id=? AND id=? AND payload_hash=? AND status='RUNNING'").bind(JSON.stringify(guidance),familyId,id,hash).run();
 return {review,guidance};
}
