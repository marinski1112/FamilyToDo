import fs from 'node:fs';

const index=fs.readFileSync('src/index.ts','utf8');
const reorder=fs.readFileSync('src/reorder-api.ts','utf8');
const exceptionRoutes=fs.readFileSync('src/exception-routes.ts','utf8');
if(!exceptionRoutes.includes("import { reorderApi } from './reorder-api';")) throw new Error('exception routes must import reorderApi module');
if(index.includes('async function reorderApi(')) throw new Error('reorderApi must not remain defined in index.ts');
if(!exceptionRoutes.includes("if(url.pathname==='/app/api/reorder.php'||url.pathname==='/app/api/reorder') return await reorderApi(request,context);")) throw new Error('reorder route wiring changed');
if(!reorder.includes("import { taskVisibilitySql } from './task-visibility';")) throw new Error('reorderApi must consume canonical task visibility boundary');
if(reorder.includes("from './app'")) throw new Error('reorderApi must not depend directly on app.ts');
if(!reorder.includes('export async function reorderApi(')) throw new Error('reorderApi export missing');
for(const marker of [
  "request.method!=='POST'",
  "String(b.csrf||'')!==String(ctx.session.csrfToken||'')",
  'ids.length>100',
  "taskVisibilitySql('t')",
  'valid.results.length!==ids.length',
  "UPDATE tasks SET sort_order=?,updated_at=? WHERE id=? AND family_id=?",
]) if(!reorder.includes(marker)) throw new Error(`reorder behavior sentinel missing: ${marker}`);
console.log('reorder API modularity contract: ok');
