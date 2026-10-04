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
