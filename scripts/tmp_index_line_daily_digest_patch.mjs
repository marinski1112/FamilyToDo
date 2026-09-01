import fs from 'node:fs';
import ts from 'typescript';

const indexPath='src/index.ts';
const modulePath='src/line-daily-digest.ts';
const contractPath='scripts/line-daily-digest-modularity-contract.mjs';
const manifestPath='scripts/regression-manifest.mjs';

if(fs.existsSync(modulePath)) throw new Error(`${modulePath} already exists`);
if(fs.existsSync(contractPath)) throw new Error(`${contractPath} already exists`);
let index=fs.readFileSync(indexPath,'utf8');
const sourceFile=ts.createSourceFile(indexPath,index,ts.ScriptTarget.Latest,true,ts.ScriptKind.TS);
const fn=sourceFile.statements.find(node=>ts.isFunctionDeclaration(node)&&node.name?.text==='processLineDailyDigests');
if(!fn) throw new Error('processLineDailyDigests declaration not found in current index.ts');
const start=fn.getStart(sourceFile),end=fn.end;
const fnText=index.slice(start,end);
for(const sentinel of [
  'export async function processLineDailyDigests(env:Env):Promise<void>{',
  'line_daily_digest_settings',
  'line_daily_digest_recipients',
  'line_daily_digest_receipts',
  "LIMIT 12",
  "const {pushLineMessage}=await import('./line')",
  "attempt_count=attempt_count+1",
]) if(!fnText.includes(sentinel)) throw new Error(`daily digest source sentinel missing: ${sentinel}`);

fs.writeFileSync(modulePath,[
  "import { DEFAULT_FAMILY_TIMEZONE, utcNow } from './timezone';",
  '',
  fnText,
  '',
].join('\n'));

index=index.slice(0,start)+index.slice(end);
const lifecycleImport="import { cleanupNotificationLifecycle } from './notification-lifecycle';\n";
if(!index.includes(lifecycleImport)) throw new Error('notification lifecycle import anchor missing');
index=index.replace(lifecycleImport,lifecycleImport+"import { processLineDailyDigests } from './line-daily-digest';\n");
if(index.includes('export async function processLineDailyDigests(')) throw new Error('processLineDailyDigests remained in index.ts');
if(!index.includes('ctx.waitUntil(processLineDailyDigests(env));')) throw new Error('scheduled daily digest call site changed');
if(!index.includes('utcNow(')){
  const timezoneImport="import { DEFAULT_FAMILY_TIMEZONE, familyDate, formatStoredUtcForFamily, utcNow } from './timezone';";
  if(!index.includes(timezoneImport)) throw new Error('timezone import shape changed while removing utcNow');
  index=index.replace(timezoneImport,"import { DEFAULT_FAMILY_TIMEZONE, familyDate, formatStoredUtcForFamily } from './timezone';");
}
index=index.replace(/\n+$/,'\n');
fs.writeFileSync(indexPath,index);

const contract=`import fs from 'node:fs';

const index=fs.readFileSync('src/index.ts','utf8');
const digest=fs.readFileSync('src/line-daily-digest.ts','utf8');

if(!index.includes("import { processLineDailyDigests } from './line-daily-digest';")) throw new Error('index.ts must import LINE daily digest job');
if(index.includes('export async function processLineDailyDigests(')||index.includes('async function processLineDailyDigests(')) throw new Error('LINE daily digest job must not remain defined in index.ts');
if(!index.includes('ctx.waitUntil(processLineDailyDigests(env));')) throw new Error('scheduled handler must still enqueue LINE daily digest job');
if(!digest.includes('export async function processLineDailyDigests(env:Env):Promise<void>{')) throw new Error('LINE daily digest module must export processLineDailyDigests');
for(const sentinel of [
  'line_daily_digest_settings',
  'line_daily_digest_recipients',
  'line_daily_digest_receipts',
  "visibility_scope='FAMILY' OR (visibility_scope='PRIVATE' AND private_owner_id=?)",
  'LIMIT 12',
  "const {pushLineMessage}=await import('./line')",
  "lines.join('\\n').slice(0,1000)",
  'attempt_count=attempt_count+1',
]){
  if(!digest.includes(sentinel)) throw new Error(\`LINE daily digest behavior sentinel missing: \${sentinel}\`);
}
console.log('LINE daily digest modularity contract: ok');
`;
fs.writeFileSync(contractPath,contract);

let manifest=fs.readFileSync(manifestPath,'utf8');
const anchor="      ['notification-lifecycle-modularity','node scripts/notification-lifecycle-modularity-contract.mjs'],\n";
if(!manifest.includes(anchor)) throw new Error('regression manifest notification lifecycle anchor missing');
manifest=manifest.replace(anchor,anchor+"      ['line-daily-digest-modularity','node scripts/line-daily-digest-modularity-contract.mjs'],\n");
fs.writeFileSync(manifestPath,manifest);

console.log('LINE daily digest extraction patch applied');
