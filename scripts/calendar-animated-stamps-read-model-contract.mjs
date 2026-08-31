import assert from 'node:assert/strict';
import fs from 'node:fs';

const source=fs.readFileSync('src/calendar-stamps.ts','utf8');

for(const token of [
  'calendarStampPlacementsForRange',
  "JOIN calendar_stamp_assets a ON a.id=p.asset_id AND a.family_id=p.family_id",
  'WHERE p.family_id=?',
  "p.visibility_scope='FAMILY'",
  "p.visibility_scope='PRIVATE' AND p.private_owner_id=?",
  'p.stamp_date BETWEEN ? AND ?',
  'a.active=1',
  'const MAX_RANGE_DAYS=62',
  'const MAX_ROWS=256',
  'LIMIT ?',
  "new Date(ms).toISOString().slice(0,10)!==value",
]) assert.ok(source.includes(token),`calendar stamp read model missing: ${token}`);

assert.match(source,/toDay-fromDay\+1>MAX_RANGE_DAYS/,'date span must be bounded before querying D1');
assert.match(source,/\.bind\(familyId,from,to,memberId,MAX_ROWS\)/,'tenant/member/range/limit values must stay parameterized');
assert.match(source,/toISOString\(\)\.slice\(0,10\)!==value/,'calendar dates must round-trip so impossible dates cannot normalize into a different day');
assert.doesNotMatch(source,/INSERT|UPDATE|DELETE FROM|\.run\(/,'Calendar stamp renderer read model must remain read-only');
assert.doesNotMatch(source,/SELECT\s+p\.\*/i,'read model must not expose placement creator or unrelated columns');
assert.doesNotMatch(source,/created_by|created_at|updated_at|member_name|family_name/,'renderer model must not expose creator/member metadata');

console.log('calendar animated stamps read model contract: bounded read-only tenant/private projection with strict calendar dates ok');
