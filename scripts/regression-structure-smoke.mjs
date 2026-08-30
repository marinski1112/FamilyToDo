import assert from 'node:assert/strict';
import fs from 'node:fs';
import {activeRegressionGroups,legacyRegressionChecks} from './regression-manifest.mjs';

const ci=fs.readFileSync('.github/workflows/ci.yml','utf8');
const runner=fs.readFileSync('scripts/regression-suite.mjs','utf8');
const legacyRunner=fs.readFileSync('scripts/regression-legacy.mjs','utf8');

const activeNames=activeRegressionGroups.map(group=>group.name);
const activeCommands=activeRegressionGroups.flatMap(group=>group.checks).map(([,command])=>command);
assert.deepEqual(activeNames,['core-domain','calendar-imports','google-integrations','ui-product'],'active CI groups must stay feature-oriented');
assert.ok(ci.includes('node scripts/regression-suite.mjs'),'CI must invoke only the active regression runner');
assert.ok(!ci.includes('regression-legacy.mjs'),'legacy audit must not make ordinary PR CI fail');
assert.ok(runner.includes('activeRegressionGroups')&&!runner.includes('legacyRegressionChecks'),'active runner must consume active groups only');
assert.ok(legacyRunner.includes('legacyRegressionChecks'),'legacy runner must remain explicit even when no historical checks remain');
assert.deepEqual(legacyRegressionChecks,[],'all historical Wave/fix checks must be retired after equivalent feature-contract migration');
assert.ok(!activeCommands.some(command=>/wave\d|wave128-fix/i.test(command)),'ordinary PR manifest must expose feature contracts, not Wave/fix implementation names');
assert.ok(!activeCommands.includes('npm run check:domain-smoke'),'historical domain chain must not run in ordinary PR CI');

console.log('regression structure smoke: active feature entrypoints are wave/fix-free and legacy migration is complete');
