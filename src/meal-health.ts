import {json} from './response';
/** Deployment readiness only: no family rows, identifiers, secrets or raw errors. */
export async function mealsHealth(env:Env):Promise<Response>{
 const enabled=env.MEALS_ENABLED==='true',configured=!!env.MEALS_DB;
 let mealsReady=false,mainReady=false;
 if(configured){
  try{
   const [meals,main]=await Promise.all([
    env.MEALS_DB!.prepare("SELECT COUNT(*) n FROM sqlite_master WHERE type='table' AND name IN ('recipes','meal_wishlist','weekly_plans','cooked_events','meal_inbox','meal_weekly_suggestions','meal_url_imports','meal_inventory_state','inventory_lots','meal_inventory_operations','inventory_events','receipt_imports','receipt_items','meal_baby_profiles','recipe_sources','meal_line_receipt_modes','meal_line_receipts','meal_recipe_searches','meal_live_sessions','meal_baby_guidance')").first<{n:number}>(),
    env.DB.prepare("SELECT COUNT(*) n FROM sqlite_master WHERE type='table' AND name IN ('ai_call_budgets','ai_call_daily','meal_shopping_projections','meal_receipt_shopping_confirmations')").first<{n:number}>(),
    // Column migrations must be complete too, before the new overview can be read.
    env.MEALS_DB!.prepare('SELECT source_url FROM meal_wishlist LIMIT 0').all()
   ]);
   mealsReady=Number(meals?.n)===20;mainReady=Number(main?.n)===4;
  }catch{}
 }
 const ready=mealsReady&&mainReady,ok=!enabled||(configured&&ready);
 return json({ok,enabled,configured,ready},ok?200:503,{'cache-control':'no-store'});
}
