(()=>{
  'use strict';

  const byId=id=>document.getElementById(id);
  const escapeHtml=value=>String(value??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
  const payloadEl=byId('familyLogPayload');
  if(!payloadEl)return;

  let payload={};
  try{payload=JSON.parse(payloadEl.textContent||'{}');}
  catch(e){console.error('[Family TODO] family-log payload parse failed',e);return;}

  const csrf=String(payload.csrf||'');
  const managementMode=Boolean(payload.managementMode);
  const logMap=payload.logs||{};
  const subjectMap=payload.subjects||{};
  const selectedDate=String(payload.selectedDate||'');
  const nowLocal=String(payload.nowLocal||'');
  const isAdmin=Boolean(payload.isAdmin);

  const logModal=byId('familyLogModal');
  const logForm=byId('familyLogForm');
  const logClose=byId('familyLogClose');
  const logTitle=byId('familyLogModalTitle');
  const logStatus=byId('familyLogStatus');

  const subjectModal=byId('familyLogSubjectModal');
  const subjectForm=byId('familyLogSubjectForm');
  const subjectClose=byId('familyLogSubjectClose');
  const subjectTitle=byId('familyLogSubjectTitle');
  const subjectStatus=byId('familyLogSubjectStatus');
  const subjectLinked=byId('familyLogSubjectLinked');
  const subjectDisable=byId('familyLogSubjectDisable');
  const subjectGuide=byId('familyLogSubjectGuide');
  const subjectAutoComplete=byId('familyLogAutoComplete');
  const subjectShowOverview=byId('familyLogShowOverview');
  const subjectOverviewTypes=byId('familyLogOverviewTypes');
  const subjectPromote=byId('familyLogSubjectPromote');
  const subjectPromoteOut=byId('familyLogSubjectPromoteOut');

  const TYPE_META={
    MILK:{label:'ミルク',icon:'🍼',amountLabel:'量',unit:'ml'},
    BREASTFEED:{label:'母乳',icon:'🤱',durationLabel:'時間',unit:'分',details:[['LEFT','左'],['RIGHT','右'],['BOTH','両方']]},
    MEAL:{label:'食事',icon:'🍚',details:[['BREAKFAST','朝食'],['LUNCH','昼食'],['DINNER','夕食'],['SNACK','おやつ'],['OTHER','その他']]},
    DIAPER:{label:'おむつ',icon:'🧷',details:[['WET','💧 おしっこ'],['DIRTY','💩 うんち'],['BOTH','💧💩 両方']]},
    SLEEP:{label:'睡眠',icon:'😴',durationLabel:'時間',unit:'分'},
    BATH:{label:'お風呂',icon:'🛁',details:[['BATH','お風呂'],['SHOWER','シャワー']]},
    TEMPERATURE:{label:'体温',icon:'🌡️',amountLabel:'体温',unit:'℃'},
    MEDICINE:{label:'薬',icon:'💊',textLabel:'薬・内容'},
    VACCINE:{label:'予防接種',icon:'💉',textLabel:'ワクチン名',placeholder:'例：五種混合 B型肝炎'},
    CONDITION:{label:'体調',icon:'🙂',details:[['GOOD','良好'],['NORMAL','ふつう'],['TIRED','疲れ気味'],['SICK','不調']],textLabel:'補足'},
    WEIGHT:{label:'体重',icon:'⚖️',amountLabel:'体重',unit:'kg'},
    HEIGHT:{label:'身長',icon:'📏',amountLabel:'身長',unit:'cm'},
    BLOOD_PRESSURE:{label:'血圧',icon:'🫀',textLabel:'血圧',placeholder:'例：120/80'},
    EXERCISE:{label:'運動',icon:'🏃',durationLabel:'運動時間',unit:'分',details:[['WALK','歩く'],['RUN','走る'],['STRENGTH','筋トレ'],['STRETCH','ストレッチ'],['OTHER','その他']]},
    WATER:{label:'水分',icon:'💧',amountLabel:'量',unit:'ml'},
    TOILET:{label:'トイレ',icon:'🚻',details:[['WET','💧 おしっこ'],['DIRTY','💩 うんち'],['BOTH','💧💩 両方']]},
    WALK:{label:'散歩',icon:'🐕',durationLabel:'散歩時間',unit:'分'},
    TIMER:{label:'タイマー',icon:'⏱',durationLabel:'時間',unit:'分',textLabel:'タイマー名'},
    HOUSEWORK:{label:'ちょこっと家事',icon:'🧹',textLabel:'家事'},
    MEMO:{label:'メモ',icon:'📝',textLabel:'内容'}
  };
  const ALL_TYPES=Object.keys(TYPE_META).filter(type=>type!=='HOUSEWORK'&&type!=='TIMER');
  const DEFAULT_TYPES={
    BABY:['MILK','BREASTFEED','MEAL','DIAPER','SLEEP','BATH','TEMPERATURE','MEDICINE','HEIGHT','WEIGHT','CONDITION','MEMO'],
    CHILD:['MEAL','TOILET','SLEEP','BATH','TEMPERATURE','MEDICINE','HEIGHT','WEIGHT','CONDITION','EXERCISE','MEMO'],
    ADULT:['CONDITION','SLEEP','EXERCISE','WEIGHT','BLOOD_PRESSURE','TEMPERATURE','MEDICINE','MEAL','BATH','MEMO'],
    PET:['MEAL','WATER','TOILET','WALK','SLEEP','BATH','WEIGHT','MEDICINE','CONDITION','MEMO'],
    OTHER:['MEMO','CONDITION','TEMPERATURE','MEDICINE','SLEEP','WEIGHT']
  };
  const PET_PRESETS={CAT:['MEAL','WATER','TOILET','WEIGHT','MEDICINE','CONDITION','MEMO'],DOG:['MEAL','WATER','TOILET','WALK','WEIGHT','MEDICINE','CONDITION','MEMO']};
  const DEFAULT_AUTO_COMPLETE={BABY:true,CHILD:true,ADULT:false,PET:true,OTHER:false};
  const SUBJECT_GUIDE={
    BABY:'赤ちゃん向け：授乳・おむつ・睡眠・お風呂・体温・成長を中心に記録します。',
    CHILD:'子ども向け：食事・トイレ・睡眠・体調・成長・運動を中心に記録します。',
    ADULT:'大人向け：体調・睡眠・運動・体重・血圧・服薬など、日々のログを中心にします。',
    PET:'ペット向け：食事・水分・トイレ・散歩・睡眠・体重・服薬を中心に記録します。',
    OTHER:'必要な項目だけを選んで記録できます。'
  };

  function setOpen(el,on){
    if(!el)return;
    el.classList.toggle('open',on);
    el.setAttribute('aria-hidden',on?'false':'true');
  }
  function setVisible(el,on){if(el)el.style.display=on?'':'none';}
  function formField(name){return logForm?.elements.namedItem(name)||null;}
  function subjectField(name){return subjectForm?.elements.namedItem(name)||null;}
  function normalizeDateTime(v){return String(v||'').replace(' ','T').slice(0,16);}
  function selectedSubject(){const x=Number(payload.selectedSubject||0);return Number.isFinite(x)?x:0;}
  function normalizeKind(v){const x=String(v||'OTHER').toUpperCase();return DEFAULT_TYPES[x]?x:'OTHER';}
  function presetTypes(kind){return [...(DEFAULT_TYPES[normalizeKind(kind)]||DEFAULT_TYPES.OTHER)];}

  function syncDetailChoiceState(){
    const select=formField('detail_code');
    const wrap=byId('familyLogDetailChoices');
    if(!(select instanceof HTMLSelectElement)||!wrap)return;
    wrap.querySelectorAll('button[data-detail]').forEach(btn=>{
      btn.classList.toggle('active',String(btn.dataset.detail||'')===select.value);
    });
  }

  function refreshDynamicFields(){
    if(!logForm)return;
    const type=String(formField('log_type')?.value||'MEMO');
    const meta=TYPE_META[type]||TYPE_META.MEMO;
    const subject=formField('subject_id');
    if(subject instanceof HTMLSelectElement){
      if(type==='HOUSEWORK')subject.value='0';
      subject.disabled=type==='HOUSEWORK';
      subject.title=type==='HOUSEWORK'?'ちょこっと家事は家族共通として記録されます。':'';
    }
    const amountWrap=byId('familyLogAmountWrap');
    const durationWrap=byId('familyLogDurationWrap');
    const textWrap=byId('familyLogTextWrap');
    const detailWrap=byId('familyLogDetailWrap');
    const detailChoices=byId('familyLogDetailChoices');

    setVisible(amountWrap,Boolean(meta.amountLabel));
    setVisible(durationWrap,Boolean(meta.durationLabel));
    setVisible(textWrap,Boolean(meta.textLabel));
    setVisible(detailWrap,Boolean(meta.details));

    const amountLabel=byId('familyLogAmountLabel');
    if(amountLabel)amountLabel.textContent=meta.amountLabel||'値';
    const amountUnit=byId('familyLogAmountUnit');
    if(amountUnit)amountUnit.textContent=meta.unit||'';
    const durationLabel=byId('familyLogDurationLabel');
    if(durationLabel)durationLabel.textContent=meta.durationLabel||'時間';
    const textLabel=byId('familyLogTextLabel');
    if(textLabel)textLabel.textContent=meta.textLabel||'内容';
    const textInput=formField('value_text');
    if(textInput instanceof HTMLInputElement)textInput.placeholder=meta.placeholder||'';
    const unitInput=formField('unit');
    if(unitInput)unitInput.value=meta.unit||'';

    const detail=formField('detail_code');
    if(detail instanceof HTMLSelectElement){
      const current=detail.value;
      detail.innerHTML='<option value="">指定なし</option>'+(meta.details||[]).map(([value,label])=>`<option value="${value}">${label}</option>`).join('');
      if([...detail.options].some(o=>o.value===current))detail.value=current;
      else detail.value='';
    }
    if(detailChoices){
      detailChoices.innerHTML='';
      (meta.details||[]).forEach(([value,label])=>{
        const btn=document.createElement('button');
        btn.type='button';
        btn.className='family-log-detail-choice';
        btn.dataset.detail=value;
        btn.textContent=label;
        btn.addEventListener('click',()=>{
          if(detail instanceof HTMLSelectElement){
            detail.value=detail.value===value?'':value;
            syncDetailChoiceState();
          }
        });
        detailChoices.appendChild(btn);
      });
    }
    syncDetailChoiceState();

    const amount=formField('amount');
    if(amount instanceof HTMLInputElement){
      amount.step=['TEMPERATURE','WEIGHT','HEIGHT'].includes(type)?'0.1':'1';
      amount.inputMode='decimal';
    }
  }

  function openNew(type,subjectId=selectedSubject()){
    if(!logForm)return;
    logForm.reset();
    formField('id').value='';
    formField('log_type').value=type||'MEMO';
    const subject=formField('subject_id');
    if(subject)subject.value=String(subjectId||0);
    const occurred=formField('occurred_at');
    if(occurred)occurred.value=nowLocal||`${selectedDate}T12:00`;
    const linked=formField('linked_target');
    if(linked)linked.value='';
    logStatus.textContent='';
    const provenance=byId('familyLogProvenance');if(provenance){provenance.hidden=true;provenance.textContent='';}
    const deleteBtn=byId('familyLogDelete');
    if(deleteBtn)deleteBtn.style.display='none';
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
    const subjectSelect=formField('subject_id');
    const subjectValue=String(row.subject_id||0);
    if(subjectSelect instanceof HTMLSelectElement&&subjectValue!=='0'&&![...subjectSelect.options].some(option=>option.value===subjectValue)){
      const preserved=subjectMap[subjectValue];
      if(preserved){const option=document.createElement('option');option.value=subjectValue;option.textContent=`${preserved.icon||'👤'} ${preserved.name||'過去の対象'}`;subjectSelect.appendChild(option);}
    }
    if(subjectSelect)subjectSelect.value=subjectValue;
    formField('occurred_at').value=normalizeDateTime(row.occurred_at);
    formField('detail_code').value=String(row.detail_code||'');
    formField('amount').value=row.amount===null||row.amount===undefined?'':String(row.amount);
    formField('unit').value=String(row.unit||'');
    formField('duration_minutes').value=row.duration_minutes===null||row.duration_minutes===undefined?'':String(row.duration_minutes);
    formField('value_text').value=String(row.value_text||'');
    formField('note').value=String(row.note||'');
    formField('linked_target').value=row.linked_occurrence_id?`occ:${row.linked_occurrence_id}`:row.linked_task_id?`task:${row.linked_task_id}`:'';
    logStatus.textContent='';
    const provenance=byId('familyLogProvenance');if(provenance){provenance.hidden=!row.imported;provenance.textContent=row.imported?(String(row.import_source).toLowerCase()==='piyolog'?'ぴよログからインポート':'外部データからインポート'):'';}
    const deleteBtn=byId('familyLogDelete');
    if(deleteBtn)deleteBtn.style.display='inline-flex';
    const type=String(row.log_type||'MEMO');
    logTitle.textContent=`${TYPE_META[type]?.icon||'📝'} ${TYPE_META[type]?.label||'記録'}を編集`;
    refreshDynamicFields();
    const detail=formField('detail_code');
    if(detail)detail.value=String(row.detail_code||'');
    syncDetailChoiceState();
    setOpen(logModal,true);
  }

  async function post(body){
    const r=await fetch('/api/family-log',{
      method:'POST',
      headers:{'content-type':'application/json','accept':'application/json'},
      credentials:'same-origin',
      body:JSON.stringify({...body,csrf})
    });
    const d=await r.json().catch(()=>null);
    if(!r.ok||!d?.ok)throw new Error(d?.error||`処理に失敗しました（HTTP ${r.status}）。`);
    return d;
  }

  function setSubjectTypes(types){
    const selected=new Set((types||[]).map(String));
    subjectForm?.querySelectorAll('input[name="enabled_types"]').forEach(input=>{
      if(input instanceof HTMLInputElement)input.checked=selected.has(input.value);
    });
  }
  function updateSubjectGuide(kind){
    const normalized=normalizeKind(kind);
    if(subjectGuide)subjectGuide.textContent=SUBJECT_GUIDE[normalized]||SUBJECT_GUIDE.OTHER;
  }
  function applySubjectPreset(kind,types=true){
    const normalized=normalizeKind(kind);
    if(types)setSubjectTypes(presetTypes(normalized));
    if(subjectAutoComplete instanceof HTMLInputElement)subjectAutoComplete.checked=Boolean(DEFAULT_AUTO_COMPLETE[normalized]);
    updateSubjectGuide(normalized);
  }
  function updatePromotionVisibility(row){
    if(!subjectPromote)return;
    const linked=Number(row?.member_id||0)>0;
    const kind=normalizeKind(row?.subject_kind||subjectField('subject_kind')?.value);
    const eligible=isAdmin&&!linked&&['BABY','CHILD','ADULT'].includes(kind)&&Number(row?.id||0)>0;
    subjectPromote.style.display=eligible?'':'none';
    if(subjectPromoteOut){subjectPromoteOut.innerHTML='';subjectPromoteOut.style.display='none';}
  }

  function openSubjectNew(){
    if(!subjectForm)return;
    subjectForm.reset();
    subjectForm.dataset.editing='';
    subjectField('id').value='';
    subjectField('subject_kind').value='BABY';
    applySubjectPreset('BABY');
    if(subjectShowOverview instanceof HTMLInputElement)subjectShowOverview.checked=false;
    if(subjectOverviewTypes)subjectOverviewTypes.hidden=true;
    subjectTitle.textContent='記録対象を追加';
    subjectStatus.textContent='';
    setVisible(subjectDisable,false);
    updatePromotionVisibility(null);
    if(subjectLinked){
      subjectLinked.textContent='';
      subjectLinked.style.display='none';
    }
    setOpen(subjectModal,true);
  }

  function openSubjectEdit(id){
    const row=subjectMap[String(id)];
    if(!row||!subjectForm)return;
    subjectForm.reset();
    subjectForm.dataset.editing='1';
    subjectField('id').value=String(row.id||'');
    subjectField('name').value=String(row.name||'');
    subjectField('subject_kind').value=normalizeKind(row.subject_kind);
    subjectField('birth_date').value=String(row.birth_date||'');
    setSubjectTypes(Array.isArray(row.enabled_types)?row.enabled_types:presetTypes(row.subject_kind));
    if(subjectAutoComplete instanceof HTMLInputElement)subjectAutoComplete.checked=Boolean(row.auto_complete_linked_task);
    if(subjectShowOverview instanceof HTMLInputElement)subjectShowOverview.checked=Boolean(row.show_on_family_overview);
    if(subjectOverviewTypes)subjectOverviewTypes.hidden=!Boolean(row.show_on_family_overview);
    const overviewSelected=new Set(Array.isArray(row.overview_quick_types)?row.overview_quick_types:[]);
    subjectForm.querySelectorAll('input[name="overview_quick_types"]').forEach(input=>{input.checked=overviewSelected.has(input.value);});
    updateSubjectGuide(row.subject_kind);
    subjectTitle.textContent=`${row.icon||'👤'} ${row.name||'対象'} の設定`;
    subjectStatus.textContent='';
    updatePromotionVisibility(row);
    const linked=Number(row.member_id||0)>0;
    setVisible(subjectDisable,!linked);
    if(subjectLinked){
      if(linked){
        subjectLinked.textContent=`家族メンバー「${row.member_name||row.name||''}」と連携しています。家族メンバーは常に切替対象として表示されます。`;
        subjectLinked.style.display='';
      }else{
        subjectLinked.textContent='';
        subjectLinked.style.display='none';
      }
    }
    setOpen(subjectModal,true);
  }

  document.querySelectorAll('[data-log-type]').forEach(btn=>
    btn.addEventListener('click',()=>openNew(String(btn.dataset.logType||'MEMO'),Number(btn.dataset.subjectId||selectedSubject())))
  );
  document.querySelectorAll('.family-log-row').forEach(row=>
    row.addEventListener('click',e=>{
      if(e.target.closest('a,button,input'))return;
      openEdit(Number(row.dataset.id||0));
    })
  );
  document.querySelectorAll('.family-log-edit').forEach(btn=>
    btn.addEventListener('click',e=>{
      e.stopPropagation();
      openEdit(Number(btn.dataset.id||0));
    })
  );

  formField('log_type')?.addEventListener('change',refreshDynamicFields);
  formField('detail_code')?.addEventListener('change',syncDetailChoiceState);
  logClose?.addEventListener('click',()=>setOpen(logModal,false));
  logModal?.addEventListener('click',e=>{if(e.target===logModal)setOpen(logModal,false);});

  logForm?.addEventListener('submit',async e=>{
    e.preventDefault();
    const fd=new FormData(logForm);
    const submit=logForm.querySelector('button[type="submit"]');
    if(submit)submit.disabled=true;
    logStatus.textContent='保存しています…';
    try{
      const result=await post({
        action:'save',
        id:Number(fd.get('id')||0),
        subject_id:Number(fd.get('subject_id')||0),
        log_type:String(fd.get('log_type')||''),
        occurred_at:String(fd.get('occurred_at')||''),
        detail_code:String(fd.get('detail_code')||''),
        amount:String(fd.get('amount')||''),
        unit:String(fd.get('unit')||''),
        duration_minutes:String(fd.get('duration_minutes')||''),
        value_text:String(fd.get('value_text')||''),
        note:String(fd.get('note')||''),
        linked_target:String(fd.get('linked_target')||'')
      });
      if(result?.linked_completion&&result.linked_completion.ok===false&&result.linked_completion.message)alert(result.linked_completion.message);
      location.reload();
    }catch(err){
      logStatus.textContent=err?.message||String(err);
    }finally{
      if(submit)submit.disabled=false;
    }
  });

  byId('familyLogDelete')?.addEventListener('click',async()=>{
    const id=Number(formField('id')?.value||0);
    if(!id)return;
    if(!confirm('この記録を削除しますか？'))return;
    try{
      await post({action:'delete',id});
      location.reload();
    }catch(err){
      logStatus.textContent=err?.message||String(err);
    }
  });

  byId('familyLogSubjectOpen')?.addEventListener('click',openSubjectNew);
  byId('familyLogSubjectEdit')?.addEventListener('click',()=>openSubjectEdit(selectedSubject()));
  document.querySelectorAll('.family-log-subject-edit').forEach(btn=>btn.addEventListener('click',()=>openSubjectEdit(Number(btn.dataset.id||0))));
  if(managementMode&&selectedSubject())openSubjectEdit(selectedSubject());
  document.querySelectorAll('.family-log-pet-preset').forEach(btn=>btn.addEventListener('click',()=>{subjectField('subject_kind').value='PET';setSubjectTypes(PET_PRESETS[String(btn.dataset.preset)]||DEFAULT_TYPES.PET);updateSubjectGuide('PET');}));
  subjectClose?.addEventListener('click',()=>setOpen(subjectModal,false));
  subjectModal?.addEventListener('click',e=>{if(e.target===subjectModal)setOpen(subjectModal,false);});

  subjectField('subject_kind')?.addEventListener('change',()=>{
    const kind=subjectField('subject_kind')?.value;
    if(!subjectForm?.dataset.editing)applySubjectPreset(kind);
    else updateSubjectGuide(kind);
    const row=subjectMap[String(subjectField('id')?.value||'')];
    updatePromotionVisibility(row?{...row,subject_kind:kind}:null);
  });
  byId('familyLogPresetApply')?.addEventListener('click',()=>{
    applySubjectPreset(subjectField('subject_kind')?.value);
  });
  subjectShowOverview?.addEventListener('change',()=>{if(subjectOverviewTypes)subjectOverviewTypes.hidden=!subjectShowOverview.checked;});

  subjectForm?.addEventListener('submit',async e=>{
    e.preventDefault();
    const fd=new FormData(subjectForm);
    const submit=subjectForm.querySelector('button[type="submit"]');
    if(submit)submit.disabled=true;
    subjectStatus.textContent='保存しています…';
    try{
      const id=Number(fd.get('id')||0);
      await post({
        action:id?'subject_update':'subject_create',
        id,
        name:String(fd.get('name')||''),
        subject_kind:String(fd.get('subject_kind')||'BABY'),
        birth_date:String(fd.get('birth_date')||''),
        enabled_types:fd.getAll('enabled_types').map(String),
        show_on_family_overview:Boolean(fd.get('show_on_family_overview')),
        overview_quick_types:fd.getAll('overview_quick_types').map(String),
        auto_complete_linked_task:Boolean(fd.get('auto_complete_linked_task'))
      });
      location.reload();
    }catch(err){
      subjectStatus.textContent=err?.message||String(err);
    }finally{
      if(submit)submit.disabled=false;
    }
  });

  subjectPromote?.addEventListener('click',async()=>{
    const id=Number(subjectField('id')?.value||0);
    if(!id)return;
    if(!confirm('この記録対象を将来のLINE家族メンバーとして招待しますか？参加後もこれまでの家族ログは同じ対象に引き継がれます。'))return;
    subjectPromote.disabled=true;
    subjectStatus.textContent='本登録用の招待リンクを作成しています…';
    try{
      const r=await fetch('/api/family/invite',{
        method:'POST',credentials:'same-origin',cache:'no-store',
        headers:{'content-type':'application/json','accept':'application/json'},
        body:JSON.stringify({action:'create',csrf,expires_days:7,subject_id:id})
      });
      const d=await r.json().catch(()=>null);
      if(!r.ok||!d?.ok)throw new Error(d?.error||`招待リンクの作成に失敗しました（HTTP ${r.status}）。`);
      subjectStatus.textContent='';
      if(subjectPromoteOut){
        subjectPromoteOut.innerHTML='';subjectPromoteOut.style.display='';
        const strong=document.createElement('strong');strong.textContent=`${d.subject?.name||'対象'} のLINE本登録リンク`;
        const input=document.createElement('input');input.readOnly=true;input.value=String(d.url||'');input.addEventListener('click',()=>input.select());
        const meta=document.createElement('div');meta.className='meta';meta.textContent=`有効期限：${d.expires_at||''}`;
        subjectPromoteOut.append(strong,input,meta);
        const add=String(d.official_account?.add_friend_url||'');
        if(add){const link=document.createElement('a');link.className='btn line-friend-btn';link.href=add;link.target='_blank';link.rel='noopener noreferrer';link.textContent='先に公式アカウントを友だち追加';subjectPromoteOut.append(link);}
        const share=document.createElement('button');share.type='button';share.className='btn gray';share.textContent='LINE等で共有';
        share.addEventListener('click',async()=>{
          const nl=String.fromCharCode(10);
          const text=`Family TODO LINE「${d.subject?.name||'家族'}」の本登録招待です。${nl}${nl}${add?`① 公式アカウントを友だち追加${nl}${add}${nl}${nl}`:''}② 本登録リンクを開く${nl}${d.url}`;
          try{if(navigator.share)await navigator.share({title:'Family TODO LINE 本登録',text});else{await navigator.clipboard.writeText(text);alert('招待文をコピーしました。');}}catch(err){if(err?.name!=='AbortError')alert('共有できませんでした。');}
        });
        subjectPromoteOut.append(share);
      }
    }catch(err){
      subjectStatus.textContent=err?.message||String(err);
    }finally{subjectPromote.disabled=false;}
  });

  subjectDisable?.addEventListener('click',async()=>{
    const id=Number(subjectField('id')?.value||0);
    if(!id)return;
    if(!confirm('この記録対象を非表示にしますか？過去の記録は削除されません。'))return;
    subjectDisable.disabled=true;
    try{
      await post({action:'subject_disable',id});
      location.href=managementMode?'/app/settings_family_log.php':`/app/family_log.php?date=${encodeURIComponent(selectedDate)}`;
    }catch(err){
      subjectStatus.textContent=err?.message||String(err);
      subjectDisable.disabled=false;
    }
  });

  byId('familyLogTimerForm')?.addEventListener('submit',async event=>{
    event.preventDefault();const form=event.currentTarget,status=byId('familyLogTimerStatus');
    const label=String(new FormData(form).get('timer_label')||'').trim();
    if(!label||label.length>80){if(status)status.textContent='タイマー名を1〜80文字で入力してください。';return;}
    try{await post({action:'timer_start',log_type:'TIMER',timer_label:label,subject_id:Number(new FormData(form).get('subject_id')||selectedSubject()||0)});location.reload();}
    catch(err){if(status)status.textContent=err?.message||String(err);}
  });
  document.querySelectorAll('.family-log-sleep-start').forEach(btn=>btn.addEventListener('click',async()=>{
    btn.disabled=true;try{await post({action:'sleep_start',subject_id:Number(btn.dataset.subjectId||0)});location.reload();}catch(err){alert(err?.message||String(err));btn.disabled=false;}
  }));
  document.querySelectorAll('.family-log-sleep-stop').forEach(btn=>btn.addEventListener('click',async()=>{
    const elapsed=Math.max(0,Math.floor((Date.now()-Number(btn.dataset.startedMs||Date.now()))/60000));
    let wakeAt='';
    if(elapsed>=Number(payload.sleepConfirmMinutes||960)){
      const hours=Math.floor(elapsed/60),minutes=elapsed%60;
      if(!confirm(`${hours}時間${minutes}分として記録しますか？\n「キャンセル」で起床時刻を修正できます。`)){
        wakeAt=String(prompt('起床時刻を YYYY-MM-DDTHH:mm で入力してください',normalizeDateTime(new Date().toLocaleString('sv-SE',{timeZone:'Asia/Tokyo'})))||'');
        if(!wakeAt)return;
      }
    }
    btn.disabled=true;try{await post({action:'sleep_stop',timer_id:Number(btn.dataset.id||0),wake_at:wakeAt});location.reload();}catch(err){alert(err?.message||String(err));btn.disabled=false;}
  }));
  document.querySelectorAll('.family-log-sleep-adjust').forEach(btn=>btn.addEventListener('click',async()=>{
    const startedAt=String(prompt('開始時刻を YYYY-MM-DDTHH:mm で入力してください',String(btn.dataset.startedAt||''))||'');if(!startedAt)return;
    btn.disabled=true;try{await post({action:'sleep_adjust',timer_id:Number(btn.dataset.id||0),started_at:startedAt});location.reload();}catch(err){alert(err?.message||String(err));btn.disabled=false;}
  }));
  document.querySelectorAll('.family-log-timer-stop').forEach(btn=>btn.addEventListener('click',async()=>{
    btn.disabled=true;
    try{
      await post({action:'timer_stop',timer_id:Number(btn.dataset.id||0)});
      location.reload();
    }catch(err){
      alert(err?.message||String(err));
      btn.disabled=false;
    }
  }));
  document.querySelectorAll('.family-log-timer-cancel').forEach(btn=>btn.addEventListener('click',async()=>{
    if(!confirm('このタイマーを取り消しますか？'))return;
    btn.disabled=true;
    try{
      await post({action:'timer_cancel',timer_id:Number(btn.dataset.id||0)});
      location.reload();
    }catch(err){
      alert(err?.message||String(err));
      btn.disabled=false;
    }
  }));

  const choreModal=byId('familyQuickChoreModal');
  const choreForm=byId('familyQuickChoreForm');
  const choreStatus=byId('familyQuickChoreStatus');
  const choreDisable=byId('familyQuickChoreDisable');
  let choreItems=Array.isArray(payload.quickChores)?payload.quickChores.map(x=>({...x})):[];
  const choreField=name=>choreForm?.elements.namedItem(name)||null;
  function renderChoreManager(){
    const active=choreItems.filter(x=>x.active),hidden=choreItems.filter(x=>!x.active);
    const order=byId('familyQuickChoreOrder'),hiddenWrap=byId('familyQuickChoreHidden');
    if(order)order.innerHTML=active.map((x,i)=>`<div class="family-quick-chore-manage-row"><span>${escapeHtml(x.icon)} ${escapeHtml(x.name)}</span><div class="actions"><button type="button" class="btn gray chore-move" data-id="${x.id}" data-step="-1" ${i===0?'disabled':''}>↑</button><button type="button" class="btn gray chore-move" data-id="${x.id}" data-step="1" ${i===active.length-1?'disabled':''}>↓</button></div></div>`).join('')||'<p class="small">表示中の項目はありません。</p>';
    if(hiddenWrap)hiddenWrap.innerHTML=hidden.length?`<h3 class="family-quick-chore-hidden-title">非表示</h3>${hidden.map(x=>`<div class="family-quick-chore-manage-row"><span>${escapeHtml(x.icon)} ${escapeHtml(x.name)}</span><button type="button" class="btn gray chore-restore" data-id="${x.id}">復活</button></div>`).join('')}`:'';
  }
  function openChore(item){
    if(!choreForm)return;
    choreForm.reset();choreField('id').value=item?.id||'';choreField('name').value=item?.name||'';choreField('icon').value=item?.icon||'✨';
    const mask=Number(item?.weekday_mask??127);
    choreForm.querySelectorAll('input[name="weekday"]').forEach(input=>{input.checked=(mask&Number(input.value))!==0;});
    byId('familyQuickChoreTitle').textContent=item?'家事項目を編集':'家事項目を追加';
    choreDisable.style.display=item?'':'none';choreStatus.textContent='';renderChoreManager();setOpen(choreModal,true);
  }
  byId('familyQuickChoreAdd')?.addEventListener('click',()=>openChore(null));
  byId('familyQuickChoreClose')?.addEventListener('click',()=>setOpen(choreModal,false));
  document.querySelectorAll('.family-quick-chore-edit').forEach(btn=>btn.addEventListener('click',()=>openChore(choreItems.find(x=>x.id===Number(btn.dataset.id)))));
  choreForm?.addEventListener('submit',async e=>{
    e.preventDefault();const id=Number(choreField('id').value||0);choreStatus.textContent='保存中…';
    const weekdayMask=[...choreForm.querySelectorAll('input[name="weekday"]:checked')].reduce((mask,input)=>mask|Number(input.value),0);
    try{await post({action:id?'quick_chore_update':'quick_chore_add',id,name:choreField('name').value,icon:choreField('icon').value,weekday_mask:weekdayMask});location.reload();}
    catch(err){choreStatus.textContent=err?.message||String(err);}
  });
  choreDisable?.addEventListener('click',async()=>{
    const id=Number(choreField('id').value||0);if(!id||!confirm('この項目を非表示にしますか？過去の記録は残ります。'))return;
    try{await post({action:'quick_chore_remove',id});location.reload();}catch(err){choreStatus.textContent=err?.message||String(err);}
  });
  choreModal?.addEventListener('click',async e=>{
    const move=e.target.closest('.chore-move'),restore=e.target.closest('.chore-restore');
    if(move){const active=choreItems.filter(x=>x.active),index=active.findIndex(x=>x.id===Number(move.dataset.id)),next=index+Number(move.dataset.step);if(index<0||next<0||next>=active.length)return;[active[index],active[next]]=[active[next],active[index]];try{await post({action:'quick_chore_reorder',ids:active.map(x=>x.id)});location.reload();}catch(err){choreStatus.textContent=err?.message||String(err);}}
    if(restore){try{await post({action:'quick_chore_restore',id:Number(restore.dataset.id)});location.reload();}catch(err){choreStatus.textContent=err?.message||String(err);}}
  });
  document.querySelectorAll('.family-quick-chore-record').forEach(btn=>btn.addEventListener('click',async()=>{
    btn.disabled=true;
    try{await post({action:'quick_chore_record',id:Number(btn.dataset.id||0),occurred_at:nowLocal});location.reload();}
    catch(err){alert(err?.message||String(err));btn.disabled=false;}
  }));

  document.addEventListener('keydown',e=>{
    if(e.key==='Escape'){
      setOpen(logModal,false);
      setOpen(subjectModal,false);
      setOpen(choreModal,false);
    }
  });

  document.documentElement.dataset.familyLogJs='ready';

  const dashboard= document.querySelector('.family-log-dashboard');
  if(dashboard instanceof HTMLDetailsElement){
    if(dashboard.dataset.dashboardLoaded==='1')dashboard.open=true;
    dashboard.addEventListener('toggle',()=>{
      if(dashboard.open&&dashboard.dataset.dashboardLoaded!=='1'){
        const load=dashboard.querySelector('.family-log-dashboard-load');
        if(load instanceof HTMLAnchorElement)location.href=load.href;
      }
    });
  }

  const settingsModal=byId('familyLogSettingsModal');
  const settingsForm=byId('familyLogSettingsForm');
  byId('familyLogSettingsOpen')?.addEventListener('click',()=>setOpen(settingsModal,true));
  byId('familyLogSettingsClose')?.addEventListener('click',()=>setOpen(settingsModal,false));
  settingsModal?.addEventListener('click',event=>{if(event.target===settingsModal)setOpen(settingsModal,false);});
  settingsForm?.addEventListener('submit',async event=>{
    event.preventDefault();const status=byId('familyLogSettingsStatus');
    const checkbox=settingsForm.elements.namedItem('show_adult_logs');
    if(status)status.textContent='保存しています…';
    try{await post({action:'settings_update',show_adult_logs:checkbox instanceof HTMLInputElement&&checkbox.checked});location.href=managementMode?'/app/settings_family_log.php':`/app/family_log.php?date=${encodeURIComponent(selectedDate)}`;}
    catch(err){if(status)status.textContent=err?.message||String(err);}
  });

})();
