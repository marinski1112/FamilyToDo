import fs from 'node:fs';

const handlers=fs.readFileSync('src/task-page-handlers.ts','utf8');
const routes=fs.readFileSync('src/page-routes.ts','utf8');

if(fs.existsSync('src/daily-task-page.ts'))throw new Error('retired daily standalone page must not return');
if(handlers.includes("from './daily-task-page'"))throw new Error('task handlers must not re-export retired daily standalone pages');
if(!handlers.includes("export { taskEvents } from './task-events-page';"))throw new Error('canonical checklist handler missing');
if(routes.includes('return await today(')||routes.includes('return await tomorrow('))throw new Error('retired daily handlers must not be dispatched');

console.log('daily task page contract: standalone daily implementation remains retired and canonical checklist handler remains active');
