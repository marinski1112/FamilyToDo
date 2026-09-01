from pathlib import Path
import re
import subprocess

INDEX = Path('src/index.ts')
MODULE = Path('src/runtime-diagnostics.ts')
CONTRACT = Path('scripts/index-entrypoint-modularity-contract.mjs')
MANIFEST = Path('scripts/regression-manifest.mjs')

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

print('runtime diagnostics extraction patch applied')
