export type GoogleVoiceInquiryKind='TODAY_SCHEDULE'|'TOMORROW_SCHEDULE'|'OPEN_SHOPPING';
export type GoogleVoiceInquiry={type:'INQUIRY';kind:GoogleVoiceInquiryKind;delivery:'MEMBER_WEB_PUSH'};
export type MarkedGoogleVoiceInquiryCommand={marked:true}&GoogleVoiceInquiry;
export type GoogleVoiceInquiryParseResult={marked:false}|MarkedGoogleVoiceInquiryCommand|{marked:true;type:'NEEDS_REVIEW';reason:'UNSUPPORTED_INQUIRY'};

const normalize=(value:unknown)=>String(value??'').normalize('NFKC').replace(/[\s　]+/g,' ').trim().replace(/[?？。！!]+$/,'').trim();
const marker=/^(?:FT|FAMILY TODO|ファミリーTODO)(?: |$)/i;

const EXACT_INQUIRIES:ReadonlyArray<readonly [GoogleVoiceInquiryKind,ReadonlySet<string>]>= [
  ['TODAY_SCHEDULE',new Set(['今日の予定','今日のタスク','今日のTODO','今日予定','今日タスク','今日の予定教えて','今日のタスク教えて','今日何する'])],
  ['TOMORROW_SCHEDULE',new Set(['明日の予定','明日のタスク','明日のTODO','明日予定','明日タスク','明日の予定教えて','明日のタスク教えて','明日何する'])],
  ['OPEN_SHOPPING',new Set(['買い物リスト','買うもの','未完了の買い物','買い物教えて','買い物リスト教えて','買うもの教えて','買い物何がある'])],
];

/**
 * Deterministic, side-effect-free parser for Google voice inquiry bodies.
 * Marker stripping remains the caller's responsibility so this helper can also
 * be reused by a future Gemini fallback after typed parsing fails.
 */
export function parseGoogleVoiceInquiryBody(value:unknown):GoogleVoiceInquiry|null{
  const body=normalize(value);
  if(!body)return null;
  for(const [kind,phrases] of EXACT_INQUIRIES){
    if(phrases.has(body))return {type:'INQUIRY',kind,delivery:'MEMBER_WEB_PUSH'};
  }
  return null;
}

/**
 * Small adapter for the existing Google Tasks voice-command pipeline.
 * It owns only marker stripping and typed INQUIRY classification; execution,
 * member data reads and Web Push delivery remain outside this parser module.
 */
export function parseMarkedGoogleVoiceInquiryCommand(value:unknown):GoogleVoiceInquiryParseResult{
  const normalized=String(value??'').normalize('NFKC').replace(/[\s　]+/g,' ').trim();
  const matched=marker.exec(normalized);
  if(!matched)return {marked:false};
  const inquiry=parseGoogleVoiceInquiryBody(normalized.slice(matched[0].length));
  return inquiry?{marked:true,...inquiry}:{marked:true,type:'NEEDS_REVIEW',reason:'UNSUPPORTED_INQUIRY'};
}
