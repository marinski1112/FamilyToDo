#!/usr/bin/env bash
set -euo pipefail
node <<'NODE'
const fs=require('fs');
const checks=[
 ['CHANGELOG_CLOUDFLARE_WAVE83.md','Migration 0023'],['src/app.ts','taskVisibilitySql'],['src/app.ts','accessibleTaskById'],
 ['migrations/0023_wave83_private_tasks.sql',"visibility_scope TEXT NOT NULL DEFAULT 'FAMILY'"],['src/index.ts','private_owner_id'],
 ['public/assets/task-new.js','is_private'],['src/app.ts','validatedFamilyLogTemplate']
];
for(const [file,text] of checks)if(!fs.readFileSync(file,'utf8').includes(text))throw new Error(`${file}: missing ${text}`);
NODE
echo 'private-task-foundation-contract: visibility, ownership, create UI, and family-log validation markers ok'
