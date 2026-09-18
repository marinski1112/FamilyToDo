(()=>{
'use strict';

const parsePayload=id=>{try{return JSON.parse(document.getElementById(id)?.textContent||'{}');}catch{return {};}};
const dailyPayload=parsePayload('dailyPayload');
const taskViewPayload=parsePayload('taskViewPayload');
const csrf=String(dailyPayload.csrf||taskViewPayload.csrf||'');
const UNCLASSIFIED='未分類';
const key=value=>String(value??'').trim().toLocaleLowerCase('ja-JP');
const uniqueNames=values=>{const out=[],seen=new Set();for(const value of values||[]){const name=String(value??'').trim();const k=key(name);if(!name||name===UNCLASSIFIED||seen.has(k))continue;seen.add(k);out.push(name);}return out;};

const hideNode=node=>{if(node instanceof HTMLElement){node.hidden=true;node.classList.add('task-link-ui-hidden');}};
const hideLegacyControls=()=>{
  for(const input of document.querySelectorAll('input[name="assignees"],select[name="completion_mode"]')){
    const shell=input.closest('[data-assignee-section],.assignee-grid,.assignees-field,.completion-mode-field,fieldset')||input.closest('label');
    hideNode(shell);
  }
  for(const select of document.querySelectorAll('select[name="task_id"]')){
    const shell=select.closest('.shopping-related-task-block,.task-link-section,details')||select.closest('label');
    hideNode(shell);
  }
  document.querySelectorAll('.task-shopping-add,.task-shopping-count,.task-shopping,.task-linked-items,.task-linked-shopping').forEach(hideNode);
  for(const heading of document.querySelectorAll('.card h2')){
    const text=String(heading.textContent||'');
    if(text.includes('このタスクの買い物')||text.includes('このタスクの持ち物'))hideNode(heading.closest('.card'));
  }
  for(const paragraph of document.querySelectorAll('p')){
    if(/^担当[：:]/.test(String(paragraph.textContent||'').trim()))hideNode(paragraph);
  }
  for(const meta of document.querySelectorAll('.task-row > .meta,.task-child-row > .meta')){
    const raw=String(meta.textContent||'');
    const parts=raw.split(' ・ ');
    if(parts.length>1&&parts[0].trim()){
      parts.shift();
      meta.textContent=parts.join(' ・ ').replace(/^\s*・\s*/,'');
    }else if(parts.length===1&&raw.trim()&&!/^\d{1,2}:\d{2}$/.test(raw.trim())){
      meta.textContent='';
    }
  }
  for(const meta of document.querySelectorAll('#taskDirectChildren .meta,.expired-meta')){
    meta.textContent=String(meta.textContent||'').replace(/\s*・\s*担当\s*[^・]+/g,'').replace(/担当\s*[^・]+\s*・?\s*/g,'');
  }
};

const decorateParentRows=()=>{
  for(const row of document.querySelectorAll('.task-row[data-task-id]')){
    if(!(row instanceof HTMLElement))continue;
    const children=row.querySelector(':scope > .task-children');
    if(!(children instanceof HTMLElement))continue;
    const childRows=[...children.querySelectorAll(':scope > .task-child-row')];
    if(!childRows.length)continue;
    row.classList.add('task-parent-row');
    let button=row.querySelector(':scope > .task-main-row .task-child-count-toggle');
    if(!(button instanceof HTMLButtonElement)){
      button=document.createElement('button');button.type='button';button.className='task-child-count-toggle';
      const actions=row.querySelector(':scope > .task-main-row .checklist-row-actions');
      if(actions instanceof HTMLElement)actions.prepend(button);else row.querySelector(':scope > .task-main-row')?.append(button);
      button.addEventListener('click',event=>{event.preventDefault();event.stopPropagation();children.hidden=!children.hidden;button.setAttribute('aria-expanded',children.hidden?'false':'true');button.textContent=`${childRows.length} ${children.hidden?'›':'⌄'}`;});
    }
    button.setAttribute('aria-label',`子タスク${childRows.length}件を開閉`);
    button.setAttribute('aria-expanded',children.hidden?'false':'true');
    button.textContent=`${childRows.length} ${children.hidden?'›':'⌄'}`;
  }
};

const requestJson=async(url,body)=>{
  const response=await fetch(url,{method:'POST',credentials:'same-origin',headers:{'content-type':'application/json','accept':'application/json'},body:JSON.stringify(body)});
  const data=await response.json().catch(()=>({ok:false,error:'サーバー応答を読み取れませんでした。'}));
  if(!response.ok||!data?.ok){const error=new Error(data?.error||'更新に失敗しました。');error.code=String(data?.code||'');throw error;}
  return data;
};

const chooseChildPolicy=count=>new Promise(resolve=>{
  const backdrop=document.createElement('div');backdrop.className='parent-completion-choice-backdrop';
  const sheet=document.createElement('div');sheet.className='parent-completion-choice';sheet.setAttribute('role','dialog');sheet.setAttribute('aria-modal','true');
  sheet.innerHTML=`<h2>未完了の子タスクが${Number(count)}件あります</h2><p>親タスクを完了するときの扱いを選んでください。</p><button type="button" class="parent-completion-complete">未完了の子タスクを全て完了にする</button><button type="button" class="parent-completion-promote">未完了の子タスクを親タスクとして残す</button><button type="button" class="parent-completion-cancel">キャンセル</button>`;
  backdrop.append(sheet);document.body.append(backdrop);
  const finish=value=>{backdrop.remove();resolve(value);};
  sheet.querySelector('.parent-completion-complete')?.addEventListener('click',()=>finish('complete'));
  sheet.querySelector('.parent-completion-promote')?.addEventListener('click',()=>finish('promote'));
  sheet.querySelector('.parent-completion-cancel')?.addEventListener('click',()=>finish(null));
  backdrop.addEventListener('click',event=>{if(event.target===backdrop)finish(null);});
});

const parentCandidate=target=>{
  if(!(target instanceof HTMLInputElement)||!target.checked)return null;
  if(target.id==='done'){
    const id=Number(taskViewPayload.id||0);
    return String(taskViewPayload.toggleType||'')==='task'&&id>0?{id,target}:null;
  }
  if(!target.matches('input.toggle[data-type="task"]'))return null;
  if(target.closest('.task-child-row'))return null;
  const row=target.closest('.task-row[data-task-id]');
  const id=Number(row?.getAttribute('data-task-id')||target.dataset.id||0);
  return row&&id>0?{id,target}:null;
};

const completeParent=async(candidate)=>{
  const target=candidate.target;
  target.checked=false;target.disabled=true;
  try{
    const inspection=await requestJson('/api/task-parent-completion',{csrf,id:candidate.id,action:'inspect'});
    const count=Number(inspection.incomplete_children||0);
    if(count<=0){
      await requestJson('/api/toggle',{csrf,type:'task',id:candidate.id,completed:true});
      location.reload();return;
    }
    const policy=await chooseChildPolicy(count);
    if(!policy)return;
    await requestJson('/api/task-parent-completion',{csrf,id:candidate.id,action:'complete',child_policy:policy});
    location.reload();
  }catch(error){alert(error?.message||String(error));}
  finally{target.disabled=false;}
};

document.addEventListener('change',event=>{
  const candidate=parentCandidate(event.target);
  if(!candidate)return;
  event.preventDefault();event.stopPropagation();event.stopImmediatePropagation();
  void completeParent(candidate);
},true);

const waitFor=async(test,frames=120)=>{
  for(let i=0;i<frames;i++){const value=test();if(value)return value;await new Promise(resolve=>requestAnimationFrame(resolve));}
  return test();
};

const addCountToggle=(group,count,toggleSelector)=>{
  if(!(group instanceof HTMLElement))return;
  const head=group.querySelector(':scope > .shopping-category-title,:scope > .belongings-category-head');
  if(!(head instanceof HTMLElement))return;
  let button=head.querySelector('.checklist-category-count-toggle');
  if(!(button instanceof HTMLButtonElement)){
    button=document.createElement('button');button.type='button';button.className='checklist-category-count-toggle';
    const nativeToggle=head.querySelector(toggleSelector);head.insertBefore(button,nativeToggle||null);
    button.addEventListener('click',event=>{event.preventDefault();event.stopPropagation();const native=head.querySelector(toggleSelector);if(native instanceof HTMLButtonElement)native.click();});
  }
  button.textContent=String(count);button.setAttribute('aria-label',`${String(group.dataset.category||UNCLASSIFIED)} ${count}件を開閉`);
};

const renderZeroCluster=(section,kind,names)=>{
  section.querySelector(`:scope > .zero-category-cluster[data-kind="${kind}"]`)?.remove();
  if(!names.length)return;
  const details=document.createElement('details');details.className='zero-category-cluster';details.dataset.kind=kind;
  const summary=document.createElement('summary');summary.innerHTML=`<span>0件のカテゴリ</span><span>${names.length}</span>`;details.append(summary);
  const list=document.createElement('div');list.className='zero-category-cluster-list';
  for(const name of names){const row=document.createElement('div');row.className='zero-category-cluster-row';row.textContent=name;list.append(row);}details.append(list);
  const head=section.querySelector(':scope > .section-head');if(head)head.insertAdjacentElement('afterend',details);else section.prepend(details);
};

const installDeletePanel=(section,kind,categories,canManage)=>{
  if(!canManage||!categories.length||section.querySelector(`.category-bulk-delete-open[data-kind="${kind}"]`))return;
  const button=document.createElement('button');button.type='button';button.className='category-bulk-delete-open';button.dataset.kind=kind;button.textContent='🗑️ カテゴリ削除';
  const addButton=[...section.querySelectorAll('button')].find(node=>/カテゴリ/.test(String(node.textContent||''))&&/(追加|\＋|\+)/.test(String(node.textContent||'')));
  if(addButton instanceof HTMLElement)addButton.insertAdjacentElement('afterend',button);else section.querySelector(':scope > .section-head')?.append(button);
  const panel=document.createElement('div');panel.className='category-delete-panel';panel.hidden=true;
  const list=document.createElement('div');list.className='category-delete-panel-list';
  for(const name of categories){const label=document.createElement('label'),box=document.createElement('input'),span=document.createElement('span');box.type='checkbox';box.value=name;span.textContent=name;label.append(box,span);list.append(label);}panel.append(list);
  const actions=document.createElement('div');actions.className='category-delete-panel-actions';actions.innerHTML='<button type="button" class="category-delete-cancel">キャンセル</button><button type="button" class="category-delete-confirm">選択したカテゴリを削除</button>';panel.append(actions);button.insertAdjacentElement('afterend',panel);
  button.addEventListener('click',()=>{panel.hidden=!panel.hidden;});
  panel.querySelector('.category-delete-cancel')?.addEventListener('click',()=>{panel.hidden=true;for(const box of panel.querySelectorAll('input[type="checkbox"]'))box.checked=false;});
  panel.querySelector('.category-delete-confirm')?.addEventListener('click',async()=>{
    const names=[...panel.querySelectorAll('input[type="checkbox"]:checked')].map(box=>String(box.value||'')).filter(Boolean);if(!names.length)return;
    if(!confirm(`${names.length}個のカテゴリを削除します。中の項目は未分類へ移動します。`))return;
    try{await requestJson('/api/shopping-category-mutation',{csrf,action:'delete_many',kind,names});location.reload();}catch(error){alert(error?.message||String(error));}
  });
};

const setupCategoryUx=async()=>{
  if(location.pathname!=='/app/tasks.php')return;
  const shoppingSection=document.querySelector('.shopping-checklist-section');
  const itemSection=document.querySelector('.item-section,#itemSec');
  const date=String(new URLSearchParams(location.search).get('date')||dailyPayload.date||'');
  let shoppingData={ok:false,categories:[],canManageCategories:false},itemData={ok:false,categories:[],items:[]};
  try{const r=await fetch('/api/shopping-categories',{credentials:'same-origin',headers:{accept:'application/json'},cache:'no-store'});shoppingData=await r.json();}catch{}
  try{const suffix=/^\d{4}-\d{2}-\d{2}$/.test(date)?`&date=${encodeURIComponent(date)}`:'';const r=await fetch(`/api/item?view=categories${suffix}`,{credentials:'same-origin',headers:{accept:'application/json'},cache:'no-store'});itemData=await r.json();}catch{}

  if(shoppingSection instanceof HTMLElement){
    await waitFor(()=>shoppingSection.querySelector('.shopping-category-group')||shoppingSection.querySelector('.shopping-category-add'));
    const active=new Set();
    for(const group of shoppingSection.querySelectorAll(':scope > .shopping-category-group')){
      if(!(group instanceof HTMLElement))continue;const count=group.querySelectorAll(':scope > .linked-shopping-row').length;const name=String(group.dataset.category||UNCLASSIFIED).trim()||UNCLASSIFIED;
      if(count>0){active.add(key(name));group.hidden=false;addCountToggle(group,count,'.shopping-category-toggle');}else if(name!==UNCLASSIFIED)group.hidden=true;
    }
    const categories=uniqueNames(shoppingData.categories||[]);const zero=categories.filter(name=>!active.has(key(name)));
    renderZeroCluster(shoppingSection,'shopping',zero);
    installDeletePanel(shoppingSection,'shopping',categories,Boolean(shoppingData.canManageCategories));
  }

  if(itemSection instanceof HTMLElement){
    await waitFor(()=>itemSection.querySelector('.belongings-category-toolbar')||itemSection.querySelector('.belongings-category-group'));
    const active=new Set((Array.isArray(itemData.items)?itemData.items:[]).map(item=>key(String(item?.category||'').trim()||UNCLASSIFIED)));
    for(const group of itemSection.querySelectorAll(':scope > .belongings-category-group')){
      if(!(group instanceof HTMLElement))continue;const name=String(group.dataset.category||UNCLASSIFIED).trim()||UNCLASSIFIED;const count=group.querySelectorAll(':scope > .belongings-category-body > .belongings-category-row').length;
      if(count>0||name===UNCLASSIFIED){group.hidden=false;if(count>0)addCountToggle(group,count,'.belongings-category-toggle');}else group.hidden=true;
    }
    const categories=uniqueNames(itemData.categories||[]);const zero=categories.filter(name=>!active.has(key(name)));
    renderZeroCluster(itemSection,'item',zero);
    installDeletePanel(itemSection,'item',categories,Boolean(shoppingData.canManageCategories));
  }
};

const boot=()=>{hideLegacyControls();decorateParentRows();void setupCategoryUx();};
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
})();
