(()=>{
  'use strict';
  const form=document.querySelector('#taskForm,#taskEditForm');
  if(!form)return;
  const sections=[
    {toggle:form.querySelector('#shopToggle,#shoppingToggle'),box:form.querySelector('#shopBox,#shoppingBox'),rows:form.querySelector('#shopRows,#shoppingRows'),name:'shopping_name[]',label:'🛒 買い物'},
    {toggle:form.querySelector('#itemToggle,#itemsToggle'),box:form.querySelector('#itemBox,#itemsBox'),rows:form.querySelector('#itemRows'),name:'item_name[]',label:'🎒 持ち物'},
  ];
  const setOpen=(section,open)=>{section.box.style.display=open?'block':'none';section.toggle.setAttribute('aria-expanded',String(open));};
  const updateCount=section=>{const count=Array.from(section.rows.querySelectorAll('input')).filter(input=>input.name===section.name&&input.value.trim()).length;section.toggle.textContent=`${section.label} · ${count}件`;};
  const enhanceRow=row=>{
    if(row.dataset.linkedCompact)return;
    row.dataset.linkedCompact='1';row.classList.add('task-linked-row');
    const shopping=Boolean(row.querySelector('[name="shopping_name[]"]'));
    let remove=row.querySelector('.remove-child,.remove-shopping-row');
    if(!remove){remove=document.createElement('button');remove.type='button';remove.className='btn gray small';remove.textContent='×';row.append(remove);}
    remove.dataset.linkedRemove='1';remove.setAttribute('aria-label',shopping?'この買い物行を削除':'この持ち物行を削除');
    for(const [name,label] of [['shopping_name[]','商品名'],['shopping_quantity[]','数量'],['shopping_category[]','カテゴリー'],['shopping_url[]','商品URL'],['item_name[]','持ち物名']]){
      const input=row.querySelector(`[name="${name}"]`);if(input&&input.type!=='hidden')input.setAttribute('aria-label',label);
    }
    if(shopping){
      const details=document.createElement('details');details.className='task-linked-options';
      const summary=document.createElement('summary');summary.textContent='分類・リンク';details.append(summary);
      const controls=Array.from(row.children).filter(el=>el.matches('.task-shopping-category-select,.task-shopping-category-custom,input[name="shopping_category[]"]:not([type="hidden"]),input[name="shopping_url[]"]'));
      controls.forEach(el=>details.append(el));row.append(details);
      const update=()=>{const category=row.querySelector('[name="shopping_category[]"]')?.value||'',url=row.querySelector('[name="shopping_url[]"]')?.value||'';summary.textContent=['分類・リンク',category.trim(),url.trim()?'URLあり':''].filter(Boolean).join(' · ');};
      row.addEventListener('input',update);row.addEventListener('change',()=>queueMicrotask(update));update();
    }
  };
  for(const section of sections){
    if(!section.toggle||!section.box||!section.rows)continue;
    section.toggle.setAttribute('aria-controls',section.box.id);setOpen(section,false);
    section.toggle.onclick=()=>setOpen(section,section.box.style.display==='none');
    const enhance=()=>{Array.from(section.rows.children).forEach(enhanceRow);updateCount(section);};
    enhance();new MutationObserver(enhance).observe(section.rows,{childList:true});
    section.rows.addEventListener('input',()=>updateCount(section));
  }
  form.addEventListener('click',event=>{
    const button=event.target.closest?.('[data-linked-remove]');if(!button)return;
    event.preventDefault();event.stopPropagation();
    const row=button.closest('.task-linked-row'),section=sections.find(value=>value.rows?.contains(row));
    const next=row?.nextElementSibling||row?.previousElementSibling;
    row?.remove();next?.querySelector('input:not([type="hidden"])')?.focus();
    if(section){updateCount(section);if(!next)section.box.querySelector('button')?.focus();}
  });
  // Keep optional edit settings in native disclosures without disabling form values.
  if(form.id==='taskEditForm'){
    const moveFields=(title,selectors)=>{
      const nodes=[];
      for(const selector of selectors){
        const input=form.querySelector(selector);if(!input)continue;
        const node=input.closest('label.checkrow,.native-control-shell')||input;
        if(node.parentElement!==form)continue;
        const label=node.previousElementSibling;if(label?.tagName==='LABEL'&&!label.classList.contains('checkrow'))nodes.push(label);
        nodes.push(node);const help=node.nextElementSibling;if(help?.matches('p.small'))nodes.push(help);
      }
      if(!nodes.length)return;
      const details=document.createElement('details');details.className='task-edit-options';const summary=document.createElement('summary');summary.textContent=title;details.append(summary);form.insertBefore(details,nodes[0]);
      [...new Set(nodes)].forEach(node=>details.append(node));
    };
    const allDay=form.querySelector('#editAllDay')?.closest('label'),times=form.querySelector('#editTimeFields');if(allDay&&times)form.insertBefore(allDay,times);
    moveFields('説明・場所',['[name="description"]','[name="location"]']);
    moveFields('共有・カレンダー・通知',['#editIsPrivate','#editCalendarVisible','#editCalendarColorWrap','[name="reminder_at"]']);
    const privacy=form.querySelector('#editIsPrivate'),privacySummary=privacy?.closest('details')?.querySelector('summary');
    const updatePrivacy=()=>{if(privacySummary)privacySummary.textContent=privacy.checked?'🔒 自分専用 · カレンダー・通知':'家族共有 · カレンダー・通知';};privacy?.addEventListener('change',updatePrivacy);updatePrivacy();
    form.addEventListener('invalid',event=>{for(let parent=event.target.parentElement;parent&&parent!==form;parent=parent.parentElement)if(parent.tagName==='DETAILS')parent.open=true;},true);
  }
})();
