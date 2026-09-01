import fs from 'node:fs';

const migration=fs.readFileSync(new URL('../migrations/0048_child_growth_journal.sql',import.meta.url),'utf8');
const journal=fs.readFileSync(new URL('../src/child-journal.ts',import.meta.url),'utf8');
const schema=fs.readFileSync(new URL('../src/child-journal-schema.ts',import.meta.url),'utf8');
const app=fs.readFileSync(new URL('../src/app.ts',import.meta.url),'utf8');
const index=fs.readFileSync(new URL('../src/index.ts',import.meta.url),'utf8');
const manifest=fs.readFileSync(new URL('./regression-manifest.mjs',import.meta.url),'utf8');

for(const marker of [
  'CREATE TABLE IF NOT EXISTS family_log_journal_entries',
  'log_id INTEGER PRIMARY KEY',
  "journal_kind IN ('CHILD','PET')",
  "entry_kind IN ('MILESTONE','MEASUREMENT','MEMO')",
  'google_sync_enabled INTEGER NOT NULL DEFAULT 1',
  'trg_family_log_journal_tenant_insert',
  'trg_family_log_journal_tenant_update',
  "NEW.journal_kind='CHILD' AND s.subject_kind IN ('BABY','CHILD')",
  "NEW.journal_kind='PET' AND s.subject_kind='PET'",
  'family_log_journal_tenant_mismatch',
])if(!migration.includes(marker))throw new Error(`Child Journal migration contract missing: ${marker}`);

for(const marker of [
  "subject_kind IN ('BABY','CHILD')",
  "detailCode='JOURNAL_MEMO'",
  "detailCode=`JOURNAL_${milestone.code}`",
  "detailCode='JOURNAL_HEIGHT'",
  "detailCode='JOURNAL_WEIGHT'",
  "INSERT INTO family_log_journal_entries",
  "journal_kind,entry_kind,milestone_code,google_sync_enabled",
  "logActivity(ctx,'CREATED','family_log',logId,{source:'child_journal',entry_kind:entryKind})",
  '📔 成長日記',
  '立った',
  '歩いた',
  '最初の歯',
  '身長',
  '体重',
])if(!journal.includes(marker))throw new Error(`Child Journal implementation contract missing: ${marker}`);

if(!schema.includes("const FOUNDATION_TABLES = ['family_log_journal_entries'] as const"))throw new Error('Child Journal schema guard must use an allow-listed foundation table');
if(!journal.includes('childJournalFoundationReady(ctx.env.DB)'))throw new Error('Child Journal writes must fail closed until migration 0048 is present');
if(!journal.includes('データベース更新の反映待ちです。'))throw new Error('Child Journal page must remain usable while migration 0048 is pending');
if(!journal.includes("FROM family_log_journal_entries j JOIN family_logs l ON l.id=j.log_id"))throw new Error('Child Journal calendar must read only explicitly journal-promoted Family Log rows');
if(!journal.includes("j.family_id=? AND j.subject_id=?"))throw new Error('Child Journal read model must be family/subject scoped');
if(!journal.includes("l.family_id=j.family_id"))throw new Error('Child Journal read model must preserve tenant join integrity');
if(journal.includes('external_calendar_accounts')||journal.includes('calendar_sync_outbox'))throw new Error('Foundation must not reuse the schedule Google Calendar binding/outbox');
if(journal.includes('location')||journal.includes('latitude')||journal.includes('longitude'))throw new Error('Child Journal foundation must not introduce location handling');
if(/source:'child_journal'[^}]*note/.test(journal))throw new Error('Child Journal activity metadata must not include journal note content');

if(!app.includes('export async function logActivity('))throw new Error('Child Journal must reuse the canonical activity log boundary');
if(!app.includes('href="/app/child_journal.php"'))throw new Error('Family Log must expose the Child Journal entry point');
if(!index.includes("from './child-journal'"))throw new Error('Worker must import the Child Journal module');
if(!index.includes("url.pathname==='/api/child-journal'"))throw new Error('Worker must route the Child Journal write boundary');
if(!index.includes("url.pathname==='/app/child_journal.php'"))throw new Error('Worker must route the Child Journal page');
if(!manifest.includes("['child-growth-journal','node scripts/child-growth-journal-contract.mjs']"))throw new Error('Child Journal regression contract must be active');

for(const forbidden of ['CHILD_JOURNAL','googleCalendar','calendar_id']){
  if(journal.includes(forbidden))throw new Error(`Google Calendar journal sync is intentionally deferred from foundation: ${forbidden}`);
}

console.log('child growth journal foundation contract ok');
