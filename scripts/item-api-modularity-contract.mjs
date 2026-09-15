import fs from 'node:fs';
import {spawnSync} from 'node:child_process';

const index=fs.readFileSync('src/index.ts','utf8');
const apiRoutes=fs.readFileSync('src/context-api-routes.ts','utf8');
const itemApi=fs.readFileSync('src/item-api.ts','utf8');
const itemEdit=fs.readFileSync('src/item-edit-page.ts','utf8');
const taskEvents=fs.readFileSync('public/assets/task-events.js','utf8');
const belongingsUi=fs.readFileSync('public/assets/checklist-belongings-categories.js','utf8');
const belongingsCss=fs.readFileSync('public/assets/checklist-belongings-categories.css','utf8');
const migration=fs.readFileSync('migrations/0085_item_category_catalog.sql','utf8');

for(const asset of ['public/assets/task-events.js','public/assets/checklist-belongings-categories.js']){
  const syntax=spawnSync(process.execPath,['--check',asset],{encoding:'utf8'});
  if(syntax.status!==0)throw new Error(`${asset} syntax invalid: ${syntax.stderr||syntax.stdout}`);
}

if(!apiRoutes.includes("import { itemApi } from './item-api';")) throw new Error('context API dispatcher must import item API module');
if(index.includes('async function itemApi(')) throw new Error('itemApi must not remain defined in index.ts');
if(!apiRoutes.includes("if(url.pathname==='/api/item') return await itemApi(request,context);")) throw new Error('item API route wiring changed');
if(!itemApi.includes('export async function itemApi(request:Request,ctx:any):Promise<Response>{')) throw new Error('item API module must export itemApi');
for(const sentinel of [
  "if(request.method==='GET')return await readCategories(request,ctx,m);",
  "if(request.method!=='POST') return json({ok:false,error:'POST only'},405);",
  "String(b.csrf||'')!==String(ctx.session.csrfToken||'')",
  "taskVisibilitySql('t')",
  "visibility_scope,private_owner_id",
  "const CATEGORY_ORDER_KEY='item_category_order';",
  "SELECT setting_value FROM family_settings WHERE family_id=? AND setting_key=? LIMIT 1",
  "item_category_catalog",
  "action==='category_reorder'",
  "action==='category_add'",
  "action==='category_disable'",
  "action==='category_rename'",
  "action==='update_category'",
  "const clientRequestId=String(b.client_request_id??'').trim();",
  "visibleRequestRow(ctx,m.family_id,m.id,clientRequestId)",
  "INSERT OR IGNORE INTO items(family_id,name,memo,due_at,status,completion_mode,created_by,created_at,updated_at,task_id,category,url,client_request_id)",
  "privateOwner?[privateOwner]",
  "INSERT OR IGNORE INTO item_assignees(item_id,member_id)",
  "'CREATED','item'",
  "return json({ok:true,id,date:dueDate,category,deduplicated:!inserted},inserted?201:200)",
]){
  if(!itemApi.includes(sentinel)) throw new Error(`item API behavior sentinel missing: ${sentinel}`);
}

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
  "UPDATE items SET name=?,memo=?,url=?,category=?,due_at=?,task_id=?,updated_at=?",
  "SELECT name FROM item_category_catalog WHERE family_id=? AND enabled=1",
  '<label>カテゴリ</label>',
  'name="category" list="itemCategoryOptions"',
  '<label>URL</label>',
  'type="url" name="url"',
])if(!itemEdit.includes(sentinel))throw new Error(`item edit category/url marker missing: ${sentinel}`);

for(const sentinel of [
  '/assets/checklist-belongings-categories.css?v=belongings-category1',
  '/assets/checklist-belongings-categories.js?v=belongings-category1',
  "link.id='belongingsCategoryChecklistStyle'",
  "script.id='belongingsCategoryChecklistScript'",
])if(!taskEvents.includes(sentinel))throw new Error(`belongings checklist asset wiring missing: ${sentinel}`);

for(const sentinel of [
  "const U='未分類'",
  "g.classList.toggle('category-collapsed',v)",
  "label=closed?'展開':'閉じる'",
  "if(b.textContent!==label)b.textContent=label",
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
  "post({action:'category_reorder',order:named().map(g=>cat(g.dataset.category))})",
  "post({action:'category_rename',name:old,new_name:next})",
])if(!belongingsUi.includes(sentinel))throw new Error(`belongings Reminders-style UX marker missing: ${sentinel}`);
for(const sentinel of [
  '.belongings-category-name{flex:1;min-width:0;font-size:20px',
  '.belongings-category-toggle{min-width:72px}',
  'input.toggle[data-type="item"]{-webkit-appearance:none!important;appearance:none!important',
  'min-height:44px!important',
])if(!belongingsCss.includes(sentinel))throw new Error(`belongings checklist CSS marker missing: ${sentinel}`);
if(belongingsUi.includes('new MutationObserver'))throw new Error('belongings category UI must not add a MutationObserver self-loop risk');
if(belongingsUi.includes('location.reload')||belongingsUi.includes('location.replace'))throw new Error('belongings inline add/toggle/category operations must not full-reload the checklist');
if(belongingsUi.includes('△'))throw new Error('deprecated triangle state UI must not return');

console.log('item API modularity contract: canonical belongings add/edit + family-scoped categories, idempotent direct entry, memo/url persistence, square checkbox, collapsed groups, completion ordering, privacy, and no-reload/no-observer UX ok');
