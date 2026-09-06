import fs from 'node:fs';

const digest=fs.readFileSync('src/line-daily-digest.ts','utf8');

for(const marker of [
  "type Frame={opener:string;closing:string;personalNote?:string}",
  'MAX_MORNING_PERSONAL_NOTE_OPTIONS=4',
  'function morningPersonalNoteOptions(profiles:FamilyAiSafeProfileContext[])',
  "profiles.map(profile=>clean(profile.display_name,24)).filter(Boolean).slice(0,3)",
  "options=['今日も家族それぞれのペースで、できることからひとつずつ。']",
  'return options.slice(0,MAX_MORNING_PERSONAL_NOTE_OPTIONS)',
  'profiles=await loadSafeFamilyAiProfileContext(env.DB,familyId,localDate)',
  'const noteOptions=morningPersonalNoteOptions(profiles)',
  'note_candidates=${JSON.stringify(noteOptions)}',
  '自由文は生成しないでください',
  'noteは必ず提示された候補のindexだけを選び、候補本文を書き換えないでください',
  'const parsed=JSON.parse(text),oi=Number(parsed?.opener),ci=Number(parsed?.closing),ni=Number(parsed?.note)',
  'const personalNote=Number.isInteger(ni)&&noteOptions[ni]?noteOptions[ni]:noteOptions[0]',
  "if(frame.personalNote)lines.push('【家族のひとこと】",
])if(!digest.includes(marker))throw new Error(`morning personal note marker missing: ${marker}`);

if((digest.match(/geminiFetch\(env,model,body\)/g)||[]).length!==1)throw new Error('morning digest must retain one Gemini call site');
if(/chooseFrame\([^)]*facts|chooseFrame\([^)]*payload/.test(digest))throw new Error('recipient-specific deterministic facts must not be sent into the shared family frame/note selector');
if(!digest.includes("if(tone==='PLAIN'||familyAiProvider(env)!=='GEMINI'||!env.GEMINI_API_KEY||!morningDigestAiEnabled(env))return options[0]"))throw new Error('PLAIN/provider/config deterministic bypass must remain intact');
if(!digest.includes('Optional personalization context must never block the deterministic morning digest'))throw new Error('profile lookup failure must remain non-blocking');
if(!digest.includes("血液型・性別/ジェンダー・出身地を、性格・健康・能力その他の因果根拠として扱わないでください"))throw new Error('sensitive-attribute anti-inference prompt guard missing');
if(!digest.includes('決定論的な予定・記録の事実を変更しないでください'))throw new Error('deterministic fact authority guard missing');

console.log('line-daily-digest-personal-note-contract: predefined-note index selection only; no recipient facts enter shared AI selector; deterministic fallback preserved');
