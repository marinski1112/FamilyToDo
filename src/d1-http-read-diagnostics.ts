// One in eight requests is measured to keep the diagnostic's own writes bounded.
export const HTTP_READ_SAMPLE_RATE=8;

export function httpReadRouteGroup(path:string,method:string):string {
  const api=path.startsWith('/api/')||path.startsWith('/app/api/');
  const page=path.startsWith('/app/');
  const area=/location/.test(path)?'location':
    /calendar/.test(path)?'calendar':
    /family.log|journal|child/.test(path)?'family_log':
    /message|photo.transfer/.test(path)?'messages':
    /shopping|checklist|item|goods/.test(path)?'goods':
    /settings/.test(path)?'settings':'other';
  return `${api?'api':page?'page':'public'}_${area}_${method==='GET'?'GET':'WRITE'}`;
}

// Only fixed source categories are persisted. SQL text and bound values are not.
export function familyLogReadQueryGroup(sql:string):string {
  if(/ROW_NUMBER\s*\(\)\s*OVER\s*\(PARTITION BY subject_id/i.test(sql))return 'latest_milk';
  if(/SELECT\s+l\.\*,ib\.source/i.test(sql))return 'timeline';
  if(/WITH\s+periods\s*\(period,start_at\)/i.test(sql))return 'housework';
  if(/FROM\s+tasks\s+WHERE\s+family_id=\?\s+AND\s+visibility_scope='FAMILY'/i.test(sql))return 'physical_tasks';
  if(/FROM\s+family_logs\b/i.test(sql))return 'family_logs_other';
  if(/\b(?:FROM|JOIN)\s+recurrence_(?:rules|occurrences)\b/i.test(sql))return 'recurrence';
  if(/FROM\s+family_log_subjects\b/i.test(sql))return 'subjects';
  if(/FROM\s+family_log_quick_actions\b/i.test(sql))return 'quick_actions';
  if(/FROM\s+family_log_timers\b/i.test(sql))return 'timers';
  if(/FROM\s+tasks\b/i.test(sql))return 'tasks_other';
  return 'other';
}

/** Best-effort sampled counters. Never records the request path or query text. */
export function trackHttpD1Reads(env:Env,routeGroup:string){
  let rowsRead=0,rowsWritten=0,measuredQueries=0,unmeasuredFirst=0,flushed=false;
  const originals=new WeakMap<object,{statement:D1PreparedStatement;sql:string}>();
  const familyLogQueries=new Map<string,{rowsRead:number;rowsWritten:number;queries:number}>();
  const count=(result:unknown,sql:string)=>{
    const meta=(result as {meta?:{rows_read?:number;rows_written?:number}}|null)?.meta;
    if(!meta)return;
    const read=Number(meta.rows_read),written=Number(meta.rows_written);
    if(Number.isFinite(read)&&read>=0)rowsRead+=read;
    if(Number.isFinite(written)&&written>=0)rowsWritten+=written;
    measuredQueries++;
    if(routeGroup==='page_family_log_GET'){
      const label=familyLogReadQueryGroup(sql),entry=familyLogQueries.get(label)||{rowsRead:0,rowsWritten:0,queries:0};
      if(Number.isFinite(read)&&read>=0)entry.rowsRead+=read;
      if(Number.isFinite(written)&&written>=0)entry.rowsWritten+=written;
      entry.queries++;
      familyLogQueries.set(label,entry);
    }
  };
  const wrap=(statement:D1PreparedStatement,sql:string):D1PreparedStatement=>{
    const wrapped=new Proxy(statement,{get(target,key,receiver){
      if(key==='bind')return (...args:unknown[])=>wrap(target.bind(...args),sql);
      if(key==='all')return async(...args:unknown[])=>{const result=await (target.all as (...values:unknown[])=>Promise<unknown>)(...args);count(result,sql);return result;};
      if(key==='run')return async()=>{const result=await target.run();count(result,sql);return result;};
      if(key==='first')return async(...args:unknown[])=>{
        if(!args.length&&(/\bLIMIT\s+1\b/i.test(sql)||/^\s*SELECT\s+COUNT\s*\(/i.test(sql))){
          const result=await target.all();count(result,sql);return result.results[0]??null;
        }
        unmeasuredFirst++;
        return (target.first as (...values:unknown[])=>Promise<unknown>)(...args);
      };
      const value=Reflect.get(target,key,receiver);
      return typeof value==='function'?value.bind(target):value;
    }});
    originals.set(wrapped,{statement,sql});
    return wrapped;
  };
  const db=new Proxy(env.DB,{get(target,key,receiver){
    if(key==='prepare')return (sql:string)=>wrap(target.prepare(sql),sql);
    if(key==='batch')return async(statements:D1PreparedStatement[])=>{
      const result=await target.batch(statements.map(statement=>originals.get(statement)?.statement||statement));
      for(let i=0;i<result.length;i++)count(result[i],originals.get(statements[i])?.sql||'');
      return result;
    };
    const value=Reflect.get(target,key,receiver);
    return typeof value==='function'?value.bind(target):value;
  }}) as D1Database;
  return {
    env:{...env,DB:db} as Env,
    async flush(){
      if(flushed)return;
      flushed=true;
      if(!measuredQueries&&!unmeasuredFirst)return;
      const now=new Date().toISOString(),bucket=`${now.slice(0,13)}:00:00Z`;
      const save=async(label:string,read:number,written:number,queries:number,unmeasured:number)=>
        env.DB.prepare(`INSERT INTO d1_http_read_diagnostics
          (bucket_utc,route_group,samples,rows_read,rows_written,measured_queries,unmeasured_first,updated_at)
          VALUES(?,?,1,?,?,?,?,?)
          ON CONFLICT(bucket_utc,route_group) DO UPDATE SET
          samples=samples+1,rows_read=rows_read+excluded.rows_read,
          rows_written=rows_written+excluded.rows_written,
          measured_queries=measured_queries+excluded.measured_queries,
          unmeasured_first=unmeasured_first+excluded.unmeasured_first,
          updated_at=excluded.updated_at`)
          .bind(bucket,label,Math.floor(read),Math.floor(written),queries,unmeasured,now).run();
      try{
        await save(routeGroup,rowsRead,rowsWritten,measuredQueries,unmeasuredFirst);
        // At most four extra writes per sampled Family Log page. Rows below 100
        // are not useful for identifying a 10k-row request. Query rows overlap
        // the page total, so they must never be summed into account totals.
        const largest=[...familyLogQueries].filter(([,value])=>value.rowsRead>=100)
          .sort((a,b)=>b[1].rowsRead-a[1].rowsRead).slice(0,4);
        for(const [label,value] of largest){
          await save(`query_family_log_${label}`,value.rowsRead,value.rowsWritten,value.queries,0);
        }
      }catch{/* Diagnostics must not fail a request. */}
    },
  };
}

export async function cleanupHttpD1ReadDiagnostics(db:D1Database){
  try{
    await db.prepare(`DELETE FROM d1_http_read_diagnostics WHERE rowid IN (
      SELECT rowid FROM d1_http_read_diagnostics
      WHERE bucket_utc<strftime('%Y-%m-%dT%H:00:00Z','now','-7 days') ORDER BY bucket_utc LIMIT 100
    )`).run();
  }catch{/* Best effort. */}
}
