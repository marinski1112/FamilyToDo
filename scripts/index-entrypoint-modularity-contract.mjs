import fs from 'node:fs';

const index=fs.readFileSync('src/index.ts','utf8');
const diagnostics=fs.readFileSync('src/runtime-diagnostics.ts','utf8');

const requiredImport="import { dbSchemaHealth, dbRuntimeHealth, liffConfigDiagnose } from './runtime-diagnostics';";
if(!index.includes(requiredImport)) throw new Error('index.ts must import runtime diagnostics module');
for(const name of ['dbSchemaHealth','dbRuntimeHealth','liffConfigDiagnose']){
  if(index.includes(`async function ${name}(`)) throw new Error(`${name} must not remain defined in index.ts`);
  if(!diagnostics.includes(`export async function ${name}(`)) throw new Error(`${name} must be exported from runtime-diagnostics.ts`);
}
for(const route of [
  "if(url.pathname==='/__cf/db-schema-health') return await dbSchemaHealth(env);",
  "if(url.pathname==='/__cf/db-runtime-health') return await dbRuntimeHealth(env);",
  "if(url.pathname==='/app/api/liff_config_diagnose.php'||url.pathname==='/app/api/liff_config_diagnose') return await liffConfigDiagnose(env);",
]){
  if(!index.includes(route)) throw new Error(`diagnostics route wiring changed: ${route}`);
}
for(const sentinel of [
  "families:['id','timezone']",
  "['tasks','SELECT id,family_id,title,status,completion_mode,start_at,end_at,location,all_day,calendar_visible,calendar_color,task_kind,sort_order,reminder_at,visibility_scope,private_owner_id FROM tasks LIMIT 1']",
  "`line_liff_id present: ${liffId?'YES':'NO'}`",
]){
  if(!diagnostics.includes(sentinel)) throw new Error(`diagnostics behavior sentinel missing: ${sentinel}`);
}
console.log('index entrypoint modularity contract: ok');
