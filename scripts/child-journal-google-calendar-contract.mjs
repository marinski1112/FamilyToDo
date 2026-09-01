import fs from 'node:fs';

const migration=fs.readFileSync(new URL('../migrations/0049_child_journal_google_calendar.sql',import.meta.url),'utf8');
const projector=fs.readFileSync(new URL('../src/child-journal-calendar.ts',import.meta.url),'utf8');
const journal=fs.readFileSync(new URL('../src/child-journal.ts',import.meta.url),'utf8');
const googleCalendar=fs.readFileSync(new URL('../src/google-calendar.ts',import.meta.url),'utf8');
const manifest=fs.readFileSync(new URL('./regression-manifest.mjs',import.meta.url),'utf8');

for(const marker of [
  'child_journal_calendar_bindings',
  "purpose TEXT NOT NULL DEFAULT 'CHILD_JOURNAL'",
  'child_journal_calendar_links',
  'child_journal_calendar_outbox',
  'trg_child_journal_calendar_binding_tenant_insert',
  'trg_child_journal_calendar_binding_tenant_update',
  'trg_child_journal_calendar_outbox_tenant_insert',
  'trg_child_journal_calendar_outbox_tenant_update',
  'trg_child_journal_calendar_link_tenant_insert',
  'trg_child_journal_calendar_link_tenant_update',
  "j.journal_kind='CHILD' AND j.google_sync_enabled=1",
])if(!migration.includes(marker))throw new Error(`Child Journal calendar migration contract missing: ${marker}`);
if(/ALTER\s+TABLE\s+external_calendar_accounts/i.test(migration))throw new Error('Child Journal must not repurpose the schedule calendar account schema');

for(const marker of [
  "const PURPOSE='CHILD_JOURNAL'",
  "const CALENDAR_NAME='Family TODO 成長日記'",
  "googleApi('/calendars',access",
  'child_journal_calendar_bindings',
  'child_journal_calendar_links',
  'child_journal_calendar_outbox',
  'enqueueChildJournalCalendarSync',
  'processChildJournalCalendarOutbox',
  'pendingChildJournalCalendarSyncCount',
  "description:'FamilyToDo 成長日記'",
  'familyTodoJournalLogId',
  'start:{date}',
  'end:{date:plusDay(date)}',
])if(!projector.includes(marker))throw new Error(`Child Journal calendar projector contract missing: ${marker}`);

const eventStart=projector.indexOf('export function childJournalCalendarEvent');
const eventEnd=projector.indexOf('\n\nasync function ensureBinding',eventStart);
if(eventStart<0||eventEnd<0)throw new Error('Child Journal calendar event boundary missing');
const eventSlice=projector.slice(eventStart,eventEnd).toLowerCase();
for(const sensitive of ['note','value_text','location','latitude','longitude','created_by','member_id']){
  if(eventSlice.includes(sensitive))throw new Error(`Child Journal Google event leaks excluded field: ${sensitive}`);
}

const accountQuery='SELECT o.*,a.id account_id,a.family_id,a.refresh_token_ciphertext,f.timezone FROM child_journal_calendar_outbox o JOIN external_calendar_accounts a';
if(!projector.includes(accountQuery))throw new Error('Child Journal projector must reuse OAuth credentials without schedule calendar projection fields');
if(projector.includes('a.calendar_id'))throw new Error('Child Journal projector must not read the schedule calendar_id');
for(const inbound of ['calendar_sync_state','syncToken','nextSyncToken','watch','processCalendarInbound','applyInbound']){
  if(projector.includes(inbound))throw new Error(`Child Journal calendar must remain outbound-only: ${inbound}`);
}

if(!journal.includes("from './child-journal-calendar'"))throw new Error('Child Journal write boundary must import its dedicated projector');
if(!journal.includes('enqueueChildJournalCalendarSync(ctx.env.DB,member.family_id,logId)'))throw new Error('Child Journal save must enqueue outbound projection');
if(!journal.includes('ctx.executionContext?.waitUntil(processChildJournalCalendarOutbox(ctx.env,1,member.family_id))'))throw new Error('Child Journal save should wake one best-effort outbound projection');
if(!/catch\s*\{\/\* journal remains authoritative \*\/\}/.test(journal))throw new Error('Child Journal must remain authoritative when projection wake/enqueue fails');

if(!googleCalendar.includes("from './child-journal-calendar'"))throw new Error('Google Calendar scheduler wrapper must include Child Journal outbound projection');
if(!googleCalendar.includes('processChildJournalCalendarOutbox(env,bounded,familyId)'))throw new Error('Scheduled Google Calendar outbox wrapper must process Child Journal projection');
if(!googleCalendar.includes('pendingChildJournalCalendarSyncCount(ctx.env.DB,familyId)'))throw new Error('Manual sync pending count must include Child Journal projection');
if(googleCalendar.includes('processChildJournalCalendarInbound'))throw new Error('No Child Journal inbound calendar path is allowed');

if(!manifest.includes("['child-journal-google-calendar','node scripts/child-journal-google-calendar-contract.mjs']"))throw new Error('Child Journal Google Calendar contract must be active');

console.log('child journal dedicated outbound Google Calendar contract ok');
