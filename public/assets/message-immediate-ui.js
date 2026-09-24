(()=>{
'use strict';
const forms=[document.getElementById('messageNew'),document.getElementById('msgForm')].filter(form=>form instanceof HTMLFormElement);
if(!forms.length)return;

const truthy=value=>['1','true','on','yes'].includes(String(value||'').toLowerCase());
for(const form of forms){
  const reminder=form.querySelector('input[name="reminder_at"]');
  if(!(reminder instanceof HTMLInputElement)||form.querySelector('input[name="notify_now"]'))continue;
  const row=document.createElement('label');row.className='checkrow message-notify-now';
  const checkbox=document.createElement('input');checkbox.type='checkbox';checkbox.name='notify_now';checkbox.value='1';
  const text=document.createElement('span');text.textContent='🔔 今すぐ通知';
  row.append(checkbox,text);
  const reminderLabel=reminder.previousElementSibling;
  if(reminderLabel instanceof HTMLLabelElement)form.insertBefore(row,reminderLabel);else form.insertBefore(row,reminder);
  const sync=()=>{
    if(checkbox.checked){reminder.value='';reminder.disabled=true;}
    else reminder.disabled=false;
  };
  checkbox.addEventListener('change',sync);
  reminder.addEventListener('input',()=>{if(reminder.value){checkbox.checked=false;sync();}});
  sync();
}

const nativeFetch=window.fetch.bind(window);
window.fetch=async(input,init)=>{
  const response=await nativeFetch(input,init);
  let immediateRequested=false;
  try{
    const method=String(init?.method||((input instanceof Request)?input.method:'GET')).toUpperCase();
    const url=new URL(input instanceof Request?input.url:String(input),location.origin);
    if(response.ok&&method==='POST'&&(url.pathname==='/api/messages'||url.pathname==='/api/message-stamps')&&typeof init?.body==='string'){
      const body=JSON.parse(init.body);
      const action=String(body?.action||'create');
      immediateRequested=action==='create'&&truthy(body?.notify_now);
      if(immediateRequested){
        const saved=await response.clone().json();
        if(!Number.isSafeInteger(Number(saved?.id))||Number(saved.id)<=0)throw new Error('伝言IDを取得できませんでした。');
        const notifyResponse=await nativeFetch('/api/message-immediate-notify',{
          method:'POST',headers:{'content-type':'application/json'},credentials:'same-origin',
          body:JSON.stringify({
            csrf:String(body?.csrf||''),
            message_id:Number(saved.id),
          }),
        });
        if(!notifyResponse.ok)throw new Error('即時通知に失敗しました。');
      }
    }
  }catch(error){
    if(immediateRequested)alert('伝言は保存しましたが、即時通知に失敗しました。通知設定を確認してください。');
  }
  return response;
};
})();
