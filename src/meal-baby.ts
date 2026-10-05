import type {AppContext} from './app-context';
import {BadRequest} from './errors';
import {mealDate,mealHash,mealId,mealInteger,mealText} from './meal-domain';
import {mealRecipe} from './meal-repository';
import {inventoryToday} from './meal-inventory';
const source='https://www.mhlw.go.jp/stf/seisakunitsuite/bunya/0000161461.html';
export function babyAgeMonths(birth:unknown,today:string):number|null{
 try{const date=mealDate(birth);mealDate(today);if(date>today)return null;const [y,m,d]=date.split('-').map(Number),[ty,tm,td]=today.split('-').map(Number);return (ty-y)*12+tm-m-(td<d?1:0);}catch{return null;}
}
function foods(value:unknown):string[]{
 if(!Array.isArray(value)||value.length>100)throw new BadRequest('食材は100件以内で入力してください。');
 return [...new Set(value.map(x=>mealText(x,100)))].sort();
}
export function babyConditions(raw:any){
 if(!raw||typeof raw.readiness_confirmed!=='boolean'||!['UNKNOWN','EARLY','MIDDLE','LATE','COMPLETE'].includes(raw.stage))throw new BadRequest('離乳食の条件を確認してください。');
 const introduced=foods(raw.introduced),avoid=foods(raw.avoid);
 return {stage:raw.stage as string,readiness_confirmed:raw.readiness_confirmed,introduced,avoid};
}
async function subjects(ctx:AppContext){
 return (await ctx.env.DB.prepare(`SELECT s.id,COALESCE(m.name,s.name) name,s.birth_date FROM family_log_subjects s LEFT JOIN members m ON m.id=s.member_id AND m.family_id=s.family_id WHERE s.family_id=? AND s.active=1 AND s.subject_kind IN ('BABY','CHILD') AND (s.member_id IS NULL OR m.active=1) ORDER BY s.id LIMIT 100`).bind(ctx.member!.family_id).all<{id:number;name:string;birth_date:string|null}>()).results;
}
async function ownSubject(ctx:AppContext,id:unknown){const subjectId=mealInteger(id,2147483647),s=(await subjects(ctx)).find(s=>Number(s.id)===subjectId);if(!s)throw new BadRequest('家族ログの子どもが見つかりません。');return s;}
async function profile(ctx:AppContext,id:number){const row=await ctx.env.MEALS_DB!.prepare('SELECT revision,conditions_json FROM meal_baby_profiles WHERE family_id=? AND subject_id=?').bind(ctx.member!.family_id,id).first<{revision:string;conditions_json:string}>();return row?{revision:row.revision,conditions:babyConditions(JSON.parse(row.conditions_json))}:null;}
export async function readMealBaby(ctx:AppContext){
 const children=await subjects(ctx),rows=(await ctx.env.MEALS_DB!.prepare('SELECT subject_id,revision,conditions_json FROM meal_baby_profiles WHERE family_id=? LIMIT 100').bind(ctx.member!.family_id).all<{subject_id:number;revision:string;conditions_json:string}>()).results;
 return {children:children.map(s=>{const row=rows.find(r=>Number(r.subject_id)===Number(s.id));return {id:s.id,name:s.name,age_months:babyAgeMonths(s.birth_date,inventoryToday(ctx)),profile:row?{revision:row.revision,conditions:babyConditions(JSON.parse(row.conditions_json))}:null};})};
}
export async function saveMealBaby(ctx:AppContext,raw:any){
 const s=await ownSubject(ctx,raw.subject_id),conditions=babyConditions(raw.conditions),hash=await mealHash(conditions),revision=crypto.randomUUID(),expected=raw.revision===undefined?'':mealId(raw.revision);
 const current=await profile(ctx,Number(s.id));if(current&&await mealHash(current.conditions)===hash)return current;
 await ctx.env.MEALS_DB!.prepare(`INSERT INTO meal_baby_profiles(family_id,subject_id,revision,payload_hash,conditions_json,updated_by,updated_at) SELECT ?,?,?,?,?,?,? WHERE ?='' OR EXISTS(SELECT 1 FROM meal_baby_profiles WHERE family_id=? AND subject_id=? AND revision=?) ON CONFLICT(family_id,subject_id) DO UPDATE SET revision=excluded.revision,payload_hash=excluded.payload_hash,conditions_json=excluded.conditions_json,updated_by=excluded.updated_by,updated_at=excluded.updated_at WHERE meal_baby_profiles.revision=?`).bind(ctx.member!.family_id,s.id,revision,hash,JSON.stringify(conditions),ctx.member!.id,new Date().toISOString(),expected,ctx.member!.family_id,s.id,expected,expected).run();
 const saved=await profile(ctx,Number(s.id));if(!saved||await mealHash(saved.conditions)!==hash)throw new BadRequest('条件が更新されています。画面を開き直してください。');return saved;
}
export function checkBabyMeal(age:number|null,conditions:ReturnType<typeof babyConditions>|null,names:string[],raw:any){
 if(!['UNKNOWN','YES','NO'].includes(raw.honey)||!['UNKNOWN','HEATED','NOT_HEATED'].includes(raw.heating)||typeof raw.texture_confirmed!=='boolean'||typeof raw.allergens_confirmed!=='boolean')throw new BadRequest('調理条件を確認してください。');
 const notices:{code:string;level:'BLOCK'|'REVIEW';message:string;source?:string}[]=[];
 const add=(code:string,message:string,level:'BLOCK'|'REVIEW'='REVIEW',link?:string)=>notices.push({code,level,message,...(link?{source:link}:{})});
 if(age===null)add('AGE_UNKNOWN','生年月日を家族ログで確認してください。');
 if(!conditions)add('PROFILE_MISSING','導入済み食材・避ける食材を登録してください。');
 if(!conditions?.readiness_confirmed)add('READINESS_UNKNOWN','離乳を始める準備や発達状況を保護者・専門家と確認してください。');
 if(!conditions||conditions.stage==='UNKNOWN')add('STAGE_UNKNOWN','現在の離乳食の段階を確認してください。');
 const honey=raw.honey==='YES'||names.some(n=>/はちみつ|ハチミツ|蜂蜜|蜂みつ|ハニー|honey/i.test(n));
 if(honey&&(age===null||age<12))add('HONEY','1歳未満には、はちみつ・はちみつを含む食品を与えないでください。通常の加熱では除けないリスクがあります。','BLOCK',source);
 else if(raw.honey==='UNKNOWN')add('HONEY_UNKNOWN','加工品・調味料の原材料表示で、はちみつの有無を確認してください。', 'REVIEW',source);
 for(const name of names){if(conditions?.avoid.some(food=>name.toLocaleLowerCase().includes(food.toLocaleLowerCase())))add('AVOID_FOOD',`${name}：避ける食材の登録と一致しています。専門家の指示を確認してください。`,'BLOCK');if(!conditions?.introduced.includes(name))add('NOT_INTRODUCED',`${name}：導入済みとして登録されていません。食べ方・導入方針を確認してください。`);}
 if(raw.heating!=='HEATED')add('HEATING_UNKNOWN','加熱の有無・中心までの加熱・再加熱を確認してください。');
 if(!raw.texture_confirmed)add('TEXTURE_UNKNOWN','発達と現在の段階に合う形・硬さ・大きさを確認してください。');
 if(!raw.allergens_confirmed)add('ALLERGENS_UNKNOWN','加工品の原材料、アレルゲン、調理中の混入、医師の指示を確認してください。材料名だけでは判定できません。');
 // Even a fully completed checklist is not a suitability certificate.
 add('FINAL_REVIEW','食材の種類・量・形状、体調と発達、専門家の指示を保護者が最終確認してください。この確認はすべての危険や食べられるかを判定するものではありません。');
 return {rule_version:'baby-checklist-1',status:notices.some(n=>n.level==='BLOCK')?'BLOCKED':'REVIEW_REQUIRED',notices};
}
export async function previewMealBaby(ctx:AppContext,raw:any){
 const s=await ownSubject(ctx,raw.subject_id),p=await profile(ctx,Number(s.id));if((p?.revision||'')!==(raw.profile_revision||''))throw new BadRequest('条件が更新されています。画面を開き直してください。');
 const recipe=await mealRecipe(ctx.env.MEALS_DB!,ctx.member!.family_id,mealId(raw.recipe_id));if(!recipe||recipe.revision!==raw.recipe_revision)throw new BadRequest('レシピが更新されています。画面を開き直してください。');
 return checkBabyMeal(babyAgeMonths(s.birth_date,inventoryToday(ctx)),p?.conditions||null,recipe.ingredients.map(i=>i.name),raw);
}
