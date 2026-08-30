import assert from 'node:assert/strict';
import fs from 'node:fs';

const ai=fs.readFileSync('src/family-ai.ts','utf8');
const index=fs.readFileSync('src/index.ts','utf8');
const ui=fs.readFileSync('public/assets/family-ai.js','utf8');
const migration=fs.readFileSync('migrations/0035_wave107_family_ai_actions.sql','utf8');

for(const action of [
  'CREATE_TASK','CREATE_EVENT','COMPLETE_TASK','RECORD_QUICK_CHORE','RECORD_FAMILY_LOG','START_SLEEP','STOP_SLEEP',
]) assert.ok(ai.includes(action),action);

for(const path of ['/api/family-ai/plan','/api/family-ai/execute']) assert.ok(index.includes(path),path);

for(const feature of [
  'signFamilyAiConfirmation','verifyFamilyAiConfirmation','expires_at','crypto.subtle.sign',
  'family_ai_action_receipts','recordQuickChoreDomain','startDedicatedSleepDomain','stopDedicatedSleepDomain',
  'queueCalendarProjectionAfterMutation',
]) assert.ok(ai.includes(feature),feature);

const executeSection=ai.slice(ai.indexOf('export async function familyAiExecute'),ai.indexOf('function safeDetails'));
assert.ok(!executeSection.includes('plannerFor'),'familyAiExecute must not invoke plannerFor');
assert.match(migration,/nonce TEXT PRIMARY KEY/);
assert.ok(ui.includes('confirmation_token'),'UI confirmation token');
assert.ok(ui.includes('csrf:config.csrf'),'UI CSRF token');

console.log('family-ai-actions-contract: action allowlist, execute boundary, confirmation, routes, and UI tokens ok');
