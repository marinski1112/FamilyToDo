type Row=Record<string,unknown>;

export type MorningWeatherFact={
  summary:string;
  lowC:number;
  highC:number;
  precipitationProbability?:number;
};

const WEATHER_ENDPOINT='https://api.open-meteo.com/v1/forecast';
const WEATHER_TIMEOUT_MS=2500;

const finite=(value:unknown)=>{const n=Number(value);return Number.isFinite(n)?n:null;};
const round1=(value:number)=>Math.round(value*10)/10;

function weatherSummary(code:number):string{
  if(code===0)return '晴れ';
  if(code>=1&&code<=3)return code===1?'晴れ時々くもり':'くもり';
  if(code===45||code===48)return '霧';
  if(code>=51&&code<=67)return '雨';
  if(code>=71&&code<=77)return '雪';
  if(code>=80&&code<=82)return 'にわか雨';
  if(code===85||code===86)return 'にわか雪';
  if(code>=95&&code<=99)return '雷雨';
  return '天気情報';
}

function parseFact(raw:unknown):MorningWeatherFact|null{
  const daily=(raw as any)?.daily;
  const code=finite(daily?.weather_code?.[0]);
  const high=finite(daily?.temperature_2m_max?.[0]);
  const low=finite(daily?.temperature_2m_min?.[0]);
  const precipitation=finite(daily?.precipitation_probability_max?.[0]);
  if(code===null||high===null||low===null)return null;
  return {
    summary:weatherSummary(Math.trunc(code)),
    lowC:round1(low),
    highC:round1(high),
    ...(precipitation===null?{}:{precipitationProbability:Math.max(0,Math.min(100,Math.round(precipitation)))})
  };
}

function cachedFact(payload:unknown):MorningWeatherFact|null{
  if(typeof payload!=='string'||!payload)return null;
  try{return parseFact(JSON.parse(payload));}catch{return null;}
}

export async function loadMorningWeatherFact(db:D1Database,familyId:number,localDate:string,timeZone:string):Promise<MorningWeatherFact|null>{
  if(!Number.isSafeInteger(familyId)||familyId<=0||!/^\d{4}-\d{2}-\d{2}$/.test(localDate))return null;
  const cached=await db.prepare('SELECT status,payload_json FROM line_daily_digest_weather_cache WHERE family_id=? AND local_date=?').bind(familyId,localDate).first<Row>();
  if(cached){
    if(String(cached.status)==='READY')return cachedFact(cached.payload_json);
    return null;
  }

  const now=new Date().toISOString();
  const claimed=await db.prepare("INSERT OR IGNORE INTO line_daily_digest_weather_cache(family_id,local_date,status,attempted_at,updated_at) VALUES(?,?,'FETCHING',?,?)").bind(familyId,localDate,now,now).run();
  if(Number(claimed.meta?.changes||0)!==1)return null;

  try{
    const home=await db.prepare("SELECT latitude,longitude FROM family_location_places WHERE family_id=? AND kind='HOME' LIMIT 1").bind(familyId).first<Row>();
    const lat=finite(home?.latitude),lon=finite(home?.longitude);
    if(lat===null||lon===null)throw new Error('HOME_NOT_CONFIGURED');
    // Weather does not require exact home coordinates. Keep provider disclosure coarse and never log them.
    const roundedLat=Math.round(lat*100)/100,roundedLon=Math.round(lon*100)/100;
    const params=new URLSearchParams({
      latitude:String(roundedLat),longitude:String(roundedLon),
      daily:'weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max',
      timezone:timeZone,start_date:localDate,end_date:localDate
    });
    const controller=new AbortController();
    const timeout=setTimeout(()=>controller.abort(),WEATHER_TIMEOUT_MS);
    let response:Response;
    try{response=await fetch(`${WEATHER_ENDPOINT}?${params}`,{signal:controller.signal});}finally{clearTimeout(timeout);}
    if(!response.ok)throw new Error(`WEATHER_HTTP_${response.status}`);
    const fact=parseFact(await response.json());
    if(!fact)throw new Error('WEATHER_INVALID_RESPONSE');
    await db.prepare("UPDATE line_daily_digest_weather_cache SET status='READY',payload_json=?,updated_at=? WHERE family_id=? AND local_date=?").bind(JSON.stringify({daily:{weather_code:[Object.entries({'晴れ':0,'晴れ時々くもり':1,'くもり':3,'霧':45,'雨':61,'雪':71,'にわか雨':80,'にわか雪':85,'雷雨':95,'天気情報':-1}).find(([label])=>label===fact.summary)?.[1]??-1],temperature_2m_max:[fact.highC],temperature_2m_min:[fact.lowC],precipitation_probability_max:[fact.precipitationProbability??null]}}),new Date().toISOString(),familyId,localDate).run();
    return fact;
  }catch{
    await db.prepare("UPDATE line_daily_digest_weather_cache SET status='FAILED',payload_json=NULL,updated_at=? WHERE family_id=? AND local_date=?").bind(new Date().toISOString(),familyId,localDate).run();
    return null;
  }
}

export function formatMorningWeather(fact:MorningWeatherFact):string{
  const temperatures=`${fact.lowC}〜${fact.highC}℃`;
  const rain=fact.precipitationProbability===undefined?'':`・降水${fact.precipitationProbability}%`;
  return `🌤️ ${fact.summary} ${temperatures}${rain}`;
}
