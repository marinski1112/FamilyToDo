import fs from 'node:fs';

const source=fs.readFileSync('src/google-voice-inquiry-push.ts','utf8');
const must=(ok,msg)=>{if(!ok){console.error(msg);process.exit(1);}};

must(source.includes("import type { PushMessagePayload } from './webpush'"),'formatter must target the retained Web Push payload type');
must(source.includes('MAX_LINES = 8'),'inquiry push fan-out text must remain bounded');
must(source.includes('MAX_SOURCE_LINES = 32'),'inquiry push resolver preprocessing must remain bounded before normalization');
must(source.includes('MAX_LINE_LENGTH = 120'),'individual inquiry lines must remain bounded');
must(source.includes('MAX_BODY_LENGTH = 500'),'inquiry push body must remain bounded');
must(/export function buildGoogleVoiceInquiryPush\(/.test(source),'typed inquiry push formatter export is required');
must(source.includes("url:'/today.php'")&&source.includes("url:'/tomorrow.php'")&&source.includes("url:'/app/shopping.php'"),'inquiry kinds must target registered safe in-app destinations');
must(/function boundedCleanLines\(lines:readonly string\[\]\):\{cleaned:string\[\];omitted:number\}/.test(source),'bounded resolver normalization helper is required');
must(/const inspected=lines\.slice\(0,MAX_SOURCE_LINES\);[\s\S]*?const normalized=inspected\.map\(cleanLine\)\.filter\(Boolean\);/.test(source),'resolver rows must be sliced to the source cap before normalization');
must(!/input\.lines\.map\(cleanLine\)/.test(source),'formatter must not normalize an unbounded resolver result directly');
must(/const prefix=`\$\{index\+1\}\. `;[\s\S]*?truncateUnicodeSafe\(line,Math\.max\(0,MAX_LINE_LENGTH-prefix\.length\)\)/.test(source),'numbered inquiry lines must reserve prefix space inside the per-line limit and truncate safely');
must(/function truncateUnicodeSafe\(value:string,maxLength:number\):string/.test(source),'Unicode-safe bounded truncation helper is required');
must(/last>=0xD800&&last<=0xDBFF&&next>=0xDC00&&next<=0xDFFF/.test(source),'truncation must detect and avoid splitting a UTF-16 surrogate pair');
must(/truncateUnicodeSafe\(body,MAX_BODY_LENGTH-1\)\.trimEnd\(\)\+'…'/.test(source),'whole-body truncation must also use the Unicode-safe helper');
must(!/line\.slice\(0,Math\.max\(0,MAX_LINE_LENGTH-prefix\.length\)\)/.test(source),'per-line truncation must not regress to raw UTF-16 slicing');
must(!/body\.slice\(0,MAX_BODY_LENGTH-1\)/.test(source),'whole-body truncation must not regress to raw UTF-16 slicing');
must(!/env\.DB|\.prepare\(|fetch\(|sendMemberWebPush\(|console\.|cookie|authorization|token|member_name|family_id|member_id/i.test(source),'formatter must remain side-effect free and must not read delivery scope or sensitive request/member data');
must(!/title\s*:\s*String\(|\bdescription\b|\bmemo\b|\bendpoint\b|\bp256dh\b|\bauth\b/i.test(source),'formatter must not manufacture or inspect sensitive transport/domain fields');

console.log('Google voice inquiry push contract: registered routes, bounded source preprocessing, bounded Unicode-safe output, privacy boundary ok');
