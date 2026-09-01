import fs from 'node:fs';

const replaceOnce=(source,from,to,label)=>{
  const first=source.indexOf(from);
  if(first<0) throw new Error(`missing ${label}`);
  if(source.indexOf(from,first+from.length)>=0) throw new Error(`duplicate ${label}`);
  return source.slice(0,first)+to+source.slice(first+from.length);
};
const patch=(path,fn)=>{
  const before=fs.readFileSync(path,'utf8');
  const after=fn(before);
  if(after===before) throw new Error(`no change for ${path}`);
  fs.writeFileSync(path,after);
};

patch('scripts/index-entrypoint-modularity-contract.mjs',source=>{
  source=replaceOnce(source,"const publicRoutes=fs.readFileSync('src/public-routes.ts','utf8');","const publicRoutes=fs.readFileSync('src/public-routes.ts','utf8');\nconst exceptionRoutes=fs.readFileSync('src/exception-routes.ts','utf8');",'index modularity exception source');
  source=replaceOnce(source,"if(!index.includes('liffConfigDiagnose')) throw new Error('index.ts must retain authenticated LIFF diagnostics routing');","if(!exceptionRoutes.includes(\"import { liffConfigDiagnose } from './runtime-diagnostics';\")) throw new Error('exception routes must import authenticated LIFF diagnostics handler');",'LIFF diagnostics import responsibility');
  source=replaceOnce(source,"if(!index.includes(liffDiagnosticRoute)) throw new Error(`authenticated diagnostics route wiring changed: ${liffDiagnosticRoute}`);","if(!exceptionRoutes.includes(liffDiagnosticRoute)) throw new Error(`authenticated diagnostics route wiring changed: ${liffDiagnosticRoute}`);",'LIFF diagnostics route responsibility');
  return source;
});

patch('scripts/line-webhook-modularity-contract.mjs',source=>{
  source=replaceOnce(source,"const webhook=fs.readFileSync('src/line-webhook.ts','utf8');","const webhook=fs.readFileSync('src/line-webhook.ts','utf8');\nconst exceptionRoutes=fs.readFileSync('src/exception-routes.ts','utf8');",'webhook exception source');
  source=replaceOnce(source,"if(!index.includes(\"import { webhook } from './line-webhook';\")) throw new Error('index.ts must import LINE webhook module');","if(!exceptionRoutes.includes(\"import { webhook } from './line-webhook';\")) throw new Error('exception routes must import LINE webhook module');",'webhook import responsibility');
  source=replaceOnce(source,"if(!index.includes(\"if(url.pathname==='/webhook'||url.pathname==='/app/api/webhook'||url.pathname==='/app/api/webhook.php') return await webhook(request,env);\")) throw new Error('LINE webhook route wiring changed');","if(!exceptionRoutes.includes(\"if(url.pathname==='/webhook'||url.pathname==='/app/api/webhook'||url.pathname==='/app/api/webhook.php') return await webhook(request,env);\")) throw new Error('LINE webhook route wiring changed');",'webhook route responsibility');
  return source;
});

patch('scripts/recurring-occurrence-modularity-contract.mjs',source=>{
  source=replaceOnce(source,"const occurrence=fs.readFileSync('src/recurring-occurrence.ts','utf8');","const occurrence=fs.readFileSync('src/recurring-occurrence.ts','utf8');\nconst exceptionRoutes=fs.readFileSync('src/exception-routes.ts','utf8');",'occurrence exception source');
  source=replaceOnce(source,"if(!index.includes(\"import { convertOccurrence } from './recurring-occurrence';\")) throw new Error('index.ts must import recurring occurrence module');","if(!exceptionRoutes.includes(\"import { convertOccurrence } from './recurring-occurrence';\")) throw new Error('exception routes must import recurring occurrence module');",'occurrence import responsibility');
  source=replaceOnce(source,"if(!index.includes(\"if(url.pathname==='/task/convert_occurrence.php') return await convertOccurrence(request,context);\")) throw new Error('convert occurrence route wiring changed');","if(!exceptionRoutes.includes(\"if(url.pathname==='/task/convert_occurrence.php') return await convertOccurrence(request,context);\")) throw new Error('convert occurrence route wiring changed');",'occurrence route responsibility');
  return source;
});

patch('scripts/page-route-dispatcher-contract.mjs',source=>{
  source=replaceOnce(source,"const apiRoutes=fs.readFileSync('src/context-api-routes.ts','utf8');","const apiRoutes=fs.readFileSync('src/context-api-routes.ts','utf8');\nconst exceptionRoutes=fs.readFileSync('src/exception-routes.ts','utf8');",'page contract exception source');
  const oldBlock=`for(const required of [\n  "if(url.pathname==='/app/api/check.php'||url.pathname==='/app/api/check') return await toggle(request,context);",\n  "if(url.pathname==='/webhook'||url.pathname==='/app/api/webhook'||url.pathname==='/app/api/webhook.php') return await webhook(request,env);",\n  "if(url.pathname==='/app/recurring.php')",\n  'return await env.ASSETS.fetch(request);',\n]) if(!index.includes(required)) throw new Error(\`non-page routing moved unexpectedly: \${required}\`);`;
  const newBlock=`for(const required of [\n  "if(url.pathname==='/app/api/check.php'||url.pathname==='/app/api/check') return await toggle(request,context);",\n  "if(url.pathname==='/webhook'||url.pathname==='/app/api/webhook'||url.pathname==='/app/api/webhook.php') return await webhook(request,env);",\n]) if(!exceptionRoutes.includes(required)) throw new Error(\`exception routing boundary changed: \${required}\`);\nfor(const required of [\n  "if(url.pathname==='/app/recurring.php')",\n  'return await env.ASSETS.fetch(request);',\n]) if(!index.includes(required)) throw new Error(\`non-page routing moved unexpectedly: \${required}\`);`;
  return replaceOnce(source,oldBlock,newBlock,'page dispatcher boundary block');
});

patch('scripts/context-api-route-dispatcher-contract.mjs',source=>{
  source=replaceOnce(source,"const publicRoutes=fs.readFileSync('src/public-routes.ts','utf8');","const publicRoutes=fs.readFileSync('src/public-routes.ts','utf8');\nconst exceptionRoutes=fs.readFileSync('src/exception-routes.ts','utf8');",'context API exception source');
  const oldBlock=`for(const required of [\n  "if(url.pathname==='/app/api/liff_login.php'||url.pathname==='/app/api/liff_login') return await liffLogin(request,context);",\n  'const pageResponse=await dispatchPageRoute(request,context,env,url);',\n  "if(url.pathname==='/app/api/check.php'||url.pathname==='/app/api/check') return await toggle(request,context);",\n]) if(!index.includes(required)) throw new Error(\`authenticated routing boundary moved unexpectedly: \${required}\`);`;
  const newBlock=`for(const required of [\n  "if(url.pathname==='/app/api/liff_login.php'||url.pathname==='/app/api/liff_login') return await liffLogin(request,context);",\n  "if(url.pathname==='/app/api/check.php'||url.pathname==='/app/api/check') return await toggle(request,context);",\n]) if(!exceptionRoutes.includes(required)) throw new Error(\`authenticated exception routing boundary changed: \${required}\`);\nif(!index.includes('const pageResponse=await dispatchPageRoute(request,context,env,url);')) throw new Error('page dispatcher boundary moved unexpectedly');`;
  return replaceOnce(source,oldBlock,newBlock,'context API boundary block');
});

patch('scripts/public-route-dispatcher-contract.mjs',source=>{
  source=replaceOnce(source,"const publicRoutes=fs.readFileSync('src/public-routes.ts','utf8');","const publicRoutes=fs.readFileSync('src/public-routes.ts','utf8');\nconst exceptionRoutes=fs.readFileSync('src/exception-routes.ts','utf8');",'public contract exception source');
  const oldBlock=`for(const required of [\n  "if(url.pathname==='/app/recurring.php') {",\n  'const context=await makeContext(request,env,ctx);',\n  "if(url.pathname==='/oauth/google/authorize') {",\n  'const apiResponse=await dispatchContextApiRoute(request,context,url);',\n  'const pageResponse=await dispatchPageRoute(request,context,env,url);',\n  "if(url.pathname==='/webhook'||url.pathname==='/app/api/webhook'||url.pathname==='/app/api/webhook.php') return await webhook(request,env);",\n  'return await env.ASSETS.fetch(request);',\n]) if(!index.includes(required)) throw new Error(\`non-public routing moved unexpectedly: \${required}\`);`;
  const newBlock=`for(const required of [\n  "if(url.pathname==='/oauth/google/authorize') {",\n  "if(url.pathname==='/webhook'||url.pathname==='/app/api/webhook'||url.pathname==='/app/api/webhook.php') return await webhook(request,env);",\n]) if(!exceptionRoutes.includes(required)) throw new Error(\`exception routing boundary changed: \${required}\`);\nfor(const required of [\n  "if(url.pathname==='/app/recurring.php') {",\n  'const context=await makeContext(request,env,ctx);',\n  'const apiResponse=await dispatchContextApiRoute(request,context,url);',\n  'const pageResponse=await dispatchPageRoute(request,context,env,url);',\n  'return await env.ASSETS.fetch(request);',\n]) if(!index.includes(required)) throw new Error(\`non-public routing moved unexpectedly: \${required}\`);`;
  return replaceOnce(source,oldBlock,newBlock,'public dispatcher boundary block');
});

patch('scripts/reorder-api-modularity-contract.mjs',source=>{
  source=replaceOnce(source,"const reorder=fs.readFileSync('src/reorder-api.ts','utf8');","const reorder=fs.readFileSync('src/reorder-api.ts','utf8');\nconst exceptionRoutes=fs.readFileSync('src/exception-routes.ts','utf8');",'reorder exception source');
  source=replaceOnce(source,"if(!index.includes(\"import { reorderApi } from './reorder-api';\")) throw new Error('index.ts must import reorderApi module');","if(!exceptionRoutes.includes(\"import { reorderApi } from './reorder-api';\")) throw new Error('exception routes must import reorderApi module');",'reorder import responsibility');
  source=replaceOnce(source,"if(!index.includes(\"if(url.pathname==='/app/api/reorder.php'||url.pathname==='/app/api/reorder') return await reorderApi(request,context);\")) throw new Error('reorder route wiring changed');","if(!exceptionRoutes.includes(\"if(url.pathname==='/app/api/reorder.php'||url.pathname==='/app/api/reorder') return await reorderApi(request,context);\")) throw new Error('reorder route wiring changed');",'reorder route responsibility');
  return source;
});

patch('scripts/task-delete-modularity-contract.mjs',source=>{
  source=replaceOnce(source,"const taskDelete=fs.readFileSync('src/task-delete.ts','utf8');","const taskDelete=fs.readFileSync('src/task-delete.ts','utf8');\nconst exceptionRoutes=fs.readFileSync('src/exception-routes.ts','utf8');",'task delete exception source');
  source=replaceOnce(source,"if(!index.includes(\"import { taskDelete } from './task-delete';\")) throw new Error('index.ts must import taskDelete module');","if(!exceptionRoutes.includes(\"import { taskDelete } from './task-delete';\")) throw new Error('exception routes must import taskDelete module');",'task delete import responsibility');
  source=replaceOnce(source,"if(!index.includes(\"if(url.pathname==='/task/delete.php') return await taskDelete(request,context);\")) throw new Error('task delete route wiring changed');","if(!exceptionRoutes.includes(\"if(url.pathname==='/task/delete.php') return await taskDelete(request,context);\")) throw new Error('task delete route wiring changed');",'task delete route responsibility');
  return source;
});

patch('scripts/new-entry-pages-modularity-contract.mjs',source=>{
  source=replaceOnce(source,"const pages=fs.readFileSync('src/new-entry-pages.ts','utf8');","const pages=fs.readFileSync('src/new-entry-pages.ts','utf8');\nconst exceptionRoutes=fs.readFileSync('src/exception-routes.ts','utf8');",'new pages exception source');
  source=replaceOnce(source,"if(!index.includes(\"import { taskNew, itemNew } from './new-entry-pages';\")) throw new Error('index must import new page handlers');","if(!exceptionRoutes.includes(\"import { taskNew, itemNew } from './new-entry-pages';\")) throw new Error('exception routes must import new page handlers');",'new pages import responsibility');
  source=replaceOnce(source,"]) if(!index.includes(route)) throw new Error(`new page route wiring changed: ${route}`);","]) if(!exceptionRoutes.includes(route)) throw new Error(`new page route wiring changed: ${route}`);",'new pages route responsibility');
  return source;
});

patch('scripts/calendar-sync-retry-contract.mjs',source=>{
  source=replaceOnce(source,"const index=fs.readFileSync('src/index.ts','utf8');","const index=fs.readFileSync('src/index.ts','utf8');\nconst exceptionRoutes=fs.readFileSync('src/exception-routes.ts','utf8');",'calendar retry exception source');
  source=replaceOnce(source,"for(const marker of ['family_timezone','env.APP_TIMEZONE||DEFAULT_FAMILY_TIMEZONE']) assert.ok(index.includes(marker),marker);","for(const marker of ['family_timezone','env.APP_TIMEZONE||DEFAULT_FAMILY_TIMEZONE']) assert.ok(exceptionRoutes.includes(marker),marker);",'calendar retry timezone responsibility');
  return source;
});

patch('scripts/calendar-sync-foundation-contract.mjs',source=>{
  source=replaceOnce(source,"const publicRoutes=fs.readFileSync('src/public-routes.ts','utf8');","const publicRoutes=fs.readFileSync('src/public-routes.ts','utf8');\nconst exceptionRoutes=fs.readFileSync('src/exception-routes.ts','utf8');",'calendar foundation exception source');
  const old=`for(const marker of [\n  '/oauth/google-calendar/authorize',\n  'processCalendarOutbox',\n]) assert.ok(index.includes(marker),marker);\nassert.ok(publicRoutes.includes('/oauth/google-calendar/callback'),'/oauth/google-calendar/callback');`;
  const next=`assert.ok(exceptionRoutes.includes('/oauth/google-calendar/authorize'),'/oauth/google-calendar/authorize');\nassert.ok(index.includes('processCalendarOutbox'),'processCalendarOutbox');\nassert.ok(publicRoutes.includes('/oauth/google-calendar/callback'),'/oauth/google-calendar/callback');`;
  return replaceOnce(source,old,next,'calendar foundation routing responsibility');
});

patch('scripts/google-home-foundation-contract.mjs',source=>{
  source=replaceOnce(source,"const publicRoutes=fs.readFileSync('src/public-routes.ts','utf8');","const publicRoutes=fs.readFileSync('src/public-routes.ts','utf8');\nconst exceptionRoutes=fs.readFileSync('src/exception-routes.ts','utf8');",'google home exception source');
  return replaceOnce(source,"assert.ok(index.includes('/oauth/google/authorize'),'/oauth/google/authorize');","assert.ok(exceptionRoutes.includes('/oauth/google/authorize'),'/oauth/google/authorize');",'google home authorize responsibility');
});

console.log('exception route contract responsibility migrations applied');
