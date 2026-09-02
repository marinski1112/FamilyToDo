import fs from 'node:fs';

const writer=fs.readFileSync('src/activity-log.ts','utf8');
const invite=fs.readFileSync('src/family-invite-api.ts','utf8');
const manifest=fs.readFileSync('scripts/regression-manifest.mjs','utf8');

for(const marker of [
  "import type { AppContext } from './app-context';",
  'export async function logActivity(',
  "targetType==='task'",
  "SELECT visibility_scope FROM tasks WHERE id=? AND family_id=?",
  "String(task?.visibility_scope)==='PRIVATE'",
  "targetType==='item'||targetType==='shopping'",
  "targetType==='item'?'items':'shopping_items'",
  'JOIN tasks t ON t.id=c.task_id AND t.family_id=c.family_id',
  "String(child?.visibility_scope)==='PRIVATE'",
  'INSERT INTO activity_logs(family_id,member_id,action,target_type,target_id,metadata,occurred_at) VALUES(?,?,?,?,?,?,?)',
  'JSON.stringify(metadata)',
  'onFailure?.(error)',
]) if(!writer.includes(marker)) throw new Error(`activity log writer lost behavior marker: ${marker}`);

if(writer.includes("from './app'")) throw new Error('retained activity log writer must not depend on app.ts');
if(writer.includes('console.error')) throw new Error('retained activity log writer must not directly emit raw exceptions');
if(!invite.includes("import { logActivity } from './activity-log';")) throw new Error('family invite API must use retained activity log writer');
if(invite.includes('logInviteActivity')) throw new Error('family invite API must not keep a duplicate activity log writer');
for(const marker of [
  "logActivity(ctx,'REVOKED','family_invitation'",
  "logActivity(ctx,'CREATED','family_invitation'",
  "logActivity(ctx,'INVITED','family_log_subject'",
]) if(!invite.includes(marker)) throw new Error(`family invite activity event wiring changed: ${marker}`);
if(!manifest.includes("['activity-log-writer-boundary','node scripts/activity-log-writer-boundary-contract.mjs']")) throw new Error('activity log writer boundary contract is not active');

console.log('retained activity log writer boundary contract ok');
