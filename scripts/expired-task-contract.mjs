import assert from 'node:assert/strict';
import fs from 'node:fs';
import { retainedAppContractSource } from './retained-app-contract-source.mjs';

const app=retainedAppContractSource();
const daily=fs.readFileSync('src/daily-task-page.ts','utf8');
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

assert.ok(
  daily.includes('(t.start_at IS NOT NULL AND date(t.start_at)<=date(?) AND date(COALESCE(t.end_at,t.due_at,t.start_at))>=date(?))'),
  'normal checklist must stop a non-event task at the same end_at -> due_at -> start_at effective deadline used by expired classification',
);
assert.ok(
  !daily.includes('(t.start_at IS NOT NULL AND date(t.start_at)<=date(?) AND (t.end_at IS NULL OR date(t.end_at)>=date(?)))'),
  'normal checklist must not treat a started task with no end_at as indefinitely active when due_at/start_at already expired',
);
assert.ok(!/class="btn[^"`]*task-shopping-add[^`]*>＋ このタスクに買い物を追加/.test(app),'long expired-task shopping button must remain absent');
for(const marker of [
  '.toggle[data-type][data-id]',
  '/api/toggle',
  'type:el.dataset.type',
  'occurrence_id',
  'csrf:',
  'el.checked=!checked',
  "data.status)==='completed'",
  "document.querySelectorAll('details.expired-tasks')",
  'section.open=true',
]) assert.ok(taskEvents.includes(marker),`missing task-toggle/checklist visibility contract marker: ${marker}`);

console.log('expired-task-contract: filtering, effective deadline alignment, visible overdue section, compact shopping action, and toggle behavior ok');
