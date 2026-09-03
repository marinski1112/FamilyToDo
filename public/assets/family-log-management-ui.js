(()=>{
'use strict';
try{
  if(location.pathname!=='/app/settings_family_log.php')return;
  const escapeHtml=value=>String(value??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
  const head=document.querySelector('.family-log-management-head');
  if(head)[...head.children].forEach(element=>{if(element.tagName!=='H1')element.remove();});

  const payloadElement=document.getElementById('familyLogPayload');
  let payload={};
  try{payload=JSON.parse(payloadElement?.textContent||'{}');}catch(error){console.warn('[family-log-management-ui] payload parse failed',error);}
  const quickActions=Array.isArray(payload.quickActions)?payload.quickActions:[];
  const subjects=payload.subjects&&typeof payload.subjects==='object'?payload.subjects:{};

  const quickManage=document.getElementById('familyLogQuickManage');
  const quickManageTitle=quickManage?.querySelector('.section-head h3');
  const quickAdd=document.getElementById('familyLogQuickAdd');
  if(quickManageTitle)quickManageTitle.textContent='クイックタスク';
  if(quickAdd)quickAdd.textContent='＋ クイックタスク';
  const quickManageNote=quickManage?.querySelector('p.small');
  if(quickManageNote)quickManageNote.textContent='ワンタッチ・入力して記録・睡眠開始/終了を、クイックタスクとして対象ごとに編集できます。';

  // subject_kind / enabled_types / overview_quick_types remain compatibility metadata,
  // but normal management no longer exposes the old baby/child/pet-specific record UI.
  const subjectForm=document.getElementById('familyLogSubjectForm');
  const hideLegacyControl=element=>{if(element instanceof HTMLElement){element.hidden=true;element.style.display='none';element.setAttribute('aria-hidden','true');}};
  const subjectKind=subjectForm?.elements.namedItem('subject_kind');
  if(subjectKind instanceof HTMLElement){
    const label=subjectKind.previousElementSibling;
    hideLegacyControl(label);
    hideLegacyControl(subjectKind);
  }
  const typeHead=subjectForm?.querySelector('.family-log-type-setting-head');
  hideLegacyControl(typeHead);
  const typeGrid=subjectForm?.querySelector('.choice-list.family-log-type-choice-grid');
  hideLegacyControl(typeGrid);
  const subjectGuide=document.getElementById('familyLogSubjectGuide');
  hideLegacyControl(subjectGuide);
  const overviewToggle=document.getElementById('familyLogShowOverview')?.closest('label');
  hideLegacyControl(overviewToggle);
  const overviewTypes=document.getElementById('familyLogOverviewTypes');
  hideLegacyControl(overviewTypes);

  const originalOpen=document.getElementById('familyLogSubjectOpen');
  const subjectRows=[...document.querySelectorAll('.family-log-management-row:not(.family-chore-management-row)')];
  const subjectCard=subjectRows[0]?.closest('.card')||null;
  const subjectCardTitle=subjectCard?.querySelector('.section-head h2');
  if(subjectCardTitle)subjectCardTitle.textContent='記録対象';

  if(subjectCard){
    const allQuickCard=document.createElement('div');
    allQuickCard.className='card family-log-all-quick-tasks';
    allQuickCard.innerHTML=`<div class="section-head"><div><h2>⚡ クイックタスク</h2><p class="small">すべての対象のクイックタスクをここから確認・管理できます。</p></div></div><div class="family-log-all-quick-task-list"></div>`;
    const allQuickList=allQuickCard.querySelector('.family-log-all-quick-task-list');
    const rows=quickActions.map(action=>{
      const subjectId=Number(action?.subject_id||0);
      const subject=subjects[String(subjectId)]||null;
      if(!subjectId||!subject)return '';
      const inactive=Number(action?.active)===0;
      const mode=String(action?.mode||'QUICK');
      const modeLabel=mode==='FORM'?'入力':mode==='SLEEP_TOGGLE'?'睡眠':'ワンタッチ';
      const subjectLabel=`${subject.icon||'👤'} ${subject.name||'対象'}`;
      return `<div class="family-log-management-row family-log-all-quick-task-row"><span><strong>${escapeHtml(action?.icon||'＋')} ${escapeHtml(action?.name||'クイックタスク')}</strong><small>${escapeHtml(subjectLabel)} · ${escapeHtml(modeLabel)}${inactive?' · 非表示':''}</small></span><a class="btn gray small" href="/app/settings_family_log.php?subject=${subjectId}" aria-label="${escapeHtml(subject.name||'対象')}のクイックタスクを管理">管理</a></div>`;
    }).filter(Boolean);
    allQuickList.innerHTML=rows.join('')||'<p class="small">クイックタスクはまだありません。対象の管理から追加できます。</p>';
    subjectCard.insertAdjacentElement('afterend',allQuickCard);
  }

  if(!originalOpen||!subjectRows.length){
    document.documentElement.dataset.familyLogManagementUi='ready';
    return;
  }

  originalOpen.id='familyLogSubjectOpenCore';
  originalOpen.hidden=true;
  originalOpen.setAttribute('aria-hidden','true');

  const trigger=originalOpen.cloneNode(true);
  trigger.id='familyLogSubjectOpen';
  trigger.hidden=false;
  trigger.removeAttribute('aria-hidden');
  trigger.textContent='＋ 対象';
  originalOpen.parentElement?.insertBefore(trigger,originalOpen);

  const style=document.createElement('style');
  style.dataset.familyLogManagementUi='1';
  style.textContent=`
    .family-log-management-head{grid-template-columns:minmax(0,1fr)!important}
    .family-log-management-head>:not(h1){display:none!important}
    .family-log-all-quick-task-list{display:grid;gap:2px}
    .family-log-all-quick-task-row{display:grid!important;grid-template-columns:minmax(0,1fr) auto!important;align-items:center!important;gap:10px!important}
    .family-log-all-quick-task-row>span{min-width:0}
    .family-log-all-quick-task-row small{display:block;margin-top:3px;color:#64748b}
    .family-log-subject-manager{position:fixed;inset:0;z-index:220;display:none;align-items:flex-end;justify-content:center;background:rgba(15,23,42,.34);padding:14px 10px calc(14px + env(safe-area-inset-bottom))}
    .family-log-subject-manager.open{display:flex}
    .family-log-subject-manager-panel{width:min(560px,100%);max-height:min(78vh,680px);overflow:auto;background:#fff;border-radius:18px 18px 14px 14px;box-shadow:0 20px 60px rgba(15,23,42,.28);padding:14px}
    .family-log-subject-manager-head{display:flex;align-items:center;justify-content:space-between;gap:10px;margin-bottom:10px}
    .family-log-subject-manager-head h2{margin:0;font-size:18px}
    .family-log-subject-manager-list{display:grid;gap:2px;border-top:1px solid #e5e7eb;border-bottom:1px solid #e5e7eb}
    .family-log-subject-manager-list .family-log-management-row{position:relative;display:grid!important;grid-template-columns:minmax(0,1fr) 22px!important;align-items:center!important;min-height:58px!important;margin:0!important;padding:8px 4px!important;border:0!important;border-bottom:1px solid #eef2f7!important;border-radius:0!important;cursor:pointer!important;background:#fff!important}
    .family-log-subject-manager-list .family-log-management-row:last-child{border-bottom:0!important}
    .family-log-subject-manager-list .family-log-management-row::after{content:'›';justify-self:end;color:#64748b;font-size:24px;line-height:1}
    .family-log-subject-manager-list .family-log-management-row>span{min-width:0!important}
    .family-log-subject-manager-list .family-log-management-row small{display:none!important}
    .family-log-subject-manager-list .family-log-management-row .family-log-subject-edit{display:none!important}
    .family-log-subject-manager-actions{display:grid;gap:8px;margin-top:12px}
    .family-log-subject-manager-actions .btn{width:100%}
    @media(min-width:700px){.family-log-subject-manager{align-items:center}.family-log-subject-manager-panel{border-radius:18px}}
  `;
  document.head.appendChild(style);

  const overlay=document.createElement('div');
  overlay.className='family-log-subject-manager';
  overlay.setAttribute('aria-hidden','true');
  overlay.innerHTML='<div class="family-log-subject-manager-panel" role="dialog" aria-modal="true" aria-labelledby="familyLogSubjectManagerTitle"><div class="family-log-subject-manager-head"><h2 id="familyLogSubjectManagerTitle">記録対象</h2><button type="button" class="btn gray small" data-manager-close>閉じる</button></div><div class="family-log-subject-manager-list"></div><div class="family-log-subject-manager-actions"><button type="button" class="btn" data-manager-new>＋ 新しい対象を追加</button></div></div>';
  document.body.appendChild(overlay);
  const list=overlay.querySelector('.family-log-subject-manager-list');
  subjectRows.forEach(row=>{
    const edit=row.querySelector('.family-log-subject-edit');
    row.setAttribute('role','button');row.tabIndex=0;
    const openEdit=()=>{overlay.classList.remove('open');overlay.setAttribute('aria-hidden','true');edit?.click();};
    row.addEventListener('click',event=>{if(event.target.closest('button,a,input,select,textarea'))return;openEdit();});
    row.addEventListener('keydown',event=>{if(event.key==='Enter'||event.key===' '){event.preventDefault();openEdit();}});
    list?.appendChild(row);
  });

  const openManager=()=>{overlay.classList.add('open');overlay.setAttribute('aria-hidden','false');overlay.querySelector('[data-manager-close]')?.focus();};
  const closeManager=()=>{overlay.classList.remove('open');overlay.setAttribute('aria-hidden','true');trigger.focus();};
  trigger.addEventListener('click',event=>{event.preventDefault();event.stopPropagation();openManager();});
  overlay.querySelector('[data-manager-close]')?.addEventListener('click',closeManager);
  overlay.querySelector('[data-manager-new]')?.addEventListener('click',()=>{overlay.classList.remove('open');overlay.setAttribute('aria-hidden','true');originalOpen.click();});
  overlay.addEventListener('click',event=>{if(event.target===overlay)closeManager();});
  document.addEventListener('keydown',event=>{if(event.key==='Escape'&&overlay.classList.contains('open'))closeManager();});
  document.documentElement.dataset.familyLogManagementUi='ready';
}catch(error){
  document.documentElement.dataset.familyLogManagementUi='error';
  console.error('[family-log-management-ui] initialization failed',error);
}
})();
