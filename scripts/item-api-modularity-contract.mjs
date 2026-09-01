import fs from 'node:fs';

const index=fs.readFileSync('src/index.ts','utf8');
const apiRoutes=fs.readFileSync('src/context-api-routes.ts','utf8');
const itemApi=fs.readFileSync('src/item-api.ts','utf8');

if(!apiRoutes.includes("import { itemApi } from './item-api';")) throw new Error('context API dispatcher must import item API module');
if(index.includes('async function itemApi(')) throw new Error('itemApi must not remain defined in index.ts');
if(!apiRoutes.includes("if(url.pathname==='/api/item') return await itemApi(request,context);")) throw new Error('item API route wiring changed');
if(!itemApi.includes('export async function itemApi(request:Request,ctx:any):Promise<Response>{')) throw new Error('item API module must export itemApi');
for(const sentinel of [
  "if(request.method!=='POST') return json({ok:false,error:'POST only'},405);",
  "String(b.csrf||'')!==String(ctx.session.csrfToken||'')",
  "taskVisibilitySql('t')",
  "visibility_scope,private_owner_id",
  "INSERT INTO items(family_id,name,memo,due_at,status,completion_mode,created_by,created_at,updated_at,task_id)",
  "privateOwner?[privateOwner]",
  "INSERT OR IGNORE INTO item_assignees(item_id,member_id)",
  "'CREATED','item'",
  "return json({ok:true,id,date:dueDate},201)",
]){
  if(!itemApi.includes(sentinel)) throw new Error(`item API behavior sentinel missing: ${sentinel}`);
}
console.log('item API modularity contract: ok');
