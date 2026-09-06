type Row=Record<string,unknown>;

export type MorningWeatherFact={summary:string};

const WEATHER_TIMEOUT_MS=2500;

function weatherLabel(code:number):string{
  if(code===0)return '晴れ';
  if([1,2].includes(code))return '晴れ時々くもり';
  if(code===3)return 'くもり';
  if([45,48].includes(code))return '霧';
  if([51,53,55,56,57].includes(code))return '霧雨';
  if([61,63,65,66,67,80,81,82].includes(code))return '雨';
  if([71,73,75,77,85,86].includes(code))return '雪';
  if([95,96,99].includes(code))return '雷雨';
  return '天気情報あり';
}

function n(value:unknown):number|null{
  const parsed=Number(value);
  return Number.isFinite(parsed)?parsed:null;
}

function rounded(value:number|null):string|null{
  return value===null?null:String(Math.round(value));
}

async function readCached(db:D1Database,familyId:number,localDate:string):Promise<string|null>{
  const row=await db.prepare('SELECT summary FROM line_daily_digest_weather_daily WHERE family_id=? AND local_date=?').bind(familyId,localDate).first<Row>();
  const summary=String(row?.summary||'').trim();
  return summary||null;
}

export async function loadMorningWeather(db:D1Database,familyId:number,localDate:string,timeZone:string):Promise<MorningWeatherFact|null>{
  try{
    const cached=await readCached(db,familyId,localDate);
    if(cached)return {summary:cached};
  }catch{return null;}

  const home=await db.prepare("SELECT latitude,longitude FROM family_location_places WHERE family_id=? AND kind='HOME' LIMIT 1").bind(familyId).first<Row>();
  const latitude=n(home?.latitude),longitude=n(home?.longitude);
  if(latitude===null||longitude===null)return null;

  const params=new URLSearchParams({
    latitude:String(latitude),
    longitude:String(longitude),
    daily:'weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max',
    timezone:timeZone,
    start_date:localDate,
    end_date:localDate,
  });
  const controller=new AbortController();
  const timeout=setTimeout(()=>controller.abort(),WEATHER_TIMEOUT_MS);
  try{
    const response=await fetch(`https://api.open-meteo.com/v1/forecast?${params.toString()}`,{signal:controller.signal,headers:{Accept:'application/json'}});
    if(!response.ok)return null;
    const data=await response.json() as any;
    if(String(data?.daily?.time?.[0]||'')!==localDate)return null;
    const code=n(data?.daily?.weather_code?.[0]);
    const high=rounded(n(data?.daily?.temperature_2m_max?.[0]));
    const low=rounded(n(data?.daily?.temperature_2m_min?.[0]));
    const rain=rounded(n(data?.daily?.precipitation_probability_max?.[0]));
    if(code===null||high===null||low===null)return null;
    const summary=`${weatherLabel(code)} ${low}〜${high}℃${rain===null?'':`／降水確率 ${rain}%`}`;
    const now=new Date().toISOString();
    await db.prepare(`INSERT OR IGNORE INTO line_daily_digest_weather_daily(family_id,local_date,summary,fetched_at) VALUES(?,?,?,?)`).bind(familyId,localDate,summary,now).run();
    return {summary:(await readCached(db,familyId,localDate))||summary};
  }catch{return null;}
  finally{clearTimeout(timeout);}
}
