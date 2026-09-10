import assert from 'node:assert/strict';
import fs from 'node:fs';

const home=fs.readFileSync('src/google-home.ts','utf8');
const domain=fs.readFileSync('src/family-external-domain.ts','utf8');
assert.ok(home.includes("q.mode='QUICK'"),'Google Home quick scenes must retain QUICK mode');
assert.ok(home.includes('ft:flquick:'),'Google Home quick scenes must retain the Family Log quick-scene key');

const quickDomain=domain.match(/export async function recordConfiguredQuickActionDomain[\s\S]*?\n}\n\nexport async function recordGoogleVoiceFamilyLogDomain/)?.[0]||'';
assert.ok(quickDomain,'configured quick domain must remain discoverable');
assert.ok(quickDomain.includes("q.family_id=? AND q.active=1 AND q.mode='QUICK'"),'configured quick must stay scoped to family, active, QUICK rows');
assert.ok(quickDomain.includes('s.id=q.subject_id AND s.family_id=q.family_id AND s.active=1'),'configured quick must require an active subject in the same family');
assert.ok(quickDomain.includes('FAMILY_LOG_TYPES.includes(type)'),'configured quick must reject invalid log types');
assert.doesNotMatch(quickDomain,/familyLogEnabledTypes\(/,'configured quick eligibility must not depend on abolished enabled_types_json settings');
assert.ok(home.includes('recordQuickChoreDomain'),'QUICK_CHORE execution lane must remain wired');

console.log('google-home-quick-contract: quick-scene eligibility contracts ok');
