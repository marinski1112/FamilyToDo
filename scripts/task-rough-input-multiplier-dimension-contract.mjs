import assert from 'node:assert/strict';
import fs from 'node:fs';

const api=fs.readFileSync('src/task-rough-input-api.ts','utf8');

for(const marker of [
  'const numericComponentBeforeMultiplier=/(?:^|\\s)\\d+(?:\\.\\d+)?\\s*$/u;',
  'const prefix=block.titleSeed.slice(0,match.index).trimEnd();',
  'if(numericComponentBeforeMultiplier.test(prefix))return null;',
])assert.ok(api.includes(marker),`multiplier dimension guard marker missing: ${marker}`);

const trailingMultiplierQuantity=/\s+×\s*(\d+(?:\.\d+)?)\s*$/u;
const numericComponentBeforeMultiplier=/(?:^|\s)\d+(?:\.\d+)?\s*$/u;
const parseMultiplier=title=>{
  const match=title.match(trailingMultiplierQuantity);
  if(!match?.[1]||match.index===undefined)return null;
  const prefix=title.slice(0,match.index).trimEnd();
  if(numericComponentBeforeMultiplier.test(prefix))return null;
  const amount=Number(match[1]);
  if(!Number.isFinite(amount)||amount<=0)return null;
  return {quantity:match[1],title:prefix};
};

assert.deepEqual(parseMultiplier('牛乳 ×2'),{quantity:'2',title:'牛乳'});
assert.deepEqual(parseMultiplier('おむつ　× 3'),{quantity:'3',title:'おむつ'});
assert.equal(parseMultiplier('木材 2 × 3'),null);
assert.equal(parseMultiplier('板 2.5 × 3'),null);
assert.equal(parseMultiplier('サイズ 2×3'),null);
assert.equal(parseMultiplier('型番X2'),null);
assert.equal(parseMultiplier('牛乳 ×0'),null);
assert.ok(api.includes("if(field.destination==='shopping'&&(quantityIntentHint.test(source)||multiplyQuantityHint.test(block.titleSeed))&&!explicitQuantity(block))return true;"),'ambiguous multiplier input must remain model-eligible through needsModel');
assert.ok(!/generativelanguage|fetch\(/.test(fs.readFileSync('scripts/task-rough-input-multiplier-dimension-contract.mjs','utf8')),'dimension contract must not call live providers');

console.log('rough-input multiplier dimension contract: spaced dimensions remain unresolved while explicit ×N stays deterministic');
