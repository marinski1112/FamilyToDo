import fs from 'node:fs';

const appPath='src/app.ts';
const contractPath='scripts/recurrence-toggle-authorization-order-contract.mjs';
const manifestPath='scripts/regression-manifest.mjs';

const replaceOnce=(source,from,to,label)=>{
  const first=source.indexOf(from);
  if(first<0) throw new Error(`missing ${label}`);
  if(source.indexOf(from,first+from.length)>=0) throw new Error(`duplicate ${label}`);
  return source.slice(0,first)+to+source.slice(first+from.length);
};

let app=fs.readFileSync(appPath,'utf8');
const oldBlock=`    if(completed){\n      await ctx.env.DB.prepare('INSERT INTO recurrence_occurrence_completions(occurrence_id,member_id,completed_at) VALUES(?,?,?) ON CONFLICT(occurrence_id,member_id) DO UPDATE SET completed_at=excluded.completed_at').bind(occId,m.id,now).run();\n    }else{\n      await ctx.env.DB.prepare('DELETE FROM recurrence_occurrence_completions WHERE occurrence_id=? AND member_id=?').bind(occId,m.id).run();\n    }\n    const assigned=await ctx.env.DB.prepare('SELECT COUNT(*) c FROM task_assignees ta JOIN members am ON am.id=ta.member_id AND am.active=1 WHERE ta.task_id=?').bind(Number(rule.task_id)).first<Row>();\n    const actorAssigned=await ctx.env.DB.prepare('SELECT 1 x FROM task_assignees ta JOIN members am ON am.id=ta.member_id AND am.active=1 WHERE ta.task_id=? AND ta.member_id=? LIMIT 1').bind(Number(rule.task_id),m.id).first<Row>();\n    if(Number(assigned?.c||0)===0) return json({ok:false,error:'担当者が設定されていない定期タスクは完了できません。'},409);\n    if(!actorAssigned) return json({ok:false,error:'この定期タスクの担当者ではありません。'},403);\n`;
const newBlock=`    const assigned=await ctx.env.DB.prepare('SELECT COUNT(*) c FROM task_assignees ta JOIN members am ON am.id=ta.member_id AND am.active=1 WHERE ta.task_id=?').bind(Number(rule.task_id)).first<Row>();\n    const actorAssigned=await ctx.env.DB.prepare('SELECT 1 x FROM task_assignees ta JOIN members am ON am.id=ta.member_id AND am.active=1 WHERE ta.task_id=? AND ta.member_id=? LIMIT 1').bind(Number(rule.task_id),m.id).first<Row>();\n    if(Number(assigned?.c||0)===0) return json({ok:false,error:'担当者が設定されていない定期タスクは完了できません。'},409);\n    if(!actorAssigned) return json({ok:false,error:'この定期タスクの担当者ではありません。'},403);\n    if(completed){\n      await ctx.env.DB.prepare('INSERT INTO recurrence_occurrence_completions(occurrence_id,member_id,completed_at) VALUES(?,?,?) ON CONFLICT(occurrence_id,member_id) DO UPDATE SET completed_at=excluded.completed_at').bind(occId,m.id,now).run();\n    }else{\n      await ctx.env.DB.prepare('DELETE FROM recurrence_occurrence_completions WHERE occurrence_id=? AND member_id=?').bind(occId,m.id).run();\n    }\n`;
app=replaceOnce(app,oldBlock,newBlock,'recurrence toggle authorization/mutation block');
fs.writeFileSync(appPath,app);

const contract=`import fs from 'node:fs';\n\nconst app=fs.readFileSync('src/app.ts','utf8');\nconst start=app.indexOf("if(type==='recurrence'){");\nif(start<0) throw new Error('recurrence toggle branch missing');\nconst end=app.indexOf("const done=await ctx.env.DB.prepare('SELECT COUNT(*) c FROM recurrence_occurrence_completions",start);\nif(end<=start) throw new Error('recurrence toggle branch boundary missing');\nconst branch=app.slice(start,end);\nfor(const marker of [\n  "if(!occ)return json({ok:false,error:'定期タスクの発生日が見つかりません。'},404);",\n  "if(!rule)return json({ok:false,error:'定期タスクのルールが見つかりません。'},404);",\n  "if(Number(assigned?.c||0)===0) return json({ok:false,error:'担当者が設定されていない定期タスクは完了できません。'},409);",\n  "if(!actorAssigned) return json({ok:false,error:'この定期タスクの担当者ではありません。'},403);",\n  'INSERT INTO recurrence_occurrence_completions(occurrence_id,member_id,completed_at)',\n  'DELETE FROM recurrence_occurrence_completions WHERE occurrence_id=? AND member_id=?',\n]) if(!branch.includes(marker)) throw new Error(\`recurrence toggle marker missing: \${marker}\`);\nconst noAssignee=branch.indexOf("if(Number(assigned?.c||0)===0)");\nconst actorGuard=branch.indexOf('if(!actorAssigned)');\nconst insert=branch.indexOf('INSERT INTO recurrence_occurrence_completions(occurrence_id,member_id,completed_at)');\nconst remove=branch.indexOf('DELETE FROM recurrence_occurrence_completions WHERE occurrence_id=? AND member_id=?');\nif(!(noAssignee>=0&&actorGuard>noAssignee&&insert>actorGuard&&remove>actorGuard)) throw new Error('recurrence completion mutation must occur only after assignee authorization');\nconsole.log('recurrence toggle authorization order contract ok');\n`;
fs.writeFileSync(contractPath,contract);

let manifest=fs.readFileSync(manifestPath,'utf8');
manifest=replaceOnce(manifest,"      ['recurring-occurrence-modularity','node scripts/recurring-occurrence-modularity-contract.mjs'],","      ['recurring-occurrence-modularity','node scripts/recurring-occurrence-modularity-contract.mjs'],\n      ['recurrence-toggle-authorization-order','node scripts/recurrence-toggle-authorization-order-contract.mjs'],",'regression manifest recurrence anchor');
fs.writeFileSync(manifestPath,manifest);

console.log('recurrence toggle authorization patch applied');
