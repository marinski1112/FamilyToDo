import { resolveFamilyGeminiModel } from './family-ai';

export const FAMILY_JOURNAL_GEMINI_MODEL='gemini-3.7-flash';
export const ROUGH_INPUT_GEMINI_MODEL_PRIMARY='gemini-3.5-flash-lite';
export const ROUGH_INPUT_GEMINI_MODEL_FALLBACK='gemini-3.5-flash';

export type AiModelInventoryItem={
  feature:string;
  models:string[];
  source:string;
  note:string;
};

export async function resolveAiModelInventory(db:D1Database,familyId:number,env:Env):Promise<AiModelInventoryItem[]>{
  const generic=await resolveFamilyGeminiModel(db,familyId,env);
  return [
    {
      feature:'FAMILY_DAILY_JOURNAL',
      models:[FAMILY_JOURNAL_GEMINI_MODEL],
      source:'FEATURE_DEFAULT',
      note:'家族日誌専用。決定論的要約をフォールバックとして保持します。',
    },
    {
      feature:'ROUGH_INPUT',
      models:[ROUGH_INPUT_GEMINI_MODEL_PRIMARY,ROUGH_INPUT_GEMINI_MODEL_FALLBACK],
      source:'SOURCE_CODE_POLICY',
      note:'AIざっくり入力。左から primary → fallback の順です。',
    },
    {
      feature:'FAMILY_AI',
      models:[generic.model],
      source:generic.source,
      note:'Family AI と同じ family-scoped Gemini resolver を使う機能の実効モデルです。',
    },
  ];
}
