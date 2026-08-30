import assert from 'node:assert/strict';
import fs from 'node:fs';
import {execFileSync} from 'node:child_process';

const app=fs.readFileSync('src/app.ts','utf8');
const family=fs.readFileSync('public/assets/family.css','utf8');
const calendarCss=fs.readFileSync('public/assets/calendar.css','utf8');
const calendar=fs.readFileSync('public/assets/calendar.js','utf8');
const ui=fs.readFileSync('public/assets/calendar-mobile-ui.js','utf8');
const sw=fs.readFileSync('public/sw.js','utf8');

execFileSync(process.execPath,['--check','public/assets/calendar-mobile-ui.js'],{stdio:'inherit'});

// Compact month/date jump controls and mobile geometry.
for(const token of ['calendar-month-jump','calendar-jump-go','class="compact-form"'])assert.ok(app.includes(token),`missing Calendar jump markup: ${token}`);
for(const token of ['calendarJumpPanel','calendarMonthJump','calendarDateJump','2000','2100','openDate'])assert.ok(app.includes(token)||calendar.includes(token),`missing Calendar jump behavior: ${token}`);
assert.ok(calendar.includes("get('open')"),'Calendar must preserve direct-date open handling');
assert.ok(calendar.includes("loadMonth(currentPrev,-1)"),'previous-month control must remain wired');
assert.ok(calendar.includes("loadMonth(currentNext,1)"),'next-month control must remain wired');
assert.ok(calendar.includes('touchend'),'Calendar month swipe handling must remain wired');
assert.equal(app.match(/>移動<\/button>/g)?.length,2,'Calendar must retain both compact move controls');
for(const token of ['native-control-shell','repeat(4,minmax(0,1fr))','white-space:nowrap'])assert.ok(family.includes(token),`missing shared compact-control CSS: ${token}`);
for(const token of ['minmax(0,1fr) 72px 56px','minmax(0,1fr) 56px','width:min(292px','min-height:40px'])assert.ok(calendarCss.includes(token),`missing Calendar compact geometry: ${token}`);
for(const width of [320,360,375,390,430]){const panel=Math.min(292,width-20),inner=panel-24;assert.ok(72+56+16<=inner,`month geometry overflow at ${width}`);assert.ok(56+8<=inner,`date geometry overflow at ${width}`);}

// Calendar date-content positioning must account for multi-day band rows.
assert.ok(app.includes('--calendar-day-band-rows:'),'Calendar cells must publish their band-row count');
assert.ok(app.includes('--calendar-day-content-top:calc(var(--calendar-date-zone) +'),'Calendar content must be positioned below date and band zones');
assert.ok(calendarCss.includes('--calendar-no-band-content-top:29px'),'Calendar no-band cells must retain the compact content offset');
assert.ok(calendarCss.includes('[data-band-rows="0"]'),'Calendar no-band positioning selector must remain present');
assert.match(calendarCss,/top:calc\(var\(--calendar-date-zone\) \+ var\(--calendar-day-band-rows\) \* var\(--calendar-band-step\)\)!important/,'Calendar item positioning must include band rows');
assert.ok(calendarCss.includes('var(--calendar-day-band-rows) * var(--calendar-band-step)'),'Calendar content positioning must use per-day band row count');
assert.ok(!calendarCss.includes('margin-top:calc(var(--calendar-band-rows)'),'obsolete band-row margin positioning must remain retired');
const contentTop=(dateZone,dayBands,step)=>dateZone+dayBands*step;
assert.equal(contentTop(34,0,17),34);
assert.equal(contentTop(34,2,17),68);

// Hard two-row schedule budget including recurring and multi-day rows.
assert.ok(ui.includes("Number(row?.spanDays||1)<=1"),'one-day rows must be detected by spanDays, not legacy segment labels');
assert.ok(ui.includes(".calendar-items > .calendar-item:not(.item)"),'schedule cap must include recurring/task/event rows while excluding carry-item rows');
assert.ok(ui.includes("row.style.setProperty('display','none','important')"),'third and later schedule rows must stay hidden despite important display rules');
assert.ok(ui.includes("singles.forEach((row,index)=>setOverflowHidden(row,index>=singleSlots))"),'single-day schedules must obey remaining two-row slots');
assert.ok(ui.includes("setOverflowHidden(band,bandLane(band)>2)"),'multi-day bands must share the same two-row budget');
assert.ok(ui.includes('bandsForCell')&&ui.includes('singleSlots'),'row budgeting must account for spanning bands and ordinary rows together');

// Service-worker cache lifecycle required for Calendar asset updates.
assert.match(sw,/const STATIC_CACHE='familytodo-static-[^']+'/,'static cache must use the Family TODO namespace');
assert.match(sw,/name\.startsWith\('familytodo-static-'\)&&name!==STATIC_CACHE/,'older Family TODO static caches must be retired');

console.log('calendar-presentation-contract: jump controls, positioning and two-row schedule contracts ok');
