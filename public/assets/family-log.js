(()=>{
'use strict';
const load=(src,onload)=>{const s=document.createElement('script');s.src=src;s.defer=true;if(onload)s.addEventListener('load',onload,{once:true});s.addEventListener('error',()=>console.error('[Family TODO] asset load failed',src),{once:true});document.head.appendChild(s);};
// BABY_FOOD already uses the canonical MEAL/BABY_FOOD Family Log model, but the
// historical default quick action records an empty row immediately. Keep that
// stored action compatible while routing it through the existing authenticated
// record form so parents can optionally add what was eaten and a note.
document.querySelectorAll('.family-log-quick-action[data-detail="BABY_FOOD"]').forEach(button=>{
  button.classList.remove('family-log-quick-action');
  button.classList.add('family-log-form-action');
  button.dataset.logType='MEAL';
});
// QUICK actions use their dedicated execute_quick_action handler. Remove the generic
// data-log-type route before the core enhancer binds it so one-tap recording never
// opens the detailed record sheet first.
document.querySelectorAll('.family-log-quick-action[data-log-type]').forEach(button=>button.removeAttribute('data-log-type'));
// Wave128's final four-column rule wins the stylesheet cascade on 320px devices.
// Restore the established narrow-screen fallback without changing wider layouts.
const narrowGridStyle=document.createElement('style');
narrowGridStyle.textContent='@media(max-width:340px){.family-log-quick-grid,.family-quick-chore-grid,.family-log-overview-group .family-log-quick-grid{grid-template-columns:repeat(3,minmax(0,1fr))}}.family-log-quick strong.family-log-label-nowrap,.family-quick-chore-record strong.family-log-label-nowrap{white-space:nowrap!important;overflow-wrap:normal!important;word-break:keep-all!important}';
document.head.appendChild(narrowGridStyle);
// Four-character labels such as おしっこ fit the quick-action tile and should stay
// on one line. Mark them as already normalized so the global PWA enhancer does not
// touch them. Longer 5-8 character labels retain the established 4+remainder split.
document.querySelectorAll('.family-log-quick strong,.family-quick-chore-record strong').forEach(label=>{
  if(label.querySelector('br'))return;
  const chars=Array.from(label.textContent||'');
  if(chars.length<4||chars.length>8)return;
  label.dataset.wave128Label='1';
  if(chars.length===4){label.classList.add('family-log-label-nowrap');return;}
  label.replaceChildren(document.createTextNode(chars.slice(0,4).join('')),document.createElement('br'),document.createTextNode(chars.slice(4).join('')));
});
// Family Log quick-action unification: the "すべて" overview executes the same
// retained per-subject quick actions used on subject pages. Subject kinds and
// historical family_logs remain intact as compatibility/history metadata.
try{
  const payloadNode=document.getElementById('familyLogPayload');
  const payload=payloadNode?JSON.parse(payloadNode.textContent||'{}'):null;
  if(payload&&!payload.managementMode&&!Number(payload.selectedSubject||0)&&!payload.adultAggregate){
    const actions=Array.isArray(payload.quickActions)?payload.quickActions:[];
    const subjects=payload.subjects&&typeof payload.subjects==='object'?payload.subjects:{};
    const showAdultLogs=payload.showAdultLogs!==false;
    const eligibleSubjects=Object.values(subjects).filter(subject=>subject&&Number(subject.id)&&(showAdultLogs||String(subject.subject_kind||'').toUpperCase()!=='ADULT'));
    const displayPrefix=subject=>`${subject.icon||'👤'} ${subject.name||subject.member_name||'対象'}`;
    const groups=[];
    const authoritativeSubjects=[];
    for(const subject of eligibleSubjects){
      // Sleep toggle needs live timer state. It is intentionally not synthesized here;
      // when a legacy overview section is safely replaced, its live sleep control is
      // moved into the unified group before the old palette is removed.
      const subjectActions=actions.filter(action=>Number(action?.subject_id)===Number(subject.id)&&Number(action?.active??1)===1&&String(action?.mode||'QUICK')!=='SLEEP_TOGGLE');
      if(!subjectActions.length)continue;
      const subjectPrefix=displayPrefix(subject);
      const section=document.createElement('section');section.className='family-log-overview-group family-log-unified-quick-group';section.dataset.subjectId=String(Number(subject.id));
      const title=document.createElement('h2');title.textContent=`${subjectPrefix} クイック`;section.appendChild(title);
      const grid=document.createElement('div');grid.className='family-log-quick-grid';
      for(const action of subjectActions){
        const babyFood=String(action.log_type||'').toUpperCase()==='MEAL'&&String(action.detail_code||'').toUpperCase()==='BABY_FOOD';
        const effectiveMode=babyFood?'FORM':String(action.mode||'QUICK');
        const button=document.createElement('button');button.type='button';button.className=`family-log-quick ${String(effectiveMode||'QUICK')==='QUICK'?'family-log-quick-action':'family-log-form-action'}`;
        button.dataset.quickActionId=String(Number(action.id||0));button.dataset.subjectId=String(Number(subject.id));
        button.dataset.detail=String(action.detail_code||'');button.dataset.amount=action.amount==null?'':String(action.amount);button.dataset.unit=String(action.unit||'');button.dataset.valueText=String(action.value_text||'');
        if(String(effectiveMode||'QUICK')!=='QUICK')button.dataset.logType=String(action.log_type||'MEMO');
        const icon=document.createElement('span');icon.textContent=String(action.icon||'＋');const label=document.createElement('strong');label.textContent=String(action.name||'記録');
        if(Array.from(label.textContent||'').length===4)label.classList.add('family-log-label-nowrap');
        button.append(icon,label);grid.appendChild(button);
      }
      section.appendChild(grid);groups.push(section);authoritativeSubjects.push({subjectId:Number(subject.id),subjectPrefix,section});
    }
    if(groups.length){
      let overview=document.querySelector('.family-log-overview-quick');
      if(!overview){overview=document.createElement('div');overview.className='family-log-overview-quick';document.querySelector('.family-log-date-head')?.insertAdjacentElement('afterend',overview);}
      const legacySections=[...overview.querySelectorAll('.family-log-overview-group:not(.family-log-unified-quick-group)')];
      // The server-rendered legacy buttons already carry data-subject-id. Prefer that
      // stable identity so old baby/child/pet palettes disappear even when names/icons
      // collide. Heading matching remains a conservative compatibility fallback for
      // legacy sections that expose no usable subject id (for example sleep-only state).
      const legacySubjectId=section=>{
        const ids=[...new Set([...section.querySelectorAll('[data-subject-id]')].map(node=>Number(node.dataset.subjectId||0)).filter(Boolean))];
        return ids.length===1?ids[0]:0;
      };
      for(const authority of authoritativeSubjects){
        let matches=legacySections.filter(section=>legacySubjectId(section)===authority.subjectId);
        if(matches.length!==1){
          // The retained server page may not expose a usable subject id on every legacy
          // overview section. Fall back only when exactly one eligible payload subject can
          // produce the full heading and exactly one legacy section has it.
          // Any name/icon collision preserves the fallback.
          const matchingSubjects=eligibleSubjects.filter(subject=>displayPrefix(subject)===authority.subjectPrefix);
          if(matchingSubjects.length!==1)continue;
          matches=legacySections.filter(section=>String(section.querySelector('h2')?.textContent||'').trim()===authority.subjectPrefix);
        }
        if(matches.length!==1)continue;
        const legacy=matches[0],grid=authority.section.querySelector('.family-log-quick-grid');
        legacy.querySelectorAll('.family-log-sleep-start,.family-log-sleep-stop').forEach(control=>grid?.appendChild(control));
        legacy.remove();
      }
      for(let i=groups.length-1;i>=0;i--)overview.prepend(groups[i]);
    }
  }
}catch(_error){/* retain the server-rendered Family Log overview on enhancement failure */}

const syncBabyFoodFields=()=>{
  const form=document.getElementById('familyLogForm');
  if(!(form instanceof HTMLFormElement))return;
  const type=form.elements.namedItem('log_type');
  const detail=form.elements.namedItem('detail_code');
  if(!(type instanceof HTMLSelectElement)||!(detail instanceof HTMLSelectElement)||type.value!=='MEAL')return;
  const wrap=document.getElementById('familyLogTextWrap');
  const label=document.getElementById('familyLogTextLabel');
  const input=form.elements.namedItem('value_text');
  const babyFood=detail.value==='BABY_FOOD';
  if(wrap)wrap.style.display=babyFood?'':'none';
  if(label)label.textContent=babyFood?'食べたもの（任意）':'内容';
  if(input instanceof HTMLInputElement)input.placeholder=babyFood?'例：10倍がゆ、にんじん':'';
};
const queueBabyFoodSync=()=>queueMicrotask(syncBabyFoodFields);
document.addEventListener('click',event=>{
  const target=event.target instanceof Element?event.target:null;
  if(target?.closest('.family-log-form-action[data-detail="BABY_FOOD"],.family-log-edit,#familyLogDetailChoices [data-detail]'))queueBabyFoodSync();
},true);
document.addEventListener('change',event=>{
  const target=event.target;
  if(target instanceof HTMLSelectElement&&['log_type','detail_code'].includes(target.name))queueBabyFoodSync();
});

// Load the photo enhancer first so its capture-phase save hook is registered before
// the canonical Family Log core attaches its ordinary submit handler. When no photo
// is pending, the core remains the sole owner of the save flow.
load('/assets/family-log-baby-food-media.js?v=baby-food-photo1',()=>{
  load('/assets/family-log-core.js?v=wave128-fix18',()=>{
    syncBabyFoodFields();
    load('/assets/family-log-management-ui.js?v=wave128-fix18');
  });
});
})();
