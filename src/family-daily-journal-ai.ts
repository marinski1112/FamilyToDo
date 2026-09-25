import { FAMILY_JOURNAL_GEMINI_MODEL } from './ai-model-policy';
import { geminiFetch, safeGeminiError, geminiFailureCategory } from './family-ai';
import { resolveFeatureModels } from './ai-model-routing';

const MAX_AI_GENERATIONS_PER_RUN=3;
const AI_SUMMARY_MAX_CHARS=320;
type Row=Record<string,unknown>;

type LocationMember={memberId?:number};

const todayJst=()=>new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Tokyo',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
const safeStatus=(value:string)=>value.replace(/[^A-Z0-9_]/g,'').slice(0,48)||'UNKNOWN';
const parseLocationMemberIds=(raw:unknown):number[]=>{
  try{
    const parsed=JSON.parse(String(raw??'[]'));
    if(!Array.isArray(parsed))return [];
    return [...new Set(parsed.map((item:LocationMember)=>Number(item?.memberId)).filter(id=>Number.isSafeInteger(id)&&id>0))].slice(0,100);
  }catch{return [];}
};
const candidateText=(payload:any):string=>String(payload?.candidates?.[0]?.content?.parts?.map((part:any)=>typeof part?.text==='string'?part.text:'').join('')||'').trim();
const normalizeNarrative=(text:string):string|null=>{
  const normalized=text.replace(/```[\s\S]*?```/g,'').replace(/\s+/g,' ').trim();
  if(!normalized||normalized.length>AI_SUMMARY_MAX_CHARS)return null;
  return normalized;
};

function bodyForJournal(date:string,deterministicSummary:string){
  return {
    systemInstruction:{parts:[{text:'あなたは家族向け日誌の編集者です。与えられた事実だけを使い、推測や新しい事実を足さず、日本語で自然な2〜4文の日誌にしてください。家事やタスクがなくても、滞在場所があればそれを中心に書きます。自宅のみなら自宅で過ごした日、職場なら仕事で過ごした日として表現し、職場以外の滞在先も書いてください。家族を評価・診断しないでください。位置情報は入力にある粗い場所表現だけを使い、座標や正確な住所を推測しないでください。出力は日誌本文だけにしてください。'}]},
    contents:[{role:'user',parts:[{text:`日付: ${date}\n確定済みの家族記録: ${deterministicSummary}`}]}],
    generationConfig:{temperature:0.7,maxOutputTokens:220},
  };
}

async function markFailure(db:D1Database,id:number,version:number,status:string,now:string,model=FAMILY_JOURNAL_GEMINI_MODEL):Promise<void>{
  // A failed attempt also consumes this content version. A later factual change
  // increments the version and is the only automatic reason to call Gemini again.
  await db.prepare('UPDATE family_daily_journals SET ai_summary_text=NULL,ai_model=?,ai_status=?,ai_generated_at=?,ai_source_content_version=?,ai_location_member_ids_json=\'[]\' WHERE id=? AND storage_tier=\'HOT\' AND content_version=?')
    .bind(model,safeStatus(status),now,version,id,version).run();
}

export async function generateFamilyDailyJournalAi(env:Env):Promise<void>{
  const rows=await env.DB.prepare(`SELECT id,family_id,journal_date,summary_text,location_json,content_version FROM family_daily_journals WHERE storage_tier='HOT' AND journal_date<? AND (ai_source_content_version IS NULL OR ai_source_content_version<>content_version) ORDER BY journal_date DESC,id DESC LIMIT ?`)
    .bind(todayJst(),MAX_AI_GENERATIONS_PER_RUN).all<Row>();
  if(!rows.results.length)return;
  if(!String(env.GEMINI_API_KEY||'').trim()){
    const now=new Date().toISOString();
    for(const row of rows.results){const id=Number(row.id),version=Number(row.content_version);if(Number.isSafeInteger(id)&&id>0&&Number.isSafeInteger(version)&&version>0)await markFailure(env.DB,id,version,'NOT_CONFIGURED',now);}
    return;
  }
  for(const row of rows.results){
    const id=Number(row.id),version=Number(row.content_version),date=String(row.journal_date||''),summary=String(row.summary_text||'').trim();
    if(!Number.isSafeInteger(id)||id<=0||!Number.isSafeInteger(version)||version<=0||!/^\d{4}-\d{2}-\d{2}$/.test(date)||!summary)continue;
    const now=new Date().toISOString(),locationMemberIds=parseLocationMemberIds(row.location_json);
    const usedModel=(await resolveFeatureModels(env.DB,Number(row.family_id),'FAMILY_DAILY_JOURNAL','OWNER')).models[0]||FAMILY_JOURNAL_GEMINI_MODEL;
    try{
      const response=await geminiFetch(env,usedModel,bodyForJournal(date,summary));
      if(!response.ok){const safe=await safeGeminiError(response);await markFailure(env.DB,id,version,geminiFailureCategory(response.status,safe),now,usedModel);continue;}
      let payload:any;try{payload=await response.json();}catch{await markFailure(env.DB,id,version,'INVALID_RESPONSE',now,usedModel);continue;}
      const narrative=normalizeNarrative(candidateText(payload));
      if(!narrative){await markFailure(env.DB,id,version,'INVALID_OUTPUT',now,usedModel);continue;}
      await env.DB.prepare(`UPDATE family_daily_journals SET ai_summary_text=?,ai_model=?,ai_status='AI_OK',ai_generated_at=?,ai_source_content_version=?,ai_location_member_ids_json=? WHERE id=? AND storage_tier='HOT' AND content_version=?`)
        .bind(narrative,usedModel,now,version,JSON.stringify(locationMemberIds),id,version).run();
    }catch(error:any){
      await markFailure(env.DB,id,version,error?.name==='AbortError'?'PROVIDER_TIMEOUT':'UPSTREAM_UNAVAILABLE',now,usedModel);
    }
  }
}
