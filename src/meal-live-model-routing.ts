/** Design target only. Live transport/session issuance is deliberately not enabled. */
export const MEAL_LIVE_MODELS=['gemini-3.8-live'] as const;
export type MealLiveModel=typeof MEAL_LIVE_MODELS[number];
export type MealLiveRoute={transport:'LIVE';model:MealLiveModel;source:'FAMILY_SETTING'|'DESIGN_DEFAULT';availability:'UNVERIFIED'};
export const mealLiveSettingKey=(audience:'OWNER'|'MEMBER')=>`ai_live_route_v1_MEAL_COOKING_LIVE_${audience}`;
export function parseMealLiveModel(raw:unknown):MealLiveModel|null{
 return typeof raw==='string'&&(MEAL_LIVE_MODELS as readonly string[]).includes(raw)?raw as MealLiveModel:null;
}
export async function resolveMealLiveRoute(db:D1Database,familyId:number,role:unknown):Promise<MealLiveRoute>{
 if(!Number.isSafeInteger(familyId)||familyId<=0)throw new Error('Invalid model route scope');
 const audience=String(role||'').toUpperCase()==='OWNER'?'OWNER':'MEMBER';
 const row=await db.prepare('SELECT setting_value FROM family_settings WHERE family_id=? AND setting_key=?').bind(familyId,mealLiveSettingKey(audience)).first<{setting_value:string}>();
 const configured=parseMealLiveModel(row?.setting_value);
 return {transport:'LIVE',model:configured||MEAL_LIVE_MODELS[0],source:configured?'FAMILY_SETTING':'DESIGN_DEFAULT',availability:'UNVERIFIED'};
}
