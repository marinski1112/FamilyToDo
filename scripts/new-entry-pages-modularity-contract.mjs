import fs from 'node:fs';

const index=fs.readFileSync('src/index.ts','utf8');
const pages=fs.readFileSync('src/new-entry-pages.ts','utf8');
const exceptionRoutes=fs.readFileSync('src/exception-routes.ts','utf8');

if(!exceptionRoutes.includes("import { taskNew, itemNew } from './new-entry-pages';")) throw new Error('exception routes must import new page handlers');
for(const marker of ['async function taskNew(','async function itemNew(','id="taskNewPayload"','id="itemFormError"']) {
  if(index.includes(marker)) throw new Error(`new page implementation leaked into index: ${marker}`);
}
for(const marker of [
  'export async function taskNew(',
  'export async function itemNew(',
  "SELECT DISTINCT s.category FROM shopping_items",
  "SELECT id,title,start_at,due_at,visibility_scope FROM tasks",
  '/assets/task-new.js?v=12.147.0-wave128',
  '/assets/item-new.js?v=12.93-wave74',
  'taskChildVisibilitySql',
  'taskVisibilitySql',
]) if(!pages.includes(marker)) throw new Error(`new page module lost behavior marker: ${marker}`);
for(const route of [
  "if(url.pathname==='/task/new.php') return await taskNew(context,url.searchParams.get('date')||asDateOffset(0,String(context.member?.family_timezone||env.APP_TIMEZONE||DEFAULT_FAMILY_TIMEZONE)),url.searchParams.get('return')||'');",
  "if(url.pathname==='/item/new.php') return await itemNew(context,url.searchParams.get('date')||asDateOffset(0,String(context.member?.family_timezone||env.APP_TIMEZONE||DEFAULT_FAMILY_TIMEZONE)),Number(url.searchParams.get('task_id')||0));",
]) if(!exceptionRoutes.includes(route)) throw new Error(`new page route wiring changed: ${route}`);
console.log('new entry pages modularity contract ok');