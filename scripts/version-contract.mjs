import assert from 'node:assert/strict';
import fs from 'node:fs';
export const FAMILY_TODO_VERSION_RE=/^12\.\d+\.\d+-wave\d+(?:-[a-z0-9.-]+)?$/;
export const validateVersion=value=>FAMILY_TODO_VERSION_RE.test(String(value));
export function assertVersionContract(pkg,inventory){assert.ok(validateVersion(pkg.version),`unsupported version: ${pkg.version}`);assert.equal(inventory.version,pkg.version,'inventory version mismatch');const wave=/wave(\d+)/.exec(pkg.version)?.[1];assert.equal(String(inventory.cloudflare_wave).toLowerCase(),`wave${wave}`,'inventory wave mismatch');assert.equal(inventory.source,`FamilyTODO Cloudflare v${pkg.version}`,'inventory source mismatch');}
export function assertCurrentVersionContract(){const read=p=>JSON.parse(fs.readFileSync(p,'utf8'));assertVersionContract(read('package.json'),read('source_inventory.json'));}
if(process.argv[1]&&import.meta.url===new URL(`file://${process.argv[1]}`).href){assertCurrentVersionContract();for(const v of ['12.143.0-wave124','12.144.0-wave125','12.136.1-wave117-hotfix'])assert.ok(validateVersion(v));for(const v of ['12.144','wave125','latest','12.144.0'])assert.ok(!validateVersion(v));console.log('version contract ok');}
