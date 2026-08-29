(()=>{
'use strict';
try{
  if(location.pathname!=='/app/settings_family_log.php')return;
  const head=document.querySelector('.family-log-management-head');
  const legacyHeadAction=head?.lastElementChild;
  if(legacyHeadAction)legacyHeadAction.remove();

  const originalOpen=document.getElementById('familyLogSubjectOpen');
  const subjectRows=[...document.querySelectorAll('.family-log-management-row:not(.family-chore-management-row)')];
  if(!originalOpen||!subjectRows.length)return;

  originalOpen.id='familyLogSubjectOpenCore';
  originalOpen.hidden=true;
  originalOpen.setAttribute('aria-hidden','true');

  const trigger=originalOpen.cloneNode(true);
  trigger.id='familyLogSubjectOpen';
  trigger.hidden=false;
  trigger.removeAttribute('aria-hidden');
  trigger.textContent='＋ 対象・項目';
  originalOpen.parentElement?.insertBefore(trigger,originalOpen);

  const style=document.createElement('style');
  style.dataset.familyLogManagementUi='1';
  style.textContent=`
    .family-log-management-head{grid-template-columns:minmax(0,1fr)!important}
    .family-log-management-head>:not(h1){display:none!important}
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
    .family-log-subject-manager-list .family-log-management-row small{display:inline!important;margin-left:7px!important}
    .family-log-subject-manager-list .family-log-subject-edit{display:none!important}
    .family-log-subject-manager-actions{display:grid;gap:8px;margin-top:12px}
    .family-log-subject-manager-actions .btn{width:100%}
    @media(min-width:700px){.family-log-subject-manager{align-items:center}.family-log-subject-manager-panel{border-radius:18px}}
  `;
  document.head.appendChild(style);

  const overlay=document.createElement('div');
  overlay.className='family-log-subject-manager';
  overlay.setAttribute('aria-hidden','true');
  overlay.innerHTML='<div class="family-log-subject-manager-panel" role="dialog" aria-modal="true" aria-labelledby="familyLogSubjectManagerTitle"><div class="family-log-subject-manager-head"><h2 id="familyLogSubjectManagerTitle">記録対象・表示項目</h2><button type="button" class="btn gray small" data-manager-close>閉じる</button></div><div class="family-log-subject-manager-list"></div><div class="family-log-subject-manager-actions"><button type="button" class="btn" data-manager-new>＋ 新しい対象を追加</button></div></div>';
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
