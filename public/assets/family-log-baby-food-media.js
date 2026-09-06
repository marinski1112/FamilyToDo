(()=>{
'use strict';
const payloadNode=document.getElementById('familyLogPayload');
const form=document.getElementById('familyLogForm');
if(!payloadNode||!(form instanceof HTMLFormElement))return;
let payload={};try{payload=JSON.parse(payloadNode.textContent||'{}');}catch{return;}
const csrf=String(payload.csrf||'');
const MAX_SOURCE_BYTES=20*1024*1024;
const MAX_EDGE=800;
const TARGET_BYTES=3600*1024;
const mediaCache=new Map();
let existingMedia=null,pendingBlob=null,pendingUrl='',loadedLogId=0,loadToken=0;
const field=name=>form.elements.namedItem(name);
const logId=()=>Number(field('id')?.value||0)||0;
const isBabyFood=()=>String(field('log_type')?.value||'').toUpperCase()==='MEAL'&&String(field('detail_code')?.value||'').toUpperCase()==='BABY_FOOD';
const fixedMediaError=code=>({PHOTO_ALREADY_EXISTS:'すでに写真があります。先に既存写真を削除してください。',FILE_TOO_LARGE:'写真サイズが大きすぎます。別の写真を選んでください。',UNSUPPORTED_IMAGE_TYPE:'この写真形式はアップロードできません。',INVALID_IMAGE:'写真を読み取れませんでした。',BABY_FOOD_LOG_CHANGED:'記録内容が変更されたため写真を追加できませんでした。画面を再読み込みしてください。',MEDIA_DELETE_RETRY_PENDING:'写真削除を再試行中です。少し待ってから画面を再読み込みしてください。'}[String(code||'')]||'写真の処理に失敗しました。');

const style=document.createElement('style');
style.textContent='.family-log-baby-food-media{margin:12px 0;padding:12px;border:1px solid var(--line,#e7e7e7);border-radius:14px;background:var(--card-soft,#fafafa)}.family-log-baby-food-media[hidden]{display:none!important}.family-log-media-preview{display:flex;gap:12px;align-items:center;flex-wrap:wrap}.family-log-media-preview button{border:0;background:transparent;padding:0}.family-log-media-preview img,.family-log-media-thumb img{width:84px;height:84px;object-fit:cover;border-radius:12px;display:block}.family-log-media-picker{display:inline-flex;align-items:center;gap:6px}.family-log-media-picker input{max-width:100%}.family-log-media-note{display:block;margin-top:6px}.family-log-media-thumb{border:0;background:transparent;padding:0;margin-top:6px}.family-log-media-viewer{position:fixed;inset:0;z-index:9999;background:rgba(0,0,0,.86);display:none;align-items:center;justify-content:center;padding:18px}.family-log-media-viewer.open{display:flex}.family-log-media-viewer img{max-width:100%;max-height:90vh;object-fit:contain;border-radius:12px}.family-log-media-viewer button{position:absolute;top:max(14px,env(safe-area-inset-top));right:14px;font-size:28px;line-height:1;width:44px;height:44px;border:0;border-radius:22px;background:#fff}.family-log-media-status{margin-top:6px}.family-log-media-row-photo{margin-top:6px}';
document.head.appendChild(style);

const viewer=document.createElement('div');viewer.className='family-log-media-viewer';viewer.setAttribute('aria-hidden','true');viewer.innerHTML='<button type="button" aria-label="写真を閉じる">×</button><img alt="離乳食の写真">';document.body.appendChild(viewer);
const viewerImg=viewer.querySelector('img');const closeViewer=()=>{viewer.classList.remove('open');viewer.setAttribute('aria-hidden','true');viewerImg.removeAttribute('src');};viewer.querySelector('button').addEventListener('click',closeViewer);viewer.addEventListener('click',e=>{if(e.target===viewer)closeViewer();});
const openViewer=url=>{if(!url)return;viewerImg.src=url;viewer.classList.add('open');viewer.setAttribute('aria-hidden','false');};

const wrap=document.createElement('section');wrap.id='familyLogBabyFoodMedia';wrap.className='family-log-baby-food-media';wrap.hidden=true;wrap.innerHTML='<strong>📷 離乳食の写真（任意）</strong><div class="family-log-media-preview" id="familyLogMediaPreview"></div><label class="family-log-media-picker" id="familyLogMediaPicker"><span>写真を選ぶ / 撮る</span><input id="familyLogMediaInput" type="file" accept="image/*" capture="environment"></label><small class="family-log-media-note">端末内で最大辺800pxに縮小・JPEG再生成してから送信します。位置情報などのEXIFメタデータは引き継ぎません。1記録につき1枚です。</small><div class="family-log-media-status small" id="familyLogMediaStatus" aria-live="polite"></div>';
const advanced=document.getElementById('familyLogAdvanced');advanced?.insertAdjacentElement('beforebegin',wrap);
const preview=wrap.querySelector('#familyLogMediaPreview'),picker=wrap.querySelector('#familyLogMediaPicker'),input=wrap.querySelector('#familyLogMediaInput'),status=wrap.querySelector('#familyLogMediaStatus');

function revokePending(){if(pendingUrl)URL.revokeObjectURL(pendingUrl);pendingUrl='';pendingBlob=null;if(input)input.value='';}
function render(){
  wrap.hidden=!isBabyFood();if(wrap.hidden)return;
  preview.innerHTML='';picker.hidden=Boolean(existingMedia);
  if(existingMedia){const view=document.createElement('button');view.type='button';view.setAttribute('aria-label','離乳食の写真を拡大');const img=document.createElement('img');img.src=String(existingMedia.url||'');img.alt='離乳食の写真';view.append(img);view.addEventListener('click',()=>openViewer(String(existingMedia.url||'')));const del=document.createElement('button');del.type='button';del.className='btn danger small';del.textContent='写真を削除';del.addEventListener('click',deleteExisting);preview.append(view,del);return;}
  if(pendingBlob&&pendingUrl){const view=document.createElement('button');view.type='button';view.setAttribute('aria-label','選択した写真を拡大');const img=document.createElement('img');img.src=pendingUrl;img.alt='選択した離乳食の写真';view.append(img);view.addEventListener('click',()=>openViewer(pendingUrl));const clear=document.createElement('button');clear.type='button';clear.className='btn gray small';clear.textContent='選び直す';clear.addEventListener('click',()=>{revokePending();status.textContent='';render();});preview.append(view,clear);}
}
async function fetchMedia(id,{fresh=false}={}){
  if(!id)return null;if(fresh)mediaCache.delete(id);if(!mediaCache.has(id))mediaCache.set(id,fetch(`/api/family-log-media?log=${encodeURIComponent(id)}`,{credentials:'same-origin',cache:'no-store',headers:{accept:'application/json'}}).then(async r=>{const d=await r.json().catch(()=>null);return r.ok&&d?.ok?d.media:null;}).catch(()=>null));return await mediaCache.get(id);
}
async function sync(){
  if(!isBabyFood()){wrap.hidden=true;existingMedia=null;loadedLogId=0;revokePending();return;}
  wrap.hidden=false;const id=logId();
  if(!id){existingMedia=null;loadedLogId=0;render();return;}
  if(id===loadedLogId){render();return;}
  const token=++loadToken;status.textContent='写真を確認しています…';picker.hidden=true;const media=await fetchMedia(id);if(token!==loadToken)return;loadedLogId=id;existingMedia=media;status.textContent='';render();
}

function canvasBlob(canvas,quality){return new Promise((resolve,reject)=>canvas.toBlob(blob=>blob?resolve(blob):reject(new Error('ENCODE_FAILED')),'image/jpeg',quality));}
async function decodeImage(file){
  if('createImageBitmap'in window){try{return await createImageBitmap(file,{imageOrientation:'from-image'});}catch{} }
  return await new Promise((resolve,reject)=>{const url=URL.createObjectURL(file),img=new Image();img.onload=()=>{URL.revokeObjectURL(url);resolve(img);};img.onerror=()=>{URL.revokeObjectURL(url);reject(new Error('DECODE_FAILED'));};img.src=url;});
}
async function prepareImage(file){
  if(!file||file.size<=0)throw new Error('EMPTY');if(file.size>MAX_SOURCE_BYTES)throw new Error('SOURCE_TOO_LARGE');
  const image=await decodeImage(file),sourceW=Number(image.width||image.naturalWidth||0),sourceH=Number(image.height||image.naturalHeight||0);if(!sourceW||!sourceH)throw new Error('DECODE_FAILED');
  let scale=Math.min(1,MAX_EDGE/Math.max(sourceW,sourceH)),quality=.84,blob=null;
  for(let attempt=0;attempt<5;attempt++){
    const canvas=document.createElement('canvas');canvas.width=Math.max(1,Math.round(sourceW*scale));canvas.height=Math.max(1,Math.round(sourceH*scale));const ctx=canvas.getContext('2d',{alpha:false});if(!ctx)throw new Error('CANVAS_FAILED');ctx.drawImage(image,0,0,canvas.width,canvas.height);blob=await canvasBlob(canvas,quality);if(blob.size<=TARGET_BYTES)break;scale*=.82;quality=Math.max(.62,quality-.07);
  }
  if(typeof image.close==='function')image.close();if(!blob||blob.size>4*1024*1024)throw new Error('OUTPUT_TOO_LARGE');return blob;
}
input?.addEventListener('change',async()=>{
  const file=input.files?.[0];if(!file)return;status.textContent='写真を準備しています…';picker.hidden=true;
  try{const blob=await prepareImage(file);revokePending();pendingBlob=blob;pendingUrl=URL.createObjectURL(blob);status.textContent=`送信サイズ ${(blob.size/1024/1024).toFixed(1)}MB`;render();}
  catch{revokePending();status.textContent='この写真を処理できませんでした。JPEG/PNG/WebPまたは通常のiPhone写真を選び直してください。';picker.hidden=false;}
});

async function deleteExisting(){
  if(!existingMedia||!csrf)return;if(!confirm('この離乳食写真を削除しますか？'))return;status.textContent='写真を削除しています…';
  try{const r=await fetch(`/api/family-log-media?media=${encodeURIComponent(existingMedia.id)}`,{method:'DELETE',credentials:'same-origin',headers:{accept:'application/json','x-csrf-token':csrf}}),d=await r.json().catch(()=>null);if(!r.ok||!d?.ok)throw new Error(String(d?.error||'DELETE_FAILED'));mediaCache.delete(logId());existingMedia=null;loadedLogId=logId();status.textContent='写真を削除しました。';render();enhanceTimeline(true);}
  catch(err){status.textContent=fixedMediaError(err?.message);}
}
async function saveLog(fd){
  const body={action:'save',id:Number(fd.get('id')||0),subject_id:Number(fd.get('subject_id')||0),log_type:String(fd.get('log_type')||''),occurred_at:String(fd.get('occurred_at')||''),detail_code:String(fd.get('detail_code')||''),amount:String(fd.get('amount')||''),unit:String(fd.get('unit')||''),duration_minutes:String(fd.get('duration_minutes')||''),value_text:String(fd.get('value_text')||''),note:String(fd.get('note')||''),linked_target:String(fd.get('linked_target')||''),csrf};
  const r=await fetch('/api/family-log',{method:'POST',credentials:'same-origin',headers:{'content-type':'application/json',accept:'application/json'},body:JSON.stringify(body)}),d=await r.json().catch(()=>null);if(!r.ok||!d?.ok)throw new Error('LOG_SAVE_FAILED');return d;
}
async function uploadPhoto(id,blob){
  const r=await fetch('/api/family-log-media',{method:'POST',credentials:'same-origin',headers:{accept:'application/json','content-type':'image/jpeg','x-csrf-token':csrf,'x-family-log-id':String(id)},body:blob}),d=await r.json().catch(()=>null);if(!r.ok||!d?.ok)throw new Error(String(d?.error||'MEDIA_UPLOAD_FAILED'));return d.media;
}
document.addEventListener('submit',async e=>{
  if(e.target!==form||!pendingBlob||!isBabyFood())return;
  e.preventDefault();e.stopImmediatePropagation();
  const submit=form.querySelector('button[type="submit"]');if(submit)submit.disabled=true;status.textContent='記録と写真を保存しています…';
  try{const fd=new FormData(form),saved=await saveLog(fd),id=Number(saved?.id||0);if(!id)throw new Error('LOG_SAVE_FAILED');field('id').value=String(id);if(saved?.linked_completion?.ok===false&&saved.linked_completion.message)alert(saved.linked_completion.message);try{await uploadPhoto(id,pendingBlob);}catch(err){loadedLogId=id;status.textContent=`記録は保存しましたが、${fixedMediaError(err?.message)} そのまま「保存する」をもう一度押すと写真だけ再試行できます。`;return;}location.reload();}
  catch{status.textContent='記録を保存できませんでした。入力内容を確認してもう一度お試しください。';}
  finally{if(submit)submit.disabled=false;}
},true);

async function enhanceTimeline(fresh=false){
  const logs=payload.logs&&typeof payload.logs==='object'?Object.values(payload.logs):[];
  for(const row of logs){if(String(row?.log_type||'').toUpperCase()!=='MEAL'||String(row?.detail_code||'').toUpperCase()!=='BABY_FOOD')continue;const id=Number(row?.id||0),el=document.querySelector(`.family-log-row[data-id="${id}"] .family-log-main`);if(!id||!el)continue;el.querySelector('.family-log-media-row-photo')?.remove();const media=await fetchMedia(id,{fresh});if(!media)continue;const box=document.createElement('div');box.className='family-log-media-row-photo';const button=document.createElement('button');button.type='button';button.className='family-log-media-thumb';button.setAttribute('aria-label','離乳食の写真を拡大');const img=document.createElement('img');img.loading='lazy';img.src=String(media.url||'');img.alt='離乳食の写真';button.append(img);button.addEventListener('click',ev=>{ev.stopPropagation();openViewer(String(media.url||''));});box.append(button);el.append(box);}
}

document.addEventListener('click',e=>{const target=e.target instanceof Element?e.target:null;if(target?.closest('.family-log-edit,.family-log-row,.family-log-form-action,[data-log-type]'))queueMicrotask(()=>queueMicrotask(sync));},true);
document.addEventListener('change',e=>{const target=e.target;if(target instanceof HTMLSelectElement&&['log_type','detail_code'].includes(target.name))queueMicrotask(sync);},true);
window.addEventListener('pagehide',revokePending,{once:true});
sync();enhanceTimeline();
})();
