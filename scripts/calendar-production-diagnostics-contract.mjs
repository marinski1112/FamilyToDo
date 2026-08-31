import fs from 'node:fs';

const worker=fs.readFileSync('src/calendar-perf-worker.ts','utf8');
const wrangler=fs.readFileSync('wrangler.jsonc','utf8');

const fail=(message)=>{console.error(`calendar production diagnostics contract: ${message}`);process.exit(1);};
const must=(condition,message)=>{if(!condition)fail(message);};

must(/"main"\s*:\s*"src\/calendar-perf-worker\.ts"/.test(wrangler),'temporary diagnostics wrapper must be the Worker entry');
must(/"CALENDAR_PERF_DIAGNOSTICS"\s*:\s*"1"/.test(wrangler),'diagnostics flag must be explicit while the trace is being collected');
must(/request\.method === 'GET' && url\.pathname === '\/app\/calendar\.php'/.test(worker),'instrumentation must be scoped to GET /app/calendar.php');
must(/const traceId = crypto\.randomUUID\(\)/.test(worker),'one opaque trace id must be created per instrumented request');
must(/event: 'calendar_perf'/.test(worker),'structured calendar_perf logs are required');
must(/wall_checkpoint_ms/.test(worker),'coarse wall checkpoint field is required');
must(/not CPU timings/.test(worker),'source must explicitly document that wall checkpoints are not CPU timings');
must(!/performance\.now\(/.test(worker),'performance.now must not be presented as Calendar CPU timing');
must(/response\.body\.tee\(\)/.test(worker) && !/response\.clone\(\)\.text\(\)/.test(worker),'HTML length must be measured without decoding/cloning the rendered HTML string');
must(/projection_count_source: projectedOccurrences === null \? undefined : 'post_materialized_active_occurrences'/.test(worker),'projected occurrence aggregate must disclose its materialized-post-render source');
must(/try \{\s*context = await makeContext\(request, env, ctx\);\s*\} catch \{[\s\S]*?return baseWorker\.fetch\(request, env, ctx\);\s*\}/.test(worker),'diagnostic context lookup failures must fall back through the canonical Worker error boundary');

const allowlistMatch=worker.match(/const CALENDAR_PERF_ALLOWED_KEYS[\s\S]*?\]\);/);
must(Boolean(allowlistMatch),'calendar_perf logger must retain a removable explicit key allowlist');
const allowlist=allowlistMatch[0];
for(const forbidden of ['title','description','member_name','member_id','family_id','cookie','authorization','token','note','location','email','line_user_id']){
  must(!new RegExp(`['\"]${forbidden}['\"]`,'i').test(allowlist),`sensitive/content field ${forbidden} must never be log-allowlisted`);
}

must(!/request\.headers/.test(worker),'Calendar diagnostics must not inspect or log request headers');
must(!/getSessionCookie|cookie/i.test(allowlist),'cookies must not enter the log allowlist');
must(!/console\.(?:log|warn|error)\([^\n]*(?:title|description|member_name|cookie|authorization|token|note|location|email)/i.test(worker),'direct sensitive/content logging is forbidden');

for(const key of ['physical_tasks','recurrence_rules','projected_occurrences','materialized_occurrences','shopping_items','items','multi_day_bands','multi_day_rows','rendered_html_length']){
  must(allowlist.includes(`'${key}'`),`aggregate key ${key} must remain represented`);
}

// Static call sites include mutually-exclusive success/error branches. A normal request emits
// request_start + one snapshot result + delegate_start + response_ready + body_complete (5 lines);
// a context-lookup failure emits only request_start + snapshot_error + delegate_start (3 lines).
const logCalls=(worker.match(/calendarPerfLog\(/g)||[]).length;
must(logCalls<=12,`Calendar diagnostics source must stay low-double-digit and runtime-bounded (found ${logCalls} static sites)`);
for(const stage of ['request_start','snapshot_ready','snapshot_error','delegate_start','response_ready','response_body_complete']){
  must(worker.includes(`stage: '${stage}'`),`named stage ${stage} must remain explicit`);
}
must(/return baseWorker\.fetch\(request, env, ctx\)/.test(worker),'all non-instrumented routes must delegate unchanged');
must(/return baseWorker\.scheduled\(controller, env, ctx\)/.test(worker),'scheduled handler must delegate unchanged');

console.log('calendar production diagnostics contract: ok');
