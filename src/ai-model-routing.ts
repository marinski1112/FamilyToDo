// Runtime model settings contain IDs only. Request budgets and output validation
// remain owned by each feature; reading this policy never calls a provider.
export const ROUGH_INPUT_GEMINI_MODEL_PRIMARY='gemini-3.5-flash-lite';
export const ROUGH_INPUT_GEMINI_MODEL_FALLBACK='gemini-3.5-flash';
export const ROUTED_AI_FEATURES=['ROUGH_INPUT','MESSAGE_DRAFT','FAMILY_DAILY_JOURNAL','MORNING_DIGEST','PERIODIC_DIGEST','GOOGLE_VOICE_INQUIRY','CALENDAR_ICS_IMPORT'] as const;
export type RoutedAiFeature=typeof ROUTED_AI_FEATURES[number];
export type AiAudience='OWNER'|'MEMBER';
export const aiAudience=(role:unknown):AiAudience=>String(role||'').toUpperCase()==='OWNER'?'OWNER':'MEMBER';
export const routeSettingKey=(feature:RoutedAiFeature,audience:AiAudience)=>`ai_model_route_v1_${feature}_${audience}`;
export const validRouteModel=(model:unknown):model is string=>typeof model==='string'&&/^gemini-[a-z0-9._-]{1,110}$/i.test(model);
export function parseRouteModels(raw:unknown):string[]|null{
  try{
    const value=typeof raw==='string'?JSON.parse(raw):raw;
    if(!Array.isArray(value)||value.length<1||value.length>2||!value.every(validRouteModel))return null;
    return [...new Set(value)];
  }catch{return null;}
}
export async function resolveFeatureModels(db:D1Database,familyId:number,feature:RoutedAiFeature,role:unknown):Promise<{models:string[];source:'FAMILY_SETTING'|'FEATURE_DEFAULT';audience:AiAudience}>{
  if(!Number.isSafeInteger(familyId)||familyId<=0||!ROUTED_AI_FEATURES.includes(feature))throw new Error('Invalid model route scope');
  const audience=aiAudience(role);
  const row=await db.prepare('SELECT setting_value FROM family_settings WHERE family_id=? AND setting_key=?').bind(familyId,routeSettingKey(feature,audience)).first<{setting_value:string}>();
  const configured=parseRouteModels(row?.setting_value);
  const defaults:Record<RoutedAiFeature,string[]>={ROUGH_INPUT:[ROUGH_INPUT_GEMINI_MODEL_PRIMARY,ROUGH_INPUT_GEMINI_MODEL_FALLBACK],MESSAGE_DRAFT:[ROUGH_INPUT_GEMINI_MODEL_PRIMARY,ROUGH_INPUT_GEMINI_MODEL_FALLBACK],FAMILY_DAILY_JOURNAL:['gemini-3.6-flash','gemini-3.5-flash'],MORNING_DIGEST:['gemini-3.8-flash','gemini-3.5-flash'],PERIODIC_DIGEST:['gemini-3.8-flash','gemini-3.5-flash'],GOOGLE_VOICE_INQUIRY:['gemini-3.1-flash-lite'],CALENDAR_ICS_IMPORT:['gemini-3.1-flash-lite']};
  return {models:configured||defaults[feature],source:configured?'FAMILY_SETTING':'FEATURE_DEFAULT',audience};
}
