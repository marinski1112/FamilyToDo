import fs from 'node:fs';

const source=fs.readFileSync('src/google-voice-inquiry.ts','utf8');
const fail=(message)=>{console.error(`google voice inquiry foundation contract: ${message}`);process.exit(1);};
const must=(condition,message)=>{if(!condition)fail(message);};

for(const token of ["'TODAY_SCHEDULE'","'TOMORROW_SCHEDULE'","'OPEN_SHOPPING'","type:'INQUIRY'","delivery:'MEMBER_WEB_PUSH'"]){
  must(source.includes(token),`missing ${token}`);
}
for(const phrase of ['今日の予定','今日のタスク','今日の予定教えて','今日何する','明日の予定','明日の予定教えて','明日何する','買い物リスト','買うもの','買い物リスト教えて','買い物何がある']){
  must(source.includes(phrase),`missing deterministic phrase ${phrase}`);
}
must(source.includes("normalize('NFKC')"),'parser must normalize NFKC input');
must(source.includes("replace(/[?？。！!]+$/,''"),'parser should tolerate trailing speech punctuation without broad substring matching');
must(/export function parseGoogleVoiceInquiryBody\(value:unknown\):GoogleVoiceInquiry\|null/.test(source),'typed side-effect-free body parser export is required');
must(/export function parseMarkedGoogleVoiceInquiryCommand\(value:unknown\):MarkedGoogleVoiceInquiryCommand\|null/.test(source),'typed marked-command adapter export is required');
must(source.includes("const marker=/^(?:FT|FAMILY TODO|ファミリーTODO)(?: |$)/i"),'marked adapter must preserve the existing explicit Google voice marker boundary');
must(source.includes("return inquiry?{marked:true,...inquiry}:null"),'non-inquiry marked commands must fall through instead of shadowing existing command families');
must(source.includes('phrases.has(body)'),'inquiry matching must remain exact after normalization');
must(!/body\.includes\(|body\.startsWith\(|new RegExp\(/.test(source),'inquiry parser must not broaden into substring or dynamic-regex matching');
must(!/env\.DB|\.prepare\(|fetch\(|console\.|cookie|authorization|token|member_name|description/i.test(source),'parser foundation must remain side-effect free and must not handle sensitive request/member data');
must(!/location|latitude|longitude|gps/i.test(source),'location lifecycle must not start in inquiry foundation');

console.log('google voice inquiry foundation contract: ok');
