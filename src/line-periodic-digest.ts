import { FAMILY_LOG_TYPE_META } from './family-log-type-meta';
import { DEFAULT_FAMILY_TIMEZONE, utcNow } from './timezone';

type Row=Record<string,unknown>;
type DigestKind='WEEKLY'|'MONTHLY';
type Period={kind:DigestKind;periodKey:string;startDate:string;endDate:string;label:string};

type PeriodFacts={
  taskTotal:number;
  taskCompleted:number;
  eventCount:number;
  bringTotal:number;
  bringCompleted:number;
  logTotal:number;
  logHighlights:string[];
  eventHighlights:string[];
};

const MAX_PERIODIC_DIGEST_CHARS=1000;
const WEEKLY_SEND_MINUTE=20*60;
const MONTHLY_SEND_MINUTE=20*60+30;

const clean=(value:unknown,max=80)=>String(value??'').replace(/[\r\n]+/g,' ').trim().slice(0,max);
const addDays=(value:string,days:number)=>{const d=new Date(`${value}T00:00:00Z`);d.setUTCDate(d.getUTCDate()+days);return d.toISOString().slice(0,10);};
const monthEnd=(value:string)=>addDays(value,1).slice(0,7)!==value.slice(0,7);
const weekday=(value:string)=>new Date(`${value}T00:00:00Z`).getUTCDay();
const monthStart=(value:string)=>`${value.slice(0,7)}-01`;

function localDateTime(timeZone:string):{localDate:string;minuteOfDay:number}{
  const parts=new Intl.DateTimeFormat('en-CA',{timeZone,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(new Date());
  const part=(type:string)=>parts.find(x=>x.type===type)?.value||'';
  return {localDate:`${part('year')}-${part('month')}-${part('day')}`,minuteOfDay:Number(part('hour'))*60+Number(part('minute'))};
}

function duePeriods(localDate:string,minuteOfDay:number):Period[]{
  const periods:Period[]=[];
  if(weekday(localDate)===0&&minuteOfDay>=WEEKLY_SEND_MINUTE&&minuteOfDay<=WEEKLY_SEND_MINUTE+29){
    const startDate=addDays(localDate,-6);
    periods.push({kind:'WEEKLY',periodKey:`${startDate}_${localDate}`,startDate,endDate:localDate,label:`${startDate.slice(5).replace('-','/')}〜${localDate.slice(5).replace('-','/')}`});
  }
  if(monthEnd(localDate)&&minuteOfDay>=MONTHLY_SEND_MINUTE&&minuteOfDay<=MONTHLY_SEND_MINUTE+29){
    const startDate=monthStart(localDate);
    periods.push({kind:'MONTHLY',periodKey:localDate.slice(0,7),startDate,endDate:localDate,label:`${Number(localDate.slice(5,7))}月`});
  }
  return periods;
}

async function periodicDigestRetryKey(kind:DigestKind,familyId:number,memberId:number,periodKey:string):Promise<string>{
  const seed=`familytodo:periodic-digest:v1:${kind}:${familyId}:${memberId}:${periodKey}`;
  const bytes=new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(seed)));
  bytes[6]=(bytes[6]&0x0f)|0x80;
  bytes[8]=(bytes[8]&0x3f)|0x80;
  const hex=Array.from(bytes.slice(0,16),byte=>byte.toString(16).padStart(2,'0')).join('');
  return `${hex.slice(0,8)}-${hex.slice(8,12)}-${hex.slice(12,16)}-${hex.slice(16,20)}-${hex.slice(20,32)}`;
}

function logHighlight(row:Row):string{
  const type=String(row.log_type||'').toUpperCase();
  const meta=FAMILY_LOG_TYPE_META[type]||{icon:'📝',label:type||'記録'};
  return `${meta.icon} ${meta.label} ${Math.max(0,Number(row.c||0))}回`;
}

async function loadPeriodFacts(env:Env,familyId:number,memberId:number,period:Period):Promise<PeriodFacts>{
  const [taskStats,bringStats,logRows,eventRows]=await Promise.all([
    env.DB.prepare(`SELECT
      SUM(CASE WHEN upper(COALESCE(task_kind,'TASK'))='TASK' THEN 1 ELSE 0 END) task_total,
      SUM(CASE WHEN upper(COALESCE(task_kind,'TASK'))='TASK' AND lower(COALESCE(status,''))='completed' THEN 1 ELSE 0 END) task_completed,
      SUM(CASE WHEN upper(COALESCE(task_kind,'TASK'))='EVENT' THEN 1 ELSE 0 END) event_count
      FROM tasks
      WHERE family_id=?
        AND (visibility_scope='FAMILY' OR (visibility_scope='PRIVATE' AND private_owner_id=?))
        AND date(COALESCE(start_at,due_at)) BETWEEN date(?) AND date(?)`)
      .bind(familyId,memberId,period.startDate,period.endDate).first<Row>(),
    env.DB.prepare(`SELECT COUNT(*) total,
      SUM(CASE WHEN lower(COALESCE(i.status,''))='completed' THEN 1 ELSE 0 END) completed
      FROM items i
      LEFT JOIN tasks pt ON pt.id=i.task_id AND pt.family_id=i.family_id
      WHERE i.family_id=?
        AND i.due_at IS NOT NULL AND date(i.due_at) BETWEEN date(?) AND date(?)
        AND (i.task_id IS NULL OR (pt.id IS NOT NULL AND (COALESCE(pt.visibility_scope,'FAMILY')='FAMILY' OR (pt.visibility_scope='PRIVATE' AND pt.private_owner_id=?))))`)
      .bind(familyId,period.startDate,period.endDate,memberId).first<Row>(),
    env.DB.prepare(`SELECT l.log_type,COUNT(*) c
      FROM family_logs l
      LEFT JOIN family_log_subjects s ON s.id=l.subject_id AND s.family_id=l.family_id
      LEFT JOIN line_daily_digest_subject_settings ds ON ds.family_id=l.family_id AND ds.subject_id=l.subject_id
      WHERE l.family_id=? AND l.deleted_at IS NULL
        AND substr(l.occurred_at,1,10) BETWEEN ? AND ?
        AND (l.subject_id IS NULL OR (s.active=1 AND COALESCE(ds.enabled,1)=1))
      GROUP BY l.log_type ORDER BY c DESC,l.log_type LIMIT 4`)
      .bind(familyId,period.startDate,period.endDate).all<Row>(),
    env.DB.prepare(`SELECT title,COALESCE(start_at,due_at) at
      FROM tasks
      WHERE family_id=? AND upper(COALESCE(task_kind,'TASK'))='EVENT'
        AND (visibility_scope='FAMILY' OR (visibility_scope='PRIVATE' AND private_owner_id=?))
        AND date(COALESCE(start_at,due_at)) BETWEEN date(?) AND date(?)
      ORDER BY COALESCE(start_at,due_at) DESC,id DESC LIMIT 3`)
      .bind(familyId,memberId,period.startDate,period.endDate).all<Row>(),
  ]);
  const eventHighlights=eventRows.results.map(row=>{
    const date=String(row.at||'').slice(5,10).replace('-','/');
    const title=clean(row.title,56);
    return title?`${date} ${title}`:'';
  }).filter(Boolean);
  return {
    taskTotal:Math.max(0,Number(taskStats?.task_total||0)),
    taskCompleted:Math.max(0,Number(taskStats?.task_completed||0)),
    eventCount:Math.max(0,Number(taskStats?.event_count||0)),
    bringTotal:Math.max(0,Number(bringStats?.total||0)),
    bringCompleted:Math.max(0,Number(bringStats?.completed||0)),
    logTotal:logRows.results.reduce((sum,row)=>sum+Math.max(0,Number(row.c||0)),0),
    logHighlights:logRows.results.map(logHighlight),
    eventHighlights,
  };
}

function praiseLines(kind:DigestKind,facts:PeriodFacts):string[]{
  const unit=kind==='WEEKLY'?'今週':'今月';
  const praise:string[]=[];
  if(facts.taskCompleted>0)praise.push(`${unit}はタスクを${facts.taskCompleted}件完了。ひとつずつ片づけた積み重ね、しっかり成果になっています。`);
  if(facts.bringCompleted>0)praise.push(`持ち物チェックも${facts.bringCompleted}件完了。忘れ物を減らす準備を続けられていていいですね。`);
  if(facts.logTotal>0)praise.push(`家族ログは${facts.logTotal}件。毎日の出来事を残せているのも、家族の大事な積み重ねです。`);
  if(!praise.length&&facts.eventCount>0)praise.push(`${unit}も予定を${facts.eventCount}件こなしました。家族みんな、おつかれさまでした。`);
  if(!praise.length)praise.push(`${unit}も家族みんな、おつかれさまでした。何も詰め込まず休む時間も大切です。`);
  return praise.slice(0,3);
}

function renderPeriodDigest(period:Period,facts:PeriodFacts):string{
  const isWeekly=period.kind==='WEEKLY';
  const lines=[
    `${isWeekly?'🌙':'🗓️'} ${period.label} 家族の${isWeekly?'週':'月'}まとめ`,
    isWeekly?'今週もおつかれさまでした。家族の一週間をさっと振り返ります。':'今月もおつかれさまでした。家族の一か月をまとめます。',
    '【できたこと】',
    `✅ タスク ${facts.taskCompleted}/${facts.taskTotal}件完了`,
    `🎒 持ち物 ${facts.bringCompleted}/${facts.bringTotal}件チェック`,
    `📅 予定 ${facts.eventCount}件`,
    `📝 家族ログ ${facts.logTotal}件`,
  ];
  if(facts.eventHighlights.length)lines.push('【予定の振り返り】',...facts.eventHighlights.map(x=>`・${x}`));
  if(facts.logHighlights.length)lines.push('【記録ハイライト】',...facts.logHighlights);
  lines.push(`【${isWeekly?'今週':'今月'}のいいところ】`,...praiseLines(period.kind,facts).map(x=>`👏 ${x}`));
  lines.push(isWeekly?'来週も全部を完璧にしなくて大丈夫。家族それぞれのペースでいきましょう。':'来月も、できたことをちゃんと数えながら家族それぞれのペースでいきましょう。');
  return lines.join('\n').slice(0,MAX_PERIODIC_DIGEST_CHARS);
}

async function deliverPeriod(env:Env,familyId:number,member:Row,period:Period):Promise<void>{
  const memberId=Number(member.id),lineUserId=String(member.line_user_id||'');
  if(!Number.isSafeInteger(memberId)||memberId<=0||!lineUserId)return;
  const now=utcNow();
  await env.DB.prepare(`INSERT OR IGNORE INTO line_periodic_digest_receipts
    (family_id,member_id,digest_kind,period_key,status,attempt_count,created_at,updated_at)
    VALUES(?,?,?,?,'PENDING',0,?,?)`).bind(familyId,memberId,period.kind,period.periodKey,now,now).run();
  const receipt=await env.DB.prepare(`SELECT id,status,attempt_count FROM line_periodic_digest_receipts
    WHERE family_id=? AND member_id=? AND digest_kind=? AND period_key=?`)
    .bind(familyId,memberId,period.kind,period.periodKey).first<Row>();
  if(!receipt||String(receipt.status)==='SENT'||Number(receipt.attempt_count)>=3)return;
  try{
    const facts=await loadPeriodFacts(env,familyId,memberId,period);
    const message=renderPeriodDigest(period,facts);
    const retryKey=await periodicDigestRetryKey(period.kind,familyId,memberId,period.periodKey);
    const {pushLineMessage}=await import('./line');
    await pushLineMessage(env.LINE_ACCESS_TOKEN,lineUserId,message,{retryKey});
    await env.DB.prepare("UPDATE line_periodic_digest_receipts SET status='SENT',attempt_count=attempt_count+1,sent_at=?,last_error=NULL,updated_at=? WHERE id=?")
      .bind(now,now,receipt.id).run();
  }catch(error){
    await env.DB.prepare("UPDATE line_periodic_digest_receipts SET status='ERROR',attempt_count=attempt_count+1,last_error=?,updated_at=? WHERE id=?")
      .bind(String(error).slice(0,500),now,receipt.id).run();
  }
}

export async function processLinePeriodicDigests(env:Env):Promise<void>{
  const settings=await env.DB.prepare(`SELECT s.family_id,f.timezone
    FROM line_daily_digest_settings s JOIN families f ON f.id=s.family_id
    WHERE s.enabled=1`).all<Row>();
  for(const setting of settings.results){
    const familyId=Number(setting.family_id);
    if(!Number.isSafeInteger(familyId)||familyId<=0)continue;
    const timeZone=String(setting.timezone||DEFAULT_FAMILY_TIMEZONE);
    const {localDate,minuteOfDay}=localDateTime(timeZone);
    const periods=duePeriods(localDate,minuteOfDay);
    if(!periods.length)continue;
    const recipients=await env.DB.prepare(`SELECT m.id,m.line_user_id
      FROM line_daily_digest_recipients r
      JOIN members m ON m.id=r.member_id AND m.family_id=r.family_id
      WHERE r.family_id=? AND r.enabled=1 AND m.active=1 AND m.deleted_at IS NULL AND m.line_user_id IS NOT NULL`)
      .bind(familyId).all<Row>();
    for(const period of periods){
      for(const member of recipients.results)await deliverPeriod(env,familyId,member,period);
    }
  }
}
