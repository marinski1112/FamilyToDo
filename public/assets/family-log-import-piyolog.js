(()=>{'use strict';
const payloadEl=document.getElementById('familyLogImportPayload');
if(!payloadEl)return;
const config=JSON.parse(payloadEl.textContent||'{}');
const file=document.getElementById('importFile'),subject=document.getElementById('importSubject'),status=document.getElementById('importStatus'),out=document.getElementById('importPreviewOut');
if(!file||!subject||!status||!out)return;
let documentValue=null,lastBatch=0,lastPreview=null;
const MAX_MEDIA_ITEMS=250,MAX_IMAGE_BYTES=4*1024*1024,IMAGE_TYPES=new Set(['image/jpeg','image/png','image/webp']);

const mediaNotice=document.createElement('div');
mediaNotice.className='notice';
mediaNotice.textContent='ぴよログPDF自体はFamilyToDoへ送信・解析しません。このチャットで変換した標準JSONと、必要に応じて抽出済みの離乳食写真を選択してください。';
file.parentElement?.insertBefore(mediaNotice,file);
const mediaLabel=document.createElement('label');mediaLabel.textContent='離乳食写真（変換データに写真指定がある場合・複数選択可）';
const mediaFiles=document.createElement('input');mediaFiles.id='importMediaFiles';mediaFiles.type='file';mediaFiles.multiple=true;mediaFiles.accept='image/jpeg,image/png,image/webp,.jpg,.jpeg,.png,.webp';
const mediaStatus=document.createElement('div');mediaStatus.id='importMediaStatus';mediaStatus.className='small';mediaStatus.setAttribute('aria-live','polite');
file.insertAdjacentElement('afterend',mediaStatus);file.insertAdjacentElement('afterend',mediaFiles);file.insertAdjacentElement('afterend',mediaLabel);

const call=async payload=>{const r=await fetch('/api/family-log-import',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({csrf:config.csrf,...payload})});const d=await r.json();if(!r.ok||!d.ok)throw new Error(d.error||'処理できませんでした。');return d};
const helperCall=async payload=>{const r=await fetch('/api/family-log-import-media-targets',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({csrf:config.csrf,subject_id:Number(subject.value),...payload})});const d=await r.json().catch(()=>null);if(!r.ok||!d?.ok)throw new Error(d?.error||'ぴよログ補正を確認できませんでした。');return d};
const mediaTargets=externalIds=>helperCall({action:'media_targets',external_ids:externalIds});
const node=(tag,text,className)=>{const e=document.createElement(tag);if(text!==undefined)e.textContent=String(text);if(className)e.className=className;return e};
const displayValue=r=>[r.amount!=null?`${r.amount}${r.unit||''}`:'',r.duration_minutes!=null?`${r.duration_minutes}分`:'',r.value_text||'',r.note||''].filter(Boolean).join(' ・ ');
const cleanName=value=>String(value||'').trim();
const promotionRecords=()=>Array.isArray(documentValue?.records)?documentValue.records.filter(record=>String(record?.log_type||'').toUpperCase()==='MEAL'&&String(record?.detail_code||'').toUpperCase()==='BABY_FOOD'):[];
const promotionCall=action=>helperCall({action,source:String(documentValue?.source||''),records:promotionRecords()});

function manifest(){
  const raw=documentValue?.piyolog_media;
  if(raw==null)return [];
  if(String(documentValue?.source||'').trim().toLowerCase()!=='piyolog')throw new Error('piyolog_mediaはsourceがpiyologの変換データだけで使用できます。');
  if(!Array.isArray(raw)||raw.length>MAX_MEDIA_ITEMS)throw new Error(`離乳食写真指定は${MAX_MEDIA_ITEMS}件以内にしてください。`);
  const records=Array.isArray(documentValue?.records)?documentValue.records:[],recordsById=new Map();
  for(const record of records){const id=cleanName(record?.external_id);if(id)recordsById.set(id,record);}
  const ids=new Set(),names=new Set();
  return raw.map((entry,index)=>{
    if(!entry||typeof entry!=='object'||Array.isArray(entry))throw new Error(`写真指定${index+1}件目が不正です。`);
    const external_id=cleanName(entry.external_id),file_name=cleanName(entry.file_name);
    if(!external_id||external_id.length>255||!file_name||file_name.length>255||/[\\/]/.test(file_name))throw new Error(`写真指定${index+1}件目の参照IDまたはファイル名が不正です。`);
    if(ids.has(external_id))throw new Error(`同じ離乳食記録に複数の写真指定があります: ${external_id}`);
    if(names.has(file_name))throw new Error(`同じ写真ファイル名が重複しています: ${file_name}`);
    const record=recordsById.get(external_id);
    if(!record||String(record.log_type||'').toUpperCase()!=='MEAL'||String(record.detail_code||'').toUpperCase()!=='BABY_FOOD')throw new Error(`写真指定に対応する離乳食記録がありません: ${external_id}`);
    ids.add(external_id);names.add(file_name);return {external_id,file_name};
  });
}
function selectedFiles(){const map=new Map();for(const selected of Array.from(mediaFiles.files||[]))map.set(selected.name,selected);return map;}
function updateMediaSelection(){try{const list=manifest(),chosen=selectedFiles(),matched=list.filter(item=>chosen.has(item.file_name)).length;mediaStatus.textContent=list.length?`離乳食写真 ${list.length}件指定 / 選択済み ${matched}件${matched<list.length?'（不足分は記録だけ取り込み、あとから写真だけ再試行できます）':''}`:'このJSONには離乳食写真の指定はありません。';}catch(e){mediaStatus.textContent=e.message;}}
mediaFiles.addEventListener('change',updateMediaSelection);

function renderPreview(d){
  lastPreview=d;out.replaceChildren();
  const promoteIndices=new Set(d.promotion?.promote_indices||[]),promotionCount=Number(d.promotion?.promote_count||0),actualNew=Math.max(0,Number(d.new_count||0)-promotionCount);d.actual_new_count=actualNew;
  const counts=node('div',undefined,'import-counts');[['全件',d.record_count,''],['新規',actualNew,'is-new'],['離乳食へ更新',promotionCount,'is-new'],['重複',d.duplicate_count,'is-duplicate'],['エラー',d.error_count,'is-error']].forEach(([label,n,c])=>counts.appendChild(node('b',`${label} ${n}`,c)));
  out.appendChild(node('div',`対象: ${config.subjects[String(subject.value)]||'—'}`,'small'));out.appendChild(node('div',`source: ${d.source||'—'}`,'small'));out.appendChild(counts);out.appendChild(node('div',`対象期間: ${d.date_from||'—'} ～ ${d.date_to||'—'}`,'small'));out.appendChild(node('div',`種類別: ${Object.entries(d.type_counts||{}).map(([t,n])=>`${config.types[t]?.label||'その他'} ${n}`).join(' / ')||'なし'}`,'small'));
  d.rows.forEach(x=>{const row=node('div',undefined,`import-preview-row ${x.status}`);if(x.status==='error'){row.append(node('span','—'),node('span',`未対応 / ${x.error}`),node('b','エラー'));}else{const meta=config.types[x.value.log_type]||{icon:'',label:x.value.log_type},promote=promoteIndices.has(Number(x.index));row.append(node('span',x.value.occurred_at),node('span',`${meta.icon} ${meta.label} ${displayValue(x.value)}`),node('b',promote?'離乳食へ更新':x.status==='new'?'新規':'重複'));}out.appendChild(row);});
  if(promotionCount)out.appendChild(node('div',`既存のぴよログ「食事」${promotionCount}件は、同じ時刻の記録を新規追加せず離乳食として上書きします。`,'notice'));
  const media=manifest();if(media.length)out.appendChild(node('div',`📷 離乳食写真 ${media.length}件（既存写真がある記録は上書きしません）`,'notice'));
  const progress=node('div',undefined,'import-progress');progress.hidden=true;progress.append(node('div','インポート中…','import-progress-label'),node('progress'));out.appendChild(progress);
  const actionable=actualNew>0||promotionCount>0;
  const button=node('button',actualNew>0?'インポート確定':promotionCount>0?'離乳食分類を更新':'写真のみ取り込む');button.type='button';button.disabled=!actionable&&!media.length;button.onclick=()=>actionable?runImport(d,button,progress):runPhotoOnly(button,progress);out.appendChild(button);
  const retry=node('button','写真だけ再試行','btn gray');retry.type='button';retry.hidden=true;retry.onclick=()=>uploadPhotos(retry,true);out.appendChild(retry);progress.dataset.mediaRetryButton='1';progress._retryButton=retry;
  updateMediaSelection();
}

async function uploadPhoto(fileValue,target){
  if(!IMAGE_TYPES.has(fileValue.type))throw new Error('対応していない画像形式です。');
  if(fileValue.size<=0||fileValue.size>MAX_IMAGE_BYTES)throw new Error('画像は4MB以内にしてください。');
  const response=await fetch('/api/family-log-media',{method:'POST',headers:{'content-type':fileValue.type,'x-csrf-token':String(config.csrf||''),'x-family-log-id':String(target.log_id)},body:fileValue});
  let data=null;try{data=await response.json();}catch{}
  if(response.status===409&&data?.error==='PHOTO_ALREADY_EXISTS')return 'existing';
  if(!response.ok||!data?.ok)throw new Error(data?.error||`写真アップロードに失敗しました（HTTP ${response.status}）。`);
  return 'uploaded';
}

async function uploadPhotos(button,explicitRetry=false){
  const list=manifest();if(!list.length)return {uploaded:0,existing:0,missing:0,failed:0,uncertain:0};
  const chosen=selectedFiles();
  if(!chosen.size){mediaStatus.textContent=`家族ログは取り込み済みです。離乳食写真 ${list.length}件は未選択です。写真を選んで「写真だけ再試行」を押してください。`;if(button)button.hidden=false;return {uploaded:0,existing:0,missing:list.length,failed:0,uncertain:0};}
  const resolved=await mediaTargets(list.map(item=>item.external_id)),byId=new Map((resolved.targets||[]).map(target=>[String(target.external_id),target]));
  let uploaded=0,existing=0,missing=0,failed=0,uncertain=0;
  for(const item of list){
    const selected=chosen.get(item.file_name),target=byId.get(item.external_id);
    if(!selected||!target){missing++;continue;}
    if(target.has_media){existing++;continue;}
    try{const result=await uploadPhoto(selected,target);result==='uploaded'?uploaded++:existing++;}
    catch(error){if(error instanceof TypeError){uncertain++;}else{failed++;}}
  }
  const unresolved=missing+failed+uncertain;
  mediaStatus.textContent=`写真: 追加 ${uploaded} / 既存 ${existing} / 未選択・対象なし ${missing} / 失敗 ${failed}${uncertain?` / 通信結果不明 ${uncertain}`:''}${uncertain?'。通信結果不明の写真は自動再試行していません。再試行時は既存写真を先に確認します。':''}`;
  if(button)button.hidden=unresolved===0;
  if(explicitRetry&&unresolved===0)status.textContent='写真の取り込みも完了しました。';
  return {uploaded,existing,missing,failed,uncertain};
}

async function runPhotoOnly(button,progress){
  const media=manifest();if(!media.length)return;
  const chosen=selectedFiles(),matched=media.filter(item=>chosen.has(item.file_name)).length;
  if(!confirm(`Family Log記録はすべて既存です。記録の再インポートは行わず、離乳食写真だけ確認・追加します。\n写真指定: ${media.length}件 / 選択済み: ${matched}件\n\n続けますか？`))return;
  button.disabled=true;progress.hidden=false;const label=progress.querySelector('.import-progress-label');label.textContent='既存記録と写真を確認しています…';
  try{await uploadPhotos(button,true);label.textContent='写真確認完了';}
  catch(e){status.textContent=e?.message||'写真を確認できませんでした。';label.textContent='写真確認に失敗しました';button.hidden=false;}
  finally{button.disabled=false;}
}

async function runImport(preview,button,progress){
  const media=manifest(),chosen=selectedFiles(),matched=media.filter(item=>chosen.has(item.file_name)).length,promotionCount=Number(preview.promotion?.promote_count||0),actualNew=Number(preview.actual_new_count||0);
  const warning=preview.error_count>0?`\n\nエラー${preview.error_count}件は取り込まれません。`:'';
  const photoWarning=media.length?`\n離乳食写真: ${media.length}件指定 / ${matched}件選択${matched<media.length?'（不足分は後から写真だけ追加できます）':''}`:'';
  const detail=`対象: ${config.subjects[String(subject.value)]||'—'}\nsource: ${preview.source}\n対象期間: ${preview.date_from||'—'} ～ ${preview.date_to||'—'}\n全件: ${preview.record_count}\n新規: ${actualNew}\n既存の食事→離乳食へ更新: ${promotionCount}\n重複: ${preview.duplicate_count}\nエラー: ${preview.error_count}\n種類別: ${Object.entries(preview.type_counts||{}).map(([t,n])=>`${config.types[t]?.label||t} ${n}`).join(' / ')}${photoWarning}`;
  if(!confirm(`${detail}${warning}\n\n既存のぴよログ食事は同じ記録IDのまま離乳食へ補正します。続けますか？`))return;
  button.disabled=true;progress.hidden=false;const bar=progress.querySelector('progress'),label=progress.querySelector('.import-progress-label'),retry=progress._retryButton||out.querySelector('.btn.gray');
  try{
    let promoted=0;
    if(promotionCount){label.textContent='既存の食事記録を離乳食へ補正しています…';const result=await promotionCall('promotion_apply');promoted=Number(result.promoted_count||0);if(promoted!==promotionCount)throw new Error('離乳食分類の更新対象が変わりました。再度プレビューしてください。');}
    if(actualNew>0){
      const started=await call({action:'start',subject_id:Number(subject.value),source_filename:file.files[0].name,document:documentValue});lastBatch=Number(started.batch_id);let offset=Number(started.processed_count||0),latest=started;bar.max=started.record_count;
      while(offset<documentValue.records.length){const records=documentValue.records.slice(offset,offset+started.chunk_size);latest=await call({action:'chunk',batch_id:lastBatch,offset,records});offset=Number(latest.processed_count);bar.value=offset;label.textContent=`インポート中… ${offset} / ${latest.record_count}`;await new Promise(resolve=>setTimeout(resolve,0));}
      latest=await call({action:'finish',batch_id:lastBatch});const duplicateOnly=Math.max(0,Number(latest.skipped_count||0)-promoted);label.textContent=`記録完了 ${latest.record_count} / ${latest.record_count}`;status.textContent=`新規 ${latest.imported_count} / 離乳食へ更新 ${promoted} / 重複 ${duplicateOnly} / エラー ${latest.error_count}`;
    }else{label.textContent='離乳食分類の更新完了';status.textContent=`離乳食へ更新 ${promoted}件。新しいFamily Log記録は追加していません。`;}
    button.textContent='記録完了';
    if(media.length){label.textContent='離乳食写真を確認しています…';await uploadPhotos(retry,false);label.textContent='完了';}
  }catch(e){label.textContent='処理を完了できませんでした';status.textContent=`${e?.message||'処理に失敗しました。'} 再度プレビューして状態を確認してください。`;button.textContent='再試行';button.disabled=false;}
}

document.getElementById('importPreview').onclick=async()=>{try{const selected=file.files[0];if(!subject.value||!selected)throw new Error('対象とJSONファイルを選択してください。');if(selected.size>config.maxBytes)throw new Error('JSONは3MB以内にしてください。');documentValue=JSON.parse(await selected.text());manifest();status.textContent='検証しています…';const d=await call({action:'preview',subject_id:Number(subject.value),document:documentValue});let promotion={promote_count:0,already_baby_food_count:0,ambiguous_count:0,promote_indices:[]};if(String(documentValue?.source||'').trim().toLowerCase()==='piyolog'&&promotionRecords().length)promotion=await promotionCall('promotion_preview');if(Number(promotion.ambiguous_count||0)>0)throw new Error('同じ時刻の既存食事記録が複数あります。誤上書きを防ぐため、該当記録を確認してください。');d.promotion=promotion;renderPreview(d);status.textContent='プレビューを確認してください。DBはまだ変更されていません。';}catch(e){status.textContent=e?.message||'プレビューできませんでした。';out.replaceChildren();documentValue=null;lastPreview=null;}};

document.querySelectorAll('.import-rollback').forEach(button=>button.onclick=async()=>{if(!confirm('未編集のインポート記録だけを取り消します。編集済み記録は残ります。関連する離乳食写真もFamily Logの既存クリーンアップ規則に従います。続けますか？'))return;try{const d=await call({action:'rollback',batch_id:Number(button.dataset.id)});alert(`取消 ${d.deleted_count}件 / 編集済みのため保持 ${d.edited_count}件`);location.reload();}catch(e){alert(e.message);}});
document.querySelectorAll('.import-time-repair').forEach(button=>button.addEventListener('click',async()=>{try{status.textContent='時刻補正プレビューを取得しています…';const batch_id=Number(button.dataset.id),preview=await call({action:'repair_preview',batch_id}),samples=preview.samples.map(x=>`${x.before} → ${x.after}`).join('\n');status.textContent=preview.target_count?`時刻補正対象 ${preview.target_count}件（編集済み除外 ${preview.skipped_edited_count}件）`:preview.offset_minutes===0?'補正不要です。':'時刻補正の対象はありません。';if(!preview.target_count)return;if(!confirm(`時刻補正プレビュー\n全件: ${preview.total_count??preview.target_count+preview.skipped_edited_count}件\n対象: ${preview.target_count}件\n編集済みのため除外: ${preview.skipped_edited_count}件\n現在timezone: ${preview.timezone}\n補正offset: ${preview.offset_minutes}分\n\n${samples}\n\n適用しますか？`))return;await call({action:'repair_apply',batch_id});location.reload();}catch(e){status.textContent='時刻補正プレビューを取得できませんでした。時間をおいて再度お試しください。';alert(e?.message||'時刻補正に失敗しました。');}}));
document.querySelectorAll('.import-time-repair-rollback').forEach(button=>button.addEventListener('click',async()=>{if(!confirm('この時刻補正だけを元に戻しますか？'))return;try{status.textContent='時刻補正を元に戻しています…';await call({action:'repair_rollback',batch_id:Number(button.dataset.id)});location.reload();}catch(e){status.textContent='時刻補正を元に戻せませんでした。時間をおいて再度お試しください。';alert(e?.message||'時刻補正の取消に失敗しました。');}}));
})();