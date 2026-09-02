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

if(!handlers.includes("export { taskView } from './task-view-page';"))throw new Error('task page boundary must route taskView through retained module');
if(!handlers.includes("export { today, tomorrow, taskEvents, taskEdit, itemEdit } from './app';"))throw new Error('unmigrated task page handlers changed unexpectedly');
if(!routes.includes("if(url.pathname==='/task/view.php') return await taskView(context,Number(url.searchParams.get('id')||0));"))throw new Error('task detail page route changed');

console.log('task-view-page-boundary: retained detail ownership and PRIVATE physical/occurrence visibility ok');
