import fs from 'node:fs';
import ts from 'typescript';

const indexPath='src/index.ts';
const modulePath='src/notification-lifecycle.ts';
const contractPath='scripts/index-entrypoint-modularity-contract.mjs';

if(fs.existsSync(modulePath)) throw new Error(`${modulePath} already exists`);
let index=fs.readFileSync(indexPath,'utf8');
const sourceFile=ts.createSourceFile(indexPath,index,ts.ScriptTarget.Latest,true,ts.ScriptKind.TS);

const findFunction=(name)=>sourceFile.statements.find(node=>ts.isFunctionDeclaration(node)&&node.name?.text===name);
const findVariable=(name)=>sourceFile.statements.find(node=>ts.isVariableStatement(node)&&node.declarationList.declarations.some(d=>ts.isIdentifier(d.name)&&d.name.text===name));

const lifecycleFn=findFunction('cleanupNotificationLifecycle');
if(!lifecycleFn) throw new Error('cleanupNotificationLifecycle declaration not found in current index.ts');
const lifecycleStart=lifecycleFn.getStart(sourceFile);
const lifecycleEnd=lifecycleFn.end;
const lifecycleText=index.slice(lifecycleStart,lifecycleEnd);
for(const sentinel of [
  'async function cleanupNotificationLifecycle(env: Env): Promise<void> {',
  "DELETE FROM activity_logs WHERE occurred_at < datetime(?,'-31 days')",
  "lower(COALESCE(t.task_kind,'')) IN ('recurring','recurrence_template')",
  "keep.id<notifications.id",
  "console.warn('[Family TODO LINE] lifecycle audit',audit)",
]){
  if(!lifecycleText.includes(sentinel)) throw new Error(`notification lifecycle source sentinel missing: ${sentinel}`);
}

const nowNode=findVariable('nowJst');
if(!nowNode) throw new Error('nowJst helper declaration missing');
const nowText=index.slice(nowNode.getStart(sourceFile),nowNode.end);
const moduleText=[
  nowText,
  '',
  lifecycleText.replace(/^async function cleanupNotificationLifecycle/,'export async function cleanupNotificationLifecycle'),
  '',
].join('\n');
fs.writeFileSync(modulePath,moduleText);

index=index.slice(0,lifecycleStart)+index.slice(lifecycleEnd);
const activityImport="import { logsPage } from './activity-log-page';\n";
if(!index.includes(activityImport)) throw new Error('activity log import anchor missing');
index=index.replace(activityImport,activityImport+"import { cleanupNotificationLifecycle } from './notification-lifecycle';\n");
if(index.includes('async function cleanupNotificationLifecycle(')) throw new Error('cleanupNotificationLifecycle remained in index.ts');
if(!index.includes('cleanupNotificationLifecycle(env)')) throw new Error('notification lifecycle call site changed or disappeared');
index=index.replace(/\n+$/,'\n');
fs.writeFileSync(indexPath,index);

let contract=fs.readFileSync(contractPath,'utf8');
const activityRead="const activityLogPage=fs.readFileSync('src/activity-log-page.ts','utf8');\n";
if(!contract.includes(activityRead)) throw new Error('modularity contract activity read anchor missing');
contract=contract.replace(activityRead,activityRead+"const notificationLifecycle=fs.readFileSync('src/notification-lifecycle.ts','utf8');\n");
const routeAnchor='for(const route of [\n';
if(!contract.includes(routeAnchor)) throw new Error('modularity contract route anchor missing');
const lifecycleChecks=[
  "const notificationLifecycleImport=\"import { cleanupNotificationLifecycle } from './notification-lifecycle';\";",
  "if(!index.includes(notificationLifecycleImport)) throw new Error('index.ts must import notification lifecycle module');",
  "if(index.includes('async function cleanupNotificationLifecycle(')) throw new Error('cleanupNotificationLifecycle must not remain defined in index.ts');",
  "if(!notificationLifecycle.includes('export async function cleanupNotificationLifecycle(')) throw new Error('cleanupNotificationLifecycle must be exported from notification-lifecycle.ts');",
  "if(!index.includes('cleanupNotificationLifecycle(env)')) throw new Error('notification lifecycle call site changed');",
  "for(const sentinel of [\"DELETE FROM activity_logs WHERE occurred_at < datetime(?,'-31 days')\",\"lower(COALESCE(t.task_kind,'')) IN ('recurring','recurrence_template')\",'keep.id<notifications.id',\"console.warn('[Family TODO LINE] lifecycle audit',audit)\"]){",
  "  if(!notificationLifecycle.includes(sentinel)) throw new Error(`notification lifecycle behavior sentinel missing: ${sentinel}`);",
  "}",
  '',
].join('\n');
contract=contract.replace(routeAnchor,lifecycleChecks+routeAnchor);
fs.writeFileSync(contractPath,contract);

console.log('notification lifecycle extraction patch applied');
