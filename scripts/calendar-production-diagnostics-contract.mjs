import fs from 'node:fs';

const worker=fs.readFileSync('src/calendar-perf-worker.ts','utf8');
const app=fs.readFileSync('src/app.ts','utf8');
const wrangler=fs.readFileSync('wrangler.jsonc','utf8');

const fail=(message)=>{console.error(`calendar production diagnostics contract: ${message}`);process.exit(1);};
const must=(condition,message)=>{if(!condition)fail(message);};

must(/"main"\s*:\s*"src\/calendar-perf-worker\.ts"/.test(wrangler),'temporary diagnostics wrapper must be the Worker entry');
must(/"CALENDAR_PERF_DIAGNOSTICS"\s*:\s*"1"/.test(wrangler),'diagnostics flag must be explicit while the trace is being collected');
const runWorkerFirstMatch=wrangler.match(/"run_worker_first"\s*:\s*\[([\s\S]*?)\]/);
must(Boolean(runWorkerFirstMatch),'assets.run_worker_first must remain an explicit array while Calendar diagnostics are active');
must(/"\/app\/calendar\.php"/.test(runWorkerFirstMatch[1]),'GET /app/calendar.php must explicitly run the diagnostics Worker before static-asset routing');
must(/request\.method === 'GET' && url\.pathname === '\/app\/calendar\.php'/.test(worker),'instrumentation must be scoped to GET /app/calendar.php');
must(/const traceId = crypto\.randomUUID\(\)/.test(worker),'one opaque trace id must be created per instrumented request');
must(/message: 'calendar_perf', event: 'calendar_perf'/.test(worker),'calendar_perf search keys must be fixed inside the logger');
must(/const safe: Record<string, unknown> = \{ message: 'calendar_perf', event: 'calendar_perf' \}/.test(worker),'searchable message/event must be logger-owned rather than request/content-derived');
must(/wall_checkpoint_ms/.test(worker),'coarse wall checkpoint field is required');
must(/not CPU timings/.test(worker),'source must explicitly document that wall checkpoints are not CPU timings');
must(!/performance\.now\(/.test(worker),'performance.now must not be presented as Calendar CPU timing');
must(/response\.body\.tee\(\)/.test(worker) && !/response\.clone\(\)\.text\(\)/.test(worker),'HTML length must be measured without decoding/cloning the rendered HTML string');
must(/projection_count_source: projectedOccurrences === null \? undefined : 'post_materialized_active_occurrences'/.test(worker),'projected occurrence aggregate must disclose its materialized-post-render source');
must(/try \{\s*context = await makeContext\(request, env, ctx\);\s*\} catch \{[\s\S]*?return baseWorker\.fetch\(request, env, ctx\);\s*\}/.test(worker),'diagnostic context lookup failures must fall back through the canonical Worker error boundary');

const allowlistMatch=worker.match(/const CALENDAR_PERF_ALLOWED_KEYS[\s\S]*?\]\);/);
must(Boolean(allowlistMatch),'calendar_perf logger must retain a removable explicit key allowlist');
const allowlist=allowlistMatch[0];
for(const forbidden of ['message','event','title','description','member_name','member_id','family_id','cookie','authorization','token','note','location','email','line_user_id']){
  must(!new RegExp(`['\"]${forbidden}['\"]`,'i').test(allowlist),`caller-controlled or sensitive/content field ${forbidden} must never be log-allowlisted`);
}

must(!/request\.headers/.test(worker),'Calendar diagnostics must not inspect or log request headers');
must(!/getSessionCookie|cookie/i.test(allowlist),'cookies must not enter the log allowlist');
must(!/console\.(?:log|warn|error)\([^\n]*(?:title|description|member_name|cookie|authorization|token|note|location|email)/i.test(worker),'direct sensitive/content logging is forbidden');

for(const key of ['physical_tasks','task_span_days_max','task_span_days_total','recurrence_rules','projected_occurrences','materialized_occurrences','shopping_items','items','multi_day_bands','multi_day_rows','rendered_html_length']){
  must(allowlist.includes(`'${key}'`),`aggregate key ${key} must remain represented`);
}
must(/task_span_days_max/.test(worker)&&/task_span_days_total/.test(worker),'Calendar snapshot must expose bounded aggregate task-span diagnostics');
must(/julianday\(COALESCE\(date\(t\.end_at\),date\(t\.start_at\),date\(t\.due_at\)\)\)/.test(worker),'task-span diagnostics must be calculated in the existing aggregate snapshot query');

// The current renderer expands every physical task across its raw stored span before laying out the visible month.
// Keep this check while 1102 is under investigation so a long-span task cannot silently remain invisible to diagnostics.
const addToMapMatch=app.match(/const addToMap=\([\s\S]*?\n  \};/);
must(Boolean(addToMapMatch),'Calendar renderer addToMap implementation must remain detectable during the 1102 investigation');
must(/for\(;d<=last;d\.setUTCDate\(d\.getUTCDate\(\)\+1\)\)/.test(addToMapMatch[0]),'task-span diagnostics are temporary evidence for the current raw-span renderer and should be revisited when that loop is fixed');

must(/const MAX_CALENDAR_PERF_LOGS = 12/.test(worker),'Calendar diagnostics must retain an explicit low-double-digit runtime cap');
must(/if \(count >= MAX_CALENDAR_PERF_LOGS\) return/.test(worker),'runtime logger must enforce the cap rather than relying on static call-site counting');
for(const stage of ['request_start','snapshot_ready','snapshot_error','delegate_start','response_ready','response_body_complete']){
  must(worker.includes(`'${stage}'`),`named stage ${stage} must remain explicit`);
}
must(/return baseWorker\.fetch\(request, env, ctx\)/.test(worker),'all non-instrumented routes must delegate unchanged');
must(/return baseWorker\.scheduled\(controller, env, ctx\)/.test(worker),'scheduled handler must delegate unchanged');

console.log('calendar production diagnostics contract: searchable privacy-safe runtime-bounded diagnostics ok');
