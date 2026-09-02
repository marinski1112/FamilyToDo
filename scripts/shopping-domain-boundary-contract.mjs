import fs from 'node:fs';

const root=fs.readFileSync('src/shopping-root.ts','utf8');
const newPage=fs.readFileSync('src/shopping-new-page.ts','utf8');
const editPage=fs.readFileSync('src/shopping-edit-page.ts','utf8');
const handlers=fs.readFileSync('src/shopping-page-handlers.ts','utf8');
const apiRoutes=fs.readFileSync('src/context-api-routes.ts','utf8');

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
for(const marker of [
  "visibility_scope='PRIVATE' AND private_owner_id=?",
  'archiveShoppingCompletionStatements',
  'DELETE FROM shopping_completions WHERE shopping_item_id=? AND member_id NOT IN',
]) if(!editPage.includes(marker)) throw new Error(`shopping edit lost ${marker}`);
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
