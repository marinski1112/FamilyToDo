(()=>{'use strict';
const payloadEl=document.getElementById('familyLogImportPayload');
if(!payloadEl)return;
const config=JSON.parse(payloadEl.textContent||'{}');
const file=document.getElementById('importFile'),subject=document.getElementById('importSubject'),status=document.getElementById('importStatus'),out=document.getElementById('importPreviewOut');
if(!file||!subject||!status||!out)return;
let documentValue=null,lastBatch=0,lastPreview=null;
let operationBusy=false;
async function withOperation(work){if(operationBusy)return;operationBusy=true;const controls=[...document.querySelectorAll('input,select,button')].map(el=>[el,el.disabled]);controls.forEach(([el])=>el.disabled=true);try{return await work();}catch(error){status.textContent=error?.message||'処理できませんでした。';}finally{controls.forEach(([el,disabled])=>el.disabled=disabled);operationBusy=false;}}
const hasJournal=()=>Array.isArray(documentValue?.records)&&documentValue.records.some(r=>r?.journal===true);
const foods=()=>documentValue?.foods??[];
const MAX_MEDIA_ITEMS=250,MAX_IMAGE_BYTES=4*1024*1024,IMAGE_TYPES=new Set(['image/jpeg','image/png','image/webp']);
const SAFE_MEDIA_CODES=new Set(['AUTH_REQUIRED','CSRF_FAILED','INVALID_LOG','BABY_FOOD_LOG_NOT_FOUND','PHOTO_ALREADY_EXISTS','UNSUPPORTED_IMAGE_TYPE','FILE_TOO_LARGE','INVALID_IMAGE','BABY_FOOD_LOG_CHANGED','MEDIA_UPLOAD_FAILED','METHOD_NOT_ALLOWED','TARGET_RESOLUTION_FAILED','API_ERROR','SOURCE_TOO_LARGE','DECODE_FAILED','ENCODE_FAILED','UPLOAD_TIMEOUT']);

const mediaNotice=document.createElement('div');
mediaNotice.className='notice';
mediaNotice.textContent='ぴよログPDF自体はFamilyToDoへ送信・解析しません。このチャットで変換した標準JSONと、必要に応じて抽出済みの離乳食・成長日記の写真を選択してください。写真は端末内で最大辺800pxのJPEGに変換して送信します。';
file.parentElement?.insertBefore(mediaNotice,file);
const mediaLabel=document.createElement('label');mediaLabel.textContent='記録写真（変換データに写真指定がある場合・複数選択可）';
const mediaFiles=document.createElement('input');mediaFiles.id='importMediaFiles';mediaFiles.type='file';mediaFiles.multiple=true;mediaFiles.accept='image/jpeg,image/png,image/webp,.jpg,.jpeg,.png,.webp';
const mediaStatus=document.createElement('div');mediaStatus.id='importMediaStatus';mediaStatus.className='small';mediaStatus.setAttribute('aria-live','polite');
file.insertAdjacentElement('afterend',mediaStatus);file.insertAdjacentElement('afterend',mediaFiles);file.insertAdjacentElement('afterend',mediaLabel);

const call=async payload=>{const r=await fetch('/api/family-log-import',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({csrf:config.csrf,...payload})});const d=await r.json();if(!r.ok||!d.ok)throw new Error(d.error||'処理できませんでした。');return d};
const helperCall=async payload=>{const r=await fetch('/api/family-log-import-media-targets',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({csrf:config.csrf,subject_id:Number(subject.value),...payload})});const d=await r.json().catch(()=>null);if(!r.ok||!d?.ok){const e=new Error(d?.error||'ぴよログ補正を確認できませんでした。');e.mediaStage='target_api';e.mediaStatus=Number(r.status||0);e.mediaCode=SAFE_MEDIA_CODES.has(String(d?.error||''))?String(d.error):'API_ERROR';throw e;}return d};
const mediaTargets=externalIds=>helperCall({action:'media_targets',external_ids:externalIds});
const node=(tag,text,className)=>{const e=document.createElement(tag);if(text!==undefined)e.textContent=String(text);if(className)e.className=className;return e};
const displayValue=r=>[r.amount!=null?`${r.amount}${r.unit||''}`:'',r.duration_minutes!=null?`${r.duration_minutes}分`:'',r.value_text||'',r.note||''].filter(Boolean).join(' ・ ');
const cleanName=value=>String(value||'').trim();
const safeMediaCode=value=>SAFE_MEDIA_CODES.has(String(value||''))?String(value):'API_ERROR';
const mediaError=(stage,code,httpStatus,message)=>Object.assign(new Error(message),{mediaStage:stage,mediaCode:safeMediaCode(code),mediaStatus:Number(httpStatus||0)});
const mediaDiagnostic=error=>{const stage=String(error?.mediaStage||'upload_client'),code=safeMediaCode(error?.mediaCode||'API_ERROR'),http=Number(error?.mediaStatus||0);return `${stage}${http?` / HTTP ${http}`:''} / ${code}`;};
const promotionRecords=()=>Array.isArray(documentValue?.records)?documentValue.records.filter(record=>String(record?.log_type||'').toUpperCase()==='MEAL'&&String(record?.detail_code||'').toUpperCase()==='BABY_FOOD'):[];
const promotionCall=action=>helperCall({action,source:String(documentValue?.source||''),records:promotionRecords()});

function manifest(){
  const raw=documentValue?.piyolog_media;
  if(raw==null)return [];
  if(String(documentValue?.source||'').trim().toLowerCase()!=='piyolog')throw new Error('piyolog_mediaはsourceがpiyologの変換データだけで使用できます。');
  if(!Array.isArray(raw)||raw.length>MAX_MEDIA_ITEMS)throw new Error(`記録写真指定は${MAX_MEDIA_ITEMS}件以内にしてください。`);
  const records=Array.isArray(documentValue?.records)?documentValue.records:[],recordsById=new Map();
  for(const record of records){const id=cleanName(record?.external_id);if(id){if(recordsById.has(id))throw new Error('external_idが重複しています。変換データを確認してください。');recordsById.set(id,record);}}
  const ids=new Set(),names=new Set();
  return raw.map((entry,index)=>{
    if(!entry||typeof entry!=='object'||Array.isArray(entry))throw new Error(`写真指定${index+1}件目が不正です。`);
    const external_id=cleanName(entry.external_id),file_name=cleanName(entry.file_name);
    if(!external_id||external_id.length>255||!file_name||file_name.length>255||/[\\/]/.test(file_name))throw new Error(`写真指定${index+1}件目の参照IDまたはファイル名が不正です。`);
    if(ids.has(external_id))throw new Error(`同じ離乳食記録に複数の写真指定があります: ${external_id}`);
    if(names.has(file_name))throw new Error(`同じ写真ファイル名が重複しています: ${file_name}`);
    const record=recordsById.get(external_id);
    if(!record||!((String(record.log_type||'').toUpperCase()==='MEAL'&&String(record.detail_code||'').toUpperCase()==='BABY_FOOD')||(record.journal===true&&record.log_type==='MEMO'&&record.detail_code==='JOURNAL_MEMO')))throw new Error(`写真指定に対応する離乳食・成長日記の記録がありません: ${external_id}`);
    ids.add(external_id);names.add(file_name);return {external_id,file_name};
  });
}
function selectedFiles(){const map=new Map();for(const selected of Array.from(mediaFiles.files||[]))map.set(selected.name,selected);return map;}
function updateMediaSelection(){try{const list=manifest(),chosen=selectedFiles(),matched=list.filter(item=>chosen.has(item.file_name)).length;mediaStatus.textContent=list.length?`記録写真 ${list.length}件指定 / 選択済み ${matched}件${matched<list.length?'（不足分は記録だけ取り込み、あとから写真だけ再試行できます）':''}`:'このJSONには記録写真の指定はありません。';}catch(e){mediaStatus.textContent=e.message;}}
function resetMediaSelection(message='写真は未選択です。'){mediaFiles.value='';mediaStatus.textContent=message;}
mediaFiles.addEventListener('change',updateMediaSelection);

function renderPreview(d){
  lastPreview=d;out.replaceChildren();out.appendChild(node('p',`食材: 新規 ${d.foods?.new_count||0} / 登録済み ${d.foods?.existing_count||0}（既存は保持） / 家族日誌へ ${documentValue.records.filter(r=>r.journal===true).length}件`));
  const promoteIndices=new Set(d.promotion?.promote_indices||[]),promotionCount=Number(d.promotion?.promote_count||0),actualNew=Math.max(0,Number(d.new_count||0)-promotionCount);d.actual_new_count=actualNew;
  const counts=node('div',undefined,'import-counts');[['全件',d.record_count,''],['新規',actualNew,'is-new'],['離乳食へ更新',promotionCount,'is-new'],['重複',d.duplicate_count,'is-duplicate'],['エラー',d.error_count,'is-error']].forEach(([label,n,c])=>counts.appendChild(node('b',`${label} ${n}`,c)));
  out.appendChild(node('div',`対象: ${config.subjects[String(subject.value)]||'—'}`,'small'));out.appendChild(node('div',`source: ${d.source||'—'}`,'small'));out.appendChild(counts);out.appendChild(node('div',`対象期間: ${d.date_from||'—'} ～ ${d.date_to||'—'}`,'small'));out.appendChild(node('div',`種類別: ${Object.entries(d.type_counts||{}).map(([t,n])=>`${config.types[t]?.label||'その他'} ${n}`).join(' / ')||'なし'}`,'small'));
  d.rows.forEach(x=>{const row=node('div',undefined,`import-preview-row ${x.status}`);if(x.status==='error'){row.append(node('span','—'),node('span',`未対応 / ${x.error}`),node('b','エラー'));}else{const meta=config.types[x.value.log_type]||{icon:'',label:x.value.log_type},promote=promoteIndices.has(Number(x.index));row.append(node('span',x.value.occurred_at),node('span',`${meta.icon} ${meta.label} ${displayValue(x.value)}`),node('b',promote?'離乳食へ更新':x.status==='new'?'新規':'重複'));}out.appendChild(row);});
  if(promotionCount)out.appendChild(node('div',`既存のぴよログ「食事」${promotionCount}件は、同じ時刻の記録を新規追加せず離乳食として上書きします。`,'notice'));
  const media=manifest();if(media.length)out.appendChild(node('div',`📷 記録写真 ${media.length}件（既存写真がある記録は上書きしません）`,'notice'));
  const progress=node('div',undefined,'import-progress');progress.hidden=true;progress.append(node('div','インポート中…','import-progress-label'),node('progress'));out.appendChild(progress);
  const actionable=actualNew>0||promotionCount>0||hasJournal()||Number(d.foods?.new_count||0)>0;
  const button=node('button',actionable?'インポート確定':'写真のみ取り込む');button.type='button';button.disabled=!actionable&&!media.length;button.onclick=()=>withOperation(()=>actionable?runImport(d,button,progress):runPhotoOnly(button,progress));out.appendChild(button);
  const retry=node('button','写真だけ再試行','btn gray');retry.type='button';retry.hidden=true;retry.onclick=()=>withOperation(()=>uploadPhotos(retry,true));out.appendChild(retry);progress.dataset.mediaRetryButton='1';progress._retryButton=retry;
  updateMediaSelection();
}

// Decode and re-encode locally: metadata is not forwarded to private storage.
async function prepareImportPhoto(fileValue){
  if(fileValue.size<=0||fileValue.size>20*1024*1024)throw mediaError('client_file','SOURCE_TOO_LARGE',0,'元画像は20MB以内にしてください。');
  const url=URL.createObjectURL(fileValue),img=new Image();
  try{
    await new Promise((resolve,reject)=>{
      const timer=setTimeout(()=>{img.src='';reject(mediaError('client_decode','DECODE_FAILED',0,'画像の読み込みが完了しませんでした。'));},15000);
      img.onload=()=>{clearTimeout(timer);resolve();};
      img.onerror=()=>{clearTimeout(timer);reject(mediaError('client_decode','DECODE_FAILED',0,'JPEG・PNG・WebP画像を選択してください。'));};
      img.src=url;
    });
    if(!img.naturalWidth||!img.naturalHeight)throw mediaError('client_decode','DECODE_FAILED',0,'画像を読み込めませんでした。');
    const scale=Math.min(1,800/Math.max(img.naturalWidth,img.naturalHeight)),canvas=document.createElement('canvas');
    canvas.width=Math.max(1,Math.round(img.naturalWidth*scale));canvas.height=Math.max(1,Math.round(img.naturalHeight*scale));
    const ctx=canvas.getContext('2d',{alpha:false});if(!ctx)throw mediaError('client_encode','ENCODE_FAILED',0,'画像を変換できませんでした。');
    ctx.fillStyle='#fff';ctx.fillRect(0,0,canvas.width,canvas.height);ctx.drawImage(img,0,0,canvas.width,canvas.height);
    const blob=await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(mediaError('client_encode','ENCODE_FAILED',0,'画像変換が完了しませんでした。')),15000);canvas.toBlob(value=>{clearTimeout(timer);value?resolve(value):reject(mediaError('client_encode','ENCODE_FAILED',0,'画像を変換できませんでした。'));},'image/jpeg',.84);});
    if(blob.type!=='image/jpeg'||blob.size<=0||blob.size>MAX_IMAGE_BYTES)throw mediaError('client_encode','FILE_TOO_LARGE',0,'変換後の画像サイズを確認してください。');
    return blob;
  }finally{img.onload=null;img.onerror=null;URL.revokeObjectURL(url);}
}

async function uploadPhoto(fileValue,target){
  if(fileValue.type&&!IMAGE_TYPES.has(fileValue.type))throw mediaError('client_file','UNSUPPORTED_IMAGE_TYPE',0,'対応していない画像形式です。');
  const blob=await prepareImportPhoto(fileValue);
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),30000);
  let response,data=null;
  try{response=await fetch('/api/family-log-media',{method:'POST',headers:{'content-type':'image/jpeg','x-csrf-token':String(config.csrf||''),'x-family-log-id':String(target.log_id)},body:blob,signal:controller.signal});try{data=await response.json();}catch(error){if(controller.signal.aborted)throw error;}}
  catch(error){if(controller.signal.aborted)throw mediaError('upload_api','UPLOAD_TIMEOUT',0,'送信結果不明です。写真だけ再試行すると保存済みか確認します。');throw error;}
  finally{clearTimeout(timer);}
  if(response.status===409&&data?.error==='PHOTO_ALREADY_EXISTS')return 'existing';
  if(!response.ok||!data?.ok)throw mediaError('upload_api',data?.error||'API_ERROR',response.status,data?.error||`写真アップロードに失敗しました（HTTP ${response.status}）。`);
  return 'uploaded';
}

async function uploadPhotos(button,explicitRetry=false){
  const list=manifest();if(!list.length)return {uploaded:0,existing:0,unselected:0,targetMissing:0,failed:0,uncertain:0};
  const chosen=selectedFiles();
  if(!chosen.size){mediaStatus.textContent=`家族ログは取り込み済みです。記録写真 ${list.length}件は未選択です。写真を選んで「写真だけ再試行」を押してください。`;if(button)button.hidden=false;return {uploaded:0,existing:0,unselected:list.length,targetMissing:0,failed:0,uncertain:0};}
  let resolved;
  try{resolved=await mediaTargets(list.map(item=>item.external_id));}
  catch(error){mediaStatus.textContent=`写真対象の確認に失敗しました（${mediaDiagnostic(error)}）。記録は再インポートしていません。`;throw error;}
  const byId=new Map((resolved.targets||[]).map(target=>[String(target.external_id),target]));
  let uploaded=0,existing=0,unselected=0,targetMissing=0,failed=0,uncertain=0;
  const failureDiagnostics=new Map();
  for(const item of list){
    const selected=chosen.get(item.file_name),target=byId.get(item.external_id);
    if(!selected){unselected++;continue;}
    if(!target){targetMissing++;continue;}
    if(target.has_media){existing++;continue;}
    try{const result=await uploadPhoto(selected,target);result==='uploaded'?uploaded++:existing++;}
    catch(error){if(error instanceof TypeError||error?.mediaCode==='UPLOAD_TIMEOUT'){uncertain++;}else{failed++;const diagnostic=mediaDiagnostic(error);failureDiagnostics.set(diagnostic,(failureDiagnostics.get(diagnostic)||0)+1);}}
  }
  const unresolved=unselected+targetMissing+failed+uncertain;
  const failureSummary=[...failureDiagnostics.entries()].map(([diagnostic,count])=>`${diagnostic} ×${count}`).join('、');
  const summary=`写真: 追加 ${uploaded} / 既存 ${existing} / 未選択 ${unselected} / 対象未解決 ${targetMissing} / 失敗 ${failed}${uncertain?` / 通信結果不明 ${uncertain}`:''}${failureSummary?`（${failureSummary}）`:''}${uncertain?'。通信結果不明の写真は自動再試行していません。再試行時は既存写真を先に確認します。':''}`;
  mediaStatus.textContent=summary;
  if(button)button.hidden=unresolved===0;
  if(unresolved===0)resetMediaSelection(`${summary} / 写真選択をリセットしました。`);
  if(explicitRetry&&unresolved===0)status.textContent='写真の取り込みも完了しました。';
  return {uploaded,existing,unselected,targetMissing,failed,uncertain};
}

async function runPhotoOnly(button,progress){
  const media=manifest();if(!media.length)return;
  const chosen=selectedFiles(),matched=media.filter(item=>chosen.has(item.file_name)).length;
  if(!confirm(`Family Log記録はすべて既存です。記録の再インポートは行わず、記録写真だけ確認・追加します。\n写真指定: ${media.length}件 / 選択済み: ${matched}件\n\n続けますか？`))return;
  button.disabled=true;progress.hidden=false;const label=progress.querySelector('.import-progress-label');label.textContent='既存記録と写真を確認しています…';
  try{await uploadPhotos(button,true);label.textContent='写真確認完了';}
  catch(e){status.textContent=e?.message||'写真を確認できませんでした。';label.textContent='写真確認に失敗しました';button.hidden=false;}
  finally{button.disabled=false;}
}

async function runImport(preview,button,progress){
  const media=manifest(),chosen=selectedFiles(),matched=media.filter(item=>chosen.has(item.file_name)).length,promotionCount=Number(preview.promotion?.promote_count||0),actualNew=Number(preview.actual_new_count||0);
  const warning=preview.error_count>0?`\n\nエラー${preview.error_count}件は取り込まれません。`:'';
  const photoWarning=media.length?`\n記録写真: ${media.length}件指定 / ${matched}件選択${matched<media.length?'（不足分は後から写真だけ追加できます）':''}`:'';
  const detail=`対象: ${config.subjects[String(subject.value)]||'—'}\nsource: ${preview.source}\n対象期間: ${preview.date_from||'—'} ～ ${preview.date_to||'—'}\n全件: ${preview.record_count}\n新規: ${actualNew}\n既存の食事→離乳食へ更新: ${promotionCount}\n重複: ${preview.duplicate_count}\nエラー: ${preview.error_count}\n種類別: ${Object.entries(preview.type_counts||{}).map(([t,n])=>`${config.types[t]?.label||t} ${n}`).join(' / ')}${photoWarning}\n食材: 新規 ${preview.foods?.new_count||0} / 登録済み ${preview.foods?.existing_count||0}（上書きしません）\n育児日記は家族日誌に表示し、家族ログ・成長日記の一覧からは除外します。Googleカレンダーへ自動送信しません。`;
  if(!confirm(`${detail}${warning}\n\n既存のぴよログ食事は同じ記録IDのまま離乳食へ補正します。続けますか？`))return;
  button.disabled=true;progress.hidden=false;const bar=progress.querySelector('progress'),label=progress.querySelector('.import-progress-label'),retry=progress._retryButton||out.querySelector('.btn.gray');
  try{
    let promoted=0;
    if(promotionCount){label.textContent='既存の食事記録を離乳食へ補正しています…';const result=await promotionCall('promotion_apply');promoted=Number(result.promoted_count||0);if(promoted!==promotionCount)throw new Error('離乳食分類の更新対象が変わりました。再度プレビューしてください。');}
    if(actualNew>0||hasJournal()){
      const started=await call({action:'start',subject_id:Number(subject.value),source_filename:file.files[0].name,document:documentValue});lastBatch=Number(started.batch_id);let offset=Number(started.processed_count||0),latest=started;bar.max=started.record_count;
      while(offset<documentValue.records.length){const records=documentValue.records.slice(offset,offset+started.chunk_size);latest=await call({action:'chunk',batch_id:lastBatch,offset,records});offset=Number(latest.processed_count);bar.value=offset;label.textContent=`インポート中… ${offset} / ${latest.record_count}`;await new Promise(resolve=>setTimeout(resolve,0));}
      latest=await call({action:'finish',batch_id:lastBatch});const duplicateOnly=Math.max(0,Number(latest.skipped_count||0)-promoted);label.textContent=`記録完了 ${latest.record_count} / ${latest.record_count}`;status.textContent=`新規 ${latest.imported_count} / 離乳食へ更新 ${promoted} / 重複 ${duplicateOnly} / エラー ${latest.error_count}`;
    }else{label.textContent='既存記録の確認完了';status.textContent=`離乳食へ更新 ${promoted}件。`;}
    if(foods().length){const result=await call({action:'foods_apply',subject_id:Number(subject.value),foods:foods()});status.textContent+=` / 食材 追加 ${result.added}・既存 ${result.existing}`;label.textContent=actualNew>0||hasJournal()||promotionCount>0?'インポート完了':'食材インポート完了';}
    button.textContent='インポート完了';
    if(media.length){label.textContent='記録写真を確認しています…';await uploadPhotos(retry,false);label.textContent='完了';}
  }catch(e){label.textContent='処理を完了できませんでした';status.textContent=`${e?.message||'処理に失敗しました。'} 再度プレビューして状態を確認してください。`;button.textContent='再試行';button.disabled=false;}
}

document.getElementById('importPreview').onclick=()=>withOperation(async()=>{try{const selected=file.files[0];if(!subject.value||!selected)throw new Error('対象とJSONファイルを選択してください。');if(selected.size>config.maxBytes)throw new Error('JSONは3MB以内にしてください。');documentValue=JSON.parse(await selected.text());manifest();if(!Array.isArray(foods()))throw new Error('foodsは配列です。');status.textContent='検証しています…';const d=await call({action:'preview',subject_id:Number(subject.value),document:documentValue});let promotion={promote_count:0,already_baby_food_count:0,ambiguous_count:0,promote_indices:[]};if(String(documentValue?.source||'').trim().toLowerCase()==='piyolog'&&promotionRecords().length)promotion=await promotionCall('promotion_preview');if(Number(promotion.ambiguous_count||0)>0)throw new Error('同じ時刻の既存食事記録が複数あります。誤上書きを防ぐため、該当記録を確認してください。');d.foods=foods().length?await call({action:'foods_preview',subject_id:Number(subject.value),foods:foods()}):{new_count:0,existing_count:0};d.promotion=promotion;renderPreview(d);status.textContent='プレビューを確認してください。DBはまだ変更されていません。';}catch(e){status.textContent=e?.message||'プレビューできませんでした。';out.replaceChildren();documentValue=null;lastPreview=null;}});

for(const control of [file,subject])control.addEventListener('change',()=>{out.replaceChildren();documentValue=null;lastPreview=null;resetMediaSelection();status.textContent='対象・JSONを確認して再度プレビューしてください。';});

document.querySelectorAll('.import-rollback').forEach(button=>button.onclick=async()=>{if(!confirm('未編集のインポート記録だけを取り消します。編集済み記録は残ります。関連する記録写真もFamily Logの既存クリーンアップ規則に従います。続けますか？'))return;try{const d=await call({action:'rollback',batch_id:Number(button.dataset.id)});alert(`取消 ${d.deleted_count}件 / 編集済みのため保持 ${d.edited_count}件`);location.reload();}catch(e){alert(e.message);}});
document.querySelectorAll('.import-time-repair').forEach(button=>button.addEventListener('click',async()=>{try{status.textContent='時刻補正プレビューを取得しています…';const batch_id=Number(button.dataset.id),preview=await call({action:'repair_preview',batch_id}),samples=preview.samples.map(x=>`${x.before} → ${x.after}`).join('\n');status.textContent=preview.target_count?`時刻補正対象 ${preview.target_count}件（編集済み除外 ${preview.skipped_edited_count}件）`:preview.offset_minutes===0?'補正不要です。':'時刻補正の対象はありません。';if(!preview.target_count)return;if(!confirm(`時刻補正プレビュー\n全件: ${preview.total_count??preview.target_count+preview.skipped_edited_count}件\n対象: ${preview.target_count}件\n編集済みのため除外: ${preview.skipped_edited_count}件\n現在timezone: ${preview.timezone}\n補正offset: ${preview.offset_minutes}分\n\n${samples}\n\n適用しますか？`))return;await call({action:'repair_apply',batch_id});location.reload();}catch(e){status.textContent='時刻補正プレビューを取得できませんでした。時間をおいて再度お試しください。';alert(e?.message||'時刻補正に失敗しました。');}}));
document.querySelectorAll('.import-time-repair-rollback').forEach(button=>button.addEventListener('click',async()=>{if(!confirm('この時刻補正だけを元に戻しますか？'))return;try{status.textContent='時刻補正を元に戻しています…';await call({action:'repair_rollback',batch_id:Number(button.dataset.id)});location.reload();}catch(e){status.textContent='時刻補正を元に戻せませんでした。時間をおいて再度お試しください。';alert(e?.message||'時刻補正の取消に失敗しました。');}}));
const resetBox=node('details',undefined,'card');resetBox.appendChild(node('summary','取り込み直す前に全ログを削除'));
resetBox.appendChild(node('p','上で選択した子供の全ログ（手入力・家族日誌の育児日記を含む）と添付写真が対象です。子供の登録・タスク・移動履歴は残ります。確認後に新しく追加されたログは残します。同期済みの成長日記はGoogle側からも削除されます。取り消せません。'));
const resetPreview=node('button','削除対象を確認','btn danger');resetPreview.type='button';resetBox.appendChild(resetPreview);
const resetOut=node('div');resetBox.appendChild(resetOut);out.parentElement.insertAdjacentElement('afterend',resetBox);
resetPreview.onclick=()=>withOperation(async()=>{
  if(!subject.value)throw new Error('上で対象の子供を選択してください。');
  const subjectId=Number(subject.value),preview=await call({action:'reset_preview',subject_id:subjectId});resetOut.replaceChildren();
  resetOut.appendChild(node('p',`${preview.subject_name}: 全ログ ${preview.log_count}件 / 写真 ${preview.photo_count}件 / 食材 ${preview.food_count}件`));
  const label=node('label'),check=node('input');check.type='checkbox';label.append(check,document.createTextNode(' 食材リストも削除する'));resetOut.appendChild(label);
  const text=node('input');text.type='text';text.placeholder=`${preview.subject_name}の全ログを削除`;resetOut.appendChild(node('p',`確認文字「${text.placeholder}」を入力してください。`));resetOut.appendChild(text);
  const apply=node('button','この対象の全ログを削除','btn danger');apply.type='button';resetOut.appendChild(apply);
  apply.onclick=()=>withOperation(async()=>{
    if(Number(subject.value)!==subjectId)throw new Error('対象が変わりました。削除対象を再確認してください。');
    if(text.value!==text.placeholder)throw new Error('確認文字が一致しません。');
    if(!confirm(`${preview.subject_name}のログ ${preview.log_count}件と添付写真${check.checked?'、食材リスト':''}を削除します。実行しますか？`))return;
    let remaining=preview.log_count;
    do{const result=await call({action:'reset_apply',subject_id:subjectId,confirmation:text.value,cutoff:preview.cutoff,batch_cutoff:preview.batch_cutoff,food_cutoff:preview.food_cutoff,delete_foods:check.checked});remaining=result.remaining;status.textContent=`削除中: 残り ${remaining}件`;}while(remaining>0);
    resetOut.replaceChildren(node('p','ログの削除が完了しました。写真は既存の削除キューで処理されます。'));out.replaceChildren();documentValue=null;resetMediaSelection();status.textContent='JSONを選び、再度プレビューしてください。';
  });
});
})();

