import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';

const page=fs.readFileSync('src/activity-log-page.ts','utf8');
const timezoneSource=fs.readFileSync('src/timezone.ts','utf8');
const manifest=fs.readFileSync('scripts/regression-manifest.mjs','utf8');

for(const marker of [
  "if(role!=='OWNER'&&role!=='ADMIN')",
  "const timeZone=String(m.family_timezone||ctx.env.APP_TIMEZONE||DEFAULT_FAMILY_TIMEZONE)",
  "const today=familyDate(timeZone)",
  "const where:string[]=['a.family_id=?',activityLogVisibilitySql('a')]",
  "if(member>0){where.push('a.member_id=?');params.push(member);}",
  "if(groups[type]){where.push(`a.target_type IN (${groups[type].map(()=>'?').join(',')})`);params.push(...groups[type]);}",
  "if(action&&action!=='OTHER'){where.push('a.action=?');params.push(action);}",
  "if(days==='custom'&&isIsoCalendarDate(from)&&isIsoCalendarDate(to))",
  'const range=familyLocalDateRangeUtc(from,to,timeZone)',
  'const range=familyLocalDateRangeUtc(addCalendarDays(today,-n),today,timeZone)',
  'where.push("a.occurred_at>=? AND a.occurred_at<?")',
  "SELECT a.action,a.occurred_at,a.target_type,a.target_id,m.name member_name FROM activity_logs a LEFT JOIN members m ON m.id=a.member_id",
  "ORDER BY a.occurred_at DESC,a.id DESC LIMIT 51 OFFSET ?",
  "const hasMore=rows.results.length>50;rows.results=rows.results.slice(0,50);",
  "formatStoredUtcForFamily(String(r.occurred_at||''),timeZone)",
  "q.set('page',String(page+1))",
  "prev.set('page',String(page-1))",
])if(!page.includes(marker))throw new Error(`activity log page behavior marker missing: ${marker}`);

for(const forbidden of [
  'date(a.occurred_at)',
  'nowJst',
  'SELECT a.*',
  'LEFT JOIN family_logs fl',
  'LEFT JOIN family_log_subjects fs',
  'LEFT JOIN family_log_subjects fss',
  'family_log_type',
  'family_log_occurred_at',
  'family_log_detail_code',
  'family_log_amount',
  'family_log_unit',
  'family_log_duration_minutes',
  'family_log_value_text',
  'family_log_subject_name',
  'target_subject_name',
])if(page.includes(forbidden))throw new Error(`activity log page restored UTC-date filtering or unused Family Log projection/join: ${forbidden}`);

const compiled=ts.transpileModule(timezoneSource,{
  compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ES2022},
}).outputText;
const timezone=await import(`data:text/javascript;base64,${Buffer.from(compiled).toString('base64')}`);

assert.deepEqual(
  timezone.familyLocalDateRangeUtc('2026-09-18','2026-09-18','Asia/Tokyo'),
  {start:'2026-09-17 15:00:00',endExclusive:'2026-09-18 15:00:00'},
  'Tokyo local day must bind to the matching UTC [start,end) range',
);
assert.deepEqual(
  timezone.familyLocalDateRangeUtc('2026-03-08','2026-03-08','America/Los_Angeles'),
  {start:'2026-03-08 08:00:00',endExclusive:'2026-03-09 07:00:00'},
  'spring DST local day must be 23 hours in UTC',
);
assert.deepEqual(
  timezone.familyLocalDateRangeUtc('2026-11-01','2026-11-01','America/Los_Angeles'),
  {start:'2026-11-01 07:00:00',endExclusive:'2026-11-02 08:00:00'},
  'fall DST local day must be 25 hours in UTC',
);

if(!manifest.includes("['activity-log-page-boundary','node scripts/activity-log-page-boundary-contract.mjs']"))throw new Error('activity log page boundary contract is not active');

console.log('activity-log-page-boundary: admin gate, canonical PRIVATE visibility, family-local UTC ranges incl DST, narrow projection, UTC display conversion and 50+1 paging ok');
