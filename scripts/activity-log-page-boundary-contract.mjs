import fs from 'node:fs';

const page=fs.readFileSync('src/activity-log-page.ts','utf8');
const manifest=fs.readFileSync('scripts/regression-manifest.mjs','utf8');

for(const marker of [
  "if(role!=='OWNER'&&role!=='ADMIN')",
  "const where:string[]=['a.family_id=?',activityLogVisibilitySql('a')]",
  "if(member>0){where.push('a.member_id=?');params.push(member);}",
  "if(groups[type]){where.push(\`a.target_type IN (\${groups[type].map(()=>'?').join(',')})\`);params.push(...groups[type]);}",
  "if(action&&action!=='OTHER'){where.push('a.action=?');params.push(action);}",
  "where.push(\"date(a.occurred_at) BETWEEN date(?) AND date(?)\")",
  "where.push(\"date(a.occurred_at)>=date(?,'-'||?||' days')\")",
  "SELECT a.action,a.occurred_at,a.target_type,a.target_id,m.name member_name FROM activity_logs a LEFT JOIN members m ON m.id=a.member_id",
  "ORDER BY a.occurred_at DESC,a.id DESC LIMIT 51 OFFSET ?",
  "const hasMore=rows.results.length>50;rows.results=rows.results.slice(0,50);",
  "formatStoredUtcForFamily(String(r.occurred_at||''),timeZone)",
  "q.set('page',String(page+1))",
  "prev.set('page',String(page-1))",
])if(!page.includes(marker))throw new Error(\`activity log page behavior marker missing: \${marker}\`);

for(const forbidden of [
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
])if(page.includes(forbidden))throw new Error(\`activity log page restored unused Family Log projection/join: \${forbidden}\`);

if(!manifest.includes("['activity-log-page-boundary','node scripts/activity-log-page-boundary-contract.mjs']"))throw new Error('activity log page boundary contract is not active');

console.log('activity-log-page-boundary: admin gate, canonical PRIVATE visibility, filters, narrow projection, UTC display conversion and 50+1 paging ok');
