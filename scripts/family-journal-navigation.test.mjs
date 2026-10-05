import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {Window} from 'happy-dom';
const script=fs.readFileSync('public/assets/family-journal-link.js','utf8');
const settle=()=>new Promise(resolve=>setTimeout(resolve,20));
test('late compact daily navigation replaces the placeholder and keeps one bound four-link bar',async()=>{
 const w=new Window({url:'https://fixture.invalid/app/family_log.php'}),d=w.document;
 d.body.innerHTML='<div class="wrap"><div class="family-log-page"></div></div>';
 const timers=[];w.setTimeout=fn=>{timers.push(fn);return timers.length;};
 try{
  w.eval(script);timers.forEach(fn=>fn());await settle();assert.equal(d.querySelectorAll('.family-log-bottom-journal').length,1);assert(d.querySelector('.wrap>.family-log-bottom-journal'));
  const late=d.createElement('nav');late.className='family-log-bottom-journal';late.innerHTML='<a href="/app/child_journal.php">growth</a><a href="/app/child_foods.php">food</a><a href="/app/child_foods.php">duplicate</a><a href="/app/family_log.php?dashboard=1#familyLogSummary">summary</a>';
  let clicks=0;const bound=late.querySelector('a');bound.addEventListener('click',e=>{e.preventDefault();clicks++;});d.querySelector('.family-log-page').append(late);
  await settle();assert.equal(d.querySelectorAll('.family-log-bottom-journal').length,1);assert.equal(d.querySelector('.family-log-bottom-journal'),late);assert.equal(late.querySelectorAll('a').length,4);assert(late.classList.contains('family-log-persistent-journal'));bound.click();assert.equal(clicks,1);
  assert.deepEqual([...late.querySelectorAll('a')].map(a=>new URL(a.href).pathname),['/app/child_journal.php','/app/family_journal.php','/app/child_foods.php','/app/family_log.php']);
  assert(late.querySelector('[data-family-log-summary-link]'));assert.equal(late.querySelector('[aria-current]'),null);
  const extra=d.createElement('a');extra.href='/app/family_log.php?dashboard=1#familyLogSummary';late.append(extra);await settle();assert.equal(late.querySelectorAll('a').length,4);
  late.remove();await settle();assert.equal(d.querySelectorAll('.family-log-bottom-journal').length,1);
 }finally{await w.happyDOM.close();}
});
test('journal screens keep the single menu within content and mark the current page',async()=>{
 for(const path of ['/app/child_journal.php','/app/family_journal.php','/app/child_foods.php']){
  const w=new Window({url:'https://fixture.invalid'+path});w.document.body.innerHTML='<main class="wrap"></main>';w.setTimeout=fn=>{fn();return 1;};
  try{w.eval(script);await settle();const nav=w.document.querySelector('.wrap>.family-log-persistent-journal');assert(nav);assert.equal(nav.querySelectorAll('a').length,4);assert.equal(new URL(nav.querySelector('[aria-current="page"]').href).pathname,path);}finally{await w.happyDOM.close();}
 }
});
