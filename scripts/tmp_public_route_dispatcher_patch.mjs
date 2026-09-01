import fs from 'node:fs';

const indexPath='src/index.ts';
const modulePath='src/public-routes.ts';
const contractPath='scripts/public-route-dispatcher-contract.mjs';
const manifestPath='scripts/regression-manifest.mjs';

if(fs.existsSync(modulePath)) throw new Error(`${modulePath} already exists`);
if(fs.existsSync(contractPath)) throw new Error(`${contractPath} already exists`);

const routeLines=[
  "if(url.pathname==='/__cf/health') return json({ok:true,service:'familytodo-cloudflare',environment:env.ENVIRONMENT});",
  "if(url.pathname==='/__cf/secrets-health') return json({ok:true,service:'familytodo-secrets'});",
  "if(url.pathname==='/__cf/db-health'){const r=await env.DB.prepare('SELECT 1 AS ok').all();return json({ok:true,database:'reachable',result:r.results});}",
  "if(url.pathname==='/__cf/db-schema-health') return await dbSchemaHealth(env);",
  "if(url.pathname==='/__cf/db-runtime-health') return await dbRuntimeHealth(env);",
  "if(url.pathname==='/__cf/auth-health'){const context=await makeContext(request,env,ctx);return await authHealth(context);}",
  "if(url.pathname==='/__cf/google-home-health') return await googleHomeHealth(env);",
  "if(url.pathname==='/__cf/integrations-health') return integrationsHealthResponse(env);",
  "if(url.pathname==='/api/google-calendar/watch') return await calendarWatchWebhook(request,env,ctx);",
  "if(url.pathname==='/oauth/google/token') return await googleToken(request,env);",
  "if(url.pathname==='/oauth/google-tasks/callback') return await googleTasksCallback(request,env);",
  "if(url.pathname==='/oauth/google-calendar/callback') return await googleCalendarCallback(request,env);",
  "if(url.pathname==='/api/google-home/fulfillment') return await googleFulfillment(request,env);",
  "if(url.pathname==='/liff'||url.pathname.startsWith('/liff/')) return await liffDispatcher(request,env);",
  "if(url.pathname==='/oauth/line/google-home/start') return await lineGoogleHomeStart(request,env);",
  "if(url.pathname==='/oauth/line/google-home/callback') return await lineGoogleHomeCallback(request,env);",
  "if(url.pathname==='/oauth/google/continue') return await resumeGoogleHome(request,env);",
];

let index=fs.readFileSync(indexPath,'utf8');
const lines=index.split('\n');
const selectedIndexes=routeLines.map(route=>{
  const matches=[];
  lines.forEach((line,i)=>{if(line.trim()===route)matches.push(i);});
  if(matches.length!==1) throw new Error(`expected one public route line for ${route}, found ${matches.length}`);
  return matches[0];
});
for(let i=1;i<selectedIndexes.length;i++){
  if(selectedIndexes[i]!==selectedIndexes[i-1]+1) throw new Error(`public route block is no longer contiguous at ${routeLines[i]}`);
}

for(const required of [
  "if(url.pathname==='/app/recurring.php') {",
  'const context=await makeContext(request,env,ctx);',
  "if(url.pathname==='/oauth/google/authorize') {",
  'const apiResponse=await dispatchContextApiRoute(request,context,url);',
  'const pageResponse=await dispatchPageRoute(request,context,env,url);',
  "if(url.pathname==='/webhook'||url.pathname==='/app/api/webhook'||url.pathname==='/app/api/webhook.php') return await webhook(request,env);",
  'return await env.ASSETS.fetch(request);',
]) if(!index.includes(required)) throw new Error(`routing boundary sentinel missing: ${required}`);

const moduleHeader=`import { json } from './response';
import { makeContext, authHealth } from './app';
import { dbSchemaHealth, dbRuntimeHealth } from './runtime-diagnostics';
import { googleHomeHealth, googleToken, googleFulfillment } from './google-home';
import { integrationsHealthResponse } from './environment-health';
import { calendarWatchWebhook, googleCalendarCallback } from './google-calendar';
import { googleTasksCallback } from './google-tasks';
import { liffDispatcher, lineGoogleHomeStart, lineGoogleHomeCallback, resumeGoogleHome } from './oauth-continuation';

export async function dispatchPublicRoute(request:Request,env:Env,ctx:ExecutionContext,url:URL):Promise<Response|null>{
`;
const moduleBody=routeLines.map(route=>`  ${route}`).join('\n');
fs.writeFileSync(modulePath,`${moduleHeader}${moduleBody}\n  return null;\n}\n`);

const start=selectedIndexes[0];
const end=selectedIndexes[selectedIndexes.length-1];
lines.splice(start,end-start+1,
  '      const publicResponse=await dispatchPublicRoute(request,env,ctx,url);',
  '      if(publicResponse) return publicResponse;');
index=lines.join('\n');
const importAnchor="import { dispatchContextApiRoute } from './context-api-routes';\n";
if(!index.includes(importAnchor)) throw new Error('context API dispatcher import anchor missing');
index=index.replace(importAnchor,importAnchor+"import { dispatchPublicRoute } from './public-routes';\n");
for(const route of routeLines){
  if(index.split('\n').some(line=>line.trim()===route)) throw new Error(`public route remained in index.ts: ${route}`);
}
fs.writeFileSync(indexPath,index);

const contract=`import fs from 'node:fs';

const index=fs.readFileSync('src/index.ts','utf8');
const publicRoutes=fs.readFileSync('src/public-routes.ts','utf8');
if(!index.includes("import { dispatchPublicRoute } from './public-routes';")) throw new Error('index.ts must import public dispatcher');
if(!index.includes('const publicResponse=await dispatchPublicRoute(request,env,ctx,url);')) throw new Error('index.ts must invoke public dispatcher before context routing');
if(!index.includes('if(publicResponse) return publicResponse;')) throw new Error('index.ts must return matched public response');
if(!publicRoutes.includes('export async function dispatchPublicRoute(request:Request,env:Env,ctx:ExecutionContext,url:URL):Promise<Response|null>{')) throw new Error('public dispatcher export missing');
const routeLines=${JSON.stringify(routeLines,null,2)};
for(const route of routeLines){
  if(!publicRoutes.includes(route)) throw new Error(\`public dispatcher route missing: \${route}\`);
  if(index.split('\\n').some(line=>line.trim()===route)) throw new Error(\`public route must not remain in index.ts: \${route}\`);
}
for(const required of [
  "if(url.pathname==='/app/recurring.php') {",
  'const context=await makeContext(request,env,ctx);',
  "if(url.pathname==='/oauth/google/authorize') {",
  'const apiResponse=await dispatchContextApiRoute(request,context,url);',
  'const pageResponse=await dispatchPageRoute(request,context,env,url);',
  "if(url.pathname==='/webhook'||url.pathname==='/app/api/webhook'||url.pathname==='/app/api/webhook.php') return await webhook(request,env);",
  'return await env.ASSETS.fetch(request);',
]) if(!index.includes(required)) throw new Error(\`non-public routing moved unexpectedly: \${required}\`);
for(const privacy of [
  "json({ok:true,service:'familytodo-secrets'})",
  "integrationsHealthResponse(env)",
]) if(!publicRoutes.includes(privacy)) throw new Error(\`public privacy sentinel missing: \${privacy}\`);
if(!publicRoutes.includes('return null;')) throw new Error('unmatched public route must fall through');
console.log('public route dispatcher contract: ok');
`;
fs.writeFileSync(contractPath,contract);

let manifest=fs.readFileSync(manifestPath,'utf8');
const anchor="      ['context-api-route-dispatcher','node scripts/context-api-route-dispatcher-contract.mjs'],\n";
if(!manifest.includes(anchor)) throw new Error('regression manifest context API anchor missing');
manifest=manifest.replace(anchor,anchor+"      ['public-route-dispatcher','node scripts/public-route-dispatcher-contract.mjs'],\n");
fs.writeFileSync(manifestPath,manifest);

console.log(`public route dispatcher extraction applied (${routeLines.length} routes)`);
