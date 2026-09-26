/** Aggregate only fixed scheduled-job labels and D1 meta counters. */
export function trackScheduledD1Reads(env:Env,job:string){
  let rowsRead=0,rowsWritten=0,measuredQueries=0,unmeasuredFirst=0,flushed=false;
  const originals=new WeakMap<object,D1PreparedStatement>();
  const count=(result:unknown)=>{
    const meta=(result as {meta?:{rows_read?:number;rows_written?:number}}|null)?.meta;
    if(!meta)return;
    const read=Number(meta.rows_read),written=Number(meta.rows_written);
    if(Number.isFinite(read)&&read>=0)rowsRead+=read;
    if(Number.isFinite(written)&&written>=0)rowsWritten+=written;
    measuredQueries++;
  };
  const wrap=(statement:D1PreparedStatement,sql:string):D1PreparedStatement=>{
    const wrapped=new Proxy(statement,{get(target,key,receiver){
      if(key==='bind')return (...args:unknown[])=>wrap(target.bind(...args),sql);
      if(key==='all')return async(...args:unknown[])=>{const result=await (target.all as (...values:unknown[])=>Promise<unknown>)(...args);count(result);return result;};
      if(key==='run')return async()=>{const result=await target.run();count(result);return result;};
      if(key==='first')return async(...args:unknown[])=>{
        // A single-row aggregate or LIMIT 1 has the same returned row under
        // all(), which exposes rows_read. Leave other first() calls untouched.
        if(!args.length&&(/\bLIMIT\s+1\b/i.test(sql)||/^\s*SELECT\s+COUNT\s*\(/i.test(sql))){
          const result=await target.all();count(result);return result.results[0]??null;
        }
        unmeasuredFirst++;
        return (target.first as (...values:unknown[])=>Promise<unknown>)(...args);
      };
      const value=Reflect.get(target,key,receiver);
      return typeof value==='function'?value.bind(target):value;
    }});
    originals.set(wrapped,statement);
    return wrapped;
  };
  const db=new Proxy(env.DB,{get(target,key,receiver){
    if(key==='prepare')return (sql:string)=>wrap(target.prepare(sql),sql);
    if(key==='batch')return async(statements:D1PreparedStatement[])=>{
      const result=await target.batch(statements.map(statement=>originals.get(statement)||statement));
      for(const item of result)count(item);
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
      try{
        await env.DB.prepare(`INSERT INTO d1_scheduled_read_diagnostics
          (bucket_utc,job,runs,rows_read,rows_written,measured_queries,unmeasured_first,updated_at)
          VALUES(?,?,1,?,?,?,?,?)
          ON CONFLICT(bucket_utc,job) DO UPDATE SET
          runs=runs+1,rows_read=rows_read+excluded.rows_read,
          rows_written=rows_written+excluded.rows_written,
          measured_queries=measured_queries+excluded.measured_queries,
          unmeasured_first=unmeasured_first+excluded.unmeasured_first,
          updated_at=excluded.updated_at`)
          .bind(bucket,job,Math.floor(rowsRead),Math.floor(rowsWritten),measuredQueries,unmeasuredFirst,now).run();
      }catch{/* Diagnostics are best effort and must not fail the scheduled job. */}
    },
  };
}

export async function cleanupScheduledD1ReadDiagnostics(db:D1Database){
  try{
    await db.prepare(`DELETE FROM d1_scheduled_read_diagnostics WHERE rowid IN (
      SELECT rowid FROM d1_scheduled_read_diagnostics
      WHERE bucket_utc<strftime('%Y-%m-%dT%H:00:00Z','now','-7 days') ORDER BY bucket_utc LIMIT 100
    )`).run();
  }catch{/* Diagnostics must not block application maintenance. */}
}
