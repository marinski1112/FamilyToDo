import assert from 'node:assert/strict';
import fs from 'node:fs';

const ui=fs.readFileSync('public/assets/google-calendar-inbound.js','utf8');

new Function(ui);
assert.ok(ui.includes("const csrfToken=()=>typeof csrf==='string'?csrf:'';"),'inbound UI must resolve the page CSRF token lazily');
assert.ok(ui.includes('csrf:csrfToken()'),'each inbound API request must read the current CSRF token at send time');
assert.ok(!ui.includes("const csrfToken=typeof csrf==='string'?csrf:'';"),'inbound UI must not capture an empty CSRF token before the core integrations script defines it');

console.log('google-calendar-inbound-csrf-contract: CSRF is resolved at request time so in-card script placement cannot freeze an empty token');
