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
  "action==='to_task'",
  "action==='toggle'",
  "action==='add_batch'",
  "action==='add'",
  "taskChildVisibilitySql('s')",
  "queueCalendarProjectionAfterMutation",
  "INSERT INTO shopping_completion_history",
]) if(!root.includes(marker)) throw new Error(`shopping root lost ${marker}`);
if(!root.includes('date(COALESCE(pt.end_at,pt.due_at,pt.start_at)) < ?')) throw new Error('shopping linked-task expiry must use end_at -> due_at -> start_at deadline precedence');
if(!root.includes('substr(COALESCE(t.end_at,t.due_at,t.start_at),1,10)')) throw new Error('shopping expired ordering must use the same linked-task effective deadline precedence');
if(root.includes('COALESCE(pt.end_at,pt.start_at,pt.due_at)')||root.includes('COALESCE(t.end_at,t.start_at,t.due_at)')) throw new Error('shopping must not regress to start_at before due_at for linked-task expiry');
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
  "export { shopping } from './shopping-root';",
  "export { shoppingNew } from './shopping-new-page';",
  "export { shoppingEdit } from './shopping-edit-page';",
]) if(!handlers.includes(marker)) throw new Error(`shopping handler wiring lost ${marker}`);
if(handlers.includes("from './app'")) throw new Error('shopping page handlers must not depend on app.ts');
if(!apiRoutes.includes("import { shopping } from './shopping-root';")) throw new Error('shopping API must use retained root');
const appImport=apiRoutes.split('\n').find(line=>line.includes("from './app'"))||'';
if(/\bshopping\b/.test(appImport)) throw new Error('shopping must not remain in context app.ts import');

console.log('Shopping retained domain contract ok');
