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

type Frame={opener:string;closing:string;personalNote?:string;narrativeVersion?:3};
type StoredMorningRecap={recap:string|null;narrativeVersion:3};
const TONE_LEVELS=new Set<ToneLevel>(['PLAIN','FRIENDLY','FRIENDLY_LIGHT']);
const ADDITIVE_LOG_TYPES=new Set(['MILK','BREASTFEED','WATER']);
const EMPTY_LOCATION_FACTS:LocationDigestDayFacts={previous:[],today:[]};
const MAX_MORNING_PROFILE_SUBJECTS=8;
const MAX_MORNING_PROFILE_CONTEXT_CHARS=2400;
const MAX_MORNING_NARRATIVE_CHARS=320;
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

async function morningDigestRetryKey(familyId:number,lineUserId:string,localDate:string):Promise<string>{
  const bytes=new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(`familytodo:morning-digest:v2:${familyId}:${lineUserId}:${localDate}`)));
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

function deterministicPersonalNote(profiles:FamilyAiSafeProfileContext[],localDate:string):string{
  const focusProfiles=profiles.filter(profile=>clean(profile.personality_note,72)).slice(0,3);
  const focusName=focusProfiles.length?clean(focusProfiles[morningVariant(localDate,53,focusProfiles.length)]?.display_name,24):'';
  const who=focusName||'家族みんな';
  const variants=[
    `${who}の昨日の積み重ねを味方に、今日もひとつずついきましょう。`,
    `昨日できたことはちゃんと今日につながっています。${who}も無理なくいいスタートを。`,
    `今朝は昨日の頑張りをひとつ思い出してから。${who}にとって気持ちのいい一日になりますように。`,
  ];
  return variants[morningVariant(localDate,71,variants.length)];
}

const normalizedForLeakCheck=(value:unknown)=>Array.from(String(value??'').normalize('NFKC').toLowerCase()).filter(ch=>!/\s|[、。,.!！?？「」『』()（）\[\]{}:：;；/\\_-]/u.test(ch)).join('');
function profileLeakFragments(profiles:FamilyAiSafeProfileContext[]):string[]{
  const fragments=new Set<string>();
  const add=(value:unknown)=>{
    const normalized=normalizedForLeakCheck(value);
    if(!normalized)return;
    const chars=Array.from(normalized);
    if(chars.length<=8){if(chars.length>=2)fragments.add(normalized);return;}
    fragments.add(normalized);
    for(let i=0;i<=chars.length-8;i++)fragments.add(chars.slice(i,i+8).join(''));
  };
  for(const profile of profiles){
    add(profile.personality_note);
    add(profile.birthplace);
    add(profile.sex_gender);
    if(profile.birth_facts?.zodiac)add(profile.birth_facts.zodiac);
    if(profile.blood_type){add(`血液型${profile.blood_type}`);add(`${profile.blood_type}型`);}
  }
  return [...fragments];
}

function generatedRecapPassesSafety(recap:string,profiles:FamilyAiSafeProfileContext[]):boolean{
  const combined=recap.trim();
  if(!combined||/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/u.test(combined))return false;
  if(/https?:\/\/|www\.|```|personality_note|system\s*prompt|システムプロンプト|プロフィール(?:文脈|情報)|メモには|raw\s*gps|latitude|longitude|緯度|経度/iu.test(combined))return false;
  if(/[0-9０-９〇零一二三四五六七八九十百千万億兆]/u.test(combined))return false;
  const normalized=normalizedForLeakCheck(combined);
  if(profileLeakFragments(profiles).some(fragment=>normalized.includes(fragment)))return false;
  return true;
}

function persistedMorningFrame(raw:string|null,fallbackFrame:Frame,profiles:FamilyAiSafeProfileContext[]):Frame|null{
  if(!raw)return null;
  try{
    const value=JSON.parse(raw) as Record<string,unknown>;
    if(Number(value.narrativeVersion)!==3)return null;
    if(value.recap===null)return fallbackFrame;
    const recap=clean(value.recap,MAX_MORNING_NARRATIVE_CHARS);
    if(!recap||!generatedRecapPassesSafety(recap,profiles))return null;
    return {...fallbackFrame,personalNote:recap,narrativeVersion:3};
  }catch{return null;}
}

async function finalizeRecapSafely(env:Env,familyId:number,localDate:string,recap:string|null):Promise<void>{
  const stored:StoredMorningRecap={recap,narrativeVersion:3};
  try{await finalizeMorningDigestFrame(env.DB,familyId,localDate,JSON.stringify(stored));}catch{/* Cost guard persistence must not block deterministic LINE delivery. */}
}

function morningNarrativeEvidence(payload:DigestFactPayload,weather:MorningWeatherFact|null):string{
  return JSON.stringify({
    previous_date:payload.previousDate,
    local_date:payload.localDate,
    yesterday_family_log:payload.familyLog.previous.slice(0,12),
    today_family_log:payload.familyLog.today.slice(0,8),
    today_events:payload.today.events.slice(0,5),
    today_tasks:payload.today.tasks.slice(0,6),
    today_bring_items:payload.today.bringItems.slice(0,8),
    today_counts:{completed:payload.today.completed,incomplete:payload.today.incomplete,overdue:payload.today.overdue},
    ...(weather?{today_weather:formatMorningWeather(weather)}:{}),
  });
}

async function chooseFrame(env:Env,tone:ToneLevel,familyId:number,localDate:string,sharedFacts:DigestFactPayload,weather:MorningWeatherFact|null):Promise<Frame>{
  const options=FRAME_OPTIONS[tone];
  let profiles:FamilyAiSafeProfileContext[]=[];
  let profileContext='[]';
  try{
    profiles=await loadSafeFamilyAiProfileContext(env.DB,familyId,localDate);
    profileContext=morningProfilePromptContext(profiles);
  }catch{/* Optional personalization context must never block the deterministic morning digest. */}
  const fallbackBase=options[morningVariant(localDate,17,options.length)]||options[0];
  const fallbackFrame:Frame={...fallbackBase,personalNote:deterministicPersonalNote(profiles,localDate),narrativeVersion:3};
  if(tone==='PLAIN')return fallbackFrame;
  const evidence=morningNarrativeEvidence(sharedFacts,weather);
  try{
    const persisted=await readFinalizedMorningDigestFrame(env.DB,familyId,localDate);
    if(persisted){return persistedMorningFrame(persisted,fallbackFrame,profiles)||fallbackFrame;}
  }catch{/* Missing/unavailable guard storage must not block deterministic personalized fallback. */}
  if(familyAiProvider(env)!=='GEMINI'||!env.GEMINI_API_KEY||!morningDigestAiEnabled(env))return fallbackFrame;
  const body={contents:[{role:'user',parts:[{text:`あなたは家族向けLINEの朝便を書く編集者です。昨日の家族の様子と今日の予定を読み、朝いちに少し元気が出る自然な短い統括を作ってください。文章全体をひとつの自由な統括として書き、定型文の穴埋めではなく、毎日言い回し・着眼点・リズムが変わって構いません。返答はJSONだけで {"recap":"..."}。recapは${MAX_MORNING_NARRATIVE_CHARS}文字以内、2〜5文程度で、昨日できたことを具体的に認め、今日の予定・天気・タスク等から役立つ一言へ自然につないでください。冒頭あいさつと締めの定型文はサーバー側で付けるため、recapには不要です。箇条書きの単なる再掲や「メモには〜」という説明は避けてください。プロフィール文脈は、管理者がAI利用を明示許可した項目だけを最小化した補助情報です。personality_noteは好み・関心・生活背景を理解して話題や言葉選びを自然にする判断材料として使えますが、原文を引用・羅列せず、プロフィールを読んだことも明かさないでください。血液型・性別/ジェンダー・出身地・年齢・星座を本文へ直接書かず、性格・健康・能力の因果根拠にも使わないでください。健康状態、妊娠、能力、性格などを根拠なく推測しないでください。事実はevidenceにある内容だけを使い、無い出来事・感情・成果を作らないでください。PRIVATEタスク、raw GPS、座標はevidenceに入っていないため推測しないでください。後段に正確な一覧が付くので、全項目を繰り返さず重要な話題を自然につないでください。正確な数字・件数・時刻・日付は後段の一覧が担当するため、recapには算用数字・漢数字を含む数値表現を書かないでください。tone=${tone}; local_date=${localDate}; variation_seed=${morningVariant(localDate,97,1009)}; profile_context=${profileContext}; evidence=${evidence}`}]}],generationConfig:{responseMimeType:'application/json',maxOutputTokens:360}};
  const models=morningDigestModels(env);
  for(let attempt=0;attempt<models.length;attempt++){
    const model=models[attempt];
    let reserved=false;
    try{reserved=await reserveMorningDigestAiRequest(env.DB,familyId,localDate,attempt>0);}catch{return fallbackFrame;}
    if(!reserved){await finalizeRecapSafely(env,familyId,localDate,null);return fallbackFrame;}
    try{
      const response=await geminiFetch(env,model,body);
      if(response.status===429){try{await blockMorningDigestAiAfter429(env.DB,localDate);}catch{/* The current bounded fallback may proceed even if circuit persistence fails. */}}
      if(!response.ok)continue;
      const data=await response.json() as any;
      const text=String(data?.candidates?.[0]?.content?.parts?.[0]?.text||'');
      const parsed=JSON.parse(text),recap=clean(parsed?.recap,MAX_MORNING_NARRATIVE_CHARS);
      if(recap&&generatedRecapPassesSafety(recap,profiles)){
        const frame:Frame={...fallbackBase,personalNote:recap,narrativeVersion:3};
        await finalizeRecapSafely(env,familyId,localDate,recap);
        return frame;
      }
    }catch{/* One bounded fallback model attempt follows; deterministic frame remains final fallback. */}
  }
  await finalizeRecapSafely(env,familyId,localDate,null);
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
  if(!praise.length&&payload.location.previous.length){
    praise.push('昨日の移動記録も残っています。家族みんな、一日おつかれさまでした。');
  }
  return praise.slice(0,2);
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
  const authoritative=[`☀️ ${payload.localDate} 朝まとめ`,frame.opener];
  if(weather)authoritative.push('【今日の天気】',formatMorningWeather(weather));
  const praise=buildEvidencePraise(payload);
  if(praise.length)authoritative.push('【昨日からのいいところ】',...praise.map(x=>`👏 ${x}`));
  if(payload.familyLog.previous.length){authoritative.push(`【昨日 ${payload.previousDate}】`,...payload.familyLog.previous);}
  if(payload.familyLog.today.length){authoritative.push('【今日の記録】',...payload.familyLog.today);}
  if(payload.today.events.length){authoritative.push('【今日の予定】',...payload.today.events.map(x=>`📌 ${x}`));}
  if(payload.today.tasks.length){authoritative.push(`【今日のタスク】 完了${payload.today.completed}・未完了${payload.today.incomplete}`,...payload.today.tasks);}
  if(payload.today.bringItems.length){authoritative.push('【今日の持ち物】',...payload.today.bringItems.map(x=>`🎒 ${x}`));}
  if(payload.today.overdue)authoritative.push(`⚠️ 期限切れタスク ${payload.today.overdue}件`);
  const advice=buildDeterministicAdvice(payload);
  if(advice.length)authoritative.push('【今日のヒント】',...advice.map(x=>`💡 ${x}`));
  if(payload.location.previous.length){authoritative.push('【昨日の移動】',...payload.location.previous);}
  if(payload.location.today.length){authoritative.push('【今日の移動】',...payload.location.today);}
  if(authoritative.length===2)authoritative.push('昨日の記録・今日の予定はありません。');
  const stars='★'.repeat(payload.fortune.stars)+'☆'.repeat(Math.max(0,5-payload.fortune.stars));
  const requiredSuffix=['【お楽しみ占い】',`🔮 ${stars} ${payload.fortune.headline}`,`ラッキーアクション: ${payload.fortune.luckyAction}／カラー: ${payload.fortune.luckyColor}`,frame.closing];
  const authoritativeText=fitMorningDigest(authoritative,requiredSuffix);
  if(!frame.personalNote)return authoritativeText;
  const fullAuthoritativeLength=[...authoritative,...requiredSuffix].join('\n').length;
  const available=Math.max(0,MAX_MORNING_DIGEST_CHARS-fullAuthoritativeLength-1);
  if(available<8)return authoritativeText;
  const narrative=`💬 ${frame.personalNote}`.slice(0,available);
  return fitMorningDigest([authoritative[0],authoritative[1],narrative,...authoritative.slice(2)],requiredSuffix);
}

export async function processLineDailyDigests(env:Env):Promise<void>{
  const settings=await env.DB.prepare("SELECT s.family_id,s.send_time,COALESCE(s.tone_level,'FRIENDLY_LIGHT') tone_level,f.timezone FROM line_daily_digest_settings s JOIN families f ON f.id=s.family_id WHERE s.enabled=1").all<Row>();
  for(const setting of settings.results){
    const timezone=String(setting.timezone||DEFAULT_FAMILY_TIMEZONE),parts=new Intl.DateTimeFormat('en-CA',{timeZone:timezone,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(new Date()),part=(type:string)=>parts.find(x=>x.type===type)?.value||'',localDate=`${part('year')}-${part('month')}-${part('day')}`,localTime=`${part('hour')}:${part('minute')}`,sendTime=String(setting.send_time||'07:00');
    const current=Number(localTime.slice(0,2))*60+Number(localTime.slice(3)),target=Number(sendTime.slice(0,2))*60+Number(sendTime.slice(3));if(current<target||current>target+29)continue;
    const recipients=await env.DB.prepare("SELECT m.id,m.line_user_id FROM line_daily_digest_recipients r JOIN members m ON m.id=r.member_id AND m.family_id=r.family_id WHERE r.family_id=? AND r.enabled=1 AND m.active=1 AND m.deleted_at IS NULL AND m.line_user_id IS NOT NULL ORDER BY m.id").bind(setting.family_id).all<Row>();
    const destinations=new Map<string,Row[]>();
    for(const member of recipients.results){const lineUserId=String(member.line_user_id||'');if(!lineUserId)continue;const group=destinations.get(lineUserId)||[];group.push(member);destinations.set(lineUserId,group);}
    let frame:Frame|undefined;
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
        if(!sharedAiFacts)sharedAiFacts=await buildFactPayload(env,Number(setting.family_id),0,localDate,EMPTY_LOCATION_FACTS);
        frame??=await chooseFrame(env,toneLevel(setting.tone_level),Number(setting.family_id),localDate,sharedAiFacts,weatherFact);
        let facts:DigestFactPayload;
        if(members.length===1){
          const requesterMemberId=Number(members[0].id);
          const locationFacts=Number.isSafeInteger(requesterMemberId)&&requesterMemberId>0
            ?await buildLocationDigestDayFacts({db:env.DB,familyId:Number(setting.family_id),requesterMemberId,previousDate:dateBefore(localDate),localDate,timeZone:timezone})
            :EMPTY_LOCATION_FACTS;
          facts=await buildFactPayload(env,Number(setting.family_id),requesterMemberId,localDate,locationFacts);
        }else{
          facts=sharedAiFacts;
        }
        const message=renderDeterministicFacts(facts,frame,weatherFact);
        const retryKey=await morningDigestRetryKey(Number(setting.family_id),lineUserId,localDate);
        const {pushLineMessage}=await import('./line');await pushLineMessage(env.LINE_ACCESS_TOKEN,lineUserId,message,{retryKey});
        for(const receipt of pending)await env.DB.prepare("UPDATE line_daily_digest_receipts SET status='SENT',attempt_count=attempt_count+1,sent_at=?,last_error=NULL,updated_at=? WHERE id=?").bind(n,n,receipt.id).run();
      }catch(error){for(const receipt of pending)await env.DB.prepare("UPDATE line_daily_digest_receipts SET status='ERROR',attempt_count=attempt_count+1,last_error=?,updated_at=? WHERE id=?").bind(String(error).slice(0,500),n,receipt.id).run();}
    }
  }
}