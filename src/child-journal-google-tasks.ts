import type { CurrentMember } from './types';
import { childJournalFoundationReady } from './child-journal-schema';
import { DEFAULT_FAMILY_TIMEZONE, addWallClockMinutes, familyNow, utcNow } from './timezone';

type Row=Record<string,unknown>;
export type ChildJournalGoogleTasksEntry=
  | {kind:'HEIGHT';amount:number;valueText:null;occurredOffsetMinutes:number}
  | {kind:'WEIGHT';amount:number;valueText:null;occurredOffsetMinutes:number}
  | {kind:'MEMO';amount:null;valueText:string;occurredOffsetMinutes:number};

export async function recordExternalChildJournalGoogleTasksDomain(env:Env,member:CurrentMember,subjectId:number,input:ChildJournalGoogleTasksEntry):Promise<{ok:boolean;id?:number}>{
  if(!Number.isInteger(subjectId)||subjectId<=0||!Number.isInteger(input.occurredOffsetMinutes)||input.occurredOffsetMinutes<0||input.occurredOffsetMinutes>1440)return {ok:false};
  if(!(await childJournalFoundationReady(env.DB)))return {ok:false};
  const [subject,family]=await Promise.all([
    env.DB.prepare("SELECT id FROM family_log_subjects WHERE id=? AND family_id=? AND active=1 AND subject_kind IN ('BABY','CHILD') LIMIT 1").bind(subjectId,member.family_id).first<Row>(),
    env.DB.prepare('SELECT timezone FROM families WHERE id=? LIMIT 1').bind(member.family_id).first<Row>(),
  ]);
  if(!subject)return {ok:false};
  const timezone=String(family?.timezone||env.APP_TIMEZONE||DEFAULT_FAMILY_TIMEZONE),createdAt=familyNow(timezone),occurredAt=addWallClockMinutes(createdAt,-input.occurredOffsetMinutes);
  let logType:'HEIGHT'|'WEIGHT'|'MEMO',detailCode:string,amount:number|null=null,unit:string|null=null,valueText:string|null=null,entryKind:'MEASUREMENT'|'MEMO';
  if(input.kind==='HEIGHT'){
    const value=Math.round(Number(input.amount)*10)/10;if(!Number.isFinite(value)||value<20||value>250)return {ok:false};
    logType='HEIGHT';detailCode='JOURNAL_HEIGHT';amount=value;unit='cm';entryKind='MEASUREMENT';
  }else if(input.kind==='WEIGHT'){
    const value=Math.round(Number(input.amount)*100)/100;if(!Number.isFinite(value)||value<0.2||value>300)return {ok:false};
    logType='WEIGHT';detailCode='JOURNAL_WEIGHT';amount=value;unit='kg';entryKind='MEASUREMENT';
  }else{
    const text=String(input.valueText||'').trim();if(!text||text.length>500)return {ok:false};
    logType='MEMO';detailCode='JOURNAL_MEMO';valueText=text;entryKind='MEMO';
  }
  const inserted=await env.DB.prepare('INSERT INTO family_logs(family_id,subject_id,log_type,occurred_at,detail_code,amount,unit,duration_minutes,value_text,note,linked_task_id,linked_occurrence_id,created_by,created_at,updated_at,deleted_at) VALUES(?,?,?,?,?,?,?,NULL,?,NULL,NULL,NULL,?,?,?,NULL)')
    .bind(member.family_id,subjectId,logType,occurredAt,detailCode,amount,unit,valueText,member.id,createdAt,createdAt).run();
  const logId=Number(inserted.meta.last_row_id||0);if(!logId)return {ok:false};
  try{
    await env.DB.prepare("INSERT INTO family_log_journal_entries(log_id,family_id,subject_id,journal_kind,entry_kind,milestone_code,google_sync_enabled,created_by,created_at,updated_at) VALUES(?,?,?,'CHILD',?,NULL,1,?,?,?)")
      .bind(logId,member.family_id,subjectId,entryKind,member.id,createdAt,createdAt).run();
  }catch(error){await env.DB.prepare('DELETE FROM family_logs WHERE id=? AND family_id=?').bind(logId,member.family_id).run().catch(()=>{});throw error;}
  await env.DB.prepare('INSERT INTO activity_logs(family_id,member_id,action,target_type,target_id,metadata,occurred_at) VALUES(?,?,?,?,?,?,?)')
    .bind(member.family_id,member.id,'CREATED','family_log',logId,JSON.stringify({source:'google_tasks_child_journal',entry_kind:entryKind}),utcNow()).run().catch(()=>{});
  return {ok:true,id:logId};
}
