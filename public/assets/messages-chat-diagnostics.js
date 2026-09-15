(()=>{
'use strict';
const script=document.currentScript,scope=String(script?.dataset.family||''),adminMode=script?.dataset.admin==='1',KEY='message-chat-one-shot-v1';
const MODES=new Set(['stamp','dismiss']);
const STAGES=new Set(['PAGE_READY','STAMP_FETCH_START','STAMP_FETCH_RESPONSE','STAMP_FETCH_FAILED','STAMP_DATA_READY','STAMP_RENDER_DONE','UNREAD_FOUND','UNREAD_NONE','THUMBNAIL_LOADED','AUTO_PLAY_START','TAP_PLAY_START','ANIMATION_START','ANIMATION_STATIC','FIRST_FRAME_LOADED','FIRST_FRAME_FAILED','CYCLE_1_DONE','CYCLE_2_DONE','THUMBNAIL_RESTORED','TEXT_WAS_PRESENT','FOCUS_WAS_ACTIVE','TOOLS_WAS_OPEN','STAMP_PICKER_WAS_OPEN','SCHEDULE_WAS_OPEN','SCHEDULE_VALUE_WAS_PRESENT','OUTSIDE_TAP','DISMISS_START','TEXT_CLEARED','BLUR_REQUESTED','FOCUS_RELEASED','TOOLS_CLOSED','STAMP_PICKER_CLOSED','SCHEDULE_CLOSED','SCHEDULE_VALUE_CLEARED','DISMISS_DONE','JS_ERROR','UNHANDLED_REJECTION','PAGEHIDE']);
const ERROR_NAMES=new Set(['TypeError','ReferenceError','SyntaxError','RangeError','SecurityError','AbortError']);
let record=null;
const getStorage=name=>{try{return window[name]||null;}catch{return null;}};
const safeEvents=events=>Array.isArray(events)?events.slice(0,80).flatMap(e=>e&&STAGES.has(e.stage)&&Number.isInteger(e.ms)&&e.ms>=0&&e.ms<=600000?[{stage:e.stage,ms:e.ms,...(Number.isInteger(e.status)&&e.status>=100&&e.status<=599?{status:e.status}:{}),...(ERROR_NAMES.has(e.reason)?{reason:e.reason}:{})}]:[]):[];
const normalize=v=>{
  if(!v||v.scope!==scope||!MODES.has(v.mode)||!Number.isFinite(v.expires)||v.expires<=Date.now())return null;
  const started=Number(v.started)||Date.now();
  return {scope,mode:v.mode,expires:v.expires,armed:v.armed===true,started,updated:Number(v.updated)||started,events:safeEvents(v.events)};
};
const readStorage=storage=>{if(!storage)return null;try{const raw=storage.getItem(KEY);if(!raw)return null;const value=normalize(JSON.parse(raw));if(!value)storage.removeItem(KEY);return value;}catch{return null;}};
const read=()=>{const a=readStorage(getStorage('sessionStorage')),b=readStorage(getStorage('localStorage'));if(!a)return b;if(!b)return a;if(a.updated!==b.updated)return a.updated>b.updated?a:b;return a.events.length>=b.events.length?a:b;};
const writeStorage=(storage,text)=>{if(!storage)return false;try{storage.setItem(KEY,text);return true;}catch{return false;}};
const save=()=>{if(!record)return false;try{record.updated=Date.now();const text=JSON.stringify({...record,events:safeEvents(record.events)}),sessionSaved=writeStorage(getStorage('sessionStorage'),text),localSaved=writeStorage(getStorage('localStorage'),text);return sessionSaved||localSaved;}catch{return false;}};
const mark=(stage,status,reason)=>{if(!record||!record.armed||record.expires<=Date.now()||!STAGES.has(stage)||record.events.length>=80)return;record.events.push(...safeEvents([{stage,ms:Math.min(600000,Math.max(0,Date.now()-record.started)),status,reason}]));save();};
const clear=()=>{for(const name of ['sessionStorage','localStorage']){const storage=getStorage(name);try{storage?.removeItem(KEY);}catch{}}record=null;};
const append=(parent,tag,text)=>{const el=document.createElement(tag);el.textContent=text;parent.append(el);return el;};
const resultLabel=r=>{
  const has=s=>r.events.some(e=>e.stage===s);
  if(r.mode==='stamp'){
    if(has('STAMP_FETCH_FAILED'))return 'スタンプ取得失敗';
    if(has('CYCLE_2_DONE')&&has('THUMBNAIL_RESTORED'))return '2周再生してサムネイルへ復帰';
    if(has('ANIMATION_START')&&!has('FIRST_FRAME_LOADED')&&has('FIRST_FRAME_FAILED'))return '最初のアニメフレーム読込失敗';
    if(has('CYCLE_1_DONE')&&!has('CYCLE_2_DONE'))return '1周後に停止／途中';
    if(has('UNREAD_NONE'))return '未表示の受信スタンプなし（自動再生は判定不能）';
    if(has('UNREAD_FOUND')&&!has('AUTO_PLAY_START'))return '未表示スタンプ検出後、自動再生未開始';
    if(has('STAMP_RENDER_DONE'))return 'スタンプ描画まで確認';
    return '診断途中';
  }
  const required=['OUTSIDE_TAP','DISMISS_START','TEXT_CLEARED','BLUR_REQUESTED','TOOLS_CLOSED','STAMP_PICKER_CLOSED','SCHEDULE_CLOSED','SCHEDULE_VALUE_CLEARED','DISMISS_DONE'];
  if(required.every(has)&&has('FOCUS_RELEASED'))return '画面外タップ後の閉鎖・クリア・focus解放を確認';
  if(has('DISMISS_DONE')&&!has('FOCUS_RELEASED'))return 'UIは閉鎖したがfocus解放を未確認';
  if(has('OUTSIDE_TAP')&&!has('DISMISS_DONE'))return '画面外タップ後、dismiss完了前で停止';
  return '診断途中';
};
const render=(out,r)=>{
  out.replaceChildren();
  if(!r){append(out,'p','診断記録はありません。下の診断開始を押し、伝言ページで1回だけ操作してください。');return;}
  const has=s=>r.events.some(e=>e.stage===s),box=append(out,'details','');box.open=true;
  append(box,'summary',`${r.mode==='stamp'?'スタンプ':'画面外タップ'}：${resultLabel(r)}`);
  append(box,'p',`端末最終段階：${r.events.at(-1)?.stage||'証拠なし'} ／ 経過：${r.events.at(-1)?.ms??'—'}ms`);
  if(r.mode==='stamp'){
    const fetchStart=r.events.find(e=>e.stage==='STAMP_FETCH_START')?.ms,fetchEnd=r.events.find(e=>e.stage==='STAMP_FETCH_RESPONSE')?.ms,first=r.events.find(e=>e.stage==='FIRST_FRAME_LOADED')?.ms,auto=r.events.find(e=>e.stage==='AUTO_PLAY_START')?.ms;
    append(box,'p',`スタンプAPI：${fetchStart!=null&&fetchEnd!=null?`${Math.max(0,fetchEnd-fetchStart)}ms`:'未確認'} ／ 自動再生→初回frame：${auto!=null&&first!=null?`${Math.max(0,first-auto)}ms`:'未確認'}`);
  }else{
    const exercised=[['文字入力',has('TEXT_WAS_PRESENT')],['入力focus',has('FOCUS_WAS_ACTIVE')],['＋メニュー',has('TOOLS_WAS_OPEN')],['スタンプ一覧',has('STAMP_PICKER_WAS_OPEN')],['予約欄',has('SCHEDULE_WAS_OPEN')],['予約日時',has('SCHEDULE_VALUE_WAS_PRESENT')]].filter(([,v])=>v).map(([k])=>k);
    append(box,'p',`今回実際に開いていた/入力されていた対象：${exercised.join('・')||'なし'}。キーボードの可視状態は取得せず、textareaのfocus解放だけを確認します。`);
  }
  const ol=append(box,'ol','');for(const e of r.events)append(ol,'li',`${e.stage} +${e.ms}ms${e.status?' HTTP '+e.status:''}${e.reason?' '+e.reason:''}`);
  append(out,'p','保存内容は段階名・経過時間・HTTP status・例外種別だけです。伝言本文、スタンプID/URL、画像、token、位置情報は保存しません。10分で失効します。');
};
if(adminMode){
  const admin=document.getElementById('messageChatDiagnosticAdmin');if(!admin)return;
  const status=document.getElementById('messageChatDiagnosticStatus'),out=document.getElementById('messageChatDiagnosticResult');
  const arm=mode=>{record={scope,mode,expires:Date.now()+600000,armed:true,started:Date.now(),updated:Date.now(),events:[]};if(!save()){status.textContent='端末の診断保存を利用できません。';return;}location.assign('/app/messages.php');};
  document.getElementById('messageChatDiagnosticStampArm')?.addEventListener('click',()=>arm('stamp'));
  document.getElementById('messageChatDiagnosticDismissArm')?.addEventListener('click',()=>arm('dismiss'));
  document.getElementById('messageChatDiagnosticRead')?.addEventListener('click',()=>{record=read();render(out,record);status.textContent=record?'端末診断を読み込みました。':'診断記録はありません。';});
  document.getElementById('messageChatDiagnosticClear')?.addEventListener('click',()=>{clear();render(out,null);status.textContent='診断記録を破棄しました。';});
  record=read();render(out,record);return;
}
record=read();if(!record)return;
window.messageChatDiagnostic={mode:record.mode,mark};mark('PAGE_READY');
window.addEventListener('pagehide',()=>mark('PAGEHIDE'));
window.addEventListener('error',event=>mark('JS_ERROR',undefined,ERROR_NAMES.has(event.error?.name)?event.error.name:undefined));
window.addEventListener('unhandledrejection',event=>mark('UNHANDLED_REJECTION',undefined,ERROR_NAMES.has(event.reason?.name)?event.reason.name:undefined));
})();