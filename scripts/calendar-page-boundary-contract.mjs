import fs from 'node:fs';

const page=fs.readFileSync('src/calendar-page.ts','utf8');
const handler=fs.readFileSync('src/calendar-page-handler.ts','utf8');
const recurrence=fs.readFileSync('src/recurrence-projection.ts','utf8');
const routes=fs.readFileSync('src/page-routes.ts','utf8');

for(const marker of [
  "import type { AppContext } from './app-context';",
  "import { layout } from './app-shell';",
  "from './calendar-colors';",
  "import { jpHolidayName, recurringForRange } from './recurrence-projection';",
  "import { html, redirect } from './response';",
  "import { safeCalendarDateRange } from './task-range-safety';",
  "import { taskVisibilitySql } from './task-visibility';",
  'export async function calendar(request:Request,ctx:AppContext,month:string):Promise<Response>{',
  "const view=['all','family','assigned','private'].includes(requestedView)?requestedView:'all';",
  "const recurRows=await recurringForRange(ctx,from,to);",
  "taskVisibilitySql('t')",
  "taskVisibilitySql('pt')",
  'safeCalendarDateRange(t.start_at||t.due_at,t.end_at||t.start_at||t.due_at)',
  'jpHolidayName(d)',
  '--calendar-day-band-rows:',
  'recurrence_rule_id:t.recurrence_rule_id??0',
  'recurrence_occurrence_id:t.recurrence_occurrence_id??0',
  'id="calendarPayload"',
  '/assets/calendar.js?v=${APP_VERSION}',
  '/assets/occurrence-family-log.js?v=${APP_VERSION}',
  'id="dayModal"',
  'id="calendarFab"',
  "layout('カレンダー',body,'/app/calendar.php')",
]) if(!page.includes(marker)) throw new Error(`calendar retained page lost behavior marker: ${marker}`);

if(page.includes("from './app'")) throw new Error('calendar retained page must not depend on app.ts');
if(!handler.includes("export { calendar } from './calendar-page';")) throw new Error('calendar handler must route through retained page');
if(handler.includes("from './app'")) throw new Error('calendar handler must not depend on app.ts');
if(!recurrence.includes('export function jpHolidayName(date:string):string|null{')) throw new Error('shared recurrence holiday helper must remain exported');
if(!routes.includes("if(url.pathname==='/app/calendar.php') return await calendar(request,context,url.searchParams.get('month')")) throw new Error('calendar route wiring changed');

console.log('calendar-page-boundary: retained month/detail ownership, privacy, recurrence, holiday, range and asset contracts ok');
