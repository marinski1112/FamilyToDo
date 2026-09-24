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
  "import { goodsVisibilitySql } from './goods-visibility';",
  "export async function itemEdit(request:Request,ctx:AppContext,id:number):Promise<Response>{",
  "SELECT i.* FROM items i WHERE i.id=? AND i.family_id=?",
  "${goodsVisibilitySql('i')}",
  ".bind(id,m.family_id,m.id).first<Row>()",
  "return new Response('持ち物が見つかりません。',{status:404});",
  "role==='OWNER'||role==='ADMIN'||Number(item.created_by)===m.id",
  "due_at=?,updated_at=?",
  "...archiveItemCompletionStatements(ctx.env.DB,m.family_id,id,nowJst())",
  "return redirect(`/app/tasks.php${due?'?date='+encodeURIComponent(due):''}`);",
  "<h1>🎒 持ち物編集</h1>",
  "<h2>完了履歴</h2>",
])if(!page.includes(marker))throw new Error(`retained item edit behavior/privacy marker missing: ${marker}`);
if(page.includes('const taskId=Number(item.task_id)||null;'))throw new Error('item edit must not preserve retired Task linkage');
const renderedPage=page.slice(page.indexOf('const renderedBody='));
for(const retired of ['name="task_id"','name="assignees"','<label>関連タスク</label>','<label>担当者</label>'])if(renderedPage.includes(retired))throw new Error(`item edit restored retired linkage control: ${retired}`);

if(handlers.includes("from './app'"))throw new Error('task page handlers must no longer depend on app.ts');
if(!handlers.includes("export { itemEdit } from './item-edit-page';"))throw new Error('itemEdit must route through retained item edit page');
if(!handlers.includes("export { taskEdit } from './task-edit-page';"))throw new Error('taskEdit retained boundary missing');
if(!routes.includes("if(url.pathname==='/item/edit.php') return await itemEdit(request,context,Number(url.searchParams.get('id')||0));"))throw new Error('item edit route changed');

console.log('item-edit-page-boundary: retained item edit ownership, PRIVATE parent lock and lifecycle semantics ok');
await import('./goods-edit-privacy-runtime-contract.mjs');
await import('./goods-owned-visibility-contract.mjs');
