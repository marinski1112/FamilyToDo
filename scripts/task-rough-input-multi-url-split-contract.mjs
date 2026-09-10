import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

const source=fs.readFileSync('src/task-rough-input-api.ts','utf8')
  .replace(/^import .*;\n/gm,'')
  .replace(/^export /gm,'');
const compiled=ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText;
const context=vm.createContext({Request,Response,URL,console});
vm.runInContext(compiled,context);

const url1='https://item.rakuten.co.jp/enro/kamayaki_meijin_mini/';
const url2='https://item.rakuten.co.jp/example-shop/second-product/';
const url3='https://shop.example.org/reference';

const urlsOnly=context.parseRequestBody({primaryType:'shopping',fields:[{destination:'shopping',text:`${url1}\n${url2}`}]});
assert.ok(urlsOnly,'two shopping URLs must remain a valid rough-input request');
assert.equal(urlsOnly.fields[0].blocks.length,2,'consecutive shopping URL-only lines must become separate product blocks');
assert.equal(urlsOnly.fields[0].blocks[0].originalText,url1,'first URL must retain exact block provenance');
assert.equal(urlsOnly.fields[0].blocks[1].originalText,url2,'second URL must retain exact block provenance');

const namedThenUrls=context.parseRequestBody({primaryType:'shopping',fields:[{destination:'shopping',text:`窯焼名人 mini\n${url1}\n${url2}`}]});
assert.equal(namedThenUrls.fields[0].blocks.length,2,'a second URL must start a new product after a named product already owns one URL');
assert.equal(namedThenUrls.fields[0].blocks[0].originalText,`窯焼名人 mini\n${url1}`,'the first URL must stay attached to its preceding product-name line');
assert.equal(namedThenUrls.fields[0].blocks[1].originalText,url2,'the following URL must become its own product block');

const namedPairs=context.parseRequestBody({primaryType:'shopping',fields:[{destination:'shopping',text:`商品A\n${url1}\n商品B\n${url2}`}]});
assert.deepEqual(Array.from(namedPairs.fields[0].blocks,block=>block.originalText),[`商品A\n${url1}`,`商品B\n${url2}`],'name + URL pairs must remain paired as separate products');

const nonShopping=context.parseRequestBody({primaryType:'task',fields:[{destination:'task',text:`${url1}\n${url3}`}]});
assert.equal(nonShopping.fields[0].blocks.length,1,'non-shopping reference URLs keep the existing continuation behavior');

const twoEachBlock={originalText:`以下を2つ買う\n${url1}`,titleSeed:'以下を2つ買う',lines:['以下を2つ買う',url1]};
const threeBlock={originalText:`これは３つ\n${url2}`,titleSeed:'これは３つ',lines:['これは３つ',url2]};
assert.equal(context.explicitQuantity(twoEachBlock),'2','natural contextual count phrase must deterministically resolve 2');
assert.equal(context.explicitQuantity(threeBlock),'3','full-width natural contextual count phrase must deterministically resolve 3');
const deterministic=context.deterministicItems([{destination:'shopping',text:'',blocks:[twoEachBlock,threeBlock],sharedDueDirective:null}]);
assert.deepEqual(Array.from(deterministic,item=>item.quantity),['2','3'],'deterministic fallback must retain contextual Shopping quantities');
const modelAdjusted=context.acceptedProductLinkTitles([{destination:'shopping',originalText:twoEachBlock.originalText,title:'楽天商品タイトル',quantity:null,category:null,dueDate:null,dueTime:null,description:null}],[{destination:'shopping',text:'',blocks:[twoEachBlock],sharedDueDirective:null}]);
assert.equal(modelAdjusted[0].quantity,'2','accepted Gemini item that omits an explicit contextual quantity must be completed deterministically');

const previewUiSource=fs.readFileSync('public/assets/task-rough-input-ai.js','utf8');
for(const marker of ['rough-analysis-spinner','startAnalysisLoading','stopAnalysisLoading',"button.setAttribute('aria-busy','true')","button.disabled=true;startAnalysisLoading();","finally{stopAnalysisLoading();button.disabled=false;button.textContent=oldText;}"]){
  assert.ok(previewUiSource.includes(marker),`rough-input direct loading lifecycle marker missing: ${marker}`);
}

assert.ok(fs.readFileSync('src/task-rough-input-api.ts','utf8').includes("semanticBlocks(text,destination)"),'parseRequestBody must pass the explicit destination into the splitter');
console.log('rough-input multi-URL split: separate Shopping URLs remain separate, contextual quantities survive Gemini/fallback paths, and loading feedback is bound directly to the analysis lifecycle');
