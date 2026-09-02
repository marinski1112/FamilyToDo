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
const DEFAULT_VISIBLE_LIMIT=12;
const todayJst=()=>new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Tokyo',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
const dateOf=task=>task.start||task.due||'';
const endOf=task=>task.end||dateOf(task);
const overlaps=(task,date)=>Boolean(date&&dateOf(task)&&dateOf(task)<=date&&(!endOf(task)||endOf(task)>=date));
const distance=(task,date)=>{
  const d=dateOf(task);if(!d)return Number.POSITIVE_INFINITY;
  return Math.abs(Date.parse(`${d}T00:00:00Z`)-Date.parse(`${date}T00:00:00Z`));
};
const sortForDate=(date)=>[...tasks].sort((a,b)=>{
  const am=overlaps(a,date)?0:1,bm=overlaps(b,date)?0:1;if(am!==bm)return am-bm;
  const ad=dateOf(a),bd=dateOf(b);
  const af=ad>=date?0:ad?2:1,bf=bd>=date?0:bd?2:1;if(af!==bf)return af-bf;
  const dd=distance(a,date)-distance(b,date);if(dd)return dd;
  return b.id-a.id;
});
const label=task=>{
  const start=dateOf(task),end=endOf(task);
  const suffix=start?(end&&end!==start?`（${start}〜${end}）`:`（${start}）`):'（期限なし）';
  return `${task.title}${suffix}`;
};
function render(){
  const date=String(dueInput.value||'');
  const referenceDate=date||todayJst();
  const current=Number(select.value||initialSelected||0)||0;
  const showAll=Boolean(showAllInput.checked);
  const sorted=sortForDate(referenceDate);
  const overlapsForDate=date?sorted.filter(task=>overlaps(task,date)):[];
  const defaults=(overlapsForDate.length?overlapsForDate:sorted).slice(0,DEFAULT_VISIBLE_LIMIT);
  const defaultIds=new Set(defaults.map(task=>task.id));
  if(current)defaultIds.add(current);
  if(initialSelected)defaultIds.add(initialSelected);
  const visible=(showAll?sorted:sorted.filter(task=>defaultIds.has(task.id)));
  const fragment=document.createDocumentFragment();
  const none=document.createElement('option');none.value='0';none.textContent='タスクなし';fragment.appendChild(none);
  for(const task of visible){const option=document.createElement('option');option.value=String(task.id);option.textContent=label(task);if(task.id===current)option.selected=true;fragment.appendChild(option);}
  select.replaceChildren(fragment);
  if(current&&!visible.some(task=>task.id===current))select.value='0';
  const sameDay=overlapsForDate.length;
  const hidden=Math.max(0,tasks.length-visible.length);
  if(hint){
    if(date&&sameDay)hint.textContent=`期限日に重なる未完了タスク ${sameDay}件を優先表示中${sameDay>DEFAULT_VISIBLE_LIMIT?'（先頭12件）':''}${hidden?`。その他 ${hidden}件はチェックで表示できます。`:''}`;
    else if(date)hint.textContent=`期限日に重なるタスクがないため、近い未完了タスクを最大${DEFAULT_VISIBLE_LIMIT}件表示中${hidden?`。その他 ${hidden}件はチェックで表示できます。`:''}`;
    else hint.textContent=`未完了タスクを最大${DEFAULT_VISIBLE_LIMIT}件表示中。期限を指定すると、その日に重なるタスクを優先します${hidden?`。その他 ${hidden}件はチェックで表示できます。`:''}`;
  }
}
dueInput.addEventListener('change',render);
showAllInput.addEventListener('change',render);
select.addEventListener('change',render);
render();
})();
