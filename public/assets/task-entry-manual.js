(() => {
'use strict';
const init=()=>{
  try{
    const form=document.getElementById('taskForm');
    if(!form)return;
    const payload=JSON.parse(document.getElementById('taskNewPayload')?.textContent||'{}');
    const primary=()=>String(form.querySelector('[name=rough_primary_type]:checked')?.value||payload.initialType||'task');
    const dateInput=document.getElementById('taskDate');
    const endDateInput=document.getElementById('taskEndDate');
    const endDateWrap=document.getElementById('endDateWrap');
    const noDate=document.getElementById('noDate');
    const noDateWrap=document.getElementById('taskNoDateWrap');
    const allDay=document.getElementById('allDay');
    const times=document.getElementById('dateTimes');
    const completionWrap=document.getElementById('taskCompletionWrap');
    const assigneeWrap=document.getElementById('taskAssigneeWrap');
    const calendarVisible=document.getElementById('taskCalendarVisible');
    const calendarColorWrap=document.getElementById('taskCalendarColorWrap');
    const isPrivate=document.getElementById('isPrivate');
    const assignees=[...form.querySelectorAll('[name=assignees]')];
    const requestedInitial=String(payload.initialType||'task');
    const initialRadio=form.querySelector(`[name=rough_primary_type][value="${requestedInitial==='event'?'event':'task'}"]`);
    if(initialRadio&&!initialRadio.checked){initialRadio.checked=true;initialRadio.dispatchEvent(new Event('change',{bubbles:true}));}

    const calendarReturnView=(()=>{try{const u=new URL(document.referrer);if(u.origin===location.origin&&u.pathname==='/app/calendar.php'){const v=String(u.searchParams.get('view')||'');if(['all','family','assigned','private'].includes(v))return v;}}catch{}return 'all';})();
    const syncDate=()=>{
      const mode=primary(),eventMode=mode==='event';
      if(eventMode&&noDate)noDate.checked=false;
      const noDateSelected=!eventMode&&Boolean(noDate?.checked);
      if(dateInput)dateInput.disabled=noDateSelected;
      if(endDateInput)endDateInput.disabled=noDateSelected;
      if(noDateSelected){
        if(dateInput)dateInput.value='';
        if(endDateInput)endDateInput.value='';
        if(times)times.style.display='none';
        if(endDateWrap)endDateWrap.style.display='none';
        if(allDay){allDay.checked=true;allDay.disabled=true;}
      }else{
        if(dateInput)dateInput.disabled=false;
        if(endDateInput)endDateInput.disabled=false;
        if(allDay)allDay.disabled=false;
        if(endDateWrap)endDateWrap.style.display='block';
        if(endDateInput&&!endDateInput.value)endDateInput.value=String(dateInput?.value||'');
        if(times)times.style.display=allDay?.checked?'none':'grid';
      }
    };
    const syncType=()=>{
      const mode=primary(),eventMode=mode==='event',taskMode=mode==='task';
      if(noDateWrap)noDateWrap.hidden=eventMode;
      if(completionWrap)completionWrap.hidden=eventMode;
      if(assigneeWrap)assigneeWrap.hidden=eventMode;
      if(eventMode){
        if(noDate){noDate.checked=false;noDate.disabled=true;}
        assignees.forEach(input=>{input.checked=false;input.disabled=true;});
      }else if(taskMode){
        if(noDate)noDate.disabled=false;
        assignees.forEach(input=>{input.disabled=Boolean(isPrivate?.checked);if(isPrivate?.checked)input.checked=false;});
      }
      syncDate();
    };
    const syncCalendar=()=>{if(calendarColorWrap)calendarColorWrap.style.display=calendarVisible?.checked?'block':'none';};
    const validateRange=()=>{
      const mode=primary(),eventMode=mode==='event';
      if(!eventMode&&noDate?.checked)return '';
      const start=String(dateInput?.value||''),end=String(endDateInput?.value||start);
      if(eventMode&&!start)return 'イベントには日付を指定してください。';
      if(start&&end&&end<start)return '終了日は開始日以降にしてください。';
      if(!allDay?.checked){
        const startTime=String(form.elements.startTime?.value||''),endTime=String(form.elements.endTime?.value||'');
        if(!startTime)return '開始時刻を入力してください。';
        if(start&&end&&endTime&&`${end}T${endTime}`<`${start}T${startTime}`)return '終了日時は開始日時以降にしてください。';
      }
      return '';
    };

    form.querySelectorAll('[name=rough_primary_type]').forEach(input=>input.addEventListener('change',syncType));
    noDate?.addEventListener('change',syncDate);
    dateInput?.addEventListener('change',()=>{if(endDateInput&&!endDateInput.value)endDateInput.value=dateInput.value;});
    allDay?.addEventListener('change',syncDate);
    isPrivate?.addEventListener('change',syncType);
    calendarVisible?.addEventListener('change',syncCalendar);
    syncType();syncCalendar();

    form.addEventListener('submit',async event=>{
      event.preventDefault();
      const mode=primary();
      if(mode!=='task'&&mode!=='event'){alert('買い物・持ち物は専用の手入力欄を使用してください。');return;}
      const rangeError=validateRange();if(rangeError){alert(rangeError);return;}
      const title=String(form.elements.title?.value||'').trim();if(!title){alert('タイトルを入力してください。');form.elements.title?.focus();return;}
      const eventMode=mode==='event';
      const body={
        csrf:String(form.elements.csrf?.value||''),
        title,
        description:String(form.elements.description?.value||''),
        is_event:eventMode,
        is_private:Boolean(isPrivate?.checked),
        dateOnly:String(dateInput?.value||''),
        endDateOnly:String(endDateInput?.value||dateInput?.value||''),
        noDate:eventMode?false:Boolean(noDate?.checked),
        allDay:Boolean(allDay?.checked),
        startTime:String(form.elements.startTime?.value||''),
        endTime:String(form.elements.endTime?.value||''),
        location:String(form.elements.location?.value||''),
        calendar_visible:Boolean(calendarVisible?.checked),
        calendar_color:String(form.elements.calendar_color?.value||''),
        completion_mode:eventMode?'ANY':String(form.elements.completion_mode?.value||'ANY'),
        assignees:eventMode?[]:[...form.querySelectorAll('[name=assignees]:checked')].map(input=>Number(input.value)).filter(id=>Number.isInteger(id)&&id>0),
        reminderAt:String(form.elements.reminderAt?.value||''),
        shopping:[],
        items:[],
      };
      const submit=form.querySelector('button[type=submit]'),old=submit?.textContent||'登録する';if(submit){submit.disabled=true;submit.textContent='登録中…';}
      try{
        const response=await fetch('/api/task',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)}),data=await response.json().catch(()=>null);
        if(!response.ok||!data?.ok)throw new Error('登録に失敗しました。');
        const savedDate=String(body.dateOnly||'');
        if(payload.returnTo==='calendar')location.href=!body.noDate&&savedDate?'/app/calendar.php?view='+encodeURIComponent(calendarReturnView)+'&month='+encodeURIComponent(savedDate.slice(0,7))+'&date='+encodeURIComponent(savedDate):'/app/calendar.php?view='+encodeURIComponent(calendarReturnView);
        else location.href=body.noDate?'/app/tasks.php':'/app/tasks.php?date='+encodeURIComponent(savedDate);
      }catch(_error){alert('登録に失敗しました。');if(submit){submit.disabled=false;submit.textContent=old;}}
    });
    document.documentElement.dataset.taskEntryManual='ready';
  }catch{document.documentElement.dataset.taskEntryManual='error';}
};
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
})();