import fs from 'node:fs';
import ts from 'typescript';

const indexPath='src/index.ts';
const modulePath='src/task-delete.ts';
const contractPath='scripts/task-delete-modularity-contract.mjs';
const manifestPath='scripts/regression-manifest.mjs';

if(fs.existsSync(modulePath)) throw new Error(`${modulePath} already exists`);
if(fs.existsSync(contractPath)) throw new Error(`${contractPath} already exists`);

let index=fs.readFileSync(indexPath,'utf8');
const source=ts.createSourceFile(indexPath,index,ts.ScriptTarget.Latest,true,ts.ScriptKind.TS);
const taskDeleteNode=source.statements.find(node=>ts.isFunctionDeclaration(node)&&node.name?.text==='taskDelete');
if(!taskDeleteNode) throw new Error('taskDelete function declaration missing');
const nowStatement=source.statements.find(node=>ts.isVariableStatement(node)&&node.declarationList.declarations.some(d=>ts.isIdentifier(d.name)&&d.name.text==='nowJst'));
if(!nowStatement) throw new Error('nowJst helper statement missing');
const taskDeleteText=index.slice(taskDeleteNode.getStart(source),taskDeleteNode.getEnd());
const nowText=index.slice(nowStatement.getStart(source),nowStatement.getEnd());
for(const marker of [
  "request.method!=='POST'&&request.method!=='DELETE'",
  "archiveRecurrenceOccurrenceCompletionStatements",
  "archiveRecurrenceRuleOccurrenceStatements",
  "archiveShoppingCompletionStatements",
  "archiveItemCompletionStatements",
  "archiveTaskCompletionStatements",
  "queueCalendarProjectionAfterMutation",
  "DELETE FROM tasks WHERE id=? AND family_id=?",
]) if(!taskDeleteText.includes(marker)) throw new Error(`taskDelete behavior marker missing before extraction: ${marker}`);
if(!index.includes("if(url.pathname==='/task/delete.php') return await taskDelete(request,context);")) throw new Error('task delete route sentinel missing');

const before=index.slice(0,taskDeleteNode.getFullStart());
const after=index.slice(taskDeleteNode.getEnd());
index=before+after;
const importAnchor="import { reorderApi } from './reorder-api';\n";
if(!index.includes(importAnchor)) throw new Error('reorder API import anchor missing');
index=index.replace(importAnchor,importAnchor+"import { taskDelete } from './task-delete';\n");
if(index.includes('async function taskDelete(')) throw new Error('taskDelete definition remained in index.ts');
fs.writeFileSync(indexPath,index);

const module=`import { json, redirect } from './response';
import { archiveTaskCompletionStatements, archiveShoppingCompletionStatements, archiveItemCompletionStatements, archiveRecurrenceRuleOccurrenceStatements, archiveRecurrenceOccurrenceCompletionStatements } from './lifecycle';
import { queueCalendarProjectionAfterMutation } from './google-calendar';

${nowText}

${taskDeleteText.replace('async function taskDelete(','export async function taskDelete(')}
`;
fs.writeFileSync(modulePath,module);

const contract=`import fs from 'node:fs';

const index=fs.readFileSync('src/index.ts','utf8');
const taskDelete=fs.readFileSync('src/task-delete.ts','utf8');
if(!index.includes("import { taskDelete } from './task-delete';")) throw new Error('index.ts must import taskDelete module');
if(index.includes('async function taskDelete(')) throw new Error('taskDelete must not remain defined in index.ts');
if(!index.includes("if(url.pathname==='/task/delete.php') return await taskDelete(request,context);")) throw new Error('task delete route wiring changed');
if(!taskDelete.includes('export async function taskDelete(')) throw new Error('taskDelete export missing');
for(const marker of [
  "request.method!=='POST'&&request.method!=='DELETE'",
  "request.headers.get('x-csrf')",
  "role==='OWNER'||role==='ADMIN'||Number(task.created_by)===m.id",
  "['restore','exclude'].includes(exceptionMode)",
  'archiveRecurrenceOccurrenceCompletionStatements',
  'archiveRecurrenceRuleOccurrenceStatements',
  'archiveShoppingCompletionStatements',
  'archiveItemCompletionStatements',
  'archiveTaskCompletionStatements',
  "DELETE FROM tasks WHERE id=? AND family_id=?",
  'await ctx.env.DB.batch(statements)',
]) if(!taskDelete.includes(marker)) throw new Error(\`task delete behavior sentinel missing: \${marker}\`);
if((taskDelete.match(/queueCalendarProjectionAfterMutation\(/g)||[]).length<2) throw new Error('calendar delete projection hooks must remain before and after batch');
console.log('task delete modularity contract: ok');
`;
fs.writeFileSync(contractPath,contract);

let manifest=fs.readFileSync(manifestPath,'utf8');
const anchor="      ['reorder-api-modularity','node scripts/reorder-api-modularity-contract.mjs'],\n";
if(!manifest.includes(anchor)) throw new Error('reorder API manifest anchor missing');
manifest=manifest.replace(anchor,anchor+"      ['task-delete-modularity','node scripts/task-delete-modularity-contract.mjs'],\n");
fs.writeFileSync(manifestPath,manifest);

console.log('taskDelete extraction applied from exact TypeScript AST');
