import fs from 'node:fs';

const index=fs.readFileSync('src/index.ts','utf8');
const routes=fs.readFileSync('src/exception-routes.ts','utf8');
const wrangler=fs.readFileSync('wrangler.jsonc','utf8');

if(!/"main"\s*:\s*"src\/index\.ts"/.test(wrangler)) throw new Error('canonical Worker entrypoint must remain src/index.ts');
if(/CALENDAR_PERF_DIAGNOSTICS|CALENDAR_INNER_DIAGNOSTICS/.test(wrangler)) throw new Error('temporary Calendar diagnostics flags must remain removed');
if(fs.existsSync('src/calendar-perf-worker.ts')) throw new Error('temporary Calendar diagnostics wrapper must remain removed');

for(const marker of [
  "import { dispatchEarlyAuthenticatedRoute, dispatchContextPreludeRoute, dispatchContextFallbackRoute } from './exception-routes';",
  'const earlyAuthenticatedResponse=await dispatchEarlyAuthenticatedRoute(request,env,ctx,url);',
  'if(earlyAuthenticatedResponse) return earlyAuthenticatedResponse;',
]) if(!index.includes(marker)) throw new Error(`final entrypoint wiring missing: ${marker}`);
if(index.includes("if(url.pathname==='/app/recurring.php')")) throw new Error('recurring route must not remain inline in index');
if(index.includes('const text =')||index.includes('const esc =')) throw new Error('unused entrypoint helpers must be removed');
for(const forbidden of ['liffEntryPage','googleFulfillment','calendarWatchWebhook','logsPage','itemApi','taskApi','dbSchemaHealth','archiveTaskCompletionStatements']){
  if(index.includes(forbidden)) throw new Error(`stale entrypoint dependency remains: ${forbidden}`);
}
for(const marker of [
  'export async function dispatchEarlyAuthenticatedRoute(request:Request,env:Env,ctx:ExecutionContext,url:URL):Promise<Response|null>{',
  "if(url.pathname!=='/app/recurring.php') return null;",
  "event:'recurring_route_post'",
  'const context=await makeContext(request,env,ctx);',
  'validateLiffNext(url.pathname+url.search)',
  'return redirect(next?',
  'return await recurring(request,context);',
]) if(!routes.includes(marker)) throw new Error(`early recurring behavior marker missing: ${marker}`);
const publicPos=index.indexOf('const publicResponse=');
const earlyPos=index.indexOf('const earlyAuthenticatedResponse=');
const contextPos=index.indexOf('const context=await makeContext');
const preludePos=index.indexOf('const preludeResponse=');
if(!(publicPos>=0&&publicPos<earlyPos&&earlyPos<contextPos&&contextPos<preludePos)) throw new Error('entrypoint dispatcher order changed');
console.log('final index entrypoint contract ok');
