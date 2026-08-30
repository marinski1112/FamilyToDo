import assert from 'node:assert/strict';
import fs from 'node:fs';

const calendar=fs.readFileSync('src/google-calendar.ts','utf8')+fs.readFileSync('src/google-calendar-core.ts','utf8');

assert.match(calendar,/UPDATE tasks SET title=\?,description=\?,start_at=\?,end_at=\?,due_at=\?,location=\?,all_day=\?,calendar_visible=1,updated_at=\?/,'linked Calendar projection update must remain field-scoped');
assert.doesNotMatch(calendar,/UPDATE tasks SET[^'\n]*task_kind/,'linked Calendar projection must not mutate task_kind');
for(const marker of [
  "1,'EVENT'",
  'external_event_id=?',
  'familyTodoTaskId',
  't.family_id=l.family_id',
  "event.status==='cancelled'",
  'calendar_visible=0',
  'external_etag',
  'syncLeases',
  "visibility_scope||'FAMILY'",
  'inboundEventTimes',
]) assert.ok(calendar.includes(marker),marker);

console.log('calendar-inbound-projection-contract: linked TASK/EVENT projection, dedupe, cancellation, visibility, and lease guardrails ok');
