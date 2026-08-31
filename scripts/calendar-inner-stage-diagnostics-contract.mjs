import fs from 'node:fs';

const worker=fs.readFileSync('src/calendar-perf-worker.ts','utf8');
const app=fs.readFileSync('src/app.ts','utf8');
const fail=(message)=>{console.error(`calendar inner-stage diagnostics contract: ${message}`);process.exit(1);};
const must=(condition,message)=>{if(!condition)fail(message);};

for(const stage of ['physical_query_ready','recurrence_projection_ready','row_inputs_ready','physical_map_copies_ready','detail_map_started','physical_detail_map_copies_ready','range_build_started','calendar_html_ready']){
  must(worker.includes(`'${stage}'`),`inner Calendar stage ${stage} must remain explicit`);
}
for(const misleading of ['row_maps_ready','week_layout_started','detail_projection_started']){
  must(!worker.includes(`'${misleading}'`),`coarse property-read marker ${misleading} must not be presented as a semantic renderer boundary`);
}
must(/function observedCalendarQuery\(sql: string\): ObservedCalendarQuery/.test(worker),'inner diagnostics must classify only retained Calendar query boundaries');
must(/type ObservedCalendarQuery = 'physical' \| 'shopping' \| 'items' \| null/.test(worker),'query observation scope must remain limited to physical/shopping/items Calendar reads');
must(/if \(!kind\) return nativeStatement/.test(worker),'unrelated D1 statements, including recurrence materialization batches, must retain native statement identity');
must(/emit\('recurrence_projection_ready'\)/.test(worker),'crossing from recurrence projection into child-row queries must emit a stage marker');
must(/emit\('row_inputs_ready', \{ shopping_items: shoppingRows, items: itemRows \}\)/.test(worker),'row-input marker must expose aggregate counts only');

must(/function inclusiveSpanDays\(row: Record<PropertyKey, unknown>\): number/.test(worker),'physical clone boundary must use an internal bounded span count');
must(/expectedPhysicalCopies = result\.results\.reduce/.test(worker),'physical clone count must be derived before wrapping rows');
must(/ownKeys\(target\)/.test(worker),'map-copy boundary must observe object spread rather than ambiguous property-read order');
must(/physicalCopyCount === expectedPhysicalCopies/.test(worker),'first map boundary must be tied to the expected physical spread count');
must(/physicalCopyCount === expectedPhysicalCopies \+ 1/.test(worker),'detail-map start must be observed only after the recurring portion of the first map pass has returned');
must(/physicalCopyCount === expectedPhysicalCopies \* 2/.test(worker),'physical detail-map boundary must be tied to the second physical spread pass');
must(/physicalDetailReady && !rangeBuildStarted && property === 'start_at'/.test(worker),'range-build marker must occur only after physical detail copies complete');
for(const stage of ['physical_map_copies_ready','detail_map_started','physical_detail_map_copies_ready','range_build_started']){
  must(new RegExp(`emit\\('${stage}', \\{ physical_tasks: physicalCount \\}\\)`).test(worker),`${stage} must expose only physical task count`);
}
must(/return Reflect\.get\(target, property, receiver\)/.test(worker),'row observation must return native values without copying them into diagnostics');

must(/recurrence_span_days_max/.test(worker)&&/recurrence_span_days_total/.test(worker),'snapshot must retain aggregate recurrence template span diagnostics');
must(/julianday\(date\(t\.end_at\)\).*julianday\(date\(t\.start_at\)\)/s.test(worker),'recurrence span aggregate must derive only from template dates');
must(/stage\('calendar_html_ready', \{ status: response\.status, rendered_html_length: null \}\)/.test(worker),'HTML-ready marker must occur immediately after delegated Calendar returns');
must(/const delegatedEnv = context\.member \? calendarStageEnv\(env, stage\) : env;\s*const response = await baseWorker\.fetch\(request, delegatedEnv, ctx\);\s*stage\('calendar_html_ready'/.test(worker),'HTML-ready must bracket the delegated Calendar renderer before post-render diagnostics');

must(/const MAX_CALENDAR_PERF_LOGS = 14/.test(worker),'combined wrapper/inner diagnostics must stay low-double-digit per request');
must(/CALENDAR_PERF_DIAGNOSTICS/.test(worker),'inner diagnostics must remain under the existing explicit feature flag');
must(!/performance\.now\(/.test(worker),'inner stage markers must not masquerade as CPU timers');
must(/not CPU timings/.test(worker),'wall checkpoints must remain documented as coarse non-CPU timing');

const allowlistMatch=worker.match(/const CALENDAR_PERF_ALLOWED_KEYS[\s\S]*?\]\);/);
must(Boolean(allowlistMatch),'inner diagnostics must reuse the explicit calendar_perf allowlist');
const allowlist=allowlistMatch[0];
for(const allowed of ['recurrence_span_days_max','recurrence_span_days_total'])must(allowlist.includes(`'${allowed}'`),`${allowed} must be explicitly allow-listed`);
for(const forbidden of ['message','event','title','description','name','member_name','member_id','family_id','cookie','authorization','token','note','memo','location','email','line_user_id','endpoint','p256dh','auth','sql','query']){
  must(!new RegExp(`['\"]${forbidden}['\"]`,'i').test(allowlist),`forbidden field ${forbidden} must not be caller-loggable`);
}
must(!/console\.(?:log|warn|error)\([^\n]*(?:sql|query|title|description|name|cookie|authorization|token|note|memo|location|email)/i.test(worker),'query text and content-bearing values must never be directly logged');
must(/SQL text and row contents never leave this function/.test(worker),'source must document the privacy boundary around query classification');
must(/without logging row values/.test(worker),'source must document that renderer row values are not logged');

// Removal stays isolated to the temporary Worker diagnostics layer: app/calendar rendering remains untouched.
must(!/calendarStageEnv|observedCalendarQuery|physical_query_ready|recurrence_projection_ready|row_inputs_ready|physical_map_copies_ready|detail_map_started|physical_detail_map_copies_ready|range_build_started|calendar_html_ready/.test(app),'temporary inner diagnostics must not leak into the long-lived app/calendar source');

console.log('calendar inner-stage diagnostics contract: bounded aggregate-only removable map-boundary tracing ok');