import assert from 'node:assert/strict';
import fs from 'node:fs';

const api=fs.readFileSync('src/task-rough-input-api.ts','utf8');

for(const marker of [
  'type RoughField={destination:Destination;text:string;blocks:RoughBlock[];sharedDueDirective:string|null};',
  'const sharedTrailingDueDirective=/^(?:これ|これら)\\s*(?:全部|全て|すべて)\\s*(.+?)\\s*まで$/u;',
  'const sharedDeadlineDateText=/^(?:\\d{4}[\\/.\\-]\\d{1,2}[\\/.\\-]\\d{1,2}|\\d{1,2}[\\/.\\-]\\d{1,2}|\\d{1,2}\\s*月\\s*\\d{1,2}\\s*日|今日|本日|明日|あした|明後日|あさって|月末|来月末)$/u;',
  'function splitSharedDueDirective(blocks:RoughBlock[]):{blocks:RoughBlock[];sharedDueDirective:string|null}{',
  'return {blocks:blocks.slice(0,-1),sharedDueDirective:last.originalText};',
  'if(field.sharedDueDirective)return true;',
  'if(dueTime&&!ownTemporalIntent)return null;',
  'if(dueDate&&!ownTemporalIntent&&!field.sharedDueDirective)return null;',
  'if(field.sharedDueDirective){',
  'if(!dueDate)return null;',
  'if(sharedDueDate&&sharedDueDate!==dueDate)return null;',
  'sharedDueDirective:field.sharedDueDirective',
  'sharedDueDirectiveがnullでないfieldでは、その文字列はitemではなく直前の同一field内blocks全件だけに適用する共有期限です。',
])assert.ok(api.includes(marker),`shared deadline source marker missing: ${marker}`);

const sharedTrailingDueDirective=/^(?:これ|これら)\s*(?:全部|全て|すべて)\s*(.+?)\s*まで$/u;
const sharedDeadlineDateText=/^(?:\d{4}[\/.\-]\d{1,2}[\/.\-]\d{1,2}|\d{1,2}[\/.\-]\d{1,2}|\d{1,2}\s*月\s*\d{1,2}\s*日|今日|本日|明日|あした|明後日|あさって|月末|来月末)$/u;

const splitFixture=lines=>{
  const blocks=lines.map(line=>({originalText:line,titleSeed:line,lines:[line]}));
  if(blocks.length<2)return {blocks,sharedDueDirective:null};
  const last=blocks.at(-1);
  if(last.lines.length!==1)return {blocks,sharedDueDirective:null};
  const match=last.titleSeed.match(sharedTrailingDueDirective),dateText=match?.[1]?.trim()||'';
  if(!dateText||!sharedDeadlineDateText.test(dateText))return {blocks,sharedDueDirective:null};
  return {blocks:blocks.slice(0,-1),sharedDueDirective:last.originalText};
};

for(const directive of ['これ全部8/10まで','これ全部明日まで','これら全て 9月10日 まで']){
  const parsed=splitFixture(['A','B','C',directive]);
  assert.deepEqual(parsed.blocks.map(block=>block.originalText),['A','B','C'],`${directive}: directive must not become an item`);
  assert.equal(parsed.sharedDueDirective,directive,`${directive}: exact trailing provenance must be retained as field metadata`);
}

for(const lines of [
  ['A','B 8/10まで','C'],
  ['A','B','C','明日は雨かな'],
  ['A','B','C','https://example.com/2025/12/31'],
  ['A','B','C','これ全部18:00まで'],
  ['A','B','C','これ全部買うまで'],
]){
  const parsed=splitFixture(lines);
  assert.equal(parsed.sharedDueDirective,null,`must not broaden shared scope: ${JSON.stringify(lines)}`);
  assert.deepEqual(parsed.blocks.map(block=>block.originalText),lines,'non-directive lines must remain ordinary blocks');
}

const validateSharedDueFixture=(sharedDueDirective,items)=>{
  let sharedDueDate=null;
  for(const item of items){
    if(!sharedDueDirective)continue;
    if(!item.dueDate)return false;
    if(sharedDueDate&&sharedDueDate!==item.dueDate)return false;
    sharedDueDate=item.dueDate;
  }
  return true;
};

assert.equal(validateSharedDueFixture('これ全部8/10まで',[
  {originalText:'A',dueDate:'2026-08-10'},
  {originalText:'B',dueDate:'2026-08-10'},
  {originalText:'C',dueDate:'2026-08-10'},
]),true,'all same-field sibling items may share one model-resolved date');
assert.equal(validateSharedDueFixture('これ全部8/10まで',[
  {originalText:'A',dueDate:'2026-08-10'},
  {originalText:'B',dueDate:null},
  {originalText:'C',dueDate:'2026-08-10'},
]),false,'shared directive must not be applied to only a subset');
assert.equal(validateSharedDueFixture('これ全部8/10まで',[
  {originalText:'A',dueDate:'2026-08-10'},
  {originalText:'B',dueDate:'2026-08-11'},
  {originalText:'C',dueDate:'2026-08-10'},
]),false,'shared directive must not produce inconsistent sibling dates');

const splitIndex=api.indexOf('function splitSharedDueDirective');
const parseIndex=api.indexOf('function parseRequestBody');
const modelGateIndex=api.indexOf('if(field.sharedDueDirective)return true;');
const modelLoopIndex=api.indexOf('for(const model of [ROUGH_INPUT_GEMINI_MODEL_PRIMARY,ROUGH_INPUT_GEMINI_MODEL_FALLBACK])');
assert.ok(splitIndex>=0&&splitIndex<parseIndex&&parseIndex<modelGateIndex&&modelGateIndex<modelLoopIndex,'shared scope must be proven before the existing bounded model loop');
assert.ok(api.includes("const items=preserveProse(deterministicItems(parsed.fields));"),'fallback must still derive only parsed item blocks');
assert.equal((api.match(/geminiFetch\(/g)||[]).length,1,'shared deadline support must not add a Gemini call site');
assert.ok(!/fetch\(|generativelanguage/.test(fs.readFileSync(import.meta.filename,'utf8')),'contract must never call a live provider');

console.log('rough-input shared trailing deadline contract: strict same-field scope, provenance, anti-invention, consistent due dates, directive omission, and bounded model path ok');
