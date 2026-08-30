import assert from 'node:assert/strict';
import fs from 'node:fs';

const app=fs.readFileSync('src/app.ts','utf8');
const taskEvents=fs.readFileSync('public/assets/task-events.js','utf8');

for(const marker of [
  'expiredTasksFor(ctx',
  'const todayJst=dateOnly()',
  "t.status='pending'",
  "lower(t.task_kind)='task'",
  'COALESCE(t.end_at,t.due_at,t.start_at) IS NOT NULL',
  "taskVisibilitySql('t')",
  'class="check toggle expired-checkbox"',
  'data-type="task"',
  'href="/task/view.php?id=',
  'aria-label="このタスクに買い物を追加"',
  'title="買い物を追加"',
  'task-shopping-add',
  'becamePrivate',
  'DELETE FROM activity_logs',
]) assert.ok(app.includes(marker),`missing expired-task contract marker: ${marker}`);

assert.ok(!/class="btn[^"`]*task-shopping-add[^`]*>＋ このタスクに買い物を追加/.test(app),'long expired-task shopping button must remain absent');
for(const marker of [
  '.toggle[data-type][data-id]',
  '/api/toggle',
  'type:el.dataset.type',
  'occurrence_id',
  'csrf:',
  'el.checked=!checked',
  "data.status)==='completed'",
]) assert.ok(taskEvents.includes(marker),`missing task-toggle contract marker: ${marker}`);

console.log('expired-task-contract: filtering, visibility, compact shopping action, and toggle behavior ok');
