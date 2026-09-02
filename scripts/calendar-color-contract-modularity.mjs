import fs from 'node:fs';

const colors=fs.readFileSync('src/calendar-colors.ts','utf8');
const taskApi=fs.readFileSync('src/task-api.ts','utf8');
const newEntry=fs.readFileSync('src/new-entry-pages.ts','utf8');

const expected=[
  ['#7c3aed','紫'],
  ['#2563eb','青'],
  ['#16a34a','緑'],
  ['#ea580c','橙'],
  ['#dc2626','赤'],
  ['#db2777','ピンク'],
  ['#0891b2','水色'],
  ['#64748b','灰'],
];
for(const [value,label] of expected){
  if(!colors.includes(`{value:'${value}',label:'${label}'}`)) throw new Error(`calendar color contract lost ${label} ${value}`);
}
if(!colors.includes("export const DEFAULT_CALENDAR_COLOR='#7c3aed';")) throw new Error('calendar color default changed');
if(!colors.includes('export function normalizeCalendarColor')) throw new Error('calendar color normalizer missing');

if(!taskApi.includes("import { normalizeCalendarColor } from './calendar-colors';")) throw new Error('task API must use retained calendar color contract');
if(!taskApi.includes('const calendarColor=normalizeCalendarColor(b.calendar_color);')) throw new Error('task API color normalization wiring changed');
if(taskApi.includes('const allowedColors=[')) throw new Error('task API must not duplicate the calendar color allowlist');

if(!newEntry.includes("import { CALENDAR_COLOR_OPTIONS } from './calendar-colors';")) throw new Error('task create page must use retained calendar color options');
if(!newEntry.includes("CALENDAR_COLOR_OPTIONS.map(option=>`<option value=\"${option.value}\">${option.label}</option>`).join('')")) throw new Error('task create color selector wiring changed');
if(newEntry.includes('<option value="#7c3aed">紫</option><option value="#2563eb">青</option>')) throw new Error('task create page must not duplicate the hardcoded color palette');

console.log('calendar color contract modularity ok');
