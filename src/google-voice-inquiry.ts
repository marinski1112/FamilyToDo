export type GoogleVoiceInquiryKind='TODAY_SCHEDULE'|'TOMORROW_SCHEDULE'|'OPEN_SHOPPING';
export type GoogleVoiceInquiry={type:'INQUIRY';kind:GoogleVoiceInquiryKind;delivery:'MEMBER_WEB_PUSH'};
export type MarkedGoogleVoiceInquiryCommand={marked:true}&GoogleVoiceInquiry;

const MAX_INQUIRY_INPUT_UNITS=256;
const boundedInput=(value:unknown):string|null=>typeof value==='string'&&value.length<=MAX_INQUIRY_INPUT_UNITS?value:null;
const normalize=(value:string)=>value.normalize('NFKC').replace(/[\s　]+/g,' ').trim().replace(/[?？。！!]+$/,'').trim();
const marker=/^(?:FT|FAMILY ?TODO|ファミリーTODO)(?: *: *| |$)/i;

const EXACT_INQUIRIES:ReadonlyArray<readonly [GoogleVoiceInquiryKind,ReadonlySet<string>]>= [
  ['TODAY_SCHEDULE',new Set(['今日の予定','今日のタスク','今日のTODO','今日予定','今日タスク','今日の予定教えて','今日の予定を教えて','今日の予定を教えてください','今日の予定は','今日のタスク教えて','今日のタスクを教えて','今日のタスクを教えてください','今日のタスクは','今日何する'])],
  ['TOMORROW_SCHEDULE',new Set(['明日の予定','明日のタスク','明日のTODO','明日予定','明日タスク','明日の予定教えて','明日の予定を教えて','明日の予定を教えてください','明日の予定は','明日のタスク教えて','明日のタスクを教えて','明日のタスクを教えてください','明日のタスクは','明日何する'])],
  ['OPEN_SHOPPING',new Set(['買い物リスト','買うもの','未完了の買い物','買い物教えて','買い物を教えて','買い物を教えてください','買い物リスト教えて','買い物リストを教えて','買い物リストを教えてください','買い物リストは','買うもの教えて','買うものを教えて','買うものを教えてください','買うものは','買い物何がある'])],
];

/**
 * Deterministic, side-effect-free parser for Google voice inquiry bodies.
 * Oversized inputs are rejected before NFKC/whitespace normalization so the
 * exact-match parser cannot perform unbounded preprocessing work.
 * Marker stripping remains the caller's responsibility so this helper can also
 * be reused by a future Gemini fallback after typed parsing fails.
 */
export function parseGoogleVoiceInquiryBody(value:unknown):GoogleVoiceInquiry|null{
  const raw=boundedInput(value);
  if(raw===null)return null;
  const body=normalize(raw);
  if(!body)return null;
  for(const [kind,phrases] of EXACT_INQUIRIES){
    if(phrases.has(body))return {type:'INQUIRY',kind,delivery:'MEMBER_WEB_PUSH'};
  }
  return null;
}

/**
 * Small composable adapter for the existing Google Tasks voice-command pipeline.
 * It owns only marker stripping and typed INQUIRY classification. Non-inquiry
 * commands return null so TASK/SHOPPING/FAMILY_LOG parsing can continue unchanged.
 * Execution, member data reads and Web Push delivery remain outside this module.
 */
export function parseMarkedGoogleVoiceInquiryCommand(value:unknown):MarkedGoogleVoiceInquiryCommand|null{
  const raw=boundedInput(value);
  if(raw===null)return null;
  const normalized=raw.normalize('NFKC').replace(/[\s　]+/g,' ').trim();
  const matched=marker.exec(normalized);
  if(!matched)return null;
  const inquiry=parseGoogleVoiceInquiryBody(normalized.slice(matched[0].length));
  return inquiry?{marked:true,...inquiry}:null;
}
