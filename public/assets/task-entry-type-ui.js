(() => {
'use strict';
try{
  const preview=document.getElementById('roughPreview');
  if(!preview)return;
  const cleanEventRow=row=>{
    if(!(row instanceof Element)||row.dataset.destination!=='event')return;
    row.querySelector('.rough-main-assignees')?.remove();
    row.querySelector('.rough-main-completion')?.closest('label')?.remove();
  };
  const scan=root=>{
    if(root instanceof Element&&root.matches('.rough-draft-row'))cleanEventRow(root);
    root.querySelectorAll?.('.rough-draft-row').forEach(cleanEventRow);
  };
  scan(preview);
  new MutationObserver(records=>{
    for(const record of records)for(const node of record.addedNodes)if(node instanceof Element)scan(node);
  }).observe(preview,{childList:true,subtree:true});
  document.documentElement.dataset.taskEntryTypeUi='ready';
}catch{document.documentElement.dataset.taskEntryTypeUi='error';}
})();
