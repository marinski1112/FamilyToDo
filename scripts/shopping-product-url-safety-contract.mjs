import assert from 'node:assert/strict';
import fs from 'node:fs';

const source=fs.readFileSync('public/assets/shopping.js','utf8');
const createSource=fs.readFileSync('public/assets/shopping-new.js','utf8');
const checklistSource=fs.readFileSync('src/task-events-page.ts','utf8');

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

assert.ok(createSource.includes('safeProductUrl'),'shopping create must validate optional product links through a dedicated safety boundary');
assert.match(createSource,/raw\.length>2048/,'shopping create must reject oversized product links before URL parsing');
assert.match(createSource,/new URL\(raw\)/,'shopping create must require an absolute URL');
assert.match(createSource,/parsed\.username\|\|parsed\.password/,'shopping create must reject credential-bearing product URLs');
assert.match(createSource,/parsed\.protocol==='http:'\|\|parsed\.protocol==='https:'/,'shopping create must allow only http/https product URLs');
assert.match(createSource,/const safeUrls=urls\.map\(safeProductUrl\)/,'shopping create must validate all product URLs before request assembly');
assert.match(createSource,/if\(safeUrls\.some\(url=>url===null\)\).*return;/s,'shopping create must fail closed on any unsafe product URL before network I/O');
assert.match(createSource,/url:safeUrls\[j\]\|\|''/,'shopping create payload must use only validated product URLs');
assert.doesNotMatch(createSource,/products:names\.map\(\(name,j\)=>\(\{name,quantity:quantities\[j\]\|\|'1',url:urls\[j\]/,'shopping create must not send raw product URLs');
assert.doesNotMatch(createSource,/cookie|authorization|token|member_name|family_name|private_owner_id/i,'shopping create URL safety must not add identity/session handling');

const rendererStart=checklistSource.indexOf('function renderTaskEventsPage(');
const rendererEnd=checklistSource.indexOf('\nexport async function taskEvents(',rendererStart+1);
assert.ok(rendererStart>=0&&rendererEnd>rendererStart,'canonical checklist renderer source must remain detectable');
const renderer=checklistSource.slice(rendererStart,rendererEnd);
assert.match(renderer,/const safeProductUrl=\(value:unknown\)=>/,'checklist shopping renderer must use its own product URL safety boundary');
assert.match(renderer,/raw\.length>2048/,'checklist renderer must reject oversized persisted product links before parsing');
assert.match(renderer,/new URL\(raw\)/,'checklist renderer must parse persisted product links as absolute URLs');
assert.match(renderer,/parsed\.username\|\|parsed\.password/,'checklist renderer must reject credential-bearing product links');
assert.match(renderer,/parsed\.protocol==='http:'\|\|parsed\.protocol==='https:'/,'checklist renderer must allow only http/https product links');
assert.match(renderer,/const productUrl=safeProductUrl\(item\.url\)/,'checklist renderer must sanitize each persisted Shopping URL before HTML assembly');
assert.doesNotMatch(renderer,/item\.url\?`<a href="\$\{esc\(item\.url\)\}/,'checklist renderer must never insert raw persisted Shopping URLs into href');
const helperStart=renderer.indexOf('  const safeProductUrl=');
const helperEnd=renderer.indexOf('  const effectiveShoppingDue=',helperStart);
assert.ok(helperStart>=0&&helperEnd>helperStart,'checklist product URL safety helper must remain bounded and detectable');
const helperSource=renderer.slice(helperStart,helperEnd);
assert.doesNotMatch(helperSource,/console\.(?:log|warn|error)|cookie|authorization|token|member_name|family_name|private_owner_id/i,'checklist product-link safety helper must not introduce sensitive logging or identity/session handling');

console.log('shopping product url safety contract: shopping and canonical checklist renderers accept only bounded credential-free absolute http/https links');
