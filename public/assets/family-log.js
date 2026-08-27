(()=>{
  const byId=(id)=>document.getElementById(id);
  const payloadEl=byId('familyLogPayload');
  if(!payloadEl)return;
  let payload={};
  try{payload=JSON.parse(payloadEl.textContent||'{}');}catch(e){console.error('[Family TODO] family-log payload parse failed',e);return;}
  const csrf=String(payload.csrf||'');
  const logMap=payload.logs||{};
  const selectedDate=String(payload.selectedDate||'');
  const nowLocal=String(payload.nowLocal||'');
  const logModal=byId('familyLogModal');
  const logForm=byId('familyLogForm');
  const logClose=byId('familyLogClose');
  const logTitle=byId('familyLogModalTitle');
  const logStatus=byId('familyLogStatus');
  const subjectModal=byId('familyLogSubjectModal');
  const subjectForm=byId('familyLogSubjectForm');
  const subjectClose=byId('familyLogSubjectClose');
  const subjectStatus=byId('familyLogSubjectStatus');

  const TYPE_META={
    MILK:{label:'ミルク',icon:'🍼',amountLabel:'量',unit:'ml'},
    BREASTFEED:{label:'母乳',icon:'🤱',durationLabel:'時間',unit:'分',details:[['LEFT','左'],['RIGHT','右'],['BOTH','両方']]},
    MEAL:{label:'食事',icon:'🍚',details:[['BREAKFAST','朝食'],['LUNCH','昼食'],['DINNER','夕食'],['SNACK','おやつ'],['OTHER','その他']]},
    DIAPER:{label:'おむつ',icon:'🧷',details:[['WET','おしっこ'],['DIRTY','うんち'],['BOTH','両方']]},
    SLEEP:{label:'睡眠',icon:'😴',durationLabel:'時間',unit:'分'},
    BATH:{label:'お風呂',icon:'🛁'},
    TEMPERATURE:{label:'体温',icon:'🌡️',amountLabel:'体温',unit:'℃'},
    MEDICINE:{label:'薬',icon:'💊',textLabel:'薬・内容'},
    MEMO:{label:'メモ',icon:'📝',textLabel:'内容'}
  };

  function setOpen(el,on){if(!el)return;el.classList.toggle('open',on);el.setAttribute('aria-hidden',on?'false':'true');}
  function setVisible(el,on){if(el)el.style.display=on?'':'none';}
  function formField(name){return logForm?.elements.namedItem(name)||null;}
  function normalizeDateTime(v){return String(v||'').replace(' ','T').slice(0,16);}
  function selectedSubject(){const x=Number(payload.selectedSubject||0);return Number.isFinite(x)?x:0;}

  function refreshDynamicFields(){
    if(!logForm)return;
    const type=String(formField('log_type')?.value||'MEMO');
    const meta=TYPE_META[type]||TYPE_META.MEMO;
    const amountWrap=byId('familyLogAmountWrap');
    const durationWrap=byId('familyLogDurationWrap');
    const textWrap=byId('familyLogTextWrap');
    const detailWrap=byId('familyLogDetailWrap');
    setVisible(amountWrap,Boolean(meta.amountLabel));
    setVisible(durationWrap,Boolean(meta.durationLabel));
    setVisible(textWrap,Boolean(meta.textLabel));
    setVisible(detailWrap,Boolean(meta.details));
    const amountLabel=byId('familyLogAmountLabel');if(amountLabel)amountLabel.textContent=meta.amountLabel||'値';
    const amountUnit=byId('familyLogAmountUnit');if(amountUnit)amountUnit.textContent=meta.unit||'';
    const durationLabel=byId('familyLogDurationLabel');if(durationLabel)durationLabel.textContent=meta.durationLabel||'時間';
    const textLabel=byId('familyLogTextLabel');if(textLabel)textLabel.textContent=meta.textLabel||'内容';
    const unitInput=formField('unit');if(unitInput)unitInput.value=meta.unit||'';
    const detail=formField('detail_code');
    if(detail && detail instanceof HTMLSelectElement){
      const current=detail.value;
      detail.innerHTML='<option value="">指定なし</option>'+(meta.details||[]).map(([value,label])=>`<option value="${value}">${label}</option>`).join('');
      if([...detail.options].some(o=>o.value===current))detail.value=current;
    }
    const amount=formField('amount');
    if(amount instanceof HTMLInputElement){amount.step=type==='TEMPERATURE'?'0.1':'1';amount.inputMode='decimal';}
  }

  function openNew(type){
    if(!logForm)return;
    logForm.reset();
    formField('id').value='';
    formField('log_type').value=type||'MEMO';
    const subject=formField('subject_id');if(subject)subject.value=String(selectedSubject()||0);
    const occurred=formField('occurred_at');if(occurred)occurred.value=nowLocal||`${selectedDate}T12:00`;
    const linked=formField('linked_target');if(linked)linked.value='';
    logStatus.textContent='';
    const deleteBtn=byId('familyLogDelete');if(deleteBtn)deleteBtn.style.display='none';
    logTitle.textContent=`${TYPE_META[type]?.icon||'📝'} ${TYPE_META[type]?.label||'記録'}を追加`;
    refreshDynamicFields();
    setOpen(logModal,true);
  }

  function openEdit(id){
    const row=logMap[String(id)];
    if(!row||!logForm)return;
    logForm.reset();
    formField('id').value=String(row.id||'');
    formField('log_type').value=String(row.log_type||'MEMO');
    formField('subject_id').value=String(row.subject_id||0);
    formField('occurred_at').value=normalizeDateTime(row.occurred_at);
    formField('detail_code').value=String(row.detail_code||'');
    formField('amount').value=row.amount===null||row.amount===undefined?'':String(row.amount);
    formField('unit').value=String(row.unit||'');
    formField('duration_minutes').value=row.duration_minutes===null||row.duration_minutes===undefined?'':String(row.duration_minutes);
    formField('value_text').value=String(row.value_text||'');
    formField('note').value=String(row.note||'');
    formField('linked_target').value=row.linked_occurrence_id?`occ:${row.linked_occurrence_id}`:row.linked_task_id?`task:${row.linked_task_id}`:'';
    logStatus.textContent='';
    const deleteBtn=byId('familyLogDelete');if(deleteBtn)deleteBtn.style.display='inline-flex';
    const type=String(row.log_type||'MEMO');
    logTitle.textContent=`${TYPE_META[type]?.icon||'📝'} ${TYPE_META[type]?.label||'記録'}を編集`;
    refreshDynamicFields();
    const detail=formField('detail_code');if(detail)detail.value=String(row.detail_code||'');
    setOpen(logModal,true);
  }

  async function post(body){
    const r=await fetch('/api/family-log',{method:'POST',headers:{'content-type':'application/json','accept':'application/json'},credentials:'same-origin',body:JSON.stringify({...body,csrf})});
    const d=await r.json().catch(()=>null);
    if(!r.ok||!d?.ok)throw new Error(d?.error||`処理に失敗しました（HTTP ${r.status}）。`);
    return d;
  }

  document.querySelectorAll('[data-log-type]').forEach(btn=>btn.addEventListener('click',()=>openNew(String(btn.dataset.logType||'MEMO'))));
  document.querySelectorAll('.family-log-row').forEach(btn=>btn.addEventListener('click',e=>{if(e.target.closest('a,button,input'))return;openEdit(Number(btn.dataset.id||0));}));
  document.querySelectorAll('.family-log-edit').forEach(btn=>btn.addEventListener('click',e=>{e.stopPropagation();openEdit(Number(btn.dataset.id||0));}));

  formField('log_type')?.addEventListener('change',refreshDynamicFields);
  logClose?.addEventListener('click',()=>setOpen(logModal,false));
  logModal?.addEventListener('click',e=>{if(e.target===logModal)setOpen(logModal,false);});

  logForm?.addEventListener('submit',async e=>{
    e.preventDefault();
    const fd=new FormData(logForm);
    const submit=logForm.querySelector('button[type="submit"]');
    if(submit)submit.disabled=true;
    logStatus.textContent='保存しています…';
    try{
      await post({
        action:'save',id:Number(fd.get('id')||0),subject_id:Number(fd.get('subject_id')||0),log_type:String(fd.get('log_type')||''),
        occurred_at:String(fd.get('occurred_at')||''),detail_code:String(fd.get('detail_code')||''),amount:String(fd.get('amount')||''),unit:String(fd.get('unit')||''),
        duration_minutes:String(fd.get('duration_minutes')||''),value_text:String(fd.get('value_text')||''),note:String(fd.get('note')||''),linked_target:String(fd.get('linked_target')||'')
      });
      location.reload();
    }catch(err){logStatus.textContent=err?.message||String(err);}finally{if(submit)submit.disabled=false;}
  });

  byId('familyLogDelete')?.addEventListener('click',async()=>{
    const id=Number(formField('id')?.value||0);if(!id)return;
    if(!confirm('この記録を削除しますか？'))return;
    try{await post({action:'delete',id});location.reload();}catch(err){logStatus.textContent=err?.message||String(err);}
  });

  byId('familyLogSubjectOpen')?.addEventListener('click',()=>{subjectForm?.reset();subjectStatus.textContent='';setOpen(subjectModal,true);});
  subjectClose?.addEventListener('click',()=>setOpen(subjectModal,false));
  subjectModal?.addEventListener('click',e=>{if(e.target===subjectModal)setOpen(subjectModal,false);});
  subjectForm?.addEventListener('submit',async e=>{
    e.preventDefault();const fd=new FormData(subjectForm);const submit=subjectForm.querySelector('button[type="submit"]');if(submit)submit.disabled=true;
    subjectStatus.textContent='追加しています…';
    try{await post({action:'subject_create',name:String(fd.get('name')||''),subject_kind:String(fd.get('subject_kind')||'CHILD'),birth_date:String(fd.get('birth_date')||''),member_id:Number(fd.get('member_id')||0)});location.reload();}
    catch(err){subjectStatus.textContent=err?.message||String(err);}finally{if(submit)submit.disabled=false;}
  });

  document.querySelectorAll('.family-log-timer-start').forEach(btn=>btn.addEventListener('click',async()=>{
    btn.disabled=true;
    try{await post({action:'timer_start',log_type:String(btn.dataset.type||''),subject_id:Number(btn.dataset.subject||selectedSubject()||0)});location.reload();}
    catch(err){alert(err?.message||String(err));btn.disabled=false;}
  }));
  document.querySelectorAll('.family-log-timer-stop').forEach(btn=>btn.addEventListener('click',async()=>{
    btn.disabled=true;
    try{await post({action:'timer_stop',timer_id:Number(btn.dataset.id||0)});location.reload();}
    catch(err){alert(err?.message||String(err));btn.disabled=false;}
  }));
  document.querySelectorAll('.family-log-timer-cancel').forEach(btn=>btn.addEventListener('click',async()=>{
    if(!confirm('このタイマーを取り消しますか？'))return;btn.disabled=true;
    try{await post({action:'timer_cancel',timer_id:Number(btn.dataset.id||0)});location.reload();}
    catch(err){alert(err?.message||String(err));btn.disabled=false;}
  }));

  document.addEventListener('keydown',e=>{if(e.key==='Escape'){setOpen(logModal,false);setOpen(subjectModal,false);}});
  document.documentElement.dataset.familyLogJs='ready';
})();
