import baseWorker from './index';
import { makeContext, taskVisibilitySql } from './app';
import { DEFAULT_FAMILY_TIMEZONE } from './timezone';

type CountRow = {
  c?: number;
  task_span_days_max?: number;
  task_span_days_total?: number;
  recurrence_span_days_max?: number;
  recurrence_span_days_total?: number;
};
type CalendarPerfStage =
  | 'request_start'
  | 'snapshot_ready'
  | 'snapshot_error'
  | 'delegate_start'
  | 'physical_query_ready'
  | 'recurrence_projection_ready'
  | 'row_inputs_ready'
  | 'physical_map_copies_ready'
  | 'detail_map_started'
  | 'range_build_started'
  | 'calendar_html_ready'
  | 'response_ready'
  | 'response_body_complete';

type CalendarPerfRecord = {
  message: 'calendar_perf';
  event: 'calendar_perf';
  trace_id: string;
  stage: CalendarPerfStage;
  month: string;
  view: string;
  wall_checkpoint_ms?: number;
  physical_tasks?: number;
  task_span_days_max?: number;
  task_span_days_total?: number;
  recurrence_rules?: number;
  recurrence_span_days_max?: number;
  recurrence_span_days_total?: number;
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

type CalendarPerfInput = Omit<CalendarPerfRecord, 'message' | 'event'>;
type CalendarPerfLogger = (record: CalendarPerfInput) => void;

// Keep the logger deliberately allow-listed. Search keys are logger-owned, not caller-controlled.
const CALENDAR_PERF_ALLOWED_KEYS = new Set<keyof CalendarPerfRecord>([
  'trace_id','stage','month','view','wall_checkpoint_ms','physical_tasks','task_span_days_max','task_span_days_total','recurrence_rules',
  'recurrence_span_days_max','recurrence_span_days_total','projected_occurrences','materialized_occurrences','shopping_items','items',
  'multi_day_bands','multi_day_rows','rendered_html_length','status','projection_count_source',
]);
const MAX_CALENDAR_PERF_LOGS = 12;

function calendarPerfLog(record: CalendarPerfInput): void {
  const safe: Record<string, unknown> = { message: 'calendar_perf', event: 'calendar_perf' };
  for (const [key, value] of Object.entries(record)) {
    if (CALENDAR_PERF_ALLOWED_KEYS.has(key as keyof CalendarPerfRecord)) safe[key] = value;
  }
  console.log(JSON.stringify(safe));
}

function boundedCalendarPerfLogger(): CalendarPerfLogger {
  let count = 0;
  return (record) => {
    if (count >= MAX_CALENDAR_PERF_LOGS) return;
    count++;
    calendarPerfLog(record);
  };
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
    env.DB.prepare(`SELECT COUNT(*) c,
      COALESCE(MAX(CAST(julianday(COALESCE(date(t.end_at),date(t.start_at),date(t.due_at))) - julianday(COALESCE(date(t.start_at),date(t.due_at),date(t.end_at))) AS INTEGER) + 1),0) task_span_days_max,
      COALESCE(SUM(CAST(julianday(COALESCE(date(t.end_at),date(t.start_at),date(t.due_at))) - julianday(COALESCE(date(t.start_at),date(t.due_at),date(t.end_at))) AS INTEGER) + 1),0) task_span_days_total
      FROM tasks t WHERE t.family_id=? AND ${visibility} AND COALESCE(t.calendar_visible,1)=1 AND COALESCE(date(t.end_at),date(t.start_at),date(t.due_at))>=? AND COALESCE(date(t.start_at),date(t.due_at),date(t.end_at))<=?${viewFilter.sql}`).bind(familyId, memberId, from, to, ...viewBinds),
    env.DB.prepare(`SELECT COUNT(*) c,
      COALESCE(MAX(CASE WHEN t.start_at IS NOT NULL AND t.end_at IS NOT NULL AND julianday(date(t.end_at))>=julianday(date(t.start_at)) THEN CAST(julianday(date(t.end_at))-julianday(date(t.start_at)) AS INTEGER)+1 ELSE 1 END),0) recurrence_span_days_max,
      COALESCE(SUM(CASE WHEN t.start_at IS NOT NULL AND t.end_at IS NOT NULL AND julianday(date(t.end_at))>=julianday(date(t.start_at)) THEN CAST(julianday(date(t.end_at))-julianday(date(t.start_at)) AS INTEGER)+1 ELSE 1 END),0) recurrence_span_days_total
      FROM recurrence_rules r JOIN tasks t ON t.id=r.task_id AND t.family_id=r.family_id WHERE r.family_id=? AND ${visibility} AND r.active=1 AND r.start_date<=? AND (r.end_date IS NULL OR r.end_date>=?)${viewFilter.sql}`).bind(familyId, memberId, to, from, ...viewBinds),
    env.DB.prepare(`SELECT COUNT(*) c FROM recurrence_occurrences o JOIN recurrence_rules r ON r.id=o.recurrence_rule_id AND r.family_id=o.family_id JOIN tasks t ON t.id=r.task_id AND t.family_id=r.family_id WHERE o.family_id=? AND ${visibility} AND o.occurrence_date BETWEEN ? AND ?${viewFilter.sql}`).bind(familyId, memberId, from, to, ...viewBinds),
    env.DB.prepare(`SELECT COUNT(*) c FROM shopping_items s WHERE s.family_id=? AND (s.task_id IS NULL OR EXISTS(SELECT 1 FROM tasks t WHERE t.id=s.task_id AND t.family_id=s.family_id AND ${visibility}))`).bind(familyId, memberId),
    env.DB.prepare(`SELECT COUNT(*) c FROM items i WHERE i.family_id=? AND (i.task_id IS NULL OR EXISTS(SELECT 1 FROM tasks t WHERE t.id=i.task_id AND t.family_id=i.family_id AND ${visibility}))`).bind(familyId, memberId),
  ];
  const results = await env.DB.batch(statements);
  const count = (index: number) => Number((results[index]?.results?.[0] as CountRow | undefined)?.c || 0);
  const taskAggregate = (results[0]?.results?.[0] as CountRow | undefined) || {};
  const recurrenceAggregate = (results[1]?.results?.[0] as CountRow | undefined) || {};
  return {
    physical_tasks: count(0),
    task_span_days_max: Number(taskAggregate.task_span_days_max || 0),
    task_span_days_total: Number(taskAggregate.task_span_days_total || 0),
    recurrence_rules: count(1),
    recurrence_span_days_max: Number(recurrenceAggregate.recurrence_span_days_max || 0),
    recurrence_span_days_total: Number(recurrenceAggregate.recurrence_span_days_total || 0),
    materialized_occurrences: count(2),
    shopping_items: count(3),
    items: count(4),
  };
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

type ObservedCalendarQuery = 'physical' | 'shopping' | 'items' | null;
function observedCalendarQuery(sql: string): ObservedCalendarQuery {
  const normalized = sql.replace(/\s+/g, ' ').trim().toLowerCase();
  if (normalized.includes('select t.*,group_concat(m.name') && normalized.includes('from tasks t') && normalized.includes('t.calendar_visible=1')) return 'physical';
  if (normalized.includes('select s.*,t.title task_title') && normalized.includes('from shopping_items s') && normalized.includes('s.due_date between ? and ?')) return 'shopping';
  if (normalized.includes('select i.*') && normalized.includes('from items i left join tasks pt') && normalized.includes('date(i.due_at) between date(?) and date(?)')) return 'items';
  return null;
}

function inclusiveSpanDays(row: Record<PropertyKey, unknown>): number {
  const start = String(row.start_at || row.due_at || '').slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(start)) return 0;
  const rawEnd = String(row.end_at || start).slice(0, 10);
  const end = /^\d{4}-\d{2}-\d{2}$/.test(rawEnd) && rawEnd >= start ? rawEnd : start;
  return Math.max(1, Math.round((Date.parse(`${end}T12:00:00Z`) - Date.parse(`${start}T12:00:00Z`)) / 86400000) + 1);
}

/**
 * Observes only retained Calendar SELECT boundaries and physical-row clone boundaries needed
 * to locate the 1102 stage. SQL text and row contents never leave this function. Unrelated/native
 * D1 statements retain their identity so recurrence materialization batches are not disturbed.
 *
 * Important: object spread happens once per rendered day while addToMap() copies a physical row.
 * A copy is counted only after its final enumerable property has been read. This brackets the
 * physical portion of the first map pass, the start of the second/detail map pass, and completion
 * of the physical portion of that second pass without logging row values. Recurrence rows are not
 * proxied; absence of detail_map_started after physical_map_copies_ready points at the recurring-row
 * portion of the first map pass.
 */
function calendarStageEnv(env: Env, emit: (stage: CalendarPerfStage, aggregate?: Partial<CalendarPerfInput>) => void): Env {
  let recurrenceReady = false;
  let shoppingRows: number | null = null;
  let itemRows: number | null = null;
  let rowInputsLogged = false;
  let physicalCopyCount = 0;
  let expectedPhysicalCopies = 0;
  let physicalMapReady = false;
  let detailMapStarted = false;
  let physicalDetailReady = false;
  let rangeBuildStarted = false;

  const noteCompletedPhysicalCopy = (physicalCount: number) => {
    physicalCopyCount++;
    if (!physicalMapReady && expectedPhysicalCopies > 0 && physicalCopyCount === expectedPhysicalCopies) {
      physicalMapReady = true;
      emit('physical_map_copies_ready', { physical_tasks: physicalCount });
    } else if (physicalMapReady && !detailMapStarted && physicalCopyCount === expectedPhysicalCopies + 1) {
      detailMapStarted = true;
      emit('detail_map_started', { physical_tasks: physicalCount });
    } else if (detailMapStarted && !physicalDetailReady && physicalCopyCount === expectedPhysicalCopies * 2) {
      physicalDetailReady = true;
    }
  };

  const wrapPhysicalRows = (result: { results?: unknown[] } | null | undefined) => {
    if (!Array.isArray(result?.results) || result.results.length === 0) return result;
    const physicalCount = result.results.length;
    expectedPhysicalCopies = result.results.reduce<number>((total, row) => total + (row && typeof row === 'object' ? inclusiveSpanDays(row as Record<PropertyKey, unknown>) : 0), 0);
    result.results = result.results.map((row) => {
      if (!row || typeof row !== 'object') return row;
      let spreadKeys: Set<PropertyKey> | null = null;
      return new Proxy(row as Record<PropertyKey, unknown>, {
        ownKeys(target) {
          const keys = Reflect.ownKeys(target);
          spreadKeys = new Set(keys.filter((key) => Object.prototype.propertyIsEnumerable.call(target, key)));
          if (spreadKeys.size === 0) {
            spreadKeys = null;
            noteCompletedPhysicalCopy(physicalCount);
          }
          return keys;
        },
        get(target, property, receiver) {
          const spreadRead = Boolean(spreadKeys?.has(property));
          if (spreadRead) {
            spreadKeys!.delete(property);
            if (spreadKeys!.size === 0) {
              spreadKeys = null;
              noteCompletedPhysicalCopy(physicalCount);
            }
          } else if (physicalDetailReady && !rangeBuildStarted && property === 'start_at') {
            rangeBuildStarted = true;
            emit('range_build_started', { physical_tasks: physicalCount });
          }
          return Reflect.get(target, property, receiver);
        },
      });
    });
    return result;
  };

  const afterAll = (kind: Exclude<ObservedCalendarQuery, null>, result: { results?: unknown[] } | null | undefined) => {
    const rows = Array.isArray(result?.results) ? result.results.length : 0;
    if (kind === 'physical') {
      emit('physical_query_ready', { physical_tasks: rows });
      return;
    }
    if (kind === 'shopping') shoppingRows = rows;
    if (kind === 'items') itemRows = rows;
    if (!rowInputsLogged && shoppingRows !== null && itemRows !== null) {
      rowInputsLogged = true;
      emit('row_inputs_ready', { shopping_items: shoppingRows, items: itemRows });
    }
  };

  const db = new Proxy(env.DB as unknown as Record<PropertyKey, unknown>, {
    get(target, property) {
      if (property !== 'prepare') {
        const value = Reflect.get(target, property);
        return typeof value === 'function' ? value.bind(target) : value;
      }
      return (sql: string) => {
        const nativeStatement = (target.prepare as (query: string) => unknown).call(target, sql);
        const kind = observedCalendarQuery(sql);
        if (!kind) return nativeStatement;
        if ((kind === 'shopping' || kind === 'items') && !recurrenceReady) {
          recurrenceReady = true;
          emit('recurrence_projection_ready');
        }
        const wrap = (statement: Record<PropertyKey, unknown>): unknown => new Proxy(statement, {
          get(inner, statementProperty) {
            if (statementProperty === 'bind') {
              return (...args: unknown[]) => wrap((inner.bind as (...values: unknown[]) => Record<PropertyKey, unknown>).apply(inner, args));
            }
            if (statementProperty === 'all') {
              return async (...args: unknown[]) => {
                const result = await (inner.all as (...values: unknown[]) => Promise<{ results?: unknown[] }>).apply(inner, args);
                if (kind === 'physical') wrapPhysicalRows(result);
                afterAll(kind, result);
                return result;
              };
            }
            const value = Reflect.get(inner, statementProperty);
            return typeof value === 'function' ? value.bind(inner) : value;
          },
        });
        return wrap(nativeStatement as Record<PropertyKey, unknown>);
      };
    },
  });

  return new Proxy(env as unknown as Record<PropertyKey, unknown>, {
    get(target, property) {
      if (property === 'DB') return db;
      const value = Reflect.get(target, property);
      return typeof value === 'function' ? value.bind(target) : value;
    },
  }) as unknown as Env;
}

async function instrumentedCalendarFetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
  const started = Date.now();
  const traceId = crypto.randomUUID();
  const log = boundedCalendarPerfLogger();
  const url = new URL(request.url);
  const fallbackTimeZone = String((env as unknown as { APP_TIMEZONE?: string }).APP_TIMEZONE || DEFAULT_FAMILY_TIMEZONE);
  const fallbackMonth = monthFor(url, fallbackTimeZone);
  const view = normalizedView(url);
  log({ trace_id: traceId, stage: 'request_start', month: fallbackMonth, view, wall_checkpoint_ms: Date.now() - started });

  let context: Awaited<ReturnType<typeof makeContext>>;
  try {
    context = await makeContext(request, env, ctx);
  } catch {
    log({ trace_id: traceId, stage: 'snapshot_error', month: fallbackMonth, view, wall_checkpoint_ms: Date.now() - started });
    log({ trace_id: traceId, stage: 'delegate_start', month: fallbackMonth, view, wall_checkpoint_ms: Date.now() - started });
    return baseWorker.fetch(request, env, ctx);
  }

  const timeZone = String(context.member?.family_timezone || fallbackTimeZone);
  const month = monthFor(url, timeZone);
  const { from, to } = renderedRange(month);
  const stage = (name: CalendarPerfStage, aggregate: Partial<CalendarPerfInput> = {}) => log({
    trace_id: traceId,
    stage: name,
    month,
    view,
    wall_checkpoint_ms: Date.now() - started,
    ...aggregate,
  });

  if (context.member) {
    try {
      const counts = await aggregateSnapshot(env, context.member.family_id, context.member.id, from, to, view);
      stage('snapshot_ready', { ...counts, projected_occurrences: null, multi_day_bands: null, multi_day_rows: null });
    } catch {
      stage('snapshot_error');
    }
  }

  // Cloudflare wall clocks are coarse checkpoints only; they are not CPU timings.
  stage('delegate_start');
  const delegatedEnv = context.member ? calendarStageEnv(env, stage) : env;
  const response = await baseWorker.fetch(request, delegatedEnv, ctx);
  stage('calendar_html_ready', { status: response.status, rendered_html_length: null });

  let projectedOccurrences: number | null = null;
  if (context.member && response.ok) {
    try {
      projectedOccurrences = await projectedMaterializedCount(env, context.member.family_id, context.member.id, from, to, view);
    } catch {
      projectedOccurrences = null;
    }
  }
  stage('response_ready', {
    status: response.status,
    projected_occurrences: projectedOccurrences,
    projection_count_source: projectedOccurrences === null ? undefined : 'post_materialized_active_occurrences',
    rendered_html_length: null,
  });

  if (!response.body) {
    stage('response_body_complete', { status: response.status, rendered_html_length: 0 });
    return response;
  }

  const [clientBody, measuredBody] = response.body.tee();
  ctx.waitUntil(responseByteLength(measuredBody).then((length) => {
    stage('response_body_complete', { status: response.status, rendered_html_length: length });
  }).catch(() => {
    stage('response_body_complete', { status: response.status, rendered_html_length: null });
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