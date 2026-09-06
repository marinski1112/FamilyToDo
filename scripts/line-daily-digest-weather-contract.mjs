import fs from 'node:fs';

const source=fs.readFileSync('src/line-daily-digest-weather.ts','utf8');
const digest=fs.readFileSync('src/line-daily-digest.ts','utf8');
const migration=fs.readFileSync('migrations/0062_line_daily_digest_weather_cache.sql','utf8');

for(const marker of [
  "const WEATHER_ENDPOINT='https://api.open-meteo.com/v1/forecast'",
  'const WEATHER_TIMEOUT_MS=2500',
  "INSERT OR IGNORE INTO line_daily_digest_weather_cache",
  "status='FAILED'",
  "kind='HOME'",
  'Math.round(lat*100)/100',
  'Math.round(lon*100)/100',
  "daily:'weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max'",
  'const controller=new AbortController()',
  'return null;',
])if(!source.includes(marker))throw new Error(`weather cost/privacy guard missing: ${marker}`);

if((source.match(/await fetch\(/g)||[]).length!==1)throw new Error('weather module must retain exactly one external fetch call site');
if(/console\.|latitude.*console|longitude.*console/.test(source))throw new Error('weather module must not log coordinates/provider payloads');
if(!migration.includes('PRIMARY KEY(family_id, local_date)'))throw new Error('weather cache must enforce one family/date claim');
if(!migration.includes("CHECK(status IN ('FETCHING','READY','FAILED'))"))throw new Error('weather cache status boundary missing');
for(const marker of [
  "import { formatMorningWeather, loadMorningWeatherFact, type MorningWeatherFact } from './line-daily-digest-weather'",
  'let weatherFact:MorningWeatherFact|null|undefined',
  'loadMorningWeatherFact(env.DB,Number(setting.family_id),localDate,timezone)',
  "lines.push('【今日の天気】',formatMorningWeather(weather))",
])if(!digest.includes(marker))throw new Error(`morning weather wiring missing: ${marker}`);

console.log('line-daily-digest-weather-contract: one claimed family/date fetch, coarse HOME coordinates, timeout/fail-open, no coordinate logging');
