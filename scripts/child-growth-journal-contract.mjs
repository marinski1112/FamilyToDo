import fs from 'node:fs';
import { retainedAppContractSource } from './retained-app-contract-source.mjs';

const familyLogMigration=fs.readFileSync(new URL('../migrations/0017_wave75_family_log.sql',import.meta.url),'utf8');
const migration=fs.readFileSync(new URL('../migrations/0048_child_growth_journal.sql',import.meta.url),'utf8');
const journal=fs.readFileSync(new URL('../src/child-journal.ts',import.meta.url),'utf8');
const schema=fs.readFileSync(new URL('../src/child-journal-schema.ts',import.meta.url),'utf8');
const app=retainedAppContractSource();
const index=fs.readFileSync(new URL('../src/index.ts',import.meta.url),'utf8');
const pageRoutes=fs.readFileSync(new URL('../src/page-routes.ts',import.meta.url),'utf8');
const apiRoutes=fs.readFileSync(new URL('../src/context-api-routes.ts',import.meta.url),'utf8');
const manifest=fs.readFileSync(new URL('./regression-manifest.mjs',import.meta.url),'utf8');

for(const marker of [
  'CREATE TABLE IF NOT EXISTS family_log_journal_entries','log_id INTEGER PRIMARY KEY',"journal_kind IN ('CHILD','PET')","entry_kind IN ('MILESTONE','MEASUREMENT','MEMO')",'google_sync_enabled INTEGER NOT NULL DEFAULT 1','trg_family_log_journal_tenant_insert','trg_family_log_journal_tenant_update',"NEW.journal_kind='CHILD' AND s.subject_kind IN ('BABY','CHILD')","NEW.journal_kind='PET' AND s.subject_kind='PET'",'family_log_journal_tenant_mismatch',
])if(!migration.includes(marker))throw new Error(`Child Journal migration contract missing: ${marker}`);
for(const marker of [
  "subject_kind IN ('BABY','CHILD')","detailCode='JOURNAL_MEMO'","detailCode=`JOURNAL_${milestone.code}`","detailCode='JOURNAL_HEIGHT'","detailCode='JOURNAL_WEIGHT'","INSERT INTO family_log_journal_entries","journal_kind,entry_kind,milestone_code,google_sync_enabled","logActivity(ctx,'CREATED','family_log',logId,{source:'child_journal',entry_kind:entryKind})",'📔 成長日記','立った','歩いた','最初の歯','身長','体重',
])if(!journal.includes(marker))throw new Error(`Child Journal implementation contract missing: ${marker}`);
if(!familyLogMigration.includes('CREATE TABLE IF NOT EXISTS family_log_subjects'))throw new Error('Family Log subject schema must remain explicit');
if(familyLogMigration.includes('sort_order'))throw new Error('Wave75 family_log_subjects schema does not define sort_order; Child Journal must not depend on it');
if(!journal.includes("FROM family_log_subjects WHERE family_id=? AND active=1 AND subject_kind IN ('BABY','CHILD') ORDER BY id"))throw new Error('Child Journal page must order subjects only by columns guaranteed by the retained Family Log schema');
if(journal.includes('COALESCE(sort_order,9999)'))throw new Error('Child Journal page must not query nonexistent family_log_subjects.sort_order');
if(!schema.includes("const FOUNDATION_TABLES = ['family_log_journal_entries'] as const"))throw new Error('Child Journal schema guard must use an allow-listed foundation table');
if(!journal.includes('childJournalFoundationReady(ctx.env.DB)'))throw new Error('Child Journal writes must fail closed until migration 0048 is present');
if(!journal.includes('データベース更新の反映待ちです。'))throw new Error('Child Journal page must remain usable while migration 0048 is pending');
if(!journal.includes("FROM family_log_journal_entries j JOIN family_logs l ON l.id=j.log_id"))throw new Error('Child Journal calendar must read only explicitly journal-promoted Family Log rows');
if(!journal.includes("j.family_id=? AND j.subject_id=?"))throw new Error('Child Journal read model must be family/subject scoped');
if(!journal.includes("l.family_id=j.family_id"))throw new Error('Child Journal read model must preserve tenant join integrity');
if(journal.includes('external_calendar_accounts')||journal.includes('calendar_sync_outbox'))throw new Error('Foundation must not reuse the schedule Google Calendar binding/outbox');
if(journal.includes('location')||journal.includes('latitude')||journal.includes('longitude'))throw new Error('Child Journal foundation must not introduce location handling');
if(/source:'child_journal'[^}]*note/.test(journal))throw new Error('Child Journal activity metadata must not include journal note content');
if(!journal.includes('processChildJournalCalendarOutbox(ctx.env,5,member.family_id)'))throw new Error('Child Journal save boundary must retain dedicated calendar outbox processing');
if(journal.includes('childJournalCalendarStatus')||journal.includes('📅 Google Calendar')||journal.includes('syncCard'))throw new Error('Child Journal page must not render the presentation-only Google Calendar status card');
if(!journal.includes('<input type="hidden" name="kind" value="MEMO">'))throw new Error('Primary Child Journal manual form must save through the retained MEMO/JOURNAL_MEMO path');
if(!journal.includes('<label>タイトル</label><input type="text" name="title" maxlength="120" required'))throw new Error('Primary Child Journal manual form must require a title');
if(!journal.includes('<label>メモ</label><textarea name="note" maxlength="2000"'))throw new Error('Primary Child Journal manual form must retain memo input');
if(journal.includes('<select name="kind" required>')||journal.includes('<input type="number" name="value"'))throw new Error('Primary Child Journal manual form must not expose legacy kind/numeric controls');
if(!journal.includes("else if(form.has('title')){if(!title)return new Response('タイトルを入力してください。',{status:400});valueText=title;}"))throw new Error('New manual title must be validated and persisted as family_logs.value_text');
if(!journal.includes("else if(kind==='HEIGHT')")||!journal.includes("else if(kind==='WEIGHT')")||!journal.includes('if(MILESTONES[kind])'))throw new Error('Legacy structured Child Journal API compatibility must remain available');
if(!journal.includes('aria-label="前の月" title="前の月" href="/app/child_journal.php?month=${shiftMonth(month,-1)}${subjectId?`&subject_id=${subjectId}`:\'\'}">‹</a>'))throw new Error('Child Journal previous-month control must remain query-preserving and have an accessible name');
if(!journal.includes('aria-label="次の月" title="次の月" href="/app/child_journal.php?month=${shiftMonth(month,1)}${subjectId?`&subject_id=${subjectId}`:\'\'}">›</a>'))throw new Error('Child Journal next-month control must remain query-preserving and have an accessible name');
if(!app.includes('export async function logActivity('))throw new Error('Child Journal must reuse the canonical activity log boundary');
if(!app.includes('href="/app/child_journal.php"'))throw new Error('Family Log must expose the Child Journal entry point');
if(!pageRoutes.includes("from './child-journal'")||!apiRoutes.includes("from './child-journal'"))throw new Error('Child Journal page/API dispatchers must import the Child Journal module');
if(!apiRoutes.includes("url.pathname==='/api/child-journal'"))throw new Error('Worker must route the Child Journal write boundary');
if(!pageRoutes.includes("url.pathname==='/app/child_journal.php'"))throw new Error('Worker must route the Child Journal page');
if(!manifest.includes("['child-growth-journal','node scripts/child-growth-journal-contract.mjs']"))throw new Error('Child Journal regression contract must be active');
for(const forbidden of ['CHILD_JOURNAL','googleCalendar','calendar_id'])if(journal.includes(forbidden))throw new Error(`Google Calendar journal sync is intentionally deferred from foundation: ${forbidden}`);
console.log('child growth journal foundation + title/memo manual form contract ok');
