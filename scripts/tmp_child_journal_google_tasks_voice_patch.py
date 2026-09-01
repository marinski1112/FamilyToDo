from pathlib import Path


def replace_one(path: str, old: str, new: str, label: str) -> None:
    p = Path(path)
    source = p.read_text()
    count = source.count(old)
    if count != 1:
        raise SystemExit(f'{label}: expected one exact anchor, found {count}')
    p.write_text(source.replace(old, new, 1))


tasks = Path('src/google-tasks.ts')
source = tasks.read_text()

import_anchor = "import { utcNow } from './timezone';\n"
import_line = "import { recordExternalChildJournalGoogleTasksDomain } from './child-journal-google-tasks';\n"
if source.count(import_anchor) != 1 or import_line in source:
    raise SystemExit('Child Journal Google Tasks import anchor mismatch')
source = source.replace(import_anchor, import_anchor + import_line, 1)

old_union = "export type GoogleVoiceCommand={marked:false}|{marked:true;type:'SHOPPING_ADD';name:string;quantity:number}|{marked:true;type:'SHOPPING_COMPLETE';name:string}|{marked:true;type:'TASK_CREATE';title:string}|{marked:true;type:'TASK_COMPLETE';title:string}|{marked:true;type:'FAMILY_LOG_RECORD';subjectId:number;logType:string;detailCode:string|null;amount:number|null;unit:string|null;occurredOffsetMinutes:number;quickActionId?:number}|{marked:true;type:'NEEDS_REVIEW';reason:string};\n"
new_union = "export type GoogleVoiceCommand={marked:false}|{marked:true;type:'SHOPPING_ADD';name:string;quantity:number}|{marked:true;type:'SHOPPING_COMPLETE';name:string}|{marked:true;type:'TASK_CREATE';title:string}|{marked:true;type:'TASK_COMPLETE';title:string}|{marked:true;type:'FAMILY_LOG_RECORD';subjectId:number;logType:string;detailCode:string|null;amount:number|null;unit:string|null;occurredOffsetMinutes:number;quickActionId?:number}|{marked:true;type:'CHILD_JOURNAL_RECORD';subjectId:number;kind:'HEIGHT'|'WEIGHT'|'MEMO';amount:number|null;valueText:string|null;occurredOffsetMinutes:number}|{marked:true;type:'NEEDS_REVIEW';reason:string};\n"
if source.count(old_union) != 1:
    raise SystemExit('Google voice command union anchor mismatch')
source = source.replace(old_union, new_union, 1)

subject_anchor = " let subject:GoogleVoiceSubject|undefined,named=false;for(const candidate of [...subjects].sort((a,b)=>b.name.length-a.name.length)){if(body===candidate.name||body.startsWith(candidate.name+' ')){subject=candidate;named=true;body=body.slice(candidate.name.length).trim();break;}}if(!subject){const eligible=subjects.filter(x=>x.subjectKind!=='PET');if(eligible.length!==1)return {marked:true,type:'NEEDS_REVIEW',reason:eligible.length?'AMBIGUOUS_SUBJECT':'SUBJECT_REQUIRED'};subject=eligible[0];}if(subject.subjectKind==='PET'&&!named)return {marked:true,type:'NEEDS_REVIEW',reason:'PET_SUBJECT_REQUIRED'};\n"
journal_parser = subject_anchor + """ if(body.startsWith('成長日記')){
  if(subject.subjectKind==='PET')return {marked:true,type:'NEEDS_REVIEW',reason:'UNSUPPORTED_JOURNAL_SUBJECT'};
  let journalMatch:RegExpExecArray|null;
  if((journalMatch=/^成長日記 身長 (\d{1,3}(?:\.\d)?)$/.exec(body))){const amount=Number(journalMatch[1]);if(!Number.isFinite(amount)||amount<20||amount>250)return {marked:true,type:'NEEDS_REVIEW',reason:'INVALID_JOURNAL_HEIGHT'};return {marked:true,type:'CHILD_JOURNAL_RECORD',subjectId:subject.id,kind:'HEIGHT',amount,valueText:null,occurredOffsetMinutes};}
  if((journalMatch=/^成長日記 体重 (\d{1,3}(?:\.\d{1,2})?)$/.exec(body))){const amount=Number(journalMatch[1]);if(!Number.isFinite(amount)||amount<0.2||amount>300)return {marked:true,type:'NEEDS_REVIEW',reason:'INVALID_JOURNAL_WEIGHT'};return {marked:true,type:'CHILD_JOURNAL_RECORD',subjectId:subject.id,kind:'WEIGHT',amount,valueText:null,occurredOffsetMinutes};}
  if((journalMatch=/^成長日記 メモ (.+)$/.exec(body))){const valueText=journalMatch[1].trim();if(!valueText||valueText.length>500)return {marked:true,type:'NEEDS_REVIEW',reason:'INVALID_JOURNAL_MEMO'};return {marked:true,type:'CHILD_JOURNAL_RECORD',subjectId:subject.id,kind:'MEMO',amount:null,valueText,occurredOffsetMinutes};}
  return {marked:true,type:'NEEDS_REVIEW',reason:'UNSUPPORTED_JOURNAL_COMMAND'};
 }
"""
if source.count(subject_anchor) != 1:
    raise SystemExit('Google voice subject resolution anchor mismatch')
source = source.replace(subject_anchor, journal_parser, 1)

family_log_branch = "  if(command.type==='FAMILY_LOG_RECORD'){const member={id:Number(a.member_id),family_id:Number(a.family_id)} as any,made=command.quickActionId?await recordConfiguredQuickActionDomain(env,member,command.quickActionId):await recordGoogleVoiceFamilyLogDomain(env,member,command);if(!made.ok)throw new Error('FAMILY_LOG_DOMAIN_REJECTED');if(existing)await env.DB.prepare(\"UPDATE external_google_voice_commands SET external_etag=?,command_type='FAMILY_LOG_RECORD',target_type='family_log',target_id=?,status='EXECUTED',error_code=NULL,updated_at=? WHERE id=? AND status<>'EXECUTED'\").bind(String(item.etag||''),made.id,n,existing.id).run();else await env.DB.prepare(\"INSERT INTO external_google_voice_commands(family_id,member_id,account_id,external_tasklist_id,external_task_id,external_etag,external_due,command_type,target_type,target_id,status,created_at,updated_at) VALUES(?,?,?,?,?,?,?,'FAMILY_LOG_RECORD','family_log',?,'EXECUTED',?,?)\").bind(a.family_id,a.member_id,a.id,a.tasklist_id,externalId,String(item.etag||''),String(item.due||'')||null,made.id,n,n).run();return 'command';}\n"
journal_branch = "  if(command.type==='CHILD_JOURNAL_RECORD'){const member={id:Number(a.member_id),family_id:Number(a.family_id)} as any,input=command.kind==='HEIGHT'?{kind:'HEIGHT' as const,amount:Number(command.amount),valueText:null,occurredOffsetMinutes:command.occurredOffsetMinutes}:command.kind==='WEIGHT'?{kind:'WEIGHT' as const,amount:Number(command.amount),valueText:null,occurredOffsetMinutes:command.occurredOffsetMinutes}:{kind:'MEMO' as const,amount:null,valueText:String(command.valueText||''),occurredOffsetMinutes:command.occurredOffsetMinutes},made=await recordExternalChildJournalGoogleTasksDomain(env,member,command.subjectId,input);if(!made.ok)throw new Error('CHILD_JOURNAL_DOMAIN_REJECTED');if(existing)await env.DB.prepare(\"UPDATE external_google_voice_commands SET external_etag=?,command_type='FAMILY_LOG_RECORD',target_type='family_log',target_id=?,status='EXECUTED',error_code=NULL,updated_at=? WHERE id=? AND status<>'EXECUTED'\").bind(String(item.etag||''),made.id,n,existing.id).run();else await env.DB.prepare(\"INSERT INTO external_google_voice_commands(family_id,member_id,account_id,external_tasklist_id,external_task_id,external_etag,external_due,command_type,target_type,target_id,status,created_at,updated_at) VALUES(?,?,?,?,?,?,?,'FAMILY_LOG_RECORD','family_log',?,'EXECUTED',?,?)\").bind(a.family_id,a.member_id,a.id,a.tasklist_id,externalId,String(item.etag||''),String(item.due||'')||null,made.id,n,n).run();return 'command';}\n"
if source.count(family_log_branch) != 1:
    raise SystemExit('Google voice Family Log apply anchor mismatch')
source = source.replace(family_log_branch, journal_branch + family_log_branch, 1)
tasks.write_text(source)

replace_one(
    'scripts/feature-contract-bundle.mjs',
    "    ['google-tasks-voice',['node','scripts/google-tasks-voice-contract.mjs']],\n",
    "    ['google-tasks-voice',['node','scripts/google-tasks-voice-contract.mjs']],\n    ['child-journal-google-tasks-voice',['node','scripts/child-journal-google-tasks-voice-contract.mjs']],\n",
    'Google integrations Child Journal Google Tasks contract',
)

docs = Path('docs/GOOGLE_TASKS_VOICE_BRIDGE_WAVE115.md')
doc_source = docs.read_text()
anchor = "External edits update only an unedited imported task. A local edit creates `CONFLICT`. External deletion creates a `TOMBSTONE` and never hard-deletes the Family TODO task. Existing Family TODO tasks are not backfilled and names are never used for matching.\n\n"
section = """External edits update only an unedited imported task. A local edit creates `CONFLICT`. External deletion creates a `TOMBSTONE` and never hard-deletes the Family TODO task. Existing Family TODO tasks are not backfilled and names are never used for matching.

## Child Journal voice commands

The same marker-gated Google Tasks bridge can record variable-value Child Growth Journal entries with zero Gemini inference. A command becomes a journal entry only when **成長日記と明示**されている場合です。Ordinary Family Log commands are not silently promoted into the journal.

Supported command titles are deliberately bounded:

- `FT 成長日記 身長 82.5` → 82.5cm
- `FT 成長日記 体重 10.25` → 10.25kg
- `FT 成長日記 メモ 初めて靴を履いた`
- With multiple child subjects, prefix the subject name, for example `FT ゆうま 成長日記 身長 82.5`.

The existing relative-time phrase remains available, for example `FT ゆうま 1時間前 成長日記 体重 10.2`. The supported range is **最大24時間前** and future-time phrases are rejected for review. Height is bounded to 20–250cm, weight to 0.2–300kg, and memo text to 500 characters. PET subjects are rejected for Child Journal commands.

Journal commands are stored as canonical `family_logs` plus journal metadata. The existing Google Tasks command receipt remains `FAMILY_LOG_RECORD`, preserving the current external-task ID/etag idempotency without a new database command enum. When the dedicated Child Journal Google Calendar projection is available, these records are also eligible for the existing **FamilyToDo → Google Calendar** one-way journal sync.

"""
if doc_source.count(anchor) != 1:
    raise SystemExit('Google Tasks voice docs insertion anchor mismatch')
docs.write_text(doc_source.replace(anchor, section, 1))
