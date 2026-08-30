import assert from 'node:assert/strict';
import fs from 'node:fs';

const pwa=fs.readFileSync('public/assets/pwa.js','utf8');
const sw=fs.readFileSync('public/sw.js','utf8');
const calendar=fs.readFileSync('public/assets/calendar-mobile-ui.js','utf8');
const familyLoader=fs.readFileSync('public/assets/family-log.js','utf8');
const familyCore=fs.readFileSync('public/assets/family-log-core.js','utf8');
const familyUi=fs.readFileSync('public/assets/family-log-management-ui.js','utf8');
const messageNew=fs.readFileSync('public/assets/message-new.js','utf8');
const messages=fs.readFileSync('public/assets/messages.js','utf8');
const app=fs.readFileSync('src/app.ts','utf8');

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

// Message composition failure handling
assert.match(messageNew,/await r\.json\(\)\.catch\(\(\)=>null\)/,'message submit must tolerate non-JSON error responses');
assert.match(messageNew,/if\(!r\.ok\|\|!d\?\.ok\)throw new Error/,'message submit must treat HTTP/API failures as failures');
assert.match(messageNew,/catch\(err\)\{alert\(/,'message submit transport failures must reach the existing user-visible error path');
assert.match(messageNew,/location\.href='\/app\/messages\.php'/,'successful message submit must keep the existing redirect');
assert.match(messages,/document\.getElementById\('msgForm'\)\.onsubmit=async e=>\{e\.preventDefault\(\);try\{/,'message list composer must contain transport failures');
assert.match(messages,/const d=await r\.json\(\)\.catch\(\(\)=>null\);if\(!r\.ok\|\|!d\?\.ok\)throw new Error/,'message list composer must tolerate non-JSON and HTTP/API failures');
assert.match(messages,/location\.reload\(\);\}catch\(err\)\{alert\(/,'message list composer must preserve successful reload and route failures to the existing alert path');

// Compact modal controls and one-tap isolation
assert.match(pwa,/grid-template-areas:'prev title next close' '\. reorder reorder \.'/,'mobile modal header controls must keep the compact grid');
assert.match(pwa,/min-width:40px!important;min-height:40px!important/,'mobile modal controls must preserve touch targets');
assert.match(pwa,/overflow-x:hidden!important/,'mobile modal must not introduce horizontal overflow');
assert.match(pwa,/original\.cloneNode\(true\)/,'one-tap action rewriting must isolate the original control');
assert.match(pwa,/event\.preventDefault\(\);event\.stopPropagation\(\)/,'one-tap actions must not leak navigation clicks');
assert.match(pwa,/execute_quick_action/,'quick actions must retain their execution endpoint');
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

console.log('ui-product contract: navigation, message submission, quick actions, compact controls, Calendar preview, Family Log management, and cache lifecycle ok');
