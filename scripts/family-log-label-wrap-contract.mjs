import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const loader=readFileSync(new URL('../public/assets/family-log.js',import.meta.url),'utf8');
const sw=readFileSync(new URL('../public/sw.js',import.meta.url),'utf8');

assert.match(loader,/family-log-quick strong,\.family-quick-chore-record strong/,'Family Log loader must normalize quick-action labels');
assert.match(loader,/if\(label\.querySelector\('br'\)\)return/,'label normalization must not double-split an existing wrapped label');
assert.match(loader,/chars\.length<4\|\|chars\.length>8/,'4-8 character labels must be the explicit normalization range');
assert.match(loader,/chars\.length===4\?2:4/,'four-character labels must split 2+2 while preserving the existing split point for longer labels');
assert.match(loader,/label\.dataset\.wave128Label='1'/,'loader normalization must interoperate with the existing PWA label guard');
assert.match(sw,/const STATIC_CACHE='familytodo-static-family-log-label-wrap'/,'Family Log label delivery must rotate the static cache so existing clients receive the fix promptly');
assert.match(sw,/name\.startsWith\('familytodo-static-'\)&&name!==STATIC_CACHE/,'static cache rotation must retain cleanup of older FamilyToDo caches');

console.log('Family Log label wrap contract: ok');
