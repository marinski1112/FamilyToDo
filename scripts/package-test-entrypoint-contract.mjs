import assert from 'node:assert/strict';
import fs from 'node:fs';

const pkg=JSON.parse(fs.readFileSync('package.json','utf8'));
const scripts=pkg.scripts||{};

assert.equal(scripts['check:regression'],'node scripts/regression-suite.mjs','active regression entrypoint must be feature-oriented');
assert.equal(scripts['check:legacy-regression'],'node scripts/regression-legacy.mjs','legacy audit must have an explicit entrypoint');
assert.equal(scripts['test:legacy'],'npm run check:legacy-regression','legacy audit must stay opt-in');
assert.ok(String(scripts.test||'').includes('npm run check:regression'),'npm test must execute the active regression suite');
assert.ok(!/check:wave\d|domain-smoke/.test(String(scripts.test||'')),'npm test must not directly execute historical Wave/domain chains');
assert.ok(!String(scripts.test||'').includes('check:legacy-regression'),'npm test must not execute the legacy audit implicitly');

console.log('package test entrypoint contract: active and legacy regression paths are separated');
