(()=>{
  'use strict';
  const KEY='family-log-one-shot-v1',scope=String(document.currentScript?.dataset.family||'');
  const STAGES=new Set(['DIAGNOSTIC_READY','LOADER_START','PHOTO_LOAD_START','PHOTO_LOADED','PHOTO_LOAD_FAILED','CORE_LOAD_START','CORE_SCRIPT_START','PAYLOAD_MISSING','PAYLOAD_PARSE_FAILED','CORE_READY','CORE_LOADED','CORE_LOAD_FAILED','TAP','GENERIC_QUICK_TAP','HANDLER_START','BUTTON_DISABLED','HANDLER_NOT_OBSERVED','REQUEST_START','RESPONSE_RECEIVED','PARSE_OK','PARSE_FAILED','NETWORK_ERROR','NETWORK_ABORT','REQUEST_SETTLED','UI_UPDATE_START','UI_UPDATE_DONE','EDITOR_READY','MODAL_NOT_OPEN','MODAL_OPEN','MODAL_SHEET_MISSING','MODAL_SHEET_ZERO_RECT','MODAL_SHEET_OUTSIDE_VIEWPORT','MODAL_HITTEST_BLOCKED','MODAL_READY','BUTTON_ENABLED','RELOAD_REQUESTED','PAGEHIDE','RELOAD_BOOTSTRAP_START','RELOAD_BOOTSTRAP_READY','JS_ERROR','UNHANDLED_REJECTION','PENDING_15S']);
  const ERROR_NAMES=new Set(['TypeError','ReferenceError','SyntaxError','RangeError','SecurityError','AbortError']);
  const GENERIC_QUICK_SELECTOR='.family-log-quick[data-log-type]:not(.family-log-quick-action):not(.family-log-form-action)';
  const MODAL_FAILURE_STAGES=['MODAL_NOT_OPEN','MODAL_SHEET_MISSING','MODAL_SHEET_ZERO_RECT','MODAL_SHEET_OUTSIDE_VIEWPORT','MODAL_HITTEST_BLOCKED'];
  let record=null,requestActive=false;
  const safeEvents=events=>Array.isArray(events)?events.slice(0,64).flatMap(e=>e&&STAGES.has(e.stage)&&Number.isInteger(e.ms)&&e.ms>=0&&e.ms<=600000?[{stage:e.stage,ms:e.ms,...(Number.isInteger(e.status)&&e.status>=100&&e.status<=599?{status:e.status}:{}),...(ERROR_NAMES.has(e.reason)?{reason:e.reason}:{})}]:[]):[];
  const getStorage=name=>{try{return window[name]||null;}catch{return null;}};
  const normalizeRecord=v=>{
    if(!v||v.scope!==scope||!Number.isFinite(v.expires)||v.expires<=Date.now())return null;
    const started=Number(v.started)||Date.now();
    return {scope,expires:v.expires,armed:v.armed===true,tapped:v.tapped===true,reload:v.reload===true,started,updated:Number(v.updated)||started,id:/^[0-9a-f-]{36}$/.test(v.id)?v.id:null,events:safeEvents(v.events)};
  };
  const readStorage=storage=>{
    if(!storage)return null;
    try{
      const raw=storage.getItem(KEY);
      if(!raw)return null;
      const normalized=normalizeRecord(JSON.parse(raw));
      if(!normalized)storage.removeItem(KEY);
      return normalized;
    }catch{return null;}
  };
  const read=()=>{
    const session=readStorage(getStorage('sessionStorage')),persistent=readStorage(getStorage('localStorage'));
    if(!session)return persistent;
    if(!persistent)return session;
    if(persistent.updated!==session.updated)return persistent.updated>session.updated?persistent:session;
    return persistent.events.length>session.events.length?persistent:session;
  };
  const writeStorage=(storage,text)=>{if(!storage)return false;try{storage.setItem(KEY,text);return true;}catch{return false;}};
  const save=()=>{
    try{
      if(!record)return false;
      record.updated=Date.now();
      const text=JSON.stringify({...record,events:safeEvents(record.events)});
      const sessionSaved=writeStorage(getStorage('sessionStorage'),text),persistentSaved=writeStorage(getStorage('localStorage'),text);
      return sessionSaved||persistentSaved;
    }catch{return false;}
  };
  const mark=(stage,status,reason)=>{
    try{
      if(!record||record.expires<=Date.now()||!STAGES.has(stage)||record.events.length>=64)return;
      record.events.push(...safeEvents([{stage,ms:Math.min(600000,Math.max(0,Date.now()-record.started)),status,reason}]));save();
    }catch{/* Observation must never interrupt UI recovery. */}
  };
  const admin=document.getElementById('familyLogDiagnosticAdmin');
  if(admin){
    const status=document.getElementById('familyLogDiagnosticStatus'),out=document.getElementById('familyLogDiagnosticResult');
    document.getElementById('familyLogDiagnosticArm')?.addEventListener('click',()=>{
      record={scope,expires:Date.now()+600000,armed:true,tapped:false,reload:false,started:Date.now(),updated:Date.now(),id:null,events:[]};
      if(!save()){status.textContent='端末の診断保存を利用できません。このブラウザでは採取できません。';return;}
      location.assign('/app/family_log.php');
    });
    const append=(parent,tag,text)=>{const el=document.createElement(tag);el.textContent=text;parent.append(el);return el;};
    const render=(local,server)=>{
      out.replaceChildren();
      const ids=[...new Set([local?.id,...server.map(x=>x.id)].filter(Boolean))];
      if(!ids.length){append(out,'p','診断記録はありません。診断開始後、子供クイックを1回押してください。');return;}
      for(const id of ids.slice(0,20)){
        const s=server.find(x=>x.id===id),events=local?.id===id?local.events:[],se=Array.isArray(s?.events)?s.events:[];
        const has=stage=>events.some(x=>x.stage===stage),saved=se.some(x=>x.stage==='DB_OK');
        const last=se.at(-1),failure=se.find(x=>x.stage==='SERVER_ERROR');
        const failureStage=failure?se[se.indexOf(failure)-1]?.stage:null;
        const result=has('MODAL_HITTEST_BLOCKED')?'入力画面の上を別レイヤーが遮っています':has('MODAL_SHEET_OUTSIDE_VIEWPORT')?'入力画面が画面外にあります':has('MODAL_SHEET_ZERO_RECT')?'入力画面の大きさが0です':has('MODAL_SHEET_MISSING')?'入力画面本体が見つかりません':has('MODAL_NOT_OPEN')?'子供クイック後に入力画面が開いていません':has('EDITOR_READY')?'入力画面を表示（保存前）':has('RELOAD_BOOTSTRAP_READY')?'再読込・初期化完了':has('BUTTON_ENABLED')?'エラー後ボタン復帰':has('PENDING_15S')?'15秒時点で操作未完了':failure?'サーバー処理失敗':'診断途中／証拠を確認';
        const box=append(out,'details','');box.open=id===local?.id;
        append(box,'summary',`FAMILY_LOG_QUICK：${result}`);
        append(box,'p',`DB保存：${saved?'成功を確認':'未確認（未保存とは断定しません）'} ／ サーバー最終段階：${failureStage||last?.stage||'証拠なし'}${failure?.reason?' ／ '+failure.reason:''}`);
        const http=[...events].reverse().find(x=>x.status)?.status||last?.status;
        append(box,'p',`HTTP：${http||'未確認'} ／ client復帰：${has('RELOAD_BOOTSTRAP_READY')||has('BUTTON_ENABLED')||has('EDITOR_READY')?'確認':'未確認'}`);
        const operation=has('GENERIC_QUICK_TAP')&&!has('REQUEST_START')?'保存前の入力画面経路（POSTなし）':'POST /api/family-log';
        append(box,'p',`${operation} ／ 端末最終段階：${events.at(-1)?.stage||'証拠なし'} ／ 経過：${events.at(-1)?.ms??'—'}ms`);
        append(box,'p',`Correlation ID：${id}`).style.overflowWrap='anywhere';
        if(s?.time)append(box,'p',`時刻（JST）：${new Date(s.time.replace(' ','T')+'Z').toLocaleString('ja-JP',{timeZone:'Asia/Tokyo'})}`);
        for(const [label,list] of [['端末（短時間保存）',events],['サーバー',se]]){
          append(box,'h3',label);const ul=append(box,'ol','');
          if(!list.length)append(ul,'li','証拠なし：未到達とは断定できません');
          for(const e of list)append(ul,'li',`${e.stage} +${e.ms}ms${e.status?' HTTP '+e.status:''}${e.reason?' '+e.reason:''}`).style.overflowWrap='anywhere';
        }
      }
      append(out,'p','時間は各側の記録開始からの経過です。端末記録は同一サイト内へ最大10分だけ退避し、family scopeが一致する診断だけを復元します。保存が不明なときは再送せず、家族ログ一覧を確認してください。子供クイックの入力画面を開く経路は保存前なので、サーバー証拠が無いこと自体は異常ではありません。');
    };
    document.getElementById('familyLogDiagnosticRead')?.addEventListener('click',async event=>{
      const btn=event.currentTarget;btn.disabled=true;status.textContent='診断を読み込み中…';
      const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),10000);
      const local=read();
      try{
        const response=await fetch('/api/settings/diagnostics-detail?issue=family_log_quick',{credentials:'same-origin',cache:'no-store',headers:{Accept:'application/json'},signal:controller.signal});
        const data=await response.json();
        if(!response.ok||!data.ok)throw new Error('READ_FAILED');
        render(local,Array.isArray(data.items)?data.items:[]);status.textContent='取得完了。端末の証拠は同一サイト内へ最大10分だけ退避されます。';
      }catch{render(local,[]);status.textContent='サーバー診断を取得できません。端末の短時間保存から復元した証拠のみ表示しています（未到達とは断定できません）。';}
      finally{clearTimeout(timer);btn.disabled=false;}
    });
    return;
  }
  record=read();
  if(!record)return;
  if(!record.id){try{record.id=crypto.randomUUID();}catch{return;}record.started=Date.now();save();}
  const reloadPage=record.reload;
  mark(reloadPage?'RELOAD_BOOTSTRAP_START':'DIAGNOSTIC_READY');
  if(reloadPage)setTimeout(()=>{if(!record.events.some(e=>e.stage==='RELOAD_BOOTSTRAP_READY'))mark('PENDING_15S');},15000);
  window.familyLogDiagnostic={
    mark,
    begin(){
      if(!record.tapped||reloadPage||record.events.some(e=>e.stage==='HANDLER_START'))return undefined;
      mark('HANDLER_START');return window.familyLogDiagnostic;
    },
    headers(action){
      if(!record.tapped||requestActive||record.events.some(e=>e.stage==='REQUEST_START')||!['execute_quick_action','quick_record'].includes(action))return {};
      requestActive=true;mark('REQUEST_START');return {'X-Family-Log-Trace':record.id};
    },
    settle(){if(requestActive){mark('REQUEST_SETTLED');requestActive=false;}},
    reload(){record.reload=true;mark('RELOAD_REQUESTED');},
    ready(){mark('CORE_READY');if(reloadPage)mark('RELOAD_BOOTSTRAP_READY');}
  };
  const inspectGenericModal=()=>{
    const modal=document.getElementById('familyLogModal');
    if(!modal?.classList?.contains('open')){mark('MODAL_NOT_OPEN');return;}
    mark('MODAL_OPEN');
    const sheet=modal.querySelector?.('.family-log-sheet');
    if(!sheet){mark('MODAL_SHEET_MISSING');return;}
    let rect;
    try{rect=sheet.getBoundingClientRect();}catch{mark('MODAL_SHEET_ZERO_RECT');return;}
    if(!rect||rect.width<2||rect.height<2){mark('MODAL_SHEET_ZERO_RECT');return;}
    const viewportWidth=Number(document.documentElement?.clientWidth||window.innerWidth||0),viewportHeight=Number(document.documentElement?.clientHeight||window.innerHeight||0);
    if((viewportWidth&&rect.left>=viewportWidth)||(viewportHeight&&rect.top>=viewportHeight)||rect.right<=0||rect.bottom<=0){mark('MODAL_SHEET_OUTSIDE_VIEWPORT');return;}
    const close=sheet.querySelector?.('#familyLogClose'),probe=close||sheet,probeRect=probe.getBoundingClientRect?.();
    if(probeRect&&typeof document.elementFromPoint==='function'){
      const x=Math.max(0,Math.min(viewportWidth||probeRect.right,probeRect.left+Math.max(1,probeRect.width)/2));
      const y=Math.max(0,Math.min(viewportHeight||probeRect.bottom,probeRect.top+Math.max(1,probeRect.height)/2));
      const hit=document.elementFromPoint(x,y);
      if(hit&&hit!==probe&&!probe.contains?.(hit)&&!sheet.contains?.(hit)){mark('MODAL_HITTEST_BLOCKED');return;}
    }
    mark('MODAL_READY');mark('EDITOR_READY');
  };
  document.addEventListener('click',event=>{
    const btn=event.target instanceof Element?event.target.closest('.family-log-quick-action,.family-log-one-tap,.family-log-form-action,.family-log-quick[data-log-type]'):null;
    if(!btn||btn.disabled||record.tapped||!record.armed)return;
    const generic=Boolean(btn.matches?.(GENERIC_QUICK_SELECTOR));
    record.tapped=true;record.armed=false;mark('TAP');
    if(generic){
      mark('GENERIC_QUICK_TAP');
      setTimeout(inspectGenericModal,0);
    }else{
      setTimeout(()=>{if(!record.events.some(e=>e.stage==='HANDLER_START'))mark('HANDLER_NOT_OBSERVED');},1000);
    }
    setTimeout(()=>{if(!record.events.some(e=>['BUTTON_ENABLED','EDITOR_READY','RELOAD_BOOTSTRAP_READY',...MODAL_FAILURE_STAGES].includes(e.stage)))mark('PENDING_15S');},15000);
  },true);
  window.addEventListener('pagehide',()=>mark('PAGEHIDE'));
  window.addEventListener('error',event=>mark('JS_ERROR',undefined,ERROR_NAMES.has(event.error?.name)?event.error.name:undefined));
  window.addEventListener('unhandledrejection',event=>mark('UNHANDLED_REJECTION',undefined,ERROR_NAMES.has(event.reason?.name)?event.reason.name:undefined));
})();
