import fs from 'node:fs';

const root=fs.readFileSync('src/shopping-root.ts','utf8');
const newPage=fs.readFileSync('src/shopping-new-page.ts','utf8');
const editPage=fs.readFileSync('src/shopping-edit-page.ts','utf8');
const handlers=fs.readFileSync('src/shopping-page-handlers.ts','utf8');
const apiRoutes=fs.readFileSync('src/context-api-routes.ts','utf8');
const taskLink=fs.readFileSync('public/assets/shopping-task-link.js','utf8');

for(const [label,source] of [['root',root],['new',newPage],['edit',editPage]]){
  if(source.includes("from './app'")) throw new Error(`shopping ${label} must not depend on app.ts`);
}
for(const marker of [
  "if(request.method!=='POST')return json({ok:false,error:'Method Not Allowed',code:'METHOD_NOT_ALLOWED'},405);",
  "action==='to_task'",
  "action==='toggle'",
  "action==='add_batch'",
  "action==='add'",
  "taskChildVisibilitySql('s')",
  "queueCalendarProjectionAfterMutation",
  "INSERT INTO shopping_completion_history",
  "return bad('未対応の操作です。');",
]) if(!root.includes(marker)) throw new Error(`shopping root lost ${marker}`);
const retiredAsset='/assets/'+'shopping.js';
for(const retiredMarker of [
  "return html(layout('買い物'",
  'id="shoppingPayload"',
  retiredAsset,
  "url.searchParams.get('view')",
]) if(root.includes(retiredMarker)) throw new Error(`retired standalone Shopping renderer must not return: ${retiredMarker}`);

for(const marker of [
  "visibility_scope='PRIVATE' AND private_owner_id=?",
  'archiveShoppingCompletionStatements',
  'DELETE FROM shopping_completions WHERE shopping_item_id=? AND member_id NOT IN',
]) if(!editPage.includes(marker)) throw new Error(`shopping edit lost ${marker}`);
for(const marker of [
  "const showAllLabel=showAllInput?.closest('label')?.querySelector('span')||null;",
  "if(showAllLabel)showAllLabel.textContent=query?`検索を解除すると候補表示を切り替えられます`:`その他の未完了タスクも表示${hidden?`（${hidden}件）`:''}`;",
  "searchInput.id='shoppingTaskSearch';",
  "const matches=query?sorted.filter(task=>normalizeSearch(task.title).includes(query)):[];",
]) if(!taskLink.includes(marker)) throw new Error(`shopping task candidate count/search lost ${marker}`);
for(const marker of [
  "export { shoppingNew } from './shopping-new-page';",
  "export { shoppingEdit } from './shopping-edit-page';",
]) if(!handlers.includes(marker)) throw new Error(`shopping handler wiring lost ${marker}`);
if(handlers.includes("export { shopping } from './shopping-root';")) throw new Error('retired standalone shopping page export must not return');
if(handlers.includes("from './app'")) throw new Error('shopping page handlers must not depend on app.ts');
if(!apiRoutes.includes("import { shopping } from './shopping-root';")) throw new Error('shopping API must use retained root');
if(!apiRoutes.includes("if(url.pathname==='/api/shopping') return await shopping(request,context);")) throw new Error('shopping API route must remain active after standalone page retirement');
const appImport=apiRoutes.split('\n').find(line=>line.includes("from './app'"))||'';
if(/\bshopping\b/.test(appImport)) throw new Error('shopping must not remain in context app.ts import');

console.log('Shopping API/new/edit domain contract ok; standalone list renderer is retired and /api/shopping is POST-only');
