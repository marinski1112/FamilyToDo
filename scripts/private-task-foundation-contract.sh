#!/usr/bin/env bash
set -euo pipefail
node <<'NODE'
const fs=require('fs'),path=require('path');
const retained=(dir)=>fs.readdirSync(dir,{withFileTypes:true}).flatMap(e=>{const p=path.join(dir,e.name);return e.isDirectory()?retained(p):e.isFile()&&e.name.endsWith('.ts')?[fs.readFileSync(p,'utf8')]:[]}).join('\n');
const app=retained('src');
const checks=[
 ['@retained','taskVisibilitySql'],['@retained','accessibleTaskById'],
 ['migrations/0023_wave83_private_tasks.sql',"visibility_scope TEXT NOT NULL DEFAULT 'FAMILY'"],['src/task-api.ts','private_owner_id'],
 ['src/task-entry-page.ts','id="isPrivate"'],['public/assets/task-entry-manual.js','is_private:Boolean(isPrivate?.checked)'],['@retained','validatedFamilyLogTemplate']
];
for(const [file,text] of checks){const source=file==='@retained'?app:fs.readFileSync(file,'utf8');if(!source.includes(text))throw new Error(`${file}: missing ${text}`);}
const taskApi=fs.readFileSync('src/task-api.ts','utf8');
const taskCreate=fs.readFileSync('src/task-create.ts','utf8');
if(!taskApi.includes('privateOwnerId:isPrivate?Number(m.id):null'))throw new Error('src/task-api.ts: PRIVATE create must persist owner separately from assignees');
if(taskApi.includes('assigneeIds')||taskCreate.includes('assigneeIds'))throw new Error('Task creation must have no assignee payload or fingerprint');
if(!taskCreate.includes("input.visibilityScope, input.privateOwnerId??input.memberId"))throw new Error('src/task-create.ts: reminder recipients must be scoped to the PRIVATE owner');
if(!taskCreate.includes('m.family_id=? AND m.active=1'))throw new Error('src/task-create.ts: reminder recipients must remain active family members');
if(taskCreate.includes('task_assignees'))throw new Error('src/task-create.ts: retired assignee table must not be written');
NODE
echo 'private-task-foundation-contract: visibility, ownership, unified create UI, and family-log validation markers ok'
