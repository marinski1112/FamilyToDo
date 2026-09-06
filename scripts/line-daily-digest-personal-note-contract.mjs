import fs from 'node:fs';

const digest=fs.readFileSync('src/line-daily-digest.ts','utf8');
const weather=fs.readFileSync('src/line-daily-digest-weather.ts','utf8');
const weatherMigration=fs.readFileSync('migrations/0062_line_daily_digest_weather_cache.sql','utf8');

for(const marker of [
  "type Frame={opener:string;closing:string;personalNote?:string}",
  'MAX_MORNING_PERSONAL_NOTE_OPTIONS=4',
  'MAX_MORNING_PERSONAL_NOTE_CHARS=90',
  'function morningPersonalNoteOptions(profiles:FamilyAiSafeProfileContext[],localDate:string)',
  "profiles.map(profile=>clean(profile.display_name,24)).filter(Boolean).slice(0,3)",
  'morningVariant(localDate,5,generic.length)',
  'profile.personality_note',
  'profiles=await loadSafeFamilyAiProfileContext(env.DB,familyId,localDate)',
  'const noteOptions=morningPersonalNoteOptions(profiles,localDate)',
  'const hasMemo=profiles.some(profile=>Boolean(clean(profile.personality_note,300)))',
  'local_date=${localDate} を表現の変化のseedとして使い',
  'personality_noteに実際に書かれている内容だけを軽い話題のきっかけにし',
  'const generatedNote=hasMemo?clean(parsed?.note,MAX_MORNING_PERSONAL_NOTE_CHARS)',
  "if(frame.personalNote)lines.push('【今日の雑談】'",
  'function buildEvidencePraise(payload:DigestFactPayload):string[]',
  'payload.familyLog.previous.length',
  'payload.today.completed>0',
  "payload.today.bringItems.filter(item=>item.startsWith('✓ ')).length",
  'return praise.slice(0,2)',
  "if(praise.length)lines.push('【昨日からのいいところ】',...praise.map(x=>`👏 ${x}`))",
  "import { loadMorningWeather } from './line-daily-digest-weather';",
  "if(payload.weather)lines.push('【今日の天気】'",
  'await loadMorningWeather(env.DB,Number(setting.family_id),localDate,timezone)',
])if(!digest.includes(marker))throw new Error(`morning personal note/praise/weather marker missing: ${marker}`);

if((digest.match(/geminiFetch\(env,model,body\)/g)||[]).length!==1)throw new Error('morning digest must retain one Gemini call site');
if(/chooseFrame\([^)]*facts|chooseFrame\([^)]*payload/.test(digest))throw new Error('recipient-specific deterministic facts must not be sent into the shared family frame/note selector');
if(!digest.includes("if(tone==='PLAIN'||familyAiProvider(env)!=='GEMINI'||!env.GEMINI_API_KEY||!morningDigestAiEnabled(env))return options[0]"))throw new Error('PLAIN/provider/config deterministic bypass must remain intact');
if(!digest.includes('Optional personalization context must never block the deterministic morning digest'))throw new Error('profile lookup failure must remain non-blocking');
if(!digest.includes('血液型・性別/ジェンダー・出生情報は根拠に使わないでください'))throw new Error('sensitive-attribute anti-inference prompt guard missing');
if(!digest.includes('決定論的な予定・記録の事実は変更しません'))throw new Error('deterministic fact authority guard missing');
if(/buildEvidencePraise[\s\S]{0,1800}(geminiFetch|fetch\(|Routes|Maps)/.test(digest))throw new Error('evidence praise must remain deterministic and local');

for(const marker of [
  'const WEATHER_TIMEOUT_MS=2500',
  "SELECT summary FROM line_daily_digest_weather_daily WHERE family_id=? AND local_date=?",
  "kind='HOME'",
  'https://api.open-meteo.com/v1/forecast?',
  "daily:'weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max'",
  'start_date:localDate',
  'end_date:localDate',
  'INSERT OR IGNORE INTO line_daily_digest_weather_daily',
  'catch{return null;}',
])if(!weather.includes(marker))throw new Error(`morning weather bounded-cache marker missing: ${marker}`);
if((weather.match(/await fetch\(/g)||[]).length!==1)throw new Error('morning weather must have exactly one live fetch call site');
if(/console\.|Routes|generativelanguage|gemini/i.test(weather))throw new Error('morning weather helper must not log location data or call paid AI/Routes');
for(const marker of [
  'CREATE TABLE IF NOT EXISTS line_daily_digest_weather_daily',
  'PRIMARY KEY(family_id, local_date)',
  'summary TEXT NOT NULL',
  'FOREIGN KEY(family_id) REFERENCES families(id) ON DELETE CASCADE',
])if(!weatherMigration.includes(marker))throw new Error(`morning weather cache schema missing: ${marker}`);
if(/latitude|longitude/i.test(weatherMigration))throw new Error('morning weather cache must not persist HOME coordinates');

console.log('line-daily-digest-personal-note-contract: memo-guided daily chat is bounded; weather is HOME-derived, once-per-day cached, timeout-bounded, and never logs/persists coordinates');
