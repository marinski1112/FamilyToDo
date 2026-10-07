import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {Window} from 'happy-dom';
const calendar=fs.readFileSync('public/assets/calendar.js','utf8'),compact=fs.readFileSync('public/assets/calendar-mobile-ui.js','utf8');
const neighbors=month=>{const d=new Date(month+'-15T12:00:00Z');return [-1,1].map(n=>new Date(Date.UTC(d.getUTCFullYear(),d.getUTCMonth()+n,15)).toISOString().slice(0,7));};
const html=month=>{const [prev,next]=neighbors(month);return `<div class="calendar-page-head"><div><button id="monthLabel"></button><div id="calendarJumpPanel" hidden><form id="calendarMonthJump"><select name="year"><option>2026</option><option>2027</option></select><select name="month">${Array.from({length:12},(_,i)=>`<option>${i+1}</option>`).join('')}</select></form></div></div><div class="calendar-month-actions"><label class="calendar-month-picker"><input id="calendarMonthPicker" value="${month}"></label><a id="prevMonth" href="#" data-month="${prev}">prev</a><a id="nextMonth" href="#" data-month="${next}">next</a></div></div><div class="calendar-card"><div class="calendar-grid"><div class="calendar-cell" data-date="${month}-01">${month}</div></div></div><script id="calendarPayload" type="application/json">${JSON.stringify({month,prev,next,view:'all',detail:{}})}</script>`;};
async function until(check){for(let i=0;i<100;i++){if(check())return;await new Promise(r=>setTimeout(r,5));}assert.fail('month navigation did not finish');}
for(const order of ['calendar-first','compact-first'])test(`month controls track arrows and swipes across years (${order})`,async()=>{
 const w=new Window({url:'https://fixture.invalid/app/calendar.php?month=2026-12',settings:{disableJavaScriptFileLoading:true}});const requests=[];
 try{
  w.document.body.innerHTML=html('2026-12');w.setTimeout=fn=>{queueMicrotask(fn);return 1;};
  w.fetch=async(url,opts={})=>{assert.notEqual(opts.method,'POST');requests.push(url);return new Response(html(new URL(url,w.location.href).searchParams.get('month')));};
  for(const script of order==='calendar-first'?[calendar,compact]:[compact,calendar])w.eval(script);
  const d=w.document;d.querySelector('#nextMonth').click();await until(()=>w.location.search.includes('2027-01'));
  assert.equal(d.querySelector('#monthLabel').textContent,'2027年1月');assert.equal(d.querySelector('#calendarMonthPicker').value,'2027-01');assert.equal(d.querySelector('.calendar-month-draft-year').value,'2027');assert.equal(d.querySelector('.calendar-month-draft-month').value,'01');assert.equal(d.querySelector('#calendarMonthJump').elements.year.value,'2027');assert.equal(d.querySelector('#calendarMonthJump').elements.month.value,'1');
  const cell=d.querySelector('.calendar-cell');for(const [type,x] of [['touchstart',100],['touchend',240]]){const e=new w.Event(type,{bubbles:true});Object.defineProperty(e,'changedTouches',{value:[{clientX:x,clientY:100}]});cell.dispatchEvent(e);}
  await until(()=>w.location.search.includes('2026-12'));assert.equal(d.querySelector('#monthLabel').textContent,'2026年12月');assert.equal(d.querySelector('.calendar-month-draft-year').value,'2026');assert.equal(d.querySelector('.calendar-month-draft-month').value,'12');assert.equal(d.querySelector('#calendarMonthPicker').value,'2026-12');assert(requests.every(url=>new URL(url,w.location.href).pathname==='/app/calendar.php'));
 }finally{await w.happyDOM.close();}
});
