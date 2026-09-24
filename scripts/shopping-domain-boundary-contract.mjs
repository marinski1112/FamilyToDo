import fs from 'node:fs';
import {spawnSync} from 'node:child_process';

const root=fs.readFileSync('src/shopping-root.ts','utf8');
const newPage=fs.readFileSync('src/shopping-new-page.ts','utf8');
const editPage=fs.readFileSync('src/shopping-edit-page.ts','utf8');
const handlers=fs.readFileSync('src/shopping-page-handlers.ts','utf8');
const apiRoutes=fs.readFileSync('src/context-api-routes.ts','utf8');
const taskLink=fs.readFileSync('public/assets/shopping-task-link.js','utf8');
const reusableSetApi=fs.readFileSync('src/shopping-reusable-set-api.ts','utf8');
const reusableSetUi=fs.readFileSync('public/assets/checklist-shopping-reusable-sets.js','utf8');
const reusableSetMigration=fs.readFileSync('migrations/0098_shopping_reusable_set_item_idempotency.sql','utf8');
const appShell=fs.readFileSync('src/app-shell.ts','utf8');

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
  "code:'RETIRED_ACTION'",
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
  'archiveShoppingCompletionStatements',
  "goodsVisibilitySql('s')",
  'due_date=?,url=?',
]) if(!editPage.includes(marker)) throw new Error(`shopping edit lost ${marker}`);
if(editPage.includes('const taskId=Number(item.task_id)||null;'))throw new Error('shopping edit must not preserve retired Task linkage');
for(const forbidden of ['name="assignees"','name="task_id"','shoppingTaskSearch','shopping-task-link.js'])if(editPage.includes(forbidden))throw new Error(`shopping edit must not expose goods linkage: ${forbidden}`);
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

const shoppingSetSyntax=spawnSync(process.execPath,['--check','public/assets/checklist-shopping-reusable-sets.js'],{encoding:'utf8'});
if(shoppingSetSyntax.status!==0)throw new Error(`Shopping reusable-set UI syntax invalid: ${shoppingSetSyntax.stderr||shoppingSetSyntax.stdout}`);
for(const marker of [
  "SELECT set_id_snapshot,due_date,created_by_member_id,created_item_ids FROM shopping_reusable_set_invocations",
  "Number(old.created_by_member_id)!==Number(m.id)",
  "const requestKeys=rows.map(x=>`set:${rid}:${Number(x.id)}`);",
  "INSERT OR IGNORE INTO shopping_items(family_id,name,quantity,category,memo,due_date,status,created_by,created_at,updated_at,task_id,url,client_request_id)",
  "SELECT id,client_request_id FROM shopping_items WHERE family_id=? AND client_request_id IN",
  "UPDATE shopping_reusable_set_invocations SET created_item_ids=?,updated_at=?",
]) if(!reusableSetApi.includes(marker)) throw new Error(`Shopping reusable-set idempotency marker missing: ${marker}`);
for(const marker of [
  "import { goodsVisibilitySql } from './goods-visibility';",
  "${goodsVisibilitySql('s')}",
  "visible.filter(x=>x.visibility_scope==='FAMILY')",
  "skipped_private:skippedPrivate",
  "DELETE FROM shopping_reusable_sets WHERE id=? AND family_id=?",
  "非公開の買い物だけでは共有セットを作成できません。",
]) if(!reusableSetApi.includes(marker)) throw new Error(`Shopping reusable-set privacy/atomicity marker missing: ${marker}`);
for(const marker of [
  'familytodo.shopping-set-invoke:',
  'sessionStorage.setItem(key,created)',
  'client_request_id:rid',
  'clearRequest(s.id)',
  '非公開タスクの買い物 ${Number(d.skipped_private)}件はセットから除外しました。',
]) if(!reusableSetUi.includes(marker)) throw new Error(`Shopping reusable-set retry/privacy marker missing: ${marker}`);
for(const marker of [
  'ALTER TABLE shopping_items ADD COLUMN client_request_id TEXT;',
  'CREATE UNIQUE INDEX IF NOT EXISTS idx_shopping_items_family_client_request_id',
  'ON shopping_items(family_id, client_request_id)',
  'WHERE client_request_id IS NOT NULL',
]) if(!reusableSetMigration.includes(marker)) throw new Error(`Shopping reusable-set migration marker missing: ${marker}`);
if(!appShell.includes('checklist-shopping-reusable-sets.js?v=${APP_VERSION}-set-select4'))throw new Error('Shopping reusable-set asset revision must rotate after privacy fix');

console.log('Shopping API/new/edit domain contract ok; reusable-set invocation is retry-safe and shared snapshots exclude PRIVATE task-linked Shopping rows with failed-create cleanup');
