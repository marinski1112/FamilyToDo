export type DigestAttempt={model:string;httpStatus:number|null;stage:string;reason:string;durationMs:number};
export type DigestGeneration={status:'AI'|'FALLBACK';reason:string;model?:string;attempts?:DigestAttempt[]};

const ATTEMPT_STAGES=new Set(['PROVIDER_FETCH','PROVIDER_RESPONSE','RESPONSE_PARSE','OUTPUT_PARSE','RECAP_VALIDATION','MEMBER_VALIDATION','COMPLETE']);
const ATTEMPT_REASONS=new Set(['OK','HTTP_ERROR','RATE_LIMIT','PROVIDER_TIMEOUT','NETWORK_ERROR','RESPONSE_BODY_JSON_INVALID','CANDIDATE_TEXT_MISSING','MODEL_OUTPUT_JSON_INVALID','RECAP_REJECTED','MEMBER_REJECTED','NUMERIC_CLAIM','EXCEPTION']);
export function safeDigestAttempts(value:unknown):DigestAttempt[]{
  if(!Array.isArray(value))return [];
  return value.slice(0,2).flatMap(raw=>{
    if(!raw||typeof raw!=='object')return [];
    const {model,httpStatus,stage,reason,durationMs}=raw;
    if(typeof model!=='string'||! /^[A-Za-z0-9._-]{1,120}$/.test(model)||!ATTEMPT_STAGES.has(stage)||!ATTEMPT_REASONS.has(reason))return [];
    return [{model,httpStatus:Number.isInteger(httpStatus)&&httpStatus>=100&&httpStatus<=599?httpStatus:null,stage,reason,durationMs:Number.isInteger(durationMs)&&durationMs>=0&&durationMs<=300000?durationMs:0}];
  });
}

// Count claims stay in deterministic facts; ordinary words/names are not numbers.
export function digestHasNumericClaim(value:string):boolean{
  const text=value.normalize('NFKC').replace(/一人ひとり|一人一人|一緒|一息|一安心|一段落|一生懸命/g,'');
  return /[0-9]|[〇零一二三四五六七八九十百千万億兆]+(?:件|回|人|個|つ|本|枚|台|匹|頭|羽|冊|杯|粒|袋|組|箇所|か所|ヶ所|歳|才|時|分|秒|円|倍|点|度|日間|週間|か月|ヶ月|年)|(?:^|[\s、。])(?:[〇零一二三四五六七八九十百千万億兆]+)(?=$|[\s、。])/u.test(text);
}

export const DIGEST_REASON_LABELS:Record<string,string>={
  OK:'Gemini生成に成功',NOT_CONFIGURED:'Geminiキーまたはプロバイダー未設定',DISABLED:'AI生成が無効',
  BUDGET_OR_CIRCUIT:'生成回数の上限・一時停止中',STORAGE:'生成履歴の読み書きに失敗',
  RATE_LIMIT:'Geminiの利用上限（429）',UPSTREAM:'Geminiへの通信・応答エラー',
  INVALID_OUTPUT:'生成結果の形式・安全性の検査に不合格',LEGACY:'以前の形式の生成結果',
};

export function digestReasonLabel(value:unknown):string{return DIGEST_REASON_LABELS[String(value)]||'理由の記録なし';}
