import {readFileSync} from 'node:fs';

const parentApi=readFileSync('src/task-parent-completion-api.ts','utf8');
const categoryMutation=readFileSync('src/shopping-category-mutation-api.ts','utf8');
const categoryApi=readFileSync('src/shopping-category-api.ts','utf8');
const routes=readFileSync('src/context-api-routes.ts','utf8');
const shell=readFileSync('src/app-shell.ts','utf8');
const ui=readFileSync('public/assets/checklist-hierarchy-followup.js','utf8');
const css=readFileSync('public/assets/checklist-hierarchy-followup.css','utf8');
const hierarchyMigration=readFileSync('migrations/0056_task_hierarchy_foundation.sql','utf8');
const taskEvents=readFileSync('public/assets/task-events.js','utf8');
const taskPage=readFileSync('src/task-events-page.ts','utf8');
const shoppingCategoryUi=readFileSync('public/assets/checklist-category-followup.js','utf8');
const shoppingUi=shoppingCategoryUi;
const addFooter=readFileSync('public/assets/checklist-add-footer.js','utf8');
const belongingsUi=readFileSync('public/assets/checklist-belongings-categories.js','utf8');

const requireText=(source,needle,label)=>{if(!source.includes(needle))throw new Error(`checklist hierarchy follow-up missing ${label}: ${needle}`);};
const forbidText=(source,needle,label)=>{if(source.includes(needle))throw new Error(`checklist hierarchy follow-up forbids ${label}: ${needle}`);};

for(const [needle,label] of [
  ["action==='inspect'",'parent inspection'],
  ["policy!=='complete'&&policy!=='promote'",'explicit child policy'],
  ["UPDATE tasks SET parent_task_id=NULL,updated_at=?",'pending child promotion'],
  ["WHERE family_id=? AND parent_task_id=? AND status<>'completed'",'incomplete-only promotion'],
  ["UPDATE tasks SET status='completed',completed_by=?,completed_at=?,updated_at=?",'child completion'],
  ['await ctx.env.DB.batch(statements);','single mutation batch'],
])requireText(parentApi,needle,label);
requireText(routes,"if(url.pathname==='/api/task-parent-completion') return await taskParentCompletionApi(request,context);",'parent completion route');

for(const [needle,label] of [
  ["action==='delete_many'",'bulk category delete action'],
  ["role!=='OWNER'&&role!=='ADMIN'",'admin category deletion'],
  ['UPDATE shopping_items SET category=NULL,updated_at=?','shopping uncategorized reassignment'],
  ['UPDATE items SET category=NULL,updated_at=?','belongings uncategorized reassignment'],
  ['UPDATE shopping_category_catalog SET enabled=0','shopping catalog disable'],
  ['UPDATE item_category_catalog SET enabled=0','item catalog disable'],
  ['await ctx.env.DB.batch(statements);','category mutation batch'],
])requireText(categoryMutation,needle,label);
requireText(categoryMutation,"itemPolicy!=='unclassified'&&itemPolicy!=='delete'",'explicit category item policy');
requireText(categoryMutation,'DELETE FROM shopping_items WHERE family_id=? AND category=? COLLATE NOCASE','confirmed shopping item deletion');
requireText(categoryMutation,'DELETE FROM items WHERE family_id=? AND category=? COLLATE NOCASE','confirmed belongings item deletion');
requireText(categoryApi,'canManageCategories','category management capability');
requireText(categoryApi,'SELECT name FROM shopping_category_catalog WHERE family_id=? AND enabled=1','enabled category catalog read');

requireText(hierarchyMigration,'REFERENCES tasks(id) ON DELETE SET NULL','parent deletion preserves children');
forbidText(hierarchyMigration,'REFERENCES tasks(id) ON DELETE CASCADE','parent deletion cascade');

for(const [needle,label] of [
  ['未完了の子タスクを全て完了にする','complete children choice'],
  ['未完了の子タスクを親タスクとして残す','promote children choice'],
  ["'/api/task-parent-completion'",'parent completion browser boundary'],
  ["action:'delete_many'",'category bulk delete browser action'],
  ["item_policy:policy",'category delete item policy'],
  ['中の${noun}を未分類に移動して削除','move-to-unclassified choice'],
  ['カテゴリと中の${noun}をすべて削除','delete-category-and-items choice'],
  ['checklist-inline-search','compact checklist search'],
  ['zero-unclassified-add','unclassified add route'],
  ["const live=[...section.querySelectorAll",'live unclassified group lookup'],
  ["btn.textContent='🔍'",'visible search icon'],
  ['checklist-status-tabs','pending/completed tab control'],
  ["data-status=\"pending\"",'pending tab'],
  ["data-status=\"completed\"",'completed tab'],
  ['checklist-status-hidden','status row filtering'],
  ['task-child-composer-deferred','deferred child composer'],
  ['task-child-add-reveal','compact child add reveal'],
  ['category-inline-rename','inline category rename'],
  ["<span>空のカテゴリ</span>",'clear empty-category label'],
  ["trash.textContent='🗑️'",'emoji trash control'],
  ['category-delete-minus','minus category deletion'],
  ['task-delete-minus','minus task deletion'],
  ["method:'DELETE'",'task delete transport'],
  ['task-add-top','top-right task add'],
  ["if(zero.length){cluster=document.createElement('details')",'empty category cluster only when needed'],
  ['section.append(add)','direct unclassified add route'],
  ['refreshCounts','completed tab count refresh'],
  ['zero-category-cluster','zero category grouping'],
  ['task-child-count-toggle','parent child count toggle'],
  ['input[name="assignees"]','assignee UI suppression'],
  ['select[name="task_id"]','task-link UI suppression'],
])requireText(ui,needle,label);
forbidText(ui,'new MutationObserver','additional UI mutation observer');
requireText(css,'.shopping-category-name,.belongings-category-name{font-weight:800!important}','bold category headings');
requireText(css,'border-radius:5px','square checklist control styling');
requireText(css,'.checklist-status-tabs','compact status tab styling');
requireText(css,'/* Dense checklist alignment */','dense checklist alignment');
requireText(css,'.task-child-composer-deferred','deferred child composer styling');
requireText(css,'/* iPhone screenshot follow-up 2 */','second iPhone screenshot alignment');
requireText(css,'/* Final compact polish */','final compact checklist polish');
requireText(css,'/* Approved minus-delete interaction */','minus delete interaction styles');
requireText(css,'/* Final reference alignment */','final reference alignment');
requireText(css,'/* iPhone reference follow-up */','iPhone reference alignment');
requireText(css,'/* Unified checklist interaction contract */','unified checklist interaction contract');
requireText(shoppingCategoryUi,"groups().some(group=>categoryOf(group)===UNCLASSIFIED)",'persistent unclassified shopping group');
requireText(taskPage,"start&&start!=='00:00'",'suppress placeholder midnight time');
requireText(taskPage,'checklist-heading-icon','compact heading icons');
forbidText(taskPage,'class="fab calendar-fab"','legacy checklist FAB');
requireText(shell,'checklist-hierarchy-followup.css','follow-up stylesheet load');
requireText(shell,'checklist-hierarchy-followup.js','follow-up browser script load');
requireText(taskPage,'appVersion:APP_VERSION','checklist release revision payload');
requireText(taskEvents,"payload.appVersion||'checklist'",'belongings child release revision');
forbidText(taskEvents,'belongings-category1','fixed belongings category revision');
forbidText(taskEvents,'belongings-set1','fixed belongings set revision');

console.log('checklist hierarchy follow-up contract ok');

requireText(addFooter,"if(klass==='task-section')",'task-specific top-right add ownership');
requireText(addFooter,"button.className='checklist-compact-action task-add-top'",'task add toolbar button');
requireText(addFooter,"form.hidden=true",'deferred task quick-entry form');

requireText(js,"if(!count)g.hidden=true",'empty unclassified hidden while direct add route remains');
requireText(js,"if(count&&name!==U)active.add(key(name))",'unclassified excluded from empty-category semantics');
requireText(addFooter,"button.textContent='＋ タスク'",'compact top-right task label');
requireText(js,"section.append(add)",'direct unclassified add route preserved');

requireText(addFooter,"if(klass==='item-section')",'global Belongings add suppressed at owner');
requireText(js,"toolbars.slice(1)",'single consolidated Task toolbar');
requireText(js,"tools.append(taskAdd)",'Task add is rightmost');
requireText(css,'one toolbar, rightmost Task add','Task toolbar screenshot styling');
requireText(belongingsUi,"g.hidden=false;g.classList.remove('checklist-status-group-empty','checklist-search-hidden')",'new unclassified Belongings becomes visible');

requireText(js,"else if(name===U){g.hidden=false", 'populated unclassified groups forced visible');
requireText(css,'Populated 未分類 is a first-class category','populated unclassified full-row styling');

requireText(js,'zero-category-add-item','empty named category direct add');
requireText(js,"void renameCategory(kind,name,title)",'empty named category inline rename');
requireText(js,'openCategoryComposer(section,kind,U)','unclassified add route uses shared composer opener');
requireText(shoppingUi,"if(category===UNCLASSIFIED){location.reload()", 'authoritative unclassified Shopping reload');
requireText(belongingsUi,"if(category===U){location.reload()", 'authoritative unclassified Belongings reload');
requireText(css,'Empty named categories: name edits','empty category action styling');
