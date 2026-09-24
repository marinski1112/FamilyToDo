import { familyAiProvider, geminiFetch, resolveFamilyGeminiModel } from './family-ai';
import { resolveFeatureModels } from './ai-model-routing';
import type { GoogleVoiceInquiryKind, MarkedGoogleVoiceInquiryCommand } from './google-voice-inquiry';

const ALLOWED_KINDS=new Set<GoogleVoiceInquiryKind>(['TODAY_SCHEDULE','TOMORROW_SCHEDULE','OPEN_SHOPPING']);
const CLASSIFIER_FUNCTION='classify_google_voice_inquiry';

function asInquiry(value:unknown):MarkedGoogleVoiceInquiryCommand|null{
  const kind=String(value||'') as GoogleVoiceInquiryKind;
  return ALLOWED_KINDS.has(kind)?{marked:true,type:'INQUIRY',kind,delivery:'MEMBER_WEB_PUSH'}:null;
}

/**
 * Narrow fallback classifier for an already-bounded, explicitly marked command.
 * Deterministic parsing remains authoritative; this helper only maps a missed
 * natural-language inquiry to the same three existing read-only inquiry kinds.
 * Upstream/configuration failures fail closed so other command families can run.
 */
export async function classifyMarkedGoogleVoiceInquiryWithGemini(
  env:Env,
  familyId:number,
  body:string,
):Promise<MarkedGoogleVoiceInquiryCommand|null>{
  if(!body||body.length>256||familyAiProvider(env)!=='GEMINI'||!env.GEMINI_API_KEY)return null;
  try{
    const route=await resolveFeatureModels(env.DB,familyId,'GOOGLE_VOICE_INQUIRY','OWNER');
    const models=route.source==='FAMILY_SETTING'?route.models:[(await resolveFamilyGeminiModel(env.DB,familyId,env)).model];
    const requestBody={
      systemInstruction:{parts:[{text:'Classify this FamilyToDo read-only inquiry. Call the classifier exactly once. TODAY_SCHEDULE means asking about today schedule/tasks; TOMORROW_SCHEDULE means tomorrow schedule/tasks; OPEN_SHOPPING means incomplete shopping/list. If it is not clearly one of these, use NONE. Do not answer the user and do not infer any other action.'}]},
      contents:[{role:'user',parts:[{text:body}]}],
      tools:[{functionDeclarations:[{
        name:CLASSIFIER_FUNCTION,
        description:'Classify one bounded read-only FamilyToDo inquiry.',
        parameters:{type:'OBJECT',properties:{kind:{type:'STRING',enum:['TODAY_SCHEDULE','TOMORROW_SCHEDULE','OPEN_SHOPPING','NONE']}},required:['kind']},
      }]}],
      toolConfig:{functionCallingConfig:{mode:'ANY',allowedFunctionNames:[CLASSIFIER_FUNCTION]}},
      generationConfig:{maxOutputTokens:32},
    };
    let response:Response|undefined;
    for(const model of models){response=await geminiFetch(env,model,requestBody);if(response.ok||response.status!==429&&response.status<500)break;}
    if(!response)return null;
    if(!response.ok)return null;
    const data=await response.json() as any;
    const call=data?.candidates?.[0]?.content?.parts?.find((part:any)=>part?.functionCall)?.functionCall;
    if(call?.name!==CLASSIFIER_FUNCTION)return null;
    return asInquiry(call?.args?.kind);
  }catch{
    return null;
  }
}
