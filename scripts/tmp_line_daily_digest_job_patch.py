from pathlib import Path

index_path=Path('src/index.ts')
manifest_path=Path('scripts/regression-manifest.mjs')
module_path=Path('src/line-daily-digest.ts')
contract_path=Path('scripts/line-daily-digest-modularity-contract.mjs')

source=index_path.read_text()
start_marker='export async function processLineDailyDigests(env:Env):Promise<void>{'
end_marker='\n\nasync function processNotifications(env: Env): Promise<void> {'
if source.count(start_marker)!=1:
    raise SystemExit(f'expected one processLineDailyDigests, found {source.count(start_marker)}')
if source.count(end_marker)!=1:
    raise SystemExit(f'expected one processNotifications boundary, found {source.count(end_marker)}')
start=source.index(start_marker)
end=source.index(end_marker,start)
block=source[start:end].rstrip()+"\n"
for sentinel in [
    'line_daily_digest_settings',
    'line_daily_digest_recipients',
    'line_daily_digest_receipts',
    "visibility_scope='PRIVATE' AND private_owner_id=?",
    'LIMIT 12',
    "lines.join('\\n').slice(0,1000)",
]:
    if sentinel not in block:
        raise SystemExit(f'daily digest sentinel missing before extraction: {sentinel}')

module="""import { DEFAULT_FAMILY_TIMEZONE, utcNow } from './timezone';

"""+block
new_index=source[:start].rstrip()+source[end:]
import_anchor="import { cleanupNotificationLifecycle } from './notification-lifecycle';\n"
if import_anchor not in new_index:
    raise SystemExit('notification lifecycle import anchor missing')
new_index=new_index.replace(import_anchor,import_anchor+"import { processLineDailyDigests } from './line-daily-digest';\n",1)
if "ctx.waitUntil(processLineDailyDigests(env));" not in new_index:
    raise SystemExit('scheduled daily digest wiring missing')
if start_marker in new_index:
    raise SystemExit('inline daily digest function remained in index')

contract="""import fs from 'node:fs';

const index=fs.readFileSync('src/index.ts','utf8');
const digest=fs.readFileSync('src/line-daily-digest.ts','utf8');

if(!index.includes("import { processLineDailyDigests } from './line-daily-digest';")) throw new Error('index.ts must import LINE daily digest job');
if(index.includes('export async function processLineDailyDigests(')) throw new Error('LINE daily digest job must not remain defined in index.ts');
if(!index.includes("ctx.waitUntil(processLineDailyDigests(env));")) throw new Error('scheduled handler must retain LINE daily digest invocation');
if(!digest.includes('export async function processLineDailyDigests(env:Env):Promise<void>{')) throw new Error('LINE daily digest module must export its scheduled job');
for(const sentinel of [
  'line_daily_digest_settings',
  'line_daily_digest_recipients',
  'line_daily_digest_receipts',
  "current<target||current>target+29",
  "visibility_scope='PRIVATE' AND private_owner_id=?",
  'LIMIT 12',
  "Number(receipt.attempt_count)>=3",
  "lines.join('\\\\n').slice(0,1000)",
]){
  if(!digest.includes(sentinel)) throw new Error(`LINE daily digest behavior sentinel missing: ${sentinel}`);
}
console.log('LINE daily digest modularity contract: ok');
"""

manifest=manifest_path.read_text()
anchor="      ['notification-lifecycle-modularity','node scripts/notification-lifecycle-modularity-contract.mjs'],\n"
line="      ['line-daily-digest-modularity','node scripts/line-daily-digest-modularity-contract.mjs'],\n"
if line not in manifest:
    if anchor not in manifest:
        raise SystemExit('regression manifest anchor missing')
    manifest=manifest.replace(anchor,anchor+line,1)

index_path.write_text(new_index)
module_path.write_text(module)
contract_path.write_text(contract)
manifest_path.write_text(manifest)
print('LINE daily digest extraction applied')
