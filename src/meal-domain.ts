import {BadRequest} from './errors';
export type MealIngredient={name:string;quantity:number;unit:string;quantity_text?:never}|{name:string;quantity:null;unit:'';quantity_text:string};
export function mealAmountText(raw:unknown):string{const text=mealText(raw,80);if(/[\u0000-\u001f\u007f]/u.test(text)||!/[\p{L}\p{N}]/u.test(text)||/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)$/.test(text)||/^(?:nan|[+-]?infinity)$/i.test(text))throw new BadRequest('数量は正の数か、少々・適量などの表記で入力してください。');return text;}
/** Copies a literal qualitative suffix, never infers a numeric amount. */
export function mealLiteralAmount(raw:string):{name:string;quantity_text:string}|null{const m=/^(.+?)\s*\(?\s*(少々|適量|適宜|お好みで|お好み|ひとつまみ|ふたつまみ)\s*\)?$/u.exec(raw.normalize('NFKC').trim());if(!m||/[~〜～–-]$/.test(m[1].trim()))return null;const name=m[1].trim().replace(/[:：]$/u,'').trim();return name?{name,quantity_text:m[2]}:null;}
export type MealRecipe={id:string;name:string;servings:number;minutes:number;source_url:string;ingredients:MealIngredient[];steps:string[];revision?:string;source?:{kind:string;model:string;extracted_at:string;confidence:string;start_seconds:number;end_seconds:number}|null};
export type MealPlanItem={date:string;servings:number;recipe:MealRecipe};
export const mealEnabled=(env:Env)=>env.MEALS_ENABLED==='true'&&!!env.MEALS_DB;
export const mealText=(value:unknown,max:number)=>{if(typeof value!=='string')throw new BadRequest('文字を入力してください。');const s=value.normalize('NFKC').trim();if(!s||s.length>max)throw new BadRequest('入力の長さを確認してください。');return s;};
export const mealId=(value:unknown)=>{if(typeof value!=='string'||! /^[a-zA-Z0-9-]{8,72}$/.test(value))throw new BadRequest('識別情報が不正です。');return value;};
export function mealDate(value:unknown):string{const s=String(value||'');if(!/^\d{4}-\d{2}-\d{2}$/.test(s)||!Number.isFinite(Date.parse(s+'T00:00:00Z'))||new Date(s+'T00:00:00Z').toISOString().slice(0,10)!==s)throw new BadRequest('日付が不正です。');return s;}
export const shiftMealDate=(date:string,n:number)=>new Date(Date.parse(mealDate(date)+'T12:00:00Z')+n*86400000).toISOString().slice(0,10);
export function mealWeek(value:unknown):string{const date=mealDate(value),d=new Date(date+'T12:00:00Z');return shiftMealDate(date,-((d.getUTCDay()+6)%7));}
export function mealInteger(value:unknown,max:number):number{if(!Number.isSafeInteger(value)||Number(value)<1||Number(value)>max)throw new BadRequest('人数・時間を確認してください。');return Number(value);}
export async function mealHash(value:unknown):Promise<string>{const data=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify(value)));return [...new Uint8Array(data)].map(x=>x.toString(16).padStart(2,'0')).join('');}
export function normalizeMealRecipe(raw:any):MealRecipe{
 if(!raw||typeof raw!=='object')throw new BadRequest('レシピを入力してください。');
 let url=String(raw.source_url||'').trim();if(url){try{const u=new URL(url);if(url.length>2048||!['https:','http:'].includes(u.protocol)||u.username||u.password)throw new Error();url=u.href;}catch{throw new BadRequest('出典URLが不正です。');}}
 if(!Array.isArray(raw.ingredients)||raw.ingredients.length<1||raw.ingredients.length>50)throw new BadRequest('食材は1〜50件登録してください。');
 const ingredients:MealIngredient[]=raw.ingredients.map((x:any)=>{
  if(x?.quantity===null){if(String(x.unit??'').trim())throw new BadRequest('少々・適量の場合、単位は空欄にしてください。');return {name:mealText(x.name,100),quantity:null,unit:'',quantity_text:mealAmountText(x.quantity_text)};}
  if(x?.quantity_text!=null&&x.quantity_text!=='')throw new BadRequest('数値と少々・適量の表記は同時に指定できません。');
  if(typeof x?.quantity!=='number'||!Number.isFinite(x.quantity)||x.quantity<=0||x.quantity>100000)throw new BadRequest('食材の量は正の数か、少々・適量などで入力してください。');
  const quantity=Math.round(x.quantity*10000)/10000;if(!quantity)throw new BadRequest('数量が小さすぎます。');return {name:mealText(x.name,100),quantity,unit:mealText(x.unit,20)};
 });
 if(!Array.isArray(raw.steps)||!raw.steps.length||raw.steps.length>50)throw new BadRequest('手順は1〜50件登録してください。');
 return {id:mealId(raw.id),name:mealText(raw.name,120),servings:mealInteger(raw.servings,30),minutes:mealInteger(raw.minutes,1440),source_url:url,ingredients,steps:raw.steps.map((s:unknown)=>mealText(s,2000))};
}
/** Different units stay separate. No AI arithmetic or undocumented conversion. */
export function mealShoppingNeeds(items:MealPlanItem[]):MealIngredient[]{
 const result=new Map<string,MealIngredient>();
 for(const item of items)for(const ingredient of item.recipe.ingredients){
  if(ingredient.quantity===null){const key=JSON.stringify(['TEXT',ingredient.name,ingredient.quantity_text]);result.set(key,{...ingredient});continue;}
  const key=JSON.stringify(['NUMBER',ingredient.name,ingredient.unit]),old=result.get(key),amount=ingredient.quantity*item.servings/item.recipe.servings;result.set(key,{name:ingredient.name,unit:ingredient.unit,quantity:(old?.quantity??0)+amount});
 }
 const rows=[...result.values()].map(x=>x.quantity===null?x:{...x,quantity:Math.round(x.quantity*10000)/10000});
 if(rows.length>100)throw new BadRequest('食材が100件を超えています。献立を分けてください。');
 return rows;
}
