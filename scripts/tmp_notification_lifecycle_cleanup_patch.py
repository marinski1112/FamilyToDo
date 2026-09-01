from pathlib import Path

index_path=Path('src/index.ts')
manifest_path=Path('scripts/regression-manifest.mjs')
module_path=Path('src/notification-lifecycle.ts')
contract_path=Path('scripts/notification-lifecycle-modularity-contract.mjs')

source=index_path.read_text()
start_marker='async function cleanupNotificationLifecycle(env: Env): Promise<void> {'
end_marker='\n\n\nexport async function processLineDailyDigests(env:Env):Promise<void>{'
if source.count(start_marker)!=1:
    raise SystemExit(f'expected one cleanupNotificationLifecycle, found {source.count(start_marker)}')
if source.count(end_marker)!=1:
    raise SystemExit(f'expected one processLineDailyDigests boundary, found {source.count(end_marker)}')
start=source.index(start_marker)
end=source.index(end_marker,start)
block=source[start:end].rstrip()+"\n"
for sentinel in [
    "DELETE FROM activity_logs WHERE occurred_at < datetime(?,'-31 days')",
    "UPDATE web_push_subscriptions SET enabled=0",
    'deleted_completion_history',
    'task_family_log_template_issues',
    "console.warn('[Family TODO LINE] lifecycle audit',audit)",
]:
    if sentinel not in block:
        raise SystemExit(f'lifecycle sentinel missing before extraction: {sentinel}')

module="""const nowJst = () => new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Tokyo',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'}).format(new Date()).replace(' ',' ');

"""+block.replace(start_marker,'export async function cleanupNotificationLifecycle(env: Env): Promise<void> {',1)

new_index=source[:start].rstrip()+source[end:]
import_anchor="import { logsPage } from './activity-log-page';\n"
if import_anchor not in new_index:
    raise SystemExit('activity-log import anchor missing')
new_index=new_index.replace(import_anchor,import_anchor+"import { cleanupNotificationLifecycle } from './notification-lifecycle';\n",1)
if 'await cleanupNotificationLifecycle(env);' not in new_index:
    raise SystemExit('processNotifications lifecycle call missing')
if start_marker in new_index:
    raise SystemExit('inline lifecycle function remained in index')

contract="""import fs from 'node:fs';

const index=fs.readFileSync('src/index.ts','utf8');
const lifecycle=fs.readFileSync('src/notification-lifecycle.ts','utf8');

if(!index.includes("import { cleanupNotificationLifecycle } from './notification-lifecycle';")) throw new Error('index.ts must import notification lifecycle cleanup');
if(index.includes('async function cleanupNotificationLifecycle(')) throw new Error('notification lifecycle cleanup must not remain defined in index.ts');
if(!index.includes('async function processNotifications(env: Env): Promise<void> {\\n  await cleanupNotificationLifecycle(env);')) throw new Error('notification delivery must run lifecycle cleanup before loading due notifications');
if(!lifecycle.includes('export async function cleanupNotificationLifecycle(env: Env): Promise<void> {')) throw new Error('notification lifecycle module must export cleanupNotificationLifecycle');
for(const sentinel of [
  "DELETE FROM activity_logs WHERE occurred_at < datetime(?,'-31 days')",
  "UPDATE notifications SET status='cancelled',updated_at=? WHERE status IN ('pending','retry')",
  'UPDATE web_push_subscriptions SET enabled=0',
  'deleted_completion_history',
  'family_log_link_issues',
  'task_family_log_template_issues',
  "console.warn('[Family TODO LINE] lifecycle audit',audit)",
]){
  if(!lifecycle.includes(sentinel)) throw new Error(`notification lifecycle behavior sentinel missing: ${sentinel}`);
}
console.log('notification lifecycle modularity contract: ok');
"""

manifest=manifest_path.read_text()
anchor="      ['index-entrypoint-modularity','node scripts/index-entrypoint-modularity-contract.mjs'],\n"
line="      ['notification-lifecycle-modularity','node scripts/notification-lifecycle-modularity-contract.mjs'],\n"
if line not in manifest:
    if anchor not in manifest:
        raise SystemExit('regression manifest anchor missing')
    manifest=manifest.replace(anchor,anchor+line,1)

index_path.write_text(new_index)
module_path.write_text(module)
contract_path.write_text(contract)
manifest_path.write_text(manifest)
print('notification lifecycle extraction applied')
