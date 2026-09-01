import type { CurrentMember } from './types';
import { childJournalFoundationReady } from './child-journal-schema';
import { DEFAULT_FAMILY_TIMEZONE, familyNow } from './timezone';

type Row = Record<string, unknown>;
export type ChildJournalVoiceMilestone = 'STAND'|'FIRST_STEP'|'FIRST_TOOTH'|'TOOTH';

const MILESTONE_LABELS: Record<ChildJournalVoiceMilestone,string> = {
  STAND:'立った',
  FIRST_STEP:'歩いた',
  FIRST_TOOTH:'最初の歯',
  TOOTH:'歯',
};

export function childJournalVoiceMilestoneLabel(code:ChildJournalVoiceMilestone):string {
  return MILESTONE_LABELS[code];
}

export async function recordExternalChildJournalMilestoneDomain(env:Env,member:CurrentMember,subjectId:number,code:ChildJournalVoiceMilestone):Promise<{ok:boolean;logId?:number}> {
  if(!MILESTONE_LABELS[code]||!Number.isInteger(subjectId)||subjectId<=0)return {ok:false};
  if(!(await childJournalFoundationReady(env.DB)))return {ok:false};
  const subject=await env.DB.prepare("SELECT id FROM family_log_subjects WHERE id=? AND family_id=? AND active=1 AND subject_kind IN ('BABY','CHILD') LIMIT 1")
    .bind(subjectId,member.family_id).first<Row>();
  if(!subject)return {ok:false};
  const timezone=String(member.family_timezone||env.APP_TIMEZONE||DEFAULT_FAMILY_TIMEZONE),timestamp=familyNow(timezone),label=MILESTONE_LABELS[code];
  const inserted=await env.DB.prepare('INSERT INTO family_logs(family_id,subject_id,log_type,occurred_at,detail_code,amount,unit,duration_minutes,value_text,note,linked_task_id,linked_occurrence_id,created_by,created_at,updated_at,deleted_at) VALUES(?,?,?, ?,?,NULL,NULL,NULL,?,NULL,NULL,NULL,?,?,?,NULL)')
    .bind(member.family_id,subjectId,'MEMO',timestamp,`JOURNAL_${code}`,label,member.id,timestamp,timestamp).run();
  const logId=Number(inserted.meta.last_row_id||0);if(!logId)return {ok:false};
  try{
    await env.DB.prepare("INSERT INTO family_log_journal_entries(log_id,family_id,subject_id,journal_kind,entry_kind,milestone_code,google_sync_enabled,created_by,created_at,updated_at) VALUES(?,?,?,'CHILD','MILESTONE',?,1,?,?,?)")
      .bind(logId,member.family_id,subjectId,code,member.id,timestamp,timestamp).run();
  }catch(error){await env.DB.prepare('DELETE FROM family_logs WHERE id=? AND family_id=?').bind(logId,member.family_id).run().catch(()=>{});throw error;}
  await env.DB.prepare('INSERT INTO activity_logs(family_id,member_id,action,target_type,target_id,metadata,occurred_at) VALUES(?,?,?,?,?,?,?)')
    .bind(member.family_id,member.id,'CREATED','family_log',logId,JSON.stringify({source:'google_home_child_journal',entry_kind:'MILESTONE'}),timestamp).run().catch(()=>{});
  return {ok:true,logId};
}
