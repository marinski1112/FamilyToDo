import type { GoogleVoiceInquiryKind } from './google-voice-inquiry';
import type { PushMessagePayload } from './webpush';

export type GoogleVoiceInquiryPushInput = {
  kind: GoogleVoiceInquiryKind;
  lines: readonly string[];
};

const MAX_LINES = 8;
const MAX_LINE_LENGTH = 120;
const MAX_BODY_LENGTH = 500;

const META: Record<GoogleVoiceInquiryKind,{title:string;empty:string;url:string;tag:string}> = {
  TODAY_SCHEDULE: {title:'今日の予定',empty:'今日の予定はありません。',url:'/today.php',tag:'familytodo-inquiry-today'},
  TOMORROW_SCHEDULE: {title:'明日の予定',empty:'明日の予定はありません。',url:'/tomorrow.php',tag:'familytodo-inquiry-tomorrow'},
  OPEN_SHOPPING: {title:'買い物リスト',empty:'未完了の買い物はありません。',url:'/app/shopping.php',tag:'familytodo-inquiry-shopping'},
};

function cleanLine(value:string):string{
  return String(value??'').replace(/[\r\n\t]+/g,' ').replace(/\s+/g,' ').trim();
}

/**
 * Formats already-authorized inquiry results for the existing member-scoped Web Push transport.
 * This module deliberately performs no DB/network/member lookup and never broadens delivery scope.
 */
export function buildGoogleVoiceInquiryPush(input:GoogleVoiceInquiryPushInput):PushMessagePayload{
  const meta=META[input.kind];
  const cleaned=input.lines.map(cleanLine).filter(Boolean).slice(0,MAX_LINES);
  const omitted=Math.max(0,input.lines.length-cleaned.length);
  let body=cleaned.length?cleaned.map((line,index)=>{
    const prefix=`${index+1}. `;
    return prefix+line.slice(0,Math.max(0,MAX_LINE_LENGTH-prefix.length));
  }).join('\n'):meta.empty;
  if(omitted>0)body+=`\nほか${omitted}件`;
  if(body.length>MAX_BODY_LENGTH)body=body.slice(0,MAX_BODY_LENGTH-1).trimEnd()+'…';
  return {title:meta.title,body,url:meta.url,tag:meta.tag};
}

export const GOOGLE_VOICE_INQUIRY_PUSH_LIMITS={maxLines:MAX_LINES,maxLineLength:MAX_LINE_LENGTH,maxBodyLength:MAX_BODY_LENGTH} as const;
