(() => {
'use strict';
try{
  const preview=document.getElementById('roughPreview');
  if(!preview)return;
  const form=document.getElementById('taskForm');
  if(!document.getElementById('taskEntryTypeFollowupStyle')){
    const style=document.createElement('style');
    style.id='taskEntryTypeFollowupStyle';
    style.textContent=`.task-rough-input .rough-return-manual{display:inline-flex;align-items:center;min-height:44px;margin:2px 0 8px;padding:6px 0;border:0;background:none;color:#475569;font:inherit;font-size:13px;text-decoration:underline;text-underline-offset:3px;cursor:pointer}
@media(max-width:640px){
  .task-rough-input .rough-detail-grid{grid-template-columns:minmax(0,1fr)!important}
  .task-rough-input .rough-detail-grid>label,.task-rough-input .rough-detail-grid>fieldset{min-width:0!important;max-width:100%!important}
  .task-rough-input .rough-detail-grid input:not([type=checkbox]),.task-rough-input .rough-detail-grid select,.task-rough-input .rough-detail-grid textarea{display:block;width:100%!important;min-width:0!important;max-width:100%!important;box-sizing:border-box!important}
}`;
    document.head.appendChild(style);
  }
  const manualFields=()=>document.getElementById('taskManualFields');
  const showManual=()=>{
    const manual=manualFields();
    if(manual)manual.hidden=false;
  };
  const returnToManual=()=>{
    preview.hidden=true;
    const manual=manualFields();
    if(!manual)return;
    manual.hidden=false;
    manual.open=true;
    manual.scrollIntoView({block:'nearest'});
    requestAnimationFrame(()=>manual.querySelector('[name=title]')?.focus());
  };
  const ensureManualReturn=()=>{
    if(preview.querySelector('.rough-return-manual'))return;
    const button=document.createElement('button');
    button.type='button';
    button.className='rough-return-manual';
    button.textContent='手入力に戻す';
    button.addEventListener('click',returnToManual);
    const intro=preview.querySelector(':scope > p');
    if(intro)intro.after(button);else preview.prepend(button);
  };
  const syncManualState=()=>{
    const manual=manualFields();
    if(!manual)return;
    const hasVisibleDraft=!preview.hidden&&Boolean(preview.querySelector('.rough-draft-row'));
    if(hasVisibleDraft){
      manual.open=false;
      manual.hidden=true;
      ensureManualReturn();
    }else{
      showManual();
    }
  };
  const setLabelText=(input,text)=>{
    const label=input?.closest('label');
    if(label?.firstChild?.nodeType===Node.TEXT_NODE)label.firstChild.textContent=text;
  };
  const cleanEventRow=row=>{
    if(!(row instanceof Element)||row.dataset.destination!=='event')return;
    row.querySelector('.rough-main-assignees')?.remove();
    row.querySelector('.rough-main-completion')?.closest('label')?.remove();
    row.querySelector('.rough-main-no-date')?.closest('label')?.remove();
    const start=row.querySelector('.rough-main-start-date');
    if(start){
      start.required=true;
      start.setAttribute('aria-required','true');
      setLabelText(start,'開始日（必須）');
    }
    setLabelText(row.querySelector('.rough-main-end-date'),'終了日');
  };
  const scan=root=>{
    if(root instanceof Element&&root.matches('.rough-draft-row'))cleanEventRow(root);
    root.querySelectorAll?.('.rough-draft-row').forEach(cleanEventRow);
  };
  scan(preview);
  syncManualState();
  new MutationObserver(records=>{
    for(const record of records){
      for(const node of record.addedNodes)if(node instanceof Element)scan(node);
    }
    syncManualState();
  }).observe(preview,{childList:true,subtree:true,attributes:true,attributeFilter:['hidden']});
  form?.querySelectorAll('[name=rough_primary_type]').forEach(input=>input.addEventListener('change',()=>queueMicrotask(syncManualState)));
  document.documentElement.dataset.taskEntryTypeUi='ready';
}catch{document.documentElement.dataset.taskEntryTypeUi='error';}
})();