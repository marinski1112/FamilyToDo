import assert from 'node:assert/strict';
import fs from 'node:fs';

const source=fs.readFileSync('public/assets/shopping.js','utf8');

assert.ok(source.includes('safeProductUrl'),'shopping detail must normalize product links through a dedicated safety boundary');
assert.match(source,/raw\.length>2048/,'product URL safety boundary must reject oversized persisted links before URL parsing');
assert.match(source,/new URL\(raw\)/,'product URL safety boundary must parse an absolute URL instead of trusting raw href text');
assert.match(source,/parsed\.username\|\|parsed\.password/,'credential-bearing external product URLs must be rejected');
assert.match(source,/parsed\.protocol==='http:'\|\|parsed\.protocol==='https:'/,'only http/https product links may be rendered');
assert.match(source,/const productUrl=safeProductUrl\(r\.url\)/,'shopping detail must sanitize the persisted product URL before HTML assembly');
assert.match(source,/productUrl\?'<a class="shopping-product-link" href="'\+esc\(productUrl\)/,'shopping detail must render only the sanitized product URL');
assert.doesNotMatch(source,/href="'\+esc\(r\.url\)/,'raw persisted product URL must never be inserted directly into href');
assert.match(source,/target="_blank" rel="noopener noreferrer"/,'external product links must retain opener/referrer isolation');
assert.doesNotMatch(source,/console\.(?:log|warn|error)|cookie|authorization|token|member_name|family_name|private_owner_id/i,'shopping product URL safety boundary must not add sensitive logging or identity/session handling');

console.log('shopping product url safety contract: persisted links are bounded and rendered only after credential-free absolute http/https validation');
