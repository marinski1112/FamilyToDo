import fs from 'node:fs';
import ts from 'typescript';

const indexPath='src/index.ts';
const modulePath='src/activity-log-page.ts';
const contractPath='scripts/index-entrypoint-modularity-contract.mjs';

if(fs.existsSync(modulePath)) throw new Error(`${modulePath} already exists`);
let index=fs.readFileSync(indexPath,'utf8');
const sourceFile=ts.createSourceFile(indexPath,index,ts.ScriptTarget.Latest,true,ts.ScriptKind.TS);

const findFunction=(name)=>sourceFile.statements.find(node=>ts.isFunctionDeclaration(node)&&node.name?.text===name);
const findVariable=(name)=>sourceFile.statements.find(node=>ts.isVariableStatement(node)&&node.declarationList.declarations.some(d=>ts.isIdentifier(d.name)&&d.name.text===name));

const logsFn=findFunction('logsPage');
if(!logsFn) throw new Error('logsPage declaration not found in current index.ts');
const logsStart=logsFn.getStart(sourceFile);
const logsEnd=logsFn.end;
const logsText=index.slice(logsStart,logsEnd);
for(const sentinel of [
  "async function logsPage(ctx:any):Promise<Response>{",
  "activityLogVisibilitySql('a')",
  "ORDER BY a.occurred_at DESC,a.id DESC LIMIT 51 OFFSET ?",
  "activity_logsはUTC保存で31日保持です。",
]){
  if(!logsText.includes(sentinel)) throw new Error(`logsPage source sentinel missing: ${sentinel}`);
}

const escNode=findVariable('esc');
const nowNode=findVariable('nowJst');
if(!escNode||!nowNode) throw new Error('shared rendering helper declaration missing');
const escText=index.slice(escNode.getStart(sourceFile),escNode.end);
const nowText=index.slice(nowNode.getStart(sourceFile),nowNode.end);

const moduleText=[
  "import { layout, activityLogVisibilitySql } from './app';",
  "import { html, redirect } from './response';",
  "import { DEFAULT_FAMILY_TIMEZONE, formatStoredUtcForFamily } from './timezone';",
  '',
  escText,
  nowText,
  '',
  logsText.replace(/^async function logsPage/,'export async function logsPage'),
  '',
].join('\n');
fs.writeFileSync(modulePath,moduleText);

index=index.slice(0,logsStart)+index.slice(logsEnd);
const diagnosticsImport="import { dbSchemaHealth, dbRuntimeHealth, liffConfigDiagnose } from './runtime-diagnostics';\n";
if(!index.includes(diagnosticsImport)) throw new Error('runtime diagnostics import anchor missing');
index=index.replace(diagnosticsImport,diagnosticsImport+"import { logsPage } from './activity-log-page';\n");
const activityImportToken=', activityLogVisibilitySql';
if((index.match(/activityLogVisibilitySql/g)||[]).length!==1||!index.includes(activityImportToken)) throw new Error('activityLogVisibilitySql import shape changed');
index=index.replace(activityImportToken,'');
if(index.includes('async function logsPage(')) throw new Error('logsPage remained in index.ts');
if(index.includes('activityLogVisibilitySql')) throw new Error('activity log SQL dependency remained in index.ts');
fs.writeFileSync(indexPath,index);

let contract=fs.readFileSync(contractPath,'utf8');
const diagnosticsRead="const diagnostics=fs.readFileSync('src/runtime-diagnostics.ts','utf8');\n";
if(!contract.includes(diagnosticsRead)) throw new Error('modularity contract diagnostics read anchor missing');
contract=contract.replace(diagnosticsRead,diagnosticsRead+"const activityLogPage=fs.readFileSync('src/activity-log-page.ts','utf8');\n");
const routeAnchor='for(const route of [\n';
if(!contract.includes(routeAnchor)) throw new Error('modularity contract route anchor missing');
const activityChecks=[
  "const activityLogImport=\"import { logsPage } from './activity-log-page';\";",
  "if(!index.includes(activityLogImport)) throw new Error('index.ts must import activity log page module');",
  "if(index.includes('async function logsPage(')) throw new Error('logsPage must not remain defined in index.ts');",
  "if(index.includes('activityLogVisibilitySql')) throw new Error('activity log SQL dependency must not remain in index.ts');",
  "if(!activityLogPage.includes('export async function logsPage(')) throw new Error('logsPage must be exported from activity-log-page.ts');",
  "if(!index.includes(\"if(url.pathname==='/app/logs.php') return await logsPage(context);\")) throw new Error('activity log route wiring changed');",
  "for(const sentinel of [\"activityLogVisibilitySql('a')\",\"ORDER BY a.occurred_at DESC,a.id DESC LIMIT 51 OFFSET ?\",'activity_logsはUTC保存で31日保持です。']){",
  "  if(!activityLogPage.includes(sentinel)) throw new Error(`activity log behavior sentinel missing: ${sentinel}`);",
  "}",
  '',
].join('\n');
contract=contract.replace(routeAnchor,activityChecks+routeAnchor);
fs.writeFileSync(contractPath,contract);

console.log('activity log page extraction patch applied');
