export type TaskRangeError='START_DATE_INVALID'|'END_DATE_INVALID'|'DATE_ORDER'|'START_TIME_INVALID'|'END_TIME_INVALID'|'TIME_ORDER'|'START_TIME_REQUIRED';

export type StoredTaskRangeResult=
  | {ok:true;startAt:string|null;endAt:string|null}
  | {ok:false;error:TaskRangeError};

const DATE_ONLY=/^\d{4}-\d{2}-\d{2}$/;
const TIME_ONLY=/^(?:[01]\d|2[0-3]):[0-5]\d$/;
const LOCAL_DATE_TIME=/^(\d{4}-\d{2}-\d{2})T((?:[01]\d|2[0-3]):[0-5]\d)$/;

export function isValidDateOnly(value:string):boolean{
  if(!DATE_ONLY.test(value))return false;
  const ms=Date.parse(`${value}T12:00:00Z`);
  return Number.isFinite(ms)&&new Date(ms).toISOString().slice(0,10)===value;
}

export function isValidTimeOnly(value:string):boolean{return TIME_ONLY.test(value);}

function normalizeLocalTime(value:string,baseDate:string):string|null{
  if(!value)return '';
  if(isValidTimeOnly(value))return value;
  const match=value.match(LOCAL_DATE_TIME);
  if(!match||match[1]!==baseDate||!isValidDateOnly(match[1]))return null;
  return match[2];
}

export function buildStoredTaskRange(input:{
  noDate:boolean;
  allDay:boolean;
  startDate:string;
  endDate?:string;
  startTime?:string;
  endTime?:string;
  requireTimedStart?:boolean;
}):StoredTaskRangeResult{
  if(input.noDate)return {ok:true,startAt:null,endAt:null};
  const startDate=String(input.startDate||'').trim();
  const endDate=String(input.endDate||startDate).trim();
  if(!isValidDateOnly(startDate))return {ok:false,error:'START_DATE_INVALID'};
  if(!isValidDateOnly(endDate))return {ok:false,error:'END_DATE_INVALID'};
  if(endDate<startDate)return {ok:false,error:'DATE_ORDER'};
  if(input.allDay){
    return {ok:true,startAt:`${startDate} 00:00:00`,endAt:endDate===startDate?null:`${endDate} 23:59:59`};
  }
  const startRaw=String(input.startTime||'').trim();
  const endRaw=String(input.endTime||'').trim();
  if(input.requireTimedStart&&!startRaw)return {ok:false,error:'START_TIME_REQUIRED'};
  const startTime=normalizeLocalTime(startRaw,startDate);
  const endTime=normalizeLocalTime(endRaw,endDate);
  if(startRaw&&startTime===null)return {ok:false,error:'START_TIME_INVALID'};
  if(endRaw&&endTime===null)return {ok:false,error:'END_TIME_INVALID'};
  const startAt=startTime?`${startDate} ${startTime}:00`:null;
  const endAt=endTime?`${endDate} ${endTime}:00`:null;
  if(startAt&&endAt&&endAt<startAt)return {ok:false,error:'TIME_ORDER'};
  return {ok:true,startAt,endAt};
}

export type SafeCalendarDateRange={start:string;end:string;startMs:number;endMs:number;spanDays:number};

function dateOnlyMs(value:string):number|null{
  if(!isValidDateOnly(value))return null;
  const ms=Date.parse(`${value}T12:00:00Z`);
  return Number.isFinite(ms)?ms:null;
}

/**
 * Renderer fail-safe for persisted/legacy rows. A valid start with a missing,
 * malformed, or reversed end is rendered as one day. Timestamps are immutable
 * numbers so start/end can never alias the same mutable Date instance.
 */
export function safeCalendarDateRange(startLike:unknown,endLike:unknown):SafeCalendarDateRange|null{
  const start=String(startLike??'').slice(0,10);
  const startMs=dateOnlyMs(start);
  if(startMs===null)return null;
  const candidate=String(endLike??start).slice(0,10);
  const candidateMs=dateOnlyMs(candidate);
  const endMs=candidateMs!==null&&candidateMs>=startMs?candidateMs:startMs;
  const end=new Date(endMs).toISOString().slice(0,10);
  return {start,end,startMs,endMs,spanDays:Math.floor((endMs-startMs)/86_400_000)+1};
}

/** Number of calendar days after the start covered by a persisted task range. */
export function calendarRangeOffsetDays(startLike:unknown,endLike:unknown):number{
  const range=safeCalendarDateRange(startLike,endLike);
  return range?Math.max(0,range.spanDays-1):0;
}

/** Shift a validated calendar date without local-time / DST effects. */
export function shiftCalendarDateOnly(date:string,deltaDays:number):string{
  const ms=dateOnlyMs(date);
  if(ms===null)return date;
  const delta=Number.isFinite(deltaDays)?Math.trunc(deltaDays):0;
  return new Date(ms+delta*86_400_000).toISOString().slice(0,10);
}
