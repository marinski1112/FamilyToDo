import assert from 'node:assert/strict';
import fs from 'node:fs';

const api=fs.readFileSync('src/task-rough-input-api.ts','utf8');
const ui=fs.readFileSync('public/assets/task-rough-input-ai.js','utf8');

for(const marker of [
  'const unspacedTrailingMultiplierQuantity=/×\\s*(\\d+(?:\\.\\d+)?)\\s*$/u;',
  'const numericComponentBeforeMultiplier=/(?:^|\\s)\\d+(?:\\.\\d+)?\\s*$/u;',
  "const match=block.titleSeed.match(trailingMultiplierQuantity)??block.titleSeed.match(unspacedTrailingMultiplierQuantity);",
  'const rawPrefix=block.titleSeed.slice(0,match.index);',
  "if(match[0].startsWith('×')&&/[0-9０-９]$/u.test(rawPrefix))return null;",
  'const prefix=rawPrefix.trimEnd();',
  'if(!prefix||numericComponentBeforeMultiplier.test(prefix))return null;',
])assert.ok(api.includes(marker),`multiplier dimension guard marker missing: ${marker}`);

const trailingMultiplierQuantity=/\s+×\s*(\d+(?:\.\d+)?)\s*$/u;
const unspacedTrailingMultiplierQuantity=/×\s*(\d+(?:\.\d+)?)\s*$/u;
const numericComponentBeforeMultiplier=/(?:^|\s)\d+(?:\.\d+)?\s*$/u;
const parseMultiplier=title=>{
  const match=title.match(trailingMultiplierQuantity)??title.match(unspacedTrailingMultiplierQuantity);
  if(!match?.[1]||match.index===undefined)return null;
  const rawPrefix=title.slice(0,match.index);
  if(match[0].startsWith('×')&&/[0-9０-９]$/u.test(rawPrefix))return null;
  const prefix=rawPrefix.trimEnd();
  if(!prefix||numericComponentBeforeMultiplier.test(prefix))return null;
  const amount=Number(match[1]);
  if(!Number.isFinite(amount)||amount<=0)return null;
  return {quantity:match[1],title:prefix};
};

assert.deepEqual(parseMultiplier('牛乳 ×2'),{quantity:'2',title:'牛乳'});
assert.deepEqual(parseMultiplier('おむつ　× 3'),{quantity:'3',title:'おむつ'});
assert.deepEqual(parseMultiplier('牛乳×2'),{quantity:'2',title:'牛乳'});
assert.equal(parseMultiplier('木材 2 × 3'),null);
assert.equal(parseMultiplier('板 2.5 × 3'),null);
assert.equal(parseMultiplier('サイズ 2×3'),null);
assert.equal(parseMultiplier('木材2×3'),null);
assert.equal(parseMultiplier('型番X2'),null);
assert.equal(parseMultiplier('牛乳x2'),null);
assert.equal(parseMultiplier('×2'),null);
assert.equal(parseMultiplier('牛乳 ×0'),null);
assert.ok(api.includes("if(field.destination==='shopping'&&(quantityIntentHint.test(source)||multiplyQuantityHint.test(block.titleSeed))&&!explicitQuantity(block))return true;"),'ambiguous multiplier input must remain model-eligible through needsModel');
assert.ok(ui.includes("source==='gemini'?'AIが内容を整理しました。':'入力内容を下書きにしました。'"),'deterministic rough-input confirmation must use neutral copy rather than imply AI failure');
assert.ok(!ui.includes('AIを利用できなかったため、入力内容をそのまま下書きにしました。'),'normal deterministic confirmation must not be labeled as an AI failure');

console.log('rough-input multiplier/confirmation contract: explicit ×N stays deterministic, dimensions stay unresolved, and deterministic confirmation copy stays neutral');