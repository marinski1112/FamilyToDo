import fs from 'node:fs';

const source=fs.readFileSync('src/google-voice-inquiry-push.ts','utf8');
const must=(ok,msg)=>{if(!ok){console.error(msg);process.exit(1);}};

must(source.includes("import type { PushMessagePayload } from './webpush'"),'formatter must target the retained Web Push payload type');
must(source.includes('MAX_LINES = 8'),'inquiry push fan-out text must remain bounded');
must(source.includes('MAX_LINE_LENGTH = 120'),'individual inquiry lines must remain bounded');
must(source.includes('MAX_BODY_LENGTH = 500'),'inquiry push body must remain bounded');
must(/export function buildGoogleVoiceInquiryPush\(/.test(source),'typed inquiry push formatter export is required');
must(source.includes("url:'/app/today.php'")&&source.includes("url:'/app/tomorrow.php'")&&source.includes("url:'/app/shopping.php'"),'inquiry kinds must retain safe in-app destinations');
must(!/env\.DB|\.prepare\(|fetch\(|sendMemberWebPush\(|console\.|cookie|authorization|token|member_name|family_id|member_id/i.test(source),'formatter must remain side-effect free and must not read delivery scope or sensitive request/member data');
must(!/title\s*:\s*String\(|\bdescription\b|\bmemo\b|\bendpoint\b|\bp256dh\b|\bauth\b/i.test(source),'formatter must not manufacture or inspect sensitive transport/domain fields');

console.log('Google voice inquiry push contract: ok');
