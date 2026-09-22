(()=>{
'use strict';
const parsePayload=id=>{try{return JSON.parse(document.getElementById(id)?.textContent||'{}');}catch{return {};}};
const dailyPayload=parsePayload('dailyPayload'),taskViewPayload=parsePayload('taskViewPayload');
const csrf=String(dailyPayload.csrf||taskViewPayload.csrf||''),U='未分類';
const key=v=>String(v??'').trim().toLocaleLowerCase('ja-JP');
const hide=n=>{if(n instanceof HTMLElement){n.hidden=true;n.classList.add('task-link-ui-hidden');}};
const requestJson=async(url,body)=>{const r=await fetch(url,{method:'POST',credentials:'same-origin',headers:{'content-type':'application/json','accept':'application/json'},body:JSON.stringify(body)}),d=await r.json().catch(()=>({ok:false,error:'サーバー応答を読み取れませんでした。'}));if(!r.ok||!d?.ok)throw new Error(d?.error||'更新に失敗しました。');return d;};

const hideLegacy=()=>{
 document.querySelectorAll('input[name="assignees"],select[name="completion_mode"],.task-shopping-add,.task-shopping-count,.task-shopping,.task-linked-items,.task-linked-shopping').forEach(n=>hide(n.closest?.('[data-assignee-section],.assignee-grid,.assignees-field,.completion-mode-field,fieldset,label')||n));
 document.querySelectorAll('select[name="task_id"]').forEach(n=>hide(n.closest('.shopping-related-task-block,.task-link-section,details,label')));
 document.querySelectorAll('.card h2').forEach(h=>{const t=String(h.textContent||'');if(t.includes('このタスクの買い物')||t.includes('このタスクの持ち物'))hide(h.closest('.card'));});
 document.querySelectorAll('p').forEach(p=>{if(/^担当[：:]/.test(String(p.textContent||'').trim()))hide(p);});
 document.querySelectorAll('.task-row>.meta,.task-child-row>.meta,.unorganized-task-row>.meta').forEach(m=>{m.textContent=String(m.textContent||'').replace(/^\s*[^・]*\s*・\s*/,'').replace(/\s*・\s*担当\s*[^・]+/g,'').trim();});
};

const chooseChildPolicy=count=>new Promise(resolve=>{
 const b=document.createElement('div');b.className='checklist-dialog-backdrop';b.innerHTML=`<div class="checklist-dialog" role="dialog" aria-modal="true"><h2>親タスクを完了しますか？</h2><p>未完了の子タスクが${Number(count)}件あります。</p><button data-v="complete">未完了の子タスクを全て完了にする<small>親・子も完了します</small></button><button data-v="promote">未完了の子タスクを親タスクとして残す<small>子タスクをトップレベルへ移動します</small></button><button data-v="" class="cancel">キャンセル</button></div>`;
 document.body.append(b);const done=v=>{b.remove();resolve(v||null)};b.addEventListener('click',e=>{const x=e.target.closest?.('button[data-v]');if(x)done(x.dataset.v);else if(e.target===b)done(null);});
});
const parentCandidate=t=>{if(!(t instanceof HTMLInputElement)||!t.checked)return null;if(t.id==='done'){const id=Number(taskViewPayload.id||0);return String(taskViewPayload.toggleType||'')==='task'&&id>0?{id,target:t}:null;}if(!t.matches('input.toggle[data-type="task"]')||t.closest('.task-child-row'))return null;const row=t.closest('.task-row[data-task-id],.unorganized-task-row[data-task-id]'),id=Number(row?.dataset.taskId||t.dataset.id||0);return row&&id>0?{id,target:t}:null;};
document.addEventListener('change',e=>{const c=parentCandidate(e.target);if(!c)return;e.preventDefault();e.stopPropagation();e.stopImmediatePropagation();c.target.checked=false;c.target.disabled=true;void(async()=>{try{const i=await requestJson('/api/task-parent-completion',{csrf,id:c.id,action:'inspect'}),n=Number(i.incomplete_children||0);if(n<=0)await requestJson('/api/toggle',{csrf,type:'task',id:c.id,completed:true});else{const p=await chooseChildPolicy(n);if(!p)return;await requestJson('/api/task-parent-completion',{csrf,id:c.id,action:'complete',child_policy:p});}location.reload();}catch(err){alert(err?.message||String(err));}finally{c.target.disabled=false;}})();},true);

const decorateParents=()=>{
 document.querySelectorAll('.task-row[data-task-id],.unorganized-task-row[data-task-id]').forEach(row=>{
  const children=row.querySelector(':scope>.task-children');if(!(children instanceof HTMLElement))return;
  const childRows=[...children.querySelectorAll(':scope>.task-child-row')],composer=children.querySelector(':scope>.task-child-composer');
  row.classList.toggle('task-parent-row',childRows.length>0);children.hidden=false;
  if(composer instanceof HTMLElement){composer.classList.add('task-child-composer-deferred');composer.classList.remove('is-open');let reveal=children.querySelector(':scope>.task-child-add-reveal');if(!(reveal instanceof HTMLButtonElement)){reveal=document.createElement('button');reveal.type='button';reveal.className='task-child-add-reveal';reveal.textContent='＋ 子タスクを追加';composer.before(reveal);reveal.addEventListener('click',()=>{children.hidden=false;reveal.hidden=true;composer.classList.add('is-open');composer.querySelector('input,textarea')?.focus();});}}
  if(!childRows.length)return;
  children.hidden=true;
  let btn=row.querySelector(':scope>.task-main-row .task-child-count-toggle');if(!(btn instanceof HTMLButtonElement)){btn=document.createElement('button');btn.type='button';btn.className='task-child-count-toggle';const actions=row.querySelector(':scope>.task-main-row .checklist-row-actions');(actions||row.querySelector(':scope>.task-main-row'))?.prepend(btn);btn.addEventListener('click',e=>{e.preventDefault();e.stopPropagation();children.hidden=!children.hidden;sync();});}
  const sync=()=>{btn.textContent=`${childRows.length} ${children.hidden?'›':'⌄'}`;btn.setAttribute('aria-expanded',children.hidden?'false':'true');btn.setAttribute('aria-label',`子タスク${childRows.length}件を開閉`);};sync();
 });
};

const installStatusTabs=section=>{
 if(!(section instanceof HTMLElement)||section.querySelector(':scope>.checklist-status-tabs'))return;
 const head=section.querySelector(':scope>.section-head');if(!(head instanceof HTMLElement))return;
 const tabs=document.createElement('div');tabs.className='checklist-status-tabs';tabs.innerHTML='<div class="checklist-status-segments" role="tablist" aria-label="完了状態"><button type="button" class="active" data-status="pending" role="tab" aria-selected="true">未完了</button><button type="button" data-status="completed" role="tab" aria-selected="false">完了済み</button></div>';
 head.insertAdjacentElement('afterend',tabs);
 const apply=status=>{section.dataset.statusTab=status;tabs.querySelectorAll('button[data-status]').forEach(b=>{const on=b.dataset.status===status;b.classList.toggle('active',on);b.setAttribute('aria-selected',on?'true':'false');});
  const rows=section.querySelectorAll('.task-row,.unorganized-task-row');
  rows.forEach(row=>{if(!(row instanceof HTMLElement))return;const box=row.querySelector('input.toggle');const done=Boolean(box?.checked);row.classList.toggle('checklist-status-hidden',status==='completed'?!done:done);});
 };
 const refreshCounts=()=>{let done=0;const rows=section.querySelectorAll('.task-row,.unorganized-task-row');rows.forEach(row=>{if(row.querySelector('input.toggle')?.checked)done++;});const b=tabs.querySelector('[data-status="completed"]');if(b)b.textContent=done?`完了済み ${done}`:'完了済み';};tabs.addEventListener('click',e=>{const b=e.target.closest?.('button[data-status]');if(b)apply(b.dataset.status||'pending');});section.addEventListener('familytodo:toggle-success',()=>requestAnimationFrame(()=>{refreshCounts();apply(section.dataset.statusTab||'pending');}));refreshCounts();apply('pending');
};

const installSearch=section=>{
 const head=section.querySelector(':scope>.section-head');if(!(head instanceof HTMLElement)||head.querySelector('.checklist-search-toggle'))return;
 const tools=document.createElement('div');tools.className='checklist-section-tools';const btn=document.createElement('button');btn.type='button';btn.className='checklist-icon-button checklist-search-toggle';btn.textContent='🔍';btn.setAttribute('aria-label','検索');
 const box=document.createElement('input');box.type='search';box.className='checklist-inline-search';box.placeholder='検索';box.hidden=true;tools.append(btn,box);head.append(tools);
 btn.addEventListener('click',()=>{box.hidden=!box.hidden;if(!box.hidden)box.focus();else{box.value='';box.dispatchEvent(new Event('input'));}});
 box.addEventListener('input',()=>{const q=key(box.value);section.querySelectorAll(':scope>.task-row,:scope>.unorganized-task-row,:scope>.shopping-category-group,:scope>.belongings-category-group').forEach(row=>{if(row instanceof HTMLElement)row.classList.toggle('checklist-search-hidden',Boolean(q)&&!key(row.textContent).includes(q));});});
 return tools;
};

const installUnifiedChecklist=()=>{
 const task=document.querySelector('.task-section');
 if(task instanceof HTMLElement){
  const head=task.querySelector(':scope>.section-head'),tools=head?.querySelector('.checklist-section-tools'),status=task.querySelector(':scope>.checklist-status-tabs');
  head?.querySelector('h2')?.classList.add('unified-original-title-hidden');
  head?.querySelector('.checklist-search-toggle')?.remove();head?.querySelector('.checklist-inline-search')?.remove();
  const events=[...task.querySelectorAll(':scope>.event-task-row')],eventCount=events.length;
  const tabs=document.createElement('div');tabs.className='checklist-kind-tabs task-event-tabs';tabs.innerHTML=`<button type="button" class="active" data-kind="task">☑ タスク</button><button type="button" data-kind="event">📅 イベント${eventCount?` <span>${eventCount}</span>`:''}</button>`;head?.prepend(tabs);
  const add=tools?.querySelector('.task-add-top');if(add instanceof HTMLElement){add.dataset.inputKind='task';if(add instanceof HTMLAnchorElement)add.dataset.baseHref=add.href;}
  const ai=document.createElement('a');ai.className='checklist-compact-action unified-ai-input';ai.textContent='＋AI入力';ai.href='/task/new.php?date='+encodeURIComponent(String(dailyPayload.date||''))+'&type=task';
  if(tools instanceof HTMLElement){tools.prepend(ai);const trash=tools.querySelector('.task-delete-mode');if(trash instanceof HTMLElement&&status instanceof HTMLElement)status.append(trash);}
  const apply=kind=>{task.dataset.kindTab=kind;const liveAdd=task.querySelector('.task-add-top');tabs.querySelectorAll('button').forEach(b=>b.classList.toggle('active',b.dataset.kind===kind));task.querySelectorAll(':scope>.task-row').forEach(row=>{if(!(row instanceof HTMLElement))return;const isEvent=row.classList.contains('event-task-row');row.classList.toggle('checklist-kind-hidden',kind==='event'?!isEvent:isEvent);});task.querySelectorAll(':scope>.unorganized-task-row').forEach(row=>row.classList.toggle('checklist-kind-hidden',kind==='event'));if(liveAdd instanceof HTMLElement){liveAdd.textContent=kind==='event'?'＋ イベント':'＋ タスク';liveAdd.dataset.inputKind=kind;const input=task.querySelector('.section-quick-name');if(input){input.placeholder=kind==='event'?'新しいイベント':'新しいタスク';input.setAttribute('aria-label',input.placeholder);}if(liveAdd instanceof HTMLAnchorElement){const u=new URL(liveAdd.dataset.baseHref||liveAdd.href,location.href);u.searchParams.set('type',kind);if(kind==='event')u.searchParams.set('event','1');else u.searchParams.delete('event');liveAdd.href=u.pathname+u.search;}}if(ai instanceof HTMLAnchorElement){const u=new URL(ai.href,location.href);u.searchParams.set('type',kind);if(kind==='event')u.searchParams.set('event','1');else u.searchParams.delete('event');ai.href=u.pathname+u.search;}};
  tabs.addEventListener('click',e=>{const b=e.target.closest?.('button[data-kind]');if(b)apply(b.dataset.kind||'task');});apply('task');
 }

};

const setup=async()=>{
 if(location.pathname!=='/app/tasks.php')return;hideLegacy();decorateParents();
 const task=document.querySelector('.task-section');if(task instanceof HTMLElement){installStatusTabs(task);installSearch(task);const head=task.querySelector(':scope>.section-head'),toolbars=head?[...head.querySelectorAll(':scope>.checklist-section-tools')]:[],tools=toolbars[0];if(tools instanceof HTMLElement)for(const extra of toolbars.slice(1)){while(extra.firstChild)tools.append(extra.firstChild);extra.remove();}const add=[...task.querySelectorAll('a,button')].find(n=>/タスクを追加|＋\s*タスク/.test(String(n.textContent||'').trim())&&!/子タスク/.test(String(n.textContent||'')));if(add instanceof HTMLElement&&tools instanceof HTMLElement){add.classList.add('checklist-compact-action','task-add-top');add.textContent='＋ タスク';tools.append(add);}if(tools instanceof HTMLElement){const trash=document.createElement('button');trash.type='button';trash.className='checklist-icon-button task-delete-mode';trash.textContent='🗑️';trash.setAttribute('aria-label','タスク削除');tools.prepend(trash);const search=tools.querySelector('.checklist-search-toggle'),taskAdd=tools.querySelector('.task-add-top');if(search instanceof HTMLElement)trash.after(search);if(taskAdd instanceof HTMLElement)tools.append(taskAdd);const setTaskDeleteMode=on=>{task.classList.toggle('task-delete-mode-active',on);task.querySelectorAll('.task-delete-minus').forEach(n=>n.remove());if(on)task.querySelectorAll(':scope>.task-row[data-task-id],:scope>.unorganized-task-row[data-task-id]').forEach(row=>{const id=Number(row.dataset.taskId||0);if(id<=0)return;const main=row.querySelector(':scope>.task-main-row');if(!(main instanceof HTMLElement))return;const minus=document.createElement('button');minus.type='button';minus.className='task-delete-minus';minus.textContent='−';minus.setAttribute('aria-label','このタスクを削除');minus.addEventListener('click',async e=>{e.preventDefault();e.stopPropagation();const childCount=row.querySelectorAll(':scope>.task-children>.task-child-row').length;if(childCount&&!confirm('子タスクも含めてこのタスクを削除しますか？'))return;try{const r=await fetch('/api/task?id='+encodeURIComponent(String(id)),{method:'DELETE',credentials:'same-origin',headers:{'x-csrf':csrf,'accept':'application/json'}}),d=await r.json().catch(()=>({ok:false,error:'削除結果を確認できませんでした。'}));if(!r.ok||!d.ok)throw new Error(d.error||'削除に失敗しました。');row.remove();}catch(err){alert(err?.message||String(err));}});main.prepend(minus);});};trash.addEventListener('click',()=>{const on=!task.classList.contains('task-delete-mode-active');setTaskDeleteMode(on);trash.textContent=on?'✕':'🗑️';trash.setAttribute('aria-label',on?'削除モードを終了':'削除');trash.classList.toggle('text-button',on);});}}
 installUnifiedChecklist();
 document.dispatchEvent(new CustomEvent('familytodo:checklist-unified-ready'));
};
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>{setTimeout(()=>void setup(),0)},{once:true});else setTimeout(()=>void setup(),0);
})();
