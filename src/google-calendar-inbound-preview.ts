import { json } from './response';
import type { AppContext } from './app-context';
import { decryptRefreshToken } from './google-calendar-core';
import { GOOGLE_CALENDAR_INBOUND_SCOPES } from './google-calendar-inbound-auth';
import {
  GOOGLE_CALENDAR_INBOUND_MAX_EVENTS,
  classifyGoogleCalendarInboundEvent,
  googleCalendarInboundCalendarBlockReason,
  type GoogleCalendarInboundClassification,
} from './google-calendar-inbound-safety';
import { isValidDateOnly } from './task-range-safety';
import { DEFAULT_FAMILY_TIMEZONE, formatFamilyDateTime, parseImportDateTime, validateTimezone } from './timezone';

type Row=Record<string,unknown>;
type JsonObject=Record<string,unknown>;
type GoogleCalendarTime={date?:unknown;dateTime?:unknown;timeZone?:unknown};
type GoogleCalendarEvent={
  id?:unknown;
  iCalUID?:unknown;
  recurringEventId?:unknown;
  recurrence?:unknown;
  eventType?:unknown;
  summary?:unknown;
  description?:unknown;
  location?:unknown;
  start?:GoogleCalendarTime|null;
  end?:GoogleCalendarTime|null;
  extendedProperties?:{private?:Record<string,unknown>|null}|null;
};
type NormalizedEvent={
  eventId:string;
  iCalUID:string;
  title:string;
  description:string;
  location:string;
  startAt:string;
  endAt:string|null;
  startDate:string;
  allDay:boolean;
  taskKind:'EVENT';
  calendarVisible:1;
  visibilityScope:'FAMILY';
  raw:GoogleCalendarEvent;
};
type PreviewClassification=GoogleCalendarInboundClassification|'INVALID';

const PROVIDER='GOOGLE_CALENDAR';
const CALENDAR_LIST_MAX=100;
const CALENDAR_PAGE_MAX=3;
const EVENT_PAGE_SIZE=100;
const EVENT_PAGE_MAX=5;
const MAX_RANGE_DAYS=90;
const LOCAL_COLLISION_LIMIT=500;
const EVIDENCE_BIND_CHUNK=80;

class InboundPreviewError extends Error{
  constructor(public code:string,public status:number=400){super(code);}
}

const roleAllowed=(value:unknown)=>['OWNER','ADMIN'].includes(String(value||'').toUpperCase());
const scopeReady=(value:unknown)=>{
  const granted=new Set(String(value||'').split(/\s+/).map(x=>x.trim()).filter(Boolean));
  return GOOGLE_CALENDAR_INBOUND_SCOPES.every(scope=>granted.has(scope));
};
const shiftDate=(value:string,days:number)=>{
  const d=new Date(`${value}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate()+days);
  return d.toISOString().slice(0,10);
};
const rangeDays=(from:string,to:string)=>Math.floor((Date.parse(`${to}T12:00:00Z`)-Date.parse(`${from}T12:00:00Z`))/86400000)+1;

async function readBody(request:Request){
  if(request.method!=='POST')throw new InboundPreviewError('POST_ONLY',405);
  const body=await request.json().catch(()=>null);
  if(!body||typeof body!=='object'||Array.isArray(body))throw new InboundPreviewError('INVALID_JSON');
  return body as JsonObject;
}

function authorize(ctx:AppContext,body:JsonObject){
  if(!ctx.member)throw new InboundPreviewError('AUTH_REQUIRED',401);
  if(!roleAllowed(ctx.member.role))throw new InboundPreviewError('FORBIDDEN',403);
  if(String(body.csrf||'')!==String(ctx.session.csrfToken||''))throw new InboundPreviewError('CSRF_FAILED',403);
}

function userError(error:unknown){
  const known=error instanceof InboundPreviewError?error:new InboundPreviewError('PREVIEW_FAILED',502);
  const messages:Record<string,string>={
    POST_ONLY:'POSTのみ利用できます。',INVALID_JSON:'入力を確認してください。',AUTH_REQUIRED:'ログインが必要です。',FORBIDDEN:'OWNER / ADMINのみ利用できます。',CSRF_FAILED:'CSRF検証に失敗しました。',
    AUTHORIZATION_REQUIRED:'Google Calendarの読み取り許可が必要です。',REAUTH_REQUIRED:'Google Calendarの読み取り許可をやり直してください。',GOOGLE_READ_FAILED:'Google Calendarを読み取れませんでした。',GOOGLE_ACCESS_DENIED:'選択したカレンダーを読み取る権限がありません。',CALENDAR_NOT_FOUND:'選択したカレンダーが見つかりません。',
    CALENDAR_REQUIRED:'取り込み元カレンダーを選択してください。',APP_OWNED_CALENDAR_BLOCKED:'FamilyToDo同期用カレンダーは取り込み元にできません。',CHILD_JOURNAL_CALENDAR_BLOCKED:'成長日記カレンダーは取り込み元にできません。',INVALID_DATE_RANGE:'日付範囲を確認してください。',RANGE_TOO_LARGE:`一度に確認できる期間は${MAX_RANGE_DAYS}日までです。`,PREVIEW_FAILED:'プレビューを作成できませんでした。',
  };
  return json({ok:false,error:messages[known.code]||messages.PREVIEW_FAILED,reason:known.code},known.status);
}

async function inboundAccessToken(ctx:AppContext){
  const row=await ctx.env.DB.prepare("SELECT refresh_token_ciphertext,granted_scopes,status FROM google_calendar_inbound_authorizations WHERE family_id=? LIMIT 1").bind(ctx.member!.family_id).first<Row>();
  if(!row||String(row.status)!=='ACTIVE'||!scopeReady(row.granted_scopes))throw new InboundPreviewError('AUTHORIZATION_REQUIRED',409);
  if(!ctx.env.GOOGLE_CALENDAR_CLIENT_ID||!ctx.env.GOOGLE_CALENDAR_CLIENT_SECRET||!ctx.env.GOOGLE_CALENDAR_TOKEN_KEY)throw new InboundPreviewError('AUTHORIZATION_REQUIRED',409);
  const refresh=await decryptRefreshToken(String(row.refresh_token_ciphertext||''),ctx.env.GOOGLE_CALENDAR_TOKEN_KEY);
  const response=await fetch('https://oauth2.googleapis.com/token',{
    method:'POST',headers:{'content-type':'application/x-www-form-urlencoded'},
    body:new URLSearchParams({client_id:ctx.env.GOOGLE_CALENDAR_CLIENT_ID,client_secret:ctx.env.GOOGLE_CALENDAR_CLIENT_SECRET,refresh_token:refresh,grant_type:'refresh_token'}),
  });
  if(!response.ok){
    const text=await response.text();
    if(response.status===400&&text.includes('invalid_grant'))throw new InboundPreviewError('REAUTH_REQUIRED',409);
    throw new InboundPreviewError('GOOGLE_READ_FAILED',502);
  }
  const token=await response.json() as {access_token?:unknown};
  const access=String(token.access_token||'');
  if(!access)throw new InboundPreviewError('GOOGLE_READ_FAILED',502);
  return access;
}

function googleFailure(status:number):InboundPreviewError{
  if(status===401)return new InboundPreviewError('REAUTH_REQUIRED',409);
  if(status===403)return new InboundPreviewError('GOOGLE_ACCESS_DENIED',403);
  if(status===404)return new InboundPreviewError('CALENDAR_NOT_FOUND',404);
  return new InboundPreviewError('GOOGLE_READ_FAILED',502);
}

async function googleJson(url:URL,access:string){
  const response=await fetch(url,{headers:{authorization:`Bearer ${access}`,'content-type':'application/json'}});
  if(!response.ok)throw googleFailure(response.status);
  return await response.json() as Record<string,unknown>;
}

async function protectedCalendarIds(db:D1Database,familyId:number){
  const [outbound,journal]=await Promise.all([
    db.prepare('SELECT calendar_id FROM external_calendar_accounts WHERE family_id=? AND provider=? LIMIT 1').bind(familyId,PROVIDER).first<Row>(),
    db.prepare('SELECT calendar_id FROM child_journal_calendar_accounts WHERE family_id=? LIMIT 1').bind(familyId).first<Row>(),
  ]);
  return {appOwned:String(outbound?.calendar_id||''),childJournal:String(journal?.calendar_id||'')};
}

function wallClockToInstant(value:string,timeZone:string){
  const zone=validateTimezone(timeZone)?timeZone:DEFAULT_FAMILY_TIMEZONE;
  const target=Date.parse(value.replace(' ','T')+'Z');
  if(!Number.isFinite(target))throw new InboundPreviewError('PREVIEW_FAILED',502);
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
  const wall=`${match[1]} ${match[2]}:${match[3]||'00'}`;
  return formatFamilyDateTime(wallClockToInstant(wall,zone),familyZone);
}

function normalizeGoogleEvent(event:GoogleCalendarEvent,familyZone:string):{ok:true;value:NormalizedEvent}|{ok:false;reason:string}{
  const eventType=String(event.eventType||'default');
  if(eventType!=='default')return {ok:false,reason:'UNSUPPORTED_EVENT_TYPE'};
  const start=event.start||{},end=event.end||{};
  const startDate=String(start.date||''),endDateExclusive=String(end.date||'');
  const hasDate=Boolean(startDate||endDateExclusive),hasDateTime=Boolean(start.dateTime||end.dateTime);
  if(hasDate&&hasDateTime)return {ok:false,reason:'MIXED_EVENT_TIME'};
  let startAt='',endAt:string|null=null,allDay=false,normalizedStartDate='';
  if(hasDate){
    if(!isValidDateOnly(startDate)||!isValidDateOnly(endDateExclusive)||endDateExclusive<startDate)return {ok:false,reason:'INVALID_ALL_DAY_RANGE'};
    // Legacy Google/ICS all-day entries can survive with an equal start/end date. Treat only equality as one day; reversed ranges stay invalid.
    const inclusiveEnd=endDateExclusive===startDate?startDate:shiftDate(endDateExclusive,-1);
    startAt=`${startDate} 00:00:00`;
    endAt=inclusiveEnd===startDate?null:`${inclusiveEnd} 23:59:59`;
    normalizedStartDate=startDate;
    allDay=true;
  }else{
    const startLocal=normalizedTimedValue(start.dateTime,start.timeZone,familyZone);
    const endLocal=normalizedTimedValue(end.dateTime,end.timeZone,familyZone);
    if(!startLocal||!endLocal||endLocal<startLocal)return {ok:false,reason:'INVALID_TIMED_RANGE'};
    startAt=startLocal;
    endAt=endLocal;
    normalizedStartDate=startLocal.slice(0,10);
  }
  const title=(String(event.summary||'').trim()||'（無題）').slice(0,255);
  return {ok:true,value:{
    eventId:String(event.id||'').trim(),iCalUID:String(event.iCalUID||'').trim(),title,
    description:String(event.description||'').slice(0,10000),location:String(event.location||'').slice(0,1000),
    startAt,endAt,startDate:normalizedStartDate,allDay,taskKind:'EVENT',calendarVisible:1,visibilityScope:'FAMILY',raw:event,
  }};
}

function chunks<T>(values:T[],size:number){const out:T[][]=[];for(let i=0;i<values.length;i+=size)out.push(values.slice(i,i+size));return out;}

async function evidenceSet(db:D1Database,sqlPrefix:string,bindHead:unknown[],values:string[]){
  const out=new Set<string>();
  for(const part of chunks([...new Set(values.filter(Boolean))],EVIDENCE_BIND_CHUNK)){
    if(!part.length)continue;
    const placeholders=part.map(()=>'?').join(',');
    const rows=await db.prepare(`${sqlPrefix} (${placeholders})`).bind(...bindHead,...part).all<Row>();
    for(const row of rows.results)out.add(String(row.value||''));
  }
  return out;
}

async function loadEvidence(ctx:AppContext,calendarId:string,events:NormalizedEvent[],from:string,to:string){
  const familyId=ctx.member!.family_id;
  const eventIds=events.map(e=>e.eventId).filter(Boolean),uids=events.map(e=>e.iCalUID).filter(Boolean);
  const [inbound,outbound,ics,localRows]=await Promise.all([
    evidenceSet(ctx.env.DB,'SELECT external_event_id value FROM google_calendar_inbound_links WHERE family_id=? AND calendar_id=? AND external_event_id IN',[familyId,calendarId],eventIds),
    evidenceSet(ctx.env.DB,"SELECT external_event_id value FROM external_calendar_links WHERE family_id=? AND provider=? AND calendar_id=? AND deleted_at IS NULL AND external_event_id IN",[familyId,PROVIDER,calendarId],eventIds),
    evidenceSet(ctx.env.DB,"SELECT source_uid value FROM calendar_import_entries WHERE family_id=? AND source_format='ICS' AND status IN ('ACTIVE','EDITED_KEPT','MISSING') AND source_uid IN",[familyId],uids),
    ctx.env.DB.prepare(`SELECT title,start_at,end_at,due_at,all_day FROM tasks WHERE family_id=? AND visibility_scope='FAMILY' AND upper(COALESCE(task_kind,'TASK'))='EVENT' AND date(COALESCE(end_at,start_at,due_at))>=? AND date(COALESCE(start_at,due_at))<=? ORDER BY id LIMIT ${LOCAL_COLLISION_LIMIT+1}`).bind(familyId,from,to).all<Row>(),
  ]);
  const localScanTruncated=localRows.results.length>LOCAL_COLLISION_LIMIT;
  const localKeys=new Set(localRows.results.slice(0,LOCAL_COLLISION_LIMIT).map(row=>`${String(row.title||'').slice(0,255)}\0${String(row.start_at||row.due_at||'')}\0${String(row.end_at||'')}\0${Number(row.all_day||0)===1?'1':'0'}`));
  return {inbound,outbound,ics,localKeys,localScanTruncated};
}

function collisionKey(event:NormalizedEvent){return `${event.title}\0${event.startAt}\0${event.endAt||''}\0${event.allDay?'1':'0'}`;}

export async function googleCalendarInboundCalendars(request:Request,ctx:AppContext){
  try{
    const body=await readBody(request);authorize(ctx,body);
    const access=await inboundAccessToken(ctx),protectedIds=await protectedCalendarIds(ctx.env.DB,ctx.member!.family_id);
    const calendars:Array<{id:string;summary:string;primary:boolean;access_role:string;blocked_reason:string|null}>=[];
    let pageToken='',truncated=false;
    for(let page=0;page<CALENDAR_PAGE_MAX&&calendars.length<CALENDAR_LIST_MAX;page++){
      const url=new URL('https://www.googleapis.com/calendar/v3/users/me/calendarList');
      url.searchParams.set('maxResults',String(Math.min(100,CALENDAR_LIST_MAX-calendars.length)));
      url.searchParams.set('showDeleted','false');url.searchParams.set('showHidden','false');
      if(pageToken)url.searchParams.set('pageToken',pageToken);
      const data=await googleJson(url,access),items=Array.isArray(data.items)?data.items as Array<Record<string,unknown>>:[];
      for(const item of items){
        const id=String(item.id||'').trim(),accessRole=String(item.accessRole||'');
        if(!id||!['owner','writer','reader'].includes(accessRole))continue;
        calendars.push({id,summary:(String(item.summaryOverride||item.summary||'').trim()||'（名前なし）').slice(0,255),primary:item.primary===true,access_role:accessRole,blocked_reason:googleCalendarInboundCalendarBlockReason(id,protectedIds.appOwned,protectedIds.childJournal)});
        if(calendars.length>=CALENDAR_LIST_MAX)break;
      }
      pageToken=String(data.nextPageToken||'');
      if(!pageToken)break;
      if(page===CALENDAR_PAGE_MAX-1||calendars.length>=CALENDAR_LIST_MAX)truncated=true;
    }
    return json({ok:true,calendars,truncated,max_calendars:CALENDAR_LIST_MAX,read_only:true});
  }catch(error){return userError(error);}
}

export async function googleCalendarInboundPreview(request:Request,ctx:AppContext){
  try{
    const body=await readBody(request);authorize(ctx,body);
    const calendarId=String(body.calendar_id||'').trim();
    if(!calendarId||calendarId.length>1024)throw new InboundPreviewError('CALENDAR_REQUIRED');
    const from=String(body.from_date||''),to=String(body.to_date||'');
    if(!isValidDateOnly(from)||!isValidDateOnly(to)||to<from)throw new InboundPreviewError('INVALID_DATE_RANGE');
    const days=rangeDays(from,to);if(days<1||days>MAX_RANGE_DAYS)throw new InboundPreviewError('RANGE_TOO_LARGE');
    const familyZone=validateTimezone(ctx.member!.family_timezone)?String(ctx.member!.family_timezone):DEFAULT_FAMILY_TIMEZONE;
    const protectedIds=await protectedCalendarIds(ctx.env.DB,ctx.member!.family_id);
    const blocked=googleCalendarInboundCalendarBlockReason(calendarId,protectedIds.appOwned,protectedIds.childJournal);
    if(blocked)throw new InboundPreviewError(blocked,409);
    const access=await inboundAccessToken(ctx);
    const calendarGet=new URL(`https://www.googleapis.com/calendar/v3/users/me/calendarList/${encodeURIComponent(calendarId)}`);
    await googleJson(calendarGet,access);

    const timeMin=wallClockToInstant(`${from} 00:00:00`,familyZone).toISOString();
    const timeMax=wallClockToInstant(`${shiftDate(to,1)} 00:00:00`,familyZone).toISOString();
    const rawEvents:GoogleCalendarEvent[]=[];
    let pageToken='',truncated=false;
    for(let page=0;page<EVENT_PAGE_MAX&&rawEvents.length<GOOGLE_CALENDAR_INBOUND_MAX_EVENTS;page++){
      const url=new URL(`https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events`);
      url.searchParams.set('timeMin',timeMin);url.searchParams.set('timeMax',timeMax);
      url.searchParams.set('showDeleted','false');url.searchParams.set('singleEvents','false');
      url.searchParams.set('maxResults',String(Math.min(EVENT_PAGE_SIZE,GOOGLE_CALENDAR_INBOUND_MAX_EVENTS-rawEvents.length)));
      if(pageToken)url.searchParams.set('pageToken',pageToken);
      const data=await googleJson(url,access),items=Array.isArray(data.items)?data.items as GoogleCalendarEvent[]:[];
      rawEvents.push(...items.slice(0,GOOGLE_CALENDAR_INBOUND_MAX_EVENTS-rawEvents.length));
      pageToken=String(data.nextPageToken||'');
      if(!pageToken)break;
      if(page===EVENT_PAGE_MAX-1||rawEvents.length>=GOOGLE_CALENDAR_INBOUND_MAX_EVENTS)truncated=true;
    }

    const normalized:NormalizedEvent[]=[],invalid:Array<{event_id:string;title:string;classification:'INVALID';invalid_reason:string}>=[];
    for(const event of rawEvents){
      const item=normalizeGoogleEvent(event,familyZone);
      if(item.ok)normalized.push(item.value);
      else invalid.push({event_id:String(event.id||'').trim(),title:(String(event.summary||'').trim()||'（無題）').slice(0,255),classification:'INVALID',invalid_reason:item.reason});
    }
    const evidence=await loadEvidence(ctx,calendarId,normalized,from,to);
    const counts:Record<PreviewClassification,number>={INVALID:invalid.length,INVALID_EVENT_ID:0,RECURRING_UNSUPPORTED:0,APP_OWNED_MARKER:0,ALREADY_IMPORTED:0,ALREADY_LINKED_OUTBOUND:0,ICS_ALREADY_IMPORTED:0,AMBIGUOUS_EXISTING_LOCAL:0,NEW_CANDIDATE:0};
    const events=normalized.map(event=>{
      const classification=classifyGoogleCalendarInboundEvent(event.raw,{
        alreadyImported:evidence.inbound.has(event.eventId),outboundLinked:evidence.outbound.has(event.eventId),icsAlreadyImported:Boolean(event.iCalUID&&evidence.ics.has(event.iCalUID)),
        existingLocalCollision:evidence.localKeys.has(collisionKey(event)),localScanTruncated:evidence.localScanTruncated,
      });
      counts[classification]++;
      return {event_id:event.eventId,ical_uid:event.iCalUID,title:event.title,description:event.description,location:event.location,start_at:event.startAt,end_at:event.endAt,start_date:event.startDate,all_day:event.allDay,task_kind:event.taskKind,calendar_visible:event.calendarVisible,visibility_scope:event.visibilityScope,classification};
    });
    return json({ok:true,read_only:true,calendar_id:calendarId,from_date:from,to_date:to,range_days:days,event_limit:GOOGLE_CALENDAR_INBOUND_MAX_EVENTS,truncated,local_scan_truncated:evidence.localScanTruncated,counts,events,invalid});
  }catch(error){return userError(error);}
}
