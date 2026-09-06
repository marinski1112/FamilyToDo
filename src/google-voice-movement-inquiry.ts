import { memberById } from './app-context';
import { extractMarkedGoogleVoiceInquiryBody } from './google-voice-inquiry';
import { GoogleVoiceInquiryDeliveryError } from './google-voice-inquiry-delivery';
import { buildLocationMovementDayLines } from './location-day-summary';
import { DEFAULT_FAMILY_TIMEZONE, familyDate } from './timezone';
import { sendMemberWebPush, type MemberPushResult, type PushMessagePayload } from './webpush';

const EXACT_YESTERDAY_MOVEMENT=new Set([
  '昨日の移動',
  '昨日の移動は',
  '昨日の移動教えて',
  '昨日の移動を教えて',
  '昨日の移動を教えてください',
]);
const MAX_LINES=8;
const MAX_LINE_LENGTH=120;
const MAX_BODY_LENGTH=500;

const shiftDate=(value:string,days:number):string=>{
  const date=new Date(`${value}T12:00:00.000Z`);
  date.setUTCDate(date.getUTCDate()+days);
  return date.toISOString().slice(0,10);
};

const cleanLine=(value:unknown):string=>String(value??'').replace(/[\r\n\t]+/g,' ').replace(/\s+/g,' ').trim();
const boundedLine=(value:string):string=>Array.from(value).slice(0,MAX_LINE_LENGTH).join('');
const boundedBody=(value:string):string=>{
  const chars=Array.from(value);
  return chars.length<=MAX_BODY_LENGTH?value:`${chars.slice(0,MAX_BODY_LENGTH-1).join('')}…`;
};

export function isGoogleVoiceYesterdayMovementInquiry(value:unknown):boolean{
  const body=extractMarkedGoogleVoiceInquiryBody(value);
  return body!==null&&EXACT_YESTERDAY_MOVEMENT.has(body);
}

function buildYesterdayMovementPush(lines:readonly string[]):PushMessagePayload{
  const cleaned=lines.slice(0,MAX_LINES).map(cleanLine).filter(Boolean).map(boundedLine);
  const omitted=Math.max(0,lines.length-cleaned.length);
  let body=cleaned.length?cleaned.map((line,index)=>`${index+1}. ${line}`).join('\n'):'昨日の共有位置記録はありません。';
  if(omitted>0)body+=`\nほか${omitted}件`;
  return {
    title:'昨日の移動',
    body:boundedBody(body),
    url:'/app/location.php',
    tag:'familytodo-inquiry-yesterday-movement',
  };
}

/**
 * Execute the privacy-sensitive movement inquiry outside the Gemini classifier.
 * Only an exact, explicitly marked phrase reaches the provider-neutral Location
 * projection. Delivery remains scoped to the Google Tasks account member.
 */
export async function executeGoogleVoiceYesterdayMovementInquiry(
  env:Env,
  familyId:number,
  memberId:number,
  value:unknown,
):Promise<{handled:false}|{handled:true;push:MemberPushResult}>{
  if(!isGoogleVoiceYesterdayMovementInquiry(value))return {handled:false};
  if(!Number.isSafeInteger(familyId)||familyId<=0||!Number.isSafeInteger(memberId)||memberId<=0)throw new GoogleVoiceInquiryDeliveryError('PRE_DELIVERY');

  let payload:PushMessagePayload;
  try{
    const member=await memberById(env,memberId);
    if(!member||member.family_id!==familyId)throw new Error('google-movement-member-tenant-mismatch');
    const timeZone=String(member.family_timezone||env.APP_TIMEZONE||DEFAULT_FAMILY_TIMEZONE);
    const localDate=familyDate(timeZone);
    const lines=await buildLocationMovementDayLines({
      db:env.DB,
      familyId,
      requesterMemberId:memberId,
      localDate:shiftDate(localDate,-1),
      timeZone,
    });
    payload=buildYesterdayMovementPush(lines);
  }catch{
    throw new GoogleVoiceInquiryDeliveryError('PRE_DELIVERY');
  }

  try{
    return {handled:true,push:await sendMemberWebPush(env,familyId,memberId,payload)};
  }catch{
    throw new GoogleVoiceInquiryDeliveryError('AMBIGUOUS_DELIVERY');
  }
}
