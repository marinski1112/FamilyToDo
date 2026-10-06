import {mealLiteralAmount} from './meal-domain';
import {BadRequest} from './errors';
import type {AppContext} from './app-context';
import {mealHash,mealId} from './meal-domain';
const MAX_BYTES=2_000_000;
const unsupported='URL取り込みはクラシル・デリッシュキッチン・SHARP公式ホットクックのレシピページに対応しています。他のリンクは出典を見ながら手入力してください。';
export function hotcookSource(raw:unknown):{model:string;code:string}|null{
 if(typeof raw!=='string')return null;
 try{const u=new URL(raw),m=/^\/kitchen\/recipe\/hotcook\/(KN-[A-Z]{2}\d{2}[A-Z])\/(R\d{4,15})\/?$/.exec(u.pathname);return u.protocol==='https:'&&u.hostname==='cocoroplus.jp.sharp'&&!u.username&&!u.password&&!u.port&&m?{model:m[1],code:m[2]}:null;}catch{return null;}
}
/** Exact publishers and recipe paths only. Never follow arbitrary redirects or fetch cookies. */
export function mealImportUrl(raw:unknown):string{
 if(typeof raw!=='string'||raw.length>2048)throw new BadRequest(unsupported);
 let u:URL;try{u=new URL(raw);}catch{throw new BadRequest(unsupported);}
 const allowed=!!hotcookSource(raw)||(u.hostname==='www.kurashiru.com'&&/^\/recipes\/[0-9a-f-]{36}\/?$/i.test(u.pathname))||(['delishkitchen.tv','www.delishkitchen.tv'].includes(u.hostname)&&/^\/recipes\/\d{8,25}\/?$/.test(u.pathname));
 if(u.protocol!=='https:'||u.username||u.password||u.port||!allowed)throw new BadRequest(unsupported);
 u.search='';u.hash='';return u.href;
}
function text(value:unknown,max=2000):string{
 if(typeof value!=='string')return '';
 return value.replace(/<[^>]*>/g,' ').replace(/&(?:amp|lt|gt|quot|apos|nbsp|#\d+|#x[\da-f]+);/gi,s=>{
  const named:Record<string,string>={'&amp;':'&','&lt;':'<','&gt;':'>','&quot;':'"','&apos;':"'",'&nbsp;':' '};
  if(named[s.toLowerCase()])return named[s.toLowerCase()];
  const n=s[2].toLowerCase()==='x'?parseInt(s.slice(3,-1),16):parseInt(s.slice(2,-1),10);return n>0&&n<=0x10ffff?String.fromCodePoint(n):'';
 }).normalize('NFKC').replace(/\s+/g,' ').trim().slice(0,max);
}
function duration(raw:unknown):number|null{
 if(typeof raw!=='string')return null;const m=/^PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/.exec(raw);if(!m)return null;
 const n=Number(m[1]||0)*60+Number(m[2]||0)+Math.ceil(Number(m[3]||0)/60);return n>=1&&n<=1440?n:null;
}
export function parseImportedIngredient(raw:string){
 const original=text(raw,200),num='(\\d+(?:\\.\\d+)?(?:\\/\\d+)?)',unit='(g|kg|ml|mL|L|個|本|枚|袋|缶|丁|束|片|尾|匹|合|カップ)';
 const suffix=new RegExp('^(.+?)\\s*'+num+'\\s*'+unit+'$').exec(original),spoon=/^(.+?)\s*(大さじ|小さじ)\s*(\d+(?:\.\d+)?(?:\/\d+)?)$/.exec(original);
 const m=suffix||spoon;let quantity:number|null=null,name=original,units='';
 if(m&&!/(?:[\d/+.~〜–≈-]|約|およそ)$/.test(m[1].trim())){const amount=suffix?m[2]:m[3],parts=amount.split('/').map(Number),n=parts.length===2?parts[0]/parts[1]:parts[0];if(Number.isFinite(n)&&n>=0.0001&&n<=100000){quantity=Math.round(n*10000)/10000;name=m[1].trim();units=suffix?m[3]:m[2];}}
 const literal=quantity===null?mealLiteralAmount(original):null;
 return {name:(literal?.name||name).slice(0,100),quantity,unit:units,original,...(literal?{quantity_text:literal.quantity_text}:{})};
}
/** Only bounded JSON-LD Recipe data; scripts, links and instruction URLs are never executed. */
export function extractMealRecipe(html:string,sourceUrl:string){
 const recipes:any[]=[];let nodes=0;
 const visit=(v:any,depth=0)=>{if(depth>12||++nodes>2000)return;if(Array.isArray(v)){v.forEach(x=>visit(x,depth+1));return;}if(!v||typeof v!=='object')return;
  const types=Array.isArray(v['@type'])?v['@type']:[v['@type']];if(types.some((t:any)=>typeof t==='string'&&/^(?:https?:\/\/schema.org\/)?Recipe$/.test(t)))recipes.push(v);
  else if(v['@graph'])visit(v['@graph'],depth+1);
 };
 let scripts=0;for(const match of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script\s*>/gi)){
  if(!/\btype\s*=\s*["']application\/ld\+json["']/i.test(match[1]))continue;if(++scripts>30)break;
  try{visit(JSON.parse(match[2]));}catch{}
 }
 if(recipes.length!==1)throw new BadRequest('このページのレシピを一つに特定できませんでした。出典を見ながら手入力してください。');
 const r=recipes[0],name=text(r.name,120),raw=r.recipeIngredient;
 if(!name||!Array.isArray(raw)||!raw.length||raw.length>50||raw.some(x=>typeof x!=='string'||x.length>1000))throw new BadRequest('このページの材料を読み込めませんでした。手入力で登録できます。');
 const steps:string[]=[];
 const addSteps=(v:any,depth=0)=>{if(depth>10||steps.length>50)return;if(Array.isArray(v)){v.forEach(x=>addSteps(x,depth+1));return;}if(typeof v==='string'){if(v.length>2000)throw new BadRequest('手順が長いため、出典を見ながら手入力してください。');const s=text(v);if(s)steps.push(s);}else if(v&&typeof v==='object'){if(v.itemListElement)addSteps(v.itemListElement,depth+1);else if(typeof v.text==='string')addSteps(v.text,depth+1);}};
 addSteps(r.recipeInstructions);if(!steps.length||steps.length>50)throw new BadRequest('このページの手順を読み込めませんでした。手入力で登録できます。');
 const yieldRaw=Array.isArray(r.recipeYield)?r.recipeYield.length===1?r.recipeYield[0]:null:r.recipeYield;
 const yieldMatch=/^(\d{1,2})\s*(?:人分|人前|人|servings?)?$/i.exec(String(yieldRaw||''));
 const servings=yieldMatch&&Number(yieldMatch[1])>=1&&Number(yieldMatch[1])<=30?Number(yieldMatch[1]):null;
 const minutes=duration(r.totalTime),ingredients=raw.map(parseImportedIngredient);
 return {name,servings,minutes,source_url:sourceUrl,ingredients,steps};
}
/** Public recipe JSON used by the official page. No cookies, script execution or device commands. */
export function extractHotcookRecipe(raw:unknown,sourceUrl:string){
 const source=hotcookSource(sourceUrl),r=raw as any;
 const fail=()=>{throw new BadRequest('公式レシピの形式・対応機種を確認できませんでした。出典を見ながら手入力してください。');};
 if(!source)throw new BadRequest(unsupported);
 if(!r||r.appliance!=='hotcook'||r.redirectModel||r.models?.[source.model]!==source.code||typeof r.name!=='string'||r.name.length>120||!r.name.trim()||!Array.isArray(r.materials)||!r.materials.length||r.materials.length>50||!Array.isArray(r.methods)||r.methods.length>100||!Array.isArray(r.material_appendices)||r.material_appendices.length>20||!Array.isArray(r.materialGroupTexts)||r.materialGroupTexts.length)fail();
 // Multiple dishes and unknown group-heading schemas still need manual review.
 const groups=new Map<string,string[]>();
 if(r.alternative_recipes?.length)fail();
 const ingredients=r.materials.map((m:any)=>{
  if(!m||typeof m.name!=='string'||!m.name.trim()||m.name.length>100||typeof m.quantity!=='string'||m.quantity.length>80||m.set_menu)fail();
  const name=text(m.name,100),amount=text(m.quantity,80),parsed=parseImportedIngredient(name+' '+amount);
  if(m.group!=null&&m.group!==''){if(typeof m.group!=='string'||m.group.length>20)fail();const group=text(m.group);if(!/^[A-Z]$/.test(group))fail();if(!groups.has(group))groups.set(group,[]);groups.get(group)!.push(name);}
  return {...parsed,name,original:name+' '+amount,...(parsed.quantity===null&&amount&&amount!=='-'?{quantity_text:amount}:{})};
 });
 const steps:string[]=[],supplements:string[]=[];let supplementSection=false;
 for(const method of r.methods){
  if(!method||typeof method.type?.type!=='string')fail();
  if(method.type.type.startsWith('image'))continue;
  if(!/^text(?:\.[A-Z]|\.BK|\.BT)?$/.test(method.type.type)||typeof method.text!=='string'||method.text.length>2000)fail();
  if(['text.BK','text.BT'].includes(method.type.type))supplementSection=true;
  const step=text(method.text.replace(/#/g,' '));if(step.replace(/[\u200b-\u200d\ufeff]/g,'').trim())(supplementSection?supplements:steps).push(step);
 }
 if(!steps.length||steps.length>28)fail();
 const notes=r.material_appendices.map((note:unknown)=>{if(typeof note!=='string'||note.length>2000)fail();return text(note);}).filter(Boolean);
 const groupNotes=Array.from(groups,([group,names])=>`材料グループ ${group}: ${names.join('、')}`);
 const extraNotes=[...notes,...groupNotes,...supplements.map(s=>`出典の補足: ${s}`)];
 if(1+extraNotes.length+steps.length>50||extraNotes.some(s=>s.length>2000))fail();
 const yieldMatch=/^材料[:：]\s*(\d{1,2})人分$/.exec(text(r.quantity)),time=/^(?:約)?(?:(\d{1,4})時間)?(?:(\d{1,4})分)?$/.exec(text(r.cookingTime));
 const totalMinutes=time?Number(time[1]||0)*60+Number(time[2]||0):0;
 const servings=yieldMatch&&Number(yieldMatch[1])>=1&&Number(yieldMatch[1])<=30?Number(yieldMatch[1]):null,minutes=totalMinutes>=1&&totalMinutes<=1440?totalMinutes:null;
 const menu=typeof r.menuNum==='string'&&/^\d{1,4}$/.test(r.menuNum)?' · メニュー番号 '+r.menuNum:'';
 return {name:text(r.name,120),servings,minutes,source_url:sourceUrl,ingredients,steps:[`SHARP公式ホットクック ${source.model}${menu}。お使いの機種・人数・付属品を出典で確認してください。`,...groupNotes,...notes,...steps,...supplements.map(s=>`出典の補足: ${s}`)]};
}
async function fetchRecipe(url:string):Promise<{html:string;url:string}>{
 const abort=new AbortController(),timer=setTimeout(()=>abort.abort(),10000);let current=url;
 try{
  for(let hop=0;hop<4;hop++){
   const sharp=hotcookSource(current),requestUrl=sharp?`https://cocoroplus.jp.sharp/kitchen/recipe/api/recipe/${sharp.code}/${sharp.model}`:current;
   const response=await fetch(requestUrl,{redirect:'manual',signal:abort.signal,headers:{accept:sharp?'application/json':'text/html'}});
   if(sharp&&[301,302,303,307,308].includes(response.status)){await response.body?.cancel();throw new BadRequest('公式レシピの対応機種が変わっています。出典を開いてURLを確認してください。');}
   if([301,302,303,307,308].includes(response.status)){const location=response.headers.get('location');await response.body?.cancel();if(!location)throw new BadRequest('出典を読み込めませんでした。');current=mealImportUrl(new URL(location,current).href);continue;}
   if(!response.ok||!(sharp?/^application\/json\b/i:/^text\/html\b/i).test(response.headers.get('content-type')||'')||Number(response.headers.get('content-length')||0)>MAX_BYTES){await response.body?.cancel();throw new BadRequest('出典を読み込めませんでした。手入力で登録できます。');}
   const reader=response.body?.getReader();if(!reader)throw new BadRequest('出典を読み込めませんでした。');
   const chunks:Uint8Array[]=[];let size=0;
   try{for(;;){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>MAX_BYTES)throw new BadRequest('ページが大きすぎます。手入力で登録してください。');chunks.push(value);}}finally{await reader.cancel().catch(()=>{});}
   const bytes=new Uint8Array(size);let pos=0;for(const chunk of chunks){bytes.set(chunk,pos);pos+=chunk.byteLength;}return {html:new TextDecoder().decode(bytes),url:current};
  }
  throw new BadRequest('出典の転送が多すぎます。手入力で登録してください。');
 }catch(e){if(e instanceof BadRequest)throw e;throw new BadRequest('出典を読み込めませんでした。手入力で登録できます。');}finally{clearTimeout(timer);}
}
function cached(row:any,hash:string){if(row.payload_hash!==hash)throw new BadRequest('URLが変わっています。新しい取り込みを開始してください。');if(row.status!=='READY')throw new BadRequest('この取り込みは処理中です。少し待って再試行するか、手入力してください。');const result=JSON.parse(row.result_json);if(result.error)throw new BadRequest(result.error);return result.draft;}
export async function importMealUrl(ctx:AppContext,raw:any){
 const url=mealImportUrl(raw.url),id=mealId(raw.request_id),db=ctx.env.MEALS_DB!,m=ctx.member!,familyId=Number(m.family_id),hash=await mealHash(url);
 const read=()=>db.prepare('SELECT payload_hash,status,result_json FROM meal_url_imports WHERE family_id=? AND id=?').bind(familyId,id).first();
 const previous=await read();if(previous)return cached(previous,hash);
 const now=new Date().toISOString();const claim=await db.prepare("INSERT OR IGNORE INTO meal_url_imports(family_id,id,payload_hash,status,created_by,created_at) SELECT ?,?,?,'RUNNING',?,? WHERE (SELECT COUNT(*) FROM meal_url_imports WHERE family_id=? AND created_at>=?)<20").bind(familyId,id,hash,m.id,now,familyId,now.slice(0,10)).run();
 if(!claim.meta.changes){const previous=await read();if(previous)return cached(previous,hash);throw new BadRequest('今日の新しいURL取り込みは20回までです。手入力で登録できます。');}
 let result:any;try{const page=await fetchRecipe(url);if(hotcookSource(page.url)){let data:unknown;try{data=JSON.parse(page.html);}catch{throw new BadRequest('公式レシピを読み込めませんでした。手入力で登録できます。');}result={draft:extractHotcookRecipe(data,page.url)};}else result={draft:extractMealRecipe(page.html,page.url)};}catch(e){if(!(e instanceof BadRequest))throw e;result={error:e.message};}
 await db.prepare("UPDATE meal_url_imports SET status='READY',result_json=? WHERE family_id=? AND id=? AND status='RUNNING'").bind(JSON.stringify(result),familyId,id).run();return cached({payload_hash:hash,status:'READY',result_json:JSON.stringify(result)},hash);
}
