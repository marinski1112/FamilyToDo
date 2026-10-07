import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {Window} from 'happy-dom';
const source=fs.readFileSync('public/assets/message-immediate-ui.js','utf8');
for(const wrapped of [false,true])for(const labelled of [false,true]){
 test(`immediate notification initializes and switches with wrapped=${wrapped}, labelled=${labelled}`,async()=>{
  const w=new Window({url:'https://fixture.invalid/app/message_new.php'}),d=w.document;
  w.fetch=async()=>{throw new Error('unexpected request');};
  const input='<input id="when" type="datetime-local" name="reminder_at" value="2026-10-08T07:00">';
  d.body.innerHTML=`<form id="messageNew">${labelled?'<label for="when">予約日時</label>':''}${wrapped?`<span class="native-control-shell">${input}</span>`:input}<button>送信</button></form>`;
  try{
   assert.doesNotThrow(()=>w.eval(source));
   const form=d.getElementById('messageNew'),reminder=d.getElementById('when'),checkbox=form.querySelector('[name="notify_now"]'),row=checkbox?.closest('label');
   assert(checkbox,'immediate notification option must be available');
   assert.equal(row.parentElement,form);
   assert.equal(form.firstElementChild,row);
   assert.equal(reminder.value,'2026-10-08T07:00');assert.equal(reminder.disabled,false);
   checkbox.checked=true;checkbox.dispatchEvent(new w.Event('change'));
   assert.equal(reminder.disabled,true);assert.equal(reminder.value,'');
   checkbox.checked=false;checkbox.dispatchEvent(new w.Event('change'));
   assert.equal(reminder.disabled,false);
   reminder.value='2026-10-09T08:00';checkbox.checked=true;reminder.dispatchEvent(new w.Event('input'));
   assert.equal(checkbox.checked,false);assert.equal(reminder.disabled,false);assert.equal(reminder.value,'2026-10-09T08:00');
   w.eval(source);assert.equal(form.querySelectorAll('[name="notify_now"]').length,1);
  }finally{await w.happyDOM.close();}
 });
}
test('both composer forms initialize and pages without a composer stay idle',async()=>{
 const w=new Window({url:'https://fixture.invalid/app/messages.php'}),d=w.document;let requests=0;
 w.fetch=async()=>{requests++;throw new Error('unexpected request');};
 try{
  w.eval(source);assert.equal(requests,0);
  d.body.innerHTML='<form id="msgForm"><div><span class="native-control-shell"><input name="reminder_at" type="datetime-local"></span></div></form><form id="messageNew"><input name="reminder_at" type="datetime-local"></form>';
  w.eval(source);assert.equal(d.querySelectorAll('[name="notify_now"]').length,2);assert.equal(requests,0);
 }finally{await w.happyDOM.close();}
});
