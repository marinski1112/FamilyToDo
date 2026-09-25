(()=>{
'use strict';
const DAILY_PATH='/app/family_log.php';
const MANAGE_PATH='/app/settings_family_log.php';
const renameHousework=()=>{
  document.querySelectorAll('h1,h2,h3,p,span,strong').forEach(node=>{
    if(node.childElementCount)return;
    const text=String(node.textContent||'');
    if(text.includes('ちょこっと家事'))node.textContent=text.replaceAll('ちょこっと家事','日常家事');
    if(text.includes('クイック家事ボタン'))node.textContent=text.replaceAll('クイック家事ボタン','日常家事ボタン');
  });
};
const compactQuickCards=()=>{
  document.querySelectorAll('.family-quick-chore-record').forEach(button=>{
    const label=button.querySelector('strong');
    if(label){label.classList.add('family-log-compact-label');label.querySelectorAll('br').forEach(br=>br.replaceWith(''));}
  });
  document.querySelectorAll('.family-log-quick strong').forEach(label=>{
    label.classList.add('family-log-compact-label');
    label.querySelectorAll('br').forEach(br=>br.replaceWith(''));
  });
};
const constrainEditors=()=>{
  const chore=document.querySelector('#familyQuickChoreForm input[name="name"]');
  if(chore instanceof HTMLInputElement){chore.maxLength=6;chore.dataset.familyLogMaxChars='6';}
  document.querySelectorAll('#familyLogQuickManage input[name="name"],.family-log-quick-manage input[name="name"]').forEach(input=>{
    if(input instanceof HTMLInputElement){input.maxLength=4;input.dataset.familyLogMaxChars='4';}
  });
  const choreLabelText='名前（1〜6文字）';
  const choreLabel=chore?.previousElementSibling;
  if(choreLabel instanceof HTMLElement&&choreLabel.textContent?.includes('名前')&&choreLabel.textContent!==choreLabelText)choreLabel.textContent=choreLabelText;
  const choreHelpText='6文字以内で設定してください。既存の長い名前は自動で切断しません。';
  const choreHelp=chore?.nextElementSibling;
  if(choreHelp instanceof HTMLElement&&choreHelp.matches('p.small')&&choreHelp.textContent!==choreHelpText)choreHelp.textContent=choreHelpText;
};
const formatVisibleDate=value=>{
  const match=/^(\d{4})-(\d{2})-(\d{2})$/.exec(String(value||''));
  if(!match)return String(value||'日付');
  return `${match[1].slice(-2)}.${Number(match[2])}.${Number(match[3])}`;
};
const enhanceDatePicker=dateInput=>{
  if(!(dateInput instanceof HTMLInputElement))return;
  dateInput.classList.add('family-log-compact-date');
  dateInput.setAttribute('aria-label','表示する日付');
  const dateLabel=dateInput.closest('label');
  if(!(dateLabel instanceof HTMLLabelElement))return;
  dateLabel.classList.add('family-log-date-picker-label');
  let visibleDate=dateLabel.querySelector('.family-log-visible-date');
  if(!(visibleDate instanceof HTMLElement)){
    visibleDate=document.createElement('span');
    visibleDate.className='family-log-visible-date';
    visibleDate.setAttribute('aria-hidden','true');
    const dateAnchor=dateInput.closest('.native-control-shell')||dateInput;
    dateLabel.insertBefore(visibleDate,dateAnchor);
  }
  const syncVisibleDate=()=>{
    visibleDate.textContent=formatVisibleDate(dateInput.value);
    dateInput.title=dateInput.value?`日付を選択（${dateInput.value}）`:'日付を選択';
  };
  syncVisibleDate();
  if(!dateInput.dataset.familyLogVisibleDateBound){
    dateInput.dataset.familyLogVisibleDateBound='true';
    dateInput.addEventListener('input',syncVisibleDate);
    dateInput.addEventListener('change',syncVisibleDate);
  }
};
const buildToolbar=()=>{
  if(location.pathname!==DAILY_PATH)return;
  const page=document.querySelector('.family-log-page');
  const head=page?.querySelector(':scope > .family-log-head');
  const subjects=page?.querySelector(':scope > .family-log-subjects');
  const date=page?.querySelector(':scope > .family-log-date-head');
  if(!page||!head||!subjects||!date||page.querySelector(':scope > .family-log-compact-toolbar'))return;
  const toolbar=document.createElement('div');toolbar.className='family-log-compact-toolbar';
  const select=document.createElement('select');select.className='family-log-subject-select';select.setAttribute('aria-label','記録対象');
  [...subjects.querySelectorAll('a[href]')].forEach(link=>{
    const option=document.createElement('option');option.value=link.href;option.textContent=String(link.textContent||'').trim();option.selected=link.classList.contains('active');select.appendChild(option);
  });
  select.addEventListener('change',()=>{if(select.value)location.href=select.value;});
  toolbar.appendChild(select);
  const dateInput=date.querySelector('input[type="date"]');
  enhanceDatePicker(dateInput);
  const dateLinks=[...date.querySelectorAll('a[href]')];
  const previous=dateLinks[0],next=dateLinks.at(-1);
  if(previous){previous.textContent='‹';previous.setAttribute('aria-label','前の日');previous.title='前の日';}
  if(next&&next!==previous){next.textContent='›';next.setAttribute('aria-label','次の日');next.title='次の日';}
  toolbar.appendChild(date);
  const journal=head.querySelector('.family-log-journal-link');
  if(journal){
    const diaryNav=document.createElement('nav');diaryNav.className='family-log-bottom-journal';diaryNav.setAttribute('aria-label','日記');
    journal.textContent='📓 成長日記';diaryNav.appendChild(journal);
    head.querySelectorAll('.family-log-journal-link').forEach(link=>diaryNav.appendChild(link));
    const foods=document.createElement('a');foods.href='/app/child_foods.php';foods.textContent='🥕 食材リスト';diaryNav.appendChild(foods);
    page.appendChild(diaryNav);page.classList.add('family-log-has-bottom-journal');
  }
  const manage=head.querySelector('.family-log-gear');
  if(manage){manage.textContent='⚙️';manage.classList.add('family-log-compact-link','family-log-manage-link');manage.setAttribute('aria-label','家族ログ管理');manage.title='家族ログ管理';toolbar.appendChild(manage);}
  head.replaceWith(toolbar);subjects.remove();
  const timeline=page.querySelector(':scope > .family-log-timeline');
  if(timeline)toolbar.insertAdjacentElement('afterend',timeline);
};
// Move the already-bound controls; never clone buttons or attach save handlers.
const buildInputDock=()=>{
  if(location.pathname!==DAILY_PATH)return;
  const page=document.querySelector('.family-log-page');
  if(!page||page.querySelector('.family-log-input-dock'))return;
  const growth=[...page.querySelectorAll(':scope > .family-log-overview-quick,:scope > .family-log-quick-card')];
  const chores=[...page.querySelectorAll(':scope > .family-quick-chore-card')];
  if(!growth.length&&!chores.length)return;
  const toolbar=typeof page.querySelector==='function'?page.querySelector(':scope > .family-log-compact-toolbar'):null;
  if(toolbar){
    const labels=growth.flatMap(node=>typeof node.querySelectorAll==='function'?[...node.querySelectorAll(':scope > .family-log-overview-group > h2')]:[]);
    if(labels.length){
      const bar=document.createElement('div');
      bar.className='family-log-overview-subject-bar';
      bar.setAttribute('aria-label','記録の対象');
      bar.hidden=true;
      if(bar.style)bar.style.cssText='display:none;';
      const names=labels.map(label=>String(label.textContent||'').replace(/\s+クイック$/,'').trim());
      const subjectSelect=toolbar.querySelector('.family-log-subject-select');
      const allOption=subjectSelect?.querySelector('option');
      if(allOption&&names.length)allOption.textContent=names.join('・')+'（すべて）';
      labels.forEach(label=>{
        label.textContent=String(label.textContent||'').replace(/\s+クイック$/,'').trim();
        label.classList?.add('family-log-overview-subject-name');
        if(label.style)label.style.cssText='flex:0 0 auto;margin:0;padding:2px 8px;border:1px solid #e2e8f0;border-radius:999px;background:#f8fafc;color:#475569;font-size:12px;line-height:1.4;white-space:nowrap;';
        bar.appendChild(label);
      });
      if(bar.children?.length)toolbar.appendChild(bar);
    }
  }
  const dock=document.createElement('section');dock.className='family-log-input-dock';dock.setAttribute('aria-label','記録を追加');
  const toggle=document.createElement('button');toggle.type='button';toggle.className='family-log-input-swap';toggle.textContent='🔄';
  const entries=[];
  for(const [key,label,nodes] of [['growth','成長記録',growth],['chores','家事',chores]]){
    if(!nodes.length)continue;
    const panel=document.createElement('div');panel.id=`family-log-input-panel-${key}`;panel.className='family-log-input-panel';panel.setAttribute('role','group');panel.setAttribute('aria-label',label);
    entries.push({panel,nodes,label});
  }
  let active=0;
  const select=index=>{
    active=index;
    entries.forEach(({panel},i)=>{panel.hidden=i!==index;});
    const label=`${entries[index].label}を表示中。${entries[(index+1)%entries.length].label}へ切り替え`;
    toggle.setAttribute('aria-label',label);toggle.title=label;
  };
  toggle.addEventListener('click',()=>select((active+1)%entries.length));
  toggle.hidden=entries.length<2;
  dock.appendChild(toggle);
  entries.forEach(({panel})=>dock.appendChild(panel));
  select(0);
  page.appendChild(dock);
  entries.forEach(({panel,nodes})=>nodes.forEach(node=>panel.appendChild(node)));
  page.classList.add('family-log-has-input-dock');
};
const enhance=()=>{renameHousework();compactQuickCards();constrainEditors();buildToolbar();buildInputDock();};
enhance();
let queued=false;
new MutationObserver(()=>{if(queued)return;queued=true;queueMicrotask(()=>{queued=false;renameHousework();compactQuickCards();constrainEditors();});}).observe(document.body,{childList:true,subtree:true});
document.documentElement.dataset.familyLogCompactUi=location.pathname===MANAGE_PATH?'manage':'ready';document.body.classList.remove('family-log-boot');
})();
