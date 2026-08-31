import fs from 'node:fs';

const source=fs.readFileSync('src/google-voice-inquiry.ts','utf8');
const fail=(message)=>{console.error(`google voice inquiry foundation contract: ${message}`);process.exit(1);};
const must=(condition,message)=>{if(!condition)fail(message);};

for(const token of ["'TODAY_SCHEDULE'","'TOMORROW_SCHEDULE'","'OPEN_SHOPPING'","type:'INQUIRY'","delivery:'MEMBER_WEB_PUSH'"]){
  must(source.includes(token),`missing ${token}`);
}
for(const phrase of ['今日の予定','今日のタスク','今日の予定教えて','今日の予定を教えて','今日の予定を教えてください','今日のタスクを教えてください','今日の予定は','今日何する','明日の予定','明日の予定教えて','明日の予定を教えて','明日の予定を教えてください','明日のタスクを教えてください','明日の予定は','明日何する','買い物リスト','買うもの','買い物を教えてください','買い物リスト教えて','買い物リストを教えて','買い物リストを教えてください','買うものを教えてください','買い物リストは','買うものは','買い物何がある']){
  must(source.includes(phrase),`missing deterministic phrase ${phrase}`);
}
must(source.includes('const MAX_INQUIRY_INPUT_UNITS=256'),'parser must retain a small explicit input bound');
must(source.includes("typeof value==='string'&&value.length<=MAX_INQUIRY_INPUT_UNITS"),'oversized or non-string inputs must be rejected before normalization');
const bodyBound=source.indexOf('const raw=boundedInput(value);');
const bodyNormalize=source.indexOf('const body=normalize(raw);');
must(bodyBound>=0&&bodyNormalize>bodyBound,'body parser must apply its input bound before normalization');
const markedStart=source.indexOf('export function parseMarkedGoogleVoiceInquiryCommand');
const markedBound=source.indexOf('const raw=boundedInput(value);',markedStart);
const markedNormalize=source.indexOf("const normalized=raw.normalize('NFKC')",markedStart);
must(markedStart>=0&&markedBound>markedStart&&markedNormalize>markedBound,'marked parser must apply its input bound before NFKC normalization');
must(source.includes("normalize('NFKC')"),'parser must normalize NFKC input');
must(source.includes("replace(/[?？。！!]+$/,''"),'parser should tolerate trailing speech punctuation without broad substring matching');
must(/export function parseGoogleVoiceInquiryBody\(value:unknown\):GoogleVoiceInquiry\|null/.test(source),'typed side-effect-free body parser export is required');
must(/export function parseMarkedGoogleVoiceInquiryCommand\(value:unknown\):MarkedGoogleVoiceInquiryCommand\|null/.test(source),'typed marked-command adapter export is required');
must(source.includes("const marker=/^(?:FT|FAMILY ?TODO|ファミリー ?TODO)(?: *: *| |$)/i"),'marked adapter must accept only FT, FamilyToDo/Family TODO, or Japanese ファミリーTODO/ファミリー TODO explicit markers plus an optional normalized colon delimiter');
must(source.includes("return inquiry?{marked:true,...inquiry}:null"),'non-inquiry marked commands must fall through instead of shadowing existing command families');
must(source.includes('phrases.has(body)'),'inquiry matching must remain exact after normalization');
must(!/body\.includes\(|body\.startsWith\(|new RegExp\(/.test(source),'inquiry parser must not broaden into substring or dynamic-regex matching');
must(!/env\.DB|\.prepare\(|fetch\(|console\.|cookie|authorization|token|member_name|description/i.test(source),'parser foundation must remain side-effect free and must not handle sensitive request/member data');
must(!/location|latitude|longitude|gps/i.test(source),'location lifecycle must not start in inquiry foundation');

console.log('google voice inquiry foundation contract: bounded preprocessing, marker boundary, exact matching, polite phrases, privacy boundary ok');
