from pathlib import Path
import re
import subprocess

INDEX = Path('src/index.ts')
MODULE = Path('src/runtime-diagnostics.ts')
CONTRACT = Path('scripts/index-entrypoint-modularity-contract.mjs')
MANIFEST = Path('scripts/regression-manifest.mjs')
FAMILY_LOG_CONTRACT = Path('scripts/family-log-contract.mjs')
FAMILY_LOG_SCHEDULING_CONTRACT = Path('scripts/family-log-scheduling-contract.mjs')

expected_index_blob = '8288c1f0b9f80147e6024fc40ff0886ab92af79e'
actual_index_blob = subprocess.check_output(['git', 'hash-object', str(INDEX)], text=True).strip()
if actual_index_blob != expected_index_blob:
    raise SystemExit(f'index.ts blob moved: expected {expected_index_blob}, got {actual_index_blob}')

index = INDEX.read_text()
start_marker = 'async function dbSchemaHealth(env:Env):Promise<Response>{'
end_marker = 'async function reorderApi(request:Request,ctx:any):Promise<Response>{'
if index.count(start_marker) != 1 or index.count(end_marker) != 1:
    raise SystemExit('diagnostics extraction markers are not unique')
start = index.index(start_marker)
end = index.index(end_marker)
block = index[start:end]
functions = re.findall(r'^async function ([A-Za-z0-9_]+)\(', block, flags=re.M)
expected_functions = ['dbSchemaHealth', 'dbRuntimeHealth', 'liffConfigDiagnose']
if functions != expected_functions:
    raise SystemExit(f'unexpected functions in diagnostics block: {functions}')

module = "import { json } from './response';\n\n" + block
for name in expected_functions:
    needle = f'async function {name}('
    if module.count(needle) != 1:
        raise SystemExit(f'expected one {needle}')
    module = module.replace(needle, f'export async function {name}(', 1)
MODULE.write_text(module)

index = index[:start] + index[end:]
import_anchor = "import { processChildJournalCalendarOutbox } from './child-journal-calendar';\n"
new_import = "import { dbSchemaHealth, dbRuntimeHealth, liffConfigDiagnose } from './runtime-diagnostics';\n"
if index.count(import_anchor) != 1:
    raise SystemExit('index import anchor moved')
if new_import not in index:
    index = index.replace(import_anchor, import_anchor + new_import, 1)
INDEX.write_text(index)

contract = r'''import fs from 'node:fs';

const index=fs.readFileSync('src/index.ts','utf8');
const diagnostics=fs.readFileSync('src/runtime-diagnostics.ts','utf8');

const requiredImport="import { dbSchemaHealth, dbRuntimeHealth, liffConfigDiagnose } from './runtime-diagnostics';";
if(!index.includes(requiredImport)) throw new Error('index.ts must import runtime diagnostics module');
for(const name of ['dbSchemaHealth','dbRuntimeHealth','liffConfigDiagnose']){
  if(index.includes(`async function ${name}(`)) throw new Error(`${name} must not remain defined in index.ts`);
  if(!diagnostics.includes(`export async function ${name}(`)) throw new Error(`${name} must be exported from runtime-diagnostics.ts`);
}
for(const route of [
  "if(url.pathname==='/__cf/db-schema-health') return await dbSchemaHealth(env);",
  "if(url.pathname==='/__cf/db-runtime-health') return await dbRuntimeHealth(env);",
  "if(url.pathname==='/app/api/liff_config_diagnose.php'||url.pathname==='/app/api/liff_config_diagnose') return await liffConfigDiagnose(env);",
]){
  if(!index.includes(route)) throw new Error(`diagnostics route wiring changed: ${route}`);
}
for(const sentinel of [
  "families:['id','timezone']",
  "['tasks','SELECT id,family_id,title,status,completion_mode,start_at,end_at,location,all_day,calendar_visible,calendar_color,task_kind,sort_order,reminder_at,visibility_scope,private_owner_id FROM tasks LIMIT 1']",
  "`line_liff_id present: ${liffId?'YES':'NO'}`",
]){
  if(!diagnostics.includes(sentinel)) throw new Error(`diagnostics behavior sentinel missing: ${sentinel}`);
}
console.log('index entrypoint modularity contract: ok');
'''
CONTRACT.write_text(contract)

manifest = MANIFEST.read_text()
anchor = "      ['worker-error-log-privacy','node scripts/worker-error-log-privacy-contract.mjs'],\n"
entry = "      ['index-entrypoint-modularity','node scripts/index-entrypoint-modularity-contract.mjs'],\n"
if manifest.count(anchor) != 1:
    raise SystemExit('regression manifest anchor moved')
if entry not in manifest:
    manifest = manifest.replace(anchor, anchor + entry, 1)
MANIFEST.write_text(manifest)

# Existing Family Log regression contracts intentionally inspect runtime schema
# diagnostics. Keep those contracts location-independent when diagnostics leave
# the Worker entrypoint.
family_log_contract = FAMILY_LOG_CONTRACT.read_text()
read_anchor = "const index=read('src/index.ts');\n"
read_entry = "const diagnostics=read('src/runtime-diagnostics.ts');\n"
if family_log_contract.count(read_anchor) != 1:
    raise SystemExit('family-log-contract index read anchor moved')
if read_entry not in family_log_contract:
    family_log_contract = family_log_contract.replace(read_anchor, read_anchor + read_entry, 1)
old_quick = "assert.ok(app.includes(\"['family_log_quick_actions'\")||index.includes(\"['family_log_quick_actions'\"),'Family Log schema/table checks must retain quick-action persistence');"
new_quick = "assert.ok(app.includes(\"['family_log_quick_actions'\")||index.includes(\"['family_log_quick_actions'\")||diagnostics.includes(\"['family_log_quick_actions'\"),'Family Log schema/table checks must retain quick-action persistence');"
if family_log_contract.count(old_quick) != 1:
    raise SystemExit('family-log-contract quick-action assertion moved')
family_log_contract = family_log_contract.replace(old_quick, new_quick, 1)
FAMILY_LOG_CONTRACT.write_text(family_log_contract)

scheduling_contract = FAMILY_LOG_SCHEDULING_CONTRACT.read_text()
sched_anchor = "const index=fs.readFileSync('src/index.ts','utf8');\n"
sched_entry = "const diagnostics=fs.readFileSync('src/runtime-diagnostics.ts','utf8');\n"
if scheduling_contract.count(sched_anchor) != 1:
    raise SystemExit('family-log-scheduling index read anchor moved')
if sched_entry not in scheduling_contract:
    scheduling_contract = scheduling_contract.replace(sched_anchor, sched_anchor + sched_entry, 1)
old_filter = "assert.ok(index.includes(\"NOT IN ('BABY','CHILD')\"),'non-child subject filtering must remain explicit');"
new_filter = "assert.ok(index.includes(\"NOT IN ('BABY','CHILD')\")||diagnostics.includes(\"NOT IN ('BABY','CHILD')\"),'non-child subject filtering must remain explicit');"
if scheduling_contract.count(old_filter) != 1:
    raise SystemExit('family-log-scheduling subject filter assertion moved')
scheduling_contract = scheduling_contract.replace(old_filter, new_filter, 1)
FAMILY_LOG_SCHEDULING_CONTRACT.write_text(scheduling_contract)

print('runtime diagnostics extraction patch applied')
