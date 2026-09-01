import fs from 'node:fs';

const migration=fs.readFileSync(new URL('../migrations/0049_child_journal_google_calendar.sql',import.meta.url),'utf8');
const sync=fs.readFileSync(new URL('../src/child-journal-calendar.ts',import.meta.url),'utf8');
const journal=fs.readFileSync(new URL('../src/child-journal.ts',import.meta.url),'utf8');
const index=fs.readFileSync(new URL('../src/index.ts',import.meta.url),'utf8');
const manifest=fs.readFileSync(new URL('./regression-manifest.mjs',import.meta.url),'utf8');

for(const marker of [
  'CREATE TABLE IF NOT EXISTS child_journal_calendar_accounts',
  'CREATE TABLE IF NOT EXISTS child_journal_calendar_links',
  'CREATE TABLE IF NOT EXISTS child_journal_calendar_outbox',
  'trg_child_journal_follow_log_subject',
  'trg_child_journal_calendar_enqueue_insert',
  'trg_child_journal_calendar_enqueue_metadata_update',
  'trg_child_journal_calendar_enqueue_log_update',
  'trg_child_journal_calendar_enqueue_metadata_delete',
  "operation TEXT NOT NULL CHECK (operation IN ('CREATE','UPDATE','DELETE'))",
])if(!migration.includes(marker))throw new Error(`Child Journal calendar migration missing: ${marker}`);

for(const marker of [
  "const JOURNAL_CALENDAR_NAME='Family TODO - 成長日記'",
  "JOIN external_calendar_accounts a ON a.family_id=o.family_id AND a.provider=? AND a.status='ACTIVE'",
  "extendedProperties:{private:{familyTodoChildJournalLogId:String(row.log_id)}}",
  'processChildJournalCalendarOutbox',
  'childJournalCalendarStatus',
  "summary:`📔 ${String(row.subject_name||'子ども')}：${label}`",
])if(!sync.includes(marker))throw new Error(`Child Journal calendar worker missing: ${marker}`);

for(const forbidden of [
  'external_calendar_links',
  'calendar_sync_outbox',
  'calendar_sync_state',
  'processCalendarInbound',
  'applyInbound',
  'calendarWatch',
  'location:',
])if(sync.includes(forbidden))throw new Error(`Child Journal calendar must stay isolated from schedule/inbound projection: ${forbidden}`);

if(!journal.includes("ctx.executionContext?.waitUntil(processChildJournalCalendarOutbox(ctx.env,5,member.family_id))"))throw new Error('Child Journal create must wake dedicated calendar outbox');
if(!journal.includes('FamilyToDo → Googleの一方向で同期します'))throw new Error('Child Journal UI must disclose one-way sync semantics');
if(!index.includes("import { processChildJournalCalendarOutbox } from './child-journal-calendar';"))throw new Error('Worker must import Child Journal calendar processor');
if(!index.includes('ctx.waitUntil(processChildJournalCalendarOutbox(env));'))throw new Error('Worker cron must process Child Journal calendar outbox');
if(!manifest.includes("['child-journal-google-calendar','node scripts/child-journal-google-calendar-contract.mjs']"))throw new Error('Child Journal calendar regression contract must be active');

console.log('child journal google calendar contract ok');
