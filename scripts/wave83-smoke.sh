#!/usr/bin/env bash
set -euo pipefail
rg -q "Migration 0023" CHANGELOG_CLOUDFLARE_WAVE83.md
rg -q "taskVisibilitySql" src/app.ts
rg -q "accessibleTaskById" src/app.ts
rg -q "visibility_scope TEXT NOT NULL DEFAULT 'FAMILY'" migrations/0023_wave83_private_tasks.sql
rg -q "private_owner_id" src/index.ts
rg -q "is_private" public/assets/task-new.js
rg -q "validatedFamilyLogTemplate" src/app.ts
echo 'wave83 smoke: ok'
