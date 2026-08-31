import fs from 'node:fs';

const source=fs.readFileSync('src/google-voice-inquiry-runtime.ts','utf8');
const fail=(message)=>{console.error(`google voice inquiry runtime contract: ${message}`);process.exit(1);};
const must=(condition,message)=>{if(!condition)fail(message);};

must(/const MAX_INQUIRY_ROWS = 9/.test(source),'runtime query row count must remain bounded');
must((source.match(/LIMIT \?/g)||[]).length===2,'both schedule and shopping reads must use parameterized limits');
must(/t\.family_id=\?/.test(source),'schedule reads must remain tenant-scoped');
must(/s\.family_id=\?/.test(source),'shopping reads must remain tenant-scoped');
must(/t\.visibility_scope='PRIVATE' AND t\.private_owner_id=\?/.test(source),'schedule PRIVATE visibility must stay owner-scoped');
must(/t\.visibility_scope,'/.test(source)&&/t\.private_owner_id=\?/.test(source),'shopping parent-task privacy must stay explicit');
must(/s\.task_id IS NULL/.test(source),'standalone shopping items must remain eligible');
must(/sendMemberWebPush\(env, identity\.familyId, identity\.memberId, payload\)/.test(source),'delivery must stay member+family scoped');
must(!/sendWebPush\(/.test(source),'runtime must not bypass member-scoped delivery');
must(!/SELECT \*/i.test(source),'runtime must select only fields required for the response');
must(!/console\.(?:log|warn|error)/.test(source),'inquiry contents must not be logged');
must(!/member_name|line_user_id|cookie|authorization|refresh_token|p256dh|endpoint/i.test(source),'runtime must not read identity/token/subscription secrets directly');
must(/buildGoogleVoiceInquiryPush/.test(source),'runtime must reuse the bounded inquiry formatter');
must(/TODAY_SCHEDULE/.test(source)&&/TOMORROW_SCHEDULE/.test(source),'schedule inquiry kinds must be explicit');

console.log('google voice inquiry runtime contract: bounded tenant/private-scoped member delivery ok');
