// Existing completion timestamps are JST wall-clock strings. Explicit offsets
// from imported/legacy data are converted, never interpreted in the host TZ.
export function completionTimeSql(alias=''):string {
  const p=alias?`${alias}.`:'';
  const raw=`COALESCE(${p}completed_at,${p}updated_at,${p}created_at)`;
  return `CASE WHEN substr(${raw},-1)='Z' OR substr(${raw},-6,1) IN ('+','-') THEN datetime(${raw},'+9 hours') ELSE datetime(${raw}) END`;
}

export function completionThreshold(at=Date.now()):string {
  if(!Number.isFinite(at))throw new Error('Invalid completion clock');
  const jst=new Date(at+9*3600000);
  const midnight=Date.UTC(jst.getUTCFullYear(),jst.getUTCMonth(),jst.getUTCDate());
  return new Date(midnight-(jst.getUTCHours()===0?3600000:0)).toISOString().slice(0,19).replace('T',' ');
}

export function checklistCompletionSql(alias:string,at=Date.now()):string {
  // Threshold is generated exclusively from the clock, never request input.
  return `(${alias}.status<>'completed' OR (${completionTimeSql(alias)}) >= '${completionThreshold(at)}')`;
}

export function completionVisible(row:Record<string,unknown>,at=Date.now()):boolean {
  if(row.status!=='completed')return true;
  const raw=String(row.completed_at||row.updated_at||row.created_at||'').replace(' ','T');
  const instant=Date.parse(/(?:Z|[+-]\d{2}:\d{2})$/.test(raw)?raw:raw+'+09:00');
  return Number.isFinite(instant)&&instant>=Date.parse(completionThreshold(at).replace(' ','T')+'+09:00');
}

export function nextCompletionBoundary(at=Date.now()):number {
  const jst=new Date(at+9*3600000);
  return Date.UTC(jst.getUTCFullYear(),jst.getUTCMonth(),jst.getUTCDate()+(jst.getUTCHours()===0?0:1),jst.getUTCHours()===0?1:0)-9*3600000;
}

export async function cleanupCompletedGoods(db:D1Database,at=Date.now()):Promise<void> {
  // Bounded batches retry every five minutes using the existing Cron. Each
  // DELETE rechecks completion state in the same statement, safe after undo.
  const time=completionTimeSql(),threshold=completionThreshold(at);
  for(let batch=0;batch<10;batch++){
   const results=await db.batch(['shopping_items','items'].map(table=>db.prepare(
    `DELETE FROM ${table} WHERE id IN (SELECT id FROM ${table} WHERE status='completed' AND (${time}) < ? ORDER BY (${time}),id LIMIT 100)`
  ).bind(threshold)));
   if(results.every(result=>Number(result.meta?.changes||0)<100))break;
  }
}
