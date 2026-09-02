import type { AppContext } from './app-context';
import { layout } from './app-shell';
import { DEFAULT_CALENDAR_COLOR, isAllowedCalendarColor } from './calendar-colors';
import { jpHolidayName, recurringForRange } from './recurrence-projection';
import { html, redirect } from './response';
import { safeCalendarDateRange } from './task-range-safety';
import { taskVisibilitySql } from './task-visibility';
import { APP_VERSION } from './version';

type Row=Record<string,unknown>;

const esc=(v:unknown)=>String(v??'')
  .replaceAll('&','&amp;')
  .replaceAll('<','&lt;')
  .replaceAll('>','&gt;')
  .replaceAll('"','&quot;')
  .replaceAll("'",'&#39;');
const dateOnly=(d=new Date())=>new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Tokyo',year:'numeric',month:'2-digit',day:'2-digit'}).format(d);

export async function calendar(request:Request,ctx:AppContext,month:string):Promise<Response>{
  const member=ctx.member;
  if(!member){const url=new URL(request.url);return redirect(`/login.php?next=${encodeURIComponent(url.pathname+url.search)}`);}
  const url=new URL(request.url);
  const requestedView=String(url.searchParams.get('view')||'all');
  const view=['all','family','assigned','private'].includes(requestedView)?requestedView:'all';
  const openRaw=String(url.searchParams.get('open')||'');
  const openCandidate=new Date(`${openRaw}T12:00:00Z`);
  const openDate=/^(?:20\d{2}|2100)-(?:0[1-9]|1[0-2])-(?:0[1-9]|[12]\d|3[01])$/.test(openRaw)&&!Number.isNaN(openCandidate.getTime())&&openCandidate.toISOString().slice(0,10)===openRaw?openRaw:'';
  const requestedMonth=openDate?openDate.slice(0,7):month;
  const m=/^(?:20\d{2}|2100)-(?:0[1-9]|1[0-2])$/.test(requestedMonth)?requestedMonth:dateOnly().slice(0,7);
  const [y,mo]=m.split('-').map(Number);
  const first=new Date(Date.UTC(y,mo-1,1));
  const start=new Date(first);start.setUTCDate(1-first.getUTCDay());
  const end=new Date(Date.UTC(y,mo,0));end.setUTCDate(end.getUTCDate()+(6-end.getUTCDay()));
  const from=start.toISOString().slice(0,10),to=end.toISOString().slice(0,10),fid=member.family_id;

  const viewSql=view==='family'?" AND t.visibility_scope='FAMILY'":view==='assigned'?" AND t.visibility_scope='FAMILY' AND EXISTS (SELECT 1 FROM task_assignees viewer_ta WHERE viewer_ta.task_id=t.id AND viewer_ta.member_id=?)":view==='private'?" AND t.visibility_scope='PRIVATE' AND t.private_owner_id=?":'';
  const viewBinds=(view==='assigned'||view==='private')?[member.id]:[];
  const tasks=await ctx.env.DB.prepare(`
    SELECT t.*,GROUP_CONCAT(m.name,'、') assignees
    FROM tasks t
    LEFT JOIN task_assignees ta ON ta.task_id=t.id
    LEFT JOIN members m ON m.id=ta.member_id AND m.active=1
    WHERE t.family_id=? AND ${taskVisibilitySql('t')} ${viewSql} AND t.calendar_visible=1
      AND (t.task_kind IS NULL OR lower(t.task_kind) NOT IN ('recurring','recurrence_template'))
      AND (
        (t.start_at IS NOT NULL AND date(t.start_at)<=date(?) AND (t.end_at IS NULL OR date(t.end_at)>=date(?)))
        OR
        (t.start_at IS NULL AND t.due_at IS NOT NULL AND date(t.due_at) BETWEEN date(?) AND date(?))
      )
    GROUP BY t.id
    ORDER BY coalesce(t.start_at,t.due_at),t.sort_order,t.id
  `).bind(fid,member.id,...viewBinds,to,from,from,to).all<Row>();

  const recurRows=await recurringForRange(ctx,from,to);
  const visibleRecur=recurRows.filter(t=>{
    if(Number(t.calendar_visible??1)!==1)return false;
    const scope=String(t.visibility_scope||'FAMILY').toUpperCase();
    if(view==='family')return scope==='FAMILY';
    if(view==='assigned')return scope==='FAMILY'&&String(t.assignee_ids||'').split(',').map(Number).includes(member.id);
    if(view==='private')return scope==='PRIVATE'&&Number(t.private_owner_id)===member.id;
    return scope==='FAMILY'||(scope==='PRIVATE'&&Number(t.private_owner_id)===member.id);
  });
  const [shopping,items]=await Promise.all([
    ctx.env.DB.prepare(`SELECT s.*,t.title task_title,(SELECT GROUP_CONCAT(m.name,'、') FROM shopping_assignees sa JOIN members m ON m.id=sa.member_id AND m.active=1 WHERE sa.shopping_item_id=s.id) assignees FROM shopping_items s LEFT JOIN tasks t ON t.id=s.task_id AND t.family_id=s.family_id WHERE s.family_id=? AND (s.task_id IS NULL OR ${taskVisibilitySql('t')}) AND s.due_date BETWEEN ? AND ? ORDER BY s.due_date,s.category,s.name,s.id`).bind(fid,member.id,from,to).all<Row>(),
    ctx.env.DB.prepare(`SELECT i.*,(SELECT GROUP_CONCAT(m.name,'、') FROM item_assignees ia JOIN members m ON m.id=ia.member_id AND m.active=1 WHERE ia.item_id=i.id) assignees FROM items i LEFT JOIN tasks pt ON pt.id=i.task_id AND pt.family_id=i.family_id WHERE i.family_id=? AND (i.task_id IS NULL OR ${taskVisibilitySql('pt')}) AND i.due_at IS NOT NULL AND date(i.due_at) BETWEEN date(?) AND date(?) ORDER BY i.due_at,i.id`).bind(fid,member.id,from,to).all<Row>()
  ]);
  return html(renderCalendarPage(ctx,m,start,end,[...tasks.results,...visibleRecur],shopping.results,items.results,[...tasks.results,...visibleRecur],openDate,view));
}

export function calendarDisplayLabel(task:Row,options:{includeTime?:boolean}={}){
  const title=String(task.title||''),time=Number(task.all_day??0)!==1&&task.start_at?String(task.start_at).slice(11,16):'';
  if(options.includeTime===false||!/^\d{2}:\d{2}$/.test(time))return {time:'',title,label:title};
  const normalized=title.normalize('NFKC'),same=normalized.match(/^\s*(\d{1,2}):(\d{2})(?:\s*[-~～〜–—])?\s*/);
  const displayTitle=same&&`${same[1].padStart(2,'0')}:${same[2]}`===time?normalized.slice(same[0].length):title;
  return {time,title:displayTitle||title,label:`${time} ${displayTitle||title}`};
}

function calendarLabelHtml(task:Row,includeTime=true){const display=calendarDisplayLabel(task,{includeTime}),icon=String(task.task_kind||'').toLowerCase()==='event'?'📌 ':'';return {accessible:`${display.time?display.time+' ':''}${icon}${display.title}`,html:`${display.time?`<span class="calendar-item-time">${display.time}</span> `:''}${icon}${esc(display.title)}`};}

function renderCalendarPage(ctx:AppContext,month:string,start:Date,end:Date,tasks:Row[],shopping:Row[],items:Row[]=[],detailTasks:Row[]=tasks,openDate='',view='all'):string{
  const map:Record<string,Row[]>=Object.create(null);
  const detailMap:Record<string,Row[]>=Object.create(null);
  const shoppingMap:Record<string,Row[]>=Object.create(null);
  const itemMap:Record<string,Row[]>=Object.create(null);
  const addToMap=(target:Record<string,Row[]>,t:Row)=>{
    const range=safeCalendarDateRange(t.start_at||t.due_at,t.end_at||t.start_at||t.due_at);
    if(!range)return;
    for(let cursorMs=range.startMs;cursorMs<=range.endMs;cursorMs+=86400000){
      const k=new Date(cursorMs).toISOString().slice(0,10);
      (target[k]??=[]).push({...t,_segment:cursorMs===range.startMs?'start':cursorMs===range.endMs?'end':'mid',_spanDays:range.spanDays});
    }
  };
  tasks.forEach(t=>addToMap(map,t));
  detailTasks.forEach(t=>addToMap(detailMap,t));
  for(const item of shopping){const d=String(item.due_date||'').slice(0,10);if(d)(shoppingMap[d]??=[]).push(item);}
  for(const item of items){const d=String(item.due_at||'').slice(0,10);if(d)(itemMap[d]??=[]).push(item);}

  const rangeByKey=new Map<string,{start:string;end:string;task:Row}>();
  for(const t of tasks){
    const rs=String(t.start_at||t.due_at||'').slice(0,10);if(!rs)continue;
    let re=String(t.end_at||rs).slice(0,10);if(re<rs)re=rs;
    const key=String(t.id);rangeByKey.set(key,{start:rs,end:re,task:t});
  }
  const laneByKey=new Map<string,number>(),laneEnd:string[]=[];
  [...rangeByKey.entries()].filter(([,r])=>r.start!==r.end).sort((a,b)=>a[1].start.localeCompare(b[1].start)||a[1].end.localeCompare(b[1].end)||a[0].localeCompare(b[0])).forEach(([key,r])=>{
    let lane=0;while(laneEnd[lane]&&laneEnd[lane]>=r.start)lane++;laneByKey.set(key,lane);laneEnd[lane]=r.end;
  });
  const laneCap=4;
  const singleTaskCap=4;
  let cells='';
  for(let weekStart=new Date(start);weekStart<=end;weekStart.setUTCDate(weekStart.getUTCDate()+7)){
    const weekEnd=new Date(weekStart);weekEnd.setUTCDate(weekEnd.getUTCDate()+6);
    let dayCells='',bars='',more='';const overflow:Record<string,number>=Object.create(null),dayBandRows:Record<string,number>=Object.create(null);
    const weekDays:Array<{d:string;inMonth:boolean;dayItems:Row[];holiday:string|null;wd:number;num:string;accessoryRows:number}>=[];
    let maxSingleRows=0,maxAccessoryRows=0,maxBandLane=-1;
    for(let i=0;i<7;i++){
      const cursor=new Date(weekStart);cursor.setUTCDate(cursor.getUTCDate()+i);
      const d=cursor.toISOString().slice(0,10),inMonth=d.startsWith(month),dayItems=(map[d]||[]).filter(t=>Number(t._spanDays||1)<=1).sort((a,b)=>(Number(a.sort_order||0)-Number(b.sort_order||0))||(Number(a.id)-Number(b.id))),holiday=jpHolidayName(d),wd=cursor.getUTCDay();
      const num=d===dateOnly()?`<span class="today-num">${Number(d.slice(8))}</span>`:String(Number(d.slice(8)));
      const accessoryRows=(itemMap[d]?.length?1:0)+(shoppingMap[d]?.length?1:0);
      maxSingleRows=Math.max(maxSingleRows,Math.min(singleTaskCap,dayItems.length)+(dayItems.length>singleTaskCap?1:0));
      maxAccessoryRows=Math.max(maxAccessoryRows,accessoryRows);
      weekDays.push({d,inMonth,dayItems,holiday,wd,num,accessoryRows});
    }
    for(const [key,r] of rangeByKey){
      if(r.start===r.end)continue;
      const ws=weekStart.toISOString().slice(0,10),we=weekEnd.toISOString().slice(0,10),a=r.start>ws?r.start:ws,b=r.end<we?r.end:we;if(a>b)continue;
      const lane=laneByKey.get(key)??0;
      if(lane>=laneCap){for(let d=new Date(`${a}T12:00:00Z`);d<=new Date(`${b}T12:00:00Z`);d.setUTCDate(d.getUTCDate()+1)){const k=d.toISOString().slice(0,10);overflow[k]=(overflow[k]||0)+1;}continue;}
      maxBandLane=Math.max(maxBandLane,lane);
      const startCol=new Date(`${a}T12:00:00Z`).getUTCDay()+1,endCol=new Date(`${b}T12:00:00Z`).getUTCDay()+2,cc=String(r.task.calendar_color||'').trim(),color=isAllowedCalendarColor(cc)?cc:DEFAULT_CALENDAR_COLOR;
      const segClass=(a===r.start?'seg-start ':'')+(b===r.end?'seg-end':'seg-mid');
      const display=calendarLabelHtml(r.task,a===r.start);
      bars+=`<a class="calendar-band ${segClass.trim()}" style="grid-column:${startCol}/${endCol};grid-row:${lane+1};background:${color}" href="/task/view.php?id=${encodeURIComponent(String(r.task.id))}" data-task-id="${esc(r.task.id)}" title="${esc(display.accessible)}" aria-label="${esc(display.accessible)}">${display.html}</a>`;
      for(let dd=new Date(`${a}T12:00:00Z`),lastDd=new Date(`${b}T12:00:00Z`);dd<=lastDd;dd.setUTCDate(dd.getUTCDate()+1)){
        const dk=dd.toISOString().slice(0,10);dayBandRows[dk]=Math.max(dayBandRows[dk]||0,lane+1);
      }
    }
    const bandRows=maxBandLane+1;
    for(const info of weekDays){
      const cls=['calendar-cell',info.inMonth?'':'other',info.wd===0?'sun':'',info.wd===6?'sat':'',info.holiday?'holiday':''].filter(Boolean).join(' ');
      const shown=info.dayItems.slice(0,singleTaskCap);
      dayCells+=`<button type="button" class="${cls}" data-date="${info.d}" data-band-rows="${dayBandRows[info.d]||0}" style="--calendar-day-band-rows:${dayBandRows[info.d]||0};--calendar-day-content-top:calc(var(--calendar-date-zone) + ${dayBandRows[info.d]||0} * var(--calendar-band-step))" aria-label="${esc(info.d+(info.holiday?' '+info.holiday:''))}"><div class="num">${info.num}</div><div class="calendar-items">${shown.map(t=>{const cc=String(t.calendar_color||'').trim(),style=isAllowedCalendarColor(cc)?` style="background:${cc}"`:'',display=calendarLabelHtml(t);return `<div class="calendar-item seg-single ${Number(t.id)<0?'recurring-single':''} ${String(t.task_kind||'').toLowerCase()==='event'?'event-single':''}" title="${esc(display.accessible)}" aria-label="${esc(display.accessible)}"${style}>${display.html}</div>`}).join('')}${info.dayItems.length>singleTaskCap?`<div class="calendar-task-overflow">+${info.dayItems.length-singleTaskCap}件</div>`:''}${itemMap[info.d]?.slice(0,1).map(i=>`<div class="calendar-item item">🎒 ${esc(i.name)}</div>`).join('')||''}${shoppingMap[info.d]?.length?`<div class="calendar-shopping">🛒 ${shoppingMap[info.d].length}件</div>`:''}</div></button>`;
    }
    for(let i=0;i<7;i++){const d=new Date(weekStart);d.setUTCDate(d.getUTCDate()+i);const k=d.toISOString().slice(0,10);more+=`<span>${overflow[k]?`+${overflow[k]}件`:''}</span>`;}
    const weekStyle=`--calendar-band-rows:${bandRows};--calendar-single-rows:${Math.max(1,maxSingleRows)};--calendar-accessory-rows:${maxAccessoryRows}`;
    cells+=`<div class="calendar-week" style="${weekStyle}"><div class="calendar-week-days">${dayCells}</div><div class="calendar-week-bands">${bars}</div><div class="calendar-week-more">${more}</div></div>`;
  }

  const shoppingDetail=Object.fromEntries(Object.entries(shoppingMap).map(([k,v])=>[k,v.map(t=>({id:t.id,name:t.name,quantity:t.quantity,category:t.category,status:t.status,due_date:t.due_date,task_title:t.task_title,assignees:t.assignees}))]));
  const itemDetail=Object.fromEntries(Object.entries(itemMap).map(([k,v])=>[k,v.map(t=>({id:t.id,name:t.name,status:t.status,due_at:t.due_at,assignees:t.assignees}))]));
  const detail=Object.fromEntries(Object.entries(detailMap).map(([k,v])=>[k,v.sort((a,b)=>(Number(a.sort_order||0)-Number(b.sort_order||0))||(Number(a.id)-Number(b.id))).map(t=>({
    id:t.id,title:t.title,start_at:t.start_at,end_at:t.end_at,due_at:t.due_at,
    location:t.location,description:t.description??t.memo??'',
    recurring:Number(t.id)<0,family_log_template_id:Number(t.family_log_template_id||0),recurrence_rule_id:t.recurrence_rule_id??0,recurrence_occurrence_id:t.recurrence_occurrence_id??0,occurrence_date:t.occurrence_date??'',status:t.status??'pending',assignees:t.assignees??'',segment:t._segment??'single',spanDays:Number(t._spanDays||1),calendar_color:t.calendar_color??'',calendar_visible:Number(t.calendar_visible??1),task_kind:String(t.task_kind||''),sort_order:Number(t.sort_order||0)
  }))]));
  const holidays=Object.fromEntries(
    Array.from({length:Math.round((end.getTime()-start.getTime())/86400000)+1},(_,i)=>{
      const d=new Date(start);d.setUTCDate(d.getUTCDate()+i);
      const k=d.toISOString().slice(0,10);return [k,jpHolidayName(k)];
    }).filter(([,v])=>v)
  );
  const prev=new Date(Date.UTC(Number(month.slice(0,4)),Number(month.slice(5))-2,1)).toISOString().slice(0,7);
  const next=new Date(Date.UTC(Number(month.slice(0,4)),Number(month.slice(5)),1)).toISOString().slice(0,7);
  const calendarPayload=JSON.stringify({detail,shoppingDetail,itemDetail,holidays,month,prev,next,view,openDate,from:start.toISOString().slice(0,10),to:end.toISOString().slice(0,10),today:dateOnly(),csrf:ctx.session.csrfToken??''}).replaceAll('<','\\u003c').replaceAll('>','\\u003e').replaceAll('&','\\u0026');
  const script=`<script src="/assets/calendar.js?v=${APP_VERSION}"></script><script src="/assets/occurrence-family-log.js?v=${APP_VERSION}"></script>`;
  const body='<div class="page-head calendar-page-head"><div><h1>📅 カレンダー</h1><button type="button" class="calendar-month-label" id="monthLabel" aria-expanded="false" aria-controls="calendarJumpPanel">'+month.slice(0,4)+'年'+Number(month.slice(5))+'月 ▼</button><div class="calendar-jump-panel" id="calendarJumpPanel" hidden><form id="calendarMonthJump" class="calendar-jump-row calendar-month-jump"><select aria-label="年" name="year">'+Array.from({length:101},(_,i)=>2000+i).map(y=>`<option value="${y}" ${y===Number(month.slice(0,4))?'selected':''}>${y}</option>`).join('')+'</select><select aria-label="月" name="month">'+Array.from({length:12},(_,i)=>i+1).map(n=>`<option value="${n}" ${n===Number(month.slice(5))?'selected':''}>${n}</option>`).join('')+'</select><button type="submit" class="calendar-jump-go">移動</button></form><form id="calendarDateJump" class="calendar-jump-row calendar-date-jump"><input aria-label="日付指定" name="date" type="date" min="2000-01-01" max="2100-12-31" value="${openDate||dateOnly()}"><button type="submit" class="calendar-jump-go">移動</button></form><div class="calendar-jump-shortcuts"><a class="btn gray small" href="/app/calendar.php?month=${dateOnly().slice(0,7)}">今月</a><a class="btn gray small" href="/app/calendar.php?month=${dateOnly().slice(0,7)}&open=${dateOnly()}">今日</a></div></div></div><div class="calendar-month-actions"><a id="prevMonth" data-month="'+prev+'" class="btn gray" href="/app/calendar.php?view='+view+'&month='+prev+'" aria-label="前の月">‹</a> <a id="nextMonth" data-month="'+next+'" class="btn gray" href="/app/calendar.php?view='+view+'&month='+next+'" aria-label="次の月">›</a></div></div>'+
    '<nav class="calendar-view-filter" aria-label="表示範囲">'+[['all','すべて'],['family','共通'],['assigned','自分担当'],['private','自分専用']].map(([key,label])=>`<a class="${view===key?'active':''}" href="/app/calendar.php?view=${key}&month=${month}${openDate?'&open='+openDate:''}">${label}</a>`).join('')+'</nav>'+'<div class="card calendar-card"><div class="calendar-grid"><div class="weekday"><span>日</span><span>月</span><span>火</span><span>水</span><span>木</span><span>金</span><span>土</span></div>'+cells+'</div></div>'+
    '<a class="fab calendar-fab" id="calendarFab" href="/task/new.php?date='+dateOnly()+'&return=calendar" aria-label="タスクを追加">＋</a><div class="modal-backdrop" id="dayModal"><div class="day-modal"><div class="modal-top"><button id="modalPrev" class="modal-day-nav" type="button" aria-label="前の日">‹</button><h2 id="modalTitle"></h2><button id="modalNext" class="modal-day-nav" type="button" aria-label="次の日">›</button><button id="modalReorder" class="btn gray small modal-reorder" type="button">並べ替え</button><button id="modalClose" class="btn gray modal-close" type="button" aria-label="閉じる">×</button></div><div class="modal-swipe-hint">左右にスワイプして日付移動</div><div class="modal-scroll"><div id="modalBody" class="modal-body"></div></div><a id="modalAdd" class="modal-add-fab" href="#" aria-label="この日にタスクを追加">＋</a></div></div><script type="application/json" id="calendarPayload">'+calendarPayload+'</script>'+script;
  return layout('カレンダー',body,'/app/calendar.php');
}
