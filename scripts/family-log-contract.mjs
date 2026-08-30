import assert from 'node:assert/strict';
import fs from 'node:fs';

const read=p=>fs.readFileSync(p,'utf8');
const app=read('src/app.ts');
const index=read('src/index.ts');
const log=read('public/assets/family-log.js')+(fs.existsSync('public/assets/family-log-core.js')?'\n'+read('public/assets/family-log-core.js'):'');
const familyCss=read('public/assets/family.css');

// Family Log quick-value persistence and advanced-record presentation.
for(const marker of ['lastMilkAmounts','milkAmountPresets','family_log_milk_amount_presets','normalizeMilkAmountPresets','familyLogAdvanced','family-log-record-sheet'])assert.ok(app.includes(marker)||log.includes(marker)||familyCss.includes(marker),`missing Family Log marker: ${marker}`);
assert.ok(app.includes('ORDER BY occurred_at DESC,id DESC'),'latest Family Log records must remain deterministically ordered');
assert.ok(log.includes('amount.value=lastMilkAmounts'),'milk quick values must restore the previous amount');
assert.ok(log.includes('advanced.open=Boolean(row.note'),'advanced Family Log details must reopen when note data exists');
assert.ok(!fs.existsSync('migrations/0040_wave118_family_log_quick_values.sql'),'Family Log quick values must not depend on the abandoned Wave118 migration');

// Quick-record actions and record kinds must remain wired.
for(const marker of ["action==='quick_record'",'BABY_FOOD','VOMIT',"subject_kind)!=='BABY'",'linked_task_id,linked_occurrence_id'])assert.ok(app.includes(marker),`missing Family Log server marker: ${marker}`);
for(const marker of ['family-log-quick-action',"action:'execute_quick_action'","action:'sleep_start'","action:'sleep_stop'",'family-log-form-action'])assert.ok(log.includes(marker)||app.includes(marker),`missing Family Log action marker: ${marker}`);
for(const key of ['WET','DIRTY','BABY_FOOD','BATH','VOMIT','MILK'])assert.ok(app.includes(key),`missing Family Log record kind: ${key}`);
assert.ok(app.includes('milkAmountPresets.map'),'milk preset controls must remain rendered');

// Configurable quick-action persistence introduced for the consolidated Family Log UI.
const quickActionMigration=read('migrations/0040_wave120_family_log_quick_actions.sql');
for(const marker of ['family_log_quick_actions',"'QUICK','FORM','SLEEP_TOGGLE'",'subject_id','sort_order'])assert.ok(quickActionMigration.includes(marker),`missing Family Log quick-action migration marker: ${marker}`);
for(const marker of ["action==='execute_quick_action'","action==='quick_action_save'",'quick_action_id:quickActionId','selectedQuickActions'])assert.ok(app.includes(marker),`missing Family Log configurable quick-action marker: ${marker}`);
assert.ok(!log.includes("prompt('動作: QUICK"),'Family Log quick actions must use the consolidated UI rather than prompt input');
for(const marker of ['ワンタッチ','入力して記録','睡眠開始 / 終了','data-quick-move','quick_action_reorder'])assert.ok(log.includes(marker)||app.includes(marker),`missing Family Log quick-action UI marker: ${marker}`);
assert.ok(app.includes("['family_log_quick_actions'")||index.includes("['family_log_quick_actions'"),'Family Log schema/table checks must retain quick-action persistence');

console.log('family-log-contract: quick values, actions and advanced record presentation ok');
