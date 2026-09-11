(() => {
'use strict';
try{
  const STORAGE_KEY='familytodo:lastCalendarColor';
  const valid=value=>/^#[0-9a-f]{6}$/i.test(String(value||'').trim());
  const normalized=value=>String(value||'').trim().toLowerCase();
  const isCreatePage=()=>Boolean(document.getElementById('taskNewPayload'))&&!document.getElementById('taskEditForm');
  const stripLegacyLabel=text=>String(text||'').replace(/\s*[（(]TimeTree[）)]\s*/gu,'').trim();
  const ensureOption=(select,value)=>{
    const color=normalized(value);if(!valid(color))return null;
    let option=[...select.options].find(entry=>normalized(entry.value)===color);
    if(!option){option=document.createElement('option');option.value=color;option.textContent=`カスタム ${color}`;option.dataset.customColor='1';select.prepend(option);}
    return option;
  };
  const remember=value=>{if(!isCreatePage()||!valid(value))return;try{localStorage.setItem(STORAGE_KEY,normalized(value));}catch{}}
  const swatchFor=select=>{
    let swatch=select.nextElementSibling?.classList?.contains('calendar-color-swatch')?select.nextElementSibling:null;
    if(!swatch){swatch=document.createElement('span');swatch.className='calendar-color-swatch';swatch.setAttribute('aria-hidden','true');swatch.style.display='inline-block';swatch.style.width='1.15em';swatch.style.height='1.15em';swatch.style.borderRadius='50%';swatch.style.verticalAlign='middle';swatch.style.marginLeft='0.5em';swatch.style.border='1px solid currentColor';select.insertAdjacentElement('afterend',swatch);}
    return swatch;
  };
  const syncSwatch=select=>{const swatch=swatchFor(select),value=normalized(select.value);if(valid(value))swatch.style.backgroundColor=value;};
  const customInputFor=select=>{
    const root=select.closest('#taskCalendarColorWrap,#editCalendarColorWrap')||select.parentElement;
    return root?.querySelector('input[type=color]')||null;
  };
  const enhance=select=>{
    if(!(select instanceof HTMLSelectElement))return;
    for(const option of select.options)option.textContent=stripLegacyLabel(option.textContent||option.value);
    if(select.dataset.calendarColorUi!=='1'){
      select.dataset.calendarColorUi='1';
      if(isCreatePage()&&select.name==='calendar_color'){
        let stored='';try{stored=localStorage.getItem(STORAGE_KEY)||'';}catch{}
        if(valid(stored)){ensureOption(select,stored);select.value=normalized(stored);}
      }
      select.addEventListener('change',()=>{
        const value=normalized(select.value),custom=customInputFor(select);
        if(custom&&valid(value))custom.value=value;
        syncSwatch(select);remember(value);
      });
      const custom=customInputFor(select);
      if(custom&&custom.dataset.calendarColorUi!=='1'){
        custom.dataset.calendarColorUi='1';
        custom.addEventListener('input',()=>{
          const value=normalized(custom.value);if(!valid(value))return;
          ensureOption(select,value);select.value=value;syncSwatch(select);remember(value);
        });
      }
    }
    const value=normalized(select.value),custom=customInputFor(select);if(custom&&valid(value))custom.value=value;
    syncSwatch(select);
  };
  const scan=root=>{
    if(root instanceof HTMLSelectElement&&(root.name==='calendar_color'||root.classList.contains('rough-main-calendar-color')))enhance(root);
    root.querySelectorAll?.('select[name="calendar_color"],select.rough-main-calendar-color').forEach(enhance);
  };
  scan(document);
  new MutationObserver(records=>{for(const record of records)for(const node of record.addedNodes)if(node instanceof Element)scan(node);}).observe(document.documentElement,{childList:true,subtree:true});
  document.documentElement.dataset.calendarColorUi='ready';
}catch{document.documentElement.dataset.calendarColorUi='error';}
})();