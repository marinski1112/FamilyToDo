import assert from 'node:assert/strict';
import fs from 'node:fs';

const home=fs.readFileSync('src/google-home.ts','utf8');
assert.ok(home.includes("q.mode='QUICK'"),'Google Home quick scenes must retain QUICK mode');
assert.ok(home.includes('ft:flquick:'),'Google Home quick scenes must retain the Family Log quick-scene key');

console.log('google-home-quick-contract: quick-scene contracts ok');
