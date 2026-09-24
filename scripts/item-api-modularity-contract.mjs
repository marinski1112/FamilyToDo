import fs from 'node:fs';
import {spawnSync} from 'node:child_process';

const index=fs.readFileSync('src/index.ts','utf8');
const apiRoutes=fs.readFileSync('src/context-api-routes.ts','utf8');
const itemApi=fs.readFileSync('src/item-api.ts','utf8');
const reusableSetApi=fs.readFileSync('src/item-reusable-set-api.ts','utf8');
const itemEdit=fs.readFileSync('src/item-edit-page.ts','utf8');
const taskEvents=fs.readFileSync('public/assets/task-events.js','utf8');
const belongingsUi=fs.readFileSync('public/assets/checklist-belongings-categories.js','utf8');
const belongingsCss=fs.readFileSync('public/assets/checklist-belongings-categories.css','utf8');
const reusableSetUi=fs.readFileSync('public/assets/checklist-belongings-reusable-sets.js','utf8');
const reusableSetCss=fs.readFileSync('public/assets/checklist-belongings-reusable-sets.css','utf8');
const migration=fs.readFileSync('migrations/0085_item_category_catalog.sql','utf8');
const reusableSetMigration=fs.readFileSync('migrations/0086_item_reusable_sets.sql','utf8');

for(const asset of ['public/assets/task-events.js','public/assets/checklist-belongings-categories.js','public/assets/checklist-belongings-reusable-sets.js']){
  const syntax=spawnSync(process.execPath,['--check',asset],{encoding:'utf8'});
  if(syntax.status!==0)throw new Error(`${asset} syntax invalid: ${syntax.stderr||syntax.stdout}`);
}

if(!apiRoutes.includes("import { itemApi } from './item-api';")) throw new Error('context API dispatcher must import item API module');
if(index.includes('async function itemApi(')) throw new Error('itemApi must not remain defined in index.ts');
if(!apiRoutes.includes("if(url.pathname==='/api/item') return await itemApi(request,context);")) throw new Error('item API route wiring changed');
if(!itemApi.includes('export async function itemApi(request:Request,ctx:any):Promise<Response>{')) throw new Error('item API module must export itemApi');
for(const sentinel of [
  "import { handleItemReusableSetAction, readItemReusableSets } from './item-reusable-set-api';",
  "if(new URL(request.url).searchParams.get('view')==='reusable_sets')return await readItemReusableSets(ctx,m);",
  'const reusableSetResponse=await handleItemReusableSetAction(ctx,m,b);',
  'if(reusableSetResponse)return reusableSetResponse;',
  "if(request.method!=='POST') return json({ok:false,error:'POST only'},405);",
  "String(b.csrf||'')!==String(ctx.session.csrfToken||'')",
  "goodsVisibilitySql('i')",
  "visibility_scope,private_owner_id",
  "const CATEGORY_ORDER_KEY='item_category_order';",
  "SELECT setting_value FROM family_settings WHERE family_id=? AND setting_key=? LIMIT 1",
  "item_category_catalog",
  "action==='update_category'",
  "action==='category_reorder'",
  "action==='category_add'",
  "action==='category_disable'",
  "action==='category_rename'",
  "const clientRequestId=String(b.client_request_id??'').trim();",
  "visibleRequestRow(ctx,m.family_id,m.id,clientRequestId)",
  "INSERT OR IGNORE INTO items(family_id,name,memo,due_at,status,completion_mode,created_by,created_at,updated_at,category,url,client_request_id,visibility_scope,private_owner_id)",
  "タスクとの紐づけは廃止されました。",
  "持ち物の担当者指定は廃止されました。",
  "'CREATED','item'",
  "return json({ok:true,id,date:dueDate,category,deduplicated:!inserted},inserted?201:200)",
]){
  if(!itemApi.includes(sentinel)) throw new Error(`item API behavior sentinel missing: ${sentinel}`);
}
if(!itemApi.includes("UPDATE items SET category=?,updated_at=? WHERE id=? AND family_id=?"))throw new Error('standalone belongings category move must persist without task linkage');

for(const sentinel of [
  'ALTER TABLE items ADD COLUMN category TEXT;',
  'ALTER TABLE items ADD COLUMN url TEXT;',
  'ALTER TABLE items ADD COLUMN client_request_id TEXT;',
  'CREATE TABLE IF NOT EXISTS item_category_catalog',
  'UNIQUE INDEX IF NOT EXISTS idx_item_category_catalog_family_name',
  'UNIQUE INDEX IF NOT EXISTS idx_items_family_client_request_id',
  'WHERE client_request_id IS NOT NULL',
])if(!migration.includes(sentinel))throw new Error(`belongings category migration marker missing: ${sentinel}`);
if(/UPDATE\s+items\s+SET\s+category/iu.test(migration))throw new Error('migration must not rewrite historical item categories; NULL/empty remains 未分類 at read time');

for(const sentinel of [
  'CREATE TABLE IF NOT EXISTS item_reusable_sets',
  'CREATE TABLE IF NOT EXISTS item_reusable_set_entries',
  'CREATE TABLE IF NOT EXISTS item_reusable_set_invocations',
  'CREATE UNIQUE INDEX IF NOT EXISTS idx_item_reusable_sets_family_name',
  'CREATE UNIQUE INDEX IF NOT EXISTS idx_item_reusable_set_invocations_family_request',
  'set_id_snapshot INTEGER NOT NULL',
  "created_item_ids TEXT NOT NULL DEFAULT '[]'",
])if(!reusableSetMigration.includes(sentinel))throw new Error(`reusable belongings set migration marker missing: ${sentinel}`);
const entriesSchema=reusableSetMigration.match(/CREATE TABLE IF NOT EXISTS item_reusable_set_entries\s*\(([\s\S]*?)\);/iu)?.[1]||'';
if(/\b(status|completed|completion)\b/iu.test(entriesSchema))throw new Error('reusable set definition must not persist actual checklist completion state');

for(const sentinel of [
  "import { goodsVisibilitySql } from './goods-visibility';",
  'const MAX_SET_ITEMS=100;',
  'WHERE s.family_id=?',
  "filter(row=>row.visibility_scope==='FAMILY')",
  "return bad('非公開の持ち物だけでは共有セットを作成できません。',400,'PRIVATE_SOURCE_ONLY')",
  "role==='OWNER'||role==='ADMIN'",
  "action==='reusable_set_create'",
  "action==='reusable_set_delete'",
  "action==='reusable_set_invoke'",
  "goodsVisibilitySql('i')",
  'Number(existing.created_by_member_id)!==Number(m.id)',
  "const requestKeys=entries.map(row=>`set:${requestId}:${Number(row.id)}`);",
  "VALUES(?,?,?,?,'pending','ANY',?,?,?,?,?,?)",
  'category,url,client_request_id',
  "INSERT OR IGNORE INTO item_reusable_set_invocations",
  "UPDATE item_reusable_set_invocations SET created_item_ids=?,updated_at=?",
])if(!reusableSetApi.includes(sentinel))throw new Error(`reusable belongings set API marker missing: ${sentinel}`);
if(/recurrence_rules|recurring_occurrence|auto.?generate/iu.test(reusableSetApi))throw new Error('reusable belongings sets must not add recurrence or automatic generation');

for(const sentinel of [
  "UPDATE items SET name=?,memo=?,url=?,category=?,due_at=?,updated_at=?",
  "SELECT name FROM item_category_catalog WHERE family_id=? AND enabled=1",
  '<label>カテゴリ</label>',
  'name="category" list="itemCategoryOptions"',
  '<label>URL</label>',
  'type="url" name="url"',
])if(!itemEdit.includes(sentinel))throw new Error(`item edit category/url marker missing: ${sentinel}`);

if(taskEvents.includes("script.id='belongingsCategoryChecklistScript'"))throw new Error('duplicate Goods asset loader returned');

for(const sentinel of [
  "const U='未分類'",
  "g.classList.toggle('category-collapsed',v)",
  'belongings-composer-name',
  'belongings-composer-memo',
  'belongings-composer-url',
  '改行で1件保存し、そのまま次を入力できます',
  "client_request_id:rid",
  "sessionStorage.setItem(draftKey(g),JSON.stringify(d))",
  "fetch('/api/item'",
  "n.addEventListener('keydown'",
  "e.key==='Enter'",
  "requestAnimationFrame(()=>n.focus({preventScroll:true}))",
  "ordered=[...all.filter(r=>!r.querySelector('input.toggle')?.checked),...all.filter(r=>r.querySelector('input.toggle')?.checked)]",
  "if(box.disabled&&++n<100)",
  "section.addEventListener('belongings-items-added'",
])if(!belongingsUi.includes(sentinel))throw new Error(`belongings Reminders-style UX marker missing: ${sentinel}`);
if(!belongingsCss.includes('Belongings no longer owns presentation. Shopping/checklist shared CSS is canonical.'))throw new Error('Belongings CSS must delegate presentation to the shared Shopping/checklist contract');
for(const forbidden of ['.belongings-category-name{','.belongings-category-toggle{','input.toggle[data-type="item"]{','.belongings-category-row{'])
  if(belongingsCss.includes(forbidden))throw new Error(`divergent Belongings presentation CSS returned: ${forbidden}`);
if(belongingsUi.includes('category_reorder'))throw new Error('Belongings UI must mirror Shopping and not expose category reorder arrows');
if(belongingsUi.includes('new MutationObserver'))throw new Error('belongings category UI must not add a MutationObserver self-loop risk');
if(belongingsUi.includes('location.reload')||belongingsUi.includes('location.replace'))throw new Error('belongings inline add/toggle/category operations must not full-reload the checklist');
if(belongingsUi.includes('△'))throw new Error('deprecated triangle state UI must not return');

for(const sentinel of [
  "open.textContent='セット'",
  '現在の持ち物からセット保存',
  "action:'reusable_set_create'",
  'source_item_ids:ids',
  "action:'reusable_set_invoke'",
  "action:'reusable_set_delete'",
  'client_request_id:rid',
  'sessionStorage.setItem(key,created)',
  "new CustomEvent('belongings-items-added'",
  "document.addEventListener('familytodo:checklist-unified-ready',attach,{once:true})",
])if(!reusableSetUi.includes(sentinel))throw new Error(`reusable belongings set UI marker missing: ${sentinel}`);
for(const sentinel of [
  '.belongings-set-overlay[hidden]{display:none!important}',
  '.belongings-set-overlay{position:fixed',
  '.belongings-set-sheet{position:relative',
])if(!reusableSetCss.includes(sentinel))throw new Error(`reusable belongings set compact sheet marker missing: ${sentinel}`);
if(reusableSetUi.includes('new MutationObserver'))throw new Error('reusable set UI must not add a MutationObserver self-loop risk');
if(reusableSetUi.includes('location.reload')||reusableSetUi.includes('location.replace'))throw new Error('reusable set operations must not full-reload the checklist');

console.log('item API modularity contract: canonical belongings add/edit + family-scoped categories + reusable snapshot sets, idempotent fresh pending invocation, memo/url persistence, square checkbox, collapsed groups, privacy, and no-reload/no-observer UX ok');
