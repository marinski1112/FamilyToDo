(()=>{
  'use strict';
  const KEY='family-log-one-shot-v1',scope=String(document.currentScript?.dataset.family||'');
  const STAGES=new Set(['DIAGNOSTIC_READY','LOADER_START','PHOTO_LOAD_START','PHOTO_LOADED','PHOTO_LOAD_FAILED','CORE_LOAD_START','CORE_SCRIPT_START','CORE_READY','CORE_LOADED','CORE_LOAD_FAILED','TAP','HANDLER_START','BUTTON_DISABLED','HANDLER_NOT_OBSERVED','REQUEST_START','RESPONSE_RECEIVED','PARSE_OK','PARSE_FAILED','NETWORK_ERROR','NETWORK_ABORT','REQUEST_SETTLED','UI_UPDATE_START','UI_UPDATE_DONE','BUTTON_ENABLED','RELOAD_REQUESTED','PAGEHIDE','RELOAD_BOOTSTRAP_START','RELOAD_BOOTSTRAP_READY','JS_ERROR','UNHANDLED_REJECTION','PENDING_15S']);
const ERROR_NAMES=new Set(['TypeError','ReferenceError','SyntaxError','RangeError','SecurityError','AbortError']);
  let record=null,requestActive=false;
  const safeEvents=events=>Array.isArray(events)?events.slice(0,64).flatMap(e=>e&&STAGES.has(e.stage)&&Number.isInteger(e.ms)&&e.ms>=0&&e.ms<=600000?[{stage:e.stage,ms:e.ms,...(Number.isInteger(e.status)&&e.status>=100&&e.status<=599?{status:e.status}:{}),...(ERROR_NAMES.has(e.reason)?{reason:e.reason}:{})}]:[]):[];
  const read=()=>{
    try{
      const v=JSON.parse(sessionStorage.getItem(KEY)||'null');
      if(!v)return null;
      if(v.scope!==scope||!Number.isFinite(v.expires)||v.expires<=Date.now()){sessionStorage.removeItem(KEY);return null;}
      return {scope,expires:v.expires,armed:v.armed===true,tapped:v.tapped===true,reload:v.reload===true,started:Number(v.started)||Date.now(),id:/^[0-9a-f-]{36}$/.test(v.id)?v.id:null,events:safeEvents(v.events)};
    }catch{return null;}
  };
  const save=()=>{try{sessionStorage.setItem(KEY,JSON.stringify(record));return true;}catch{return false;}};
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
      record={scope,expires:Date.now()+600000,armed:true,tapped:false,reload:false,started:Date.now(),id:null,events:[]};
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
        const result=has('RELOAD_BOOTSTRAP_READY')?'再読込・初期化完了':has('BUTTON_ENABLED')?'エラー後ボタン復帰':has('PENDING_15S')?'15秒時点で操作未完了':failure?'サーバー処理失敗':'診断途中／証拠を確認';
        const box=append(out,'details','');box.open=id===local?.id;
        append(box,'summary',`FAMILY_LOG_QUICK：${result}`);
        append(box,'p',`DB保存：${saved?'成功を確認':'未確認（未保存とは断定しません）'} ／ サーバー最終段階：${failureStage||last?.stage||'証拠なし'}${failure?.reason?' ／ '+failure.reason:''}`);
        const http=[...events].reverse().find(x=>x.status)?.status||last?.status;
        append(box,'p',`HTTP：${http||'未確認'} ／ client復帰：${has('RELOAD_BOOTSTRAP_READY')||has('BUTTON_ENABLED')?'確認':'未確認'}`);
        append(box,'p',`POST /api/family-log ／ 端末最終段階：${events.at(-1)?.stage||'証拠なし'} ／ 経過：${events.at(-1)?.ms??'—'}ms`);
        append(box,'p',`Correlation ID：${id}`).style.overflowWrap='anywhere';
        if(s?.time)append(box,'p',`時刻（JST）：${new Date(s.time.replace(' ','T')+'Z').toLocaleString('ja-JP',{timeZone:'Asia/Tokyo'})}`);
        for(const [label,list] of [['端末（同じタブのみ）',events],['サーバー',se]]){
          append(box,'h3',label);const ul=append(box,'ol','');
          if(!list.length)append(ul,'li','証拠なし：未到達とは断定できません');
          for(const e of list)append(ul,'li',`${e.stage} +${e.ms}ms${e.status?' HTTP '+e.status:''}${e.reason?' '+e.reason:''}`).style.overflowWrap='anywhere';
        }
      }
      append(out,'p','時間は各側の記録開始からの経過です。保存が不明なときは再送せず、家族ログ一覧を確認してください。認証前の停止・診断通信自体の失敗は、サーバー証拠だけでは区別できません。');
    };
    document.getElementById('familyLogDiagnosticRead')?.addEventListener('click',async event=>{
      const btn=event.currentTarget;btn.disabled=true;status.textContent='診断を読み込み中…';
      const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),10000);
      const local=read();
      try{
        const response=await fetch('/api/settings/diagnostics-detail?issue=family_log_quick',{credentials:'same-origin',cache:'no-store',headers:{Accept:'application/json'},signal:controller.signal});
        const data=await response.json();
        if(!response.ok||!data.ok)throw new Error('READ_FAILED');
        render(local,Array.isArray(data.items)?data.items:[]);status.textContent='取得完了。端末の証拠はこのタブだけに保存されています。';
      }catch{render(local,[]);status.textContent='サーバー診断を取得できません。端末の証拠のみ表示しています（未到達とは断定できません）。';}
      finally{clearTimeout(timer);btn.disabled=false;}
    });
    return;
  }
  record=read();
  if(!record)return;
  if(!record.id){try{record.id=crypto.randomUUID();}catch{return;}record.started=Date.now();}
  const reloadPage=record.reload;
  mark(reloadPage?'RELOAD_BOOTSTRAP_START':'DIAGNOSTIC_READY');
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
  document.addEventListener('click',event=>{
    const btn=event.target instanceof Element?event.target.closest('.family-log-quick-action,.family-log-one-tap'):null;
    if(!btn||btn.disabled||record.tapped||!record.armed)return;
    record.tapped=true;record.armed=false;mark('TAP');
    setTimeout(()=>{if(!record.events.some(e=>e.stage==='HANDLER_START'))mark('HANDLER_NOT_OBSERVED');},1000);
    setTimeout(()=>{if(!record.events.some(e=>['BUTTON_ENABLED','RELOAD_BOOTSTRAP_READY'].includes(e.stage)))mark('PENDING_15S');},15000);
  },true);
  window.addEventListener('pagehide',()=>mark('PAGEHIDE'));
  window.addEventListener('error',event=>mark('JS_ERROR',undefined,ERROR_NAMES.has(event.error?.name)?event.error.name:undefined));
  window.addEventListener('unhandledrejection',event=>mark('UNHANDLED_REJECTION',undefined,ERROR_NAMES.has(event.reason?.name)?event.reason.name:undefined));
})();
