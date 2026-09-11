import fs from 'node:fs';

const colors=fs.readFileSync('src/calendar-colors.ts','utf8');
const taskApi=fs.readFileSync('src/task-api.ts','utf8');
const taskEntry=fs.readFileSync('src/task-entry-page.ts','utf8');
const colorUi=fs.readFileSync('public/assets/calendar-color-ui.js','utf8');
const taskEdit=fs.readFileSync('src/task-edit-page.ts','utf8');
const taskEditJs=fs.readFileSync('public/assets/task-edit.js','utf8');
const recurringPage=fs.readFileSync('src/recurring-page.ts','utf8');
const recurringJs=fs.readFileSync('public/assets/recurring.js','utf8');

const expected=[
  ['#7c3aed','紫'],
  ['#2563eb','青'],
  ['#16a34a','緑'],
  ['#ea580c','橙'],
  ['#dc2626','赤'],
  ['#db2777','ピンク'],
  ['#0891b2','水色'],
  ['#64748b','灰'],
  ['#f35f8c','ローズピンク'],
  ['#2ecc87','エメラルド'],
  ['#47b2f7','スカイブルー'],
  ['#b38bdc','ラベンダー'],
  ['#fdc02d','アンバー'],
  ['#fb7f77','コーラル'],
];
for(const [value,label] of expected){
  if(!colors.includes(`{value:'${value}',label:'${label}'}`)) throw new Error(`calendar color contract lost ${label} ${value}`);
}
if(colors.includes('TimeTree')) throw new Error('calendar color labels must not expose legacy TimeTree suffixes');
if(!colors.includes("export const DEFAULT_CALENDAR_COLOR='#7c3aed';")) throw new Error('calendar color default changed');
if(!colors.includes('const CALENDAR_COLOR_PATTERN=/^#[0-9a-f]{6}$/i;')) throw new Error('calendar custom color safety pattern missing');
if(!colors.includes('export function normalizeCalendarColor')) throw new Error('calendar color normalizer missing');
if(!colors.includes('candidate.toLowerCase()')) throw new Error('calendar custom colors must normalize to canonical lowercase hex');

if(!taskApi.includes("import { normalizeCalendarColor } from './calendar-colors';")) throw new Error('task API must use retained calendar color contract');
if(!taskApi.includes('const calendarColor=normalizeCalendarColor(b.calendar_color);')) throw new Error('task API color normalization wiring changed');
if(taskApi.includes('const allowedColors=[')) throw new Error('task API must not duplicate the calendar color allowlist');

if(!taskEntry.includes("import { CALENDAR_COLOR_OPTIONS } from './calendar-colors';")) throw new Error('unified task/event create page must use retained calendar color options');
if(!taskEntry.includes('CALENDAR_COLOR_OPTIONS.map(option=>')) throw new Error('unified task/event create color selector wiring changed');
if(taskEntry.includes('<option value="#7c3aed">紫</option><option value="#2563eb">青</option>')) throw new Error('task create page must not duplicate the hardcoded color palette');
if(!taskEntry.includes('id="taskCalendarCustomColor" type="color"')) throw new Error('task create page must expose a native custom color picker');
for(const marker of [
  "const STORAGE_KEY='familytodo:lastCalendarColor'",
  "const valid=value=>/^#[0-9a-f]{6}$/i.test",
  "const isCreatePage=()=>Boolean(document.getElementById('taskNewPayload'))&&!document.getElementById('taskEditForm')",
  "localStorage.setItem(STORAGE_KEY,normalized(value))",
  "localStorage.getItem(STORAGE_KEY)",
  "swatch.className='calendar-color-swatch'",
  'swatch.style.backgroundColor=value',
  "replace(/\\s*[（(]TimeTree[）)]\\s*/gu,'')",
]) if(!colorUi.includes(marker)) throw new Error(`unified create calendar color UI marker missing: ${marker}`);

if(!taskEdit.includes("import { CALENDAR_COLOR_OPTIONS, normalizeCalendarColor } from './calendar-colors';")) throw new Error('task edit page must use canonical calendar color contract');
if(!taskEdit.includes('const calendarColor=normalizeCalendarColor(b.calendar_color,normalizeCalendarColor(task.calendar_color));')) throw new Error('task edit server must accept safe custom colors through canonical normalization');
if(!taskEdit.includes('CALENDAR_COLOR_OPTIONS.map(option=>')) throw new Error('task edit preset selector must render from canonical options');
if(taskEdit.includes('const allowedColors=[')) throw new Error('task edit page must not duplicate the hardcoded color allowlist');
if(!taskEdit.includes('id="editCalendarColorCustom" type="color"')) throw new Error('task edit page must expose a native custom color picker');
if(!taskEditJs.includes("const syncSelectFromCustomColor=()=>")) throw new Error('task edit custom picker must synchronize into the submitted selector');
if(!taskEditJs.includes("editCalendarColorCustom.addEventListener('input',syncSelectFromCustomColor)")) throw new Error('task edit custom color input wiring changed');
if(!taskEditJs.includes("colorSelect.addEventListener('change',syncCustomColorFromSelect)")) throw new Error('task edit preset selection must remain synchronized with the picker');

if(!recurringPage.includes("import { CALENDAR_COLOR_OPTIONS, normalizeCalendarColor } from './calendar-colors';")) throw new Error('recurring page must use canonical calendar color contract');
if((recurringPage.match(/normalizeCalendarColor\(b\.calendar_color\)/g)||[]).length<2) throw new Error('recurring create/update must accept safe custom colors through canonical normalization');
if(recurringPage.includes('const allowedColors=[')) throw new Error('recurring page must not duplicate the hardcoded color allowlist');
if(!recurringPage.includes('CALENDAR_COLOR_OPTIONS.map(option=>')) throw new Error('recurring preset selector must render from canonical options');
if(!recurringPage.includes('id="recCalendarColorCustom" type="color"')) throw new Error('recurring page must expose a native custom color picker');
if(!recurringJs.includes("const syncSelectFromCustomColor=()=>")) throw new Error('recurring custom picker must synchronize into the submitted selector');
if(!recurringJs.includes("recCalendarColorCustom?.addEventListener('input',syncSelectFromCustomColor)")) throw new Error('recurring custom color input wiring changed');
if(!recurringJs.includes("calendarColorSelect?.addEventListener('change',syncCustomColorFromSelect)")) throw new Error('recurring preset selection must remain synchronized with the picker');

console.log('calendar color contract modularity ok');
