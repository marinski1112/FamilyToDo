import { dailyFortune, type DailyFortune } from './daily-fortune';
import { familyAiProvider, geminiFetch } from './family-ai';
import { loadSafeFamilyAiProfileContext, type FamilyAiSafeProfileContext } from './family-ai-profile-context';
import { FAMILY_LOG_TYPE_META } from './family-log-type-meta';
import { buildLocationDigestDayFacts, type LocationDigestDayFacts } from './location-day-summary';
import { blockMorningDigestAiAfter429, finalizeMorningDigestFrame, readFinalizedMorningDigestFrame, reserveMorningDigestAiRequest } from './line-daily-digest-ai-guard';
import { formatMorningWeather, loadMorningWeatherFact, type MorningWeatherFact } from './line-daily-digest-weather';
import { DEFAULT_FAMILY_TIMEZONE, utcNow } from './timezone';

type Row=Record<string,unknown>;
type ToneLevel='PLAIN'|'FRIENDLY'|'FRIENDLY_LIGHT';
type DigestFactPayload={
  localDate:string;
  previousDate:string;
  today:{events:string[];tasks:string[];bringItems:string[];completed:number;incomplete:number;overdue:number};
  familyLog:{previous:string[];today:string[]};
  location:LocationDigestDayFacts;
  fortune:DailyFortune;
};

type Frame={opener:string;closing:string;personalNote?:string};
const TONE_LEVELS=new Set<ToneLevel>(['PLAIN','FRIENDLY','FRIENDLY_LIGHT']);
const ADDITIVE_LOG_TYPES=new Set(['MILK','BREASTFEED','WATER']);
const EMPTY_LOCATION_FACTS:LocationDigestDayFacts={previous:[],today:[]};
const MAX_MORNING_PROFILE_SUBJECTS=8;
const MAX_MORNING_PROFILE_CONTEXT_CHARS=2400;
const MAX_MORNING_PERSONAL_NOTE_OPTIONS=4;
const MAX_MORNING_DIGEST_CHARS=1000;
export const MORNING_DIGEST_GEMINI_MODEL_PRIMARY_DEFAULT='gemini-3.8-flash';
export const MORNING_DIGEST_GEMINI_MODEL_FALLBACK_DEFAULT='gemini-3.5-flash';
const FRAME_OPTIONS:Record<ToneLevel,Frame[]>={
  PLAIN:[{opener:'朝のまとめです。',closing:'今日の予定を確認しておきましょう。'}],
  FRIENDLY:[
    {opener:'おはようございます。家族の朝まとめです。',closing:'今日もそれぞれのペースでいきましょう。'},
    {opener:'おはようございます。昨日と今日をさっと振り返ります。',closing:'必要なところだけ、さっと確認していきましょう。'},
  ],
  FRIENDLY_LIGHT:[
    {opener:'おはようございます。家族の朝まとめ、さくっとどうぞ。',closing:'今日も無理なく、いい一日にしていきましょう。'},
    {opener:'おはようございます。昨日の記録と今日の予定をひとまとめにしました。',closing:'朝の確認はこれで完了。今日もそれぞれのペースでどうぞ。'},
    {opener:'おはようございます。家族の記録、朝のうちに軽くチェックです。',closing:'ひとまず朝まとめは以上です。今日もぼちぼちいきましょう。'},
  ],
};

const dateBefore=(value:string)=>{const d=new Date(`${value}T00:00:00Z`);d.setUTCDate(d.getUTCDate()-1);return d.toISOString().slice(0,10);};
const localClock=(value:unknown)=>{const m=String(value||'').match(/\b(\d{2}:\d{2})(?::\d{2})?\b/);return m?.[1]||'';};
const clean=(value:unknown,max=80)=>String(value??'').replace(/[\r\n]+/g,' ').trim().slice(0,max);
const toneLevel=(value:unknown):ToneLevel=>TONE_LEVELS.has(String(value) as ToneLevel)?String(value) as ToneLevel:'FRIENDLY_LIGHT';
const modelName=(value:unknown,fallback:string)=>clean(value,120).replace(/^models\//,'')||fallback;
const morningDigestAiEnabled=(env:Env)=>!['0','false','off','disabled'].includes(String(env.MORNING_DIGEST_AI_ENABLED||'1').trim().toLowerCase());
const morningDigestModels=(env:Env)=>{
  const primary=modelName(env.MORNING_DIGEST_GEMINI_MODEL_PRIMARY,MORNING_DIGEST_GEMINI_MODEL_PRIMARY_DEFAULT);
  const fallback=modelName(env.MORNING_DIGEST_GEMINI_MODEL_FALLBACK,MORNING_DIGEST_GEMINI_MODEL_FALLBACK_DEFAULT);
  return primary===fallback?[primary]:[primary,fallback];
};

async function morningDigestRetryKey(familyId:number,memberId:number,localDate:string):Promise<string>{
  const bytes=new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(`familytodo:morning-digest:v1:${familyId}:${memberId}:${localDate}`)));
  bytes[6]=(bytes[6]&0x0f)|0x80;
  bytes[8]=(bytes[8]&0x3f)|0x80;
  const hex=Array.from(bytes.slice(0,16),byte=>byte.toString(16).padStart(2,'0')).join('');
  return `${hex.slice(0,8)}-${hex.slice(8,12)}-${hex.slice(12,16)}-${hex.slice(16,20)}-${hex.slice(20,32)}`;
}

function morningProfilePromptContext(profiles:FamilyAiSafeProfileContext[]):string{
  const minimized=profiles.slice(0,MAX_MORNING_PROFILE_SUBJECTS).map(profile=>({
    subject_ref:profile.subject_ref,
    display_name:profile.display_name,
    subject_kind:profile.subject_kind,
    ...(profile.personality_note?{personality_note:profile.personality_note}:{}),
    ...(profile.birth_facts?{birth_facts:profile.birth_facts}:{}),
    ...(profile.birthplace?{birthplace:profile.birthplace}:{}),
    ...(profile.sex_gender?{sex_gender:profile.sex_gender}:{}),
    ...(profile.blood_type?{blood_type:profile.blood_type}:{}),
  }));
  return Array.from(JSON.stringify(minimized)).slice(0,MAX_MORNING_PROFILE_CONTEXT_CHARS).join('');
}

function morningVariant(localDate:string,offset:number,size:number):number{
  let hash=offset>>>0;
  for(const ch of localDate)hash=((hash*33)^ch.charCodeAt(0))>>>0;
  return size?hash%size:0;
}

function morningPersonalNoteOptions(profiles:FamilyAiSafeProfileContext[],localDate:string):string[]{
  const options:string[]=[];
  const memoProfiles=profiles.filter(profile=>clean(profile.personality_note,72)).slice(0,3);
  if(memoProfiles.length){
    const start=morningVariant(localDate,53,memoProfiles.length);
    for(let offset=0;offset<memoProfiles.length;offset++){
      const profile=memoProfiles[(start+offset)%memoProfiles.length];
      const name=clean(profile.display_name,24),memo=clean(profile.personality_note,72);
      const variants=[
        `家族メモから${name}の「${memo}」をひとつ。今日はこの話をきっかけに、のんびり話せたらよさそうです。`,
        `${name}のメモには「${memo}」。そんな一面を思い出しつつ、今日も家族でゆるくいきましょう。`,
        `今朝は${name}の「${memo}」というメモから。いつもの一日にも、小さな話題がひとつあるといいですね。`,
      ];
      options.push(variants[morningVariant(localDate,71+offset,variants.length)]);
    }
  }
  const names=profiles.map(profile=>clean(profile.display_name,24)).filter(Boolean).slice(0,3);
  if(!options.length)options.push('今日も家族それぞれのペースで、できることからひとつずつ。');
  for(const name of names)options.push(`${name}も家族のみんなも、今日をそれぞれのペースで。`);
  return options.slice(0,MAX_MORNING_PERSONAL_NOTE_OPTIONS);
}

function persistedMorningFrame(raw:string|null,options:Frame[]):Frame|null{
  if(!raw)return null;
  try{
    const value=JSON.parse(raw) as Record<string,unknown>;
    const opener=String(value.opener||''),closing=String(value.closing||'');
    if(!options.some(option=>option.opener===opener)||!options.some(option=>option.closing===closing))return null;
    const personalNote=clean(value.personalNote,120);
    return {opener,closing,...(personalNote?{personalNote}:{})};
  }catch{return null;}
}

async function finalizeFrameSafely(env:Env,familyId:number,localDate:string,frame:Frame):Promise<void>{
  try{await finalizeMorningDigestFrame(env.DB,familyId,localDate,JSON.stringify(frame));}catch{/* Cost guard persistence must not block deterministic LINE delivery. */}
}

async function chooseFrame(env:Env,tone:ToneLevel,familyId:number,localDate:string):Promise<Frame>{
  const options=FRAME_OPTIONS[tone];
  if(tone==='PLAIN')return options[0];
  try{
    const persisted=await readFinalizedMorningDigestFrame(env.DB,familyId,localDate);
    if(persisted){return persistedMorningFrame(persisted,options)||options[0];}
  }catch{/* Missing/unavailable guard storage must not block deterministic personalized fallback. */}
  let profiles:FamilyAiSafeProfileContext[]=[];
  let profileContext='[]';
  try{
    profiles=await loadSafeFamilyAiProfileContext(env.DB,familyId,localDate);
    profileContext=morningProfilePromptContext(profiles);
  }catch{/* Optional personalization context must never block the deterministic morning digest. */}
  const noteOptions=morningPersonalNoteOptions(profiles,localDate);
  const fallbackFrame:Frame={...options[0],personalNote:noteOptions[0]};
  if(familyAiProvider(env)!=='GEMINI'||!env.GEMINI_API_KEY||!morningDigestAiEnabled(env))return fallbackFrame;
  const body={contents:[{role:'user',parts:[{text:`LINE朝まとめの文体と家族向け短文を選びます。返答はJSONだけ。{"opener":0,"closing":0,"note":0} の整数indexだけを返してください。自由文は生成しないでください。\nプロフィール文脈は、管理者がAI利用を明示許可した項目だけをサーバー側で最小化した補助情報です。候補選択の軽い参考にだけ使い、事実・名前・数字・予定・健康状態・妊娠状態・性格診断・能力・属性を新しく推測または文章化しないでください。血液型・性別/ジェンダー・出身地を、性格・健康・能力その他の因果根拠として扱わないでください。プロフィール文脈に無い属性を推測しないでください。決定論的な予定・記録の事実を変更しないでください。noteは必ず提示された候補のindexだけを選び、候補本文を書き換えないでください。\ntone=${tone}; opener候補数=${options.length}; closing候補数=${options.length}; note_candidates=${JSON.stringify(noteOptions)}; profile_context=${profileContext}`}]}],generationConfig:{responseMimeType:'application/json',maxOutputTokens:100}};
  const models=morningDigestModels(env);
  for(let attempt=0;attempt<models.length;attempt++){
    const model=models[attempt];
    let reserved=false;
    try{reserved=await reserveMorningDigestAiRequest(env.DB,familyId,localDate,attempt>0);}catch{return fallbackFrame;}
    if(!reserved){await finalizeFrameSafely(env,familyId,localDate,fallbackFrame);return fallbackFrame;}
    try{
      const response=await geminiFetch(env,model,body);
      if(response.status===429){try{await blockMorningDigestAiAfter429(env.DB,localDate);}catch{/* The current bounded fallback may proceed even if circuit persistence fails. */}}
      if(!response.ok)continue;
      const data=await response.json() as any;
      const text=String(data?.candidates?.[0]?.content?.parts?.[0]?.text||'');
      const parsed=JSON.parse(text),oi=Number(parsed?.opener),ci=Number(parsed?.closing),ni=Number(parsed?.note);
      if(Number.isInteger(oi)&&Number.isInteger(ci)&&options[oi]&&options[ci]){
        const personalNote=Number.isInteger(ni)&&noteOptions[ni]?noteOptions[ni]:noteOptions[0];
        const frame={opener:options[oi].opener,closing:options[ci].closing,personalNote};
        await finalizeFrameSafely(env,familyId,localDate,frame);
        return frame;
      }
    }catch{/* One bounded fallback model attempt follows; deterministic frame remains final fallback. */}
  }
  await finalizeFrameSafely(env,familyId,localDate,fallbackFrame);
  return fallbackFrame;
}

function logFact(row:Row):string{
  const type=String(row.log_type||'').toUpperCase(),meta=FAMILY_LOG_TYPE_META[type]||{icon:'📝',label:type||'記録'};
  const subject=clean(row.subject_name)||clean(row.member_name)||'家族';
  const count=Math.max(0,Number(row.count||0)),amount=Number(row.amount_sum),unit=clean(row.unit,16);
  if(ADDITIVE_LOG_TYPES.has(type)&&Number.isFinite(amount)&&amount>0&&unit)return `${meta.icon} ${subject} ${meta.label} ${amount}${unit}（${count}回）`;
  return `${meta.icon} ${subject} ${meta.label} ${count}回`;
}

async function buildFactPayload(env:Env,familyId:number,memberId:number,localDate:string,location:LocationDigestDayFacts):Promise<DigestFactPayload>{
  const previousDate=dateBefore(localDate);
  const [taskRows,taskCounts,bringItemRows]=await Promise.all([
    env.DB.prepare(`SELECT title,task_kind,status,COALESCE(start_at,due_at) at FROM tasks t
      WHERE family_id=? AND (visibility_scope='FAMILY' OR (visibility_scope='PRIVATE' AND private_owner_id=?))
      AND (date(COALESCE(start_at,due_at))=? OR (upper(COALESCE(task_kind,'TASK'))='TASK' AND lower(COALESCE(status,''))<>'completed' AND date(COALESCE(start_at,due_at))<?))
      ORDER BY CASE WHEN date(COALESCE(start_at,due_at))=? THEN 0 ELSE 1 END,COALESCE(start_at,due_at),id LIMIT 12`)
      .bind(familyId,memberId,localDate,localDate,localDate).all<Row>(),
    env.DB.prepare(`SELECT
        SUM(CASE WHEN upper(COALESCE(task_kind,'TASK'))='TASK' AND date(COALESCE(start_at,due_at))=? AND lower(COALESCE(status,''))='completed' THEN 1 ELSE 0 END) completed,
        SUM(CASE WHEN upper(COALESCE(task_kind,'TASK'))='TASK' AND date(COALESCE(start_at,due_at))=? AND lower(COALESCE(status,''))<>'completed' THEN 1 ELSE 0 END) incomplete,
        SUM(CASE WHEN upper(COALESCE(task_kind,'TASK'))='TASK' AND lower(COALESCE(status,''))<>'completed' AND date(COALESCE(start_at,due_at))<? THEN 1 ELSE 0 END) overdue
      FROM tasks WHERE family_id=? AND (visibility_scope='FAMILY' OR (visibility_scope='PRIVATE' AND private_owner_id=?))`)
      .bind(localDate,localDate,localDate,familyId,memberId).first<Row>(),
    env.DB.prepare(`SELECT i.name,i.status
      FROM items i LEFT JOIN tasks pt ON pt.id=i.task_id AND pt.family_id=i.family_id
      WHERE i.family_id=? AND (i.task_id IS NULL OR (pt.id IS NOT NULL AND (COALESCE(pt.visibility_scope,'FAMILY')='FAMILY' OR (pt.visibility_scope='PRIVATE' AND pt.private_owner_id=?))))
        AND i.due_at IS NOT NULL AND date(i.due_at)=date(?)
      ORDER BY CASE WHEN lower(COALESCE(i.status,''))='completed' THEN 1 ELSE 0 END,i.due_at,i.id LIMIT 8`).bind(familyId,memberId,localDate).all<Row>(),
  ]);
  const todayRows=taskRows.results.filter(x=>String(x.at).slice(0,10)===localDate);
  const eventRows=todayRows.filter(x=>String(x.task_kind).toUpperCase()==='EVENT');
  const taskOnly=todayRows.filter(x=>String(x.task_kind||'TASK').toUpperCase()==='TASK');
  const events=eventRows.slice(0,5).map(x=>`${localClock(x.at)?`${localClock(x.at)} `:''}${clean(x.title)}`.trim());
  const tasks=taskOnly.slice(0,6).map(x=>`${String(x.status).toLowerCase()==='completed'?'✓':'□'} ${clean(x.title)}`);
  const bringItems=bringItemRows.results.map(x=>`${String(x.status).toLowerCase()==='completed'?'✓':'□'} ${clean(x.name)}`).filter(x=>x.length>2);
  const completed=Math.max(0,Number(taskCounts?.completed||0)),incomplete=Math.max(0,Number(taskCounts?.incomplete||0)),overdue=Math.max(0,Number(taskCounts?.overdue||0));

  const logRows=await env.DB.prepare(`SELECT substr(l.occurred_at,1,10) local_date,l.log_type,s.name subject_name,
      CASE WHEN l.subject_id IS NULL THEN m.name ELSE NULL END member_name,l.unit,
      COUNT(*) count,SUM(CASE WHEN l.amount IS NOT NULL THEN l.amount ELSE 0 END) amount_sum
    FROM family_logs l
    LEFT JOIN family_log_subjects s ON s.id=l.subject_id AND s.family_id=l.family_id
    LEFT JOIN line_daily_digest_subject_settings ds ON ds.family_id=l.family_id AND ds.subject_id=l.subject_id
    LEFT JOIN members m ON m.id=l.created_by AND m.family_id=l.family_id
    WHERE l.family_id=? AND l.deleted_at IS NULL AND substr(l.occurred_at,1,10) IN (?,?)
      AND (l.subject_id IS NULL OR (s.active=1 AND COALESCE(ds.enabled,1)=1))
    GROUP BY local_date,l.log_type,l.subject_id,CASE WHEN l.subject_id IS NULL THEN l.created_by ELSE NULL END,l.unit,s.name,
      CASE WHEN l.subject_id IS NULL THEN m.name ELSE NULL END
    ORDER BY local_date,l.subject_id,l.log_type,CASE WHEN l.subject_id IS NULL THEN l.created_by ELSE 0 END LIMIT 40`).bind(familyId,previousDate,localDate).all<Row>();
  const previous=logRows.results.filter(x=>x.local_date===previousDate).slice(0,12).map(logFact);
  const today=logRows.results.filter(x=>x.local_date===localDate).slice(0,8).map(logFact);
  return {localDate,previousDate,today:{events,tasks,bringItems,completed,incomplete,overdue},familyLog:{previous,today},location,fortune:dailyFortune(familyId,memberId,localDate)};
}

function buildDeterministicAdvice(payload:DigestFactPayload):string[]{
  const advice:string[]=[];
  if(payload.today.overdue>0){
    advice.push(`期限切れが${payload.today.overdue}件あります。まず1件だけ優先するものを決めると、今日の整理を始めやすそうです。`);
  }
  const timedEvents=payload.today.events.map(x=>x.match(/^(\d{2}:\d{2})\s+/)?.[1]).filter((x):x is string=>Boolean(x));
  if(payload.today.events.length>=3){
    advice.push(`今日は予定が${payload.today.events.length}件あります。移動や準備に使う時間を少し先に見ておくと安心です。`);
  }else if(timedEvents.length){
    advice.push(`最初の時刻付き予定は${timedEvents[0]}です。必要な持ち物や出発前の準備だけ先に確認しておくとスムーズです。`);
  }else if(payload.today.incomplete>=5){
    advice.push(`今日の未完了タスクは${payload.today.incomplete}件です。全部を一度に片づけず、先に優先度を決めておくのがおすすめです。`);
  }
  return advice.slice(0,2);
}

function buildPreviousFamilyRecap(payload:DigestFactPayload):string[]{
  const logs=payload.familyLog.previous.length;
  const hasLocationRecord=payload.location.previous.length>0;
  if(!logs&&!hasLocationRecord)return [];
  const variants:string[]=[];
  if(logs&&hasLocationRecord){
    variants.push(
      `昨日は家族ログが${logs}項目残り、位置の記録も確認できました。記録が少しずつ積み上がっています。`,
      `昨日の家族記録は${logs}項目。位置の記録もあり、一日の記録がしっかり残っています。`,
    );
  }else if(logs){
    variants.push(
      `昨日は家族ログが${logs}項目残りました。何気ない一日も、こうして記録が積み上がっているのがいいですね。`,
      `昨日の家族記録は${logs}項目。ひとつひとつ残せていて、家族の一日がちゃんと見える形になっています。`,
    );
  }else{
    variants.push(
      '昨日は位置の記録が残りました。記録を続けられていていいですね。',
      '昨日の位置記録も確認できました。記録がひとつ積み上がりました。',
    );
  }
  return [variants[morningVariant(payload.localDate,91,variants.length)]];
}

function buildEvidencePraise(payload:DigestFactPayload):string[]{
  const praise:string[]=[];
  if(payload.familyLog.previous.length){
    const count=payload.familyLog.previous.length;
    const variants=[
      `昨日も家族の記録が${count}項目残っています。日々の積み重ね、ちゃんと続いていていいですね。`,
      `昨日の家族ログは${count}項目。毎日のことをきちんと残せているの、すごくいい積み重ねです。`,
    ];
    praise.push(variants[morningVariant(payload.localDate,11,variants.length)]);
  }
  if(payload.today.completed>0){
    const count=payload.today.completed;
    const variants=[
      `今日のタスク、もう${count}件完了しています。朝から進んでいていいスタートです。`,
      `すでに${count}件チェック済み。ひとつずつ進められていていい感じです。`,
    ];
    praise.push(variants[morningVariant(payload.localDate,23,variants.length)]);
  }
  const checkedItems=payload.today.bringItems.filter(item=>item.startsWith('✓ ')).length;
  if(checkedItems>0){
    const variants=[
      `持ち物も${checkedItems}件チェック済み。準備が進んでいて安心ですね。`,
      `持ち物は${checkedItems}件確認できています。先回りして準備できていていいですね。`,
    ];
    praise.push(variants[morningVariant(payload.localDate,37,variants.length)]);
  }
  if(payload.location.previous.length&&praise.length<3){
    praise.push('昨日の位置記録も残っています。記録を続けられていていいですね。');
  }
  return praise.slice(0,3);
}

function fitMorningDigest(prefix:string[],requiredSuffix:string[]):string{
  const suffixText=requiredSuffix.join('\n');
  const available=Math.max(0,MAX_MORNING_DIGEST_CHARS-suffixText.length-(prefix.length?1:0));
  const kept:string[]=[];
  let used=0;
  for(const line of prefix){
    const needed=(kept.length?1:0)+line.length;
    if(used+needed>available)break;
    kept.push(line);
    used+=needed;
  }
  return [...kept,...requiredSuffix].join('\n').slice(0,MAX_MORNING_DIGEST_CHARS);
}

function renderDeterministicFacts(payload:DigestFactPayload,frame:Frame,weather:MorningWeatherFact|null):string{
  const lines=[`☀️ ${payload.localDate} 朝まとめ`,frame.opener];
  if(weather)lines.push('【今日の天気】',formatMorningWeather(weather));
  if(frame.personalNote)lines.push('【家族のひとこと】',`💬 ${frame.personalNote}`);
  if(payload.familyLog.previous.length){lines.push(`【昨日 ${payload.previousDate}】`,...payload.familyLog.previous);}
  if(payload.familyLog.today.length){lines.push('【今日の記録】',...payload.familyLog.today);}
  if(payload.today.events.length){lines.push('【今日の予定】',...payload.today.events.map(x=>`📌 ${x}`));}
  if(payload.today.tasks.length){lines.push(`【今日のタスク】 完了${payload.today.completed}・未完了${payload.today.incomplete}`,...payload.today.tasks);}
  if(payload.today.bringItems.length){lines.push('【今日の持ち物】',...payload.today.bringItems.map(x=>`🎒 ${x}`));}
  if(payload.today.overdue)lines.push(`⚠️ 期限切れタスク ${payload.today.overdue}件`);
  const advice=buildDeterministicAdvice(payload);
  if(advice.length)lines.push('【今日のヒント】',...advice.map(x=>`💡 ${x}`));
  const recap=buildPreviousFamilyRecap(payload);
  if(recap.length)lines.push('【昨日の家族まとめ】',...recap.map(x=>`✨ ${x}`));
  const praise=buildEvidencePraise(payload);
  if(praise.length)lines.push('【昨日からのいいところ】',...praise.map(x=>`👏 ${x}`));
  if(payload.location.previous.length){lines.push('【昨日の移動】',...payload.location.previous);}
  if(payload.location.today.length){lines.push('【今日の移動】',...payload.location.today);}
  if(lines.length===(frame.personalNote?4:2))lines.push('昨日の記録・今日の予定はありません。');
  const stars='★'.repeat(payload.fortune.stars)+'☆'.repeat(Math.max(0,5-payload.fortune.stars));
  const requiredSuffix=['【お楽しみ占い】',`🔮 ${stars} ${payload.fortune.headline}`,`ラッキーアクション: ${payload.fortune.luckyAction}／カラー: ${payload.fortune.luckyColor}`,frame.closing];
  return fitMorningDigest(lines,requiredSuffix);
}

export async function processLineDailyDigests(env:Env):Promise<void>{
  const settings=await env.DB.prepare("SELECT s.family_id,s.send_time,COALESCE(s.tone_level,'FRIENDLY_LIGHT') tone_level,f.timezone FROM line_daily_digest_settings s JOIN families f ON f.id=s.family_id WHERE s.enabled=1").all<Row>();
  for(const setting of settings.results){
    const timezone=String(setting.timezone||DEFAULT_FAMILY_TIMEZONE),parts=new Intl.DateTimeFormat('en-CA',{timeZone:timezone,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(new Date()),part=(type:string)=>parts.find(x=>x.type===type)?.value||'',localDate=`${part('year')}-${part('month')}-${part('day')}`,localTime=`${part('hour')}:${part('minute')}`,sendTime=String(setting.send_time||'07:00');
    const current=Number(localTime.slice(0,2))*60+Number(localTime.slice(3)),target=Number(sendTime.slice(0,2))*60+Number(sendTime.slice(3));if(current<target||current>target+29)continue;
    const recipients=await env.DB.prepare("SELECT m.id,m.line_user_id FROM line_daily_digest_recipients r JOIN members m ON m.id=r.member_id AND m.family_id=r.family_id WHERE r.family_id=? AND r.enabled=1 AND m.active=1 AND m.deleted_at IS NULL AND m.line_user_id IS NOT NULL").bind(setting.family_id).all<Row>();
    let frame:Frame|undefined;
    let locationFacts:LocationDigestDayFacts|undefined;
    let weatherFact:MorningWeatherFact|null|undefined;
    for(const member of recipients.results){
      const n=utcNow();await env.DB.prepare("INSERT OR IGNORE INTO line_daily_digest_receipts(family_id,member_id,local_date,status,attempt_count,created_at,updated_at) VALUES(?,?,?,'PENDING',0,?,?)").bind(setting.family_id,member.id,localDate,n,n).run();
      const receipt=await env.DB.prepare("SELECT * FROM line_daily_digest_receipts WHERE family_id=? AND member_id=? AND local_date=?").bind(setting.family_id,member.id,localDate).first<Row>();if(!receipt||String(receipt.status)==='SENT'||Number(receipt.attempt_count)>=3)continue;
      try{
        if(weatherFact===undefined)weatherFact=await loadMorningWeatherFact(env.DB,Number(setting.family_id),localDate,timezone);
        if(!locationFacts){
          const requesterMemberId=Number(member.id);
          locationFacts=Number.isSafeInteger(requesterMemberId)&&requesterMemberId>0
            ?await buildLocationDigestDayFacts({
              db:env.DB,
              familyId:Number(setting.family_id),
              requesterMemberId,
              previousDate:dateBefore(localDate),
              localDate,
              timeZone:timezone,
            })
            :EMPTY_LOCATION_FACTS;
        }
        const facts=await buildFactPayload(env,Number(setting.family_id),Number(member.id),localDate,locationFacts);
        frame??=await chooseFrame(env,toneLevel(setting.tone_level),Number(setting.family_id),localDate);
        const message=renderDeterministicFacts(facts,frame,weatherFact);
        const retryKey=await morningDigestRetryKey(Number(setting.family_id),Number(member.id),localDate);
        const {pushLineMessage}=await import('./line');await pushLineMessage(env.LINE_ACCESS_TOKEN,String(member.line_user_id),message,{retryKey});
        await env.DB.prepare("UPDATE line_daily_digest_receipts SET status='SENT',attempt_count=attempt_count+1,sent_at=?,last_error=NULL,updated_at=? WHERE id=?").bind(n,n,receipt.id).run();
      }catch(error){await env.DB.prepare("UPDATE line_daily_digest_receipts SET status='ERROR',attempt_count=attempt_count+1,last_error=?,updated_at=? WHERE id=?").bind(String(error).slice(0,500),n,receipt.id).run();}
    }
  }
}
