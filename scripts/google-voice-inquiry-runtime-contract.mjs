import fs from 'node:fs';

const src=fs.readFileSync('src/google-voice-inquiry-runtime.ts','utf8');
const fail=(message)=>{console.error(message);process.exit(1);};

for(const required of [
  "parseMarkedGoogleVoiceInquiryCommand",
  "extractMarkedGoogleVoiceInquiryBody",
  "classifyMarkedGoogleVoiceInquiryWithGemini",
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

if(!/let inquiry = parseMarkedGoogleVoiceInquiryCommand\(value\)/.test(src)) fail('deterministic inquiry parsing must remain first');
if(!/const body = extractMarkedGoogleVoiceInquiryBody\(value\)/.test(src)) fail('fallback must reuse bounded explicit marker extraction');
if(!/if \(body === null\) return \{ handled: false \};/.test(src)) fail('unmarked commands must fall through without AI or delivery');
if(!/inquiry = await classifyMarkedGoogleVoiceInquiryWithGemini\(env, familyId, body\)/.test(src)) fail('marked deterministic misses must delegate to the bounded Gemini classifier');
if(!/if \(!inquiry\) return \{ handled: false \};/.test(src)) fail('ambiguous or unavailable fallback must fail closed');
if(!/deliverGoogleVoiceInquiry\(env, familyId, memberId, inquiry, resolveLines\)/.test(src)) fail('member/family scoped delivery delegation missing');

console.log('google voice inquiry runtime contract: deterministic first, marked-only Gemini fallback, fail-closed classification, scoped delivery ok');
