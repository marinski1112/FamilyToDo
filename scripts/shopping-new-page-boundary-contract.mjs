import fs from 'node:fs';

const root=fs.readFileSync('src/shopping-root.ts','utf8');
const newPage=fs.readFileSync('src/shopping-new-page.ts','utf8');
const editPage=fs.readFileSync('src/shopping-edit-page.ts','utf8');
const handlers=fs.readFileSync('src/shopping-page-handlers.ts','utf8');
const apiRoutes=fs.readFileSync('src/context-api-routes.ts','utf8');
const pageRoutes=fs.readFileSync('src/page-routes.ts','utf8');
const taskLink=fs.readFileSync('public/assets/shopping-task-link.js','utf8');
const newJs=fs.readFileSync('public/assets/shopping-new.js','utf8');
const sw=fs.readFileSync('public/sw.js','utf8');
const pkg=fs.readFileSync('package.json','utf8');

for(const marker of [
  "import type { AppContext } from './app-context';",
  "import { taskChildVisibilitySql, taskVisibilitySql } from './task-visibility';",
  'export async function shopping(request:Request,ctx:AppContext):Promise<Response>{',
  "action==='to_task'",
  "action==='toggle'",
  "action==='add_batch'",
  "action==='add'",
  'normalized.length>50',
  "INSERT INTO shopping_completion_history",
  "queueCalendarProjectionAfterMutation",
  "status<>'completed'",
  "taskChildVisibilitySql('s')",
  "String(task.visibility_scope)==='PRIVATE'",
  "id=\"shoppingPayload\"",
  '/assets/shopping.js?v=${APP_VERSION}',
  "return html(layout('買い物',body,'/app/shopping.php'));",
]) if(!root.includes(marker)) throw new Error(`Shopping root lost behavior marker: ${marker}`);

for(const marker of [
  "import type { AppContext } from './app-context';",
  "import { taskVisibilitySql } from './task-visibility';",
  'export async function shoppingNew(ctx:AppContext,date?:string,selectedTaskId=0):Promise<Response>{',
  "status<>'completed'",
  "visibility_scope='FAMILY'",
  'SELECT id,title,start_at,end_at,due_at,visibility_scope,created_at',
  'ORDER BY CASE WHEN id=? THEN 0 ELSE 1 END, COALESCE(start_at,due_at,created_at) DESC,id DESC LIMIT 200',
  "privateContext=String(selectedTask?.visibility_scope||'')==='PRIVATE'",
  'taskOverlapsDate(task,date)',
  'id="shoppingTaskDueDate"',
  'id="shoppingTaskId"',
  'id="shoppingTaskShowAll"',
  'id="shoppingTaskLinkPayload"',
  '/assets/shopping-task-link.js?v=${APP_VERSION}-task-date-2',
  'name="product_name[]"',
  'name="product_quantity[]"',
  'name="product_quantity[]" value="1" maxlength="128"',
  'class="product-url-toggle" aria-expanded="false" aria-label="商品URLを入力" title="商品URL"',
  'name="product_url[]" maxlength="2048"',
  '<input type="hidden" name="task_id" value="${selectedTaskId}">',
  'id="shoppingNewPayload"',
  '/assets/shopping-new.js?v=${APP_VERSION}',
]) if(!newPage.includes(marker)) throw new Error(`Shopping new page lost behavior marker: ${marker}`);

for(const marker of [
  "const categoryRegisterControl=categoryRegister.closest('label')||categoryRegister.parentElement;",
  "categoryRegisterToggle.type='button';",
  "categoryRegisterToggle.setAttribute('aria-expanded','false');",
  "categoryRegisterToggle.textContent='＋ カテゴリを登録';",
  "categoryRegisterToggle.setAttribute('aria-controls',categoryRegisterControl.id);",
  'categoryRegisterControl.hidden=true;',
  "categoryRegisterToggle.addEventListener('click',()=>{",
  "if(open)categoryRegister.focus();",
  'if(!custom)categoryRegister.checked=false;',
  'if(categoryRegisterControl)categoryRegisterControl.hidden=true;',
  "if(categoryRegisterToggle)categoryRegisterToggle.setAttribute('aria-expanded','false');",
  "const registerCategory=categorySelect.value==='__custom__'&&categoryRegister.checked;",
  "fetch('/api/shopping-categories'",
  "const body={action:'add_batch'",
]) if(!newJs.includes(marker)) throw new Error(`Shopping new category disclosure lost behavior marker: ${marker}`);

for(const marker of [
  "import { archiveShoppingCompletionStatements } from './lifecycle';",
  "import { taskVisibilitySql } from './task-visibility';",
  "import { APP_VERSION } from './version';",
  'export async function shoppingEdit(request:Request,ctx:AppContext,id:number):Promise<Response>{',
  "visibility_scope='PRIVATE' AND private_owner_id=?",
  "role==='OWNER'||role==='ADMIN'||Number(item.created_by)===m.id",
  'SELECT id,title,start_at,end_at,due_at FROM tasks',
  'taskOverlapsDate(task,dueDate)',
  'id="shoppingTaskDueDate"',
  'id="shoppingTaskId"',
  'id="shoppingTaskShowAll"',
  'id="shoppingTaskLinkPayload"',
  '/assets/shopping-task-link.js?v=${APP_VERSION}-task-date-1',
  "archiveShoppingCompletionStatements",
  "DELETE FROM shopping_completions WHERE shopping_item_id=? AND member_id NOT IN",
  "UPDATE shopping_items SET status=CASE WHEN",
  "return redirect('/app/shopping.php');",
  "return html(layout('買い物編集',body,''));",
]) if(!editPage.includes(marker)) throw new Error(`Shopping edit page lost behavior marker: ${marker}`);

for(const marker of [
  "const payloadNode=document.getElementById('shoppingTaskLinkPayload');",
  "const select=document.getElementById('shoppingTaskId');",
  "const dueInput=document.getElementById('shoppingTaskDueDate');",
  "const showAllInput=document.getElementById('shoppingTaskShowAll');",
  'const DEFAULT_VISIBLE_LIMIT=12;',
  "searchInput.type='search';",
  "searchInput.id='shoppingTaskSearch';",
  "searchInput.placeholder='タスク名を検索';",
  "select.parentNode?.insertBefore(searchInput,select);",
  "const normalizeSearch=value=>String(value||'').trim().toLowerCase();",
  "const matches=query?sorted.filter(task=>normalizeSearch(task.title).includes(query)):[];",
  "if(query&&current)matchIds.add(current);",
  "if(query&&initialSelected)matchIds.add(initialSelected);",
  "const visible=query?sorted.filter(task=>matchIds.has(task.id)):(showAll?sorted:sorted.filter(task=>defaultIds.has(task.id)));",
  "searchInput.addEventListener('input',render);",
  "const todayJst=()=>new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Tokyo'",
  'const referenceDate=date||todayJst();',
  'const defaults=(overlapsForDate.length?overlapsForDate:sorted).slice(0,DEFAULT_VISIBLE_LIMIT);',
  'if(current)defaultIds.add(current);',
  'if(initialSelected)defaultIds.add(initialSelected);',
  "dueInput.addEventListener('change',render);",
  "showAllInput.addEventListener('change',render);",
  'タスク名の検索結果 ${matches.length}件',
  '選択中のタスクは検索条件に関係なく保持しています。',
  '期限日に重なるタスクがないため、近い未完了タスクを最大${DEFAULT_VISIBLE_LIMIT}件表示中',
  '未完了タスクを最大${DEFAULT_VISIBLE_LIMIT}件表示中。期限を指定すると、その日に重なるタスクを優先します',
  'その他 ${hidden}件はチェックで表示できます。',
]) if(!taskLink.includes(marker)) throw new Error(`Shopping task-link helper lost behavior marker: ${marker}`);
if(taskLink.includes('showAll||overlaps(task,date)||task.id===current||task.id===initialSelected')) throw new Error('Shopping task-link must not regress to exact-overlap-only default filtering');
for(const marker of [
  "const STATIC_CACHE='familytodo-static-shopping-task-fallback';",
  "name.startsWith('familytodo-static-')&&name!==STATIC_CACHE",
  'self.skipWaiting();',
  'await self.clients.claim();',
]) if(!sw.includes(marker)) throw new Error(`Shopping fallback cache rotation missing: ${marker}`);
if(!pkg.includes('node --check public/assets/shopping-task-link.js')) throw new Error('Shopping task-link helper must be covered by browser JS syntax check');

for(const [name,source] of [['root',root],['new',newPage],['edit',editPage]]){
  if(source.includes("from './app'")) throw new Error(`Shopping ${name} retained handler must not depend on app.ts`);
}
if(handlers.includes("from './app'")) throw new Error('Shopping page handler boundary must not depend on app.ts');
for(const marker of [
  "export { shopping } from './shopping-root';",
  "export { shoppingNew } from './shopping-new-page';",
  "export { shoppingEdit } from './shopping-edit-page';",
]) if(!handlers.includes(marker)) throw new Error(`Shopping page handler wiring missing: ${marker}`);
if(!apiRoutes.includes("import { shopping } from './shopping-root';")) throw new Error('context API dispatcher must import retained shopping root');
if(!apiRoutes.includes("if(url.pathname==='/api/shopping') return await shopping(request,context);")) throw new Error('/api/shopping route wiring changed');
const appImport=apiRoutes.split('\n').find(line=>line.includes("from './app'"))||'';
if(/\bshopping\b/.test(appImport)) throw new Error('context API dispatcher must not import shopping from app.ts');
if(!pageRoutes.includes("import { shopping, shoppingNew, shoppingEdit } from './shopping-page-handlers';")) throw new Error('page dispatcher shopping boundary changed');
for(const marker of [
  "if(url.pathname==='/app/shopping.php') return await shopping(request,context);",
  "if(url.pathname==='/app/shopping_new.php') return await shoppingNew(context,url.searchParams.get('date')||'',Number(url.searchParams.get('task_id')||0));",
  "if(url.pathname==='/app/shopping_edit.php') return await shoppingEdit(request,context,Number(url.searchParams.get('id')||0));",
]) if(!pageRoutes.includes(marker)) throw new Error(`Shopping page route changed: ${marker}`);

console.log('Shopping retained domain boundary contract ok');
