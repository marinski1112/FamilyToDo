import fs from 'node:fs';
import assert from 'node:assert/strict';

const source=fs.readFileSync(new URL('../public/assets/calendar-day-inline.js',import.meta.url),'utf8');
assert.match(source,/anchor=rows\.at\(-1\)\?\.nextSibling\|\|null/,'stored ordering must anchor after the existing type group');
assert.match(source,/for\(const row of ordered\)parent\.insertBefore\(row,anchor\)/,'stored ordering must insert each row before a stable trailing anchor');
assert.doesNotMatch(source,/insertBefore\(row,first\)/,'stored ordering must not repeatedly insert before the first moving row');
console.log('calendar day inline order contract: OK');
