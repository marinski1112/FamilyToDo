import fs from 'node:fs';

const source=fs.readFileSync('src/google-voice-inquiry.ts','utf8');
const fail=(message)=>{console.error(`google voice inquiry foundation contract: ${message}`);process.exit(1);};
const must=(condition,message)=>{if(!condition)fail(message);};

for(const token of ["'TODAY_SCHEDULE'","'TOMORROW_SCHEDULE'","'OPEN_SHOPPING'","type:'INQUIRY'","delivery:'MEMBER_WEB_PUSH'"]){
  must(source.includes(token),`missing ${token}`);
}
for(const phrase of ['今日の予定','今日のタスク','明日の予定','買い物リスト','買うもの']){
  must(source.includes(phrase),`missing deterministic phrase ${phrase}`);
}
must(source.includes("normalize('NFKC')"),'parser must normalize NFKC input');
must(/export function parseGoogleVoiceInquiryBody\(value:unknown\):GoogleVoiceInquiry\|null/.test(source),'typed side-effect-free parser export is required');
must(!/env\.DB|\.prepare\(|fetch\(|console\.|cookie|authorization|token|member_name|description/i.test(source),'parser foundation must remain side-effect free and must not handle sensitive request/member data');
must(!/location|latitude|longitude|gps/i.test(source),'location lifecycle must not start in inquiry foundation');

console.log('google voice inquiry foundation contract: ok');
