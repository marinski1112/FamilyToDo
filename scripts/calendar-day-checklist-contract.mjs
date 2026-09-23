import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {Window} from 'happy-dom';

const day='2026-09-23',w=new Window({url:'https://familytodo.test/app/calendar.php?month=2026-09',settings:{disableCSSFileLoading:true,disableJavaScriptFileLoading:true}});
w.document.body.innerHTML=`<script id="calendarPayload" type="application/json">${JSON.stringify({csrf:'test',month:'2026-09',today:day,detail:{},shoppingDetail:{[day]:[{id:1,name:'牛乳',status:'pending'}]},itemDetail:{[day]:[{id:2,name:'水筒',status:'pending'}]}})}</script><div class="calendar-card"><div class="calendar-grid"><button class="calendar-cell" data-date="${day}">23</button></div></div><div id="dayModal"><div class="day-modal"><div id="modalTitle"></div><button id="modalClose"></button><div class="modal-scroll"><div id="modalBody"></div></div><a id="modalAdd"></a></div></div>`;
const requests=[];w.fetch=async(url,options)=>{requests.push({url,body:JSON.parse(options.body)});return {ok:true,json:async()=>({ok:true,status:options.body.includes('"completed":true')?'completed':'pending'})}};
w.alert=message=>{throw new Error(message)};
w.eval(readFileSync('public/assets/calendar.js','utf8'));
assert.equal(w.document.documentElement.dataset.calendarJs,'ready');
const cell=w.document.querySelector('.calendar-cell');cell.click();
assert.equal(w.document.querySelector('.calendar-day-checklist-link')?.getAttribute('href'),`/app/tasks.php?date=${day}`);
for(const type of ['shop','item']){
 const check=w.document.querySelector(`.calendar-${type}-toggle`);assert(check);check.checked=true;check.dispatchEvent(new w.Event('change',{bubbles:true}));
}
await new Promise(resolve=>setTimeout(resolve,0));
assert.deepEqual(requests.map(x=>x.body.completed),[true,true]);
w.document.querySelector('#modalClose').click();cell.click();
assert(w.document.querySelector('.calendar-shop-toggle').checked,'Shopping completion survives reopening the day');
assert(w.document.querySelector('.calendar-item-toggle').checked,'Item completion survives reopening the day');
await w.happyDOM.close();
console.log('Calendar day: Shopping/Item checks persist in the open date and link to its working Checklist');
