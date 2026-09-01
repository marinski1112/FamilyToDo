import fs from 'node:fs';

const indexPath='src/index.ts';
const modulePath='src/reorder-api.ts';
const contractPath='scripts/reorder-api-modularity-contract.mjs';
const manifestPath='scripts/regression-manifest.mjs';

if(fs.existsSync(modulePath)) throw new Error(`${modulePath} already exists`);
if(fs.existsSync(contractPath)) throw new Error(`${contractPath} already exists`);

let index=fs.readFileSync(indexPath,'utf8');
const block=`async function reorderApi(request:Request,ctx:any):Promise<Response>{
  const m=ctx.member;if(!m)return json({ok:false,error:'ログインが必要です。'},401);if(request.method!=='POST')return json({ok:false,error:'POST only'},405);
  const b=await request.json().catch(()=>null) as Record<string,unknown>|null;if(!b)return json({ok:false,error:'JSONが不正です。'},400);
  if(String(b.csrf||'')!==String(ctx.session.csrfToken||''))return json({ok:false,error:'CSRF検証に失敗しました。'},403);
  const ids=[...new Set(Array.isArray(b.ids)?(b.ids as unknown[]).map(Number).filter(n=>Number.isInteger(n)&&n>0):[])];if(!ids.length)return json({ok:false,error:'順序がありません。'},400);
  if(ids.length>100)return json({ok:false,error:'一度に並べ替えできる件数を超えています。'},400);
  const placeholders=ids.map(()=>'?').join(',');
  const valid=await ctx.env.DB.prepare(\`SELECT id FROM tasks t WHERE family_id=? AND id IN (\${placeholders}) AND \${taskVisibilitySql('t')}\`).bind(m.family_id,...ids,m.id).all();
  if(valid.results.length!==ids.length)return json({ok:false,error:'家族外または削除済みのタスクが含まれています。'},400);
  const now=new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Tokyo',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'}).format(new Date());
  await ctx.env.DB.batch(ids.map((id:number,i:number)=>ctx.env.DB.prepare('UPDATE tasks SET sort_order=?,updated_at=? WHERE id=? AND family_id=?').bind(i*10,now,id,m.family_id)));
  return json({ok:true,ids});
}`;
if((index.match(/async function reorderApi\(/g)||[]).length!==1) throw new Error('expected one reorderApi definition');
if(!index.includes(block)) throw new Error('exact reorderApi block missing');
if(!index.includes("if(url.pathname==='/app/api/reorder.php'||url.pathname==='/app/api/reorder') return await reorderApi(request,context);")) throw new Error('reorder route sentinel missing');
index=index.replace(block,'');
const anchor="import { dispatchPublicRoute } from './public-routes';\n";
if(!index.includes(anchor)) throw new Error('public dispatcher import anchor missing');
index=index.replace(anchor,anchor+"import { reorderApi } from './reorder-api';\n");
fs.writeFileSync(indexPath,index);

const module=`import { json } from './response';
import { taskVisibilitySql } from './app';

export async function reorderApi(request:Request,ctx:any):Promise<Response>{
  const m=ctx.member;if(!m)return json({ok:false,error:'ログインが必要です。'},401);if(request.method!=='POST')return json({ok:false,error:'POST only'},405);
  const b=await request.json().catch(()=>null) as Record<string,unknown>|null;if(!b)return json({ok:false,error:'JSONが不正です。'},400);
  if(String(b.csrf||'')!==String(ctx.session.csrfToken||''))return json({ok:false,error:'CSRF検証に失敗しました。'},403);
  const ids=[...new Set(Array.isArray(b.ids)?(b.ids as unknown[]).map(Number).filter(n=>Number.isInteger(n)&&n>0):[])];if(!ids.length)return json({ok:false,error:'順序がありません。'},400);
  if(ids.length>100)return json({ok:false,error:'一度に並べ替えできる件数を超えています。'},400);
  const placeholders=ids.map(()=>'?').join(',');
  const valid=await ctx.env.DB.prepare(\`SELECT id FROM tasks t WHERE family_id=? AND id IN (\${placeholders}) AND \${taskVisibilitySql('t')}\`).bind(m.family_id,...ids,m.id).all();
  if(valid.results.length!==ids.length)return json({ok:false,error:'家族外または削除済みのタスクが含まれています。'},400);
  const now=new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Tokyo',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'}).format(new Date());
  await ctx.env.DB.batch(ids.map((id:number,i:number)=>ctx.env.DB.prepare('UPDATE tasks SET sort_order=?,updated_at=? WHERE id=? AND family_id=?').bind(i*10,now,id,m.family_id)));
  return json({ok:true,ids});
}
`;
fs.writeFileSync(modulePath,module);

const contract=`import fs from 'node:fs';

const index=fs.readFileSync('src/index.ts','utf8');
const reorder=fs.readFileSync('src/reorder-api.ts','utf8');
if(!index.includes("import { reorderApi } from './reorder-api';")) throw new Error('index.ts must import reorderApi module');
if(index.includes('async function reorderApi(')) throw new Error('reorderApi must not remain defined in index.ts');
if(!index.includes("if(url.pathname==='/app/api/reorder.php'||url.pathname==='/app/api/reorder') return await reorderApi(request,context);")) throw new Error('reorder route wiring changed');
if(!reorder.includes('export async function reorderApi(')) throw new Error('reorderApi export missing');
for(const marker of [
  "request.method!=='POST'",
  "String(b.csrf||'')!==String(ctx.session.csrfToken||'')",
  'ids.length>100',
  "taskVisibilitySql('t')",
  'valid.results.length!==ids.length',
  "UPDATE tasks SET sort_order=?,updated_at=? WHERE id=? AND family_id=?",
]) if(!reorder.includes(marker)) throw new Error(\`reorder behavior sentinel missing: \${marker}\`);
console.log('reorder API modularity contract: ok');
`;
fs.writeFileSync(contractPath,contract);

let manifest=fs.readFileSync(manifestPath,'utf8');
const manifestAnchor="      ['public-route-dispatcher','node scripts/public-route-dispatcher-contract.mjs'],\n";
if(!manifest.includes(manifestAnchor)) throw new Error('public route manifest anchor missing');
manifest=manifest.replace(manifestAnchor,manifestAnchor+"      ['reorder-api-modularity','node scripts/reorder-api-modularity-contract.mjs'],\n");
fs.writeFileSync(manifestPath,manifest);

console.log('reorder API modularity extraction applied');
