(()=>{
  'use strict';
  const form=document.getElementById('chatComposer'),button=document.getElementById('chatImage');
  if(!form||!button)return;
  const input=document.createElement('input');input.type='file';input.accept='image/jpeg,image/png,image/webp,image/heic';input.hidden=true;
  const status=document.createElement('p');status.setAttribute('role','status');status.setAttribute('aria-live','polite');
  const remove=document.createElement('button');remove.type='button';remove.textContent='画像の選択を取り消す';remove.hidden=true;
  form.append(input,status,remove);
  let selected=null,normalized=null,uploadId='',snapshot='',busy=false;
  const csrf=()=>String(form.querySelector('[name="csrf"]')?.value??'');
  button.addEventListener('click',()=>{if(!busy)input.click();});
  input.addEventListener('change',()=>{
    selected=input.files?.[0]??null;normalized=null;uploadId='';snapshot='';
    if(selected&&selected.size>20*1024*1024){selected=null;input.value='';status.textContent='元画像は20 MiB以内を選んでください。';return;}
    remove.hidden=!selected;status.textContent=selected?'画像を選択しました。送信時にサイズを調整します。':'';
  });
  remove.addEventListener('click',()=>{if(busy)return;selected=null;normalized=null;input.value='';remove.hidden=true;status.textContent='';});
  async function normalize(file) {
    const url=URL.createObjectURL(file);
    try {
      const image=new Image();image.src=url;await image.decode();
      const scale=Math.min(1,2048/Math.max(image.naturalWidth,image.naturalHeight));
      const canvas=document.createElement('canvas');canvas.width=Math.max(1,Math.round(image.naturalWidth*scale));canvas.height=Math.max(1,Math.round(image.naturalHeight*scale));
      const ctx=canvas.getContext('2d');if(!ctx)throw new Error();ctx.fillStyle='#fff';ctx.fillRect(0,0,canvas.width,canvas.height);ctx.drawImage(image,0,0,canvas.width,canvas.height);
      const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/jpeg',0.88));
      if(!blob||blob.size>4*1024*1024)throw new Error();return blob;
    } finally {URL.revokeObjectURL(url);}
  }
  form.addEventListener('submit',async event=>{
    if(!selected)return;
    event.preventDefault();event.stopImmediatePropagation();if(busy)return;
    busy=true;remove.disabled=true;button.disabled=true;
    const token=csrf(),caption=String(form.querySelector('textarea')?.value??'').trim(),reminder=String(document.getElementById('chatScheduleAt')?.value??'');
    const current=JSON.stringify([caption,reminder]);if(snapshot!==current||!uploadId){snapshot=current;uploadId=crypto.randomUUID();}
    try {
      status.textContent='画像を準備しています…';normalized??=await normalize(selected);
      if(csrf()!==token)throw new Error();
      const body=new FormData();body.set('file',normalized,'photo.jpg');body.set('caption',caption);body.set('reminder_at',reminder);body.set('upload_id',uploadId);
      status.textContent='画像を送信しています…';
      const response=await fetch('/api/messages?photo=upload',{method:'POST',credentials:'same-origin',headers:{'x-csrf-token':token},body});
      const payload=await response.json();if(!response.ok||!payload.ok)throw new Error();
      if(csrf()===token)location.href='/app/messages.php';
    } catch {status.textContent='送信を確認できませんでした。画像と入力は保持しています。同じ内容で再試行できます。';}
    finally {busy=false;remove.disabled=false;button.disabled=false;}
  },true);
})();
