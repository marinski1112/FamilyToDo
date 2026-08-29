import assert from 'node:assert/strict';
import fs from 'node:fs';

const calendar=fs.readFileSync('public/assets/calendar-mobile-ui.js','utf8');
const familyLoader=fs.readFileSync('public/assets/family-log.js','utf8');
const familyCore=fs.readFileSync('public/assets/family-log-core.js','utf8');
const familyUi=fs.readFileSync('public/assets/family-log-management-ui.js','utf8');
const sw=fs.readFileSync('public/sw.js','utf8');

assert.match(calendar,/calendar-press-popover/,'Calendar must use a floating press preview');
assert.match(calendar,/viewportW-rect\.width-margin/,'floating preview must clamp horizontally to the viewport');
assert.match(calendar,/cellRect\.top-gap-rect\.height/,'floating preview should prefer placement above the pressed date');
assert.match(calendar,/viewportH-rect\.height-84/,'floating preview must stay clear of the bottom navigation');
assert.doesNotMatch(calendar,/calendar-cell\.calendar-press-preview/,'fix17 must not enlarge the pressed date cell itself');

assert.match(familyLoader,/family-log-core\.js\?v=wave128-fix17/,'Family Log loader must preserve the existing core implementation');
assert.match(familyLoader,/family-log-management-ui\.js\?v=wave128-fix17/,'Family Log loader must add the consolidated management UI');
assert.match(familyCore,/familyLogSubjectOpen/,'preserved Family Log core must retain subject creation/edit behavior');
assert.match(familyUi,/legacyHeadAction\.remove\(\)/,'Family Log management must remove the legacy top-right action');
assert.match(familyUi,/＋ 対象・項目/,'Family Log subject management must use one consolidated entry point');
assert.match(familyUi,/family-log-subject-manager-list/,'Family Log subject manager must expose existing rows inside the manager');
assert.match(familyUi,/edit\?\.click\(\)/,'tapping an existing subject row must reuse the existing edit flow');
assert.match(sw,/familytodo-static-wave128-fix17/,'static cache must rotate for fix17');

console.log('wave128 fix17 smoke: floating Calendar preview and consolidated Family Log management ok');
