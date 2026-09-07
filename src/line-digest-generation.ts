export type DigestGeneration={status:'AI'|'FALLBACK';reason:string;model?:string};

// Count claims stay in deterministic facts; ordinary words/names are not numbers.
export function digestHasNumericClaim(value:string):boolean{
  const text=value.normalize('NFKC').replace(/一人ひとり|一人一人|一緒|一息|一安心|一段落|一生懸命/g,'');
  return /[0-9]|[〇零一二三四五六七八九十百千万億兆]+(?:件|回|人|個|歳|才|時|分|秒|円|倍|点|度|日間|週間|か月|ヶ月|年)|(?:^|[\s、。])(?:[〇零一二三四五六七八九十百千万億兆]+)(?=$|[\s、。])/u.test(text);
}

export const DIGEST_REASON_LABELS:Record<string,string>={
  OK:'Gemini生成に成功',NOT_CONFIGURED:'Geminiキーまたはプロバイダー未設定',DISABLED:'AI生成が無効',
  BUDGET_OR_CIRCUIT:'生成回数の上限・一時停止中',STORAGE:'生成履歴の読み書きに失敗',
  RATE_LIMIT:'Geminiの利用上限（429）',UPSTREAM:'Geminiへの通信・応答エラー',
  INVALID_OUTPUT:'生成結果の形式・安全性の検査に不合格',LEGACY:'以前の形式の生成結果',
};

export function digestReasonLabel(value:unknown):string{return DIGEST_REASON_LABELS[String(value)]||'理由の記録なし';}
