import { goodsVisibilitySql } from './goods-visibility';
import { resolveFeatureModels } from './ai-model-routing';
import { recurringForFamilyRange } from './recurrence-projection';
import { safeDigestAttempts, type DigestAttempt, type DigestGeneration } from './line-digest-generation';
import { familyAiProvider, geminiFetch } from './family-ai';
import { blockMorningDigestAiAfter429, finalizeMorningDigestFrame, readFinalizedMorningDigestFrame, reserveMorningDigestAiRequest } from './line-daily-digest-ai-guard';
import { formatMorningWeather, loadMorningWeatherFact, type MorningWeatherFact } from './line-daily-digest-weather';
import { DEFAULT_FAMILY_TIMEZONE, utcNow } from './timezone';

type Row=Record<string,unknown>;
type DigestFactPayload={localDate:string;today:{events:string[];tasks:string[];bringItems:string[];shopping:string[]}};
const MAX_MORNING_DIGEST_CHARS=1000;
export const MORNING_DIGEST_GEMINI_MODEL_PRIMARY_DEFAULT='gemini-3.8-flash';
const localClock=(value:unknown)=>{const m=String(value||'').match(/\b(\d{2}:\d{2})(?::\d{2})?\b/);return m?.[1]||'';};
const clean=(value:unknown,max=80)=>String(value??'').replace(/[\r\n]+/g,' ').trim().slice(0,max);
const modelName=(value:unknown,fallback:string)=>clean(value,120).replace(/^models\//,'')||fallback;
const morningDigestAiEnabled=(env:Env)=>!['0','false','off','disabled'].includes(String(env.MORNING_DIGEST_AI_ENABLED||'1').trim().toLowerCase());
const morningDigestModels=(env:Env)=>[modelName(env.MORNING_DIGEST_GEMINI_MODEL_PRIMARY,MORNING_DIGEST_GEMINI_MODEL_PRIMARY_DEFAULT)];
function safeMorningMessage(message:string):boolean{
  return !!message.trim()&&!/[\u0000-\u001f【】]/u.test(message)
    &&!/https?:\/\/|www\.|\x60\x60\x60|system\s*prompt|システムプロンプト|raw\s*gps|latitude|longitude|緯度|経度|おはよう|今日も|さくっとどうぞ|頑張|がんば|応援|占い|昨日|位置情報/iu.test(message);
}

async function morningDigestRetryKey(familyId:number,lineUserId:string,localDate:string):Promise<string>{
  const bytes=new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(`familytodo:morning-digest:v2:${familyId}:${lineUserId}:${localDate}`)));
  bytes[6]=(bytes[6]&0x0f)|0x80;
  bytes[8]=(bytes[8]&0x3f)|0x80;
  const hex=Array.from(bytes.slice(0,16),byte=>byte.toString(16).padStart(2,'0')).join('');
  return `${hex.slice(0,8)}-${hex.slice(8,12)}-${hex.slice(12,16)}-${hex.slice(16,20)}-${hex.slice(20,32)}`;
}

async function buildFactPayload(env:Env,familyId:number,memberId:number,localDate:string):Promise<DigestFactPayload>{
  // Converted occurrences replace the projected date; inherit the original kind
  // only when the original task is also visible to this report recipient.
  const effectiveKind=`CASE WHEN upper(COALESCE(t.task_kind,'TASK'))='OCCURRENCE' THEN
    (SELECT upper(COALESCE(rt.task_kind,'TASK')) FROM recurrence_occurrences ro
      JOIN recurrence_rules rr ON rr.id=ro.recurrence_rule_id AND rr.family_id=ro.family_id
      JOIN tasks rt ON rt.id=rr.task_id AND rt.family_id=rr.family_id
      WHERE ro.exception_task_id=t.id AND ro.family_id=t.family_id
        AND (COALESCE(rt.visibility_scope,'FAMILY')='FAMILY' OR (rt.visibility_scope='PRIVATE' AND rt.private_owner_id=?)) LIMIT 1)
    ELSE upper(COALESCE(t.task_kind,'TASK')) END`;
  const [taskRows,recurringRows,bringItemRows,shoppingRows]=await Promise.all([
    env.DB.prepare(`SELECT t.title,${effectiveKind} task_kind,t.status,t.all_day,COALESCE(t.start_at,t.due_at) at FROM tasks t
      WHERE t.family_id=? AND (COALESCE(t.visibility_scope,'FAMILY')='FAMILY' OR (t.visibility_scope='PRIVATE' AND t.private_owner_id=?))
      AND ${effectiveKind} IN ('TASK','EVENT')
      AND NOT EXISTS (SELECT 1 FROM recurrence_rules r WHERE r.family_id=t.family_id AND r.task_id=t.id)
      AND (${effectiveKind}='EVENT' OR lower(COALESCE(t.status,''))<>'completed')
      AND ((date(COALESCE(t.start_at,t.due_at))<=date(?) AND date(COALESCE(t.end_at,t.due_at,t.start_at))>=date(?))
        OR (${effectiveKind}='TASK' AND date(COALESCE(t.end_at,t.due_at,t.start_at))<date(?)))
      ORDER BY COALESCE(t.start_at,t.due_at),t.id LIMIT 50`)
      .bind(memberId,familyId,memberId,memberId,memberId,localDate,localDate,memberId,localDate).all<Row>(),
    recurringForFamilyRange(env.DB,familyId,memberId,localDate,localDate),
    env.DB.prepare(`SELECT i.name,i.status
      FROM items i
      WHERE i.family_id=? AND ${goodsVisibilitySql('i')}
        AND i.due_at IS NOT NULL AND date(i.due_at)=date(?)
      ORDER BY CASE WHEN lower(COALESCE(i.status,''))='completed' THEN 1 ELSE 0 END,i.due_at,i.id LIMIT 8`).bind(familyId,memberId,localDate).all<Row>(),
    env.DB.prepare(`SELECT s.name,s.quantity FROM shopping_items s WHERE s.family_id=? AND ${goodsVisibilitySql('s')} AND lower(COALESCE(s.status,'pending'))<>'completed' ORDER BY CASE WHEN s.due_date IS NOT NULL AND date(s.due_date)<=date(?) THEN 0 ELSE 1 END,s.due_date,s.id LIMIT 8`).bind(familyId,memberId,localDate).all<Row>(),
  ]);
  const recurringToday:Row[]=recurringRows.map(x=>({...x,task_kind:String(x.task_kind).toUpperCase()==='EVENT'?'EVENT':'TASK',at:x.start_at||x.due_at}));
  const todayRows=[...taskRows.results,...recurringToday].sort((a,b)=>String(a.at).localeCompare(String(b.at)));
  const eventRows=todayRows.filter(x=>String(x.task_kind).toUpperCase()==='EVENT');
  const taskOnly=todayRows.filter(x=>String(x.task_kind||'TASK').toUpperCase()==='TASK');
  const events=eventRows.slice(0,5).map(x=>`${String(x.at).slice(0,10)<localDate?'継続中 ':Number(x.all_day)!==1&&localClock(x.at)?`${localClock(x.at)} `:''}${clean(x.title)}`.trim());
  const tasks=taskOnly.filter(x=>String(x.status).toLowerCase()!=='completed').slice(0,6).map(x=>`□ ${clean(x.title)}`);
  const bringItems=bringItemRows.results.map(x=>`${String(x.status).toLowerCase()==='completed'?'✓':'□'} ${clean(x.name)}`).filter(x=>x.length>2);
  const shopping=shoppingRows.results.map(x=>`${clean(x.name)}${Number(x.quantity)>1?` ×${Number(x.quantity)}`:''}`).filter(Boolean);
  return {localDate,today:{events,tasks,bringItems,shopping}};
}

// The facts and the AI cache belong to the LINE destination. Sharing one
// family-wide narrative would omit PRIVATE facts or expose them to another
// member. The digest only ever sends a single message for each destination.
function morningFacts(payload:DigestFactPayload,weather:MorningWeatherFact|null){
  return {
    remaining_tasks:payload.today.tasks.filter(task=>task.startsWith('□ ')).map(task=>task.slice(2)),
    remaining_shopping:payload.today.shopping,
    today_bring_items:payload.today.bringItems,
    today_events:payload.today.events,
    home_weather:weather?formatMorningWeather(weather):null,
  };
}

function fallbackMorningMessage(facts:ReturnType<typeof morningFacts>):string{
  const sections=[
    `【残りタスク】 ${facts.remaining_tasks.length?facts.remaining_tasks.join('、'):'なし'}`,
    `【残っている買い物】 ${facts.remaining_shopping.length?facts.remaining_shopping.join('、'):'なし'}`,
    `【今日の持ち物】 ${facts.today_bring_items.length?facts.today_bring_items.join('、'):'なし'}`,
    `【今日のイベント】 ${facts.today_events.length?facts.today_events.join('、'):'なし'}`,
    `【自宅の今日の天気】 ${facts.home_weather||'取得できませんでした'}`,
  ];
  return sections.map(section=>section.slice(0,190)).join('\n');
}

async function morningDestinationKey(localDate:string,lineUserId:string):Promise<string>{
  const bytes=new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(lineUserId)));
  const hash=Array.from(bytes.slice(0,12),byte=>byte.toString(16).padStart(2,'0')).join('');
  return `${localDate}:v4:${hash}`;
}

async function renderMorningMessage(env:Env,familyId:number,localDate:string,lineUserId:string,payload:DigestFactPayload,weather:MorningWeatherFact|null):Promise<string>{
  const facts=morningFacts(payload,weather),fallback=fallbackMorningMessage(facts);
  const key=await morningDestinationKey(localDate,lineUserId);
  let cached:string|null=null;
  try{cached=await readFinalizedMorningDigestFrame(env.DB,familyId,key);}catch{return fallback;}
  if(cached){
    try{
      const row=JSON.parse(cached);
      if(row?.narrativeVersion===4)return fallback;
    }catch{}
    return fallback;
  }
  const finalize=async(message:string|null,generation:DigestGeneration)=>{
    // The cache is family-scoped. Never persist a recipient's PRIVATE text in
    // it; a send retry uses the five-fact fallback without another AI request.
    try{await finalizeMorningDigestFrame(env.DB,familyId,key,JSON.stringify({narrativeVersion:4,message:null,generation}));}catch{/* Delivery remains possible if diagnostic storage is unavailable. */}
    return message||fallback;
  };
  if(familyAiProvider(env)!=='GEMINI'||!env.GEMINI_API_KEY)return finalize(null,{status:'FALLBACK',reason:'NOT_CONFIGURED'});
  if(!morningDigestAiEnabled(env))return finalize(null,{status:'FALLBACK',reason:'DISABLED'});
  let model=MORNING_DIGEST_GEMINI_MODEL_PRIMARY_DEFAULT;
  try{model=(await resolveFeatureModels(env.DB,familyId,'MORNING_DIGEST','OWNER')).models[0]||morningDigestModels(env)[0];}
  catch{return finalize(null,{status:'FALLBACK',reason:'STORAGE'});}
  let reserved=false;
  try{reserved=await reserveMorningDigestAiRequest(env.DB,familyId,key,false,1);}catch{return fallback;}
  if(!reserved)return finalize(null,{status:'FALLBACK',reason:'BUDGET_OR_CIRCUIT'});
  const startedAt=Date.now(),attempt:DigestAttempt={model,httpStatus:null,stage:'PROVIDER_FETCH',reason:'NETWORK_ERROR',durationMs:0};
  let reason='UPSTREAM';
  try{
    const prompt=`家族向けのLINE朝日報を、事務的で自然な短い日本語の文章で書いてください。事実は入力の五種類のみ使用してください。残りタスク、残っている買い物、今日の持ち物、今日のイベント、自宅地点の今日の天気を必要に応じて簡潔につなぎ、入力にない事実や推測を足さないでください。固定挨拶、締め、励まし、占い、昨日の振り返り、位置情報、箇条書き、同じ一覧や件数の重複は禁止します。JSONのみ {"message":"..."} と返してください。messageは${MAX_MORNING_DIGEST_CHARS}文字以内。facts=${JSON.stringify(facts)}`;
    const response=await geminiFetch(env,model,{contents:[{role:'user',parts:[{text:prompt}]}],generationConfig:{responseMimeType:'application/json',maxOutputTokens:1100}});
    attempt.httpStatus=response.status;attempt.stage='PROVIDER_RESPONSE';attempt.reason='HTTP_ERROR';
    if(response.status===429){reason='RATE_LIMIT';attempt.reason='RATE_LIMIT';try{await blockMorningDigestAiAfter429(env.DB,localDate);}catch{}}
    if(response.ok){
      attempt.stage='RESPONSE_PARSE';attempt.reason='RESPONSE_BODY_JSON_INVALID';
      const body=await response.json() as any;
      const text=String(body?.candidates?.[0]?.content?.parts?.[0]?.text||'');
      attempt.stage='OUTPUT_PARSE';attempt.reason=text.trim()?'MODEL_OUTPUT_JSON_INVALID':'CANDIDATE_TEXT_MISSING';
      const parsed=JSON.parse(text),message=typeof parsed?.message==='string'?parsed.message.trim():'';
      attempt.stage='MESSAGE_VALIDATION';attempt.reason='MESSAGE_REJECTED';
      if(message.length<=MAX_MORNING_DIGEST_CHARS&&safeMorningMessage(message)){
        attempt.stage='COMPLETE';attempt.reason='OK';attempt.durationMs=Date.now()-startedAt;
        return finalize(message,{status:'AI',reason:'OK',model,attempts:safeDigestAttempts([attempt])});
      }
      reason='INVALID_OUTPUT';
    }
  }catch(error){reason=error instanceof SyntaxError?'INVALID_OUTPUT':'UPSTREAM';attempt.reason=error instanceof SyntaxError?'MODEL_OUTPUT_JSON_INVALID':error instanceof Error&&error.name==='AbortError'?'PROVIDER_TIMEOUT':attempt.stage==='PROVIDER_FETCH'?'NETWORK_ERROR':'EXCEPTION';}
  attempt.durationMs=Date.now()-startedAt;
  return finalize(null,{status:'FALLBACK',reason,model,attempts:safeDigestAttempts([attempt])});
}

export async function processLineDailyDigests(env:Env):Promise<void>{
  if(!String(env.LINE_ACCESS_TOKEN||'').trim())return;
  const settings=await env.DB.prepare("SELECT s.family_id,s.send_time,COALESCE(s.tone_level,'FRIENDLY_LIGHT') tone_level,f.timezone FROM line_daily_digest_settings s JOIN families f ON f.id=s.family_id WHERE s.enabled=1").all<Row>();
  for(const setting of settings.results){
    const timezone=String(setting.timezone||DEFAULT_FAMILY_TIMEZONE),parts=new Intl.DateTimeFormat('en-CA',{timeZone:timezone,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(new Date()),part=(type:string)=>parts.find(x=>x.type===type)?.value||'',localDate=`${part('year')}-${part('month')}-${part('day')}`,localTime=`${part('hour')}:${part('minute')}`,sendTime=String(setting.send_time||'07:00');
    const current=Number(localTime.slice(0,2))*60+Number(localTime.slice(3)),target=Number(sendTime.slice(0,2))*60+Number(sendTime.slice(3));if(current<target||current>target+29)continue;
    const recipients=await env.DB.prepare("SELECT m.id,m.name,m.line_user_id FROM line_daily_digest_recipients r JOIN members m ON m.id=r.member_id AND m.family_id=r.family_id WHERE r.family_id=? AND r.enabled=1 AND m.active=1 AND m.deleted_at IS NULL AND m.line_user_id IS NOT NULL ORDER BY m.id").bind(setting.family_id).all<Row>();
    const destinations=new Map<string,Row[]>();
    for(const member of recipients.results){const lineUserId=String(member.line_user_id||'');if(!lineUserId)continue;const group=destinations.get(lineUserId)||[];group.push(member);destinations.set(lineUserId,group);}
    let sharedAiFacts:DigestFactPayload|undefined;
    let weatherFact:MorningWeatherFact|null|undefined;
    for(const [lineUserId,members] of destinations){
      const n=utcNow(),receipts:Row[]=[];
      for(const member of members){
        await env.DB.prepare("INSERT OR IGNORE INTO line_daily_digest_receipts(family_id,member_id,local_date,status,attempt_count,created_at,updated_at) VALUES(?,?,?,'PENDING',0,?,?)").bind(setting.family_id,member.id,localDate,n,n).run();
        const receipt=await env.DB.prepare("SELECT id,status,attempt_count FROM line_daily_digest_receipts WHERE family_id=? AND member_id=? AND local_date=?").bind(setting.family_id,member.id,localDate).first<Row>();if(receipt)receipts.push(receipt);
      }
      if(receipts.some(receipt=>String(receipt.status)==='SENT')){
        for(const receipt of receipts.filter(receipt=>String(receipt.status)!=='SENT'))await env.DB.prepare("UPDATE line_daily_digest_receipts SET status='SENT',last_error=NULL,updated_at=? WHERE id=?").bind(n,receipt.id).run();
        continue;
      }
      const pending=receipts.filter(receipt=>Number(receipt.attempt_count)<3);if(!pending.length)continue;
      try{
        if(weatherFact===undefined)weatherFact=await loadMorningWeatherFact(env.DB,Number(setting.family_id),localDate,timezone);
        let facts:DigestFactPayload;
        if(members.length===1){
          const requesterMemberId=Number(members[0].id);
          facts=await buildFactPayload(env,Number(setting.family_id),requesterMemberId,localDate);
        }else{
          if(!sharedAiFacts)sharedAiFacts=await buildFactPayload(env,Number(setting.family_id),0,localDate);
          facts=sharedAiFacts;
        }
        const message=await renderMorningMessage(env,Number(setting.family_id),localDate,lineUserId,facts,weatherFact);
        const retryKey=await morningDigestRetryKey(Number(setting.family_id),lineUserId,localDate);
        const {pushLineMessage}=await import('./line');await pushLineMessage(env.LINE_ACCESS_TOKEN,lineUserId,message,{retryKey});
        for(const receipt of pending)await env.DB.prepare("UPDATE line_daily_digest_receipts SET status='SENT',attempt_count=attempt_count+1,sent_at=?,last_error=NULL,updated_at=? WHERE id=?").bind(n,n,receipt.id).run();
      }catch(error){for(const receipt of pending)await env.DB.prepare("UPDATE line_daily_digest_receipts SET status='ERROR',attempt_count=attempt_count+1,last_error=?,updated_at=? WHERE id=?").bind(String(error).slice(0,500),n,receipt.id).run();}
    }
  }
}
