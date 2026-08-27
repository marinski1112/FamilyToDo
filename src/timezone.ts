export const DEFAULT_FAMILY_TIMEZONE='Asia/Tokyo';
export const FAMILY_TIMEZONE_OPTIONS=['Asia/Tokyo','UTC','America/Los_Angeles','America/New_York','Europe/London','Australia/Sydney'] as const;

export function validateTimezone(value:unknown):value is string{
  if(typeof value!=='string'||value.length<1||value.length>80)return false;
  try{new Intl.DateTimeFormat('en-US',{timeZone:value}).format(new Date());return true;}catch{return false;}
}
export function formatFamilyDateTime(date:Date,timeZone:string){
  const zone=validateTimezone(timeZone)?timeZone:DEFAULT_FAMILY_TIMEZONE;
  return new Intl.DateTimeFormat('sv-SE',{timeZone:zone,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'}).format(date);
}
export const familyNow=(timeZone:string)=>formatFamilyDateTime(new Date(),timeZone);
export const familyDate=(timeZone:string)=>familyNow(timeZone).slice(0,10);

/** Wave98 storage policy: naive values are already family-local wall-clock; offset values are instants. */
export function parseImportDateTime(value:unknown,timeZone:string){
  const raw=String(value??'').trim();
  const naive=raw.match(/^(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2})(?::(\d{2}))?$/);
  if(naive)return `${naive[1]} ${naive[2]}:${naive[3]||'00'}`;
  if(!/(?:Z|[+-]\d{2}:?\d{2})$/i.test(raw))throw new Error('日時が不正です');
  const instant=new Date(raw);if(!Number.isFinite(instant.getTime()))throw new Error('日時が不正です');
  return formatFamilyDateTime(instant,timeZone);
}

export function addWallClockMinutes(value:string,minutes:number){
  const m=value.match(/^(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2})(?::(\d{2}))?$/);if(!m)throw new Error('日時が不正です');
  const d=new Date(Date.UTC(+m[1],+m[2]-1,+m[3],+m[4],+m[5],+(m[6]||0))+minutes*60000);
  return d.toISOString().slice(0,19).replace('T',' ');
}

export function timezoneOffsetMinutesAt(utcNaive:string,timeZone:string){
  const instant=new Date(utcNaive.replace(' ','T')+'Z');if(!Number.isFinite(instant.getTime()))throw new Error('日時が不正です');
  const local=formatFamilyDateTime(instant,timeZone),asUtc=new Date(local.replace(' ','T')+'Z');
  return Math.round((asUtc.getTime()-instant.getTime())/60000);
}
