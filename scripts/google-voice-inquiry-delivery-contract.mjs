import fs from 'node:fs';

const source=fs.readFileSync('src/google-voice-inquiry-delivery.ts','utf8');
const fail=(message)=>{console.error(`google voice inquiry delivery contract: ${message}`);process.exit(1);};
const must=(condition,message)=>{if(!condition)fail(message);};

must(/buildGoogleVoiceInquiryPush/.test(source),'delivery must reuse the bounded inquiry push formatter');
must(/sendMemberWebPush/.test(source),'delivery must reuse the existing member-scoped Web Push transport');
must(/sendMemberWebPush\(env, familyId, memberId, payload\)/.test(source),'delivery must preserve the exact resolved family/member scope');
must(/Number\.isSafeInteger\(familyId\)/.test(source)&&/Number\.isSafeInteger\(memberId\)/.test(source),'tenant/member identifiers must be validated before delivery');
must(/inquiry\.delivery !== 'MEMBER_WEB_PUSH'/.test(source),'delivery mode must remain explicitly member scoped');
must(/const lines = await resolveLines\(inquiry\.kind\)/.test(source),'domain resolution must stay injected so canonical visibility/recurrence semantics can be reused by runtime wiring');
must(!/\.DB\.prepare|env\.DB|\bfetch\s*\(/.test(source),'adapter must not introduce independent domain/network reads');
must(!/\bsendWebPush\s*\(/.test(source),'adapter must never bypass member-scoped transport');
for(const forbidden of ['endpoint','p256dh','auth','cookie','authorization','token','member_name','family_name','line_user_id']){
  must(!new RegExp(`\\b${forbidden}\\b`,'i').test(source),`delivery adapter must not handle sensitive transport/content field ${forbidden}`);
}
must(!/console\.(?:log|warn|error)/.test(source),'inquiry content must not be logged by the delivery adapter');

console.log('google voice inquiry delivery contract: privacy-scoped composable delivery ok');
