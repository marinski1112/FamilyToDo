import assert from 'node:assert/strict';
import fs from 'node:fs';

const source=fs.readFileSync('public/assets/calendar-stamp-ui.js','utf8');

assert.match(source,/const OPTIONS_CACHE_TTL_MS=60\*1000;/,'stamp picker options cache must have a bounded TTL');
assert.match(source,/Array\.isArray\(optionsCache\)&&now-optionsCacheAt<OPTIONS_CACHE_TTL_MS/,'fresh cache may short-circuit within the TTL only');
assert.match(source,/optionsCacheAt=Date\.now\(\);/,'successful refresh must timestamp the cache');
assert.match(source,/catch\(error\)\{\s*if\(Array\.isArray\(optionsCache\)\)return optionsCache;\s*throw error;/,'stale cache must be used only as a refresh-failure fallback');
assert.match(source,/button\.dataset\.assetId=String\(assetId\);optionsCache=null;optionsCacheAt=0;return assetId;/,'shared materialization must invalidate both cache data and timestamp');
assert.doesNotMatch(source,/const loadOptions=async\(\)=>\{\s*if\(Array\.isArray\(optionsCache\)\)return optionsCache;/,'loadOptions must not use the old unconditional cache short-circuit');

console.log('calendar stamp picker cache contract: options refresh after bounded TTL with stale fallback only on fetch failure');
