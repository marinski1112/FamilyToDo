(()=>{
'use strict';
const SOCKET='wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContent';
const encode=bytes=>{let s='';for(let at=0;at<bytes.length;at+=8192)s+=String.fromCharCode(...bytes.subarray(at,at+8192));return btoa(s);};
function create({api,onState=()=>{},onText=()=>{},onRequest=()=>{},now=()=>Date.now()}){
 let socket=null,connecting=false,audio=null,stream=null,node=null,mute=null,ready=false,disposed=false,live=null,pending=null,epoch=0,lastInput=0,started=0,timer=null,setupTimer=null,playing=new Set(),nextAudio=0,callIds=new Set();
 const state=(status,message)=>onState({status,message,mic:!!stream});
 const stopAudio=()=>{for(const source of playing){try{source.stop();}catch{}}playing.clear();nextAudio=0;};
 const stopMic=()=>{stream?.getTracks().forEach(t=>t.stop());stream=null;node?.disconnect();node=null;mute?.disconnect();mute=null;};
 const send=message=>{if(ready&&socket?.readyState===1){socket.send(JSON.stringify(message));return true;}return false;};
 function stop(message='音声相談を終了しました。'){
  epoch++;ready=false;connecting=false;onRequest(null);clearInterval(timer);clearTimeout(setupTimer);timer=setupTimer=null;stopMic();stopAudio();const ws=socket;socket=null;if(ws){ws.onmessage=ws.onclose=ws.onerror=ws.onopen=null;try{ws.close();}catch{}}const old=live;live=null;if(old)pending=null;if(audio){audio.close().catch(()=>{});audio=null;}if(old)api({action:'live_end',id:old.id}).catch(()=>{});state('IDLE',message);
 }
 function playback(part){
  if(!audio||!part||!/^audio\/pcm(?:;rate=24000)?$/.test(part.mimeType||'')||typeof part.data!=='string'||part.data.length>262144)return;
  try{const data=Uint8Array.from(atob(part.data),c=>c.charCodeAt(0));if(data.length%2)return;const count=data.length/2;if(nextAudio-audio.currentTime>30){stop('音声の受信が混み合いました。音声相談を終了しました。');return;}const buffer=audio.createBuffer(1,count,24000),values=buffer.getChannelData(0),view=new DataView(data.buffer);for(let i=0;i<count;i++)values[i]=view.getInt16(i*2,true)/32768;const source=audio.createBufferSource();source.buffer=buffer;source.connect(audio.destination);source.onended=()=>playing.delete(source);playing.add(source);nextAudio=Math.max(nextAudio,audio.currentTime);source.start(nextAudio);nextAudio+=buffer.duration;}catch{stop('音声を再生できませんでした。手順とタイマーを使えます。');}
 }
 async function start(params){
  if(disposed||socket||connecting)return;connecting=true;if(!window.WebSocket){connecting=false;state('IDLE','このブラウザでは音声相談に接続できません。');return;}
  const generation=++epoch,key=JSON.stringify(params);if(!pending||pending.key!==key)pending={key,id:crypto.randomUUID()};state('CONNECTING','音声相談に接続しています…');
  try{
   const Audio=window.AudioContext||window.webkitAudioContext;if(Audio){audio=new Audio();await audio.resume();}
   const reply=await api({action:'live_start',request_id:pending.id,...params});if(disposed||epoch!==generation){api({action:'live_end',id:reply.live.id}).catch(()=>{});return;}live=reply.live;
   if(!live||!/^auth_tokens\/[A-Za-z0-9._~+\/=-]{1,4096}$/.test(live.token)||typeof live.model!=='string'||!Number.isFinite(live.expires_at)||live.expires_at<=now()){throw Error();}
   callIds.clear();started=now();lastInput=started;socket=new WebSocket(SOCKET+'?access_token='+encodeURIComponent(live.token));live.token=null;
   socket.onopen=()=>{if(epoch!==generation)return;socket.send(JSON.stringify({setup:{model:'models/'+live.model}}));};
   setupTimer=setTimeout(()=>{if(!ready&&epoch===generation)stop('接続に時間がかかっています。自動再接続は行いません。');},10000);
   socket.onerror=()=>stop('音声相談の通信に失敗しました。手順とタイマーを使えます。');socket.onclose=()=>stop('音声相談の接続が終了しました。自動再接続は行いません。');
   socket.onmessage=async event=>{
    try{const text=typeof event.data==='string'?event.data:await event.data.text();if(epoch!==generation||disposed)return;if(text.length>524288)throw Error();const message=JSON.parse(text);
     if(message.error||message.goAway){stop('音声相談の接続が終了しました。手順とタイマーを使えます。');return;}
     if(message.setupComplete){ready=true;clearTimeout(setupTimer);state('READY','接続しました。「マイクを使う」または文字入力から相談できます。');timer=setInterval(()=>{if(now()>=live.expires_at||now()-started>=600000)stop('10分の上限に達したため音声相談を終了しました。');else if(now()-lastInput>=120000)stop('操作・発話が2分なかったため音声相談を終了しました。');},1000);return;}
     if(message.toolCallCancellation)onRequest(null);const content=message.serverContent;if(content?.interrupted)stopAudio();for(const part of content?.modelTurn?.parts||[]){if(part.inlineData)playback(part.inlineData);if(part.text&&!part.thought)onText(String(part.text).slice(0,2000));}if(content?.outputTranscription?.text)onText(String(content.outputTranscription.text).slice(0,2000));
     for(const call of (message.toolCall?.functionCalls||[]).slice(0,4)){if(typeof call.id!=='string'||call.id.length>100||callIds.has(call.id))continue;if(callIds.size>=50){stop('操作候補の上限に達しました。');return;}callIds.add(call.id);const args=call.args,valid=call.name==='propose_cooking_action'&&args&&typeof args==='object'&&!Array.isArray(args)&&Object.keys(args).every(k=>['action','seconds'].includes(k))&&(['NEXT_STEP','PREVIOUS_STEP'].includes(args.action)?args.seconds===undefined:args.action==='TIMER'&&Number.isSafeInteger(args.seconds)&&args.seconds>=1&&args.seconds<=10800);if(valid)onRequest({id:call.id,...args});send({toolResponse:{functionResponses:[{id:call.id,name:call.name,response:valid?{status:'PROPOSED_REQUIRES_USER_CONFIRMATION'}:{error:'Rejected action. No automatic actions are allowed.'}}]}});}
    }catch{stop('音声相談の応答を読み取れませんでした。手順とタイマーを使えます。');}
   };
  }catch{if(epoch===generation)stop('音声相談を開始できませんでした。手順とタイマーは使えます。');}
 }
 async function microphone(){
  if(!ready||disposed)return;if(stream){stopMic();send({realtimeInput:{audioStreamEnd:true}});state('READY','マイクを停止しました。');return;}
  const generation=epoch;
  try{if(!audio?.audioWorklet||!navigator.mediaDevices?.getUserMedia)throw Error();const incoming=await navigator.mediaDevices.getUserMedia({audio:{echoCancellation:true,noiseSuppression:true},video:false});if(epoch!==generation||disposed){incoming.getTracks().forEach(t=>t.stop());return;}stream=incoming;await audio.audioWorklet.addModule('/assets/meals-live-worklet.js?v=meal18');if(epoch!==generation||!stream)return;const source=audio.createMediaStreamSource(stream);node=new AudioWorkletNode(audio,'familytodo-meal-pcm');mute=audio.createGain();mute.gain.value=0;source.connect(node);node.connect(mute);mute.connect(audio.destination);node.port.onmessage=e=>{if(!ready||!stream||epoch!==generation)return;if(socket.bufferedAmount>32768){stop('音声の送信が混み合いました。相談を終了しました。');return;}if(e.data.peak>0.01)lastInput=now();send({realtimeInput:{audio:{mimeType:'audio/pcm;rate='+audio.sampleRate,data:encode(new Uint8Array(e.data.bytes))}}});};state('READY','マイク入力中です。停止ボタンで送信を止められます。');lastInput=now();}
  catch{stopMic();if(epoch===generation)state('READY','マイクを使えませんでした。文字で相談できます。');}
 }
 function text(value){const s=String(value||'').trim();if(!s||s.length>1000||!ready)return false;lastInput=now();return send({clientContent:{turns:[{role:'user',parts:[{text:s}]}],turnComplete:true}});}
 return {start,stop,microphone,text,context(step){if(ready&&Number.isSafeInteger(step)&&step>=1&&step<=100)send({clientContent:{turns:[{role:'user',parts:[{text:'現在の手順番号: '+step}]}],turnComplete:false}});},dispose(){disposed=true;stop();},snapshot(){return {ready,mic:!!stream};}};
}
window.FamilyTodoMealLive={create};
})();
