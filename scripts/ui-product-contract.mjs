import assert from 'node:assert/strict';
import fs from 'node:fs';

const pwa=fs.readFileSync('public/assets/pwa.js','utf8');
const sw=fs.readFileSync('public/sw.js','utf8');
const calendar=fs.readFileSync('public/assets/calendar-mobile-ui.js','utf8');
const familyLoader=fs.readFileSync('public/assets/family-log.js','utf8');
const familyCore=fs.readFileSync('public/assets/family-log-core.js','utf8');
const familyUi=fs.readFileSync('public/assets/family-log-management-ui.js','utf8');

// Mobile navigation
assert.match(pwa,/\.bottom-nav \.nav-inner>a\{white-space:nowrap!important/,'bottom navigation labels must not wrap on mobile');
assert.match(pwa,/word-break:keep-all!important/,'Japanese navigation labels must stay intact');
assert.match(pwa,/a\[href="\/app\/tasks\.php"\]\{font-size:8px!important;letter-spacing:-\.06em!important\}/,'long task/event label must fit the six-column mobile nav');

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
assert.match(familyUi,/legacyHeadAction\.remove\(\)/,'Family Log management must remove the legacy top-right action');
assert.match(familyUi,/＋ 対象・項目/,'Family Log subject management must use one consolidated entry point');
assert.match(familyUi,/family-log-subject-manager-list/,'Family Log subject manager must expose existing rows inside the manager');
assert.match(familyUi,/edit\?\.click\(\)/,'tapping an existing subject row must reuse the existing edit flow');

// Static cache lifecycle is a product-level invariant, not a Wave number.
assert.match(sw,/const STATIC_CACHE='familytodo-static-[^']+'/,'static cache must use the Family TODO static namespace');
assert.match(sw,/name\.startsWith\('familytodo-static-'\)&&name!==STATIC_CACHE/,'service worker must retire older Family TODO static caches');
assert.doesNotMatch(sw,/familytodo-static-v92/,'static cache must not regress to the obsolete v92 namespace');

console.log('ui-product contract: mobile navigation, contrast, Calendar preview, Family Log management, and cache lifecycle ok');
