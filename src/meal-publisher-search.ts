import type {AppContext} from './app-context';
import {BadRequest} from './errors';
import {mealText,mealId,mealHash} from './meal-domain';
import {mealImportUrl,hotcookSource} from './meal-url-import';
export type RecipePublisher='KURASHIRU'|'DELISH'|'HOTCOOK'|'COOKPAD';
export function publisherSearch(raw:any){
 if(!raw||typeof raw!=='object'||Array.isArray(raw)||!['KURASHIRU','DELISH','HOTCOOK','COOKPAD'].includes(raw.publisher))throw new BadRequest('検索するサイトを選択してください。');
 const query=mealText(raw.query,100);if(/[\u0000-\u001f\u007f]/u.test(query))throw new BadRequest('検索語は1行で入力してください。');
 const publisher=raw.publisher as RecipePublisher;
 if(publisher==='HOTCOOK'){const model=raw.model==null||raw.model===''?'':raw.model;if(typeof model!=='string'||(model&&!/^KN-[A-Z]{2}\d{2}[A-Z]$/.test(model)))throw new BadRequest('ホットクックの機種を選択してください。');const reference_model=model||'KN-HW24G',url=new URL('https://cocoroplus.jp.sharp/kitchen/recipe/searchresults/');for(const [k,v] of Object.entries({offset:'0',limit:'12',search:query,models:reference_model,cooktime:'',reservation:'false',ignore_text:''}))url.searchParams.set(k,v);return {publisher,query,model,reference_model,url:url.href};}
 if(publisher==='COOKPAD')return {publisher,query,url:'https://cookpad.com/jp/search/'+encodeURIComponent(query)};
 const url=new URL(publisher==='KURASHIRU'?'https://www.kurashiru.com/search':'https://delishkitchen.tv/search');url.searchParams.set(publisher==='KURASHIRU'?'query':'q',query);
 return {publisher,query,url:url.href};
}
function plain(raw:unknown){if(typeof raw!=='string')return '';return raw.replace(/<!--[\s\S]*?-->/g,'').replace(/<[^>]*>/g,' ').replace(/&(?:amp|lt|gt|quot|apos|nbsp|#\d+|#x[\da-f]+);/gi,s=>{const named:Record<string,string>={'&amp;':'&','&lt;':'<','&gt;':'>','&quot;':'"','&apos;':"'",'&nbsp;':' '};if(named[s.toLowerCase()])return named[s.toLowerCase()];const n=s[2].toLowerCase()==='x'?parseInt(s.slice(3,-1),16):parseInt(s.slice(2,-1),10);return n>0&&n<=0x10ffff?String.fromCodePoint(n):'';}).normalize('NFKC').replace(/[\u0000-\u001f\u007f]/gu,' ').replace(/\s+/g,' ').trim().slice(0,120);}
/** Names and canonical recipe links only. Never execute scripts or fetch discovered links. */
export function extractPublisherResults(html:string,searchUrl:string){
 if(html.length>2_000_000)throw new BadRequest('検索ページが大きすぎます。サイトを開いて探してください。');
 const source=new URL(searchUrl),items=new Map<string,{name:string;source_url:string}>();
 const add=(raw:unknown,label:unknown)=>{if(typeof raw!=='string'||raw.length>2048||items.size>=12)return;let url:string;try{url=mealImportUrl(new URL(raw,source).href);if(new URL(url).hostname!==source.hostname)return;}catch{return;}const name=plain(label);if(name&&!items.has(url))items.set(url,{name,source_url:url});};
 let nodes=0;const visit=(v:any,depth=0)=>{if(++nodes>3000||depth>10)return;if(Array.isArray(v)){for(const x of v)visit(x,depth+1);return;}if(!v||typeof v!=='object')return;if(v['@type']==='ItemList'&&Array.isArray(v.itemListElement)){for(const x of v.itemListElement.slice(0,100)){if(x&&typeof x==='object')add(x.url||x.item?.url,x.name||x.item?.name);}}else if(v['@graph'])visit(v['@graph'],depth+1);};
 let scripts=0;for(const m of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script\s*>/gi)){if(!/\btype\s*=\s*["']application\/ld\+json["']/i.test(m[1]))continue;if(++scripts>30)break;try{visit(JSON.parse(m[2]));}catch{}}
 // Kurashiru publishes names as anchors, with an image anchor preceding the title.
 const safe=html.replace(/<(?:script|style)\b[^>]*>[\s\S]*?<\/(?:script|style)\s*>/gi,'');let links=0;
 for(const m of safe.matchAll(/<a\b([^>]*)>([\s\S]*?)<\/a\s*>/gi)){if(++links>2000||items.size>=12)break;const href=/\bhref\s*=\s*(["'])(.*?)\1/i.exec(m[1]);if(!href)continue;const body=m[2].replace(/<svg\b[^>]*>[\s\S]*?<\/svg\s*>/gi,'');if(!/<(?:img|picture|source)\b/i.test(body))add(href[2],body);}
 return [...items.values()];
}
/** One public page only, no pagination, authenticated state, images or discovered requests. */
export function extractHotcookSearch(raw:unknown,model:string){
 const r=raw as any;if(!r||!Array.isArray(r.recipes)||r.recipes.length>100)throw new BadRequest('公式検索の形式が変わっています。サイトを開いて探してください。');
 const items=new Map<string,{name:string;source_url:string}>();
 for(const row of r.recipes.slice(0,12)){
  if(!row||row.hotcook!==true||row.modelName!==model||typeof row.href!=='string'||row.href.length>200||!/^\/hotcook\/KN-[A-Z]{2}\d{2}[A-Z]\/R\d{4,15}$/.test(row.href)||typeof row.title!=='string'||row.title.length>1000)continue;
  let url:string;try{url=mealImportUrl('https://cocoroplus.jp.sharp/kitchen/recipe'+row.href);}catch{continue;}
  const source=hotcookSource(url),name=plain(row.title);if(source?.model!==model||source.code!==row.code||!name||items.has(url))continue;items.set(url,{name,source_url:url});
 }
 return [...items.values()];
}
async function fetchSearch(url:string,hotcook?:{query:string;model:string}){
 const abort=new AbortController(),timer=setTimeout(()=>abort.abort(),10000);
 try{const response=await fetch(hotcook?'https://cocoroplus.jp.sharp/kitchen/recipe/api/recipe/search':url,{redirect:'manual',signal:abort.signal,...(hotcook?{method:'POST',body:JSON.stringify({offset:0,limit:12,search:hotcook.query,models:[hotcook.model],cooktime:'',reservation:false,ignore_text:'',purposes:[],categories:[],genres:[]}),headers:{accept:'application/json','content-type':'application/json'}}:{headers:{accept:'text/html'}})});if(!response.ok||!(hotcook?/^application\/json\b/i:/^text\/html\b/i).test(response.headers.get('content-type')||'')||Number(response.headers.get('content-length')||0)>2_000_000){await response.body?.cancel();throw new Error();}const reader=response.body?.getReader();if(!reader)throw new Error();const chunks:Uint8Array[]=[];let size=0;try{for(;;){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>2_000_000)throw new Error();chunks.push(value);}}finally{await reader.cancel().catch(()=>{});}const bytes=new Uint8Array(size);let at=0;for(const x of chunks){bytes.set(x,at);at+=x.length;}return new TextDecoder().decode(bytes);}finally{clearTimeout(timer);}
}
export async function searchMealPublisher(ctx:AppContext,raw:any){
 const params=publisherSearch(raw),id=mealId(raw.request_id),familyId=Number(ctx.member!.family_id),db=ctx.env.MEALS_DB!,hash=await mealHash([params.publisher,params.query,...(params.publisher==='HOTCOOK'?[params.model]:[])]),now=new Date().toISOString();
 const cached=(row:any)=>{if(row.payload_hash!==hash)throw new BadRequest('検索条件が変わっています。検索し直してください。');if(row.status!=='READY')throw new BadRequest('検索中です。少し待って再試行してください。');return JSON.parse(row.result_json);};
 const read=()=>db.prepare('SELECT payload_hash,status,result_json FROM meal_recipe_searches WHERE family_id=? AND id=?').bind(familyId,id).first();const old=await read();if(old)return cached(old);
 // User-triggered bounded cleanup; no new cron or permanently growing raw-page cache.
 await db.prepare('DELETE FROM meal_recipe_searches WHERE family_id=? AND id IN (SELECT id FROM meal_recipe_searches WHERE family_id=? AND created_at<? ORDER BY created_at LIMIT 20)').bind(familyId,familyId,new Date(Date.now()-7*86400000).toISOString()).run();
 const claim=await db.prepare("INSERT OR IGNORE INTO meal_recipe_searches(family_id,id,payload_hash,status,created_at) SELECT ?,?,?,'RUNNING',? WHERE (SELECT COUNT(*) FROM meal_recipe_searches WHERE family_id=? AND created_at>=?)<20").bind(familyId,id,hash,now,familyId,now.slice(0,10)).run();
 if(!claim.meta.changes){const old=await read();if(old)return cached(old);throw new BadRequest('今日の新しい外部検索は20回までです。サイトを開いて探すこともできます。');}
 let items:Array<{name:string;source_url:string}>=[],unavailable=false;try{items=params.publisher==='HOTCOOK'?extractHotcookSearch(JSON.parse(await fetchSearch(params.url,{query:params.query,model:params.reference_model!})),params.reference_model!):extractPublisherResults(await fetchSearch(params.url),params.url);unavailable=items.length===0;}catch{unavailable=true;}
 const result={publisher:params.publisher,search_url:params.url,items,unavailable,...(params.publisher==='HOTCOOK'?{model:params.reference_model,model_confirmed:!!params.model}:{})};await db.prepare("UPDATE meal_recipe_searches SET status='READY',result_json=? WHERE family_id=? AND id=? AND status='RUNNING'").bind(JSON.stringify(result),familyId,id).run();return result;
}
