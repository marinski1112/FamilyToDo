import { familyAiProvider, geminiFetch } from './family-ai';
import { loadSafeFamilyAiProfileContext, type FamilyAiSafeProfileContext } from './family-ai-profile-context';
import { FAMILY_LOG_TYPE_META } from './family-log-type-meta';
import { blockPeriodicDigestAiAfter429, finalizePeriodicDigestFrame, readFinalizedPeriodicDigestFrame, reservePeriodicDigestAiRequest } from './line-periodic-digest-ai-guard';
import { DEFAULT_FAMILY_TIMEZONE, utcNow } from './timezone';

type Row=Record<string,unknown>;
type ReportType='WEEKLY'|'MONTHLY';
type Period={reportType:ReportType;periodKey:string;startDate:string;endDate:string;label:string};
type PeriodFacts={period:Period;logLines:string[];eventCount:number;taskCompleted:number;taskIncomplete:number;itemCompleted:number;itemIncomplete:number;samples:string[]};
type PeriodFrame={version:1;narrative:string};

const MAX_LINE_CHARS=1000;
const MAX_NARRATIVE_CHARS=360;
const MAX_PROFILE_CONTEXT_CHARS=2200;
const MODEL_PRIMARY_DEFAULT='gemini-3.8-flash';
const MODEL_FALLBACK_DEFAULT='gemini-3.5-flash';
const clean=(value:unknown,max=100)=>String(value??'').replace(/[\r\n]+/g,' ').trim().slice(0,max);
const modelName=(value:unknown,fallback:string)=>clean(value,120).replace(/^models\//,'')||fallback;
const aiEnabled=(env:Env)=>!['0','false','off','disabled'].includes(String(env.MORNING_DIGEST_AI_ENABLED||'1').trim().toLowerCase());
const models=(env:Env)=>{const a=modelName(env.MORNING_DIGEST_GEMINI_MODEL_PRIMARY,MODEL_PRIMARY_DEFAULT),b=modelName(env.MORNING_DIGEST_GEMINI_MODEL_FALLBACK,MODEL_FALLBACK_DEFAULT);return a===b?[a]:[a,b];};

const shiftDate=(date:string,days:number)=>{const d=new Date(`${date}T00:00:00Z`);d.setUTCDate(d.getUTCDate()+days);return d.toISOString().slice(0,10);};
const weekday=(date:string)=>new Date(`${date}T00:00:00Z`).getUTCDay();
const minutes=(clock:string)=>Number(clock.slice(0,2))*60+Number(clock.slice(3,5));
const isLastDayOfMonth=(date:string)=>shiftDate(date,1).slice(0,7)!==date.slice(0,7);
const monthLabel=(date:string)=>`${Number(date.slice(5,7))}月`;

function weeklyPeriod(endDate:string):Period{return {reportType:'WEEKLY',periodKey:`W:${endDate}`,startDate:shiftDate(endDate,-6),endDate,label:`${shiftDate(endDate,-6)}〜${endDate}`};}
function monthlyPeriod(endDate:string):Period{const startDate=`${endDate.slice(0,7)}-01`;return {reportType:'MONTHLY',periodKey:`M:${endDate.slice(0,7)}`,startDate,endDate,label:`${startDate}〜${endDate}`};}

function duePeriods(localDate:string,localTime:string,setting:Row):Period[]{
  const now=minutes(localTime),out:Period[]=[];
  const weeklyTarget=minutes(String(setting.weekly_send_time||'20:30'));
  const monthlyTarget=minutes(String(setting.monthly_send_time||'20:45'));
  if(Number(setting.weekly_enabled??1)===1){
    if(weekday(localDate)===0&&now>=weeklyTarget)out.push(weeklyPeriod(localDate));
    else if(weekday(localDate)===1&&now<360)out.push(weeklyPeriod(shiftDate(localDate,-1)));
  }
  if(Number(setting.monthly_enabled??1)===1){
    if(isLastDayOfMonth(localDate)&&now>=monthlyTarget)out.push(monthlyPeriod(localDate));
    else if(localDate.endsWith('-01')&&now<360)out.push(monthlyPeriod(shiftDate(localDate,-1)));
  }
  return out;
}

function safeProfileContext(profiles:FamilyAiSafeProfileContext[]):string{
  const minimal=profiles.slice(0,8).map(profile=>({subject_ref:profile.subject_ref,display_name:profile.display_name,subject_kind:profile.subject_kind,...(profile.personality_note?{personality_note:profile.personality_note}:{})}));
  return Array.from(JSON.stringify(minimal)).slice(0,MAX_PROFILE_CONTEXT_CHARS).join('');
}
const normalized=(value:unknown)=>Array.from(String(value??'').normalize('NFKC').toLowerCase()).filter(ch=>!/\s|[、。,.!！?？「」『』()（）\[\]{}:：;；/\\_-]/u.test(ch)).join('');
function hiddenMemoFragments(profiles:FamilyAiSafeProfileContext[]):string[]{
  const result=new Set<string>();
  for(const profile of profiles){const v=normalized(profile.personality_note);if(!v)continue;const chars=Array.from(v);if(chars.length<=8){if(chars.length>=2)result.add(v);}else{result.add(v);for(let i=0;i<=chars.length-8;i++)result.add(chars.slice(i,i+8).join(''));}}
  return [...result];
}
function safeGeneratedNarrative(value:string,profiles:FamilyAiSafeProfileContext[]):boolean{
  if(!value||/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/u.test(value))return false;
  if(/https?:\/\/|www\.|```|personality_note|system\s*prompt|システムプロンプト|プロフィール(?:文脈|情報)|メモには|raw\s*gps|latitude|longitude|緯度|経度/iu.test(value))return false;
  if(/[0-9０-９〇零一二三四五六七八九十百千万億兆]/u.test(value))return false;
  const n=normalized(value);return !hiddenMemoFragments(profiles).some(fragment=>n.includes(fragment));
}

function aggregateLogLine(row:Row):string{
  const type=String(row.log_type||'').toUpperCase(),meta=FAMILY_LOG_TYPE_META[type]||{icon:'📝',label:type||'記録'};
  const subject=clean(row.subject_name)||clean(row.member_name)||'家族';
  const count=Math.max(0,Number(row.count||0)),amount=Number(row.amount_sum),unit=clean(row.unit,16);
  if(new Set(['MILK','BREASTFEED','WATER']).has(type)&&Number.isFinite(amount)&&amount>0&&unit)return `${meta.icon} ${subject} ${meta.label} ${amount}${unit}（${count}回）`;
  return `${meta.icon} ${subject} ${meta.label} ${count}回`;
}

async function loadPeriodFacts(db:D1Database,familyId:number,period:Period):Promise<PeriodFacts>{
  const [counts,samples,logs,items]=await Promise.all([
    db.prepare(`SELECT
      SUM(CASE WHEN upper(COALESCE(task_kind,'TASK'))='EVENT' THEN 1 ELSE 0 END) event_count,
      SUM(CASE WHEN upper(COALESCE(task_kind,'TASK'))='TASK' AND lower(COALESCE(status,''))='completed' THEN 1 ELSE 0 END) task_completed,
      SUM(CASE WHEN upper(COALESCE(task_kind,'TASK'))='TASK' AND lower(COALESCE(status,''))<>'completed' THEN 1 ELSE 0 END) task_incomplete
      FROM tasks WHERE family_id=? AND COALESCE(visibility_scope,'FAMILY')='FAMILY' AND date(COALESCE(start_at,due_at)) BETWEEN ? AND ?`).bind(familyId,period.startDate,period.endDate).first<Row>(),
    db.prepare(`SELECT title,task_kind FROM tasks WHERE family_id=? AND COALESCE(visibility_scope,'FAMILY')='FAMILY' AND date(COALESCE(start_at,due_at)) BETWEEN ? AND ? ORDER BY COALESCE(start_at,due_at),id LIMIT 6`).bind(familyId,period.startDate,period.endDate).all<Row>(),
    db.prepare(`SELECT l.log_type,s.name subject_name,CASE WHEN l.subject_id IS NULL THEN m.name ELSE NULL END member_name,l.unit,COUNT(*) count,SUM(CASE WHEN l.amount IS NOT NULL THEN l.amount ELSE 0 END) amount_sum
      FROM family_logs l
      LEFT JOIN family_log_subjects s ON s.id=l.subject_id AND s.family_id=l.family_id
      LEFT JOIN line_daily_digest_subject_settings ds ON ds.family_id=l.family_id AND ds.subject_id=l.subject_id
      LEFT JOIN members m ON m.id=l.created_by AND m.family_id=l.family_id
      WHERE l.family_id=? AND l.deleted_at IS NULL AND substr(l.occurred_at,1,10) BETWEEN ? AND ?
        AND (l.subject_id IS NULL OR (s.active=1 AND COALESCE(ds.enabled,1)=1))
      GROUP BY l.log_type,l.subject_id,CASE WHEN l.subject_id IS NULL THEN l.created_by ELSE NULL END,l.unit,s.name,CASE WHEN l.subject_id IS NULL THEN m.name ELSE NULL END
      ORDER BY l.subject_id,l.log_type LIMIT 24`).bind(familyId,period.startDate,period.endDate).all<Row>(),
    db.prepare(`SELECT SUM(CASE WHEN lower(COALESCE(i.status,''))='completed' THEN 1 ELSE 0 END) completed,SUM(CASE WHEN lower(COALESCE(i.status,''))<>'completed' THEN 1 ELSE 0 END) incomplete
      FROM items i LEFT JOIN tasks pt ON pt.id=i.task_id AND pt.family_id=i.family_id
      WHERE i.family_id=? AND i.due_at IS NOT NULL AND date(i.due_at) BETWEEN ? AND ? AND (i.task_id IS NULL OR (pt.id IS NOT NULL AND COALESCE(pt.visibility_scope,'FAMILY')='FAMILY'))`).bind(familyId,period.startDate,period.endDate).first<Row>(),
  ]);
  return {period,logLines:logs.results.map(aggregateLogLine).slice(0,12),eventCount:Math.max(0,Number(counts?.event_count||0)),taskCompleted:Math.max(0,Number(counts?.task_completed||0)),taskIncomplete:Math.max(0,Number(counts?.task_incomplete||0)),itemCompleted:Math.max(0,Number(items?.completed||0)),itemIncomplete:Math.max(0,Number(items?.incomplete||0)),samples:samples.results.map(row=>`${String(row.task_kind).toUpperCase()==='EVENT'?'📌':'✓'} ${clean(row.title,60)}`).filter(x=>x.length>2)};
}

function fallbackNarrative(facts:PeriodFacts):string{
  if(facts.logLines.length&&facts.taskCompleted>0)return facts.period.reportType==='WEEKLY'?'今週も、家族の記録とやることの積み重ねが残っています。できたことを振り返りながら、来週も無理なく進めていきましょう。':'今月も、家族の記録とできたことが積み重なりました。ひと月分の歩みをねぎらって、次の月もそれぞれのペースでいきましょう。';
  if(facts.logLines.length)return '家族の日々の記録がこの期間にも残っています。何気ない毎日の積み重ねを大切にしつつ、次の期間も無理なくいきましょう。';
  return 'この期間は記録が少なめでした。忙しい日も含めて一区切り。次の期間も、できることからゆっくり進めていきましょう。';
}

function evidence(facts:PeriodFacts):string{return JSON.stringify({report_type:facts.period.reportType,period_start:facts.period.startDate,period_end:facts.period.endDate,family_log:facts.logLines,event_count:facts.eventCount,period_tasks_currently_completed:facts.taskCompleted,period_tasks_currently_incomplete:facts.taskIncomplete,period_items_currently_completed:facts.itemCompleted,period_items_currently_incomplete:facts.itemIncomplete,samples:facts.samples});}

async function chooseNarrative(env:Env,familyId:number,facts:PeriodFacts):Promise<string>{
  let profiles:FamilyAiSafeProfileContext[]=[];
  try{profiles=await loadSafeFamilyAiProfileContext(env.DB,familyId,facts.period.endDate);}catch{/* Optional context never blocks fallback. */}
  const fallback=fallbackNarrative(facts);
  try{const stored=await readFinalizedPeriodicDigestFrame(env.DB,familyId,facts.period.reportType,facts.period.periodKey);if(stored){const parsed=JSON.parse(stored) as PeriodFrame;if(parsed.version===1&&safeGeneratedNarrative(clean(parsed.narrative,MAX_NARRATIVE_CHARS),profiles))return clean(parsed.narrative,MAX_NARRATIVE_CHARS);return fallback;}}catch{/* fallback */}
  if(familyAiProvider(env)!=='GEMINI'||!env.GEMINI_API_KEY||!aiEnabled(env))return fallback;
  const prompt=`あなたは家族向けLINEの${facts.period.reportType==='WEEKLY'?'週末':'月末'}便を書く編集者です。期間中の事実を読み、家族みんなが少しうれしくなる自然な統括を作ってください。毎回、構成・着眼点・言い回しは変わって構いません。記録から確認できる積み重ねを具体的に認め、次の期間へやさしくつないでください。返答はJSONだけで {"narrative":"..."}。narrativeは${MAX_NARRATIVE_CHARS}文字以内、三〜五文程度。事実はevidenceだけを根拠にし、出来事・感情・成果を捏造しないでください。期間内タスク・持ち物の完了数は完了日時の集計ではなく、その期間に予定・期限がある項目の現在状態です。「この期間に完了した」と言い換えないでください。プロフィール文脈はAI利用が許可された最小情報で、personality_noteは話題や言葉選びの背景としてのみ使えます。原文を引用・要約・列挙せず、プロフィールやメモを読んだことも明かさないでください。健康・性格・能力などを推測しないでください。PRIVATEタスク、raw GPS、座標、位置履歴は渡していないため推測しないでください。正確な数字・件数・日付は後段の決定論的一覧が担当するので、本文には算用数字・漢数字を含む数値表現を書かないでください。profile_context=${safeProfileContext(profiles)}; evidence=${evidence(facts)}`;
  const body={contents:[{role:'user',parts:[{text:prompt}]}],generationConfig:{responseMimeType:'application/json',maxOutputTokens:420}};
  for(let attempt=0;attempt<models(env).length;attempt++){
    let reserved=false;try{reserved=await reservePeriodicDigestAiRequest(env.DB,familyId,facts.period.reportType,facts.period.periodKey,attempt>0);}catch{return fallback;}
    if(!reserved){try{await finalizePeriodicDigestFrame(env.DB,familyId,facts.period.reportType,facts.period.periodKey,JSON.stringify({version:1,narrative:fallback}));}catch{}return fallback;}
    try{
      const response=await geminiFetch(env,models(env)[attempt],body);
      if(response.status===429){try{await blockPeriodicDigestAiAfter429(env.DB);}catch{}}
      if(!response.ok)continue;
      const data=await response.json() as any,text=String(data?.candidates?.[0]?.content?.parts?.[0]?.text||''),parsed=JSON.parse(text),narrative=clean(parsed?.narrative,MAX_NARRATIVE_CHARS);
      if(!safeGeneratedNarrative(narrative,profiles))continue;
      await finalizePeriodicDigestFrame(env.DB,familyId,facts.period.reportType,facts.period.periodKey,JSON.stringify({version:1,narrative}));return narrative;
    }catch{/* bounded fallback model attempt */}
  }
  try{await finalizePeriodicDigestFrame(env.DB,familyId,facts.period.reportType,facts.period.periodKey,JSON.stringify({version:1,narrative:fallback}));}catch{}
  return fallback;
}

function renderReport(facts:PeriodFacts,narrative:string):string{
  const title=facts.period.reportType==='WEEKLY'?'🌙 1週間まとめ':`🌙 ${monthLabel(facts.period.endDate)}まとめ`;
  const required=[title,facts.period.label,`【予定・タスク】 イベント${facts.eventCount}件／タスク 現在完了${facts.taskCompleted}・未完了${facts.taskIncomplete}`,`【持ち物】 現在完了${facts.itemCompleted}・未完了${facts.itemIncomplete}`,facts.period.reportType==='WEEKLY'?'今週もおつかれさまでした。':'今月もおつかれさまでした。'];
  const extras:string[]=[];
  if(facts.logLines.length)extras.push('【家族の記録】',...facts.logLines);
  if(facts.samples.length)extras.push('【期間の予定・タスク】',...facts.samples);
  let includedExtras=extras;
  let authoritative=[...required.slice(0,2),...includedExtras,...required.slice(2)];
  if(authoritative.join('\n').length>MAX_LINE_CHARS){includedExtras=[];authoritative=[...required];}
  const authoritativeText=authoritative.join('\n');
  const available=MAX_LINE_CHARS-authoritativeText.length-1;
  if(available<16)return authoritativeText;
  return [...required.slice(0,2),`💬 ${narrative}`.slice(0,available),...includedExtras,...required.slice(2)].join('\n');
}

async function retryKey(familyId:number,memberId:number,period:Period):Promise<string>{
  const bytes=new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(`familytodo:periodic-digest:v1:${period.reportType}:${period.periodKey}:${familyId}:${memberId}`)));
  bytes[6]=(bytes[6]&0x0f)|0x80;bytes[8]=(bytes[8]&0x3f)|0x80;const hex=Array.from(bytes.slice(0,16),b=>b.toString(16).padStart(2,'0')).join('');return `${hex.slice(0,8)}-${hex.slice(8,12)}-${hex.slice(12,16)}-${hex.slice(16,20)}-${hex.slice(20,32)}`;
}

export async function processLinePeriodicDigests(env:Env):Promise<void>{
  const settings=await env.DB.prepare("SELECT s.*,f.timezone FROM line_daily_digest_settings s JOIN families f ON f.id=s.family_id WHERE s.enabled=1").all<Row>();
  for(const setting of settings.results){
    const timezone=String(setting.timezone||DEFAULT_FAMILY_TIMEZONE),parts=new Intl.DateTimeFormat('en-CA',{timeZone:timezone,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(new Date()),part=(type:string)=>parts.find(x=>x.type===type)?.value||'',localDate=`${part('year')}-${part('month')}-${part('day')}`,localTime=`${part('hour')}:${part('minute')}`;
    for(const period of duePeriods(localDate,localTime,setting)){
      const recipients=await env.DB.prepare("SELECT m.id,m.line_user_id FROM line_daily_digest_recipients r JOIN members m ON m.id=r.member_id AND m.family_id=r.family_id WHERE r.family_id=? AND r.enabled=1 AND m.active=1 AND m.deleted_at IS NULL AND m.line_user_id IS NOT NULL").bind(setting.family_id).all<Row>();
      if(!recipients.results.length)continue;
      const facts=await loadPeriodFacts(env.DB,Number(setting.family_id),period),narrative=await chooseNarrative(env,Number(setting.family_id),facts),message=renderReport(facts,narrative);
      for(const member of recipients.results){
        const now=utcNow();
        await env.DB.prepare("INSERT OR IGNORE INTO line_periodic_digest_receipts(family_id,member_id,report_type,period_key,status,attempt_count,created_at,updated_at) VALUES(?,?,?,?,'PENDING',0,?,?)").bind(setting.family_id,member.id,period.reportType,period.periodKey,now,now).run();
        const receipt=await env.DB.prepare('SELECT id,status,attempt_count FROM line_periodic_digest_receipts WHERE family_id=? AND member_id=? AND report_type=? AND period_key=?').bind(setting.family_id,member.id,period.reportType,period.periodKey).first<Row>();
        if(!receipt||String(receipt.status)==='SENT'||Number(receipt.attempt_count)>=3)continue;
        try{const {pushLineMessage}=await import('./line');await pushLineMessage(env.LINE_ACCESS_TOKEN,String(member.line_user_id),message,{retryKey:await retryKey(Number(setting.family_id),Number(member.id),period)});await env.DB.prepare("UPDATE line_periodic_digest_receipts SET status='SENT',attempt_count=attempt_count+1,sent_at=?,last_error=NULL,updated_at=? WHERE id=?").bind(now,now,receipt.id).run();}
        catch(error){await env.DB.prepare("UPDATE line_periodic_digest_receipts SET status='ERROR',attempt_count=attempt_count+1,last_error=?,updated_at=? WHERE id=?").bind(String(error).slice(0,500),now,receipt.id).run();}
      }
    }
  }
}
