import assert from 'node:assert/strict';
import fs from 'node:fs';

const app=fs.readFileSync('src/app.ts','utf8');
const lifecycle=fs.readFileSync('src/lifecycle.ts','utf8');
const schema=fs.readFileSync('database/schema.d1.sql','utf8');

assert.ok(app.includes('export function taskVisibilitySql'),'current task visibility predicate must remain centralized');
assert.ok(app.includes("visibility_scope,'FAMILY'")&&app.includes("visibility_scope='PRIVATE'"),'FAMILY/PRIVATE visibility contract must remain explicit');
assert.ok(app.includes('private_owner_id'),'PRIVATE ownership must remain part of access control');
assert.ok(app.includes('recurrence_rules')&&app.includes('recurrence_occurrences'),'recurring task rule/occurrence model must remain active');
assert.ok(app.includes("task_kind")&&app.includes("'EVENT'")||app.includes("'event'"),'TASK/EVENT kind model must remain available');
assert.ok(lifecycle.includes('deleted_completion_history'),'completion lifecycle must preserve archive history before destructive cleanup');
assert.ok(schema.includes('CREATE TABLE IF NOT EXISTS tasks')||schema.includes('CREATE TABLE tasks'),'tasks must remain the canonical scheduled entity table');
assert.ok(schema.includes('recurrence_rules'),'recurrence schema must remain present');

console.log('core contract smoke: visibility, task/event, recurrence, and lifecycle contracts ok');
