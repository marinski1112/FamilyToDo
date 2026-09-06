import fs from 'node:fs';

const digest=fs.readFileSync('src/line-daily-digest.ts','utf8');

for(const marker of [
  "type Frame={opener:string;closing:string;personalNote?:string}",
  'MAX_MORNING_PERSONAL_NOTE_OPTIONS=4',
  'function morningPersonalNoteOptions(profiles:FamilyAiSafeProfileContext[],localDate:string)',
  'profile.personality_note',
  'morningVariant(localDate,53,memoProfiles.length)',
  "clean(profile.personality_note,72)",
  'return options.slice(0,MAX_MORNING_PERSONAL_NOTE_OPTIONS)',
  'profiles=await loadSafeFamilyAiProfileContext(env.DB,familyId,localDate)',
  'const noteOptions=morningPersonalNoteOptions(profiles,localDate)',
  'const fallbackFrame:Frame={...options[0],personalNote:noteOptions[0]}',
  'note_candidates=${JSON.stringify(noteOptions)}',
  '自由文は生成しないでください',
  'noteは必ず提示された候補のindexだけを選び、候補本文を書き換えないでください',
  'const parsed=JSON.parse(text),oi=Number(parsed?.opener),ci=Number(parsed?.closing),ni=Number(parsed?.note)',
  'const personalNote=Number.isInteger(ni)&&noteOptions[ni]?noteOptions[ni]:noteOptions[0]',
  "if(frame.personalNote)lines.push('【家族のひとこと】",
  'function buildPreviousFamilyRecap(payload:DigestFactPayload):string[]',
  'const hasLocationRecord=payload.location.previous.length>0',
  "if(recap.length)lines.push('【昨日の家族まとめ】'",
  'function buildEvidencePraise(payload:DigestFactPayload):string[]',
  'payload.familyLog.previous.length',
  'payload.today.completed>0',
  "payload.today.bringItems.filter(item=>item.startsWith('✓ ')).length",
  'payload.location.previous.length&&praise.length<3',
  'return praise.slice(0,3)',
  "if(praise.length)lines.push('【昨日からのいいところ】',...praise.map(x=>`👏 ${x}`))",
])if(!digest.includes(marker))throw new Error(`morning personal note/recap/praise marker missing: ${marker}`);

if((digest.match(/geminiFetch\(env,model,body\)/g)||[]).length!==1)throw new Error('morning digest must retain one Gemini call site');
if(/chooseFrame\([^)]*facts|chooseFrame\([^)]*payload/.test(digest))throw new Error('recipient-specific deterministic facts must not be sent into the shared family frame/note selector');
if(!digest.includes("if(tone==='PLAIN')return options[0]"))throw new Error('PLAIN deterministic bypass must remain intact');
if(!digest.includes("if(familyAiProvider(env)!=='GEMINI'||!env.GEMINI_API_KEY||!morningDigestAiEnabled(env))return fallbackFrame"))throw new Error('provider/config bypass must retain memo-aware deterministic fallback');
if(!digest.includes('Optional personalization context must never block the deterministic morning digest'))throw new Error('profile lookup failure must remain non-blocking');
if(!digest.includes("血液型・性別/ジェンダー・出身地を、性格・健康・能力その他の因果根拠として扱わないでください"))throw new Error('sensitive-attribute anti-inference prompt guard missing');
if(!digest.includes('決定論的な予定・記録の事実を変更しないでください'))throw new Error('deterministic fact authority guard missing');
const recapStart=digest.indexOf('function buildPreviousFamilyRecap('),recapEnd=digest.indexOf('\nfunction buildEvidencePraise(',recapStart);
const recapBody=recapStart>=0&&recapEnd>recapStart?digest.slice(recapStart,recapEnd):'';
if(!recapBody||/(geminiFetch|fetch\(|Routes|Maps|latitude|longitude)/.test(recapBody))throw new Error('previous family recap must remain deterministic, privacy-safe and local');
if(/みんなそれぞれ動|家族みんな.*場所|全員.*移動/.test(recapBody))throw new Error('location-record presence must not be inflated into family-wide movement claims');
const praiseStart=digest.indexOf('function buildEvidencePraise('),praiseEnd=digest.indexOf('\nfunction fitMorningDigest(',praiseStart);
const praiseBody=praiseStart>=0&&praiseEnd>praiseStart?digest.slice(praiseStart,praiseEnd):'';
if(!praiseBody||/(geminiFetch|fetch\(|Routes|Maps)/.test(praiseBody))throw new Error('evidence praise must remain deterministic and local');
const noteStart=digest.indexOf('function morningPersonalNoteOptions('),noteEnd=digest.indexOf('\nfunction persistedMorningFrame(',noteStart);
const noteBody=noteStart>=0&&noteEnd>noteStart?digest.slice(noteStart,noteEnd):'';
if(!noteBody||/(geminiFetch|fetch\(|Routes|Maps)/.test(noteBody))throw new Error('memo-guided note candidates must remain deterministic and local');
const renderStart=digest.indexOf('function renderDeterministicFacts('),renderEnd=digest.indexOf('\nexport async function processLineDailyDigests(',renderStart);
const renderBody=renderStart>=0&&renderEnd>renderStart?digest.slice(renderStart,renderEnd):'';
for(const authoritative of ['【今日の記録】','【今日の予定】','【今日のタスク】','【今日のヒント】']){
  if(renderBody.indexOf(authoritative)<0||renderBody.indexOf(authoritative)>renderBody.indexOf('【昨日の家族まとめ】'))throw new Error(`authoritative section must stay ahead of optional recap: ${authoritative}`);
}

await import('./line-daily-digest-weather-contract.mjs');
console.log('line-daily-digest-personal-note-contract: memo candidates vary by date; authoritative facts precede optional recap/praise; location presence claims stay conservative; AI selects indexes only');
