import fs from 'node:fs';

const digest=fs.readFileSync('src/line-daily-digest.ts','utf8');

for(const marker of [
  "type Frame={opener:string;closing:string;personalNote?:string}",
  'MAX_MORNING_PERSONAL_NOTE_OPTIONS=4',
  'function morningPersonalNoteOptions(profiles:FamilyAiSafeProfileContext[],localDate:string)',
  'profile.personality_note',
  'const focusProfiles=memoProfiles.length?memoProfiles:profiles',
  'morningVariant(localDate,53,focusProfiles.length)',
  "const who=focusName||'家族みんな'",
  'return themedVariants.map((variants,index)=>variants[morningVariant(localDate,71+index,variants.length)]).slice(0,MAX_MORNING_PERSONAL_NOTE_OPTIONS)',
  'profiles=await loadSafeFamilyAiProfileContext(env.DB,familyId,localDate)',
  'const noteOptions=morningPersonalNoteOptions(profiles,localDate)',
  'const fallbackFrame:Frame={...options[0],personalNote:noteOptions[0]}',
  'function persistedMorningFrame(raw:string|null,options:Frame[],noteOptions:string[])',
  'if(personalNote&&!noteOptions.includes(personalNote))return null',
  'persistedMorningFrame(persisted,options,noteOptions)',
  'note_candidates=${JSON.stringify(noteOptions)}',
  '自由文は生成しないでください',
  'personality_noteは、どの候補が自然かを選ぶためだけの内部判断材料です',
  '内容をそのまま引用・転記・要約・列挙して表示しないでください',
  '候補本文にないプロフィール属性を追加・説明しないでください',
  'noteは必ず提示された候補のindexだけを選び、候補本文を書き換えないでください',
  'const parsed=JSON.parse(text),oi=Number(parsed?.opener),ci=Number(parsed?.closing),ni=Number(parsed?.note)',
  'const personalNote=Number.isInteger(ni)&&noteOptions[ni]?noteOptions[ni]:noteOptions[0]',
  "if(frame.personalNote)lines.push('【家族のひとこと】",
  'function buildEvidencePraise(payload:DigestFactPayload):string[]',
  'payload.familyLog.previous.length',
  'payload.today.completed>0',
  "payload.today.bringItems.filter(item=>item.startsWith('✓ ')).length",
  'return praise.slice(0,2)',
  "if(praise.length)lines.push('【昨日からのいいところ】',...praise.map(x=>`👏 ${x}`))",
])if(!digest.includes(marker))throw new Error(`morning personal note/praise marker missing: ${marker}`);

if((digest.match(/geminiFetch\(env,model,body\)/g)||[]).length!==1)throw new Error('morning digest must retain one Gemini call site');
if(/chooseFrame\([^)]*facts|chooseFrame\([^)]*payload/.test(digest))throw new Error('recipient-specific deterministic facts must not be sent into the shared family frame/note selector');
if(!digest.includes("if(tone==='PLAIN')return options[0]"))throw new Error('PLAIN deterministic bypass must remain intact');
if(!digest.includes("if(familyAiProvider(env)!=='GEMINI'||!env.GEMINI_API_KEY||!morningDigestAiEnabled(env))return fallbackFrame"))throw new Error('provider/config bypass must retain memo-aware deterministic fallback');
if(!digest.includes('Optional personalization context must never block the deterministic morning digest'))throw new Error('profile lookup failure must remain non-blocking');
if(!digest.includes("血液型・性別/ジェンダー・出身地を、性格・健康・能力その他の因果根拠として扱わないでください"))throw new Error('sensitive-attribute anti-inference prompt guard missing');
if(!digest.includes('決定論的な予定・記録の事実を変更しないでください'))throw new Error('deterministic fact authority guard missing');

const praiseStart=digest.indexOf('function buildEvidencePraise('),praiseEnd=digest.indexOf('\nfunction fitMorningDigest(',praiseStart);
const praiseBody=praiseStart>=0&&praiseEnd>praiseStart?digest.slice(praiseStart,praiseEnd):'';
if(!praiseBody||/(geminiFetch|fetch\(|Routes|Maps)/.test(praiseBody))throw new Error('evidence praise must remain deterministic and local');

const noteStart=digest.indexOf('function morningPersonalNoteOptions('),noteEnd=digest.indexOf('\nfunction persistedMorningFrame(',noteStart);
const noteBody=noteStart>=0&&noteEnd>noteStart?digest.slice(noteStart,noteEnd):'';
if(!noteBody||/(geminiFetch|fetch\(|Routes|Maps)/.test(noteBody))throw new Error('memo-guided note candidates must remain deterministic and local');
if(/\$\{\s*(?:memo|profile\.personality_note)\s*\}/.test(noteBody))throw new Error('raw personality memo must never be interpolated into visible morning note candidates');
if(/家族メモから|のメモには|というメモから/.test(noteBody))throw new Error('morning note candidates must not announce or quote the stored memo');
if(!/const memoProfiles=profiles\.filter\(profile=>clean\(profile\.personality_note,72\)\)/.test(noteBody))throw new Error('consented personality memo must remain available only as hidden candidate-selection context');

const frameStart=digest.indexOf('function persistedMorningFrame('),frameEnd=digest.indexOf('\nasync function finalizeFrameSafely(',frameStart);
const persistedBody=frameStart>=0&&frameEnd>frameStart?digest.slice(frameStart,frameEnd):'';
if(!persistedBody.includes('noteOptions.includes(personalNote)'))throw new Error('stale persisted raw-memo notes must be rejected after candidate policy changes');

await import('./line-daily-digest-weather-contract.mjs');
console.log('line-daily-digest-personal-note-contract: consented memo stays hidden context; AI selects bounded date-varied non-quoting candidates; deterministic fallback remains useful');
