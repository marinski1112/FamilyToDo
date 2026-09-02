import fs from 'node:fs';

const page=fs.readFileSync('src/calendar-page.ts','utf8');
const handler=fs.readFileSync('src/calendar-page-handler.ts','utf8');

if(page.includes("from './app'")) throw new Error('calendar page must remain isolated from app.ts');
if(!handler.includes("export { calendar } from './calendar-page';")) throw new Error('calendar handler ownership changed');
if(!page.includes("import { jpHolidayName, recurringForRange } from './recurrence-projection';")) throw new Error('calendar must share retained recurrence/holiday projection');
if(!page.includes("from './calendar-colors';")) throw new Error('calendar must share retained color policy');

console.log('calendar page source isolation contract ok');
