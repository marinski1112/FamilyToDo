import assert from 'node:assert/strict';
import fs from 'node:fs';
import { retainedAppContractSource } from './retained-app-contract-source.mjs';

const pwa=fs.readFileSync('public/assets/pwa.js','utf8');
const sw=fs.readFileSync('public/sw.js','utf8');
const calendar=fs.readFileSync('public/assets/calendar-mobile-ui.js','utf8');
const familyLoader=fs.readFileSync('public/assets/family-log.js','utf8');
const familyCore=fs.readFileSync('public/assets/family-log-core.js','utf8');
const familyUi=fs.readFileSync('public/assets/family-log-management-ui.js','utf8');
const messageNew=fs.readFileSync('public/assets/message-new.js','utf8');
const messages=fs.readFileSync('public/assets/messages.js','utf8');
const taskNew=fs.readFileSync('public/assets/task-new.js','utf8');
const taskEdit=fs.readFileSync('public/assets/task-edit.js','utf8');
const app=retainedAppContractSource();
const worker=fs.readFileSync('src/index.ts','utf8');
const digest=fs.readFileSync('src/line-daily-digest.ts','utf8');

// Mobile navigation
assert.match(pwa,/\.bottom-nav \.nav-inner>a\{white-space:nowrap!important/,'bottom navigation labels must not wrap on mobile');
assert.match(pwa,/word-break:keep-all!important/,'Japanese navigation labels must stay intact');
assert.match(pwa,/a\[href="\/app\/tasks\.php"\]\{font-size:8px!important;letter-spacing:-\.06em!important\}/,'long task/event label must fit the six-column mobile nav');

// Quick-action labels and compact action grids
const splitLabel=value=>{const chars=Array.from(value);return chars.length>=5&&chars.length<=8?[chars.slice(0,4).join(''),chars.slice(4).join('')]:[value];};
for(const value of ['ミ','ミルク','おむつ','おむつ交換','12345678','猫🐈ごはん']){
  const lines=splitLabel(value);
  assert.equal(lines.join(''),value,`${value}: label must not be truncated`);
  if(Array.from(value).length<=4)assert.equal(lines.length,1,`${value}: 1-4 code points must stay one line`);
  if(Array.from(value).length>=5&&Array.from(value).length<=8){assert.ok(lines.length<=2,`${value}: 5-8 code points max two lines`);assert.equal(Array.from(lines[0]).length,4);}
}
assert.match(pwa,/Array\.from\(label\.textContent/,'quick-action labels must split by code point');
assert.match(pwa,/chars\.length>=5&&chars\.length<=8/,'5-8 code point labels must use the compact two-line rule');
assert.match(pwa,/document\.createElement\('br'\)/,'label wrapping must insert a real line break rather than truncate text');
assert.match(pwa,/@media\(max-width:340px\).*repeat\(3/s,'narrow screens must use a three-column quick-action grid');
assert.match(pwa,/repeat\(4,minmax\(0,1fr\)\)/,'normal mobile quick-action grids must support four columns');
assert.match(pwa,/grid-template-columns:18px minmax\(0,1fr\)!important/,'compact message rows must preserve icon/text geometry');
assert.match(pwa,/\.message-actions \.convert-shopping\{color:#fff!important\}/,'shopping conversion action must retain readable contrast');

// PRIVATE task/event creation and editing must preserve the same visibility controls.
assert.match(taskNew,/if\(isEvent\?\.checked\)\{noDate\.checked=false;noDate\.disabled=true;if\(isPrivate\)isPrivate\.disabled=false/,'new EVENT flow must allow PRIVATE visibility');
assert.match(taskEdit,/if\(editIsEvent\?\.checked\)\{editNoDate\.checked=false;editNoDate\.disabled=true;\}else\{editNoDate\.disabled=false;\}if\(editIsPrivate\)editIsPrivate\.disabled=false/,'editing an EVENT must keep PRIVATE visibility available');
assert.doesNotMatch(taskEdit,/editIsPrivate\.checked=false/,'editing an EVENT must never silently reset PRIVATE to FAMILY');
assert.match(taskEdit,/is_private:editIsPrivate\?\.checked\|\|false/,'edit submit payload must carry PRIVATE visibility explicitly');
assert.match(app,/const makePrivate=privateTaskRequested\(b\);/,'server edit flow must honor PRIVATE for both TASK and EVENT');
assert.doesNotMatch(app,/const makePrivate=!isEvent&&privateTaskRequested\(b\);/,'server edit flow must not force EVENT visibility back to FAMILY');
assert.ok(app.includes("makePrivate?'PRIVATE':'FAMILY',makePrivate?m.id:null"),'server edit flow must persist PRIVATE scope and owner');
assert.ok(app.includes('const assignees=makePrivate?[m.id]'),'PRIVATE task/event reminders and child assignments must remain owner-scoped');
assert.ok(app.includes('if(reminderAt&&assignees.length){'),'scheduled reminders must be generated only from the resolved assignee recipient scope');

// Task creation transport failure handling
assert.match(taskNew,/const d=await r\.json\(\)\.catch\(\(\)=>null\);if\(!r\.ok\|\|!d\?\.ok\)throw new Error\('登録に失敗しました'\)/,'task creation must treat non-JSON, HTTP, and API failures as fixed-detail failures');
assert.match(taskNew,/catch\(_err\)\{alert\('登録に失敗しました'\)/,'task creation network failures must reach the privacy-safe user-visible error path');
assert.doesNotMatch(taskNew,/d\?\.error|err\.message|console\.(?:log|warn|error)\(/,'task creation failures must not surface or log arbitrary server/exception detail');
assert.match(taskNew,/payload\.returnTo==='calendar'/,'successful task creation must preserve the existing calendar return flow');
assert.match(taskNew,/document\.referrer/,'Calendar task creation must recover the originating Calendar navigation state');
assert.match(taskNew,/\['all','family','assigned','private'\]\.includes\(v\)/,'Calendar return view must be constrained to the supported filter allowlist');
assert.match(taskNew,/\/app\/calendar\.php\?view='\+encodeURIComponent\(calendarReturnView\)\+'&month='/,'successful Calendar task creation must retain the active filter when returning');
assert.doesNotMatch(sw,/const STATIC_CACHE='familytodo-static-message-delete-error-handling'/,'task creation asset changes must remain past the pre-fix static cache namespace so first-visit delivery is preserved');

// Message composition failure handling
assert.match(messageNew,/await r\.json\(\)\.catch\(\(\)=>null\)/,'message submit must tolerate non-JSON error responses');
assert.match(messageNew,/if\(!r\.ok\|\|!d\?\.ok\)throw new Error/,'message submit must treat HTTP/API failures as failures');
assert.match(messageNew,/catch\(err\)\{alert\(/,'message submit transport failures must reach the existing user-visible error path');
assert.match(messageNew,/location\.href='\/app\/messages\.php'/,'successful message submit must keep the existing redirect');
assert.match(messages,/document\.getElementById\('msgForm'\)\.onsubmit=async e=>\{e\.preventDefault\(\);try\{/,'message list composer must contain transport failures');
assert.match(messages,/const d=await r\.json\(\)\.catch\(\(\)=>null\);if\(!r\.ok\|\|!d\?\.ok\)throw new Error\('投稿できませんでした。'\)/,'message list composer must tolerate non-JSON and HTTP/API failures without surfacing arbitrary server detail');
assert.match(messages,/location\.reload\(\);\}catch\([^)]*\)\{alert\('投稿できませんでした。'\)/,'message list composer must preserve successful reload and route failures to the fixed browser-safe alert path');

// LINE morning digest priority and scheduler-jitter resilience.
assert.match(digest,/current<target\|\|current>target\+29/,'daily digest must tolerate a full 30-minute scheduler/retry window');
assert.match(digest,/ORDER BY CASE WHEN date\(COALESCE\(start_at,due_at\)\)=\? THEN 0 ELSE 1 END,COALESCE\(start_at,due_at\),id LIMIT 12/,'today rows must be selected before old overdue tasks can consume the digest row budget');
assert.match(digest,/INSERT OR IGNORE INTO line_daily_digest_receipts/,'daily digest retry tolerance must retain per-day idempotency receipts');
assert.match(digest,/String\(receipt\.status\)==='SENT'/,'daily digest must not resend after a successful receipt');

// Compact modal controls and one-tap isolation
assert.match(pwa,/grid-template-areas:'prev title next close' '\. reorder reorder \.'/,'mobile modal header controls must keep the compact grid');
assert.match(pwa,/min-width:40px!important;min-height:40px!important/,'mobile modal controls must preserve touch targets');
assert.match(pwa,/overflow-x:hidden!important/,'mobile modal must not introduce horizontal overflow');
assert.match(pwa,/original\.cloneNode\(true\)/,'one-tap action rewriting must isolate the original control');
assert.match(pwa,/event\.preventDefault\(\);event\.stopPropagation\(\)/,'one-tap actions must not leak navigation clicks');
assert.match(pwa,/execute_quick_action/,'quick actions must retain their execution endpoint');
assert.match(familyLoader,/family-log-quick-action\[data-log-type\]/,'Family Log loader must identify quick actions before the core generic form binding runs');
assert.match(familyLoader,/removeAttribute\('data-log-type'\)/,'one-tap Family Log actions must not enter the generic detailed-record form route');
assert.match(familyCore,/document\.querySelectorAll\('\.family-log-quick-action'\)/,'Family Log core must retain the dedicated one-tap execution handler');
assert.match(familyCore,/action:'execute_quick_action'/,'Family Log core must retain the quick-action execution API contract');
assert.match(pwa,/syntheticId>=0/,'synthetic recurring rows must stay distinguishable');
for(const token of ['recurrence_rule_id','recurrence_occurrence_id','occurrence_date'])assert.match(pwa,new RegExp(token),`${token} must remain available to recurring row actions`);
assert.match(pwa,/\/app\/recurring\.php\?/,'recurring rows must preserve their editing destination');
assert.ok(app.includes('calendar-band '),'Calendar band rendering contract must remain present');
assert.ok(app.includes('convert-shopping'),'message-to-shopping action contract must remain present');

// Interactive contrast guard
assert.match(pwa,/wave128-auto-contrast/,'contrast guard class must exist');
assert.match(pwa,/contrastRatio/,'contrast guard must compute an actual contrast ratio');
assert.match(pwa,/bgLum<0\.35&&current<4\.5&&white>current/,'only low-contrast dark controls should be repaired');
assert.match(pwa,/classList\.contains\('gray'\)/,'gray buttons must be excluded');
assert.match(pwa,/classList\.contains\('secondary'\)/,'secondary buttons must be excluded');
assert.match(pwa,/classList\.contains\('danger'\)/,'danger buttons must be excluded');
assert.match(pwa,/MutationObserver/,'dynamically inserted controls must also be checked');

// Calendar press preview + Family Log management
assert.match(calendar,/calendar-press-popover/,'Calendar must use a floating press preview');
assert.match(calendar,/viewportW-rect\.width-margin/,'floating preview must clamp horizontally to the viewport');
assert.match(calendar,/cellRect\.top-gap-rect\.height/,'floating preview should prefer placement above the pressed date');
assert.match(calendar,/viewportH-rect\.height-84/,'floating preview must stay clear of the bottom navigation');
assert.doesNotMatch(calendar,/calendar-cell\.calendar-press-preview/,'press preview must not enlarge the pressed date cell itself');
assert.match(familyLoader,/family-log-core\.js\?v=wave128-fix17/,'Family Log loader must preserve the existing core implementation');
assert.match(familyLoader,/family-log-management-ui\.js\?v=wave128-fix17/,'Family Log loader must include the consolidated management UI');
assert.match(familyCore,/familyLogSubjectOpen/,'Family Log core must retain subject creation/edit behavior');
assert.match(familyUi,/legacyHeadAction&&legacyHeadAction\.tagName!=='H1'/,'Family Log management must never remove the page heading when no legacy action is present');
assert.match(familyUi,/legacyHeadAction\.remove\(\)/,'Family Log management must still remove the legacy top-right action when present');
assert.match(familyUi,/＋ 対象・項目/,'Family Log subject management must use one consolidated entry point');
assert.match(familyUi,/family-log-subject-manager-list/,'Family Log subject manager must expose existing rows inside the manager');
assert.match(familyUi,/edit\?\.click\(\)/,'tapping an existing subject row must reuse the existing edit flow');

// Static cache lifecycle is a product-level invariant, not a Wave number.
assert.match(sw,/const STATIC_CACHE='familytodo-static-[^']+'/,'static cache must use the Family TODO static namespace');
assert.match(sw,/name\.startsWith\('familytodo-static-'\)&&name!==STATIC_CACHE/,'service worker must retire older Family TODO static caches');
assert.doesNotMatch(sw,/familytodo-static-v92/,'static cache must not regress to the obsolete v92 namespace');

console.log('ui-product contract: navigation, private event editing, Calendar filter return state, privacy-safe task/message transport handling, LINE digest priority, quick actions, compact controls, Calendar preview, Family Log management, and cache lifecycle ok');
