(()=>{
'use strict';
const payload=JSON.parse(document.getElementById('familyBrandingPayload')?.textContent||'{}');
const csrf=String(payload.csrf||'');
const form=document.getElementById('familyBrandingNameForm');
const input=document.getElementById('familyBrandingIconFile');
const save=document.getElementById('familyBrandingIconSave');
const reset=document.getElementById('familyBrandingIconReset');
const preview=document.getElementById('familyBrandingIconPreview');
const status=document.getElementById('familyBrandingStatus');
const sizes=[180,192,512];
let selectedFile=null;
let sourceUrl='';

const setStatus=(message,isError=false)=>{
  if(!status)return;
  status.textContent=message;
  status.style.color=isError?'#b91c1c':'';
};
const setBusy=busy=>{
  if(save)save.disabled=busy;
  if(reset)reset.disabled=busy;
  if(input)input.disabled=busy;
  if(form)Array.from(form.elements).forEach(el=>{el.disabled=busy;});
};
const readJson=async response=>{
  const data=await response.json().catch(()=>({ok:false,error:`HTTP ${response.status}`}));
  if(!response.ok||data.ok===false)throw new Error(data.error||`HTTP ${response.status}`);
  return data;
};
const loadImage=file=>new Promise((resolve,reject)=>{
  const url=URL.createObjectURL(file);
  const image=new Image();
  image.onload=()=>resolve({image,url});
  image.onerror=()=>{URL.revokeObjectURL(url);reject(new Error('画像を読み込めませんでした。別の写真を選んでください。'));};
  image.src=url;
});
const canvasBlob=(image,size)=>new Promise((resolve,reject)=>{
  const width=Number(image.naturalWidth||image.width||0),height=Number(image.naturalHeight||image.height||0);
  if(!width||!height){reject(new Error('画像サイズを確認できませんでした。'));return;}
  const side=Math.min(width,height),sx=(width-side)/2,sy=(height-side)/2;
  const canvas=document.createElement('canvas');canvas.width=size;canvas.height=size;
  const ctx=canvas.getContext('2d',{alpha:true});
  if(!ctx){reject(new Error('画像処理を開始できませんでした。'));return;}
  ctx.drawImage(image,sx,sy,side,side,0,0,size,size);
  canvas.toBlob(blob=>blob?resolve(blob):reject(new Error('PNG画像を生成できませんでした。')),'image/png');
});

if(input)input.addEventListener('change',async()=>{
  const file=input.files?.[0]||null;
  selectedFile=file;
  if(sourceUrl){URL.revokeObjectURL(sourceUrl);sourceUrl='';}
  if(!file){setStatus('');return;}
  if(file.size>20*1024*1024){selectedFile=null;input.value='';setStatus('元画像は20MB以下を選んでください。',true);return;}
  try{
    const loaded=await loadImage(file);sourceUrl=loaded.url;
    if(preview)preview.src=sourceUrl;
    setStatus('画像を選択しました。「アイコンを保存」を押すと中央を正方形に切り抜きます。');
  }catch(error){selectedFile=null;input.value='';setStatus(error instanceof Error?error.message:String(error),true);}
});

if(form)form.addEventListener('submit',async event=>{
  event.preventDefault();setBusy(true);setStatus('表示名を保存しています…');
  try{
    const displayName=String(new FormData(form).get('display_name')||'');
    await readJson(await fetch('/api/pwa-branding',{method:'POST',credentials:'same-origin',headers:{'content-type':'application/json'},body:JSON.stringify({csrf,display_name:displayName})}));
    setStatus('表示名を保存しました。ホーム画面へ反映するには、既存アイコンを一度削除して再追加してください。');
  }catch(error){setStatus(error instanceof Error?error.message:String(error),true);}finally{setBusy(false);}
});

if(save)save.addEventListener('click',async()=>{
  if(!selectedFile){setStatus('先に写真または画像を選んでください。',true);return;}
  setBusy(true);setStatus('アイコン画像を準備しています…');
  try{
    const loaded=await loadImage(selectedFile);
    try{
      for(const size of sizes){
        setStatus(`アイコンを保存しています… ${size}×${size}`);
        const blob=await canvasBlob(loaded.image,size);
        if(blob.size>4*1024*1024)throw new Error(`${size}×${size} PNGが4MBを超えました。別の画像を選んでください。`);
        await readJson(await fetch(`/api/pwa-icon?size=${size}`,{method:'POST',credentials:'same-origin',headers:{'content-type':'image/png','x-csrf-token':csrf},body:blob}));
      }
    }finally{URL.revokeObjectURL(loaded.url);}
    const revision=Date.now();
    if(preview)preview.src=`/app-icon-180.png?v=${revision}`;
    if(reset)reset.hidden=false;
    selectedFile=null;if(input)input.value='';
    if(sourceUrl){URL.revokeObjectURL(sourceUrl);sourceUrl='';}
    setStatus('アイコンを保存しました。iPhoneの既存ホーム画面アイコンは一度削除し、Safariから「ホーム画面に追加」をやり直すと新しいアイコンになります。');
  }catch(error){setStatus(error instanceof Error?error.message:String(error),true);}finally{setBusy(false);}
});

if(reset)reset.addEventListener('click',async()=>{
  if(!confirm('この家族のホーム画面アイコンを標準アイコンに戻しますか？'))return;
  setBusy(true);setStatus('標準アイコンに戻しています…');
  try{
    await readJson(await fetch('/api/pwa-icon',{method:'DELETE',credentials:'same-origin',headers:{'x-csrf-token':csrf}}));
    if(preview)preview.src=`/app-icon-180.png?v=${Date.now()}`;
    reset.hidden=true;setStatus('標準アイコンに戻しました。iPhoneではホーム画面から一度削除して再追加してください。');
  }catch(error){setStatus(error instanceof Error?error.message:String(error),true);}finally{setBusy(false);}
});
})();