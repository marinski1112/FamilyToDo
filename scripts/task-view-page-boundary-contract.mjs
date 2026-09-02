import fs from 'node:fs';

const view=fs.readFileSync('src/task-view-page.ts','utf8');
const handlers=fs.readFileSync('src/task-page-handlers.ts','utf8');
const routes=fs.readFileSync('src/page-routes.ts','utf8');

if(view.includes("from './app'"))throw new Error('task detail view must not depend on app.ts');
for(const marker of [
  "import type { AppContext } from './app-context';",
  "import { layout } from './app-shell';",
  "import { taskVisibilitySql } from './task-visibility';",
  "export async function taskView(ctx:AppContext,id:number):Promise<Response>{",
  "r.name recurrence_name,t.completion_mode,r.task_id,t.*",
  "WHERE o.id=? AND o.family_id=? AND ${taskVisibilitySql('t')} LIMIT 1",
  ".bind(occurrenceId,m.family_id,m.id)",
  "WHERE t.id=? AND t.family_id=? AND ${taskVisibilitySql('t')} GROUP BY t.id LIMIT 1",
  ".bind(id,m.family_id,m.id)",
  "return new Response('定期タスクの発生日が見つかりません。',{status:404});",
  "return new Response('タスクが見つかりません。',{status:404});",
  'taskViewPayload',
  '/assets/task-view.js?v=12.147.0-wave128',
  'data-type=\"shopping\"',
  'data-type=\"item\"',
  '/task/convert_occurrence.php',
])if(!view.includes(marker))throw new Error(`retained task detail behavior/privacy marker missing: ${marker}`);
if(view.includes('r.name recurrence_name,r.completion_mode'))throw new Error('recurrence detail must read completion_mode from parent tasks, not recurrence_rules');

if(handlers.includes("from './app'"))throw new Error('task page handlers must no longer depend on app.ts');
if(!handlers.includes("export { taskView } from './task-view-page';"))throw new Error('task page boundary must route taskView through retained module');
if(!handlers.includes("export { taskEvents } from './task-events-page';"))throw new Error('retained taskEvents boundary missing');
if(!handlers.includes("export { today, tomorrow } from './daily-task-page';"))throw new Error('retained daily task page boundary missing');
if(!handlers.includes("export { itemEdit } from './item-edit-page';"))throw new Error('retained item edit boundary missing');
if(!handlers.includes("export { taskEdit } from './task-edit-page';"))throw new Error('retained task edit boundary missing');
if(!routes.includes("if(url.pathname==='/task/view.php') return await taskView(context,Number(url.searchParams.get('id')||0));"))throw new Error('task detail page route changed');

console.log('task-view-page-boundary: retained detail ownership, PRIVATE visibility and recurrence D1 completion-mode source ok');
