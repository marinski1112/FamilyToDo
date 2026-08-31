import baseWorker from './index';
import { makeContext, taskVisibilitySql } from './app';
import { DEFAULT_FAMILY_TIMEZONE } from './timezone';

type CountRow = { c?: number };
type CalendarPerfStage = 'request_start' | 'snapshot_ready' | 'snapshot_error' | 'delegate_start' | 'response_ready' | 'response_body_complete';

type CalendarPerfRecord = {
  event: 'calendar_perf';
  trace_id: string;
  stage: CalendarPerfStage;
  month: string;
  view: string;
  wall_checkpoint_ms?: number;
  physical_tasks?: number;
  recurrence_rules?: number;
  projected_occurrences?: number | null;
  materialized_occurrences?: number;
  shopping_items?: number;
  items?: number;
  multi_day_bands?: number | null;
  multi_day_rows?: number | null;
  rendered_html_length?: number | null;
  status?: number;
  projection_count_source?: 'post_materialized_active_occurrences';
};

// Keep the logger deliberately allow-listed. Do not add content-bearing fields here.
const CALENDAR_PERF_ALLOWED_KEYS = new Set<keyof CalendarPerfRecord>([
  'event','trace_id','stage','month','view','wall_checkpoint_ms','physical_tasks','recurrence_rules',
  'projected_occurrences','materialized_occurrences','shopping_items','items','multi_day_bands','multi_day_rows',
  'rendered_html_length','status','projection_count_source',
]);

function calendarPerfLog(record: CalendarPerfRecord): void {
  const safe: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(record)) {
    if (CALENDAR_PERF_ALLOWED_KEYS.has(key as keyof CalendarPerfRecord)) safe[key] = value;
  }
  console.log(JSON.stringify(safe));
}

function diagnosticsEnabled(env: Env): boolean {
  return String((env as unknown as { CALENDAR_PERF_DIAGNOSTICS?: string }).CALENDAR_PERF_DIAGNOSTICS || '') === '1';
}

function monthFor(url: URL, timeZone: string): string {
  const requested = String(url.searchParams.get('month') || '');
  if (/^(?:20\d{2}|2100)-(?:0[1-9]|1[0-2])$/.test(requested)) return requested;
  return new Intl.DateTimeFormat('sv-SE', { timeZone, year: 'numeric', month: '2-digit' }).format(new Date());
}

function renderedRange(month: string): { from: string; to: string } {
  const [year, value] = month.split('-').map(Number);
  const first = new Date(Date.UTC(year, value - 1, 1));
  const start = new Date(first);
  start.setUTCDate(1 - first.getUTCDay());
  const end = new Date(Date.UTC(year, value, 0));
  end.setUTCDate(end.getUTCDate() + (6 - end.getUTCDay()));
  return { from: start.toISOString().slice(0, 10), to: end.toISOString().slice(0, 10) };
}

function normalizedView(url: URL): 'all' | 'family' | 'assigned' | 'private' {
  const requested = String(url.searchParams.get('view') || 'all');
  return requested === 'family' || requested === 'assigned' || requested === 'private' ? requested : 'all';
}

function viewPredicate(view: 'all' | 'family' | 'assigned' | 'private'): { sql: string; binds: number[] } {
  if (view === 'family') return { sql: " AND t.visibility_scope='FAMILY'", binds: [] };
  if (view === 'assigned') return { sql: " AND t.visibility_scope='FAMILY' AND EXISTS (SELECT 1 FROM task_assignees viewer_ta WHERE viewer_ta.task_id=t.id AND viewer_ta.member_id=?)", binds: [] };
  if (view === 'private') return { sql: " AND t.visibility_scope='PRIVATE' AND t.private_owner_id=?", binds: [] };
  return { sql: '', binds: [] };
}

async function aggregateSnapshot(env: Env, familyId: number, memberId: number, from: string, to: string, view: 'all' | 'family' | 'assigned' | 'private') {
  const viewFilter = viewPredicate(view);
  const viewBinds = view === 'assigned' || view === 'private' ? [memberId] : viewFilter.binds;
  const visibility = taskVisibilitySql('t');
  const statements = [
    env.DB.prepare(`SELECT COUNT(*) c FROM tasks t WHERE t.family_id=? AND ${visibility} AND COALESCE(t.calendar_visible,1)=1 AND COALESCE(date(t.end_at),date(t.start_at),date(t.due_at))>=? AND COALESCE(date(t.start_at),date(t.due_at),date(t.end_at))<=?${viewFilter.sql}`).bind(familyId, memberId, from, to, ...viewBinds),
    env.DB.prepare(`SELECT COUNT(*) c FROM recurrence_rules r JOIN tasks t ON t.id=r.task_id AND t.family_id=r.family_id WHERE r.family_id=? AND ${visibility} AND r.active=1 AND r.start_date<=? AND (r.end_date IS NULL OR r.end_date>=?)${viewFilter.sql}`).bind(familyId, memberId, to, from, ...viewBinds),
    env.DB.prepare(`SELECT COUNT(*) c FROM recurrence_occurrences o JOIN recurrence_rules r ON r.id=o.recurrence_rule_id AND r.family_id=o.family_id JOIN tasks t ON t.id=r.task_id AND t.family_id=r.family_id WHERE o.family_id=? AND ${visibility} AND o.occurrence_date BETWEEN ? AND ?${viewFilter.sql}`).bind(familyId, memberId, from, to, ...viewBinds),
    env.DB.prepare(`SELECT COUNT(*) c FROM shopping_items s WHERE s.family_id=? AND (s.task_id IS NULL OR EXISTS(SELECT 1 FROM tasks t WHERE t.id=s.task_id AND t.family_id=s.family_id AND ${visibility}))`).bind(familyId, memberId),
    env.DB.prepare(`SELECT COUNT(*) c FROM items i WHERE i.family_id=? AND (i.task_id IS NULL OR EXISTS(SELECT 1 FROM tasks t WHERE t.id=i.task_id AND t.family_id=i.family_id AND ${visibility}))`).bind(familyId, memberId),
  ];
  const results = await env.DB.batch(statements);
  const count = (index: number) => Number((results[index]?.results?.[0] as CountRow | undefined)?.c || 0);
  return { physical_tasks: count(0), recurrence_rules: count(1), materialized_occurrences: count(2), shopping_items: count(3), items: count(4) };
}

async function projectedMaterializedCount(env: Env, familyId: number, memberId: number, from: string, to: string, view: 'all' | 'family' | 'assigned' | 'private'): Promise<number> {
  const viewFilter = viewPredicate(view);
  const viewBinds = view === 'assigned' || view === 'private' ? [memberId] : viewFilter.binds;
  const row = await env.DB.prepare(`SELECT COUNT(*) c FROM recurrence_occurrences o JOIN recurrence_rules r ON r.id=o.recurrence_rule_id AND r.family_id=o.family_id JOIN tasks t ON t.id=r.task_id AND t.family_id=r.family_id WHERE o.family_id=? AND ${taskVisibilitySql('t')} AND o.occurrence_date BETWEEN ? AND ? AND r.active=1 AND r.start_date<=? AND (r.end_date IS NULL OR r.end_date>=?) AND COALESCE(o.status,'pending')<>'excluded'${viewFilter.sql}`).bind(familyId, memberId, from, to, to, from, ...viewBinds).first<CountRow>();
  return Number(row?.c || 0);
}

async function responseByteLength(stream: ReadableStream<Uint8Array>): Promise<number> {
  const reader = stream.getReader();
  let bytes = 0;
  for (;;) {
    const next = await reader.read();
    if (next.done) return bytes;
    bytes += next.value.byteLength;
  }
}

async function instrumentedCalendarFetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
  const started = Date.now();
  const traceId = crypto.randomUUID();
  const url = new URL(request.url);
  const context = await makeContext(request, env, ctx);
  const timeZone = String(context.member?.family_timezone || (env as unknown as { APP_TIMEZONE?: string }).APP_TIMEZONE || DEFAULT_FAMILY_TIMEZONE);
  const month = monthFor(url, timeZone);
  const view = normalizedView(url);
  const { from, to } = renderedRange(month);

  calendarPerfLog({ event: 'calendar_perf', trace_id: traceId, stage: 'request_start', month, view, wall_checkpoint_ms: Date.now() - started });

  if (context.member) {
    try {
      const counts = await aggregateSnapshot(env, context.member.family_id, context.member.id, from, to, view);
      calendarPerfLog({
        event: 'calendar_perf', trace_id: traceId, stage: 'snapshot_ready', month, view,
        wall_checkpoint_ms: Date.now() - started, ...counts, projected_occurrences: null,
        multi_day_bands: null, multi_day_rows: null,
      });
    } catch {
      calendarPerfLog({ event: 'calendar_perf', trace_id: traceId, stage: 'snapshot_error', month, view, wall_checkpoint_ms: Date.now() - started });
    }
  }

  // Cloudflare wall clocks are coarse checkpoints only; they are not CPU timings.
  calendarPerfLog({ event: 'calendar_perf', trace_id: traceId, stage: 'delegate_start', month, view, wall_checkpoint_ms: Date.now() - started });
  const response = await baseWorker.fetch(request, env, ctx);

  let projectedOccurrences: number | null = null;
  if (context.member && response.ok) {
    try {
      projectedOccurrences = await projectedMaterializedCount(env, context.member.family_id, context.member.id, from, to, view);
    } catch {
      projectedOccurrences = null;
    }
  }
  calendarPerfLog({
    event: 'calendar_perf', trace_id: traceId, stage: 'response_ready', month, view,
    wall_checkpoint_ms: Date.now() - started, status: response.status,
    projected_occurrences: projectedOccurrences,
    projection_count_source: projectedOccurrences === null ? undefined : 'post_materialized_active_occurrences',
    rendered_html_length: null,
  });

  if (!response.body) {
    calendarPerfLog({ event: 'calendar_perf', trace_id: traceId, stage: 'response_body_complete', month, view, status: response.status, rendered_html_length: 0 });
    return response;
  }

  const [clientBody, measuredBody] = response.body.tee();
  ctx.waitUntil(responseByteLength(measuredBody).then((length) => {
    calendarPerfLog({ event: 'calendar_perf', trace_id: traceId, stage: 'response_body_complete', month, view, status: response.status, rendered_html_length: length });
  }).catch(() => {
    calendarPerfLog({ event: 'calendar_perf', trace_id: traceId, stage: 'response_body_complete', month, view, status: response.status, rendered_html_length: null });
  }));
  return new Response(clientBody, { status: response.status, statusText: response.statusText, headers: response.headers });
}

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);
    if (diagnosticsEnabled(env) && request.method === 'GET' && url.pathname === '/app/calendar.php') {
      return instrumentedCalendarFetch(request, env, ctx);
    }
    return baseWorker.fetch(request, env, ctx);
  },
  async scheduled(controller: ScheduledController, env: Env, ctx: ExecutionContext) {
    return baseWorker.scheduled(controller, env, ctx);
  },
};
