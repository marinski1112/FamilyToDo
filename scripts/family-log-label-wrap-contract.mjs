import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const loader=readFileSync(new URL('../public/assets/family-log.js',import.meta.url),'utf8');
const sw=readFileSync(new URL('../public/sw.js',import.meta.url),'utf8');

assert.match(loader,/family-log-quick strong,\.family-quick-chore-record strong/,'Family Log loader must normalize quick-action labels');
assert.match(loader,/if\(label\.querySelector\('br'\)\)return/,'label normalization must not double-split an existing wrapped label');
assert.match(loader,/chars\.length<4\|\|chars\.length>8/,'4-8 character labels must be the explicit normalization range');
assert.match(loader,/if\(chars\.length===4\)\{label\.classList\.add\('family-log-label-nowrap'\);return;\}/,'four-character labels such as おしっこ must remain unsplit');
assert.match(loader,/chars\.slice\(0,4\)/,'5-8 character labels must retain the established four-character split point');
assert.match(loader,/family-log-label-nowrap.*white-space:nowrap!important/s,'short Family Log labels must not naturally wrap after the explicit split is removed');
assert.match(loader,/label\.dataset\.wave128Label='1'/,'loader normalization must interoperate with the existing PWA label guard');
assert.match(loader,/@media\(max-width:340px\).*family-log-quick-grid.*family-quick-chore-grid.*repeat\(3,minmax\(0,1fr\)\)/s,'320px Family Log quick grids must restore the three-column narrow-screen fallback');
assert.match(sw,/const STATIC_CACHE='familytodo-static-[^']+'/,'Family Log delivery must use the rotating FamilyToDo static-cache namespace');
assert.match(sw,/name\.startsWith\('familytodo-static-'\)&&name!==STATIC_CACHE/,'static cache rotation must retain cleanup of older FamilyToDo caches');

console.log('Family Log label wrap and narrow grid contract: ok');
