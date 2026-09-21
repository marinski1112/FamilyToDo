import {readFileSync} from 'node:fs';

const parentApi=readFileSync('src/task-parent-completion-api.ts','utf8');
const categoryMutation=readFileSync('src/shopping-category-mutation-api.ts','utf8');
const categoryApi=readFileSync('src/shopping-category-api.ts','utf8');
const itemApi=readFileSync('src/item-api.ts','utf8');
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
const belongingsCss=readFileSync('public/assets/checklist-belongings-categories.css','utf8');
const categoryDrag=readFileSync('public/assets/checklist-category-drag.js','utf8');
const belongingsCategories=readFileSync('public/assets/checklist-belongings-categories.js','utf8');
const taskEntryPage=readFileSync('src/task-entry-page.ts','utf8');
const taskEntryManual=readFileSync('public/assets/task-entry-manual.js','utf8');
const shoppingEditPage=readFileSync('src/shopping-edit-page.ts','utf8');
const itemEditPage=readFileSync('src/item-edit-page.ts','utf8');
const appShell=readFileSync('src/app-shell.ts','utf8');
const flowFix=readFileSync('public/assets/checklist-reminders-flow-fix.js','utf8');
const taskEventsPage=readFileSync('src/task-events-page.ts','utf8');
const taskEventsJs=readFileSync('public/assets/task-events.js','utf8');
const js=ui;

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
requireText(categoryApi,'SELECT name,created_at FROM shopping_category_catalog WHERE family_id=? AND enabled=1','enabled category catalog metadata read');
requireText(categoryApi,'categoryMeta','shopping category creation metadata');

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

requireText(js,"g.hidden=name===U?false:emptyEligible(name)",'new empty categories remain in normal section until eligible');
requireText(js,'nextJstOneAt','next JST 01:00 empty-category threshold');
requireText(js,"if(count&&name!==U)active.add(key(name))",'unclassified excluded from empty-category semantics');
requireText(addFooter,"button.textContent='＋ タスク'",'compact top-right task label');
requireText(css,'.task-section>.section-quick-entry:not([hidden]){display:block!important}','Task/Event quick entry becomes visible when add control opens it');
requireText(belongingsUi,"familytodo:belongings-category-add-request",'Belongings category add request reaches canonical category controller');
requireText(belongingsUi,"belongingsCategoryControllerReady='1'",'Belongings category controller exposes runtime readiness');
requireText(belongingsUi,"familytodo:belongings-category-controller-ready",'Belongings category controller signals readiness after listener installation');



requireText(belongingsUi,"goodsCategoryDiag='item:request-received'",'Belongings controller records request receipt');
requireText(belongingsUi,"goodsCategoryDiag='item:draft-mounted'",'Belongings controller records draft mount');
requireText(shell,'/assets/checklist-belongings-categories.js?v=${APP_VERSION}-belongings-category5','checklist loads the canonical Belongings category controller');
requireText(shell,'/assets/checklist-belongings-categories.css?v=${APP_VERSION}-belongings-category5','checklist loads Belongings category styles');
requireText(js,"unified-belongings-category-add",'unified Belongings category add uses a live proxy outside the hidden source section');
requireText(belongingsUi,'window.familytodoBelongingsAddCategory=addCategory','Belongings controller exposes its canonical add action');
requireText(js,"active==='item'",'unified Goods controls route by the active kind');
requireText(js,"unified-goods-category-add",'Goods exposes one category-add control');
requireText(js,"unified-goods-delete-mode",'Goods exposes one category-delete control');
requireText(js,"addDeleteMinus(h,n,'shared',count)",'Goods delete remains shared across co-visible category kinds');
requireText(js,"trash.style.marginLeft='auto'",'Goods trash is right aligned like Task/Event status controls');
requireText(js,"shoppingCategoryAdd.click()",'Shopping route delegates to the canonical Shopping controller');
requireText(js,"typeof direct==='function'",'Belongings route delegates to the canonical Belongings controller');
requireText(js,"item:draft-missing-after-direct-call",'direct Belongings category activation exposes a bounded post-call diagnostic');
requireText(js,"zero-category-cluster .zero-category-cluster-row",'Belongings delete mode includes visible empty named categories');
requireText(js,"shopping.querySelectorAll(':scope>.unified-category-group')",'Belongings delete mode projects minus controls onto all visible shared goods categories');
requireText(js,"item:delete-mode-on-visible",'Belongings delete diagnostic confirms visible-surface projection');
requireText(js,"familytodo:belongings-category-add-request",'unified Belongings category add dispatches canonical request');
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
requireText(belongingsUi,"if(category===U){g.hidden=false", 'unclassified Belongings is visibly retained after save');
requireText(css,'Empty named categories: name edits','empty category action styling');

requireText(belongingsUi,"g.className='belongings-category-group shopping-category-group'",'Belongings mirrors Shopping group structure');
requireText(belongingsUi,'belongings-category-footer shopping-category-footer','Belongings category-local add footer');
requireText(belongingsUi,"f.hidden=true",'Belongings composer deferred like Shopping');
forbidText(belongingsUi,'カテゴリを上へ','Belongings reorder arrows removed');
forbidText(belongingsUi,'カテゴリを下へ','Belongings reorder arrows removed');
requireText(js,"live.querySelector('.belongings-category-add-item')",'empty/unclassified Belongings routes use category-local add');
requireText(belongingsCss,'Belongings intentionally mirrors Shopping presentation','Shopping-equivalent Belongings CSS');
requireText(belongingsCss,'border-radius:5px!important','square Belongings checkbox');

/* Cross-section visual/interaction consistency contract */
for(const marker of ['checklist-section-tools','checklist-search-toggle','checklist-delete-toggle','checklist-status-tabs'])requireText(js,marker,`shared checklist control: ${marker}`);
for(const marker of ['shopping-category-group','belongings-category-group','shopping-category-toggle','belongings-category-toggle'])requireText(js,marker,`shopping/belongings shared category contract: ${marker}`);
for(const marker of ['width:22px!important','height:22px!important','border-radius:5px!important']){requireText(css,marker,`task/shopping square checkbox contract: ${marker}`);requireText(belongingsCss,marker,`belongings square checkbox contract: ${marker}`);}
requireText(categoryDrag,"const page=document.querySelector('.checklist-page')",'Belongings drag survives unified goods reparenting');
requireText(categoryDrag,"action:'update_category'",'Belongings item drag persists target category');
requireText(categoryDrag,"belongingsItemDrag",'Belongings rows receive drag affordance');
requireText(categoryDrag,"action:'category_reorder'",'Belongings drag persists category order');
requireText(categoryDrag,"name.title='タップで編集／長押しで並び替え'",'Belongings long-press drag affordance');
forbidText(belongingsUi,'カテゴリを上へ','no divergent Belongings up-arrow control');
forbidText(belongingsUi,'カテゴリを下へ','no divergent Belongings down-arrow control');

/* Unified checklist tabs must preserve direct-add routes. */
requireText(js,"className='checklist-kind-tabs task-event-tabs'",'task/event tabs');
requireText(js,"data-kind=\"event\"", 'event tab with count');
requireText(js,"className='checklist-kind-tabs goods-kind-tabs'",'shopping/belongings input tabs');
requireText(js,"unified-category-icon", 'type icon on category header');
requireText(js,"head?.querySelector('.checklist-search-toggle')?.remove()", 'search removed from compact header');
requireText(js,"trash.textContent=on?'✕':'🗑️'", 'icon-only delete cancel');
requireText(js,"reveal.textContent='＋ 子タスクを追加'", 'child task direct-add route preserved');
requireText(js,"'＋ 未分類に買い物を追加'", 'unclassified shopping direct-add route preserved');
requireText(js,"'＋ 未分類に持ち物を追加'", 'unclassified belongings direct-add route preserved');
requireText(css,'.unified-items-source{display:none!important}','single shared goods surface');

/* Active input type owns compact controls and AI destination. */
requireText(js,"ai.textContent='＋AI入力'",'compact AI input label');
requireText(js,"u.searchParams.set('type',kind)",'AI/add route follows selected kind');
requireText(css,'.unified-goods-section [hidden]{display:none!important}','explicitly hidden controls stay hidden');
requireText(css,'grid-template-columns:auto minmax(0,1fr)!important','two-row compact header does not overflow');

/* Shopping owns Belongings presentation; selected entry type must survive into AI/manual controllers. */
requireText(appShell,"/assets/task-rough-input-ai.js?v=${APP_VERSION}",'AI controller loaded by canonical entry page');
requireText(appShell,"/assets/task-rough-input-save.js?v=${APP_VERSION}",'AI save controller loaded by canonical entry page');
requireText(appShell,"/assets/task-rough-input-shopping-manual.js?v=${APP_VERSION}",'Shopping selected-type manual controller loaded');
forbidText(readFileSync('public/assets/task-rough-input-shopping-manual.js','utf8'),'shoppingTaskLinkPayload','retired Shopping Task-link payload in embedded manual entry');
forbidText(readFileSync('public/assets/task-rough-input-shopping-manual.js','utf8'),'shopping-task-link.js','retired Shopping Task-link controller in embedded manual entry');
requireText(appShell,"/assets/task-rough-input-item-manual.js?v=${APP_VERSION}",'Item selected-type manual controller loaded');
requireText(js,"if(kind==='event')u.searchParams.set('event','1')",'Event tab preserves canonical Event add route');
requireText(taskEntryPage,'task-idem2','selected-type manual entry cache revision');
requireText(appShell,"const CHECKLIST_HIERARCHY_UI_REVISION = 'hierarchy-parity12'",'checklist hierarchy cache revision');
requireText(appShell,'checklist-shopping-reusable-sets.js?v=${APP_VERSION}-set-boot4','Shopping set cache revision');
requireText(js,"familytodo:checklist-unified-ready",'async unified checklist completion signal');
const shoppingSets=readFileSync('public/assets/checklist-shopping-reusable-sets.js','utf8');
requireText(shoppingSets,"familytodo:checklist-unified-ready",'Shopping sets wait for async unified checklist completion');
if(belongingsCss.includes('.belongings-category-row')||belongingsCss.includes('.belongings-composer'))throw new Error('Belongings must not own divergent row/composer presentation CSS');
requireText(css,'Shopping is the single visual contract for both goods types.','Shopping is canonical for Belongings presentation');
requireText(js,"'unified-item-group','shopping-category-group'",'Belongings unified groups delegate to Shopping structural class');
requireText(css,'.unified-goods-section .unified-item-group.shopping-category-group','Belongings unified shell uses Shopping visual contract');
requireText(js,"'unified-shopping-group'",'Belongings unified groups share Shopping runtime structure');
const belongingSets=readFileSync('public/assets/checklist-belongings-reusable-sets.js','utf8');
requireText(belongingSets,"familytodo:checklist-unified-ready",'Belongings sets wait for unified checklist readiness');
requireText(js,"const liveAdd=task.querySelector('.task-add-top')",'Event tab updates the live add control');
requireText(js,"if(add instanceof HTMLElement){add.dataset.inputKind='task'",'Task/Event add works for button-owned quick entry');
requireText(js,"if(sz instanceof HTMLElement)sz.hidden=false;if(iz instanceof HTMLElement)iz.hidden=false",'Shopping and Belongings empty-category clusters remain visible together');
requireText(js,"if(shoppingUn instanceof HTMLElement)shoppingUn.hidden=kind!=='shopping';if(itemUn instanceof HTMLElement)itemUn.hidden=kind!=='item'",'only selected goods type exposes its unclassified add route');
forbidText(js,"g.hidden=(kind==='item')?!g.classList.contains('unified-item-group'):g.classList.contains('unified-item-group')",'goods tabs must not hide the non-selected goods categories');
requireText(js,"const shoppingTrash=tools?.querySelector('.category-delete-mode'),itemTrash=items.querySelector('.category-delete-mode')",'Shopping and Belongings delete controls remain independently functional');
requireText(js,"status.append(itemTrash)",'Belongings trash shares unified goods status-row placement');
requireText(js,"shopping.classList.toggle('category-delete-mode-active',items.classList.contains('category-delete-mode-active'))",'Belongings delete mode is mirrored onto the visible unified goods surface');
requireText(js,"goodsDeleteDiag=items.classList.contains('category-delete-mode-active')?'item:delete-mode-on':'item:delete-mode-off'",'Belongings delete activation records bounded diagnostic state');
requireText(js,"b.hidden=b.dataset.inputKind!==kind",'single visible category-add control follows selected goods type');
requireText(js,"shopping.classList.remove('category-delete-mode-active')",'goods tab switch exits stale Shopping category delete mode');
requireText(js,"document.querySelectorAll('.category-delete-minus').forEach(n=>n.remove())",'moved delete controls are cleared when category delete mode exits');
requireText(js,"g.className='belongings-category-group shopping-category-group unified-category-group unified-item-group unified-shopping-group category-collapsed'",'shared catalog category can materialize a Belongings group before adding an item');
requireText(js,"const mergedCategories=[],mergedMeta=[],seenCategories=new Set(),seenMeta=new Set()",'Shopping and Belongings expose one merged category catalog in the unified checklist');


/* Retired goods linkage must not be reintroduced by runtime-generated checklist rows. */
forbidText(flowFix,'task-shopping-add','runtime task-to-shopping affordance');
forbidText(flowFix,'task_id=','runtime task-linked shopping URL');
forbidText(flowFix,'関連: ','legacy related-task metadata injection');
requireText(flowFix,"const isEvent=type==='task'&&section.dataset.kindTab==='event'",'task/event quick-entry follows selected tab');
requireText(flowFix,'is_event:isEvent','event quick-entry payload flag');
requireText(categoryDrag,"g.dataset.categoryCommit==='1'",'single shopping category commit guard');
requireText(categoryDrag,"icon.textContent='🛒'",'shopping category icon survives inline creation');
requireText(js,'Array.isArray(sc.categoryMeta)?sc.categoryMeta:[]','shopping category age metadata reaches UI');
requireText(js,'Array.isArray(ic.categoryMeta)?ic.categoryMeta:[]','belongings category age metadata reaches UI');

/* Category create responses carry authoritative timestamps for immediate JST-01:00 placement. */
requireText(categoryApi,"created_at:String(created?.created_at||'')",'shopping category create timestamp response');
requireText(itemApi,"created_at:String(created?.created_at||'')",'belongings category create timestamp response');

/* Same-session category creation must retain authoritative age metadata in the live DOM. */
requireText(categoryDrag,"g.dataset.createdAt=String(created.created_at||'')",'shopping live category creation timestamp');
requireText(categoryDrag,"familytodo:category-created",'shopping live category creation event');
requireText(belongingsCategories,"g.dataset.createdAt=String(d.created_at||'')",'belongings live category creation timestamp');
requireText(belongingsCategories,"familytodo:category-created",'belongings live category creation event');
requireText(js,"document.addEventListener('familytodo:category-created',rememberCreated)",'hierarchy remembers same-session category age');

/* Checklist server/runtime must not retain legacy task-owned goods presentation. */
forbidText(taskEventsPage,'task-shopping-add','server-rendered task shopping affordance');
forbidText(taskEventsPage,'shopping_assignees','shopping assignee presentation query');
forbidText(taskEventsPage,'item_assignees','item assignee presentation query');
forbidText(taskEventsPage,"LEFT JOIN tasks t ON t.id=s.task_id",'shopping parent-task read');
forbidText(taskEventsJs,'task-shopping-add','event runtime task shopping affordance');
forbidText(taskEventsJs,'task_id=${id}','event runtime task-linked shopping URL');


/* Goods edit/create surfaces must not preserve retired Task ownership. */
requireText(taskEntryManual,"if(completionWrap)completionWrap.hidden=!taskMode",'Goods modes hide Task completion controls');
requireText(taskEntryManual,"if(assigneeWrap)assigneeWrap.hidden=!taskMode",'Goods modes hide Task assignee controls');
requireText(taskEntryManual,"if(!taskMode){",'non-Task entry disables stale assignee inputs');
requireText(shoppingEditPage,'due_date=?,task_id=NULL,url=?','Shopping edit clears legacy Task linkage');
forbidText(shoppingEditPage,'const taskId=Number(item.task_id)','Shopping edit must not preserve legacy Task linkage');
requireText(itemEditPage,'due_at=?,task_id=NULL,updated_at=?','Belongings edit clears legacy Task linkage');
forbidText(itemEditPage,'const taskId=Number(item.task_id)','Belongings edit must not preserve legacy Task linkage');

/* Unified empty categories expose their Goods kind and shared deletion retires both catalogs. */
requireText(js,"icon.textContent=kind==='shopping'?'🛒':'🎒'",'empty category rows identify Shopping vs Belongings');
requireText(js,"kind:'shared',names:[name]",'unified category deletion targets the shared catalog');
requireText(categoryMutation,"kind!=='shopping'&&kind!=='item'&&kind!=='shared'",'category mutation accepts shared Goods catalog deletion');
requireText(categoryMutation,"kind==='shopping'||kind==='shared'",'shared deletion retires Shopping catalog entry');
requireText(categoryMutation,"kind==='item'||kind==='shared'",'shared deletion retires Belongings catalog entry');
requireText(categoryMutation,"kind==='shared'?[ORDER_KEY,ITEM_ORDER_KEY]",'shared deletion removes both category order entries');
// CI trigger: Goods acceptance parity12
