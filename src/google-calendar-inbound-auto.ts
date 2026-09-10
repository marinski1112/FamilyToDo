import { DEFAULT_CALENDAR_COLOR } from './calendar-colors';
import { decryptRefreshToken } from './google-calendar-core';
import { GOOGLE_CALENDAR_INBOUND_SCOPES } from './google-calendar-inbound-auth';
import { classifyGoogleCalendarInboundEvent } from './google-calendar-inbound-safety';
import { isValidDateOnly } from './task-range-safety';
import { DEFAULT_FAMILY_TIMEZONE, familyNow, formatFamilyDateTime, parseImportDateTime, utcNow, validateTimezone } from './timezone';

type Row=Record<string,unknown>;
type GoogleCalendarTime={date?:unknown;dateTime?:unknown;timeZone?:unknown};
type GoogleCalendarEvent={
  id?:unknown;iCalUID?:unknown;etag?:unknown;updated?:unknown;status?:unknown;recurringEventId?:unknown;recurrence?:unknown;eventType?:unknown;
  summary?:unknown;description?:unknown;location?:unknown;start?:GoogleCalendarTime|null;end?:GoogleCalendarTime|null;
  extendedProperties?:{private?:Record<string,unknown>|null}|null;
};
type NormalizedEvent={
  eventId:string;iCalUID:string;etag:string;title:string;description:string;location:string;startAt:string;endAt:string|null;startDate:string;allDay:boolean;raw:GoogleCalendarEvent;
};
type EligibleCalendar={familyId:number;accountId:number;memberId:number;calendarId:string;familyZone:string};
type SyncState={phase:'BOOTSTRAP'|'ACTIVE';syncToken:string;pageToken:string;bootstrapSince:string;lastSyncedAt:string;leaseToken:string};

const PROVIDER='GOOGLE_CALENDAR';
const PAGE_SIZE=100;
const PAGE_MAX_PER_RUN=5;
const FAMILY_MAX_PER_RUN=2;
const AUTO_CREATE_MAX=15;
const EVIDENCE_BIND_CHUNK=80;
const LOCAL_COLLISION_CHUNK=20;
const LOCAL_COLLISION_RESULT_MAX=100;
const LEASE_SECONDS=120;
const INITIAL_OVERLAP_MS=10*60*1000;

class AutoSyncError extends Error{constructor(public code:string,public status=500){super(code);}}

const scopeReady=(value:unknown)=>{
  const granted=new Set(String(value||'').split(/\s+/).map(v=>v.trim()).filter(Boolean));
  return GOOGLE_CALENDAR_INBOUND_SCOPES.every(scope=>granted.has(scope));
};
const shiftDate=(value:string,days:number)=>{const d=new Date(`${value}T12:00:00Z`);d.setUTCDate(d.getUTCDate()+days);return d.toISOString().slice(0,10);};
const chunks=<T>(values:T[],size:number)=>{const out:T[][]=[];for(let i=0;i<values.length;i+=size)out.push(values.slice(i,i+size));return out;};
const sqlUtcToMs=(value:string)=>Date.parse(value.replace(' ','T')+'Z');

async function inboundAccessToken(env:Env,familyId:number){
  const row=await env.DB.prepare("SELECT refresh_token_ciphertext,granted_scopes,status FROM google_calendar_inbound_authorizations WHERE family_id=? LIMIT 1").bind(familyId).first<Row>();
  if(!row||String(row.status)!=='ACTIVE'||!scopeReady(row.granted_scopes))throw new AutoSyncError('AUTHORIZATION_REQUIRED',409);
  if(!env.GOOGLE_CALENDAR_CLIENT_ID||!env.GOOGLE_CALENDAR_CLIENT_SECRET||!env.GOOGLE_CALENDAR_TOKEN_KEY)throw new AutoSyncError('AUTHORIZATION_REQUIRED',409);
  const refresh=await decryptRefreshToken(String(row.refresh_token_ciphertext||''),env.GOOGLE_CALENDAR_TOKEN_KEY);
  const response=await fetch('https://oauth2.googleapis.com/token',{
    method:'POST',headers:{'content-type':'application/x-www-form-urlencoded'},
    body:new URLSearchParams({client_id:env.GOOGLE_CALENDAR_CLIENT_ID,client_secret:env.GOOGLE_CALENDAR_CLIENT_SECRET,refresh_token:refresh,grant_type:'refresh_token'}),
  });
  if(!response.ok){
    const text=await response.text();
    if(response.status===400&&text.includes('invalid_grant'))throw new AutoSyncError('REAUTH_REQUIRED',409);
    throw new AutoSyncError('GOOGLE_TOKEN_FAILED',502);
  }
  const body=await response.json() as {access_token?:unknown};
  const access=String(body.access_token||'');
  if(!access)throw new AutoSyncError('GOOGLE_TOKEN_FAILED',502);
  return access;
}

function wallClockToInstant(value:string,timeZone:string){
  const zone=validateTimezone(timeZone)?timeZone:DEFAULT_FAMILY_TIMEZONE;
  const target=Date.parse(value.replace(' ','T')+'Z');
  if(!Number.isFinite(target))throw new AutoSyncError('INVALID_EVENT_TIME');
  let guess=target;
  for(let i=0;i<4;i++){
    const shown=formatFamilyDateTime(new Date(guess),zone);
    const shownAsUtc=Date.parse(shown.replace(' ','T')+'Z');
    guess+=target-shownAsUtc;
  }
  return new Date(guess);
}

function normalizedTimedValue(value:unknown,eventZone:unknown,familyZone:string){
  const raw=String(value||'').trim();
  if(!raw)return '';
  if(/(?:Z|[+-]\d{2}:?\d{2})$/i.test(raw))return parseImportDateTime(raw,familyZone);
  const match=raw.match(/^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2}):?(\d{2})?(?:\.\d+)?$/);
  const zone=String(eventZone||'');
  if(!match||!validateTimezone(zone))return '';
  return formatFamilyDateTime(wallClockToInstant(`${match[1]} ${match[2]}:${match[3]||'00'}`,zone),familyZone);
}

function normalizeGoogleEvent(event:GoogleCalendarEvent,familyZone:string):NormalizedEvent|null{
  if(String(event.eventType||'default')!=='default')return null;
  const start=event.start||{},end=event.end||{};
  const startDate=String(start.date||''),endDateExclusive=String(end.date||'');
  const hasDate=Boolean(startDate||endDateExclusive),hasDateTime=Boolean(start.dateTime||end.dateTime);
  if(hasDate&&hasDateTime)return null;
  let startAt='',endAt:string|null=null,normalizedStartDate='',allDay=false;
  if(hasDate){
    if(!isValidDateOnly(startDate)||!isValidDateOnly(endDateExclusive)||endDateExclusive<startDate)return null;
    const inclusiveEnd=endDateExclusive===startDate?startDate:shiftDate(endDateExclusive,-1);
    startAt=`${startDate} 00:00:00`;
    endAt=inclusiveEnd===startDate?null:`${inclusiveEnd} 23:59:59`;
    normalizedStartDate=startDate;allDay=true;
  }else{
    const startLocal=normalizedTimedValue(start.dateTime,start.timeZone,familyZone);
    const endLocal=normalizedTimedValue(end.dateTime,end.timeZone,familyZone);
    if(!startLocal||!endLocal||endLocal<startLocal)return null;
    startAt=startLocal;endAt=endLocal;normalizedStartDate=startLocal.slice(0,10);
  }
  return {
    eventId:String(event.id||'').trim(),iCalUID:String(event.iCalUID||'').trim(),etag:String(event.etag||'').slice(0,1024),
    title:(String(event.summary||'').trim()||'（無題）').slice(0,255),description:String(event.description||'').slice(0,10000),location:String(event.location||'').slice(0,1000),
    startAt,endAt,startDate:normalizedStartDate,allDay,raw:event,
  };
}

async function evidenceSet(db:D1Database,sqlPrefix:string,bindHead:unknown[],values:string[]){
  const out=new Set<string>();
  for(const part of chunks([...new Set(values.filter(Boolean))],EVIDENCE_BIND_CHUNK)){
    if(!part.length)continue;
    const rows=await db.prepare(`${sqlPrefix} (${part.map(()=>'?').join(',')})`).bind(...bindHead,...part).all<Row>();
    for(const row of rows.results)out.add(String(row.value||''));
  }
  return out;
}

const collisionKey=(event:NormalizedEvent)=>`${event.title}\0${event.startAt}\0${event.endAt||''}\0${event.allDay?'1':'0'}`;

async function localCollisionEvidence(db:D1Database,familyId:number,events:NormalizedEvent[]){
  const keys=new Set<string>();
  let truncated=false;
  for(const part of chunks(events,LOCAL_COLLISION_CHUNK)){
    if(!part.length)continue;
    const where=part.map(()=>"(title=? AND COALESCE(start_at,due_at,'')=? AND COALESCE(end_at,'')=? AND COALESCE(all_day,0)=?)").join(' OR ');
    const binds:unknown[]=[familyId];
    for(const event of part)binds.push(event.title,event.startAt,event.endAt||'',event.allDay?1:0);
    const rows=await db.prepare(`SELECT title,start_at,end_at,due_at,all_day FROM tasks WHERE family_id=? AND visibility_scope='FAMILY' AND upper(COALESCE(task_kind,'TASK'))='EVENT' AND (${where}) LIMIT ${LOCAL_COLLISION_RESULT_MAX+1}`).bind(...binds).all<Row>();
    if(rows.results.length>LOCAL_COLLISION_RESULT_MAX)truncated=true;
    for(const row of rows.results.slice(0,LOCAL_COLLISION_RESULT_MAX))keys.add(`${String(row.title||'').slice(0,255)}\0${String(row.start_at||row.due_at||'')}\0${String(row.end_at||'')}\0${Number(row.all_day||0)===1?'1':'0'}`);
  }
  return {keys,truncated};
}

async function newCandidates(env:Env,familyId:number,calendarId:string,zone:string,items:GoogleCalendarEvent[],bootstrapSince:string){
  const threshold=bootstrapSince?sqlUtcToMs(bootstrapSince):NaN;
  const normalized:NormalizedEvent[]=[];
  for(const event of items){
    if(String(event.status||'')==='cancelled')continue;
    if(Number.isFinite(threshold)){
      const updated=Date.parse(String(event.updated||''));
      if(!Number.isFinite(updated)||updated<threshold)continue;
    }
    const value=normalizeGoogleEvent(event,zone);
    if(!value)continue;
    const basic=classifyGoogleCalendarInboundEvent(event,{});
    if(basic!=='NEW_CANDIDATE')continue;
    normalized.push(value);
  }
  if(!normalized.length)return [];

  const eventIds=normalized.map(e=>e.eventId).filter(Boolean),uids=normalized.map(e=>e.iCalUID).filter(Boolean);
  const [inbound,outbound,ics]=await Promise.all([
    evidenceSet(env.DB,'SELECT external_event_id value FROM google_calendar_inbound_links WHERE family_id=? AND calendar_id=? AND external_event_id IN',[familyId,calendarId],eventIds),
    evidenceSet(env.DB,"SELECT external_event_id value FROM external_calendar_links WHERE family_id=? AND provider=? AND calendar_id=? AND deleted_at IS NULL AND external_event_id IN",[familyId,PROVIDER,calendarId],eventIds),
    evidenceSet(env.DB,"SELECT source_uid value FROM calendar_import_entries WHERE family_id=? AND source_format='ICS' AND status IN ('ACTIVE','EDITED_KEPT','MISSING') AND source_uid IN",[familyId],uids),
  ]);
  const unresolved=normalized.filter(event=>!inbound.has(event.eventId)&&!outbound.has(event.eventId)&&!(event.iCalUID&&ics.has(event.iCalUID)));
  const local=await localCollisionEvidence(env.DB,familyId,unresolved);
  return normalized.filter(event=>classifyGoogleCalendarInboundEvent(event.raw,{
    alreadyImported:inbound.has(event.eventId),outboundLinked:outbound.has(event.eventId),icsAlreadyImported:Boolean(event.iCalUID&&ics.has(event.iCalUID)),
    existingLocalCollision:local.keys.has(collisionKey(event)),localScanTruncated:local.truncated,
  })==='NEW_CANDIDATE');
}

async function eligibleCalendars(env:Env,familyIdHint?:number){
  const sql=`SELECT a.id account_id,a.family_id,a.calendar_id,ia.member_id,COALESCE(f.timezone,?) family_timezone
    FROM external_calendar_accounts a
    JOIN google_calendar_inbound_authorizations ia ON ia.family_id=a.family_id AND ia.status='ACTIVE'
    JOIN families f ON f.id=a.family_id
    JOIN members m ON m.id=ia.member_id AND m.family_id=a.family_id AND m.active=1
    WHERE a.provider=? AND a.status='ACTIVE' AND a.calendar_id IS NOT NULL AND length(trim(a.calendar_id))>0${familyIdHint?' AND a.family_id=?':''}
    ORDER BY a.family_id LIMIT ?`;
  const binds:unknown[]=[env.APP_TIMEZONE||DEFAULT_FAMILY_TIMEZONE,PROVIDER];
  if(familyIdHint)binds.push(familyIdHint);
  binds.push(familyIdHint?1:FAMILY_MAX_PER_RUN);
  const rows=await env.DB.prepare(sql).bind(...binds).all<Row>();
  return rows.results.map(row=>({
    familyId:Number(row.family_id),accountId:Number(row.account_id),memberId:Number(row.member_id),calendarId:String(row.calendar_id||''),
    familyZone:validateTimezone(String(row.family_timezone||''))?String(row.family_timezone):DEFAULT_FAMILY_TIMEZONE,
  })).filter(row=>Number.isSafeInteger(row.familyId)&&row.familyId>0&&Number.isSafeInteger(row.memberId)&&row.memberId>0&&row.calendarId) as EligibleCalendar[];
}

async function ensureState(env:Env,target:EligibleCalendar){
  const current=await env.DB.prepare('SELECT calendar_id FROM google_calendar_inbound_sync_state WHERE family_id=? LIMIT 1').bind(target.familyId).first<Row>();
  const bootstrapSince=utcNow(new Date(Date.now()-INITIAL_OVERLAP_MS)),timestamp=utcNow();
  if(!current){
    await env.DB.prepare("INSERT INTO google_calendar_inbound_sync_state(family_id,calendar_id,phase,sync_token,page_token,bootstrap_since,last_synced_at,last_error,lease_token,lease_expires_at,created_at,updated_at) VALUES(?,?,'BOOTSTRAP',NULL,NULL,?,NULL,NULL,NULL,NULL,?,?)")
      .bind(target.familyId,target.calendarId,bootstrapSince,timestamp,timestamp).run();
  }else if(String(current.calendar_id||'')!==target.calendarId){
    await env.DB.prepare("UPDATE google_calendar_inbound_sync_state SET calendar_id=?,phase='BOOTSTRAP',sync_token=NULL,page_token=NULL,bootstrap_since=?,last_synced_at=NULL,last_error=NULL,lease_token=NULL,lease_expires_at=NULL,updated_at=? WHERE family_id=?")
      .bind(target.calendarId,bootstrapSince,timestamp,target.familyId).run();
  }
}

async function acquireState(env:Env,familyId:number){
  const leaseToken=crypto.randomUUID(),nowEpoch=Math.floor(Date.now()/1000),expires=nowEpoch+LEASE_SECONDS;
  const result=await env.DB.prepare('UPDATE google_calendar_inbound_sync_state SET lease_token=?,lease_expires_at=?,updated_at=? WHERE family_id=? AND (lease_expires_at IS NULL OR lease_expires_at<?)')
    .bind(leaseToken,expires,utcNow(),familyId,nowEpoch).run();
  if(Number(result.meta?.changes||0)!==1)return null;
  const row=await env.DB.prepare('SELECT phase,sync_token,page_token,bootstrap_since,last_synced_at,lease_token FROM google_calendar_inbound_sync_state WHERE family_id=? AND lease_token=? LIMIT 1').bind(familyId,leaseToken).first<Row>();
  if(!row)return null;
  return {phase:String(row.phase)==='ACTIVE'?'ACTIVE':'BOOTSTRAP',syncToken:String(row.sync_token||''),pageToken:String(row.page_token||''),bootstrapSince:String(row.bootstrap_since||''),lastSyncedAt:String(row.last_synced_at||''),leaseToken} as SyncState;
}

async function releaseState(env:Env,familyId:number,leaseToken:string){
  await env.DB.prepare('UPDATE google_calendar_inbound_sync_state SET lease_token=NULL,lease_expires_at=NULL,updated_at=? WHERE family_id=? AND lease_token=?').bind(utcNow(),familyId,leaseToken).run().catch(()=>{});
}

async function recordError(env:Env,familyId:number,leaseToken:string,code:string){
  await env.DB.prepare('UPDATE google_calendar_inbound_sync_state SET last_error=?,updated_at=? WHERE family_id=? AND lease_token=?').bind(code.slice(0,80),utcNow(),familyId,leaseToken).run().catch(()=>{});
}

async function fetchEventPage(access:string,calendarId:string,state:SyncState){
  const url=new URL(`https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events`);
  url.searchParams.set('maxResults',String(PAGE_SIZE));
  url.searchParams.set('showDeleted','true');
  url.searchParams.set('singleEvents','false');
  if(state.phase==='ACTIVE')url.searchParams.set('syncToken',state.syncToken);
  if(state.pageToken)url.searchParams.set('pageToken',state.pageToken);
  const response=await fetch(url,{headers:{authorization:`Bearer ${access}`,'content-type':'application/json'}});
  if(response.status===410)return {expired:true,data:null as Record<string,unknown>|null};
  if(response.status===401)throw new AutoSyncError('REAUTH_REQUIRED',409);
  if(response.status===403)throw new AutoSyncError('GOOGLE_ACCESS_DENIED',403);
  if(response.status===404)throw new AutoSyncError('CALENDAR_NOT_FOUND',404);
  if(!response.ok)throw new AutoSyncError('GOOGLE_READ_FAILED',502);
  return {expired:false,data:await response.json() as Record<string,unknown>};
}

function identityConflict(error:unknown){
  const text=String(error instanceof Error?error.message:error||'').toLowerCase();
  return text.includes('unique')&&text.includes('google_calendar_inbound_links');
}

async function insertCandidates(env:Env,target:EligibleCalendar,events:NormalizedEvent[]){
  if(!events.length)return true;
  const taskNow=familyNow(target.familyZone),identityNow=utcNow(),statements:D1PreparedStatement[]=[];
  for(const event of events){
    statements.push(
      env.DB.prepare("INSERT INTO tasks(family_id,title,description,due_at,status,completion_mode,created_by,created_at,updated_at,start_at,end_at,location,all_day,calendar_visible,calendar_color,task_kind,sort_order,visibility_scope,private_owner_id) VALUES(?,?,?,NULL,'pending','ANY',?,?,?,?,?,?,?,1,?,'EVENT',0,'FAMILY',NULL)")
        .bind(target.familyId,event.title,event.description||null,target.memberId,taskNow,taskNow,event.startAt,event.endAt,event.location||null,event.allDay?1:0,DEFAULT_CALENDAR_COLOR),
      env.DB.prepare('INSERT INTO google_calendar_inbound_links(family_id,account_id,calendar_id,external_event_id,ical_uid,task_id,external_etag,created_at,updated_at) VALUES(?,?,?,?,?,last_insert_rowid(),?,?,?)')
        .bind(target.familyId,target.accountId,target.calendarId,event.eventId,event.iCalUID||null,event.etag||null,identityNow,identityNow),
    );
  }
  try{await env.DB.batch(statements);}catch(error){if(identityConflict(error))return false;throw error;}
  await env.DB.prepare("INSERT INTO activity_logs(family_id,member_id,action,target_type,target_id,metadata,occurred_at) VALUES(?,?,'GOOGLE_CALENDAR_INBOUND_AUTO_IMPORT','google_calendar',NULL,?,?)")
    .bind(target.familyId,target.memberId,JSON.stringify({created_count:events.length,provider:PROVIDER}),identityNow).run().catch(()=>{});
  return true;
}

async function advanceState(env:Env,target:EligibleCalendar,state:SyncState,data:Record<string,unknown>){
  const nextPage=String(data.nextPageToken||''),nextSync=String(data.nextSyncToken||''),timestamp=utcNow();
  if(nextPage){
    await env.DB.prepare('UPDATE google_calendar_inbound_sync_state SET page_token=?,last_error=NULL,updated_at=? WHERE family_id=? AND lease_token=?')
      .bind(nextPage,timestamp,target.familyId,state.leaseToken).run();
    state.pageToken=nextPage;
    return true;
  }
  if(!nextSync)throw new AutoSyncError('SYNC_TOKEN_MISSING',502);
  await env.DB.prepare("UPDATE google_calendar_inbound_sync_state SET phase='ACTIVE',sync_token=?,page_token=NULL,bootstrap_since='',last_synced_at=?,last_error=NULL,updated_at=? WHERE family_id=? AND lease_token=?")
    .bind(nextSync,timestamp,timestamp,target.familyId,state.leaseToken).run();
  state.phase='ACTIVE';state.syncToken=nextSync;state.pageToken='';state.bootstrapSince='';state.lastSyncedAt=timestamp;
  return false;
}

async function resetExpiredToken(env:Env,target:EligibleCalendar,state:SyncState){
  const recoverySince=state.lastSyncedAt||utcNow(new Date(Date.now()-INITIAL_OVERLAP_MS));
  await env.DB.prepare("UPDATE google_calendar_inbound_sync_state SET phase='BOOTSTRAP',sync_token=NULL,page_token=NULL,bootstrap_since=?,last_error='SYNC_TOKEN_EXPIRED',updated_at=? WHERE family_id=? AND lease_token=?")
    .bind(recoverySince,utcNow(),target.familyId,state.leaseToken).run();
}

async function syncCalendar(env:Env,target:EligibleCalendar){
  await ensureState(env,target);
  const state=await acquireState(env,target.familyId);
  if(!state)return;
  try{
    const access=await inboundAccessToken(env,target.familyId);
    for(let page=0;page<PAGE_MAX_PER_RUN;page++){
      if(state.phase==='ACTIVE'&&!state.syncToken)throw new AutoSyncError('SYNC_TOKEN_MISSING',502);
      const result=await fetchEventPage(access,target.calendarId,state);
      if(result.expired){await resetExpiredToken(env,target,state);return;}
      const data=result.data||{};
      const items=Array.isArray(data.items)?data.items as GoogleCalendarEvent[]:[];
      const candidates=await newCandidates(env,target.familyId,target.calendarId,target.familyZone,items,state.phase==='BOOTSTRAP'?state.bootstrapSince:'');
      const selected=candidates.slice(0,AUTO_CREATE_MAX);
      if(selected.length){
        const inserted=await insertCandidates(env,target,selected);
        if(!inserted)return;
      }
      // Do not advance the Google page while unprocessed NEW_CANDIDATE rows remain. The next run
      // re-reads the same page; newly linked rows become ALREADY_IMPORTED, making batching idempotent.
      if(candidates.length>AUTO_CREATE_MAX)return;
      const more=await advanceState(env,target,state,data);
      if(!more)return;
    }
  }catch(error){
    const code=error instanceof AutoSyncError?error.code:'AUTO_SYNC_FAILED';
    await recordError(env,target.familyId,state.leaseToken,code);
  }finally{
    await releaseState(env,target.familyId,state.leaseToken);
  }
}

/**
 * Automatic inbound is intentionally restricted to each family's app-owned Family TODO calendar.
 * Existing/manual external-calendar preview/apply remains explicit. This importer auto-creates only
 * current NEW_CANDIDATE non-recurring events; Google edits/deletes never overwrite/delete local rows.
 */
export async function processGoogleCalendarInboundAuto(env:Env,familyIdHint?:number){
  const targets=await eligibleCalendars(env,familyIdHint);
  for(const target of targets)await syncCalendar(env,target);
}
