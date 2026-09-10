import fs from 'node:fs';

const read=(path)=>fs.readFileSync(path,'utf8');
const policy=read('src/ai-model-policy.ts');
const rough=read('src/task-rough-input-api.ts');
const settings=read('src/settings-ai-diagnostics.ts');
const diagnostics=read('src/ai-generation-diagnostics.ts');

const assert=(ok,message)=>{if(!ok)throw new Error(message);};

assert(policy.includes("FAMILY_JOURNAL_GEMINI_MODEL='gemini-3.7-flash'"),'Family Journal must use Gemini 3.7 Flash');
assert(policy.includes("ROUGH_INPUT_GEMINI_MODEL_PRIMARY='gemini-3.5-flash-lite'"),'inventory must expose rough-input primary');
assert(policy.includes("ROUGH_INPUT_GEMINI_MODEL_FALLBACK='gemini-3.5-flash'"),'inventory must expose rough-input fallback');
assert(rough.includes("ROUGH_INPUT_GEMINI_MODEL_PRIMARY='gemini-3.5-flash-lite'"),'rough-input source primary changed without updating policy');
assert(rough.includes("ROUGH_INPUT_GEMINI_MODEL_FALLBACK='gemini-3.5-flash'"),'rough-input source fallback changed without updating policy');
assert(settings.includes('AIモデル利用状況'),'settings must render AI model inventory');
assert(settings.includes('model_usage:modelUsage'),'JSON diagnostics must expose safe model usage inventory');
assert(settings.includes('APIキー・prompt・response本文は表示しません'),'settings must state privacy boundary');
assert(diagnostics.includes("'FAMILY_DAILY_JOURNAL'"),'Family Journal must be an allowed AI diagnostic feature');
assert(!policy.includes('GEMINI_API_KEY'),'model policy must not access Gemini secret');

console.log('AI model usage visibility contract OK');
