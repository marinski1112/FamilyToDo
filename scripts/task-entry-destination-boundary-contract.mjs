import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {Window} from 'happy-dom';

const read=path=>readFileSync(path,'utf8');
const w=new Window({url:'https://familytodo.test/task/new.php',settings:{disableCSSFileLoading:true,disableJavaScriptFileLoading:true}});
w.document.body.innerHTML='<script id="taskNewPayload" type="application/json">{"initialType":"task"}</script><form id="taskForm"></form>';
w.eval(read('public/assets/task-rough-input-ui.js'));
w.document.dispatchEvent(new w.Event('DOMContentLoaded'));
const form=w.document.querySelector('#taskForm');
const child=w.document.querySelector('#roughChildOptions');
assert.equal(w.document.documentElement.dataset.taskRoughInputUi,'ready');
assert.equal(child.hidden,false,'Task can have child tasks');
assert.equal(w.document.querySelector('#roughAllowShopping'),null,'linked Shopping cannot be added from Task/Event');
assert.equal(w.document.querySelector('#roughAllowItem'),null,'linked Item cannot be added from Task/Event');
w.document.querySelector('#roughAllowChildTask').click();
assert.equal(w.document.querySelector('#roughChildTaskWrap').hidden,false);
for(const mode of ['event','shopping','item']){
 const radio=form.querySelector(`[value="${mode}"]`);for(const other of form.querySelectorAll('[name=rough_primary_type]'))other.checked=other===radio;radio.dispatchEvent(new w.Event('change',{bubbles:true}));
 assert.equal(child.hidden,true,`${mode} cannot offer child tasks`);
 assert.equal(w.document.querySelector('#roughAllowChildTask').checked,false,`${mode} must clear the old selection`);
}
const api=read('src/task-rough-input-api.ts');
assert.match(api,/primaryType==='task'\?\['child_task'\]:\[\]/,'API rejects linked Goods and Event children');
assert.match(read('src/task-api.ts'),/String\(parent\.task_kind\)==='EVENT'\)return json\(\{ok:false,error:'イベントには子タスクを追加できません。'/,'direct API rejects children of Event');
assert.match(read('src/task-children-api.ts'),/canAddChildren:canManageParent&&parent\.parent_task_id===null&&String\(parent\.task_kind\|\|'TASK'\)\.toUpperCase\(\)!=='EVENT'/,'Event detail API does not advertise child creation');
assert.match(read('public/assets/task-edit.js'),/childState\.canAddChildren&&!editIsEvent\?\.checked/,'editing an Event never shows a child creation form');
assert.ok(!read('src/task-entry-page.ts').includes('id="taskAssigneeWrap"'),'manual entry has no old assignee input');
assert.ok(!read('public/assets/task-rough-input-ai.js').includes('${assigneeFieldset('),'AI draft has no old assignee input');
assert.match(read('public/assets/task-rough-input-save.js'),/if\(children\.length&&!roots\.some\(x=>x\.destination==='task'\)\)/,'save requires Task parent');
await w.happyDOM.close();
console.log('Task entry: Task-only children, no linked Goods or assignee controls, Event parent rejected');
