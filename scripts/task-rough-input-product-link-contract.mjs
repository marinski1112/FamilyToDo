import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';

const helperSource=fs.readFileSync('src/task-rough-input-product-link.ts','utf8');
const apiSource=fs.readFileSync('src/task-rough-input-api.ts','utf8');
const previewUiSource=fs.readFileSync('public/assets/task-rough-input-ai.js','utf8');
const saveSource=fs.readFileSync('public/assets/task-rough-input-save.js','utf8');

const compiled=ts.transpileModule(helperSource,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ES2022}}).outputText;
const moduleUrl=`data:text/javascript;base64,${Buffer.from(compiled).toString('base64')}`;
const helper=await import(moduleUrl);

for(const marker of [
  'MAX_PRODUCT_LINK_PREVIEWS=4',
  'MAX_REDIRECTS=3',
  'MAX_HTML_BYTES=256*1024',
  'FETCH_TIMEOUT_MS=4_000',
  "redirect:'manual'",
  "response.headers.get('content-length')",
  "contentType.startsWith('text/html')",
  "contentType.startsWith('application/xhtml+xml')",
  "hostname.includes(':')",
  "url.username||url.password",
  "BLOCKED_HOST_SUFFIXES",
])assert.ok(helperSource.includes(marker),`product-link guard marker missing: ${marker}`);

const rakutenUrl='https://item.rakuten.co.jp/sanwa-junkei/t-018ss/?s-id=smt_top_normal_ranking_total_2';
assert.equal(helper.parsePublicProductUrl(rakutenUrl)?.href,rakutenUrl,'Rakuten public product URL must be accepted');
for(const unsafe of [
  'http://127.0.0.1/private',
  'http://10.0.0.1/private',
  'http://169.254.169.254/latest/meta-data',
  'http://172.16.0.1/private',
  'http://192.168.1.1/private',
  'http://[::1]/private',
  'https://user:pass@example.com/product',
  'https://example.com:8443/product',
  'https://service.internal/product',
])assert.equal(helper.parsePublicProductUrl(unsafe),null,`unsafe product URL must be rejected: ${unsafe}`);

const jsonLdHtml=`<!doctype html><html><head><script type="application/ld+json">${JSON.stringify({ '@context':'https://schema.org','@type':'Product',name:'【送料無料】国産鶏 冷凍つくね 1kg 業務用 お取り寄せ' })}</script></head></html>`;
assert.equal(helper.extractProductTitleFromHtml(jsonLdHtml),'【送料無料】国産鶏 冷凍つくね 1kg 業務用 お取り寄せ','JSON-LD Product.name must have priority');
assert.equal(helper.extractProductTitleFromHtml('<meta property="og:title" content="冷凍つくね 1kg &amp; 国産鶏"><title>fallback</title>'),'冷凍つくね 1kg & 国産鶏','Open Graph title and HTML entities must be supported');
assert.equal(helper.extractProductTitleFromHtml('<title> 冷凍 つくね   1kg | 店舗名 </title>'),'冷凍 つくね 1kg | 店舗名','HTML title must be the final metadata fallback');

const htmlResponse=html=>new Response(html,{status:200,headers:{'content-type':'text/html; charset=utf-8'}});
let calls=[];
const directFetch=async(url,init)=>{calls.push({url,init});return htmlResponse(jsonLdHtml);};
const direct=await helper.fetchProductLinkPreview(rakutenUrl,directFetch);
assert.equal(direct?.url,rakutenUrl,'preview must retain the original normalized product URL');
assert.equal(direct?.title,'【送料無料】国産鶏 冷凍つくね 1kg 業務用 お取り寄せ','preview must return extracted public page title');
assert.equal(calls[0]?.init?.redirect,'manual','redirect following must stay under application validation');

calls=[];
const privateRedirectFetch=async(url,init)=>{calls.push({url,init});return new Response(null,{status:302,headers:{location:'http://127.0.0.1/private'}});};
assert.equal(await helper.fetchProductLinkPreview('https://shop.example.org/p',privateRedirectFetch),null,'redirect to private host must fail closed');
assert.equal(calls.length,1,'private redirect must not be fetched');

const safeRedirectFetch=async url=>url.includes('/start')?new Response(null,{status:302,headers:{location:'/product'}}):htmlResponse('<meta name="twitter:title" content="冷凍つくね1kg">');
assert.equal((await helper.fetchProductLinkPreview('https://shop.example.org/start',safeRedirectFetch))?.title,'冷凍つくね1kg','bounded same-public-host redirect must be supported');

assert.equal(await helper.fetchProductLinkPreview('https://shop.example.org/file',async()=>new Response('binary',{status:200,headers:{'content-type':'application/octet-stream'}})),null,'non-HTML response must be ignored');
assert.equal(await helper.fetchProductLinkPreview('https://shop.example.org/huge',async()=>new Response('<title>x</title>',{status:200,headers:{'content-type':'text/html','content-length':String(256*1024+1)}})),null,'oversized response must be ignored before body consumption');

const fields=[
  {destination:'shopping',blocks:[{originalText:rakutenUrl,titleSeed:rakutenUrl,lines:[rakutenUrl]}]},
  {destination:'task',blocks:[{originalText:'https://shop.example.org/ignored',titleSeed:'https://shop.example.org/ignored',lines:['https://shop.example.org/ignored']}]},
];
let enrichCalls=0;
const attached=await helper.enrichShoppingProductLinkPreviews(fields,async()=>{enrichCalls++;return htmlResponse('<meta property="og:title" content="冷凍つくね1kg">');});
assert.equal(attached,1,'one URL-only shopping block must receive a preview');
assert.equal(enrichCalls,1,'non-shopping URL blocks must not trigger metadata fetches');
assert.equal(fields[0].blocks[0].productLinkPreview?.title,'冷凍つくね1kg','shopping block must carry bounded metadata title for draft generation');
assert.equal(fields[1].blocks[0].productLinkPreview,undefined,'non-shopping block must remain untouched');

const fiveUrls=Array.from({length:5},(_,i)=>{const url=`https://shop${i}.example.org/item`;return {originalText:url,titleSeed:url,lines:[url]};});
let boundedCalls=0;
await helper.enrichShoppingProductLinkPreviews([{destination:'shopping',blocks:fiveUrls}],async()=>{boundedCalls++;return htmlResponse('<title>商品</title>');});
assert.equal(boundedCalls,4,'one rough-input request must fetch at most four product pages');

for(const marker of [
  "import { enrichShoppingProductLinkPreviews, type ProductLinkPreviewBlock } from './task-rough-input-product-link';",
  "if(destination==='shopping'&&block.productLinkPreview?.title)return block.productLinkPreview.title.slice(0,200);",
  "if(field.destination==='shopping'&&block.productLinkPreview?.title)return true;",
  'productPageTitles:field.blocks.map(block=>block.productLinkPreview?.title??null)',
  'productPageTitlesだけを根拠にquantity/category/dueDate/dueTimeを追加しないでください。',
  'return analyzeTaskRoughInput(ctx,body,{productLinkPreview:true});',
  'if(context.productLinkPreview){try{await enrichShoppingProductLinkPreviews(parsed.fields);}',
])assert.ok(apiSource.includes(marker),`rough-input product-link integration marker missing: ${marker}`);
assert.equal((apiSource.match(/geminiFetch\(/g)||[]).length,1,'product metadata enrichment must not add another Gemini call site');
assert.ok(previewUiSource.includes("firstHttpUrl(item.originalText)"),'shopping preview must continue deriving the editable URL field from original input');
assert.ok(saveSource.includes("url:item.url||''"),'shopping save path must continue persisting the confirmed draft URL');
assert.ok(saveSource.includes("products:[{name:item.title,quantity:item.quantity||'1',url:item.url||''}]"),'linked shopping batch save must preserve confirmed URL too');

console.log('rough-input product link contract: public URL preserved, bounded metadata extraction/redirect SSRF guards, mocked product title enrichment, one existing Gemini path, and shopping save URL retention ok');
