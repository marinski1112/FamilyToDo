(()=>{'use strict';
// Both goods kinds use the same chooser; each keeps its own category catalog.
window.familytodoChooseSet=async({set,kind,date,host,post,onAdded})=>{
 host.querySelector('.selected-set-chooser')?.remove();
 const form=document.createElement('form');form.className='selected-set-chooser';
 const title=document.createElement('strong');title.textContent=String(set.name||'セット')+'：追加する項目';
 const entries=Array.isArray(set.entries)?set.entries:[];
 const picks=document.createElement('div');picks.className='selected-set-picks';
 for(const entry of entries){const label=document.createElement('label'),box=document.createElement('input');box.type='checkbox';box.value=String(entry.id);box.disabled=!Number.isSafeInteger(entry.id)||entry.id<=0;label.append(box,document.createTextNode(String(entry.name||'')+(kind==='shopping'&&entry.quantity?' × '+entry.quantity:'')));picks.append(label);}
 const controls=document.createElement('div');controls.className='selected-set-controls';
 const all=document.createElement('button'),none=document.createElement('button');all.type=none.type='button';all.textContent='全て選択';none.textContent='選択解除';
 const categoryLabel=document.createElement('label');categoryLabel.textContent='追加先カテゴリ';const category=document.createElement('select');category.disabled=true;categoryLabel.append(category);
 const status=document.createElement('p');status.setAttribute('role','status');status.setAttribute('aria-live','polite');status.textContent='カテゴリを読み込み中…';
 const add=document.createElement('button');add.type='submit';add.disabled=true;
 const cancel=document.createElement('button');cancel.type='button';cancel.textContent='戻る';cancel.onclick=()=>form.remove();
 let busy=false,signature='',rid='';
 const selected=()=>[...picks.querySelectorAll('input:checked')].map(box=>Number(box.value)).sort((a,b)=>a-b);
 const refresh=()=>{const count=selected().length;add.textContent=`選んだ${count}件を追加`;add.disabled=busy||category.disabled||count===0;};
 picks.onchange=refresh;all.onclick=()=>{if(busy)return;for(const box of picks.querySelectorAll('input:not(:disabled)'))box.checked=true;refresh();};none.onclick=()=>{if(busy)return;for(const box of picks.querySelectorAll('input'))box.checked=false;refresh();};
 controls.append(all,none);form.append(title,controls,picks,categoryLabel,add,cancel,status);host.append(form);title.tabIndex=-1;title.focus();
 try{const r=await fetch('/api/'+kind+'?view=categories',{credentials:'same-origin',headers:{accept:'application/json'}}),d=await r.json();if(!r.ok||!d.ok)throw new Error('カテゴリを読み込めませんでした。戻って再度開いてください。');
  if(!form.isConnected)return;category.add(new Option('未分類',''));for(const value of d.categories||[]){if(value&&value!=='未分類')category.add(new Option(value,value));}category.disabled=false;status.textContent='必要な項目にチェックし、追加先を選んでください。';refresh();
 }catch(error){status.textContent=error.message;}
 form.onsubmit=async e=>{e.preventDefault();if(busy||add.disabled)return;
  const entry_ids=selected(),target_category=category.value,payload={action:'reusable_set_invoke_selected',set_id:Number(set.id),date,entry_ids,target_category};
  const next=JSON.stringify(payload);if(signature!==next){signature=next;const key='familytodo.selected-set:'+kind+':'+next;try{rid=sessionStorage.getItem(key)||crypto.randomUUID();sessionStorage.setItem(key,rid);}catch{rid=crypto.randomUUID();}}
  busy=true;for(const control of form.querySelectorAll('input,select,button'))control.disabled=true;status.textContent='追加中…';
  try{const d=await post({...payload,client_request_id:rid});try{sessionStorage.removeItem('familytodo.selected-set:'+kind+':'+signature);}catch{}status.textContent='追加しました。';await onAdded(d);form.remove();}
  catch(error){status.textContent=error.message||'追加できませんでした。同じ選択で再試行できます。';}
  finally{busy=false;for(const control of form.querySelectorAll('input,select,button'))control.disabled=false;refresh();}
 };
};
})();
