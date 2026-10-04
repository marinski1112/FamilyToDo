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
 doc.querySelector('[name=servings5]').value='3';doc.querySelector('[name=servings5]').dispatchEvent(new window.Event('input',{bubbles:true}));doc.querySelector('#openSuggestions').click();doc.querySelector('#suggestForm').dispatchEvent(new window.Event('submit',{bubbles:true,cancelable:true}));await settle();assert(doc.querySelector('#suggestForm'));doc.querySelector('#suggestForm').dispatchEvent(new window.Event('submit',{bubbles:true,cancelable:true}));await settle();assert.equal(savedRequests[0],savedRequests[1]);
 assert(doc.querySelector('#applySuggestion'));assert.equal(meals.sql.prepare('SELECT json_array_length(items_json) n FROM weekly_plans').get().n,1);doc.querySelector('#applySuggestion').click();nativeSelectDefaults();assert.equal(doc.querySelector('[name=servings5]').value,'3');assert.equal(doc.querySelector('[name=recipe5]').value,'recipe-ai-0000');assert.equal(doc.querySelector('#shoppingPreview'),null);
 const event=new window.Event('submit',{bubbles:true,cancelable:true});Object.defineProperty(event,'submitter',{value:{value:'DRAFT'}});doc.querySelector('#planForm').dispatchEvent(event);await settle();assert.equal(meals.sql.prepare('SELECT status FROM weekly_plans').get().status,'DRAFT');assert.equal(meals.sql.prepare('SELECT json_array_length(items_json) n FROM weekly_plans').get().n,6);
 }finally{window.happyDOM.abort();window.close();}
});

test('meal deployment readiness reports only booleans; enabled missing migrations fail without exposing errors',async()=>{
 const {ctx,meals}=fixture();const response=await mealsHealth(ctx.env);assert.equal(response.status,200);assert.equal(response.headers.get('cache-control'),'no-store');assert.deepEqual(await response.json(),{ok:true,enabled:true,configured:true,ready:true});
 meals.sql.exec('DROP TABLE meal_weekly_suggestions');const missing=await mealsHealth(ctx.env);assert.equal(missing.status,503);assert.deepEqual(await missing.json(),{ok:false,enabled:true,configured:true,ready:false});
 assert.equal((await mealsHealth({...ctx.env,MEALS_ENABLED:'false'})).status,200);const absent=await mealsHealth({...ctx.env,MEALS_DB:undefined});assert.equal(absent.status,503);
 const broken=await mealsHealth({...ctx.env,MEALS_DB:{prepare(){throw new Error('PRIVATE synthetic SQL or key');}}});assert.equal(broken.status,503);assert(!(await broken.text()).includes('PRIVATE'));
});
