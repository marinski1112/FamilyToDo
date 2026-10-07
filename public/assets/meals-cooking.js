(()=>{
'use strict';
const maximum=180*60*1000,lifetime=7*86400000;
function create({key,maxStep,storage=window.localStorage,now=()=>Date.now(),onChange=()=>{},schedule=fn=>setInterval(fn,1000),unschedule=id=>clearInterval(id)}){
 let state={step:0,end_at:0,paused_ms:0,touched_at:now()},persistent=true,disposed=false;
 const validKey=/^familytodo\.meal\.cook\.[a-zA-Z0-9-]{8,72}\.(?:\d{4}-\d{2}-\d{2}|queue-[a-zA-Z0-9-]{8,72})$/.test(key);
 if(!validKey)throw Error('料理の識別情報が不正です。');
 try{const raw=storage.getItem(key);let v=null;try{v=raw?JSON.parse(raw):null;}catch{}if(v&&Number.isInteger(v.step)&&v.step>=0&&v.step<=maxStep&&Number.isSafeInteger(v.end_at)&&v.end_at>=0&&v.end_at<=now()+maximum&&Number.isSafeInteger(v.paused_ms)&&v.paused_ms>=0&&v.paused_ms<=maximum&&!(v.end_at&&v.paused_ms)&&Number.isSafeInteger(v.touched_at)&&v.touched_at<=now()&&now()-v.touched_at<=lifetime)state={step:v.step,end_at:v.end_at,paused_ms:v.paused_ms,touched_at:v.touched_at};}catch{persistent=false;}
 const snapshot=()=>({step:state.step,persistent,status:state.end_at?(state.end_at<=now()?'FINISHED':'RUNNING'):state.paused_ms?'PAUSED':'IDLE',remaining_seconds:Math.max(0,Math.ceil((state.end_at?state.end_at-now():state.paused_ms)/1000))});
 const publish=()=>{if(!disposed)onChange(snapshot());};
 const save=()=>{state.touched_at=now();try{storage.setItem(key,JSON.stringify(state));
  // Only anonymous local step/timer state is kept; cap retained recipes on this browser.
  const rows=[];for(let i=0;i<storage.length;i++){const k=storage.key(i);if(k?.startsWith('familytodo.meal.cook.')){let touched=0;try{touched=Number(JSON.parse(storage.getItem(k)).touched_at)||0;}catch{}rows.push({key:k,touched});}}
  rows.sort((a,b)=>b.touched-a.touched);for(const row of rows.filter(row=>row.key!==key).slice(19))storage.removeItem(row.key);
  persistent=true;
 }catch{persistent=false;}publish();};
 const timer=schedule(publish);
 return {snapshot,refresh:publish,setStep(step){if(!Number.isInteger(step)||step<0||step>maxStep)throw Error('手順が不正です。');state.step=step;save();},start(seconds){if(!Number.isInteger(seconds)||seconds<1||seconds>maximum/1000)throw Error('タイマーは1秒〜180分で指定してください。');state.end_at=now()+seconds*1000;state.paused_ms=0;save();},pause(){if(snapshot().status!=='RUNNING')return;state.paused_ms=Math.max(0,state.end_at-now());state.end_at=0;save();},resume(){if(!state.paused_ms)return;state.end_at=now()+state.paused_ms;state.paused_ms=0;save();},cancel(){state.end_at=0;state.paused_ms=0;save();},dispose(){disposed=true;unschedule(timer);}};
}
window.FamilyTodoMealCooking={create};
})();
