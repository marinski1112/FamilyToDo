import fs from 'node:fs';

const toggle=fs.readFileSync('src/toggle-api.ts','utf8');
const start=toggle.indexOf("if(type==='recurrence'){");
const end=toggle.indexOf("\n  if(type==='task'){",start);
if(start<0||end<=start)throw new Error('recurrence toggle branch missing');
const branch=toggle.slice(start,end);
const lookup=branch.indexOf('const rule=await ctx.env.DB.prepare(`SELECT r.task_id FROM recurrence_rules r JOIN tasks t');
const ownership=branch.indexOf("taskVisibilitySql('t')",lookup);
const absent=branch.indexOf("if(!rule)return json({ok:false,error:'定期タスクのルールが見つかりません。'},404);");
const mutation=branch.indexOf('INSERT INTO recurrence_occurrence_completions(occurrence_id,member_id,completed_at)');
const aggregate=branch.indexOf('updateRecurrenceOccurrenceAggregateCompat(ctx.env.DB');
if(!(lookup>=0&&ownership>lookup&&absent>ownership&&mutation>absent&&aggregate>mutation))throw new Error('recurrence parent family/PRIVATE ownership must be checked before any completion mutation');
for(const marker of ['DELETE FROM recurrence_occurrence_completions WHERE occurrence_id=?', 'JOIN members am ON am.id=c.member_id AND am.family_id=? AND am.active=1', 'const isComplete=Number(done?.c||0)>0;', 'const completedBy=isComplete?(Number(latest?.member_id||0)||null):null;'])if(!branch.includes(marker))throw new Error(`recurrence any-member completion marker missing: ${marker}`);
if(branch.includes('task_assignees')||branch.includes('completion_mode'))throw new Error('recurrence completion must not depend on assignments or legacy ALL mode');
console.log('recurrence toggle authorization order: family and PRIVATE ownership checked before any-member mutation');
