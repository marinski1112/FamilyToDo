import { json, redirect, html } from './response';
import { makeContext, layout, liffLogin, liffEntryPage, authHealth, createFamily, joinFamily, today, tomorrow, calendar, messages, shopping, toggle, home, loginPage, createFamilyPage, apiMe, taskView, taskEdit, itemEdit, shoppingEdit, settings, settingsMembers, settingsNotifications, settingsContent, shoppingNew, messageNew, inviteCreate, invitePage, recurring, AuthRequired } from './app';
import { openSession, getSessionCookie } from './session';

const text = (r: Response) => r;
const esc = (v: unknown) => String(v ?? '').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('\"','&quot;').replaceAll("'",'&#39;');

const nowJst = () => new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Tokyo',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'}).format(new Date()).replace(' ',' ');

function asDateOffset(days:number){const d=new Date();d.setUTCDate(d.getUTCDate()+days);return new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Tokyo'}).format(d);}

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url=new URL(request.url);
    try{
      if(url.pathname==='/__cf/health') return json({ok:true,service:'familytodo-cloudflare',environment:env.ENVIRONMENT});
      if(url.pathname==='/__cf/secrets-health') {
        const names = ['APP_SECRET','LINE_ACCESS_TOKEN','LINE_CHANNEL_ID','LINE_CHANNEL_SECRET','LINE_LIFF_ID','NOTIFY_SECRET'] as const;
        const secrets = Object.fromEntries(names.map((name) => [name, { present: typeof env[name] === 'string' && env[name].length > 0, length: typeof env[name] === 'string' ? env[name].length : 0 }]));
        return json({ok:true,worker:env.ENVIRONMENT||'unknown',secrets});
      }
      if(url.pathname==='/__cf/db-health'){const r=await env.DB.prepare('SELECT 1 AS ok').all();return json({ok:true,database:'reachable',result:r.results});}
      if(url.pathname==='/__cf/db-schema-health') return dbSchemaHealth(env);
      if(url.pathname==='/__cf/db-runtime-health') return dbRuntimeHealth(env);
      if(url.pathname==='/__cf/auth-health'){const context=await makeContext(request,env);return authHealth(context);}
      if(url.pathname==='/liff'||url.pathname==='/liff/') {
        const liffContext=await makeContext(request,env);
        // LIFF起動時に既存のWorkerセッションが有効なら、再度IDトークン検証を要求しない。
        // LINE内ブラウザで他ページが正常表示できるのにトップだけ認証画面へ戻るケースを防ぐ。
        const liffNext=url.searchParams.get('next')||'/app/index.php';
        if(liffContext.member && /^\/(?!\/)/.test(liffNext)) return redirect(liffNext);
        return liffEntryPage(env,liffNext);
      }
      // 認証が必要なページは、例外ベースのリダイレクトに依存せず
      // ルーティング直下で未ログインを処理する。Cloudflare Runtimeでの
      // 例外化/Response処理の差異による1101を避けるため。
      if(url.pathname==='/app/recurring.php') {
        if(request.method==='POST') console.log(JSON.stringify({event:'recurring_route_post',path:url.pathname,method:request.method,content_type:request.headers.get('content-type')||'',accept:request.headers.get('accept')||'',ts:new Date().toISOString()}));
        const context=await makeContext(request,env);
        if(!context.member) return new Response(null,{status:302,headers:{Location:new URL('/login.php',request.url).toString()}});
        return recurring(request,context);
      }
      const context=await makeContext(request,env);
      if(url.pathname==='/app/api/liff_login.php'||url.pathname==='/app/api/liff_login') return liffLogin(request,context);
      if(url.pathname==='/api/family/create') return createFamily(request,context);
      if(url.pathname==='/api/family/join') return joinFamily(request,context);
      if(url.pathname==='/api/family/invite') return inviteCreate(request,context);
      if(url.pathname==='/api/me') return apiMe(context);
      if(url.pathname==='/api/toggle') return toggle(request,context);
      if(url.pathname==='/api/task') return taskApi(request,context);
      if(url.pathname==='/api/item') return itemApi(request,context);
      if(url.pathname==='/api/messages') return messages(request,context);
      if(url.pathname==='/api/shopping') return shopping(request,context);
      if(url.pathname==='/api/settings') return settings(request,context);
      if(url.pathname==='/login.php'||url.pathname==='/login'||url.pathname==='/login_error.php') return loginPage(env);
      if(url.pathname==='/app/api/liff_config_diagnose.php'||url.pathname==='/app/api/liff_config_diagnose') return liffConfigDiagnose(env);
      if(url.pathname==='/app/create.php'||url.pathname==='/app/create') return createFamilyPage(context);
      if(url.pathname==='/app/join.php'||url.pathname==='/app/join') return url.searchParams.get('token') ? invitePage(context,url.searchParams.get('token')||'') : createFamilyPage(context);
      if(url.pathname==='/family/create.php'||url.pathname==='/family/create') return createFamilyPage(context);
      if(url.pathname==='/family/join.php'||url.pathname==='/family/join') return invitePage(context,url.searchParams.get('token')||'');
      if(url.pathname==='/'||url.pathname==='/index.php'||url.pathname==='/app/index.php') return home(context);
      if(url.pathname==='/today.php') return today(request,context,url.searchParams.get('date')||asDateOffset(0));
      if(url.pathname==='/tomorrow.php') return tomorrow(request,context,url.searchParams.get('date')||asDateOffset(1));
      if(url.pathname==='/app/calendar.php') return calendar(request,context,url.searchParams.get('month')||asDateOffset(0).slice(0,7));
      if(url.pathname==='/app/messages.php') return messages(request,context);
      if(url.pathname==='/app/shopping.php') return shopping(request,context);
      if(url.pathname==='/app/settings.php') return settings(request,context);
      if(url.pathname==='/app/api/check.php'||url.pathname==='/app/api/check') return toggle(request,context);
      if(url.pathname==='/app/api/reorder.php'||url.pathname==='/app/api/reorder') return reorderApi(request,context);
      if(url.pathname==='/webhook'||url.pathname==='/app/api/webhook'||url.pathname==='/app/api/webhook.php') return webhook(request,env);
      if(url.pathname==='/logout.php'||url.pathname==='/logout') return logout(request,env);
      if(url.pathname==='/task/delete.php') return taskDelete(request,context);
      if(url.pathname==='/task/convert_occurrence.php') return convertOccurrence(request,context);
      if(url.pathname==='/app/message_new.php') return messageNew(context);
      if(url.pathname==='/app/shopping_new.php') return shoppingNew(context,url.searchParams.get('date')||'',Number(url.searchParams.get('task_id')||0));
      if(url.pathname==='/app/settings_content.php') return settingsContent(context);
      if(url.pathname==='/app/settings_members.php') return settingsMembers(request,context);
      if(url.pathname==='/app/settings_notifications.php') return settingsNotifications(request,context);
      if(url.pathname==='/app/settings_recurring.php') return recurring(request,context);
      if(url.pathname==='/app/logs.php') return logsPage(context);
      if(url.pathname==='/task/new.php') return taskNew(context,url.searchParams.get('date')||asDateOffset(0),url.searchParams.get('return')||'');
      if(url.pathname==='/task/view.php') return taskView(context,Number(url.searchParams.get('id')||0));
      if(url.pathname==='/task/edit.php') return taskEdit(request,context,Number(url.searchParams.get('id')||0));
      if(url.pathname==='/item/new.php') return itemNew(context,url.searchParams.get('date')||asDateOffset(0),Number(url.searchParams.get('task_id')||0));
      if(url.pathname==='/item/edit.php') return itemEdit(request,context,Number(url.searchParams.get('id')||0));
      if(url.pathname==='/app/shopping_edit.php') return shoppingEdit(request,context,Number(url.searchParams.get('id')||0));
      return env.ASSETS.fetch(request);
    }catch(e:any){
      if(e instanceof AuthRequired) return redirect('/login.php');
      const message=String(e?.message||e||'内部エラーです。');
      const requestId=crypto.randomUUID();
      console.error('[Family TODO LINE] request failure', { path:url.pathname, method:request.method, name:e?.name||'Error', message, requestId });
      if(/no such (table|column)|has no column named|no column named|UNIQUE constraint failed/i.test(message)) {
        return json({ok:false,error:'D1のデータベース構成または制約がWorkerの最新版と一致していません。/ __cf/db-schema-health と /__cf/db-runtime-health を確認してください。',code:'DB_SCHEMA_MIGRATION_REQUIRED',path:url.pathname,request_id:requestId},503);
      }
      return json({ok:false,error:'内部エラーです。',code:'INTERNAL_ERROR',path:url.pathname,request_id:requestId},500);
    }
  },
  async scheduled(controller: ScheduledController, env: Env, ctx: ExecutionContext){
    console.log(`[Family TODO LINE] scheduled ${controller.cron}; processing notifications`);
    ctx.waitUntil(processNotifications(env));
  }
} satisfies ExportedHandler<Env>;

async function dbSchemaHealth(env:Env):Promise<Response>{
  const required:Record<string,string[]>= {
    members:['id','family_id','active','notification_enabled','deleted_at'],
    tasks:['id','family_id','title','status','completion_mode','calendar_visible','calendar_color','task_kind','reminder_at'],
    task_assignees:['task_id','member_id'],
    task_completions:['task_id','member_id'],
    task_completion_history:['task_id','member_id','action','occurred_at'],
    items:['id','family_id','status','completion_mode'],
    item_assignees:['item_id','member_id'],
    item_completions:['item_id','member_id'],
    shopping_items:['id','family_id','status','task_id'],
    shopping_assignees:['shopping_item_id','member_id'],
    shopping_completions:['shopping_item_id','member_id'],
    recurrence_rules:['id','family_id','task_id','name','active','deleted_at'],
    recurrence_occurrences:['id','family_id','recurrence_rule_id'],
    recurrence_occurrence_completions:['occurrence_id','member_id'],
    notifications:['id','family_id','member_id','target_type','target_id','status','notify_at'],
    notification_settings:['family_id','member_id'],
    activity_logs:['family_id','member_id','action','occurred_at'],
    deleted_completion_history:['family_id','entity_type','entity_id','member_id','action','occurred_at','archived_at'],
  };
  const tables:any[]=[];
  let migrationRows:any[]=[];
  try { migrationRows=(await env.DB.prepare('SELECT id,name,applied_at FROM d1_migrations ORDER BY id').all()).results as any[]; } catch(e) { migrationRows=[]; }
  for(const [table,columns] of Object.entries(required)) {
    try {
      const info=(await env.DB.prepare(`PRAGMA table_info(${table})`).all()).results as any[];
      const have=new Set(info.map((r:any)=>String(r.name)));
      const missing=columns.filter(c=>!have.has(c));
      tables.push({table,exists:info.length>0,missing});
    } catch(e:any) { tables.push({table,exists:false,missing:columns,error:String(e?.message||e)}); }
  }
  const failed=tables.filter(x=>!x.exists||x.missing.length);
  return json({ok:failed.length===0,database:'reachable',schema_ok:failed.length===0,migrations:migrationRows,tables,failed_count:failed.length});
}

async function dbRuntimeHealth(env:Env):Promise<Response>{
  const checks:[string,string][]=[
    ['members','SELECT id,name,role,active,notification_enabled,deleted_at FROM members LIMIT 1'],
    ['tasks','SELECT id,family_id,title,status,completion_mode,start_at,end_at,location,all_day,calendar_visible,calendar_color,task_kind,sort_order,reminder_at FROM tasks LIMIT 1'],
    ['task_assignees','SELECT task_id,member_id FROM task_assignees LIMIT 1'],
    ['task_completions','SELECT task_id,member_id,completed_at FROM task_completions LIMIT 1'],
    ['task_completion_history','SELECT task_id,member_id,action,occurred_at FROM task_completion_history LIMIT 1'],
    ['items','SELECT id,family_id,name,status,completion_mode,due_at,task_id,group_key FROM items LIMIT 1'],
    ['item_assignees','SELECT item_id,member_id FROM item_assignees LIMIT 1'],
    ['item_completions','SELECT item_id,member_id,completed_at FROM item_completions LIMIT 1'],
    ['shopping_items','SELECT id,family_id,name,quantity,category,memo,due_date,status,created_by,created_at,updated_at,task_id,url FROM shopping_items LIMIT 1'],
    ['shopping_assignees','SELECT shopping_item_id,member_id FROM shopping_assignees LIMIT 1'],
    ['shopping_completions','SELECT shopping_item_id,member_id,completed_at FROM shopping_completions LIMIT 1'],
    ['notification_settings','SELECT family_id,member_id,enabled,before_day,morning,one_hour_before FROM notification_settings LIMIT 1'],
    ['notifications','SELECT id,family_id,member_id,type,target_type,target_id,notify_at,status,message FROM notifications LIMIT 1'],
    ['recurrence_rules','SELECT id,family_id,task_id,name,recurrence_type,interval_value,weekday,monthday,start_date,end_date,active,deleted_at,weekdays_json,monthdays_json,week_numbers_json FROM recurrence_rules LIMIT 1'],
    ['recurrence_occurrences','SELECT id,family_id,recurrence_rule_id,status,occurrence_date FROM recurrence_occurrences LIMIT 1'],
    ['recurrence_occurrence_completions','SELECT occurrence_id,member_id,completed_at FROM recurrence_occurrence_completions LIMIT 1'],
    ['activity_logs','SELECT family_id,member_id,action,target_type,target_id,occurred_at FROM activity_logs LIMIT 1'],
    ['deleted_completion_history','SELECT family_id,entity_type,entity_id,member_id,action,occurred_at,archived_at FROM deleted_completion_history LIMIT 1'],
  ];
  const results:any[]=[];
  for(const [name,sql] of checks){
    try { await env.DB.prepare(sql).first(); results.push({name,ok:true}); }
    catch(e:any){ results.push({name,ok:false,error:String(e?.message||e)}); }
  }
  const failed=results.filter(x=>!x.ok);
  return json({ok:failed.length===0,database:'reachable',checks:results,failed_count:failed.length});
}

async function liffConfigDiagnose(env:Env):Promise<Response>{
  const liffId=String(env.LINE_LIFF_ID||'');
  const channelId=String(env.LINE_CHANNEL_ID||'');
  let prefix='';
  let matches=false;
  if(liffId.includes('-')){ prefix=liffId.split('-',1)[0]; matches=Boolean(channelId)&&prefix===channelId; }
  return new Response([
    'LIFF configuration diagnostic',
    '=============================',
    `line_liff_id present: ${liffId?'YES':'NO'}`,
    `line_channel_id present: ${channelId?'YES':'NO'}`,
    prefix?`LIFF ID channel prefix: ${prefix}`:'LIFF ID channel prefix: (unavailable)',
    `Configured Channel ID: ${channelId||'(missing)'}`,
    `Channel ID matches LIFF prefix: ${prefix?(matches?'YES':'NO'):'N/A'}`,
    'Runtime: Cloudflare Workers',
  ].join('\n')+'\n',{headers:{'content-type':'text/plain; charset=utf-8'}});
}

async function reorderApi(request:Request,ctx:any):Promise<Response>{
  const m=ctx.member;if(!m)return json({ok:false,error:'ログインが必要です。'},401);if(request.method!=='POST')return json({ok:false,error:'POST only'},405);
  const b=await request.json().catch(()=>null) as Record<string,unknown>|null;if(!b)return json({ok:false,error:'JSONが不正です。'},400);
  if(String(b.csrf||'')!==String(ctx.session.csrfToken||''))return json({ok:false,error:'CSRF検証に失敗しました。'},403);
  const ids=[...new Set(Array.isArray(b.ids)?(b.ids as unknown[]).map(Number).filter(n=>Number.isInteger(n)&&n>0):[])];if(!ids.length)return json({ok:false,error:'順序がありません。'},400);
  if(ids.length>100)return json({ok:false,error:'一度に並べ替えできる件数を超えています。'},400);
  const placeholders=ids.map(()=>'?').join(',');
  const valid=await ctx.env.DB.prepare(`SELECT id FROM tasks WHERE family_id=? AND id IN (${placeholders})`).bind(m.family_id,...ids).all();
  if(valid.results.length!==ids.length)return json({ok:false,error:'家族外または削除済みのタスクが含まれています。'},400);
  const now=new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Tokyo',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'}).format(new Date());
  await ctx.env.DB.batch(ids.map((id:number,i:number)=>ctx.env.DB.prepare('UPDATE tasks SET sort_order=?,updated_at=? WHERE id=? AND family_id=?').bind(i*10,now,id,m.family_id)));
  return json({ok:true,ids});
}


function calendarVisibleFlag(b: Record<string, unknown>): number { return b.calendar_visible===false || String(b.calendar_visible)==='0' ? 0 : 1; }

async function taskNew(ctx: any,date:string,returnTo:string=''): Promise<Response>{
  if(!ctx.member)return redirect('/liff?next='+encodeURIComponent('/task/new.php?date='+date));
  const [members,categories]=await Promise.all([
    ctx.env.DB.prepare('SELECT id,name FROM members WHERE family_id=? AND active=1 ORDER BY id').bind(ctx.member.family_id).all(),
    ctx.env.DB.prepare("SELECT DISTINCT category FROM shopping_items WHERE family_id=? AND category IS NOT NULL AND category<>'' ORDER BY category").bind(ctx.member.family_id).all()
  ]);
  const body=`<div class="card form-card"><h1>📝 タスク追加</h1><form id="taskForm" autocomplete="off"><input type="hidden" name="csrf" value="${String(ctx.session.csrfToken||'')}"><label>タイトル</label><input name="title" required maxlength="255" autofocus><label>説明</label><textarea name="description" maxlength="5000"></textarea><label>日付</label><div class="date-option-row task-date-row"><div><span class="small">開始日</span><input id="taskDate" type="date" name="dateOnly" value="${date}"></div><div id="endDateWrap"><span class="small">終了日</span><input id="taskEndDate" type="date" name="endDateOnly" value="${date}"></div><label class="checkrow"><input id="noDate" type="checkbox" name="noDate"><span>期限なし（未整理）</span></label></div><label class="checkrow"><input id="allDay" type="checkbox" name="allDay" checked><span>終日</span></label><div id="dateTimes" class="task-time-fields" style="display:none"><div class="field-block"><label>開始時刻</label><input type="time" name="startTime"></div><div class="field-block"><label>終了時刻</label><input type="time" name="endTime"></div></div><label>場所</label><input name="location"><label>カレンダー表示</label><label class="checkrow"><input id="taskCalendarVisible" type="checkbox" name="calendar_visible" checked><span>カレンダーに表示する</span></label><div id="taskCalendarColorWrap"><label>カレンダー色</label><select name="calendar_color"><option value="#7c3aed">紫</option><option value="#2563eb">青</option><option value="#16a34a">緑</option><option value="#ea580c">橙</option><option value="#dc2626">赤</option><option value="#db2777">ピンク</option><option value="#0891b2">水色</option><option value="#64748b">灰</option></select></div><label>完了条件</label><select name="completion_mode"><option value="ANY">誰か1人で完了</option><option value="ALL">担当者全員が完了</option></select><label>担当者</label><div class="assignee-list">${members.results.map((m:any)=>`<label class="checkrow inline-check"><input type="checkbox" name="assignees" value="${m.id}"> ${String(m.name).replace(/[&<>\"]/g,'')}</label>`).join('')}</div><label>LINE通知日時（任意）</label><input type="datetime-local" name="reminderAt"><p class="small">指定すると担当者へタスク詳細をLINE通知します。通知設定はON/OFFのみです。</p><div class="sub-card"><button type="button" class="section-button" id="shoppingToggle">＋ このタスクに買い物を追加</button><div id="shoppingBox" style="display:none"><label>カテゴリー</label><select name="shopping_category"><option value="">カテゴリーなし</option>${categories.results.map((c:any)=>`<option value="${String(c.category).replace(/[&<>\"]/g,'')}">${String(c.category).replace(/[&<>\"]/g,'')}</option>`).join('')}<option value="__custom__">自由入力</option></select><input id="shoppingCustom" name="shopping_category_custom" placeholder="新しいカテゴリー" style="display:none"><div id="shoppingRows"><div class="product-row"><input name="shopping_name[]" placeholder="商品名"><input type="text" name="shopping_quantity[]" value="1" inputmode="numeric" placeholder="数量"><input type="url" name="shopping_url[]" placeholder="URL（任意）"></div></div><button type="button" class="btn gray small" id="addShoppingRow">＋ 商品を追加</button></div></div><div class="sub-card"><button type="button" class="section-button" id="itemsToggle">＋ このタスクに持ち物を追加</button><div id="itemsBox" style="display:none"><div id="itemRows"><div class="item-entry"><input name="item_name[]" placeholder="持ち物名"></div></div><button type="button" class="btn gray small" id="addItemRow">＋ 持ち物を追加</button></div></div><button>登録する</button></form></div><script>
const f=document.getElementById('taskForm'),all=document.getElementById('allDay'),times=document.getElementById('dateTimes'),dateInput=document.getElementById('taskDate'),endDateInput=document.getElementById('taskEndDate'),endDateWrap=document.getElementById('endDateWrap'),noDate=document.getElementById('noDate'),calendarVisible=document.getElementById('taskCalendarVisible'),calendarColorWrap=document.getElementById('taskCalendarColorWrap');const syncDate=()=>{dateInput.disabled=noDate.checked;endDateInput.disabled=noDate.checked;if(noDate.checked){dateInput.value='';endDateInput.value='';times.style.display='none';endDateWrap.style.display='none';all.checked=true;all.disabled=true;}else{dateInput.disabled=false;endDateInput.disabled=false;all.disabled=false;endDateWrap.style.display='block';if(!endDateInput.value)endDateInput.value=dateInput.value;times.style.display=all.checked?'none':'grid';}};const syncCalendar=()=>{if(calendarColorWrap)calendarColorWrap.style.display=calendarVisible.checked?'block':'none'};noDate.onchange=syncDate;dateInput.onchange=()=>{if(!endDateInput.value)endDateInput.value=dateInput.value};all.onchange=syncDate;calendarVisible.onchange=syncCalendar;syncDate();syncCalendar();
document.getElementById('shoppingToggle').onclick=()=>{const b=document.getElementById('shoppingBox');b.style.display=b.style.display==='none'?'block':'none'};document.querySelector('[name=shopping_category]').onchange=e=>document.getElementById('shoppingCustom').style.display=e.target.value==='__custom__'?'block':'none';document.getElementById('addShoppingRow').onclick=()=>{const d=document.createElement('div');d.className='product-row';d.innerHTML='<input name="shopping_name[]" placeholder="商品名"><input type="text" name="shopping_quantity[]" value="1" inputmode="numeric" placeholder="数量"><input type="url" name="shopping_url[]" placeholder="URL（任意）">';document.getElementById('shoppingRows').appendChild(d)};document.getElementById('itemsToggle').onclick=()=>{const b=document.getElementById('itemsBox');b.style.display=b.style.display==='none'?'block':'none'};document.getElementById('addItemRow').onclick=()=>{const d=document.createElement('div');d.className='item-entry';d.innerHTML='<input name="item_name[]" placeholder="持ち物名">';document.getElementById('itemRows').appendChild(d)};
f.onsubmit=async e=>{e.preventDefault();const b=Object.fromEntries(new FormData(f));b.assignees=[...f.querySelectorAll('[name=assignees]:checked')].map(x=>Number(x.value));b.completion_mode=f.completion_mode.value;b.calendar_color=f.calendar_color.value;b.allDay=all.checked;b.noDate=noDate.checked;b.endDateOnly=endDateInput.value;b.calendar_visible=f.calendar_visible.checked;b.shopping=[...f.querySelectorAll('[name="shopping_name[]"]')].map((x,i)=>({name:x.value.trim(),quantity:f.querySelectorAll('[name="shopping_quantity[]"]')[i].value.trim()||'1',url:f.querySelectorAll('[name="shopping_url[]"]')[i].value.trim()})).filter(x=>x.name);b.shopping_category=f.shopping_category.value;b.shopping_category_custom=f.shopping_category_custom.value;b.items=[...f.querySelectorAll('[name="item_name[]"]')].map(x=>x.value.trim()).filter(Boolean);const r=await fetch('/api/task',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(b)});const d=await r.json().catch(()=>null);if(d?.ok){const savedDate=String(b.dateOnly||'');if(${JSON.stringify(returnTo)}==='calendar'&&!b.noDate&&savedDate){location.href='/app/calendar.php?month='+encodeURIComponent(savedDate.slice(0,7))+'&date='+encodeURIComponent(savedDate);}else{location.href=b.noDate?'/today.php':'/today.php?date='+encodeURIComponent(savedDate);}}else alert(d?.error||'登録に失敗しました');};
</script>`;
  return new Response(layout('タスク追加',body,''),{headers:{'content-type':'text/html; charset=utf-8'}})
}
async function itemNew(ctx:any,date:string,selectedTaskId=0):Promise<Response>{
  if(!ctx.member)return redirect('/liff?next='+encodeURIComponent('/item/new.php?date='+date));
  const [members,tasks]=await Promise.all([
    ctx.env.DB.prepare('SELECT id,name FROM members WHERE family_id=? AND active=1 ORDER BY id').bind(ctx.member.family_id).all(),
    ctx.env.DB.prepare("SELECT id,title,start_at,due_at FROM tasks WHERE family_id=? AND status<>'completed' ORDER BY coalesce(start_at,due_at),id LIMIT 200").bind(ctx.member.family_id).all()
  ]);
  const body=`<div class="card form-card"><h1>🎒 持ち物追加</h1><form id="itemForm"><input type="hidden" name="csrf" value="${String(ctx.session.csrfToken||'')}"><label>持ち物名</label><input name="name" maxlength="255" required autofocus><label>関連タスク</label><select name="task_id"><option value="0">タスクなし</option>${tasks.results.map((t:any)=>`<option value="${t.id}" ${Number(t.id)===selectedTaskId?'selected':''}>${String(t.title).replace(/[&<>"]/g,'')}</option>`).join('')}</select><label>日付（タスクを指定しない場合）</label><input type="date" name="date" value="${date}"><label>メモ</label><textarea name="memo" maxlength="5000"></textarea><label>担当者</label><div class="assignee-list">${members.results.map((m:any)=>`<label class="checkrow inline-check"><input type="checkbox" name="assignees" value="${m.id}"> ${String(m.name).replace(/[&<>"]/g,'')}</label>`).join('')}</div><button>登録する</button></form></div><script>document.getElementById('itemForm').onsubmit=async e=>{e.preventDefault();const f=e.currentTarget;const b=Object.fromEntries(new FormData(f));b.assignees=[...f.querySelectorAll('[name=assignees]:checked')].map(x=>Number(x.value));b.task_id=Number(f.task_id.value||0);const r=await fetch('/api/item',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(b)});const d=await r.json();if(d.ok)location.href='/today.php?date='+encodeURIComponent(d.date||b.date);else alert(d.error||'登録に失敗しました');}</script>`;
  return new Response(layout('持ち物追加',body,''),{headers:{'content-type':'text/html; charset=utf-8'}})
}

async function taskApi(request:Request,ctx:any):Promise<Response>{
  const m=ctx.member;if(!m)return json({ok:false,error:'ログインが必要です。'},401);
  if(request.method==='DELETE'){
    const id=Number(new URL(request.url).searchParams.get('id')||0);
    const csrf=request.headers.get('x-csrf')||'';
    if(!id||csrf!==String(ctx.session.csrfToken||''))return json({ok:false,error:'削除情報が不正です。'},403);
    const task=await ctx.env.DB.prepare('SELECT created_by FROM tasks WHERE id=? AND family_id=?').bind(id,m.family_id).first();
    if(!task)return json({ok:false,error:'対象が見つかりません。'},404);
    const role=String(m.role||'').toUpperCase();
    if(!(role==='OWNER'||role==='ADMIN'||Number(task.created_by)===m.id))return json({ok:false,error:'権限がありません。'},403);
    const now=nowJst();
    const shops=await ctx.env.DB.prepare('SELECT id FROM shopping_items WHERE task_id=? AND family_id=?').bind(id,m.family_id).all();
    const items=await ctx.env.DB.prepare('SELECT id FROM items WHERE task_id=? AND family_id=?').bind(id,m.family_id).all();
    const rules=await ctx.env.DB.prepare('SELECT id FROM recurrence_rules WHERE task_id=? AND family_id=?').bind(id,m.family_id).all();
    const q:any[]=[
      ctx.env.DB.prepare("UPDATE notifications SET status='cancelled',updated_at=? WHERE target_type='task' AND target_id=? AND family_id=? AND status IN ('pending','retry')").bind(now,id,m.family_id),
    ];
    for(const r of rules.results){
      q.push(
        ctx.env.DB.prepare("INSERT INTO deleted_completion_history(family_id,entity_type,entity_id,member_id,action,occurred_at,source_type,source_id,archived_at) SELECT ?, 'recurrence_occurrence', c.occurrence_id, c.member_id, 'COMPLETED', c.completed_at, 'recurrence_occurrence', c.occurrence_id, ? FROM recurrence_occurrence_completions c JOIN recurrence_occurrences o ON o.id=c.occurrence_id AND o.family_id=? WHERE o.recurrence_rule_id=?").bind(m.family_id,now,m.family_id,Number(r.id)),
        ctx.env.DB.prepare('DELETE FROM recurrence_occurrence_completions WHERE occurrence_id IN (SELECT id FROM recurrence_occurrences WHERE recurrence_rule_id=? AND family_id=?)').bind(Number(r.id),m.family_id),
        ctx.env.DB.prepare('DELETE FROM recurrence_occurrences WHERE recurrence_rule_id=? AND family_id=?').bind(Number(r.id),m.family_id),
        ctx.env.DB.prepare('DELETE FROM recurrence_rules WHERE id=? AND family_id=?').bind(Number(r.id),m.family_id)
      );
    }
    for(const r of shops.results){
      const sid=Number(r.id);
      q.push(
        ctx.env.DB.prepare('DELETE FROM shopping_assignees WHERE shopping_item_id=?').bind(sid),
        ctx.env.DB.prepare("INSERT INTO deleted_completion_history(family_id,entity_type,entity_id,member_id,action,occurred_at,source_type,source_id,archived_at) SELECT ?, 'shopping', shopping_item_id, member_id, action, occurred_at, 'shopping_item', shopping_item_id, ? FROM shopping_completion_history WHERE shopping_item_id=?").bind(m.family_id,now,sid),
        ctx.env.DB.prepare('DELETE FROM shopping_completion_history WHERE shopping_item_id=?').bind(sid),
        ctx.env.DB.prepare('DELETE FROM shopping_items WHERE id=? AND family_id=?').bind(sid,m.family_id)
      );
    }
    for(const r of items.results){
      const iid=Number(r.id);
      q.push(
        ctx.env.DB.prepare('DELETE FROM item_assignees WHERE item_id=?').bind(iid),
        ctx.env.DB.prepare("INSERT INTO deleted_completion_history(family_id,entity_type,entity_id,member_id,action,occurred_at,source_type,source_id,archived_at) SELECT ?, 'item', item_id, member_id, action, occurred_at, 'item', item_id, ? FROM item_completion_history WHERE item_id=?").bind(m.family_id,now,iid),
        ctx.env.DB.prepare('DELETE FROM item_completion_history WHERE item_id=?').bind(iid),
        ctx.env.DB.prepare("INSERT INTO deleted_completion_history(family_id,entity_type,entity_id,member_id,action,occurred_at,source_type,source_id,archived_at) SELECT ?, 'item', item_id, member_id, action, completed_at, 'item_legacy_completion', item_id, ? FROM item_completions WHERE item_id=?").bind(m.family_id,now,iid),
        ctx.env.DB.prepare('DELETE FROM item_completions WHERE item_id=?').bind(iid),
        ctx.env.DB.prepare('DELETE FROM items WHERE id=? AND family_id=?').bind(iid,m.family_id)
      );
    }
    q.push(
      ctx.env.DB.prepare('DELETE FROM task_assignees WHERE task_id=?').bind(id),
      ctx.env.DB.prepare("INSERT INTO deleted_completion_history(family_id,entity_type,entity_id,member_id,action,occurred_at,source_type,source_id,archived_at) SELECT ?, 'task', task_id, member_id, action, occurred_at, 'task', task_id, ? FROM task_completion_history WHERE task_id=?").bind(m.family_id,now,id),
      ctx.env.DB.prepare('DELETE FROM task_completion_history WHERE task_id=?').bind(id),
      ctx.env.DB.prepare("INSERT INTO deleted_completion_history(family_id,entity_type,entity_id,member_id,action,occurred_at,source_type,source_id,archived_at) SELECT ?, 'task', task_id, member_id, action, completed_at, 'task_legacy_completion', task_id, ? FROM task_completions WHERE task_id=?").bind(m.family_id,now,id),
      ctx.env.DB.prepare('DELETE FROM task_completions WHERE task_id=?').bind(id),
      ctx.env.DB.prepare('DELETE FROM tasks WHERE id=? AND family_id=?').bind(id,m.family_id)
    );
    await ctx.env.DB.batch(q);
    return json({ok:true});
  }
  if(request.method!=='POST') return json({ok:false,error:'POST only'},405);
  const b=await (async()=>{const v=await request.json().catch(()=>null);return v&&typeof v==='object'?v as Record<string,unknown>:null})();
  if(!b) return json({ok:false,error:'JSONが不正です。'},400);
  if(String(b.csrf||'')!==String(ctx.session.csrfToken||'')) return json({ok:false,error:'CSRF検証に失敗しました。'},403);
  const title=String(b.title??'').trim();const date=String(b.dateOnly??'').trim();const noDate=Boolean(b.noDate)||date==='';
  if(!title)return json({ok:false,error:'タイトルを入力してください。'},400);
  if(!noDate&&!/^\d{4}-\d{2}-\d{2}$/.test(date))return json({ok:false,error:'日付が不正です。'},400);
  const allDay=Boolean(b.allDay); const endDate=String(b.endDateOnly??date).trim(); if(!noDate&&!/^\d{4}-\d{2}-\d{2}$/.test(endDate))return json({ok:false,error:'終了日が不正です。'},400); if(!noDate&&endDate<date)return json({ok:false,error:'終了日は開始日以降にしてください。'},400); const st=String(b.startTime??'').trim();const et=String(b.endTime??'').trim();
  const normalizeDateTime=(v:string,baseDate:string)=>{if(!v)return null; if(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(v))return v.replace('T',' ')+':00'; if(/^\d{2}:\d{2}$/.test(v))return `${baseDate} ${v}:00`; return null;};
  const start=noDate?null:(allDay?`${date} 00:00:00`:normalizeDateTime(st,date));const end=noDate?null:(allDay?(endDate!==date?`${endDate} 23:59:59`:null):normalizeDateTime(et,endDate||date));
  if(!noDate&&!allDay&&!start)return json({ok:false,error:'開始日時を指定してください。'},400);
  if(st&&!start)return json({ok:false,error:'開始日時が不正です。'},400); if(et&&!end)return json({ok:false,error:'終了日時が不正です。'},400);
  if(start&&end&&end<start)return json({ok:false,error:'終了日時は開始日時以降にしてください。'},400);
  const reminderRaw=String(b.reminderAt??'').trim();
  const reminderAt=reminderRaw && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(reminderRaw)?reminderRaw.replace('T',' ')+':00':null;
  if(reminderRaw && !reminderAt)return json({ok:false,error:'LINE通知日時が不正です。'},400);
  const shoppingPre=Array.isArray(b.shopping)?(b.shopping as any[]).slice(0,50):[];
  for(const v of shoppingPre){const u=String(v?.url||'').trim();if(u){try{const parsed=new URL(u);if(!['http:','https:'].includes(parsed.protocol))throw new Error();}catch{return json({ok:false,error:'買い物URLが不正です。'},400);}}}
  const now=nowJst();const completionMode=String(b.completion_mode||'ANY').toUpperCase()==='ALL'?'ALL':'ANY';
  const allowedColors=['#7c3aed','#2563eb','#16a34a','#ea580c','#dc2626','#db2777','#0891b2','#64748b'];
  const calendarColor=allowedColors.includes(String(b.calendar_color||''))?String(b.calendar_color):'#7c3aed';
  const dueValue=noDate?null:(end||start||`${date} 00:00:00`);
  const ids=[...new Set((Array.isArray(b.assignees)?(b.assignees as unknown[]).map(Number):[]).filter(n=>Number.isInteger(n)&&n>0))];
  if(ids.length){
    const valid=await ctx.env.DB.prepare(`SELECT id FROM members WHERE family_id=? AND active=1 AND id IN (${ids.map(()=>'?').join(',')})`).bind(m.family_id,...ids).all();
    const validIds=new Set(valid.results.map((x:any)=>Number(x.id)));
    if(ids.some(id=>!validIds.has(id))) return json({ok:false,error:'担当者に無効なメンバーが含まれています。'},400);
  }
  let id=0;
  try {
    const r=await ctx.env.DB.prepare('INSERT INTO tasks(family_id,title,description,due_at,status,completion_mode,created_by,created_at,updated_at,start_at,end_at,location,all_day,calendar_visible,calendar_color,task_kind,sort_order,reminder_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)').bind(m.family_id,title,String(b.description??'')||null,dueValue,'pending',completionMode,m.id,now,now,start,end,String(b.location??'')||null,allDay?1:0,calendarVisibleFlag(b),calendarColor,'TASK',0,reminderAt).run();
    id=Number(r.meta.last_row_id);
    if(ids.length) await ctx.env.DB.batch(ids.map((mid:number)=>ctx.env.DB.prepare('INSERT OR IGNORE INTO task_assignees(task_id,member_id) SELECT ?,id FROM members WHERE id=? AND family_id=? AND active=1').bind(id,mid,m.family_id)));
    const now2=nowJst();
    const shopping=shoppingPre;
    if(shopping.length){
      const category=String(b.shopping_category==='__custom__'?b.shopping_category_custom:b.shopping_category||'').trim()||null;
      if(category && b.shopping_category==='__custom__') await ctx.env.DB.prepare('INSERT OR IGNORE INTO shopping_categories(family_id,name,created_at) VALUES(?,?,?)').bind(m.family_id,category,now2).run().catch(()=>{});
      const dueDate=noDate?null:date; const group=crypto.randomUUID().replaceAll('-','').slice(0,16);
      for(const v of shopping.slice(0,50)){const name=String(v?.name||'').trim();if(!name)continue;const qty=String(v?.quantity||'1').trim()||'1';const url=String(v?.url||'').trim();const sr=await ctx.env.DB.prepare("INSERT INTO shopping_items(family_id,name,quantity,category,memo,due_date,status,created_by,created_at,updated_at,task_id,url) VALUES(?,?,?,?,?,?,'pending',?,?,?,?,?)").bind(m.family_id,name,qty,category,null,dueDate,m.id,now2,now2,id,url||null).run(); const sid=Number(sr.meta.last_row_id); if(ids.length) await ctx.env.DB.batch(ids.map((mid:number)=>ctx.env.DB.prepare('INSERT OR IGNORE INTO shopping_assignees(shopping_item_id,member_id) SELECT ?,id FROM members WHERE id=? AND family_id=? AND active=1').bind(sid,mid,m.family_id)));}
    }
    const itemNames=Array.isArray(b.items)?(b.items as unknown[]).map(String).map(x=>x.trim()).filter(Boolean).slice(0,50):[];
    if(itemNames.length){const group=crypto.randomUUID().replaceAll('-','').slice(0,16);for(const name of itemNames){const ir=await ctx.env.DB.prepare("INSERT INTO items(family_id,name,memo,due_at,status,completion_mode,created_by,created_at,updated_at,task_id,group_key) VALUES(?,?,?,?,'pending','ANY',?,?,?,?,?)").bind(m.family_id,name,null,date?`${date} 00:00:00`:null,m.id,now2,now2,id,group).run();const iid=Number(ir.meta.last_row_id);if(ids.length)await ctx.env.DB.batch(ids.map((mid:number)=>ctx.env.DB.prepare('INSERT OR IGNORE INTO item_assignees(item_id,member_id) SELECT ?,id FROM members WHERE id=? AND family_id=? AND active=1').bind(iid,mid,m.family_id)));}}
    if(reminderAt && ids.length){
      const recipients=await ctx.env.DB.prepare(`SELECT id,name FROM members WHERE family_id=? AND active=1 AND id IN (${ids.map(()=>'?').join(',')})`).bind(m.family_id,...ids).all();
      if(recipients.results.length) await ctx.env.DB.batch(recipients.results.map((r:any)=>ctx.env.DB.prepare('INSERT INTO notifications(family_id,member_id,type,target_type,target_id,notify_at,status,message,created_at) VALUES(?,?,?,?,?,?,?,?,?)').bind(m.family_id,Number(r.id),'task_reminder','task',id,reminderAt,'pending',`【タスク】${title}\n${String(b.description??'').trim()||'詳細なし'}${start?'\n予定: '+start.slice(0,16):''}${end?' ～ '+end.slice(11,16):''}${String(b.location??'').trim()?'\n場所: '+String(b.location).trim():''}`,now)));
    }
  } catch(e){
    if(id){
      try { await ctx.env.DB.batch([
        ctx.env.DB.prepare("DELETE FROM notifications WHERE family_id=? AND target_type='task' AND target_id=?").bind(m.family_id,id),
        ctx.env.DB.prepare('DELETE FROM shopping_assignees WHERE shopping_item_id IN (SELECT id FROM shopping_items WHERE task_id=? AND family_id=?)').bind(id,m.family_id),
        ctx.env.DB.prepare('DELETE FROM shopping_items WHERE task_id=? AND family_id=?').bind(id,m.family_id),
        ctx.env.DB.prepare('DELETE FROM item_assignees WHERE item_id IN (SELECT id FROM items WHERE task_id=? AND family_id=?)').bind(id,m.family_id),
        ctx.env.DB.prepare('DELETE FROM items WHERE task_id=? AND family_id=?').bind(id,m.family_id),
        ctx.env.DB.prepare('DELETE FROM task_assignees WHERE task_id=?').bind(id),
        ctx.env.DB.prepare('DELETE FROM tasks WHERE id=? AND family_id=?').bind(id,m.family_id),
      ]); } catch(cleanup){ console.error('[Family TODO LINE] task creation cleanup failed',{taskId:id,error:String((cleanup as any)?.message||cleanup)}); }
    }
    throw e;
  }

  await ctx.env.DB.prepare('INSERT INTO activity_logs(family_id,member_id,action,target_type,target_id,metadata,occurred_at) VALUES(?,?,?,?,?,?,?)').bind(m.family_id,m.id,'CREATED','task',id,JSON.stringify({title}),nowJst()).run().catch(()=>{});return json({ok:true,id},201);
}

async function itemApi(request:Request,ctx:any):Promise<Response>{
  if(request.method!=='POST') return json({ok:false,error:'POST only'},405);
  const m=ctx.member;if(!m)return json({ok:false,error:'ログインが必要です。'},401);
  const b=await request.json().catch(()=>null) as Record<string,unknown>|null;
  if(!b)return json({ok:false,error:'JSONが不正です。'},400);
  if(String(b.csrf||'')!==String(ctx.session.csrfToken||'')) return json({ok:false,error:'CSRF検証に失敗しました。'},403);
  const name=String(b.name??'').trim(); const date=String(b.date??'').trim();
  if(!name)return json({ok:false,error:'持ち物名を入力してください。'},400);
  const taskId=Number(b.task_id??0)||null; let dueDate=/^\d{4}-\d{2}-\d{2}$/.test(date)?date:null;
  if(taskId){const t=await ctx.env.DB.prepare('SELECT id,start_at,end_at,due_at FROM tasks WHERE id=? AND family_id=?').bind(taskId,m.family_id).first();if(!t)return json({ok:false,error:'関連タスクが見つかりません。'},400);dueDate=String(t.start_at||t.due_at||'').slice(0,10)||dueDate;}
  const now=nowJst();const r=await ctx.env.DB.prepare(`INSERT INTO items(family_id,name,memo,due_at,status,completion_mode,created_by,created_at,updated_at,task_id) VALUES(?,?,?,?,'pending','ANY',?,?,?,?)`).bind(m.family_id,name,String(b.memo??'').trim()||null,dueDate?`${dueDate} 00:00:00`:null,m.id,now,now,taskId).run();
  const id=Number(r.meta.last_row_id); const ids=Array.isArray(b.assignees)?(b.assignees as unknown[]).map(Number).filter(n=>n>0):[];
  if(ids.length) await ctx.env.DB.batch(ids.map(mid=>ctx.env.DB.prepare('INSERT OR IGNORE INTO item_assignees(item_id,member_id) SELECT ?,id FROM members WHERE id=? AND family_id=? AND active=1').bind(id,mid,m.family_id)));
  await ctx.env.DB.prepare('INSERT INTO activity_logs(family_id,member_id,action,target_type,target_id,metadata,occurred_at) VALUES(?,?,?,?,?,?,?)').bind(m.family_id,m.id,'CREATED','item',id,JSON.stringify({name}),nowJst()).run().catch(()=>{});return json({ok:true,id,date:dueDate},201);
}



async function verifyLineWebhook(body: string, signature: string, secret: string): Promise<boolean> {
  if (!body || !signature || !secret) return false;
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), {name:'HMAC',hash:'SHA-256'}, false, ['sign']);
  const digest = new Uint8Array(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(body)));
  let binary=''; for(const b of digest) binary += String.fromCharCode(b);
  const expected = btoa(binary);
  return expected === signature;
}

async function webhook(request: Request, env: Env): Promise<Response> {
  if(request.method !== 'POST') return new Response('OK',{status:200});
  const body = await request.text();
  const sig = request.headers.get('x-line-signature') || '';
  if(!(await verifyLineWebhook(body,sig,env.LINE_CHANNEL_SECRET))) return new Response('OK',{status:200});
  try {
    const data = JSON.parse(body) as {events?:Array<any>};
    for(const event of data.events||[]) {
      const userId = String(event?.source?.userId||'');
      const now = nowJst();
      const member = userId ? await env.DB.prepare('SELECT id,family_id,name FROM members WHERE line_user_id=? AND active=1 LIMIT 1').bind(userId).first() : null;
      if(member) {
        await env.DB.prepare('INSERT INTO activity_logs(family_id,member_id,action,target_type,target_id,metadata,occurred_at) VALUES(?,?,?,?,?,?,?)').bind(member.family_id,member.id,`LINE_${String(event.type||'UNKNOWN').toUpperCase()}`,event.message?.type||event.postback?.data||null,null,JSON.stringify({event_type:event.type,message_type:event.message?.type||null}),now).run();
      }
      if(event.type==='message' && event.message?.type==='text' && event.replyToken && env.LINE_ACCESS_TOKEN) {
        const text=String(event.message.text||'').trim();
        let reply='Family TODO LINEを受信しました。';
        if(text==='今日') reply='今日の予定はFamily TODO LINEの「今日」から確認できます。';
        else if(text==='明日') reply='明日の予定はFamily TODO LINEの「明日の準備」から確認できます。';
        else if(text==='買い物') reply='買い物リストはFamily TODO LINEの「買い物」から確認できます。';
        const { replyLineMessage } = await import('./line');
        try { await replyLineMessage(env.LINE_ACCESS_TOKEN,event.replyToken,reply); } catch(e) { console.error(e); }
      }
    }
  } catch(e) { console.error('[Family TODO LINE] webhook',e); }
  return new Response('OK',{status:200});
}

async function cleanupNotificationLifecycle(env: Env): Promise<void> {
  const now=nowJst();
  // Disable pending work for members who opted out or were deactivated.
  await env.DB.prepare("UPDATE notifications SET status='cancelled',updated_at=? WHERE status IN ('pending','retry') AND member_id IN (SELECT id FROM members WHERE active=0 OR notification_enabled=0)").bind(now).run();
  // Remove the operational tail of notifications whose target was completed or deleted.
  await env.DB.prepare("UPDATE notifications SET status='cancelled',updated_at=? WHERE status IN ('pending','retry') AND target_type='task' AND (target_id IS NULL OR NOT EXISTS (SELECT 1 FROM tasks t WHERE t.id=notifications.target_id AND t.family_id=notifications.family_id) OR EXISTS (SELECT 1 FROM tasks t WHERE t.id=notifications.target_id AND t.family_id=notifications.family_id AND t.status='completed'))").bind(now).run();
  await env.DB.prepare("UPDATE notifications SET status='cancelled',updated_at=? WHERE status IN ('pending','retry') AND target_type='message' AND (target_id IS NULL OR NOT EXISTS (SELECT 1 FROM messages x WHERE x.id=notifications.target_id AND x.family_id=notifications.family_id))").bind(now).run();
}

async function processNotifications(env: Env): Promise<void> {
  await cleanupNotificationLifecycle(env);
  const due = await env.DB.prepare(`SELECT n.id,n.member_id,n.type,n.target_type,n.target_id,n.message,m.line_user_id FROM notifications n JOIN members m ON m.id=n.member_id WHERE n.status IN ('pending','retry') AND n.sent_at IS NULL AND n.notify_at<=? AND m.active=1 AND m.notification_enabled=1 AND m.line_user_id IS NOT NULL ORDER BY n.notify_at,n.id LIMIT 50`).bind(nowJst()).all();
  for(const n of due.results) {
    try {
      const { pushLineMessage } = await import('./line');
      await pushLineMessage(env.LINE_ACCESS_TOKEN,String(n.line_user_id),String(n.message||'Family TODO LINEからのお知らせです。'));
      await env.DB.prepare('UPDATE notifications SET status=?,sent_at=? WHERE id=?').bind('sent',nowJst(),n.id).run();
    } catch(e) {
      // 送信失敗は即座に捨てず、次回Cronで再試行する。一定回数を超えたものだけerrorへ移行。
      const current=await env.DB.prepare('SELECT COALESCE(attempt_count,0) attempt_count FROM notifications WHERE id=?').bind(n.id).first();
      const attempts=Number(current?.attempt_count||0)+1;
      const status=attempts>=5?'error':'retry';
      await env.DB.prepare('UPDATE notifications SET status=?,attempt_count=?,last_error=?,updated_at=? WHERE id=?').bind(status,attempts,String(e instanceof Error?e.message:e).slice(0,1000),nowJst(),n.id).run().catch(()=>{});
      console.error('[Family TODO LINE] notification',e);
    }
  }
}



async function logout(request:Request,env:Env):Promise<Response>{
  const headers=new Headers({'Location':'/login.php','Set-Cookie':'family_line_cf=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0'});
  return new Response(null,{status:302,headers});
}

async function taskDelete(request:Request,ctx:any):Promise<Response>{
  if(request.method!=='POST'&&request.method!=='DELETE') return json({ok:false,error:'POST/DELETE only'},405);
  const m=ctx.member;if(!m)return redirect('/login.php');
  const id=Number(new URL(request.url).searchParams.get('id')||0) || Number((await request.clone().json().catch(()=>({}))).id||0);
  if(!id)return json({ok:false,error:'idが不正です。'},400);
  const body=request.method==='POST'?await request.clone().json().catch(()=>({})):{};
  const csrf=request.headers.get('x-csrf')||String(body.csrf||'');
  if(csrf!==String(ctx.session.csrfToken||''))return json({ok:false,error:'CSRF検証に失敗しました。'},403);
  const task=await ctx.env.DB.prepare('SELECT created_by FROM tasks WHERE id=? AND family_id=? LIMIT 1').bind(id,m.family_id).first();
  if(!task)return json({ok:false,error:'対象が見つかりません。'},404);
  const role=String(m.role||'').toUpperCase();if(!(role==='OWNER'||role==='ADMIN'||Number(task.created_by)===m.id))return json({ok:false,error:'権限がありません。'},403);
  const childShopping=await ctx.env.DB.prepare('SELECT id FROM shopping_items WHERE task_id=? AND family_id=?').bind(id,m.family_id).all();
  const childItems=await ctx.env.DB.prepare('SELECT id FROM items WHERE task_id=? AND family_id=?').bind(id,m.family_id).all();
  const recurrenceRules=await ctx.env.DB.prepare('SELECT id FROM recurrence_rules WHERE task_id=? AND family_id=?').bind(id,m.family_id).all();
  const statements:any[]=[];
  statements.push(ctx.env.DB.prepare("UPDATE notifications SET status='cancelled',updated_at=? WHERE target_type='task' AND target_id=? AND family_id=? AND status IN ('pending','retry')").bind(nowJst(),id,m.family_id));
  for(const r of recurrenceRules.results){
    statements.push(
      ctx.env.DB.prepare("INSERT INTO deleted_completion_history(family_id,entity_type,entity_id,member_id,action,occurred_at,source_type,source_id,archived_at) SELECT ?, 'recurrence_occurrence', c.occurrence_id, c.member_id, 'COMPLETED', c.completed_at, 'recurrence_occurrence', c.occurrence_id, ? FROM recurrence_occurrence_completions c JOIN recurrence_occurrences o ON o.id=c.occurrence_id AND o.family_id=? WHERE o.recurrence_rule_id=?").bind(m.family_id,nowJst(),m.family_id,Number(r.id)),
      ctx.env.DB.prepare('DELETE FROM recurrence_occurrence_completions WHERE occurrence_id IN (SELECT id FROM recurrence_occurrences WHERE recurrence_rule_id=? AND family_id=?)').bind(Number(r.id),m.family_id)
    );
    statements.push(ctx.env.DB.prepare('DELETE FROM recurrence_occurrences WHERE recurrence_rule_id=? AND family_id=?').bind(Number(r.id),m.family_id));
    statements.push(ctx.env.DB.prepare('DELETE FROM recurrence_rules WHERE id=? AND family_id=?').bind(Number(r.id),m.family_id));
  }
  for(const r of childShopping.results){statements.push(ctx.env.DB.prepare('DELETE FROM shopping_assignees WHERE shopping_item_id=?').bind(Number(r.id)),ctx.env.DB.prepare('DELETE FROM shopping_completion_history WHERE shopping_item_id=?').bind(Number(r.id)),ctx.env.DB.prepare('DELETE FROM shopping_items WHERE id=? AND family_id=?').bind(Number(r.id),m.family_id));}
  for(const r of childItems.results){statements.push(ctx.env.DB.prepare('DELETE FROM item_assignees WHERE item_id=?').bind(Number(r.id)),ctx.env.DB.prepare('DELETE FROM item_completion_history WHERE item_id=?').bind(Number(r.id)),ctx.env.DB.prepare('DELETE FROM item_completions WHERE item_id=?').bind(Number(r.id)),ctx.env.DB.prepare('DELETE FROM items WHERE id=? AND family_id=?').bind(Number(r.id),m.family_id));}
  statements.push(ctx.env.DB.prepare('DELETE FROM task_assignees WHERE task_id=?').bind(id),ctx.env.DB.prepare('DELETE FROM task_completion_history WHERE task_id=?').bind(id),ctx.env.DB.prepare('DELETE FROM task_completions WHERE task_id=?').bind(id),ctx.env.DB.prepare('DELETE FROM tasks WHERE id=? AND family_id=?').bind(id,m.family_id));
  await ctx.env.DB.batch(statements);
  return json({ok:true,redirect:'/today.php'});
}

async function convertOccurrence(request:Request,ctx:any):Promise<Response>{
  if(request.method!=='POST')return json({ok:false,error:'POST only'},405);
  const m=ctx.member;if(!m)return json({ok:false,error:'ログインが必要です。'},401);
  const ct=request.headers.get('content-type')||'';
  let b:any={};
  if(ct.includes('application/json')) b=await request.json().catch(()=>({}));
  else {const fd=await request.formData().catch(()=>new FormData());const obj:any={};fd.forEach((v,k)=>{obj[k]=v});b=obj;}
  if(String(b.csrf||'')!==String(ctx.session.csrfToken||''))return json({ok:false,error:'CSRF検証に失敗しました。'},403);
  const occId=Number(b.occurrence_id||0);if(!occId)return json({ok:false,error:'発生日が不正です。'},400);
  const occ=await ctx.env.DB.prepare('SELECT o.*,r.task_id,r.name,r.recurrence_type,t.title,t.description,t.start_at,t.end_at,t.location,t.all_day,t.calendar_visible,t.calendar_color,t.completion_mode FROM recurrence_occurrences o JOIN recurrence_rules r ON r.id=o.recurrence_rule_id JOIN tasks t ON t.id=r.task_id WHERE o.id=? AND o.family_id=? LIMIT 1').bind(occId,m.family_id).first();
  if(!occ)return json({ok:false,error:'発生日が見つかりません。'},404);
  if(occ.exception_task_id){const taskId=Number(occ.exception_task_id);return ct.includes('application/json')?json({ok:true,task_id:taskId,redirect:`/task/view.php?id=${taskId}`}):redirect(`/task/view.php?id=${taskId}`);}
  const date=String(occ.occurrence_date);const base=String(occ.start_at||'');const st=base.slice(11,19);const et=String(occ.end_at||'').slice(11,19);const now=nowJst();
  const completeRows=await ctx.env.DB.prepare('SELECT member_id,completed_at FROM recurrence_occurrence_completions WHERE occurrence_id=? ORDER BY completed_at').bind(occId).all();
  const status=completeRows.results.length&&String(occ.status||'').toLowerCase()==='completed'?'completed':'pending';
  const r=await ctx.env.DB.prepare('INSERT INTO tasks(family_id,title,description,due_at,status,completion_mode,created_by,created_at,updated_at,start_at,end_at,location,all_day,calendar_visible,calendar_color,task_kind,recurrence_rule,sort_order) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,0)').bind(m.family_id,occ.title,occ.description||null,`${date} ${st||'00:00:00'}`,status,occ.completion_mode||'ANY',m.id,now,now,st?`${date} ${st}`:null,et?`${date} ${et}`:null,occ.location||null,Number(occ.all_day??1),Number(occ.calendar_visible??1),String(occ.calendar_color||'#7c3aed'),'OCCURRENCE',null).run();
  const taskId=Number(r.meta.last_row_id);

  // Preserve the series assignees and any already-recorded completion state.
  await ctx.env.DB.prepare('INSERT OR IGNORE INTO task_assignees(task_id,member_id) SELECT ?,ta.member_id FROM task_assignees ta JOIN members am ON am.id=ta.member_id AND am.active=1 WHERE ta.task_id=?').bind(taskId,Number(occ.task_id)).run();
  if(completeRows.results.length){
    await ctx.env.DB.batch(completeRows.results.flatMap((c:any)=>[
      ctx.env.DB.prepare("INSERT OR IGNORE INTO task_completions(task_id,member_id,action,completed_at) VALUES(?,?,'completed',?)").bind(taskId,Number(c.member_id),String(c.completed_at)),
      ctx.env.DB.prepare("INSERT INTO task_completion_history(task_id,member_id,action,occurred_at) VALUES(?,?,'COMPLETED',?)").bind(taskId,Number(c.member_id),String(c.completed_at))
    ]));
    if(status==='completed'){
      const last=completeRows.results[completeRows.results.length-1] as any;
      await ctx.env.DB.prepare('UPDATE tasks SET completed_by=?,completed_at=?,updated_at=? WHERE id=? AND family_id=?').bind(Number(last.member_id),String(last.completed_at),now,taskId,m.family_id).run();
    }
  }

  // A recurring template's linked shopping/items are shared by the series. Clone them
  // for the exception task so changing this one date does not detach the series template.
  const [shops,items]=await Promise.all([
    ctx.env.DB.prepare('SELECT * FROM shopping_items WHERE task_id=? AND family_id=? ORDER BY id').bind(Number(occ.task_id),m.family_id).all(),
    ctx.env.DB.prepare('SELECT * FROM items WHERE task_id=? AND family_id=? ORDER BY id').bind(Number(occ.task_id),m.family_id).all()
  ]);
  for(const sh of shops.results as any[]){
    const sr=await ctx.env.DB.prepare("INSERT INTO shopping_items(family_id,name,quantity,category,memo,due_date,status,created_by,created_at,updated_at,task_id,url) VALUES(?,?,?,?,?,?,'pending',?,?,?,?,?)")
      .bind(m.family_id,String(sh.name||''),String(sh.quantity||'1'),sh.category||null,sh.memo||null,date,m.id,now,now,taskId,sh.url||null).run();
    const sid=Number(sr.meta.last_row_id);
    await ctx.env.DB.prepare('INSERT OR IGNORE INTO shopping_assignees(shopping_item_id,member_id) SELECT ?,sa.member_id FROM shopping_assignees sa JOIN members am ON am.id=sa.member_id AND am.active=1 WHERE sa.shopping_item_id=?').bind(sid,Number(sh.id)).run();
  }
  for(const it of items.results as any[]){
    const time=String(it.due_at||'').slice(11,19);const dueAt=`${date} ${time||'00:00:00'}`;
    const ir=await ctx.env.DB.prepare("INSERT INTO items(family_id,name,memo,due_at,status,completion_mode,created_by,created_at,updated_at,task_id,group_key) VALUES(?,?,?,?,'pending',?,?,?,?,?,?)")
      .bind(m.family_id,String(it.name||''),it.memo||null,dueAt,String(it.completion_mode||'ANY'),m.id,now,now,taskId,crypto.randomUUID().replaceAll('-','').slice(0,16)).run();
    const iid=Number(ir.meta.last_row_id);
    await ctx.env.DB.prepare('INSERT OR IGNORE INTO item_assignees(item_id,member_id) SELECT ?,ia.member_id FROM item_assignees ia JOIN members am ON am.id=ia.member_id AND am.active=1 WHERE ia.item_id=?').bind(iid,Number(it.id)).run();
  }

  await ctx.env.DB.prepare('UPDATE recurrence_occurrences SET exception_task_id=?,updated_at=? WHERE id=? AND family_id=?').bind(taskId,now,occId,m.family_id).run();
  const redirectTo=`/task/view.php?id=${taskId}`;
  return ct.includes('application/json')?json({ok:true,task_id:taskId,redirect:redirectTo}):redirect(redirectTo);
}

async function logsPage(ctx:any):Promise<Response>{
  const m=ctx.member;if(!m)return redirect('/login.php');
  const role=String(m.role||'').toUpperCase();
  if(role!=='OWNER'&&role!=='ADMIN') return html(layout('活動ログ','<div class="card"><h1>📊 家族の活動ログ</h1><p>活動ログを見るには管理者権限が必要です。</p><a class="btn" href="/app/settings.php">管理へ戻る</a></div>','/app/settings.php'));
  const rows=await ctx.env.DB.prepare('SELECT a.*,m.name member_name FROM activity_logs a LEFT JOIN members m ON m.id=a.member_id WHERE a.family_id=? ORDER BY a.occurred_at DESC,a.id DESC LIMIT 200').bind(m.family_id).all();
  const label=(action:string)=>({COMPLETED:'完了',UNCOMPLETED:'未完了に戻す',CREATED:'作成',UPDATED:'更新',DELETED:'削除',LINE_MESSAGE:'LINEメッセージ',LINE_POSTBACK:'LINE操作'} as Record<string,string>)[action]||action;
  const body=`<div class="page-head"><div><div class="eyebrow">管理</div><h1>📊 家族の活動ログ</h1></div><a class="btn gray" href="/app/settings.php">戻る</a></div><div class="card history-card"><p class="small">最新200件を表示しています。</p>${rows.results.map((r:any)=>`<div class="row"><strong>${esc(label(String(r.action||'')))}</strong><div class="meta">${esc(r.member_name||'不明')} ・ ${esc(r.occurred_at||'')}</div><div class="meta">${esc(r.target_type||'')}${r.target_id?` #${esc(r.target_id)}`:''}</div></div>`).join('')||'<p class="empty">ログはありません。</p>'}</div>`;
  return html(layout('活動ログ',body,'/app/settings.php'));
}
