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
  'FETCH_TIMEOUT_MS=15_000',
  "redirect:'manual'",
  'while(total<MAX_HTML_BYTES)',
  'if(total>=MAX_HTML_BYTES)await reader.cancel()',
  "contentType!=='HTML'&&contentType!=='XHTML'",
  "hostname.includes(':')",
  "url.username||url.password",
  "BLOCKED_HOST_SUFFIXES",
  'fetchProductLinkPreviewWithDiagnostic',
  'enrichShoppingProductLinkPreviewsWithDiagnostics',
  'productTitleFromUrlPath',
  'propagateShoppingQuantityContext',
  "'URL_PATH'",
  "'PATH_FALLBACK'",
])assert.ok(helperSource.includes(marker),`product-link guard/diagnostic marker missing: ${marker}`);

const rakutenUrl='https://item.rakuten.co.jp/sanwa-junkei/t-018ss/?s-id=smt_top_normal_ranking_total_2';
const slowRakutenUrl='https://item.rakuten.co.jp/enro/kamayaki_meijin_mini/?s-id=smt_top_normal_bhitem';
assert.equal(helper.parsePublicProductUrl(rakutenUrl)?.href,rakutenUrl,'Rakuten public product URL must be accepted');
assert.equal(helper.productTitleFromUrlPath(slowRakutenUrl),'kamayaki meijin mini','meaningful Rakuten path slug must provide a bounded deterministic fallback');
assert.equal(helper.productTitleFromUrlPath('https://shop.example.org/product/dm1_mpo_b066'),null,'opaque code-like path must not be presented as a product title');
assert.equal(helper.productTitleFromUrlPath('https://shop.example.org/product/1234567890'),null,'numeric-only product path must not be presented as a product title');
assert.equal(helper.productTitleFromUrlPath('https://shop.example.org/product/550e8400-e29b-41d4-a716-446655440000'),null,'opaque UUID-like product path must not be presented as a product title');
assert.equal(helper.productTitleFromUrlPath('https://shop.example.org/product/index.html'),null,'generic product path must not be presented as a product title');
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
assert.deepEqual(helper.extractProductTitleDiagnosticFromHtml(jsonLdHtml),{title:'【送料無料】国産鶏 冷凍つくね 1kg 業務用 お取り寄せ',source:'JSONLD_PRODUCT'},'diagnostic extractor must classify JSON-LD without changing title');
assert.equal(helper.extractProductTitleFromHtml('<meta property="og:title" content="冷凍つくね 1kg &amp; 国産鶏"><title>fallback</title>'),'冷凍つくね 1kg & 国産鶏','Open Graph title and HTML entities must be supported');
assert.equal(helper.extractProductTitleDiagnosticFromHtml('<meta property="og:title" content="商品">').source,'OG_TITLE','Open Graph source enum');
assert.equal(helper.extractProductTitleDiagnosticFromHtml('<meta name="twitter:title" content="商品">').source,'TWITTER_TITLE','Twitter source enum');
assert.equal(helper.extractProductTitleFromHtml('<title> 冷凍 つくね   1kg | 店舗名 </title>'),'冷凍 つくね 1kg | 店舗名','HTML title must be the final metadata fallback');
assert.equal(helper.extractProductTitleDiagnosticFromHtml('<title>商品</title>').source,'HTML_TITLE','HTML title source enum');

const htmlResponse=html=>new Response(html,{status:200,headers:{'content-type':'text/html; charset=utf-8'}});
let calls=[];
const directFetch=async(url,init)=>{calls.push({url,init});return htmlResponse(jsonLdHtml);};
const direct=await helper.fetchProductLinkPreview(rakutenUrl,directFetch);
assert.equal(direct?.url,rakutenUrl,'preview must retain the original normalized product URL');
assert.equal(direct?.title,'【送料無料】国産鶏 冷凍つくね 1kg 業務用 お取り寄せ','preview must return extracted public page title');
assert.equal(calls[0]?.init?.redirect,'manual','redirect following must stay under application validation');
const directDiagnostic=await helper.fetchProductLinkPreviewWithDiagnostic(rakutenUrl,async()=>htmlResponse(jsonLdHtml));
assert.deepEqual(directDiagnostic.diagnostic,{stage:'COMPLETE',httpStatusClass:'2XX',redirectCount:0,contentType:'HTML',titleSource:'JSONLD_PRODUCT',reason:'OK',titleResolved:true},'success diagnostic must expose only bounded classifications');

calls=[];
const privateRedirectFetch=async(url,init)=>{calls.push({url,init});return new Response(null,{status:302,headers:{location:'http://127.0.0.1/private'}});};
assert.equal(await helper.fetchProductLinkPreview('https://shop.example.org/p',privateRedirectFetch),null,'redirect to private host must fail closed');
assert.equal(calls.length,1,'private redirect must not be fetched');
const blockedRedirectDiagnostic=await helper.fetchProductLinkPreviewWithDiagnostic('https://shop.example.org/p',async()=>new Response(null,{status:302,headers:{location:'http://127.0.0.1/private'}}));
assert.equal(blockedRedirectDiagnostic.diagnostic.reason,'REDIRECT_BLOCKED','unsafe redirect must be diagnostically classified without exposing destination');
assert.equal(blockedRedirectDiagnostic.diagnostic.httpStatusClass,'3XX','redirect status is coarse only');

const safeRedirectFetch=async url=>url.includes('/start')?new Response(null,{status:302,headers:{location:'/product'}}):htmlResponse('<meta name="twitter:title" content="冷凍つくね1kg">');
assert.equal((await helper.fetchProductLinkPreview('https://shop.example.org/start',safeRedirectFetch))?.title,'冷凍つくね1kg','bounded same-public-host redirect must be supported');
const safeRedirectDiagnostic=await helper.fetchProductLinkPreviewWithDiagnostic('https://shop.example.org/start',safeRedirectFetch);
assert.equal(safeRedirectDiagnostic.diagnostic.redirectCount,1,'safe redirect count is bounded diagnostic metadata');
assert.equal(safeRedirectDiagnostic.diagnostic.titleSource,'TWITTER_TITLE','title source survives a safe redirect');

const httpFailure=await helper.fetchProductLinkPreviewWithDiagnostic('https://shop.example.org/p',async()=>new Response('blocked',{status:403,headers:{'content-type':'text/html'}}));
assert.deepEqual(httpFailure.diagnostic,{stage:'RESPONSE',httpStatusClass:'4XX',redirectCount:0,contentType:'NONE',titleSource:'NONE',reason:'HTTP_ERROR',titleResolved:false},'HTTP failure must expose status class but not body/status details');
const nonHtml=await helper.fetchProductLinkPreviewWithDiagnostic('https://shop.example.org/file',async()=>new Response('binary',{status:200,headers:{'content-type':'application/octet-stream'}}));
assert.deepEqual(nonHtml.diagnostic,{stage:'CONTENT',httpStatusClass:'2XX',redirectCount:0,contentType:'NON_HTML',titleSource:'NONE',reason:'NON_HTML',titleResolved:false},'non-HTML response must be classified');
const noTitle=await helper.fetchProductLinkPreviewWithDiagnostic('https://shop.example.org/p',async()=>htmlResponse('<html><body>product page without metadata</body></html>'));
assert.deepEqual(noTitle.diagnostic,{stage:'TITLE',httpStatusClass:'2XX',redirectCount:0,contentType:'HTML',titleSource:'NONE',reason:'NO_TITLE',titleResolved:false},'2xx HTML without title metadata must be distinguishable');
for(const result of [directDiagnostic,blockedRedirectDiagnostic,httpFailure,nonHtml,noTitle]){
  const serialized=JSON.stringify(result.diagnostic);
  assert.ok(!serialized.includes('shop.example.org')&&!serialized.includes('rakuten')&&!serialized.includes('blocked')&&!serialized.includes('product page'),'diagnostic projection must not contain URL/domain/body/title text');
}

assert.equal(await helper.fetchProductLinkPreview('https://shop.example.org/file',async()=>new Response('binary',{status:200,headers:{'content-type':'application/octet-stream'}})),null,'non-HTML response must be ignored');
const largeHtml='<head><meta property="og:title" content="冷凍つくね1kg"></head>'+('x'.repeat(300*1024));
assert.equal((await helper.fetchProductLinkPreview('https://shop.example.org/large',async()=>new Response(largeHtml,{status:200,headers:{'content-type':'text/html','content-length':String(Buffer.byteLength(largeHtml))}})))?.title,'冷凍つくね1kg','large product pages must parse bounded head metadata instead of being rejected solely by Content-Length');

const fields=[
  {destination:'shopping',blocks:[{originalText:rakutenUrl,titleSeed:rakutenUrl,lines:[rakutenUrl]}]},
  {destination:'task',blocks:[{originalText:'https://shop.example.org/ignored',titleSeed:'https://shop.example.org/ignored',lines:['https://shop.example.org/ignored']}]},
];
let enrichCalls=0;
const enriched=await helper.enrichShoppingProductLinkPreviewsWithDiagnostics(fields,async()=>{enrichCalls++;return htmlResponse('<meta property="og:title" content="冷凍つくね1kg">');});
assert.equal(enriched.attached,1,'one URL-only shopping block must receive a preview');
assert.equal(enriched.diagnostics.length,1,'one safe per-link diagnostic must accompany the one attempted shopping URL');
assert.equal(enrichCalls,1,'non-shopping URL blocks must not trigger metadata fetches');
assert.equal(fields[0].blocks[0].productLinkPreview?.title,'冷凍つくね1kg','shopping block must carry bounded metadata title for draft generation');
assert.equal(fields[1].blocks[0].productLinkPreview,undefined,'non-shopping block must remain untouched');
assert.equal(helper.resolveProductLinkModelTitle(rakutenUrl,fields[0].blocks[0]),'冷凍つくね1kg','accepted AI output that repeats the source URL must fall back to fetched metadata title');
assert.equal(helper.resolveProductLinkModelTitle('国産鶏つくね 1kg',fields[0].blocks[0]),'国産鶏つくね 1kg','a genuine AI-shortened product title must remain authoritative');

const fallbackFields=[{destination:'shopping',blocks:[{originalText:slowRakutenUrl,titleSeed:slowRakutenUrl,lines:[slowRakutenUrl]}]}];
const fallbackEnriched=await helper.enrichShoppingProductLinkPreviewsWithDiagnostics(fallbackFields,async()=>new Response('blocked',{status:403,headers:{'content-type':'text/html'}}));
assert.equal(fallbackEnriched.attached,1,'metadata failure with a meaningful path must still attach a deterministic preview');
assert.equal(fallbackFields[0].blocks[0].productLinkPreview?.title,'kamayaki meijin mini','path fallback must humanize separators without fabricating a product name');
assert.equal(fallbackFields[0].blocks[0].productLinkPreview?.url,slowRakutenUrl,'path fallback must retain original normalized URL provenance');
assert.deepEqual(fallbackEnriched.diagnostics[0],{stage:'COMPLETE',httpStatusClass:'4XX',redirectCount:0,contentType:'NONE',titleSource:'URL_PATH',reason:'PATH_FALLBACK',titleResolved:true},'path fallback diagnostic must remain bounded and privacy-safe');

const opaqueUrl='https://shop.example.org/product/1234567890';
const opaqueFields=[{destination:'shopping',blocks:[{originalText:opaqueUrl,titleSeed:opaqueUrl,lines:[opaqueUrl]}]}];
const opaqueEnriched=await helper.enrichShoppingProductLinkPreviewsWithDiagnostics(opaqueFields,async()=>new Response('blocked',{status:403,headers:{'content-type':'text/html'}}));
assert.equal(opaqueEnriched.attached,0,'opaque path must not fabricate a fallback title');
assert.equal(opaqueFields[0].blocks[0].productLinkPreview,undefined,'opaque path must remain unresolved');
assert.equal(opaqueEnriched.diagnostics[0].reason,'HTTP_ERROR','unusable path must retain the original metadata failure diagnostic');

const contextualUrl1='https://shop.example.org/item/alpha-product';
const contextualUrl2='https://shop.example.org/item/beta-product';
const contextualFields=[{destination:'shopping',text:`以下を2つ買う\n${contextualUrl1}\n${contextualUrl2}`,blocks:[
  {originalText:`以下を2つ買う\n${contextualUrl1}`,titleSeed:'以下を2つ買う',lines:['以下を2つ買う',contextualUrl1]},
  {originalText:contextualUrl2,titleSeed:contextualUrl2,lines:[contextualUrl2]},
]}];
await helper.enrichShoppingProductLinkPreviewsWithDiagnostics(contextualFields,async()=>new Response('blocked',{status:403,headers:{'content-type':'text/html'}}));
assert.equal(contextualFields[0].blocks[0].originalText,`以下を2つ買う\n${contextualUrl1}`,'first URL keeps its explicit quantity context');
assert.equal(contextualFields[0].blocks[1].originalText,`以下を2つ買う\n${contextualUrl2}`,'explicit Shopping quantity context must carry to following URL blocks for Gemini provenance validation');

const prefixedBlock={originalText:`URL: ${rakutenUrl}`,titleSeed:`URL: ${rakutenUrl}`,lines:[`URL: ${rakutenUrl}`],productLinkPreview:{url:rakutenUrl,title:'冷凍つくね1kg'}};
assert.equal(helper.resolveProductLinkModelTitle(prefixedBlock.titleSeed,prefixedBlock),'冷凍つくね1kg','URL-prefixed literal model title must fall back to metadata title');

const fiveUrls=Array.from({length:5},(_,i)=>{const url=`https://shop${i}.example.org/item`;return {originalText:url,titleSeed:url,lines:[url]};});
let boundedCalls=0;
const bounded=await helper.enrichShoppingProductLinkPreviewsWithDiagnostics([{destination:'shopping',blocks:fiveUrls}],async()=>{boundedCalls++;return htmlResponse('<title>商品</title>');});
assert.equal(boundedCalls,4,'one rough-input request must fetch at most four product pages');
assert.equal(bounded.diagnostics.length,4,'diagnostic cardinality must obey the same four-link bound');

for(const marker of [
  'enrichShoppingProductLinkPreviewsWithDiagnostics',
  'firstPublicProductUrl',
  'type ProductLinkDiagnostic',
  "if(destination==='shopping'&&block.productLinkPreview?.title)return block.productLinkPreview.title.slice(0,200);",
  "if(field.destination==='shopping'&&firstPublicProductUrl(block.originalText))return true;",
  'inputText:field.text',
  'productPageTitles:field.blocks.map(block=>block.productLinkPreview?.title??null)',
  '各fieldのinputTextはユーザーが入力した文章全体です。',
  'kamayaki meijin mini → 窯焼名人 mini',
  'URL文字列そのものをtitleにはしないでください。',
  'productPageTitlesだけを根拠にquantity/category/dueDate/dueTimeを追加しないでください。',
  'return analyzeTaskRoughInput(ctx,body,{productLinkPreview:true});',
  'let productLinkDiagnostics:ProductLinkDiagnostic[]=[];',
  'enrichShoppingProductLinkPreviewsWithDiagnostics(parsed.fields)',
  'productLinkDiagnostics});',
  'function acceptedProductLinkTitles(items:RoughItem[],fields:RoughField[]):RoughItem[]',
  'const items=acceptedProductLinkTitles(validation.items,parsed.fields);',
])assert.ok(apiSource.includes(marker),`rough-input product-link/full-context integration marker missing: ${marker}`);
assert.equal((apiSource.match(/geminiFetch\(/g)||[]).length,1,'full-input product URL shaping must reuse the one existing Gemini call site');
assert.ok(previewUiSource.includes("firstHttpUrl(item.originalText)"),'shopping preview must continue deriving the editable URL field from original input');
assert.ok(previewUiSource.includes('productLinkDiagnosticHtml'),'rough-input preview must render bounded product-link failure diagnostics');
assert.ok(previewUiSource.includes('data.productLinkDiagnostics'),'browser must consume only the server diagnostic projection');
for(const forbidden of ['d.url','d.href','d.hostname','d.host','d.body','d.titleText'])assert.ok(!previewUiSource.includes(forbidden),`browser diagnostic must not expose private/raw product metadata field: ${forbidden}`);
assert.ok(saveSource.includes("url:item.url||''"),'shopping save path must continue persisting the confirmed draft URL');
assert.ok(saveSource.includes("products:[{name:item.title,quantity:item.quantity||'1',url:item.url||''}]"),'linked shopping batch save must preserve confirmed URL too');

console.log('rough-input product link contract: full field input goes through the existing single Gemini structured-output path for shopping URLs, contextual explicit quantities carry across URL blocks, public URL provenance remains saved, bounded metadata/path hints remain non-authoritative, privacy-safe diagnostics and SSRF/redirect/size guards stay intact');
