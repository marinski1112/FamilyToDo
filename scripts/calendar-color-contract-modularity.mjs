import fs from 'node:fs';

const colors=fs.readFileSync('src/calendar-colors.ts','utf8');
const taskApi=fs.readFileSync('src/task-api.ts','utf8');
const newEntry=fs.readFileSync('src/new-entry-pages.ts','utf8');
const taskNew=fs.readFileSync('public/assets/task-new.js','utf8');
const taskEdit=fs.readFileSync('src/task-edit-page.ts','utf8');
const taskEditJs=fs.readFileSync('public/assets/task-edit.js','utf8');

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
if(!colors.includes('const CALENDAR_COLOR_PATTERN=/^#[0-9a-f]{6}$/i;')) throw new Error('calendar custom color safety pattern missing');
if(!colors.includes('export function normalizeCalendarColor')) throw new Error('calendar color normalizer missing');
if(!colors.includes('candidate.toLowerCase()')) throw new Error('calendar custom colors must normalize to canonical lowercase hex');

if(!taskApi.includes("import { normalizeCalendarColor } from './calendar-colors';")) throw new Error('task API must use retained calendar color contract');
if(!taskApi.includes('const calendarColor=normalizeCalendarColor(b.calendar_color);')) throw new Error('task API color normalization wiring changed');
if(taskApi.includes('const allowedColors=[')) throw new Error('task API must not duplicate the calendar color allowlist');

if(!newEntry.includes("import { CALENDAR_COLOR_OPTIONS } from './calendar-colors';")) throw new Error('task create page must use retained calendar color options');
if(!newEntry.includes("CALENDAR_COLOR_OPTIONS.map(option=>`<option value=\"${option.value}\">${option.label}</option>`).join('')")) throw new Error('task create color selector wiring changed');
if(newEntry.includes('<option value="#7c3aed">紫</option><option value="#2563eb">青</option>')) throw new Error('task create page must not duplicate the hardcoded color palette');
if(!taskNew.includes("calendarCustomColor.type='color'")) throw new Error('task create page must expose a native custom color picker');
if(!taskNew.includes("b.calendar_color=calendarCustomColor?.value||f.calendar_color.value")) throw new Error('task create submission must prefer the selected custom color');
if(!taskNew.includes("calendarColorSelect.addEventListener('change'")) throw new Error('preset selection must remain synchronized with the custom picker');

if(!taskEdit.includes("import { CALENDAR_COLOR_OPTIONS, normalizeCalendarColor } from './calendar-colors';")) throw new Error('task edit page must use canonical calendar color contract');
if(!taskEdit.includes('const calendarColor=normalizeCalendarColor(b.calendar_color,normalizeCalendarColor(task.calendar_color));')) throw new Error('task edit server must accept safe custom colors through canonical normalization');
if(!taskEdit.includes('CALENDAR_COLOR_OPTIONS.map(option=>')) throw new Error('task edit preset selector must render from canonical options');
if(taskEdit.includes('const allowedColors=[')) throw new Error('task edit page must not duplicate the hardcoded color allowlist');
if(!taskEdit.includes('id="editCalendarColorCustom" type="color"')) throw new Error('task edit page must expose a native custom color picker');
if(!taskEditJs.includes("const syncSelectFromCustomColor=()=>")) throw new Error('task edit custom picker must synchronize into the submitted selector');
if(!taskEditJs.includes("editCalendarColorCustom.addEventListener('input',syncSelectFromCustomColor)")) throw new Error('task edit custom color input wiring changed');
if(!taskEditJs.includes("colorSelect.addEventListener('change',syncCustomColorFromSelect)")) throw new Error('task edit preset selection must remain synchronized with the picker');

console.log('calendar color contract modularity ok');
