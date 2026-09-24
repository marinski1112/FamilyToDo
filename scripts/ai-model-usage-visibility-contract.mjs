import fs from 'node:fs';

const read=(path)=>fs.readFileSync(path,'utf8');
const policy=read('src/ai-model-policy.ts');
const rough=read('src/task-rough-input-api.ts');
const routing=read('src/ai-model-routing.ts');
const settings=read('src/settings-ai-diagnostics.ts');

const assert=(ok,message)=>{if(!ok)throw new Error(message);};

assert(policy.includes("FAMILY_JOURNAL_GEMINI_MODEL='gemini-3.6-flash'"),'Family Journal defaults to Gemini 3.6 Flash');
assert(routing.includes("FAMILY_DAILY_JOURNAL:['gemini-3.6-flash','gemini-3.5-flash']"),'journal has a distinct model route');
assert(routing.includes("ROUGH_INPUT_GEMINI_MODEL_PRIMARY='gemini-3.5-flash-lite'"),'routing preserves the established primary default');
assert(routing.includes("ROUGH_INPUT_GEMINI_MODEL_FALLBACK='gemini-3.5-flash'"),'routing preserves the established fallback default');
assert(policy.includes('resolveFeatureModels(db,familyId,feature,audience)'),'inventory reads effective feature/audience configuration');
assert(rough.includes('resolveFeatureModels(env.DB,Number(member.family_id)'),'runtime shares the inventory resolver');
assert(settings.includes('AIモデル利用状況'),'settings must render AI model inventory');
assert(settings.includes('model_usage:modelUsage'),'JSON diagnostics must expose safe model usage inventory');
assert(settings.includes('APIキー・prompt・response本文は表示しません'),'settings must state privacy boundary');
assert(!policy.includes('GEMINI_API_KEY'),'model policy must not access Gemini secret');

console.log('AI model usage visibility contract OK');
