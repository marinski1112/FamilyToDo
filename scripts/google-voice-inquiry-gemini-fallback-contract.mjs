import assert from 'node:assert/strict';
import fs from 'node:fs';

const classifier=fs.readFileSync('src/google-voice-inquiry-gemini.ts','utf8');
const inquiry=fs.readFileSync('src/google-voice-inquiry.ts','utf8');
const runtime=fs.readFileSync('src/google-voice-inquiry-runtime.ts','utf8');
const taskAdapter=fs.readFileSync('src/google-tasks-inquiry-command.ts','utf8');

for(const kind of ['TODAY_SCHEDULE','TOMORROW_SCHEDULE','OPEN_SHOPPING']){
  assert.ok(classifier.includes(`'${kind}'`),`classifier must constrain output to existing ${kind} inquiry kind`);
}
assert.ok(classifier.includes("'NONE'"),'classifier must have an explicit fail-closed NONE option');
assert.match(classifier,/familyAiProvider\(env\)!=='GEMINI'/,'fallback must obey the configured Family AI provider and never silently bypass it');
assert.match(classifier,/!env\.GEMINI_API_KEY/,'fallback must fail closed when Gemini is not configured');
assert.match(classifier,/body\.length>256/,'fallback input must remain bounded');
assert.match(classifier,/resolveFamilyGeminiModel\(env\.DB,familyId,env\)/,'fallback must reuse the family-scoped selected Gemini model');
assert.match(classifier,/allowedFunctionNames:\[CLASSIFIER_FUNCTION\]/,'Gemini must be forced through the single bounded classifier function');
assert.match(classifier,/ALLOWED_KINDS\.has\(kind\)/,'upstream output must be revalidated against the local inquiry enum');
assert.ok(!/console\.|latitude|longitude|gps|authorization|cookie|refresh_token/i.test(classifier),'fallback must not log or handle unrelated sensitive/location data');

assert.match(inquiry,/export function isDeterministicGoogleVoiceWriteBody\(value:unknown\):boolean/,'inquiry boundary must expose a side-effect-free deterministic write-family guard');
for(const family of ['買い物','タスク','TODO','成長日記','ミルク','おしっこ','うんち','離乳食','お風呂','吐いた','体温']){
  assert.ok(inquiry.includes(family),`deterministic write-family guard must recognize ${family}`);
}

const deterministic=runtime.indexOf('parseMarkedGoogleVoiceInquiryCommand(value)');
const writeGuard=runtime.indexOf('isDeterministicGoogleVoiceWriteBody(body)');
const fallback=runtime.indexOf('classifyMarkedGoogleVoiceInquiryWithGemini(env, familyId, body)');
assert.ok(deterministic>=0&&writeGuard>deterministic&&fallback>writeGuard,'deterministic inquiry parsing and deterministic write-family bypass must both run before Gemini fallback');
assert.match(runtime,/if \(body === null\) return \{ handled: false \};/,'unmarked input must fall through before Gemini fallback');
assert.match(runtime,/if \(isDeterministicGoogleVoiceWriteBody\(body\)\) return \{ handled: false \};/,'known deterministic write families must fall through before Gemini fallback');
assert.match(taskAdapter,/extractMarkedGoogleVoiceInquiryBody\(item\.title\) === null/,'Google Tasks adapter must admit marked deterministic misses without admitting unmarked tasks');

console.log('google voice inquiry Gemini fallback contract: marked-only, deterministic inquiry first, deterministic writes bypass AI, family-scoped model, strict enum classification, privacy-safe fail-closed behavior ok');
