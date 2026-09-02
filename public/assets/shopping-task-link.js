(() => {
'use strict';
const payloadNode=document.getElementById('shoppingTaskLinkPayload');
const select=document.getElementById('shoppingTaskId');
const dueInput=document.getElementById('shoppingTaskDueDate');
const showAllInput=document.getElementById('shoppingTaskShowAll');
const hint=document.getElementById('shoppingTaskHint');
if(!payloadNode||!select||!dueInput||!showAllInput)return;
let payload={};
try{payload=JSON.parse(payloadNode.textContent||'{}');}catch{return;}
const tasks=Array.isArray(payload.tasks)?payload.tasks.map(task=>({
  id:Number(task?.id||0),
  title:String(task?.title||''),
  start:String(task?.start||''),
  end:String(task?.end||''),
  due:String(task?.due||''),
})).filter(task=>Number.isSafeInteger(task.id)&&task.id>0&&task.title):[];
const initialSelected=Number(payload.selectedTaskId||0)||0;
const dateOf=task=>task.start||task.due||'';
const endOf=task=>task.end||dateOf(task);
const overlaps=(task,date)=>Boolean(date&&dateOf(task)&&dateOf(task)<=date&&(!endOf(task)||endOf(task)>=date));
const distance=(task,date)=>{
  const d=dateOf(task);if(!d)return Number.POSITIVE_INFINITY;
  return Math.abs(Date.parse(`${d}T00:00:00Z`)-Date.parse(`${date}T00:00:00Z`));
};
const label=task=>{
  const start=dateOf(task),end=endOf(task);
  const suffix=start?(end&&end!==start?`（${start}〜${end}）`:`（${start}）`):'（期限なし）';
  return `${task.title}${suffix}`;
};
function render(){
  const date=String(dueInput.value||'');
  const current=Number(select.value||initialSelected||0)||0;
  const showAll=Boolean(showAllInput.checked);
  const visible=tasks.filter(task=>showAll||overlaps(task,date)||task.id===current||task.id===initialSelected).sort((a,b)=>{
    const am=overlaps(a,date)?0:1,bm=overlaps(b,date)?0:1;if(am!==bm)return am-bm;
    if(date){const ad=dateOf(a),bd=dateOf(b);const af=ad>=date?0:ad?2:1,bf=bd>=date?0:bd?2:1;if(af!==bf)return af-bf;const dd=distance(a,date)-distance(b,date);if(dd)return dd;}
    return a.id-b.id;
  });
  const fragment=document.createDocumentFragment();
  const none=document.createElement('option');none.value='0';none.textContent='タスクなし';fragment.appendChild(none);
  for(const task of visible){const option=document.createElement('option');option.value=String(task.id);option.textContent=label(task);if(task.id===current)option.selected=true;fragment.appendChild(option);}
  select.replaceChildren(fragment);
  if(!visible.some(task=>task.id===current))select.value='0';
  const sameDay=tasks.filter(task=>overlaps(task,date)).length;
  const hidden=Math.max(0,tasks.length-visible.length);
  if(hint)hint.textContent=date?`期限日に重なる未完了タスク ${sameDay}件を優先表示中${hidden?`。その他 ${hidden}件はチェックで表示できます。`:''}`:'期限を指定すると、その日に重なる未完了タスクだけを先に表示します。';
}
dueInput.addEventListener('change',render);
showAllInput.addEventListener('change',render);
select.addEventListener('change',render);
render();
})();
