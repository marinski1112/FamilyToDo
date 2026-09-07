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
    button.querySelector(':scope > span')?.remove();
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
  const choreLabel=chore?.previousElementSibling;
  if(choreLabel instanceof HTMLElement&&choreLabel.textContent?.includes('名前'))choreLabel.textContent='名前（1〜6文字）';
  const choreHelp=chore?.nextElementSibling;
  if(choreHelp instanceof HTMLElement&&choreHelp.matches('p.small'))choreHelp.textContent='6文字以内で設定してください。既存の長い名前は自動で切断しません。';
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
  toolbar.appendChild(date);
  const journal=head.querySelector('.family-log-journal-link');
  if(journal){journal.textContent='成長記録';journal.classList.add('family-log-compact-link');toolbar.appendChild(journal);}
  const manage=head.querySelector('.family-log-gear');
  if(manage){manage.textContent='管理';manage.classList.add('family-log-compact-link','family-log-manage-link');manage.setAttribute('aria-label','家族ログ管理');toolbar.appendChild(manage);}
  head.replaceWith(toolbar);subjects.remove();
};
const enhance=()=>{renameHousework();compactQuickCards();constrainEditors();buildToolbar();};
enhance();
let queued=false;
new MutationObserver(()=>{if(queued)return;queued=true;queueMicrotask(()=>{queued=false;renameHousework();compactQuickCards();constrainEditors();});}).observe(document.body,{childList:true,subtree:true});
document.documentElement.dataset.familyLogCompactUi=location.pathname===MANAGE_PATH?'manage':'ready';
})();
