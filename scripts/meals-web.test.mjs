import {babyAgeMonths,checkBabyMeal} from '../src/meal-baby.ts';
import {validateReceiptItems} from '../src/meal-receipts.ts';
import {mealImportUrl,extractMealRecipe,parseImportedIngredient} from '../src/meal-url-import.ts';
import {mealsHealth} from '../src/meal-health.ts';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createRequire} from 'node:module';
import {pathToFileURL} from 'node:url';
import {DatabaseSync} from 'node:sqlite';
import {parseMealLineText,receiveMealLine} from '../src/meal-line-inbox.ts';
import {webhook} from '../src/line-webhook.ts';
import {mealApi} from '../src/meal-api.ts';
import {mealPage,withMealsNavigation} from '../src/meal-page.ts';
import {rankMealCandidates,validateMealSelection} from '../src/meal-weekly-suggestions.ts';
import {mealShoppingNeeds} from '../src/meal-domain.ts';
function db(dir){
 const sql=new DatabaseSync(':memory:');for(const file of fs.readdirSync(dir).filter(x=>x.endsWith('.sql')).sort())sql.exec(fs.readFileSync(dir+'/'+file,'utf8'));
 const wrap=(q,args=[])=>({bind(...v){return wrap(q,v);},async first(){return sql.prepare(q).get(...args)||null;},async all(){return {results:sql.prepare(q).all(...args)};},execRun(){const r=sql.prepare(q).run(...args);return {meta:{changes:Number(r.changes),last_row_id:Number(r.lastInsertRowid)}};},async run(){return this.execRun();}});
 return {sql,DB:{prepare:wrap,async batch(stmts){sql.exec('BEGIN');try{const out=stmts.map(s=>s.execRun());sql.exec('COMMIT');return out;}catch(e){sql.exec('ROLLBACK');throw e;}}}};
}
function fixture(){const main=db('migrations'),meals=db('meals-migrations');main.sql.exec("INSERT INTO families(id,family_code,name,created_at,updated_at) VALUES(1,'f1','f1','x','x'),(2,'f2','f2','x','x'); INSERT INTO members(id,family_id,line_user_id,name,role,active,created_at,updated_at) VALUES(1,1,'m1','m1','OWNER',1,'x','x'),(2,2,'m2','m2','OWNER',1,'x','x');");const env={DB:main.DB,MEALS_DB:meals.DB,MEALS_ENABLED:'true',APP_SECRET:'test-secret',APP_TIMEZONE:'Asia/Tokyo'};return {main,meals,ctx:{env,member:{id:1,family_id:1,active:1},session:{iat:Date.now(),csrfToken:'test'}}};}
async function call(ctx,body,query=''){const response=await mealApi(new Request('https://fixture.invalid/api/meals/v1'+query,{method:body?'POST':'GET',headers:body?{'content-type':'application/json'}:{},body:body?JSON.stringify({csrf:'test',...body}):undefined}),ctx);return {response,value:await response.json()};}
const recipe=(id='recipe-test-001')=>({id,name:'ハンバーグ',servings:2,minutes:25,source_url:'https://example.invalid/recipe',ingredients:[{name:'ひき肉',quantity:300,unit:'g'},{name:'玉ねぎ',quantity:1,unit:'個'}],steps:['玉ねぎを切る','ひき肉と混ぜて焼く']});
async function seed(ctx){await call(ctx,{action:'save_recipe',recipe:recipe()});return (await call(ctx,{action:'save_plan',plan:{week_start:'2026-10-05',status:'CONFIRMED',items:[{date:'2026-10-05',recipe_id:'recipe-test-001',servings:4},{date:'2026-10-06',recipe_id:'recipe-test-001',servings:2}]}})).value.plan;}
test('unauthenticated/CSRF/disabled calls do not expose meals; family from request is ignored',async()=>{
 const {ctx}=fixture();assert.equal((await call({...ctx,member:null},null)).response.status,401);assert.equal((await call(ctx,{csrf:'wrong',action:'wishlist_add',id:'wishlist-0001',name:'カレー'})).response.status,403);assert.equal((await call({...ctx,env:{...ctx.env,MEALS_ENABLED:'false'}},null)).response.status,503);
 await call(ctx,{action:'wishlist_add',id:'wishlist-0001',name:'カレー',family_id:2});assert.equal((await call(ctx,null)).value.wishlist.length,1);assert.equal((await call({...ctx,member:{...ctx.member,id:2,family_id:2}},null)).value.wishlist.length,0);
});
test('overview can show tomorrow across a Sunday/Monday week boundary',async()=>{
 const {ctx}=fixture();await seed(ctx);const RealDate=globalThis.Date;globalThis.Date=class extends RealDate{constructor(...args){super(...(args.length?args:['2026-10-04T12:00:00Z']));}static now(){return RealDate.parse('2026-10-04T12:00:00Z');}};
 try{const result=await call(ctx,null,'?week=2026-09-28');assert.equal(result.value.tomorrow_item.date,'2026-10-05');assert.equal(result.value.tomorrow_item.recipe.name,'ハンバーグ');}finally{globalThis.Date=RealDate;}
});
test('recipe save retries are idempotent, stale edits fail and another tenant cannot read/archive or plan a recipe',async()=>{
 const {ctx,meals}=fixture();const first=(await call(ctx,{action:'save_recipe',recipe:recipe()})).value.recipe;await call(ctx,{action:'save_recipe',recipe:recipe()});assert.equal(meals.sql.prepare('SELECT COUNT(*) c FROM recipes').get().c,1);
 const next=(await call(ctx,{action:'save_recipe',recipe:{...first,name:'変更済み'}})).value.recipe;assert(next.revision!==first.revision);assert.equal((await call(ctx,{action:'save_recipe',recipe:{...first,name:'古い変更'}})).response.status,400);
 const other={...ctx,member:{...ctx.member,id:2,family_id:2}};assert.equal((await call(other,null,'?view=recipe&id=recipe-test-001')).response.status,404);await call(other,{action:'archive_recipe',id:'recipe-test-001'});assert.equal((await call(ctx,null,'?view=recipe&id=recipe-test-001')).response.status,200);
 assert.equal((await call(other,{action:'save_plan',plan:{week_start:'2026-10-05',items:[{date:'2026-10-05',recipe_id:first.id,servings:2}]}})).response.status,400);
});
test('scaled ingredient arithmetic preserves distinct units and combines identical names/units',()=>{
 const r=recipe();const needs=mealShoppingNeeds([{date:'2026-10-05',servings:4,recipe:r},{date:'2026-10-06',servings:2,recipe:r}]);assert.deepEqual(needs,[{name:'ひき肉',unit:'g',quantity:900},{name:'玉ねぎ',unit:'個',quantity:3}]);r.ingredients.push({name:'ひき肉',quantity:1,unit:'パック'});assert.equal(mealShoppingNeeds([{servings:2,recipe:r}]).length,3);
});
test('plan stores recipe snapshot; confirmed shopping preview forbids stale/tampered input; parallel retry creates one shopping set',async()=>{
 const {ctx,main}=fixture();const plan=await seed(ctx);const preview=(await call(ctx,null,'?view=shopping_preview&week=2026-10-05')).value;
 assert.equal(preview.needs[0].quantity,900);
 const body={action:'shopping_confirm',week_start:plan.week_start,revision:plan.revision,preview_hash:preview.preview_hash,selected:[0,1]};
 assert.equal((await call(ctx,{...body,preview_hash:'tampered'})).response.status,409);assert.equal((await call(ctx,{...body,revision:'stale'})).response.status,409);
 const result=await Promise.all([call(ctx,body),call(ctx,body)]);assert(result.every(r=>r.response.status===200));assert.equal(main.sql.prepare('SELECT COUNT(*) c FROM shopping_items').get().c,2);assert.equal(main.sql.prepare('SELECT COUNT(*) c FROM shopping_items WHERE family_id=1 AND visibility_scope=\'FAMILY\' AND quantity=\'900g\'').get().c,1);
 // User deletion must not be undone by a transport retry.
 main.sql.exec('DELETE FROM shopping_items');assert.equal((await call(ctx,body)).response.status,200);assert.equal(main.sql.prepare('SELECT COUNT(*) c FROM shopping_items').get().c,0);
 assert.equal((await call(ctx,{...body,selected:[0]})).response.status,400);
 const current=(await call(ctx,null,'?view=recipe&id=recipe-test-001')).value.recipe;await call(ctx,{action:'save_recipe',recipe:{...current,name:'レシピを編集した後'}});assert.equal((await call(ctx,null,'?week=2026-10-05')).value.plan.items[0].recipe.name,'ハンバーグ');
});
test('cooked complete is tenant/date/revision scoped and idempotent',async()=>{
 const {ctx,meals}=fixture();const plan=await seed(ctx),body={action:'cooked',date:'2026-10-05',revision:plan.revision};await Promise.all([call(ctx,body),call(ctx,body)]);assert.equal(meals.sql.prepare('SELECT COUNT(*) c FROM cooked_events').get().c,1);assert.equal((await call({...ctx,member:{...ctx.member,family_id:2}},body)).response.status,409);assert.equal((await call(ctx,{...body,date:'2026-10-07'})).response.status,409);
});
test('invalid dates, oversized payloads, unsafe sources and nonfinite/zero quantities fail',async()=>{
 const {ctx}=fixture();assert.equal((await call(ctx,{action:'save_recipe',recipe:{...recipe(),source_url:'javascript:alert(1)'}})).response.status,400);assert.equal((await call(ctx,{action:'save_recipe',recipe:{...recipe(),ingredients:[{name:'肉',unit:'g',quantity:0}]}})).response.status,400);
 await call(ctx,{action:'save_recipe',recipe:recipe()});assert.equal((await call(ctx,{action:'save_plan',plan:{week_start:'2026-10-05',items:[{date:'2026-10-12',recipe_id:'recipe-test-001',servings:2}]}})).response.status,400);
 const request=new Request('https://fixture.invalid/api/meals/v1',{method:'POST',body:JSON.stringify({csrf:'test',name:'x'.repeat(160000)})});assert.equal((await mealApi(request,ctx)).status,413);
});
test('feature-enabled nav stays six tabs, disabled nav remains unchanged, page commits CSRF without AI',async()=>{
 const {ctx}=fixture();ctx.session.csrfToken=undefined;const page=await mealPage(ctx);assert(page.headers.has('set-cookie'));const response=await withMealsNavigation(page,ctx.env),html=await response.text();assert(html.includes('ごはん</a>'));assert(html.includes('--nav-count:6'));assert(html.includes('/app/home.php'));assert(!html.includes('gemini-'));
 const old=new Response('<span aria-hidden="true">🏠</span>ホーム</a>',{headers:{'content-type':'text/html'}});assert.equal(await (await withMealsNavigation(old,{...ctx.env,MEALS_ENABLED:'false'})).text(),'<span aria-hidden="true">🏠</span>ホーム</a>');
});

test('LINE meal parser accepts explicit wishes and safe URLs, rejects arbitrary input',()=>{
 assert.deepEqual(parseMealLineText('ハンバーグ食べたい！'),{kind:'WISH',content:'ハンバーグ'});
 assert.deepEqual(parseMealLineText('食べたい: カレー'),{kind:'WISH',content:'カレー'});
 assert.equal(parseMealLineText('今日'),null);assert.equal(parseMealLineText('javascript:alert(1)'),null);assert.equal(parseMealLineText('https://user:password@example.invalid/'),null);assert.equal(parseMealLineText('x'.repeat(121)+'食べたい'),null);
 assert.equal(parseMealLineText('レシピ https://example.invalid/recipe').kind,'RECIPE_URL');
});
const lineEvent=(id='line-event-1',text='カレー食べたい')=>({webhookEventId:id,type:'message',source:{type:'user',userId:'m1'},message:{id:'message-1',type:'text',text}});
async function signedWebhook(env,events,valid=true){
 const body=JSON.stringify({events}),key=await crypto.subtle.importKey('raw',new TextEncoder().encode('line-test-secret'),{name:'HMAC',hash:'SHA-256'},false,['sign']);
 const signature=Buffer.from(await crypto.subtle.sign('HMAC',key,new TextEncoder().encode(body))).toString('base64');
 return webhook(new Request('https://fixture.invalid/webhook',{method:'POST',body,headers:{'x-line-signature':valid?signature:'bad'}}),{...env,LINE_CHANNEL_SECRET:'line-test-secret'});
}
test('signed LINE input persists without reply token; retries do not resurrect confirmed/deleted wishes',async()=>{
 const {ctx,meals}=fixture(),event=lineEvent();
 await signedWebhook(ctx.env,[event],false);assert.equal(meals.sql.prepare('SELECT COUNT(*) c FROM meal_inbox').get().c,0);
 await signedWebhook(ctx.env,[event,event]);const entries=(await call(ctx,null,'?view=inbox')).value.inbox;assert.equal(entries.length,1);
 const id=entries[0].id;await Promise.all([call(ctx,{action:'inbox_wish',id}),call(ctx,{action:'inbox_wish',id})]);assert.equal((await call(ctx,null)).value.wishlist.length,1);
 await call(ctx,{action:'wishlist_delete',id});await signedWebhook(ctx.env,[event]);await call(ctx,{action:'inbox_wish',id});assert.equal((await call(ctx,null)).value.wishlist.length,0);assert.equal((await call(ctx,null,'?view=inbox')).value.inbox.length,0);
});
test('LINE inbox refuses group/unlinked/disabled events and isolates review by family',async()=>{
 const {ctx,meals}=fixture();
 await signedWebhook(ctx.env,[{...lineEvent(),source:{type:'group',userId:'m1',groupId:'group'}},{...lineEvent(),source:{type:'user',userId:'unknown'}}]);
 await signedWebhook({...ctx.env,MEALS_ENABLED:'false'},[lineEvent()]);assert.equal(meals.sql.prepare('SELECT COUNT(*) c FROM meal_inbox').get().c,0);
 await signedWebhook(ctx.env,[lineEvent('url-event','https://example.invalid/recipe')]);const id=(await call(ctx,null,'?view=inbox')).value.inbox[0].id;
 const other={...ctx,member:{id:2,family_id:2}};assert.equal((await call(other,null,'?view=inbox')).value.inbox.length,0);await call(other,{action:'inbox_dismiss',id});assert.equal((await call(other,{action:'inbox_wish',id})).response.status,404);assert.equal((await call(ctx,null,'?view=inbox')).value.inbox.length,1);
 assert.equal((await call(ctx,{action:'inbox_wish',id})).response.status,404);await call(ctx,{action:'inbox_dismiss',id});await signedWebhook(ctx.env,[lineEvent('url-event','https://example.invalid/recipe')]);assert.equal((await call(ctx,null,'?view=inbox')).value.inbox.length,0);
});
test('LINE meal storage failure requests redelivery, with no provider or URL requests',async()=>{
 const {ctx}=fixture(),originalFetch=globalThis.fetch;let calls=0;globalThis.fetch=async()=>{calls++;throw new Error('unexpected HTTP');};
 try{await signedWebhook(ctx.env,[lineEvent('url-event','https://example.invalid/recipe')]);assert.equal(calls,0);
 const broken={...ctx.env,MEALS_DB:{prepare(){throw new Error('synthetic storage unavailable');}}};assert.equal((await signedWebhook(broken,[lineEvent()])).status,503);assert.equal(calls,0);
 }finally{globalThis.fetch=originalFetch;}
});

test('Web inbox escapes LINE content, confirms wishes, and prefills URL for manual recipe entry',async()=>{
 const {Window}=await import(pathToFileURL(createRequire(process.cwd()+'/package.json').resolve('happy-dom')).href),{ctx}=fixture();
 await receiveMealLine(ctx.env,lineEvent('wish-ui','<img src=x onerror=alert(1)>食べたい'),ctx.member);
 await receiveMealLine(ctx.env,lineEvent('url-ui','https://example.invalid/recipe'),ctx.member);
 const window=new Window({url:'https://fixture.invalid/app/meals.php?view=inbox'});
 try{
 window.document.body.innerHTML='<script id="mealPayload" type="application/json">{"csrf":"test","today":"2026-10-05"}</script><p id="mealStatus"></p><section id="mealContent"></section>';
 window.fetch=(url,options={})=>mealApi(new Request(new URL(url,window.location.href),options),ctx);
 window.eval(fs.readFileSync('public/assets/meals.js','utf8'));
 const settle=async()=>{for(let i=0;i<12;i++)await new Promise(resolve=>setImmediate(resolve));};await settle();
 const doc=window.document;assert.equal(doc.querySelectorAll('[data-inbox-add]').length,2);assert.equal(doc.querySelector('#mealContent img'),null);
 [...doc.querySelectorAll('[data-inbox-add]')].find(b=>b.textContent==='食べたいものに追加').click();await settle();assert.equal(doc.querySelectorAll('[data-inbox-add]').length,1);assert.equal((await call(ctx,null)).value.wishlist.length,1);
 doc.querySelector('[data-inbox-add]').click();assert.equal(doc.querySelector('[name=source_url]').value,'https://example.invalid/recipe');assert(doc.querySelector('#recipeForm'));assert(doc.querySelector('#mealStatus').textContent.includes('出典を見ながら'));
 }finally{window.happyDOM.abort();window.close();}
});

const proposalBody=(id='proposal-request-001')=>({action:'suggest_week',request_id:id,week_start:'2026-10-05',servings:4,max_minutes:60});
async function seedSuggestions(ctx){for(let i=0;i<6;i++)await call(ctx,{action:'save_recipe',recipe:{...recipe('recipe-ai-000'+i),name:'料理'+i,minutes:i===5?120:20+i}});await call(ctx,{action:'wishlist_add',id:'wish-ai-0001',name:'料理3'});}
const aiResponse=ids=>new Response(JSON.stringify({candidates:[{content:{parts:[{text:JSON.stringify({recipe_ids:ids})}]}}]}),{headers:{'content-type':'application/json'}});
test('proposal scores wishes/time/recent cooking in code; strict AI selection cannot invent IDs or quantities',()=>{
 const candidates=rankMealCandidates([{id:'a',name:'カレー',minutes:30,servings:2},{id:'b',name:'肉じゃが',minutes:20,servings:2},{id:'c',name:'煮込み',minutes:120,servings:2}],['カレー'],new Set(['b']),60);assert.equal(candidates[0].id,'a');assert.equal(candidates.length,2);
 assert.deepEqual(validateMealSelection({recipe_ids:['a','b','a','b','a']},candidates),['a','b','a','b','a']);assert.equal(validateMealSelection({recipe_ids:['a','a','a','a','a']},candidates),null);assert.equal(validateMealSelection({recipe_ids:['a','b','a','b','other-family']},candidates),null);assert.equal(validateMealSelection({recipe_ids:['a','b','a','b','a'],servings:999},candidates),null);
});
test('AI proposal is tenant-scoped/read-only; transport retries reuse the receipt without another call',async()=>{
 const {ctx,main,meals}=fixture();await seedSuggestions(ctx);ctx.env.GEMINI_API_KEY='synthetic-key';
 await call({...ctx,member:{id:2,family_id:2}},{action:'save_recipe',recipe:{...recipe('private-other-001'),name:'別家族の料理'}});
 const original=globalThis.fetch;let calls=0,prompt='';globalThis.fetch=async(url,options)=>{calls++;prompt=options.body;assert(String(url).includes('gemini-3.5-flash'));return aiResponse(['recipe-ai-0003','recipe-ai-0001','recipe-ai-0002','recipe-ai-0000','recipe-ai-0004']);};
 try{
 const result=await call(ctx,proposalBody());assert.equal(result.value.suggestion.mode,'AI');assert.equal(result.value.suggestion.items.length,5);assert.equal(result.value.suggestion.items[0].servings,4);assert.equal(result.value.suggestion.items[4].date,'2026-10-09');
 assert(!prompt.includes('別家族'));assert(!prompt.includes('private-other'));assert(!prompt.includes('source_url'));assert(!prompt.includes('ひき肉'));assert(!prompt.includes('recipe-ai-0005'));assert.equal(meals.sql.prepare('SELECT COUNT(*) c FROM weekly_plans').get().c,0);assert.equal(main.sql.prepare('SELECT COUNT(*) c FROM shopping_items').get().c,0);
 assert.deepEqual((await call(ctx,proposalBody())).value.suggestion,result.value.suggestion);assert.equal(calls,1);assert.equal(main.sql.prepare("SELECT calls FROM ai_call_daily WHERE feature='MEAL_WEEKLY_PLAN'").get().calls,1);assert.equal((await call(ctx,{...proposalBody(),servings:2})).response.status,400);assert.equal(calls,1);
 }finally{globalThis.fetch=original;}
});
test('parallel proposal requests claim one provider call and zero calls for denied auth/CSRF or storage failure',async()=>{
 const {ctx}=fixture();await seedSuggestions(ctx);ctx.env.GEMINI_API_KEY='synthetic-key';const original=globalThis.fetch;let calls=0,release;
 globalThis.fetch=async()=>{calls++;await new Promise(r=>release=r);return aiResponse(['recipe-ai-0000','recipe-ai-0001','recipe-ai-0002','recipe-ai-0003','recipe-ai-0004']);};
 try{
 assert.equal((await call({...ctx,member:null},proposalBody())).response.status,401);assert.equal((await call(ctx,{...proposalBody(),csrf:'bad'})).response.status,403);assert.equal(calls,0);
 const first=call(ctx,proposalBody());while(!release)await new Promise(r=>setImmediate(r));const parallel=await call(ctx,proposalBody());assert.equal(parallel.response.status,400);assert.equal(calls,1);release();assert.equal((await first).response.status,200);assert.equal((await call(ctx,proposalBody())).response.status,200);assert.equal(calls,1);
 const broken={...ctx,env:{...ctx.env,MEALS_DB:{prepare(){throw new Error('synthetic database unavailable');}}}};await assert.rejects(call(broken,proposalBody('broken-proposal-01')));assert.equal(calls,1);
 }finally{globalThis.fetch=original;}
});
test('429 has no model fallback or repeat; malformed/cross-family AI output uses deterministic candidates',async()=>{
 const {ctx}=fixture();await seedSuggestions(ctx);ctx.env.GEMINI_API_KEY='synthetic-key';let calls=0;const original=globalThis.fetch;
 globalThis.fetch=async()=>{calls++;return new Response('{}',{status:429});};try{
 const first=(await call(ctx,proposalBody())).value.suggestion;assert.equal(first.mode,'RULES');assert.equal(first.reason,'RATE_LIMIT_OR_BUDGET');await call(ctx,proposalBody());assert.equal(calls,1);await call(ctx,proposalBody('proposal-next-002'));assert.equal(calls,1);
 }finally{globalThis.fetch=original;}
 const other=fixture();await seedSuggestions(other.ctx);other.ctx.env.GEMINI_API_KEY='synthetic-key';globalThis.fetch=async()=>aiResponse(['private-other-001','recipe-ai-0001','recipe-ai-0002','recipe-ai-0003','recipe-ai-0004']);try{const result=(await call(other.ctx,proposalBody())).value.suggestion;assert.equal(result.mode,'RULES');assert.equal(result.reason,'INVALID_OUTPUT');assert.equal(result.items[0].recipe.id,'recipe-ai-0003');assert(!result.items.some(i=>i.recipe.id==='private-other-001'));}finally{globalThis.fetch=original;}
});
test('one candidate/missing AI stay usable; fresh requests capped at 20/day and old receipt remains retryable',async()=>{
 const {ctx,meals}=fixture();await call(ctx,{action:'save_recipe',recipe:recipe()});const original=globalThis.fetch;globalThis.fetch=()=>{throw new Error('unexpected provider');};try{
 const first=(await call(ctx,proposalBody())).value.suggestion;assert.equal(first.mode,'RULES');assert.equal(first.repeated,true);assert.equal((await call(ctx,{...proposalBody('short-time-proposal'),max_minutes:5})).response.status,400);
 for(let i=1;i<20;i++)assert.equal((await call(ctx,proposalBody('proposal-cap-'+String(i).padStart(4,'0')))).response.status,200);
 assert.equal((await call(ctx,proposalBody('proposal-cap-0021'))).response.status,400);assert.equal(meals.sql.prepare('SELECT COUNT(*) c FROM meal_weekly_suggestions').get().c,20);assert.equal((await call(ctx,proposalBody())).response.status,200);
 }finally{globalThis.fetch=original;}
});
test('5xx fallback is bounded to two distinct models; unsuccessful output does not cause repair calls',async()=>{
 const {ctx}=fixture();await seedSuggestions(ctx);ctx.env.GEMINI_API_KEY='synthetic-key';let calls=0;const original=globalThis.fetch;globalThis.fetch=async()=>{calls++;return calls===1?new Response('{}',{status:503}):aiResponse(['recipe-ai-0000','recipe-ai-0001','recipe-ai-0002','recipe-ai-0003','recipe-ai-0004']);};try{assert.equal((await call(ctx,proposalBody())).value.suggestion.mode,'AI');assert.equal(calls,2);}finally{globalThis.fetch=original;}
});
test('Web proposal requires review and save, preserves weekend/unsaved edits, and reuses ID after failed transport',async()=>{
 const {Window}=await import(pathToFileURL(createRequire(process.cwd()+'/package.json').resolve('happy-dom')).href),{ctx,meals}=fixture();await seedSuggestions(ctx);
 await call(ctx,{action:'save_plan',plan:{week_start:'2026-10-05',status:'CONFIRMED',items:[{date:'2026-10-10',recipe_id:'recipe-ai-0000',servings:2}]}});
 const window=new Window({url:'https://fixture.invalid/app/meals.php?view=week&week=2026-10-05'});let savedRequests=[],loseResponse=true;
 try{
 window.document.body.innerHTML='<script id="mealPayload" type="application/json">{"csrf":"test","today":"2026-10-05"}</script><p id="mealStatus"></p><section id="mealContent"></section>';
 window.fetch=async(url,options={})=>{const body=options.body?JSON.parse(options.body):null,response=await mealApi(new Request(new URL(url,window.location.href),options),ctx);if(body?.action==='suggest_week'){savedRequests.push(body.request_id);if(loseResponse){loseResponse=false;throw new Error('synthetic lost response');}}return response;};
 window.eval(fs.readFileSync('public/assets/meals.js','utf8'));const settle=async()=>{for(let i=0;i<16;i++)await new Promise(resolve=>setImmediate(resolve));};await settle();const doc=window.document;
 // happy-dom's HTML parser leaves select.value at the first inserted option even
 // when a later option has selected. Emulate native parsed defaults for this fixture.
 const nativeSelectDefaults=()=>doc.querySelectorAll('#planForm select').forEach(s=>s.value=s.querySelector('option[selected]')?.value||'');nativeSelectDefaults();
 assert.equal(doc.querySelector('[name=recipe5]').value,'recipe-ai-0000','initial Saturday');
 doc.querySelector('[name=servings5]').value='3';doc.querySelector('[name=servings5]').dispatchEvent(new window.Event('input',{bubbles:true}));doc.querySelector('#openSuggestions').click();doc.querySelector('#suggestForm').dispatchEvent(new window.Event('submit',{bubbles:true,cancelable:true}));await waitFor(()=>doc.querySelector('#mealStatus').textContent.includes('synthetic lost response'));assert(doc.querySelector('#suggestForm'));doc.querySelector('#suggestForm').dispatchEvent(new window.Event('submit',{bubbles:true,cancelable:true}));await waitFor(()=>doc.querySelector('#applySuggestion'));assert.equal(savedRequests[0],savedRequests[1]);
 assert(doc.querySelector('#applySuggestion'));assert.equal(meals.sql.prepare('SELECT json_array_length(items_json) n FROM weekly_plans').get().n,1);doc.querySelector('#applySuggestion').click();nativeSelectDefaults();assert.equal(doc.querySelector('[name=servings5]').value,'3');assert.equal(doc.querySelector('[name=recipe5]').value,'recipe-ai-0000');assert.equal(doc.querySelector('#shoppingPreview'),null);
 const event=new window.Event('submit',{bubbles:true,cancelable:true});Object.defineProperty(event,'submitter',{value:{value:'DRAFT'}});doc.querySelector('#planForm').dispatchEvent(event);await waitFor(()=>doc.querySelector('#mealStatus').textContent.includes('保存しました'));assert.equal(meals.sql.prepare('SELECT status FROM weekly_plans').get().status,'DRAFT');assert.equal(meals.sql.prepare('SELECT json_array_length(items_json) n FROM weekly_plans').get().n,6);
 }finally{window.happyDOM.abort();window.close();}
});

test('meal deployment readiness reports only booleans; enabled missing migrations fail without exposing errors',async()=>{
 const {ctx,meals}=fixture();const response=await mealsHealth(ctx.env);assert.equal(response.status,200);assert.equal(response.headers.get('cache-control'),'no-store');assert.deepEqual(await response.json(),{ok:true,enabled:true,configured:true,ready:true});
 meals.sql.exec('DROP TABLE meal_weekly_suggestions');const missing=await mealsHealth(ctx.env);assert.equal(missing.status,503);assert.deepEqual(await missing.json(),{ok:false,enabled:true,configured:true,ready:false});
 assert.equal((await mealsHealth({...ctx.env,MEALS_ENABLED:'false'})).status,200);const absent=await mealsHealth({...ctx.env,MEALS_DB:undefined});assert.equal(absent.status,503);
 const broken=await mealsHealth({...ctx.env,MEALS_DB:{prepare(){throw new Error('PRIVATE synthetic SQL or key');}}});assert.equal(broken.status,503);assert(!(await broken.text()).includes('PRIVATE'));
});

async function waitFor(predicate){for(let i=0;i<400;i++){if(predicate())return;await new Promise(r=>setTimeout(r,5));}assert.fail('UI did not finish');}
const importURL='https://delishkitchen.tv/recipes/166742173524427155';
const importHTML=(overrides={})=>'<script type="application/ld+json">'+JSON.stringify({'@context':'https://schema.org','@graph':[{'@type':'Recipe',name:'テスト料理',recipeYield:'2人分',totalTime:'PT1800S',recipeIngredient:['ひき肉 200g','玉ねぎ 1/2個','塩 少々'],recipeInstructions:[{'@type':'HowToSection',itemListElement:[{'@type':'HowToStep',text:'切る'},{'@type':'HowToStep',text:'焼く'}]}],...overrides}]})+'</script>';
test('URL import allows exact HTTPS recipe pages only; structured extraction leaves ambiguous fields empty',()=>{
 assert.equal(mealImportUrl(importURL+'?utm_source=test#x'),importURL);
 for(const url of ['http://delishkitchen.tv/recipes/166742173524427155','https://user:pass@delishkitchen.tv/recipes/166742173524427155','https://delishkitchen.tv.evil.invalid/recipes/166742173524427155','https://127.0.0.1/recipes/166742173524427155','https://[::1]/recipes/166742173524427155','https://2130706433/recipes/166742173524427155','https://169.254.169.254/latest/meta-data','https://delishkitchen.tv:8443/recipes/166742173524427155','https://delishkitchen.tv/redirect','https://youtu.be/test'])assert.throws(()=>mealImportUrl(url));
 const draft=extractMealRecipe(importHTML(),importURL);assert.equal(draft.minutes,30);assert.equal(draft.servings,2);assert.deepEqual(draft.steps,['切る','焼く']);assert.equal(draft.ingredients[1].quantity,0.5);assert.equal(draft.ingredients[2].quantity,null);assert.equal(draft.ingredients[2].unit,'');
 assert.equal(parseImportedIngredient('しょうゆ 大さじ1/2').quantity,0.5);assert.equal(parseImportedIngredient('肉 1/0g').quantity,null);assert.equal(parseImportedIngredient('肉 1〜2g').quantity,null);assert.equal(parseImportedIngredient('肉 1 1/2g').quantity,null);assert.equal(parseImportedIngredient('肉 約200g').quantity,null);
 assert.equal(extractMealRecipe(importHTML({totalTime:undefined,recipeYield:'10枚分'}),importURL).servings,null);
 assert.throws(()=>extractMealRecipe(importHTML()+importHTML(),importURL));assert.throws(()=>extractMealRecipe('<script type="application/ld+json">broken</script>',importURL));assert.throws(()=>extractMealRecipe(importHTML({recipeInstructions:['x'.repeat(2001)]}),importURL));
});
test('URL import is tenant scoped, claimed once, retryable without another fetch, and never saves recipes or calls AI',async()=>{
 const {ctx,meals}=fixture(),real=globalThis.fetch;let count=0;
 globalThis.fetch=async(url,options)=>{count++;assert.equal(url,importURL);assert.equal(options.redirect,'manual');assert.deepEqual(options.headers,{accept:'text/html'});return new Response(importHTML(),{headers:{'content-type':'text/html'}});};
 try{
  const body={action:'import_url',request_id:'import-test-0001',url:importURL,family_id:2};
  assert.equal((await call({...ctx,member:null},body)).response.status,401);assert.equal((await call(ctx,{...body,csrf:'wrong'})).response.status,403);assert.equal(count,0);
  const results=await Promise.all([call(ctx,body),call(ctx,body)]);assert(results.some(r=>r.response.status===200));assert.equal(count,1);
  const again=await call(ctx,body);assert.equal(again.value.draft.name,'テスト料理');assert.equal(count,1);assert.equal(meals.sql.prepare('SELECT COUNT(*) n FROM recipes').get().n,0);assert.equal(meals.sql.prepare('SELECT COUNT(*) n FROM weekly_plans').get().n,0);
  assert.equal((await call(ctx,{...body,url:'https://delishkitchen.tv/recipes/125436472865063179'})).response.status,400);assert.equal(count,1);
  await call({...ctx,member:{...ctx.member,id:2,family_id:2}},body);assert.equal(count,2);assert.equal(meals.sql.prepare('SELECT COUNT(*) n FROM meal_url_imports').get().n,2);
  const broken={...ctx,env:{...ctx.env,MEALS_DB:{prepare(){throw new Error('synthetic storage failure');}}}};await assert.rejects(()=>call(broken,{...body,request_id:'import-broken-01'}));assert.equal(count,2);
 }finally{globalThis.fetch=real;}
});
test('URL fetch revalidates redirects, bounds bytes/type, caches failures, and caps fresh imports',async()=>{
 const {ctx}=fixture(),real=globalThis.fetch;let count=0;
 try{
  globalThis.fetch=async()=>{count++;return new Response('',{status:302,headers:{location:'http://169.254.169.254/latest/meta-data'}});};
  const body={action:'import_url',request_id:'import-redirect-01',url:importURL};assert.equal((await call(ctx,body)).response.status,400);await call(ctx,body);assert.equal(count,1);
  for(const [i,response] of [new Response('video',{headers:{'content-type':'video/mp4'}}),new Response('x',{headers:{'content-type':'text/html','content-length':'2000001'}}),new Response('x'.repeat(2000001),{headers:{'content-type':'text/html'}}),new Response('unavailable',{status:429})].entries()){
   globalThis.fetch=async()=>{count++;return response;};assert.equal((await call(ctx,{...body,request_id:'import-bounded-'+i})).response.status,400);
  }
  globalThis.fetch=async()=>{count++;return new Response(importHTML(),{headers:{'content-type':'text/html'}});};
  for(let i=5;i<20;i++)assert.equal((await call(ctx,{...body,request_id:'import-limit-'+i})).response.status,200);
  assert.equal(count,20);assert.equal((await call(ctx,{...body,request_id:'import-over-limit'})).response.status,400);assert.equal(count,20);
 }finally{globalThis.fetch=real;}
});
test('Web URL import reuses request after lost response, leaves uncertain quantities blank, and saves only after editing',async()=>{
 const {Window}=await import(pathToFileURL(createRequire(process.cwd()+'/package.json').resolve('happy-dom')).href),{ctx,meals}=fixture(),real=globalThis.fetch,window=new Window({url:'https://fixture.invalid/app/meals.php?view=recipes'});let count=0,lost=true,ids=[];
 try{
  globalThis.fetch=async()=>{count++;return new Response(importHTML({name:'テスト <img src=x onerror=alert(1)>'}),{headers:{'content-type':'text/html'}});};
  window.document.body.innerHTML='<script id="mealPayload" type="application/json">{"csrf":"test","today":"2026-10-05"}</script><p id="mealStatus"></p><section id="mealContent"></section>';
  window.fetch=async(url,options={})=>{const body=options.body?JSON.parse(options.body):null,response=await mealApi(new Request(new URL(url,window.location.href),options),ctx);if(body?.action==='import_url'){ids.push(body.request_id);if(lost){lost=false;throw new Error('synthetic lost response');}}return response;};window.eval(fs.readFileSync('public/assets/meals.js','utf8'));const doc=window.document;
  await waitFor(()=>doc.querySelector('#importRecipe'));doc.querySelector('#importRecipe').click();doc.querySelector('#importForm [name=url]').value=importURL;
  doc.querySelector('#importForm').dispatchEvent(new window.Event('submit',{bubbles:true,cancelable:true}));await waitFor(()=>doc.querySelector('#mealStatus').textContent.includes('synthetic lost response'));
  doc.querySelector('#importForm').dispatchEvent(new window.Event('submit',{bubbles:true,cancelable:true}));await waitFor(()=>doc.querySelector('#recipeForm'));assert.equal(ids[0],ids[1]);assert.equal(count,1);assert.equal(doc.querySelector('img'),null);assert.equal(meals.sql.prepare('SELECT COUNT(*) n FROM recipes').get().n,0);
  const rows=doc.querySelectorAll('.meal-ingredient');assert.equal(rows[2].querySelector('[data-field=quantity]').value,'');assert.equal(rows[2].querySelector('[data-field=unit]').value,'');assert(rows[2].textContent.includes('塩 少々'));
  rows[2].querySelector('[data-field=name]').value='塩';rows[2].querySelector('[data-field=quantity]').value='1';rows[2].querySelector('[data-field=unit]').value='g';
  doc.querySelector('#recipeForm').dispatchEvent(new window.Event('submit',{bubbles:true,cancelable:true}));await waitFor(()=>doc.querySelector('#mealStatus').textContent.includes('保存しました'));assert.equal(meals.sql.prepare('SELECT COUNT(*) n FROM recipes').get().n,1);assert.equal(count,1);
 }finally{globalThis.fetch=real;window.happyDOM.abort();window.close();}
});

test('URL import follows only approved recipe redirects and stops after three transfers',async()=>{
 const real=globalThis.fetch;let urls=[];
 try{
  const {ctx}=fixture();globalThis.fetch=async u=>{urls.push(u);return urls.length===1?new Response('',{status:302,headers:{location:'https://www.kurashiru.com/recipes/00000000-0000-0000-0000-000000000001'}}):new Response(importHTML(),{headers:{'content-type':'text/html'}});};
  const result=await call(ctx,{action:'import_url',request_id:'import-safe-redirect',url:importURL});assert.equal(result.response.status,200);assert.equal(result.value.draft.source_url,urls[1]);assert.equal(urls.length,2);
  urls=[];globalThis.fetch=async u=>{urls.push(u);return new Response('',{status:302,headers:{location:importURL}});};assert.equal((await call(ctx,{action:'import_url',request_id:'import-loop-redirect',url:importURL})).response.status,400);assert.equal(urls.length,4);
 }finally{globalThis.fetch=real;}
});

const lot=(overrides={})=>({name:'ひき肉',tracking:'EXACT',quantity:300,unit:'g',present:true,storage:'FRIDGE',purchased_on:'2026-10-01',expires_on:'2099-12-31',...overrides});
async function addLot(ctx,id='inventory-lot-0001',overrides={}){const response=await call(ctx,{action:'inventory_add',request_id:id,lot:lot(overrides)});assert.equal(response.response.status,200);return id;}
async function stock(ctx){return (await call(ctx,null,'?view=inventory')).value.inventory;}
test('inventory add/adjust/archive is tenant scoped, revision guarded and idempotent with immutable audit',async()=>{
 const {ctx,meals}=fixture();await addLot(ctx);await addLot(ctx);let inventory=await stock(ctx);assert.equal(inventory.revision,1);assert.equal(inventory.lots.length,1);assert.equal(meals.sql.prepare('SELECT COUNT(*) n FROM inventory_events').get().n,1);
 const other={...ctx,member:{...ctx.member,id:2,family_id:2}};assert.equal((await stock(other)).lots.length,0);const old=inventory.lots[0];
 const body={action:'inventory_adjust',id:old.id,revision:old.revision,request_id:'inventory-adjust-01',lot:lot({quantity:123.4567})};assert.equal((await call(other,body)).response.status,400);assert.equal((await call(ctx,{...body,csrf:'wrong'})).response.status,403);
 await Promise.all([call(ctx,body),call(ctx,body)]);inventory=await stock(ctx);assert.equal(inventory.lots[0].quantity,123.4567);assert.equal(inventory.revision,2);await call(ctx,body);assert.equal((await stock(ctx)).revision,2);
 assert.equal((await call(ctx,{...body,request_id:'inventory-stale-01'})).response.status,400);assert.equal((await call(ctx,{...body,lot:lot({quantity:10})})).response.status,400);
 const event=meals.sql.prepare("SELECT before_json,after_json FROM inventory_events WHERE kind='ADJUST'").get();assert.equal(JSON.parse(event.before_json).remaining_ticks,3000000);assert.equal(JSON.parse(event.after_json).remaining_ticks,1234567);
 const current=inventory.lots[0],archive={action:'inventory_archive',request_id:'inventory-archive-01',id:current.id,revision:current.revision};await call(ctx,archive);await call(ctx,archive);assert.equal((await stock(ctx)).lots.length,0);await addLot(ctx);assert.equal((await stock(ctx)).lots.length,0,'a late purchase retry cannot resurrect removed stock');
});
test('inventory rejects malformed quantities/modes and rolls back claim, lot and audit together on failure',async()=>{
 const {ctx,meals}=fixture();for(const value of [lot({quantity:-1}),lot({quantity:100001}),lot({quantity:0.00001}),lot({tracking:'INVALID'}),lot({purchased_on:'2026-02-30'}),lot({storage:'INVALID'}),lot({unit:''})])assert.equal((await call(ctx,{action:'inventory_add',request_id:'inventory-invalid',lot:value})).response.status,400);
 meals.sql.exec("CREATE TRIGGER inventory_test_fail BEFORE INSERT ON inventory_events BEGIN SELECT RAISE(ABORT,'synthetic event failure'); END");await assert.rejects(()=>call(ctx,{action:'inventory_add',request_id:'inventory-failed-01',lot:lot()}));assert.equal((await stock(ctx)).lots.length,0);assert.equal(meals.sql.prepare('SELECT COUNT(*) n FROM meal_inventory_operations').get().n,0);
});
test('shopping subtracts exact usable stock only, retains units, excludes cooked meals and rejects stale inventory',async()=>{
 const {ctx}=fixture();await seed(ctx);await addLot(ctx,'inventory-meat-exact',{quantity:200});await addLot(ctx,'inventory-meat-expired',{quantity:500,expires_on:'2020-01-01'});await addLot(ctx,'inventory-meat-approx',{quantity:800,tracking:'APPROXIMATE'});await addLot(ctx,'inventory-meat-pack',{quantity:1,unit:'パック'});await addLot(ctx,'inventory-meat-present',{tracking:'PRESENCE'});await addLot(ctx,'inventory-onion-001',{name:'玉ねぎ',quantity:3,unit:'個'});
 const preview=(await call(ctx,null,'?view=shopping_preview&week=2026-10-05')).value;assert.equal(preview.needs[0].quantity,700);assert.equal(preview.needs[0].available_quantity,200);assert.equal(preview.needs[1].quantity,0);
 assert.equal((await call(ctx,{action:'shopping_confirm',week_start:'2026-10-05',revision:preview.revision,preview_hash:preview.preview_hash,selected:[1]})).response.status,400);
 await addLot(ctx,'inventory-changed-01',{quantity:100});assert.equal((await call(ctx,{action:'shopping_confirm',week_start:'2026-10-05',revision:preview.revision,preview_hash:preview.preview_hash,selected:[0]})).response.status,409);
 await call(ctx,{action:'cooked',date:'2026-10-05',revision:preview.revision});const next=(await call(ctx,null,'?view=shopping_preview&week=2026-10-05')).value;assert.equal(next.needs[0].required_quantity,300);assert.equal(next.needs[0].quantity,0);
});
test('cooking reviews FEFO lots; record, exact consumption and audit are atomic and parallel retries cannot consume twice',async()=>{
 const {ctx,meals}=fixture();const plan=await seed(ctx);await addLot(ctx,'inventory-later-meat',{quantity:400,expires_on:'2099-12-31'});await addLot(ctx,'inventory-earlier-meat',{quantity:250,expires_on:'2099-12-30'});await addLot(ctx,'inventory-expired-meat',{quantity:100,expires_on:'2020-01-01'});await addLot(ctx,'inventory-approx-meat',{quantity:800,tracking:'APPROXIMATE'});
 const preview=(await call(ctx,null,'?view=cooking_preview&date=2026-10-05')).value.preview;assert.deepEqual(preview.allocations.map(a=>[a.id,a.quantity]),[['inventory-earlier-meat',250],['inventory-later-meat',350]]);assert.equal(meals.sql.prepare('SELECT COUNT(*) n FROM cooked_events').get().n,0);
 const body={action:'cooked',date:preview.date,revision:plan.revision,consume_inventory:true,preview_hash:preview.preview_hash};const result=await Promise.all([call(ctx,body),call(ctx,body)]);assert(result.some(r=>r.response.status===200));assert.equal(meals.sql.prepare('SELECT COUNT(*) n FROM cooked_events').get().n,1);assert.equal(meals.sql.prepare("SELECT COUNT(*) n FROM inventory_events WHERE kind='CONSUME'").get().n,2);
 const rows=(await stock(ctx)).lots;assert.equal(rows.find(l=>l.id==='inventory-earlier-meat').quantity,0);assert.equal(rows.find(l=>l.id==='inventory-later-meat').quantity,50);assert.equal(rows.find(l=>l.id==='inventory-expired-meat').quantity,100);assert.equal(rows.find(l=>l.id==='inventory-approx-meat').quantity,800);
 await addLot(ctx,'inventory-new-after-cook',{quantity:300});await call(ctx,body);assert.equal((await stock(ctx)).lots.find(l=>l.id==='inventory-new-after-cook').quantity,300);
});
test('cooking stale approval never changes stock; opt-out records only; failing audit rolls back every write',async()=>{
 const {ctx,meals}=fixture();const plan=await seed(ctx);await addLot(ctx);const preview=(await call(ctx,null,'?view=cooking_preview&date=2026-10-05')).value.preview;
 await addLot(ctx,'inventory-more-stock',{quantity:100});const body={action:'cooked',date:'2026-10-05',revision:plan.revision,consume_inventory:true,preview_hash:preview.preview_hash};assert.equal((await call(ctx,body)).response.status,400);assert.equal(meals.sql.prepare('SELECT COUNT(*) n FROM cooked_events').get().n,0);
 const fresh=(await call(ctx,null,'?view=cooking_preview&date=2026-10-05')).value.preview;
 meals.sql.exec("CREATE TRIGGER inventory_cook_fail BEFORE INSERT ON inventory_events WHEN NEW.kind='CONSUME' BEGIN SELECT RAISE(ABORT,'synthetic audit failure'); END");await assert.rejects(()=>call(ctx,{...body,preview_hash:fresh.preview_hash}));assert.equal(meals.sql.prepare('SELECT COUNT(*) n FROM cooked_events').get().n,0);assert.equal((await stock(ctx)).lots.reduce((n,l)=>n+l.quantity,0),400);
 meals.sql.exec('DROP TRIGGER inventory_cook_fail');await call(ctx,{...body,consume_inventory:false});assert.equal((await stock(ctx)).lots.reduce((n,l)=>n+l.quantity,0),400);assert.equal(meals.sql.prepare('SELECT COUNT(*) n FROM cooked_events').get().n,1);
});
test('inventory registration caps active lots at 200 and cooking caps allocations at 16 within statement budget',async()=>{
 const {ctx}=fixture();await seed(ctx);for(let i=0;i<200;i++)await addLot(ctx,'inventory-limit-'+String(i).padStart(4,'0'),{quantity:1});assert.equal((await call(ctx,{action:'inventory_add',request_id:'inventory-limit-over',lot:lot()})).response.status,400);
 const preview=(await call(ctx,null,'?view=cooking_preview&date=2026-10-05')).value.preview;assert.equal(preview.allocations.length,16);assert.equal(preview.allocation_limited,true);const result=await call(ctx,{action:'cooked',date:preview.date,revision:preview.revision,consume_inventory:true,preview_hash:preview.preview_hash});assert.equal(result.response.status,200);assert.equal((await stock(ctx)).lots.reduce((n,l)=>n+l.quantity,0),184);
});

test('Web stock registration reuses receipt after lost response and cooking always reviews before writing',async()=>{
 const {Window}=await import(pathToFileURL(createRequire(process.cwd()+'/package.json').resolve('happy-dom')).href),{ctx,meals}=fixture();await seed(ctx);const windows=[];let ids=[],lost=true;
 const browser=async url=>{const w=new Window({url});windows.push(w);w.document.body.innerHTML='<script id="mealPayload" type="application/json">{"csrf":"test","today":"2026-10-05"}</script><p id="mealStatus"></p><section id="mealContent"></section>';w.fetch=async(url,options={})=>{const body=options.body?JSON.parse(options.body):null,response=await mealApi(new Request(new URL(url,w.location.href),options),ctx);if(body?.action==='inventory_add'){ids.push(body.request_id);if(lost){lost=false;throw new Error('synthetic lost response');}}return response;};w.eval(fs.readFileSync('public/assets/meals.js','utf8'));return w;};
 try{
  const w=await browser('https://fixture.invalid/app/meals.php?view=inventory'),doc=w.document;await waitFor(()=>doc.querySelector('#newLot'));doc.querySelector('#newLot').click();const form=doc.querySelector('#inventoryForm');form.elements.name.value='ひき肉';form.elements.quantity.value='400';
  form.dispatchEvent(new w.Event('submit',{bubbles:true,cancelable:true}));await waitFor(()=>doc.querySelector('#mealStatus').textContent.includes('synthetic lost response'));form.dispatchEvent(new w.Event('submit',{bubbles:true,cancelable:true}));await waitFor(()=>doc.querySelector('#newLot'));assert.equal(ids[0],ids[1]);assert.equal((await stock(ctx)).lots.length,1);
  const c=await browser('https://fixture.invalid/app/meals.php?view=cook&date=2026-10-05'),cd=c.document;await waitFor(()=>cd.querySelector('#cooked'));cd.querySelector('#cooked').click();await waitFor(()=>cd.querySelector('#confirmCooked'));assert.equal(meals.sql.prepare('SELECT COUNT(*) n FROM cooked_events').get().n,0);assert(cd.querySelector('#consumeInventory').checked);assert(cd.querySelector('#mealContent').textContent.includes('400g'));
  cd.querySelector('#cancelCooked').click();assert.equal((await stock(ctx)).lots[0].quantity,400);cd.querySelector('#cooked').click();await waitFor(()=>cd.querySelector('#confirmCooked'));cd.querySelector('#confirmCooked').click();await waitFor(()=>cd.querySelector('#cooked')?.disabled);assert.equal((await stock(ctx)).lots[0].quantity,0);assert.equal(meals.sql.prepare('SELECT COUNT(*) n FROM cooked_events').get().n,1);
 }finally{windows.forEach(w=>{w.happyDOM.abort();w.close();});}
});

const receiptPNG='iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jIh0AAAAASUVORK5CYII=';
const photoBody={action:'receipt_import',request_id:'receipt-photo-0001',mime_type:'image/png',image_base64:receiptPNG};
const receiptAI=items=>new Response(JSON.stringify({candidates:[{content:{parts:[{text:JSON.stringify({items})}]}}]}),{headers:{'content-type':'application/json'}});
test('receipt schema rejects invented fields/counts; manual import matches only pending shared items of this family',async()=>{
 assert(validateReceiptItems({items:[{label:'ひき肉',count:2,confidence:'LOW'}]}));for(const value of [{items:[{label:'肉',count:-1,confidence:'HIGH'}]},{items:[{label:'肉',count:2.5,confidence:'HIGH'}]},{items:[{label:'肉',count:null,confidence:'HIGH',grams:300}]},{items:[],address:'private'}])assert.equal(validateReceiptItems(value),null);
 const {ctx,main,meals}=fixture();main.sql.exec("INSERT INTO shopping_items(family_id,name,quantity,status,visibility_scope,private_owner_id,created_at,updated_at) VALUES(1,'ひき肉','300g','pending','FAMILY',NULL,'x','x'),(2,'ひき肉','900g','pending','FAMILY',NULL,'x','x'),(1,'玉ねぎ','1個','pending','PRIVATE',1,'x','x');");
 const body={action:'receipt_import',request_id:'receipt-manual-01',manual_text:'ひき肉\n玉ねぎ'};const result=await call(ctx,body);assert.equal(result.value.receipt.items.length,2);assert.equal(result.value.receipt.items[0].matches.length,1);assert.equal(result.value.receipt.items[0].matches[0].quantity,'300g');assert.equal(result.value.receipt.items[1].matches.length,0);assert.equal((await stock(ctx)).lots.length,0);assert.equal(main.sql.prepare("SELECT COUNT(*) n FROM shopping_items WHERE status='pending'").get().n,3);
 await call(ctx,body);assert.equal(meals.sql.prepare('SELECT COUNT(*) n FROM receipt_items').get().n,2);assert.equal((await call(ctx,{...body,manual_text:'牛乳'})).response.status,400);
});
test('photo receipt is budgeted and claimed once; request retries retain only validated labels, never image or raw response',async()=>{
 const {ctx,meals,main}=fixture(),real=globalThis.fetch;ctx.env.GEMINI_API_KEY='synthetic-key';ctx.env.FAMILY_AI_PROVIDER='GEMINI';let count=0;
 globalThis.fetch=async(url,options)=>{count++;const body=JSON.parse(options.body);assert.equal(body.contents[0].parts[0].inlineData.data,receiptPNG);return receiptAI([{label:'ひき肉',count:2,confidence:'MEDIUM'}]);};
 try{
  assert.equal((await call({...ctx,member:null},photoBody)).response.status,401);assert.equal((await call(ctx,{...photoBody,csrf:'wrong'})).response.status,403);assert.equal(count,0);
  const results=await Promise.all([call(ctx,photoBody),call(ctx,photoBody)]);assert(results.some(r=>r.response.status===200));assert.equal(count,1);const again=await call(ctx,photoBody);assert.equal(again.value.receipt.items[0].package_count,2);assert.equal(count,1);
  const persisted=JSON.stringify(meals.sql.prepare('SELECT * FROM receipt_imports').get())+JSON.stringify(meals.sql.prepare('SELECT * FROM receipt_items').get());assert(!persisted.includes(receiptPNG));assert(!persisted.includes('synthetic-key'));assert(!persisted.includes('candidates'));assert.equal(main.sql.prepare("SELECT SUM(calls) n FROM ai_call_daily WHERE feature='MEAL_RECEIPT_PARSE'").get().n,1);assert.equal((await stock(ctx)).lots.length,0);
 }finally{globalThis.fetch=real;}
});
test('receipt quota has no cross-model fallback/retry, malformed answers degrade, and manual remains usable',async()=>{
 const {ctx}=fixture(),real=globalThis.fetch;ctx.env.GEMINI_API_KEY='synthetic-key';let count=0;
 try{
  globalThis.fetch=async()=>{count++;return new Response('private upstream body',{status:429});};const result=await call(ctx,photoBody);assert.equal(result.value.receipt.error_code,'RATE_LIMIT');await call(ctx,photoBody);assert.equal(count,1);assert.equal(result.value.receipt.items.length,0);assert(!JSON.stringify(result.value).includes('private'));
  assert.equal((await call(ctx,{action:'receipt_import',request_id:'receipt-manual-quota',manual_text:'牛乳'})).response.status,200);
  const f=fixture();f.ctx.env.GEMINI_API_KEY='synthetic-key';globalThis.fetch=async()=>{count++;return receiptAI([{label:'肉',count:300,confidence:'HIGH',grams:300}]);};const invalid=await call(f.ctx,photoBody);assert.equal(invalid.value.receipt.error_code,'INVALID_OUTPUT');assert.equal(invalid.value.receipt.items.length,0);
  const missing=await call(fixture().ctx,photoBody);assert.equal(missing.value.receipt.error_code,'NOT_CONFIGURED');assert.equal(count,2);
  const before=count;for(const override of [{mime_type:'image/svg+xml'},{image_base64:'bad'},{image_base64:Buffer.from('not a png image').toString('base64')}])assert.equal((await call(ctx,{...photoBody,...override,request_id:'receipt-invalid-image'})).response.status,400);assert.equal(count,before);
 }finally{globalThis.fetch=real;}
});
test('receipt 5xx fallback is bounded and fresh import limit does not prevent old receipt retries',async()=>{
 const {ctx}=fixture(),real=globalThis.fetch;ctx.env.GEMINI_API_KEY='synthetic-key';let count=0;
 try{globalThis.fetch=async()=>{count++;return count===1?new Response('',{status:503}):receiptAI([{label:'牛乳',count:null,confidence:'LOW'}]);};assert.equal((await call(ctx,photoBody)).value.receipt.items.length,1);assert.equal(count,2);
  for(let i=1;i<20;i++)assert.equal((await call(ctx,{action:'receipt_import',request_id:'receipt-daily-'+i,manual_text:'牛乳'})).response.status,200);
  assert.equal((await call(ctx,{action:'receipt_import',request_id:'receipt-over-daily',manual_text:'牛乳'})).response.status,400);assert.equal((await call(ctx,photoBody)).response.status,200);assert.equal(count,2);
 }finally{globalThis.fetch=real;}
});
test('receipt item confirmation and stock/audit are atomic, tenant scoped and retry-safe after removal',async()=>{
 const {ctx,meals}=fixture();await call(ctx,{action:'receipt_import',request_id:'receipt-stock-0001',manual_text:'ひき肉'});const body={action:'receipt_confirm',id:'receipt-stock-0001',item_index:0,lot:lot()};assert.equal((await call({...ctx,member:{...ctx.member,id:2,family_id:2}},body)).response.status,400);
 meals.sql.exec("CREATE TRIGGER receipt_fail BEFORE INSERT ON inventory_events BEGIN SELECT RAISE(ABORT,'synthetic receipt audit failure'); END");await assert.rejects(()=>call(ctx,body));assert.equal((await stock(ctx)).lots.length,0);assert.equal(meals.sql.prepare('SELECT status FROM receipt_items').get().status,'PENDING');meals.sql.exec('DROP TRIGGER receipt_fail');
 const results=await Promise.all([call(ctx,body),call(ctx,body)]);assert(results.every(r=>r.response.status===200));const inventory=await stock(ctx);assert.equal(inventory.lots.length,1);assert.equal(inventory.lots[0].quantity,300);assert.equal(meals.sql.prepare('SELECT COUNT(*) n FROM inventory_events').get().n,1);assert.equal(inventory.revision,1);
 assert.equal((await call(ctx,{...body,lot:lot({quantity:900})})).response.status,400);await call(ctx,{action:'inventory_archive',request_id:'receipt-stock-archive',id:inventory.lots[0].id,revision:inventory.lots[0].revision});await call(ctx,body);assert.equal((await stock(ctx)).lots.length,0);
});
test('Web manual receipt leaves stock amount empty and requires explicit per-item confirmation',async()=>{
 const {Window}=await import(pathToFileURL(createRequire(process.cwd()+'/package.json').resolve('happy-dom')).href),{ctx,meals}=fixture(),w=new Window({url:'https://fixture.invalid/app/meals.php?view=receipts'});let lost=true,ids=[];
 try{
  w.document.body.innerHTML='<script id="mealPayload" type="application/json">{"csrf":"test","today":"2026-10-05"}</script><p id="mealStatus"></p><section id="mealContent"></section>';w.fetch=async(url,options={})=>{const body=options.body?JSON.parse(options.body):null,response=await mealApi(new Request(new URL(url,w.location.href),options),ctx);if(body?.action==='receipt_import'){ids.push(body.request_id);if(lost){lost=false;throw new Error('synthetic lost response');}}return response;};w.eval(fs.readFileSync('public/assets/meals.js','utf8'));const doc=w.document;
  await waitFor(()=>doc.querySelector('#newReceipt'));doc.querySelector('#newReceipt').click();const form=doc.querySelector('#receiptForm');form.elements.manual_text.value='ひき肉';const submit=()=>{const e=new w.Event('submit',{bubbles:true,cancelable:true});Object.defineProperty(e,'submitter',{value:{value:'MANUAL'}});form.dispatchEvent(e);};submit();await waitFor(()=>doc.querySelector('#mealStatus').textContent.includes('synthetic lost response'));submit();await waitFor(()=>doc.querySelector('[data-receipt-item]'));assert.equal(ids[0],ids[1]);assert.equal((await stock(ctx)).lots.length,0);
  doc.querySelector('[data-receipt-item]').click();const editor=doc.querySelector('#inventoryForm');assert.equal(editor.elements.quantity.value,'');assert.equal(editor.elements.unit.value,'');editor.elements.quantity.value='300';editor.elements.unit.value='g';editor.dispatchEvent(new w.Event('submit',{bubbles:true,cancelable:true}));await waitFor(()=>doc.querySelector('#mealStatus').textContent.includes('在庫を保存'));assert.equal((await stock(ctx)).lots[0].quantity,300);assert.equal(doc.querySelector('[data-receipt-item]'),null);assert.equal(meals.sql.prepare('SELECT status FROM receipt_items').get().status,'CONFIRMED');
 }finally{w.happyDOM.abort();w.close();}
});

test('many shopping needs and receipt labels fit the Free D1 statement budget without partial insertion',async()=>{
 const {ctx,main,meals}=fixture();const mainBatch=ctx.env.DB.batch,mealBatch=ctx.env.MEALS_DB.batch;ctx.env.DB.batch=stmts=>{assert(stmts.length<=50,'main free query budget');return mainBatch(stmts);};ctx.env.MEALS_DB.batch=stmts=>{assert(stmts.length<=50,'meal free query budget');return mealBatch(stmts);};
 for(let i=0;i<2;i++)await call(ctx,{action:'save_recipe',recipe:{...recipe('recipe-many-'+i),ingredients:Array.from({length:30},(_,j)=>({name:'食材'+(i*30+j),quantity:1,unit:'個'}))}});
 const plan=(await call(ctx,{action:'save_plan',plan:{week_start:'2026-10-05',status:'CONFIRMED',items:[{date:'2026-10-05',recipe_id:'recipe-many-0',servings:2},{date:'2026-10-06',recipe_id:'recipe-many-1',servings:2}]}})).value.plan;
 const preview=(await call(ctx,null,'?view=shopping_preview&week=2026-10-05')).value;assert.equal(preview.needs.length,60);const body={action:'shopping_confirm',week_start:'2026-10-05',revision:plan.revision,preview_hash:preview.preview_hash,selected:Array.from({length:60},(_,i)=>i)};assert.equal((await call(ctx,body)).response.status,200);await call(ctx,body);assert.equal(main.sql.prepare('SELECT COUNT(*) n FROM shopping_items').get().n,60);
 const result=await call(ctx,{action:'receipt_import',request_id:'receipt-many-labels',manual_text:Array.from({length:40},(_,i)=>'食材'+i).join('\n')});assert.equal(result.value.receipt.items.length,40);assert.equal(meals.sql.prepare('SELECT COUNT(*) n FROM receipt_items').get().n,40);
});

test('receipt upload rejects oversized chunked input before buffering the entire stream or calling AI',async()=>{
 const {ctx}=fixture();let canceled=false;const stream=new ReadableStream({start(controller){controller.enqueue(new Uint8Array(450000));controller.enqueue(new Uint8Array(450000));},cancel(){canceled=true;}});
 const request=new Request('https://fixture.invalid/api/meals/v1',{method:'POST',body:stream,duplex:'half'});assert.equal((await mealApi(request,ctx)).status,413);assert.equal(canceled,true);
});

function babySeed(main){main.sql.exec("INSERT INTO family_log_subjects(id,family_id,name,subject_kind,birth_date,active,created_at,updated_at) VALUES(1,1,'赤ちゃん','BABY','2026-02-26',1,'x','x'),(2,2,'別家族','BABY','2026-02-26',1,'x','x'),(3,1,'非表示','BABY','2026-02-26',0,'x','x');");}
const babyC=()=>({stage:'MIDDLE',readiness_confirmed:true,introduced:['ひき肉','玉ねぎ'],avoid:[]});
test('baby ages use calendar months and invalid or future birthdays fail closed',()=>{
 assert.equal(babyAgeMonths('2026-02-26','2026-10-25'),7);assert.equal(babyAgeMonths('2026-02-26','2026-10-26'),8);assert.equal(babyAgeMonths('2025-10-06','2026-10-05'),11);assert.equal(babyAgeMonths('2025-10-05','2026-10-05'),12);assert.equal(babyAgeMonths('2026-02-30','2026-10-05'),null);assert.equal(babyAgeMonths('2027-01-01','2026-10-05'),null);
});
test('baby profiles reference active own subjects, share conditions, reject stale concurrent edits and replay identical saves',async()=>{
 const {ctx,main,meals}=fixture();babySeed(main);const body={action:'baby_save',subject_id:1,conditions:babyC(),family_id:2};const p=(await call(ctx,body)).value.profile;assert(p.revision);assert.equal((await call(ctx,body)).value.profile.revision,p.revision);
 assert.equal((await call(ctx,{...body,subject_id:2})).response.status,400);assert.equal((await call(ctx,{...body,subject_id:3})).response.status,400);
 const edits=await Promise.all(['EARLY','LATE'].map(stage=>call(ctx,{...body,revision:p.revision,conditions:{...babyC(),stage}})));assert.equal(edits.filter(x=>x.response.status===200).length,1);assert.equal(edits.filter(x=>x.response.status===400).length,1);
 assert.equal((await call(ctx,null,'?view=baby')).value.baby.children.length,1);assert.equal((await call({...ctx,member:{id:2,family_id:2}},null,'?view=baby')).value.baby.children[0].profile,null);assert.equal(meals.sql.prepare('SELECT COUNT(*) c FROM meal_baby_profiles').get().c,1);
 assert.equal((await call(ctx,{...body,conditions:{...babyC(),avoid:Array(101).fill('卵')}})).response.status,400);assert.equal((await call(ctx,{...body,conditions:{...babyC(),readiness_confirmed:'yes'}})).response.status,400);
 main.sql.exec('UPDATE family_log_subjects SET active=0 WHERE id=1');assert.equal((await call(ctx,{...body,revision:p.revision})).response.status,400);
});
test('baby deterministic checks never approve suitability; honey block cannot be overridden by heat or UI declaration',()=>{
 const raw={honey:'NO',heating:'HEATED',texture_confirmed:true,allergens_confirmed:true};
 for(const age of [null,0,11]){const r=checkBabyMeal(age,babyC(),['はちみつ入りソース'],raw);assert.equal(r.status,'BLOCKED');assert(r.notices.some(x=>x.code==='HONEY'));}
 assert.equal(checkBabyMeal(12,babyC(),['ひき肉','玉ねぎ'],raw).status,'REVIEW_REQUIRED');assert.equal(checkBabyMeal(7,{...babyC(),avoid:['肉']},['ひき肉'],raw).status,'BLOCKED');
 const missing=checkBabyMeal(null,null,['不明な加工品'],{...raw,honey:'UNKNOWN',heating:'UNKNOWN',texture_confirmed:false,allergens_confirmed:false});for(const code of ['AGE_UNKNOWN','PROFILE_MISSING','READINESS_UNKNOWN','STAGE_UNKNOWN','NOT_INTRODUCED','HEATING_UNKNOWN','TEXTURE_UNKNOWN','ALLERGENS_UNKNOWN','FINAL_REVIEW'])assert(missing.notices.some(n=>n.code===code));
 assert.throws(()=>checkBabyMeal(7,babyC(),[],{...raw,honey:'SAFE'}));
});
test('baby preview uses owned stored recipe/profile revisions and performs no AI or domain writes',async()=>{
 const {ctx,main,meals}=fixture();babySeed(main);await seed(ctx);const p=(await call(ctx,{action:'baby_save',subject_id:1,conditions:babyC()})).value.profile,r=(await call(ctx,null,'?view=recipe&id=recipe-test-001')).value.recipe;
 const b={action:'baby_preview',subject_id:1,profile_revision:p.revision,recipe_id:r.id,recipe_revision:r.revision,honey:'UNKNOWN',heating:'UNKNOWN',texture_confirmed:false,allergens_confirmed:false};const before=meals.sql.prepare('SELECT total_changes() n').get().n,real=globalThis.fetch;globalThis.fetch=()=>{throw new Error('AI must not run');};try{assert.equal((await call(ctx,b)).value.review.status,'REVIEW_REQUIRED');assert.equal((await call(ctx,{...b,recipe_revision:'stale'})).response.status,400);assert.equal((await call(ctx,{...b,profile_revision:'stale'})).response.status,400);assert.equal((await call(ctx,{...b,subject_id:2})).response.status,400);assert.equal((await call({...ctx,member:{id:2,family_id:2}},b)).response.status,400);}finally{globalThis.fetch=real;}
 assert.equal(meals.sql.prepare('SELECT total_changes() n').get().n,before);assert.equal(main.sql.prepare('SELECT COUNT(*) c FROM ai_call_daily').get().c,0);
});
test('baby UI saves shared conditions before review, escapes names, defaults unknown and invalidates changed checks',async()=>{
 const {Window}=await import(pathToFileURL(createRequire(process.cwd()+'/package.json').resolve('happy-dom')).href),{ctx,main}=fixture();babySeed(main);main.sql.exec("UPDATE family_log_subjects SET name='<img src=x onerror=alert(1)>' WHERE id=1");await seed(ctx);
 const w=new Window({url:'https://fixture.invalid/app/meals.php?view=baby'});w.document.body.innerHTML='<script id="mealPayload" type="application/json">{"csrf":"test","today":"2026-10-05"}</script><p id="mealStatus"></p><section id="mealContent"></section>';w.fetch=(url,options={})=>mealApi(new Request(new URL(url,w.location.href),options),ctx);w.eval(fs.readFileSync('public/assets/meals.js','utf8'));await waitFor(()=>w.document.getElementById('babyCheckForm'));assert.equal(w.document.querySelector('img'),null);
 let check=w.document.getElementById('babyCheckForm');assert.equal(check.elements.honey.value,'UNKNOWN');assert.equal(check.elements.heating.value,'UNKNOWN');check.dispatchEvent(new w.Event('submit',{bubbles:true,cancelable:true}));await waitFor(()=>w.document.getElementById('babyReview').textContent.includes('確認'));check.elements.honey.value='YES';check.elements.honey.dispatchEvent(new w.Event('change',{bubbles:true}));assert.equal(w.document.getElementById('babyReview').textContent,'');
 const form=w.document.getElementById('babyForm');form.elements.introduced.value='ひき肉\n玉ねぎ';form.elements.introduced.dispatchEvent(new w.Event('input',{bubbles:true}));check.dispatchEvent(new w.Event('submit',{bubbles:true,cancelable:true}));assert.match(w.document.getElementById('mealStatus').textContent,/先に保存/);
 form.dispatchEvent(new w.Event('submit',{bubbles:true,cancelable:true}));await waitFor(()=>w.document.getElementById('mealStatus').textContent.includes('条件を保存'));assert((await call(ctx,null,'?view=baby')).value.baby.children[0].profile);await w.happyDOM.close();
});
