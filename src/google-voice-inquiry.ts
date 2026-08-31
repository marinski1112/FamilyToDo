export type GoogleVoiceInquiryKind='TODAY_SCHEDULE'|'TOMORROW_SCHEDULE'|'OPEN_SHOPPING';
export type GoogleVoiceInquiry={type:'INQUIRY';kind:GoogleVoiceInquiryKind;delivery:'MEMBER_WEB_PUSH'};

const normalize=(value:unknown)=>String(value??'').normalize('NFKC').replace(/[\s　]+/g,' ').trim();

const EXACT_INQUIRIES:ReadonlyArray<readonly [GoogleVoiceInquiryKind,ReadonlySet<string>]>= [
  ['TODAY_SCHEDULE',new Set(['今日の予定','今日のタスク','今日のTODO','今日予定','今日タスク'])],
  ['TOMORROW_SCHEDULE',new Set(['明日の予定','明日のタスク','明日のTODO','明日予定','明日タスク'])],
  ['OPEN_SHOPPING',new Set(['買い物リスト','買うもの','未完了の買い物','買い物教えて'])],
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
