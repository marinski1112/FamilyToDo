import fs from 'node:fs';

const src=fs.readFileSync('src/google-voice-inquiry-runtime.ts','utf8');
const fail=(message)=>{console.error(message);process.exit(1);};

for(const required of [
  "parseMarkedGoogleVoiceInquiryCommand",
  "deliverGoogleVoiceInquiry",
  "GoogleVoiceInquiryLineResolver",
  "handled: false",
  "handled: true",
]) if(!src.includes(required)) fail(`missing runtime composition token: ${required}`);

for(const forbidden of [
  '.DB.',
  'prepare(',
  'SELECT ',
  'INSERT ',
  'UPDATE ',
  'DELETE ',
  'sendMemberWebPush',
  'fetch(',
]) if(src.includes(forbidden)) fail(`runtime composition must not duplicate domain/transport work: ${forbidden}`);

if(!/if \(!inquiry\) return \{ handled: false \};/.test(src)) fail('non-inquiry commands must fall through without side effects');
if(!/deliverGoogleVoiceInquiry\(env, familyId, memberId, inquiry, resolveLines\)/.test(src)) fail('member/family scoped delivery delegation missing');

console.log('google voice inquiry runtime contract: ok');
