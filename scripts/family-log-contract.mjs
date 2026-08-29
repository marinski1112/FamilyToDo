import assert from 'node:assert/strict';
import fs from 'node:fs';

const read=p=>fs.readFileSync(p,'utf8');
const app=read('src/app.ts');
const log=read('public/assets/family-log.js')+(fs.existsSync('public/assets/family-log-core.js')?'\n'+read('public/assets/family-log-core.js'):'');
const familyCss=read('public/assets/family.css');

// Family Log quick-value persistence and advanced-record presentation.
for(const marker of ['lastMilkAmounts','milkAmountPresets','family_log_milk_amount_presets','normalizeMilkAmountPresets','familyLogAdvanced','family-log-record-sheet'])assert.ok(app.includes(marker)||log.includes(marker)||familyCss.includes(marker),`missing Family Log marker: ${marker}`);
assert.ok(app.includes('ORDER BY occurred_at DESC,id DESC'),'latest Family Log records must remain deterministically ordered');
assert.ok(log.includes('amount.value=lastMilkAmounts'),'milk quick values must restore the previous amount');
assert.ok(log.includes('advanced.open=Boolean(row.note'),'advanced Family Log details must reopen when note data exists');
assert.ok(!fs.existsSync('migrations/0040_wave118_family_log_quick_values.sql'),'Family Log quick values must not depend on the abandoned Wave118 migration');

console.log('family-log-contract: quick values and advanced record presentation ok');
