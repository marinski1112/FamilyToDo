import fs from 'node:fs';

const page=fs.readFileSync('src/item-edit-page.ts','utf8');
const handlers=fs.readFileSync('src/task-page-handlers.ts','utf8');
const routes=fs.readFileSync('src/page-routes.ts','utf8');

if(page.includes("from './app'"))throw new Error('item edit page must not depend on app.ts');
for(const marker of [
  "import type { AppContext } from './app-context';",
  "import { layout } from './app-shell';",
  "import { archiveItemCompletionStatements } from './lifecycle';",
  "import { bodyJson, RequestBodyParseError } from './request-body';",
  "import { taskVisibilitySql } from './task-visibility';",
  "export async function itemEdit(request:Request,ctx:AppContext,id:number):Promise<Response>{",
  "SELECT i.* FROM items i WHERE i.id=? AND i.family_id=?",
  "${taskVisibilitySql('t')}",
  ".bind(id,m.family_id,m.id).first<Row>()",
  "return new Response('持ち物が見つかりません。',{status:404});",
  "role==='OWNER'||role==='ADMIN'||Number(item.created_by)===m.id",
  "visibility_scope='PRIVATE' AND private_owner_id=?",
  "const taskId=privateParent?Number(item.task_id):(Number(b.task_id||0)||null);",
  "const assignees=privateParent?[Number(privateParent.private_owner_id)]",
  "...archiveItemCompletionStatements(ctx.env.DB,m.family_id,id,nowJst())",
  "DELETE FROM item_completions WHERE item_id=? AND member_id NOT IN",
  "UPDATE items SET status=CASE WHEN",
  "completion_mode='ALL'",
  "return redirect(`/app/tasks.php${due?'?date='+encodeURIComponent(due):''}`);",
  "<h1>🎒 持ち物編集</h1>",
  "自分専用タスクとの紐付けは編集時に解除できません。",
  "自分専用タスクのため、担当者はあなたのみです",
  "<h2>完了履歴</h2>",
])if(!page.includes(marker))throw new Error(`retained item edit behavior/privacy marker missing: ${marker}`);

if(handlers.includes("from './app'"))throw new Error('task page handlers must no longer depend on app.ts');
if(!handlers.includes("export { itemEdit } from './item-edit-page';"))throw new Error('itemEdit must route through retained item edit page');
if(!handlers.includes("export { taskEdit } from './task-edit-page';"))throw new Error('taskEdit retained boundary missing');
if(!routes.includes("if(url.pathname==='/item/edit.php') return await itemEdit(request,context,Number(url.searchParams.get('id')||0));"))throw new Error('item edit route changed');

console.log('item-edit-page-boundary: retained item edit ownership, PRIVATE parent lock and lifecycle semantics ok');
