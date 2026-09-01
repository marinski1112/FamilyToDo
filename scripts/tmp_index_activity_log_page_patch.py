from pathlib import Path

index_path = Path('src/index.ts')
manifest_path = Path('scripts/regression-manifest.mjs')
module_path = Path('src/activity-log-page.ts')
contract_path = Path('scripts/index-activity-log-page-contract.mjs')

source = index_path.read_text()
marker = "\nasync function logsPage(ctx:any):Promise<Response>{"
if source.count(marker) != 1:
    raise SystemExit(f'expected exactly one logsPage marker, found {source.count(marker)}')
start = source.index(marker)
tail = source[start + 1:]
if "activity_logsはUTC保存で31日保持です。" not in tail:
    raise SystemExit('activity log tail sentinel missing')
if not tail.rstrip().endswith(",' /app/settings.php'));"):
    # Keep a stricter structural fallback without depending on whitespace around the final literal.
    if not tail.rstrip().endswith("</div>`,'/app/settings.php'));\n}"):
        if not tail.rstrip().endswith("</div>`,'/app/settings.php'));"):
            raise SystemExit('logsPage is not the final index.ts function as expected')

module_source = """import { activityLogVisibilitySql, layout } from './app';
import { html, redirect } from './response';
import { DEFAULT_FAMILY_TIMEZONE, formatStoredUtcForFamily } from './timezone';

const esc = (v: unknown) => String(v ?? '').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('\\"','&quot;').replaceAll("'",'&#39;');
const nowJst = () => new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Tokyo',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'}).format(new Date()).replace(' ',' ');

""" + tail.replace('async function logsPage(ctx:any):Promise<Response>{', 'export async function logsPage(ctx:any):Promise<Response>{', 1)

new_index = source[:start].rstrip() + '\n'
app_import_old = ", taskVisibilitySql, taskChildVisibilitySql, activityLogVisibilitySql } from './app';"
app_import_new = ", taskVisibilitySql, taskChildVisibilitySql } from './app';"
if app_import_old not in new_index:
    raise SystemExit('activityLogVisibilitySql import anchor missing')
new_index = new_index.replace(app_import_old, app_import_new, 1)
if 'formatStoredUtcForFamily' in new_index:
    timezone_old = "DEFAULT_FAMILY_TIMEZONE, familyDate, formatStoredUtcForFamily, utcNow"
    timezone_new = "DEFAULT_FAMILY_TIMEZONE, familyDate, utcNow"
    if timezone_old not in new_index:
        raise SystemExit('formatStoredUtcForFamily import anchor missing')
    new_index = new_index.replace(timezone_old, timezone_new, 1)
if 'layout(' not in new_index:
    layout_old = 'makeContext, layout, liffLogin'
    if layout_old not in new_index:
        raise SystemExit('layout import anchor missing')
    new_index = new_index.replace(layout_old, 'makeContext, liffLogin', 1)
import_anchor = "import { dbSchemaHealth, dbRuntimeHealth, liffConfigDiagnose } from './runtime-diagnostics';\n"
if import_anchor not in new_index:
    raise SystemExit('runtime diagnostics import anchor missing')
new_index = new_index.replace(import_anchor, import_anchor + "import { logsPage } from './activity-log-page';\n", 1)
if "if(url.pathname==='/app/logs.php') return await logsPage(context);" not in new_index:
    raise SystemExit('activity log route wiring missing')

contract_source = """import fs from 'node:fs';

const index=fs.readFileSync('src/index.ts','utf8');
const page=fs.readFileSync('src/activity-log-page.ts','utf8');

if(!index.includes("import { logsPage } from './activity-log-page';")) throw new Error('index.ts must import the activity log page module');
if(index.includes('async function logsPage(')) throw new Error('logsPage must not remain defined in index.ts');
if(!index.includes("if(url.pathname==='/app/logs.php') return await logsPage(context);")) throw new Error('activity log route wiring changed');
for(const sentinel of [
  'export async function logsPage(ctx:any):Promise<Response>{',
  "role!=='OWNER'&&role!=='ADMIN'",
  "activityLogVisibilitySql('a')",
  'LIMIT 51 OFFSET ?',
  'formatStoredUtcForFamily',
  'activity_logsはUTC保存で31日保持です。',
]){
  if(!page.includes(sentinel)) throw new Error(`activity log page behavior sentinel missing: ${sentinel}`);
}
if(index.includes('activityLogVisibilitySql')) throw new Error('index.ts must no longer own activity-log visibility dependencies');
if(index.includes('formatStoredUtcForFamily')) throw new Error('index.ts must no longer own activity-log timestamp formatting');
console.log('index activity log page contract: ok');
"""

manifest = manifest_path.read_text()
manifest_anchor = "      ['index-entrypoint-modularity','node scripts/index-entrypoint-modularity-contract.mjs'],\n"
manifest_line = "      ['index-activity-log-page','node scripts/index-activity-log-page-contract.mjs'],\n"
if manifest_line not in manifest:
    if manifest_anchor not in manifest:
        raise SystemExit('regression manifest anchor missing')
    manifest = manifest.replace(manifest_anchor, manifest_anchor + manifest_line, 1)

index_path.write_text(new_index)
module_path.write_text(module_source)
contract_path.write_text(contract_source)
manifest_path.write_text(manifest)
print('activity log page extraction patch applied')
