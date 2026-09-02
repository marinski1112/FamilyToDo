type Row=Record<string,unknown>;

export type RecurrenceOccurrenceAggregateState={
  occurrenceId:number;
  familyId:number;
  isComplete:boolean;
  completedBy:number|null;
  now:string;
};

/**
 * recurrence_occurrence_completions is the authoritative per-member completion
 * ledger. Older D1 databases can retain an earlier recurrence_occurrences shape
 * because the compatibility migration used CREATE TABLE IF NOT EXISTS.
 * Synchronize denormalized summary columns only when they actually exist.
 */
export async function updateRecurrenceOccurrenceAggregateCompat(
  db:D1Database,
  state:RecurrenceOccurrenceAggregateState,
):Promise<void>{
  const info=await db.prepare('PRAGMA table_info(recurrence_occurrences)').all<Row>();
  const columns=new Set(info.results.map(row=>String(row.name||'')));
  if(!columns.has('status'))throw new Error('recurrence_occurrences.status is required');

  const assignments:string[]=['status=?'];
  const values:unknown[]=[state.isComplete?'completed':'pending'];
  if(columns.has('completed_by')){
    assignments.push('completed_by=?');
    values.push(state.isComplete?state.completedBy:null);
  }
  if(columns.has('completed_at')){
    assignments.push('completed_at=?');
    values.push(state.isComplete?state.now:null);
  }
  if(columns.has('updated_at')){
    assignments.push('updated_at=?');
    values.push(state.now);
  }
  values.push(state.occurrenceId,state.familyId);
  await db.prepare(`UPDATE recurrence_occurrences SET ${assignments.join(',')} WHERE id=? AND family_id=?`).bind(...values).run();
}
