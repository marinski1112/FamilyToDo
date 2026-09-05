import {readFileSync} from 'node:fs';

const migration=readFileSync(new URL('../migrations/0056_task_hierarchy_foundation.sql',import.meta.url),'utf8');
const hierarchy=readFileSync(new URL('../src/task-hierarchy.ts',import.meta.url),'utf8');
const taskApi=readFileSync(new URL('../src/task-api.ts',import.meta.url),'utf8');
const schema=readFileSync(new URL('../database/schema.d1.sql',import.meta.url),'utf8');
const taskOnly=readFileSync(new URL('../migrations/0008_wave31_task_only.sql',import.meta.url),'utf8');

function requireText(source,needle,label){
  if(!source.includes(needle)) throw new Error(`task-hierarchy contract missing ${label}: ${needle}`);
}
function forbidText(source,needle,label){
  if(source.includes(needle)) throw new Error(`task-hierarchy contract forbids ${label}: ${needle}`);
}

// Additive nullable self-reference. Existing rows stay top-level and parent deletion only detaches children.
requireText(migration,'ADD COLUMN parent_task_id INTEGER NULL','nullable parent column');
requireText(migration,'REFERENCES tasks(id) ON DELETE SET NULL','non-destructive parent deletion');
requireText(migration,'ON tasks(family_id, parent_task_id)','family-scoped parent index');
forbidText(migration,'parent_task_id INTEGER NOT NULL','mandatory parent');
forbidText(migration,'REFERENCES tasks(id) ON DELETE CASCADE','cascading child deletion');

// No migration-side inheritance or aggregate mutation. Child task state remains its own task row.
forbidText(migration,'task_completions','completion inheritance');
forbidText(migration,'task_completion_history','completion-history inheritance');
forbidText(migration,'recurrence_rules','recurrence inheritance');
forbidText(migration,'task_assignees','assignee inheritance');
forbidText(migration,'shopping_items','shopping relink side effect');
forbidText(migration,'items SET','item relink side effect');

// Domain guard: same family, one shallow level, and visibility/PRIVATE owner parity.
requireText(hierarchy,"reason: 'SELF_PARENT' | 'CROSS_FAMILY' | 'MAX_DEPTH' | 'VISIBILITY_MISMATCH'",'bounded rejection reasons');
requireText(hierarchy,"child.id === parent.id","self-parent rejection");
requireText(hierarchy,"child.familyId !== parent.familyId","cross-family rejection");
requireText(hierarchy,"parent.parentTaskId !== null || child.hasChildren","one-level hierarchy rejection in both directions");
requireText(hierarchy,"child.visibilityScope !== parent.visibilityScope","visibility-scope parity");
requireText(hierarchy,"child.privateOwnerId === null",'PRIVATE child owner required');
requireText(hierarchy,"parent.privateOwnerId === null",'PRIVATE parent owner required');
requireText(hierarchy,"child.privateOwnerId !== parent.privateOwnerId","PRIVATE owner parity");

// Task creation may opt into an existing parent, but the browser/AI does not gain implicit persistence authority.
requireText(taskApi,"import { validateTaskParentLink } from './task-hierarchy'",'canonical hierarchy validator reuse');
requireText(taskApi,'const parentRaw=b.parent_task_id','explicit parent input only');
requireText(taskApi,"parentTaskId!==null&&isEvent","child is TASK, not EVENT");
requireText(taskApi,"WHERE id=? AND family_id=? AND ${taskVisibilitySql('t')} LIMIT 1",'same-family visible parent lookup');
requireText(taskApi,'validateTaskParentLink(','create-time hierarchy validation');
requireText(taskApi,'privateOwnerId:isPrivate?Number(m.id):null','PRIVATE child owner identity');
requireText(taskApi,'privateOwnerId:parent.private_owner_id===null?null:Number(parent.private_owner_id)','PRIVATE parent owner identity');
requireText(taskApi,'private_owner_id,parent_task_id) VALUES(','parent persisted on child task row');
requireText(taskApi,'isPrivate?m.id:null,parentTaskId).run()','explicit nullable parent binding');
forbidText(taskApi,'UPDATE recurrence_rules SET task_id','recurrence inheritance on create');
forbidText(taskApi,'UPDATE shopping_items SET task_id=parentTaskId','shopping relink to parent');
forbidText(taskApi,'UPDATE items SET task_id=parentTaskId','item relink to parent');

// Existing independent state and linkage contracts remain explicit rather than inherited from parent.
requireText(schema,'CREATE TABLE IF NOT EXISTS task_completions','independent task completion ledger');
requireText(schema,'CREATE TABLE IF NOT EXISTS recurrence_rules','recurrence rule table');
requireText(schema,'task_id INTEGER NULL','explicit recurrence task linkage');
requireText(taskOnly,'UPDATE shopping_items\nSET task_id =','explicit Shopping task linkage');
requireText(taskOnly,'UPDATE items\nSET task_id =','explicit Items task linkage');

console.log('task hierarchy foundation contract ok');
