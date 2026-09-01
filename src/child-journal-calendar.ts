import { CALENDAR_MAX_RETRIES, calendarRetryAt, calendarRetryDue, decryptRefreshToken } from './google-calendar-core';
import { DEFAULT_FAMILY_TIMEZONE, utcNow } from './timezone';

type Row = Record<string, unknown>;
const PROVIDER='GOOGLE_CALENDAR';
const JOURNAL_CALENDAR_NAME='Family TODO - 成長日記';
const now=()=>utcNow();

class GoogleError extends Error {
  constructor(public status:number){super(`Google Calendar HTTP ${status}`);}
}

async function googleApi(path:string,access:string,init?:RequestInit){
  const response=await fetch(`https://www.googleapis.com/calendar/v3${path}`,{
    ...init,
    headers:{authorization:`Bearer ${access}`,'content-type':'application/json',...(init?.headers||{})},
  });
  if(!response.ok)throw new GoogleError(response.status);
  return response.status===204?{}:response.json();
}

async function accessToken(env:Env,account:Row){
  const refresh=await decryptRefreshToken(String(account.refresh_token_ciphertext),env.GOOGLE_CALENDAR_TOKEN_KEY!);
  const response=await fetch('https://oauth2.googleapis.com/token',{
    method:'POST',
    headers:{'content-type':'application/x-www-form-urlencoded'},
    body:new URLSearchParams({
      client_id:env.GOOGLE_CALENDAR_CLIENT_ID!,
      client_secret:env.GOOGLE_CALENDAR_CLIENT_SECRET!,
      refresh_token:refresh,
      grant_type:'refresh_token',
    }),
  });
  if(!response.ok){
    const body=await response.text();
    if(response.status===400&&body.includes('invalid_grant'))throw new Error('REAUTH_REQUIRED');
    throw new Error('token refresh failed');
  }
  return String((await response.json() as {access_token?:string}).access_token||'');
}

function plusDay(date:string){const d=new Date(`${date}T00:00:00Z`);d.setUTCDate(d.getUTCDate()+1);return d.toISOString().slice(0,10);}
function journalLabel(row:Row){
  const milestone=String(row.milestone_code||'');
  if(milestone==='STAND')return '立った';
  if(milestone==='FIRST_STEP')return '歩いた';
  if(milestone==='FIRST_TOOTH')return '最初の歯';
  if(milestone==='TOOTH')return '歯';
  if(String(row.log_type)==='HEIGHT')return `身長 ${Number(row.amount)}${String(row.unit||'cm')}`;
  if(String(row.log_type)==='WEIGHT')return `体重 ${Number(row.amount)}${String(row.unit||'kg')}`;
  return String(row.value_text||row.note||'成長メモ');
}

export function childJournalCalendarEvent(row:Row){
  const date=String(row.occurred_at||'').slice(0,10);
  const label=journalLabel(row);
  const note=String(row.note||'').trim();
  const valueText=String(row.value_text||'').trim();
  const description=note&&note!==valueText?note:'';
  return {
    summary:`📔 ${String(row.subject_name||'子ども')}：${label}`,
    description,
    extendedProperties:{private:{familyTodoChildJournalLogId:String(row.log_id)}},
    start:{date},
    end:{date:plusDay(date)},
  };
}

async function ensureJournalCalendar(env:Env,account:Row,token:string){
  const existing=await env.DB.prepare('SELECT * FROM child_journal_calendar_accounts WHERE family_id=? LIMIT 1').bind(account.family_id).first<Row>();
  if(existing?.calendar_id)return existing;
  const created=await googleApi('/calendars',token,{method:'POST',body:JSON.stringify({summary:JOURNAL_CALENDAR_NAME,timeZone:String(account.timezone||DEFAULT_FAMILY_TIMEZONE)})}) as any;
  const calendarId=String(created.id||'');
  if(!calendarId)throw new Error('journal calendar create failed');
  const n=now();
  await env.DB.prepare(`INSERT INTO child_journal_calendar_accounts(family_id,calendar_id,calendar_name,status,last_error,created_at,updated_at)
    VALUES(?,?,?,'ACTIVE',NULL,?,?)
    ON CONFLICT(family_id) DO UPDATE SET calendar_id=excluded.calendar_id,calendar_name=excluded.calendar_name,status='ACTIVE',last_error=NULL,updated_at=excluded.updated_at`)
    .bind(account.family_id,calendarId,JOURNAL_CALENDAR_NAME,n,n).run();
  return {family_id:account.family_id,calendar_id:calendarId,calendar_name:JOURNAL_CALENDAR_NAME,status:'ACTIVE'} as Row;
}

async function markDone(env:Env,outboxId:number,familyId:number){
  const n=now();
  await env.DB.batch([
    env.DB.prepare("UPDATE child_journal_calendar_outbox SET status='DONE',last_error=NULL,updated_at=? WHERE id=? AND family_id=?").bind(n,outboxId,familyId),
    env.DB.prepare("UPDATE child_journal_calendar_accounts SET status='ACTIVE',last_error=NULL,last_synced_at=?,updated_at=? WHERE family_id=?").bind(n,n,familyId),
  ]);
}

export async function processChildJournalCalendarOutbox(env:Env,limit=10,familyId?:number){
  const result={sent:0,errors:0};
  if(!env.GOOGLE_CALENDAR_CLIENT_ID||!env.GOOGLE_CALENDAR_CLIENT_SECRET||!env.GOOGLE_CALENDAR_TOKEN_KEY)return result;
  const familyFilter=familyId?' AND o.family_id=?':'';
  const rows=await env.DB.prepare(`SELECT o.*,a.refresh_token_ciphertext,f.timezone
    FROM child_journal_calendar_outbox o
    JOIN external_calendar_accounts a ON a.family_id=o.family_id AND a.provider=? AND a.status='ACTIVE'
    JOIN families f ON f.id=o.family_id
    WHERE o.status IN ('PENDING','ERROR') AND o.retry_count<${CALENDAR_MAX_RETRIES}${familyFilter}
    ORDER BY o.id LIMIT ?`)
    .bind(...(familyId?[PROVIDER,familyId,limit*4]:[PROVIDER,limit*4])).all<Row>();

  for(const outbox of rows.results.filter(row=>calendarRetryDue(row.status,row.retry_count,row.next_retry_at)).slice(0,limit)){
    const family=Number(outbox.family_id),logId=Number(outbox.log_id),outboxId=Number(outbox.id);
    try{
      const [journal,link]=await Promise.all([
        env.DB.prepare(`SELECT j.log_id,j.journal_kind,j.entry_kind,j.milestone_code,j.google_sync_enabled,
          l.log_type,l.occurred_at,l.amount,l.unit,l.value_text,l.note,l.deleted_at,s.name subject_name
          FROM family_log_journal_entries j
          JOIN family_logs l ON l.id=j.log_id AND l.family_id=j.family_id
          JOIN family_log_subjects s ON s.id=j.subject_id AND s.family_id=j.family_id
          WHERE j.log_id=? AND j.family_id=? LIMIT 1`).bind(logId,family).first<Row>(),
        env.DB.prepare('SELECT * FROM child_journal_calendar_links WHERE log_id=? AND family_id=? AND deleted_at IS NULL LIMIT 1').bind(logId,family).first<Row>(),
      ]);
      const effectiveDelete=String(outbox.operation)==='DELETE'||!journal||String(journal.journal_kind)!=='CHILD'||Number(journal.google_sync_enabled)!==1||Boolean(journal.deleted_at);
      if(effectiveDelete&&!link){await markDone(env,outboxId,family);result.sent++;continue;}

      const token=await accessToken(env,outbox);
      if(effectiveDelete){
        try{await googleApi(`/calendars/${encodeURIComponent(String(link!.calendar_id))}/events/${encodeURIComponent(String(link!.external_event_id))}`,token,{method:'DELETE'});}catch(error){if(!(error instanceof GoogleError&&(error.status===404||error.status===410)))throw error;}
        const n=now();
        await env.DB.prepare('UPDATE child_journal_calendar_links SET deleted_at=?,updated_at=? WHERE log_id=? AND family_id=? AND deleted_at IS NULL').bind(n,n,logId,family).run();
        await markDone(env,outboxId,family);result.sent++;continue;
      }

      const calendar=await ensureJournalCalendar(env,outbox,token);
      const calendarId=String(calendar.calendar_id);
      let event:any;
      if(link&&String(link.calendar_id)===calendarId){
        try{
          event=await googleApi(`/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(String(link.external_event_id))}`,token,{method:'PUT',body:JSON.stringify(childJournalCalendarEvent(journal!))});
        }catch(error){
          if(!(error instanceof GoogleError&&(error.status===404||error.status===410)))throw error;
          event=await googleApi(`/calendars/${encodeURIComponent(calendarId)}/events`,token,{method:'POST',body:JSON.stringify(childJournalCalendarEvent(journal!))});
        }
      }else{
        event=await googleApi(`/calendars/${encodeURIComponent(calendarId)}/events`,token,{method:'POST',body:JSON.stringify(childJournalCalendarEvent(journal!))});
      }
      const eventId=String(event.id||'');if(!eventId)throw new Error('journal event create failed');
      const n=now();
      await env.DB.prepare(`INSERT INTO child_journal_calendar_links(log_id,family_id,calendar_id,external_event_id,external_etag,last_synced_at,deleted_at,created_at,updated_at)
        VALUES(?,?,?,?,?,?,NULL,?,?)
        ON CONFLICT(log_id) DO UPDATE SET family_id=excluded.family_id,calendar_id=excluded.calendar_id,external_event_id=excluded.external_event_id,external_etag=excluded.external_etag,last_synced_at=excluded.last_synced_at,deleted_at=NULL,updated_at=excluded.updated_at`)
        .bind(logId,family,calendarId,eventId,String(event.etag||''),n,n,n).run();
      await markDone(env,outboxId,family);result.sent++;
    }catch(error){
      result.errors++;
      const message=String(error instanceof Error?error.message:error);
      const n=now();
      if(message==='REAUTH_REQUIRED')await env.DB.prepare("UPDATE external_calendar_accounts SET status='REVOKED',last_error='REAUTH_REQUIRED',updated_at=? WHERE family_id=? AND provider=?").bind(n,family,PROVIDER).run().catch(()=>{});
      await env.DB.prepare("UPDATE child_journal_calendar_accounts SET status='ERROR',last_error=?,updated_at=? WHERE family_id=?").bind(message.slice(0,200),n,family).run().catch(()=>{});
      const retry=Number(outbox.retry_count||0)+1;
      await env.DB.prepare("UPDATE child_journal_calendar_outbox SET status='ERROR',retry_count=?,next_retry_at=?,last_error=?,updated_at=? WHERE id=? AND family_id=?")
        .bind(retry,calendarRetryAt(retry),message.slice(0,200),n,outboxId,family).run();
    }
  }
  return result;
}

export async function childJournalCalendarStatus(db:D1Database,familyId:number){
  const [oauth,binding,pending]=await Promise.all([
    db.prepare("SELECT status FROM external_calendar_accounts WHERE family_id=? AND provider=? LIMIT 1").bind(familyId,PROVIDER).first<Row>(),
    db.prepare('SELECT calendar_name,status,last_error,last_synced_at FROM child_journal_calendar_accounts WHERE family_id=? LIMIT 1').bind(familyId).first<Row>(),
    db.prepare("SELECT SUM(CASE WHEN status='PENDING' THEN 1 ELSE 0 END) pending_count,SUM(CASE WHEN status='ERROR' THEN 1 ELSE 0 END) error_count FROM child_journal_calendar_outbox WHERE family_id=?").bind(familyId).first<Row>(),
  ]);
  return {
    oauthLinked:String(oauth?.status||'')==='ACTIVE',
    calendarCreated:Boolean(binding),
    calendarName:String(binding?.calendar_name||JOURNAL_CALENDAR_NAME),
    status:String(binding?.status||''),
    pending:Number(pending?.pending_count||0),
    errors:Number(pending?.error_count||0),
    lastSyncedAt:String(binding?.last_synced_at||''),
  };
}
