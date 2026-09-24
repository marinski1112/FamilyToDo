import { resolveFamilyGeminiModel } from './family-ai';
import { resolveFeatureModels, ROUTED_AI_FEATURES } from './ai-model-routing';

export const FAMILY_JOURNAL_GEMINI_MODEL='gemini-3.6-flash';

export type AiModelInventoryItem={
  feature:string;
  models:string[];
  source:string;
  note:string;
};

export async function resolveAiModelInventory(db:D1Database,familyId:number,env:Env):Promise<AiModelInventoryItem[]>{
  const generic=await resolveFamilyGeminiModel(db,familyId,env);
  const routed:AiModelInventoryItem[]=[];
  for(const feature of ROUTED_AI_FEATURES)for(const audience of ['OWNER','MEMBER']){
    const route=await resolveFeatureModels(db,familyId,feature,audience);
    routed.push({feature:`${feature}_${audience}`,models:route.models,source:route.source,note:'機能別の管理設定。左から使用し、同じモデルへの重複試行はしません。'});
  }
  return [
    ...routed,
    {
      feature:'FAMILY_AI',
      models:[generic.model],
      source:generic.source,
      note:'Family AI と同じ family-scoped Gemini resolver を使う機能の実効モデルです。',
    },
  ];
}
