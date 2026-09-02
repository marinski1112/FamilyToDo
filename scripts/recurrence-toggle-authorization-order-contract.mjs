import fs from 'node:fs';

const toggle=fs.readFileSync('src/toggle-api.ts','utf8');
const start=toggle.indexOf("if(type==='recurrence'){");
if(start<0) throw new Error('recurrence toggle branch missing');
const end=toggle.indexOf("const done=await ctx.env.DB.prepare('SELECT COUNT(*) c FROM recurrence_occurrence_completions",start);
if(end<=start) throw new Error('recurrence toggle branch boundary missing');
const branch=toggle.slice(start,end);
for(const marker of [
  "if(!occ)return json({ok:false,error:'定期タスクの発生日が見つかりません。'},404);",
  "if(!rule)return json({ok:false,error:'定期タスクのルールが見つかりません。'},404);",
  "if(Number(assigned?.c||0)===0)return json({ok:false,error:'担当者が設定されていない定期タスクは完了できません。'},409);",
  "if(!actorAssigned)return json({ok:false,error:'この定期タスクの担当者ではありません。'},403);",
  'INSERT INTO recurrence_occurrence_completions(occurrence_id,member_id,completed_at)',
  'DELETE FROM recurrence_occurrence_completions WHERE occurrence_id=? AND member_id=?',
]) if(!branch.includes(marker)) throw new Error(`recurrence toggle marker missing: ${marker}`);
const noAssignee=branch.indexOf("if(Number(assigned?.c||0)===0)");
const actorGuard=branch.indexOf('if(!actorAssigned)');
const insert=branch.indexOf('INSERT INTO recurrence_occurrence_completions(occurrence_id,member_id,completed_at)');
const remove=branch.indexOf('DELETE FROM recurrence_occurrence_completions WHERE occurrence_id=? AND member_id=?');
if(!(noAssignee>=0&&actorGuard>noAssignee&&insert>actorGuard&&remove>actorGuard)) throw new Error('recurrence completion mutation must occur only after assignee authorization');
console.log('recurrence toggle authorization order contract ok');
