#!/usr/bin/env bash
set -euo pipefail
node <<'NODE'
const fs=require('fs'),path=require('path');
const retained=(dir)=>fs.readdirSync(dir,{withFileTypes:true}).flatMap(e=>{const p=path.join(dir,e.name);return e.isDirectory()?retained(p):e.isFile()&&e.name.endsWith('.ts')?[fs.readFileSync(p,'utf8')]:[]}).join('\n');
const app=retained('src');
const checks=[
 ['CHANGELOG_CLOUDFLARE_WAVE83.md','Migration 0023'],['@retained','taskVisibilitySql'],['@retained','accessibleTaskById'],
 ['migrations/0023_wave83_private_tasks.sql',"visibility_scope TEXT NOT NULL DEFAULT 'FAMILY'"],['src/task-api.ts','private_owner_id'],
 ['public/assets/task-new.js','is_private'],['@retained','validatedFamilyLogTemplate']
];
for(const [file,text] of checks){const source=file==='@retained'?app:fs.readFileSync(file,'utf8');if(!source.includes(text))throw new Error(`${file}: missing ${text}`);}
const taskApi=fs.readFileSync('src/task-api.ts','utf8');
if(taskApi.includes('const ids=isPrivate?[]:'))throw new Error('src/task-api.ts: PRIVATE create must not drop its owner recipient');
if(!taskApi.includes('const ids=isPrivate?[m.id]:'))throw new Error('src/task-api.ts: PRIVATE create must assign its owner as the sole recipient scope');
if(!taskApi.includes('if(reminderAt && ids.length){'))throw new Error('src/task-api.ts: scheduled task reminders must use the resolved recipient scope');
NODE
echo 'private-task-foundation-contract: visibility, ownership, create UI, and family-log validation markers ok'
