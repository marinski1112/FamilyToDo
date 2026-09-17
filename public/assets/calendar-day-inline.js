(()=>{
'use strict';
if(location.pathname!=='/app/calendar.php')return;
const modalBody=document.getElementById('modalBody');
const modalAdd=document.getElementById('modalAdd');
const modalScroll=document.querySelector('#dayModal .modal-scroll');
if(!(modalBody instanceof HTMLElement))return;
let payload={};
try{payload=JSON.parse(document.getElementById('calendarPayload')?.textContent||'{}')}catch{}
const csrf=String(payload.csrf||'');
let suppressClickUntil=0,dragState=null,enhanceQueued=false;

const style=document.createElement('style');
style.textContent=`
#dayModal .calendar-inline-title-text{cursor:text;-webkit-touch-callout:none}
#dayModal .calendar-inline-title-input{width:100%;min-width:0;border:0;border-bottom:1.5px solid #007aff;border-radius:0;background:transparent;color:inherit;font:inherit;font-weight:inherit;line-height:1.35;padding:1px 0;outline:0;box-shadow:none}
#dayModal .calendar-detail-link{display:inline-grid;place-items:center;flex:0 0 32px;width:32px;height:32px;margin-left:auto;border-radius:50%;background:#eef6ff;color:#007aff;text-decoration:none;font-size:16px;font-weight:800}
#dayModal .calendar-day-draggable{touch-action:pan-y}
#dayModal .calendar-day-dragging{position:relative;z-index:6;opacity:.78;background:#f2f7ff!important;box-shadow:0 5px 16px rgba(0,0,0,.12)}
#dayModal .calendar-day-drop-target{box-shadow:inset 0 2px 0 rgba(0,122,255,.5)}
#dayModal .calendar-reorder-controls,#dayModal #modalReorder{display:none!important}
`;
document.head.append(style);

const selectedDate=()=>{
  try{return new URL(modalAdd?.href||'',location.origin).searchParams.get('date')||''}catch{return''}
};
const rowType=row=>{
  if(!(row instanceof HTMLElement))return'';
  if(row.matches('[data-task-row]'))return Number(row.dataset.taskRow||0)>0?'task':'';
  if(row.querySelector('.calendar-shop-toggle[data-id]'))return'shopping';
  if(row.querySelector('.calendar-item-toggle[data-id]'))return'item';
  return'';
};
const rowId=row=>{
  const type=rowType(row);
  if(type==='task')return Number(row.dataset.taskRow||0);
  if(type==='shopping')return Number(row.querySelector('.calendar-shop-toggle[data-id]')?.dataset.id||0);
  if(type==='item')return Number(row.querySelector('.calendar-item-toggle[data-id]')?.dataset.id||0);
  return 0;
};
const storageKey=(date,type)=>`familytodo:calendar-day-order:${date}:${type}`;
const rowsByType=type=>[...modalBody.querySelectorAll('.modal-row')].filter(row=>rowType(row)===type);

const applyStoredOrder=()=>{
  const date=selectedDate();if(!date)return;
  for(const type of ['task','shopping','item']){
    let ids=[];try{ids=JSON.parse(localStorage.getItem(storageKey(date,type))||'[]')}catch{}
    if(!Array.isArray(ids)||!ids.length)continue;
    const rows=rowsByType(type),byId=new Map(rows.map(row=>[rowId(row),row]));
    const ordered=ids.map(Number).map(id=>byId.get(id)).filter(Boolean);
    for(const row of rows)if(!ordered.includes(row))ordered.push(row);
    if(!ordered.length)continue;
    const parent=rows[0]?.parentNode,anchor=rows.at(-1)?.nextSibling||null;if(!parent)continue;
    for(const row of ordered)parent.insertBefore(row,anchor);
  }
};
const saveLocalOrder=type=>{
  const date=selectedDate();if(!date)return;
  const ids=rowsByType(type).map(rowId).filter(id=>id>0);
  try{localStorage.setItem(storageKey(date,type),JSON.stringify(ids))}catch{}
};
const persistTaskOrder=async()=>{
  const date=selectedDate();if(!date||!csrf)return;
  const ids=rowsByType('task').map(rowId).filter(id=>id>0);
  if(ids.length<2)return;
  const response=await fetch('/app/api/reorder.php',{method:'POST',headers:{'content-type':'application/json'},credentials:'same-origin',body:JSON.stringify({csrf,date,ids})});
  const data=await response.json().catch(()=>null);
  if(!response.ok||!data?.ok)throw new Error(String(data?.error||'並べ替えを保存できませんでした。'));
};

const postTitle=async(type,id,title)=>{
  const response=await fetch('/api/checklist/inline-title',{method:'POST',headers:{'content-type':'application/json','accept':'application/json'},credentials:'same-origin',body:JSON.stringify({csrf,type,id,title})});
  const data=await response.json().catch(()=>null);
  if(!response.ok||!data?.ok)throw new Error(String(data?.error||'保存できませんでした。'));
  return String(data.title||title);
};

const decorateTask=row=>{
  const rawId=Number(row.dataset.taskRow||0);
  const anchor=row.querySelector('.modal-task-copy>strong>a');
  if(!(anchor instanceof HTMLAnchorElement))return;
  let apiType='task',apiId=rawId;
  if(rawId<0){
    try{apiId=Number(new URL(anchor.href,location.origin).searchParams.get('edit')||0)}catch{apiId=0}
    apiType='recurrence';
  }
  if(!apiId)return;
  const small=anchor.querySelector('small')?.cloneNode(true);
  const text=[...anchor.childNodes].filter(n=>n.nodeType===Node.TEXT_NODE).map(n=>n.textContent||'').join('').trim();
  const icon=text.startsWith('📌')?'📌':'📝';
  const title=text.replace(/^[📌📝]\s*/u,'').trim();
  anchor.textContent='';anchor.append(document.createTextNode(icon+' '));
  const titleNode=document.createElement('span');titleNode.className='calendar-inline-title-text';titleNode.dataset.inlineType=apiType;titleNode.dataset.inlineId=String(apiId);titleNode.textContent=title;anchor.append(titleNode);
  if(small){anchor.append(document.createTextNode(' '));anchor.append(small)}
  if(!row.querySelector(':scope .calendar-detail-link')){
    const info=document.createElement('a');info.className='calendar-detail-link';info.href=anchor.href;info.textContent='i';info.setAttribute('aria-label','詳細を開く');info.title='詳細';
    row.querySelector('.modal-row-main')?.append(info);
  }
  if(rawId>0)row.classList.add('calendar-day-draggable');
};
const decorateShopping=row=>{
  const check=row.querySelector('.calendar-shop-toggle[data-id]'),strong=row.querySelector('.modal-check-row strong');
  if(!(check instanceof HTMLInputElement)||!(strong instanceof HTMLElement))return;
  const raw=String(strong.textContent||'').trim().replace(/^🛒\s*/u,'');
  const match=raw.match(/^(.*?)(\s+×\s+.+)?$/u),title=String(match?.[1]||raw).trim(),suffix=String(match?.[2]||'');
  strong.textContent='🛒 ';
  const node=document.createElement('span');node.className='calendar-inline-title-text';node.dataset.inlineType='shopping';node.dataset.inlineId=String(check.dataset.id||'');node.dataset.inlineSuffix=suffix;node.textContent=title;strong.append(node);if(suffix)strong.append(document.createTextNode(suffix));
  row.classList.add('calendar-day-draggable');
};
const decorateItem=row=>{
  const check=row.querySelector('.calendar-item-toggle[data-id]'),strong=row.querySelector('.modal-check-row strong');
  if(!(check instanceof HTMLInputElement)||!(strong instanceof HTMLElement))return;
  const title=String(strong.textContent||'').trim().replace(/^🎒\s*/u,'');
  strong.textContent='🎒 ';
  const node=document.createElement('span');node.className='calendar-inline-title-text';node.dataset.inlineType='item';node.dataset.inlineId=String(check.dataset.id||'');node.textContent=title;strong.append(node);
  row.classList.add('calendar-day-draggable');
};

const enhance=()=>{
  modalBody.querySelectorAll('.modal-row').forEach(row=>{
    if(!(row instanceof HTMLElement)||row.dataset.calendarInlineEnhanced==='1')return;
    if(row.matches('[data-task-row]'))decorateTask(row);
    else if(row.querySelector('.calendar-shop-toggle[data-id]'))decorateShopping(row);
    else if(row.querySelector('.calendar-item-toggle[data-id]'))decorateItem(row);
    row.dataset.calendarInlineEnhanced='1';
  });
  applyStoredOrder();
};

const startEdit=node=>{
  if(!(node instanceof HTMLElement)||node.dataset.editing==='1'||Date.now()<suppressClickUntil)return;
  const type=String(node.dataset.inlineType||''),id=Number(node.dataset.inlineId||0),original=String(node.textContent||'').trim();
  if(!type||!id||!original)return;
  node.dataset.editing='1';
  const input=document.createElement('input');input.className='calendar-inline-title-input';input.type='text';input.maxLength=200;input.value=original;input.setAttribute('aria-label','名前を編集');
  node.replaceWith(input);input.focus();input.select();
  let settled=false;
  const restore=value=>{const fresh=node;fresh.textContent=value;delete fresh.dataset.editing;input.replaceWith(fresh)};
  const commit=async()=>{
    if(settled)return;settled=true;
    const title=input.value.trim();if(!title){settled=false;input.focus();return}
    input.disabled=true;
    try{restore(await postTitle(type,id,title));}
    catch(error){restore(original);alert(error instanceof Error?error.message:'保存できませんでした。')}
  };
  input.addEventListener('keydown',event=>{
    if(event.isComposing)return;
    if(event.key==='Enter'){event.preventDefault();commit()}
    else if(event.key==='Escape'){event.preventDefault();settled=true;restore(original)}
  });
  input.addEventListener('blur',()=>commit(),{once:true});
  input.addEventListener('click',event=>event.stopPropagation());
};

modalBody.addEventListener('click',event=>{
  const title=event.target instanceof Element?event.target.closest('.calendar-inline-title-text'):null;
  if(!title)return;
  event.preventDefault();event.stopPropagation();startEdit(title);
},true);

const clearDragMarks=()=>modalBody.querySelectorAll('.calendar-day-drop-target').forEach(n=>n.classList.remove('calendar-day-drop-target'));
const finishDrag=async(cancel=false)=>{
  const state=dragState;if(!state)return;dragState=null;clearTimeout(state.timer);clearDragMarks();
  if(!state.active)return;
  state.row.classList.remove('calendar-day-dragging');suppressClickUntil=Date.now()+450;
  if(cancel)return;
  saveLocalOrder(state.type);
  if(state.type==='task')try{await persistTaskOrder()}catch(error){alert(error instanceof Error?error.message:'並べ替えを保存できませんでした。')}
};
modalBody.addEventListener('pointerdown',event=>{
  if(!(event.target instanceof Element)||event.button>0)return;
  const title=event.target.closest('.calendar-inline-title-text'),row=title?.closest('.calendar-day-draggable');
  if(!(title instanceof HTMLElement)||!(row instanceof HTMLElement)||title.dataset.editing==='1')return;
  const type=rowType(row);if(!type)return;
  const state={row,type,pointerId:event.pointerId,startX:event.clientX,startY:event.clientY,active:false,timer:0};
  state.timer=window.setTimeout(()=>{if(dragState!==state)return;state.active=true;row.classList.add('calendar-day-dragging');try{row.setPointerCapture(event.pointerId)}catch{};if(navigator.vibrate)navigator.vibrate(20)},420);
  dragState=state;
},{passive:true});
modalBody.addEventListener('pointermove',event=>{
  const state=dragState;if(!state||state.pointerId!==event.pointerId)return;
  if(!state.active){if(Math.hypot(event.clientX-state.startX,event.clientY-state.startY)>12){clearTimeout(state.timer);dragState=null}return}
  event.preventDefault();
  const under=document.elementFromPoint(event.clientX,event.clientY),target=under?.closest?.('.modal-row');
  if(target instanceof HTMLElement&&target!==state.row&&rowType(target)===state.type){
    clearDragMarks();const rect=target.getBoundingClientRect();if(event.clientY<rect.top+rect.height/2)target.before(state.row);else target.after(state.row);target.classList.add('calendar-day-drop-target');
  }
  if(modalScroll instanceof HTMLElement){const rect=modalScroll.getBoundingClientRect();if(event.clientY<rect.top+56)modalScroll.scrollTop-=10;else if(event.clientY>rect.bottom-56)modalScroll.scrollTop+=10}
},{passive:false});
modalBody.addEventListener('pointerup',event=>{if(dragState?.pointerId===event.pointerId)finishDrag(false)});
modalBody.addEventListener('pointercancel',event=>{if(dragState?.pointerId===event.pointerId)finishDrag(true)});

new MutationObserver(()=>{if(enhanceQueued)return;enhanceQueued=true;queueMicrotask(()=>{enhanceQueued=false;enhance()})}).observe(modalBody,{childList:true,subtree:true});
enhance();
})();
