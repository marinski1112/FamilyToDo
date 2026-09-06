export type DailyFortune={
  stars:number;
  headline:string;
  luckyAction:string;
  luckyColor:string;
};

const HEADLINES=[
  '小さなうれしいことを見つけやすい日。',
  'いつもの順番を少し変えると気分転換になりそう。',
  'ひとつ終わらせると、次も軽やかに進みそう。',
  '身近な人へのひとことが、やさしい空気をつくりそう。',
  '急がず自分のペースを守ると、気持ちよく過ごせそう。',
  '気になっていたことをひとつ片づけるのに向く日。',
  '好きなものをひとつ選ぶと、ちょっと気分が上がりそう。',
  'いつもの場所に、小さな発見がありそう。',
] as const;

const ACTIONS=[
  'お気に入りの飲み物を選ぶ',
  '机やバッグの中を1か所だけ整える',
  '家族に「ありがとう」をひとこと伝える',
  '5分だけ好きなことをする',
  'いつもと違う道や順番を選んでみる',
  '今日できたことをひとつ数える',
  '好きな音楽を1曲聴く',
  '写真を1枚残す',
] as const;

const COLORS=['そら色','きいろ','みどり','ピンク','むらさき','オレンジ','白','ネイビー'] as const;

function hash32(value:string):number{
  let h=2166136261;
  for(let i=0;i<value.length;i++){
    h^=value.charCodeAt(i);
    h=Math.imul(h,16777619);
  }
  return h>>>0;
}

function pick<T>(values:readonly T[],seed:number,shift:number):T{
  return values[(seed>>>shift)%values.length];
}

/**
 * Entertainment-only daily fortune. The seed intentionally uses only stable
 * family/member identifiers plus the local calendar date. Profile attributes,
 * logs, schedules, location and AI are not inputs.
 */
export function dailyFortune(familyId:number,memberId:number,localDate:string):DailyFortune{
  const seed=hash32(`familytodo-fortune-v1:${familyId}:${memberId}:${localDate}`);
  return {
    stars:1+(seed%5),
    headline:pick(HEADLINES,seed,3),
    luckyAction:pick(ACTIONS,seed,7),
    luckyColor:pick(COLORS,seed,11),
  };
}
