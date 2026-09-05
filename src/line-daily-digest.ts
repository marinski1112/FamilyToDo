import { familyAiProvider, geminiFetch, resolveFamilyGeminiModel } from './family-ai';
import { FAMILY_LOG_TYPE_META } from './family-log-type-meta';
import { buildLocationDigestDayFacts, type LocationDigestDayFacts } from './location-day-summary';
import { DEFAULT_FAMILY_TIMEZONE, utcNow } from './timezone';

type Row=Record<string,unknown>;
type ToneLevel='PLAIN'|'FRIENDLY'|'FRIENDLY_LIGHT';
type DigestFactPayload={
  localDate:string;
  previousDate:string;
  today:{events:string[];tasks:string[];completed:number;incomplete:number;overdue:number};
  familyLog:{previous:string[];today:string[]};
  location:LocationDigestDayFacts;
};

type Frame={opener:string;closing:string};
const TONE_LEVELS=new Set<ToneLevel>(['PLAIN','FRIENDLY','FRIENDLY_LIGHT']);
const ADDITIVE_LOG_TYPES=new Set(['MILK','BREASTFEED','WATER']);
const EMPTY_LOCATION_FACTS:LocationDigestDayFacts={previous:[],today:[]};
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

async function chooseFrame(env:Env,familyId:number,tone:ToneLevel):Promise<Frame>{
  const options=FRAME_OPTIONS[tone];
  if(tone==='PLAIN'||familyAiProvider(env)!=='GEMINI'||!env.GEMINI_API_KEY)return options[0];
  try{
    const {model}=await resolveFamilyGeminiModel(env.DB,familyId,env);
    const response=await geminiFetch(env,model,{contents:[{role:'user',parts:[{text:`LINE朝まとめの文体を選びます。返答はJSONだけ。{"opener":0,"closing":0} の整数indexだけを返してください。事実・名前・数字・予定・健康状態・天気を新しく文章化しないでください。tone=${tone}; opener候補数=${options.length}; closing候補数=${options.length}`}]}],generationConfig:{temperature:0.4,responseMimeType:'application/json'}});
    if(!response.ok)return options[0];
    const data=await response.json() as any;
    const text=String(data?.candidates?.[0]?.content?.parts?.[0]?.text||'');
    const parsed=JSON.parse(text),oi=Number(parsed?.opener),ci=Number(parsed?.closing);
    if(!Number.isInteger(oi)||!Number.isInteger(ci)||!options[oi]||!options[ci])return options[0];
    return {opener:options[oi].opener,closing:options[ci].closing};
  }catch{return options[0];}
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
  const [taskRows,taskCounts]=await Promise.all([
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
  ]);
  const todayRows=taskRows.results.filter(x=>String(x.at).slice(0,10)===localDate);
  const eventRows=todayRows.filter(x=>String(x.task_kind).toUpperCase()==='EVENT');
  const taskOnly=todayRows.filter(x=>String(x.task_kind||'TASK').toUpperCase()==='TASK');
  const events=eventRows.slice(0,5).map(x=>`${localClock(x.at)?`${localClock(x.at)} `:''}${clean(x.title)}`.trim());
  const tasks=taskOnly.slice(0,6).map(x=>`${String(x.status).toLowerCase()==='completed'?'✓':'□'} ${clean(x.title)}`);
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
  return {localDate,previousDate,today:{events,tasks,completed,incomplete,overdue},familyLog:{previous,today},location};
}

function renderDeterministicFacts(payload:DigestFactPayload,frame:Frame):string{
  const lines=[`☀️ ${payload.localDate} 朝まとめ`,frame.opener];
  if(payload.familyLog.previous.length){lines.push(`【昨日 ${payload.previousDate}】`,...payload.familyLog.previous);}
  if(payload.location.previous.length){lines.push('【昨日の移動】',...payload.location.previous);}
  if(payload.familyLog.today.length){lines.push('【今日の記録】',...payload.familyLog.today);}
  if(payload.location.today.length){lines.push('【今日の移動】',...payload.location.today);}
  if(payload.today.events.length){lines.push('【今日の予定】',...payload.today.events.map(x=>`📌 ${x}`));}
  if(payload.today.tasks.length){lines.push(`【今日のタスク】 完了${payload.today.completed}・未完了${payload.today.incomplete}`,...payload.today.tasks);}
  if(payload.today.overdue)lines.push(`⚠️ 期限切れタスク ${payload.today.overdue}件`);
  if(lines.length===2)lines.push('昨日の記録・今日の予定はありません。');
  lines.push(frame.closing);
  return lines.join('\n').slice(0,1000);
}

export async function processLineDailyDigests(env:Env):Promise<void>{
  const settings=await env.DB.prepare("SELECT s.family_id,s.send_time,COALESCE(s.tone_level,'FRIENDLY_LIGHT') tone_level,f.timezone FROM line_daily_digest_settings s JOIN families f ON f.id=s.family_id WHERE s.enabled=1").all<Row>();
  for(const setting of settings.results){
    const timezone=String(setting.timezone||DEFAULT_FAMILY_TIMEZONE),parts=new Intl.DateTimeFormat('en-CA',{timeZone:timezone,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(new Date()),part=(type:string)=>parts.find(x=>x.type===type)?.value||'',localDate=`${part('year')}-${part('month')}-${part('day')}`,localTime=`${part('hour')}:${part('minute')}`,sendTime=String(setting.send_time||'07:00');
    const current=Number(localTime.slice(0,2))*60+Number(localTime.slice(3)),target=Number(sendTime.slice(0,2))*60+Number(sendTime.slice(3));if(current<target||current>target+29)continue;
    const recipients=await env.DB.prepare("SELECT m.id,m.line_user_id FROM line_daily_digest_recipients r JOIN members m ON m.id=r.member_id AND m.family_id=r.family_id WHERE r.family_id=? AND r.enabled=1 AND m.active=1 AND m.deleted_at IS NULL AND m.line_user_id IS NOT NULL").bind(setting.family_id).all<Row>();
    let frame:Frame|undefined;
    let locationFacts:LocationDigestDayFacts=EMPTY_LOCATION_FACTS;
    const firstRequester=Number(recipients.results[0]?.id||0);
    if(Number.isSafeInteger(firstRequester)&&firstRequester>0){
      locationFacts=await buildLocationDigestDayFacts({
        db:env.DB,
        familyId:Number(setting.family_id),
        requesterMemberId:firstRequester,
        previousDate:dateBefore(localDate),
        localDate,
        timeZone:timezone,
      });
    }
    for(const member of recipients.results){
      const n=utcNow();await env.DB.prepare("INSERT OR IGNORE INTO line_daily_digest_receipts(family_id,member_id,local_date,status,attempt_count,created_at,updated_at) VALUES(?,?,?,'PENDING',0,?,?)").bind(setting.family_id,member.id,localDate,n,n).run();
      const receipt=await env.DB.prepare("SELECT * FROM line_daily_digest_receipts WHERE family_id=? AND member_id=? AND local_date=?").bind(setting.family_id,member.id,localDate).first<Row>();if(!receipt||String(receipt.status)==='SENT'||Number(receipt.attempt_count)>=3)continue;
      try{
        const facts=await buildFactPayload(env,Number(setting.family_id),Number(member.id),localDate,locationFacts);
        frame??=await chooseFrame(env,Number(setting.family_id),toneLevel(setting.tone_level));
        const message=renderDeterministicFacts(facts,frame);
        const {pushLineMessage}=await import('./line');await pushLineMessage(env.LINE_ACCESS_TOKEN,String(member.line_user_id),message);
        await env.DB.prepare("UPDATE line_daily_digest_receipts SET status='SENT',attempt_count=attempt_count+1,sent_at=?,last_error=NULL,updated_at=? WHERE id=?").bind(n,n,receipt.id).run();
      }catch(error){await env.DB.prepare("UPDATE line_daily_digest_receipts SET status='ERROR',attempt_count=attempt_count+1,last_error=?,updated_at=? WHERE id=?").bind(String(error).slice(0,500),n,receipt.id).run();}
    }
  }
}
