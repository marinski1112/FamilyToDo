(()=>{
  'use strict';
  const form=document.getElementById('chatComposer'),button=document.getElementById('chatImage');
  if(!form||!button)return;
  const input=document.createElement('input');input.type='file';input.accept='image/jpeg,image/png,image/webp,image/heic';input.hidden=true;
  const status=document.createElement('p');status.setAttribute('role','status');status.setAttribute('aria-live','polite');
  const remove=document.createElement('button');remove.type='button';remove.textContent='画像の選択を取り消す';remove.hidden=true;
  form.append(input,status,remove);
  let selected=null,normalized=null,capturedAt=0,uploadId='',snapshot='',busy=false;
  const csrf=()=>String(form.querySelector('[name="csrf"]')?.value??'');
  const exifEpoch=async file=>{
    try{
      const bytes=new Uint8Array(await file.slice(0,Math.min(file.size,512*1024)).arrayBuffer());
      if(bytes.length<14||bytes[0]!==0xff||bytes[1]!==0xd8)return 0;
      const view=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);
      for(let p=2;p+4<=bytes.length;){
        if(bytes[p]!==0xff){p++;continue;}const code=bytes[p+1];if(code===0xd9||code===0xda)break;
        if(code===0x00||code===0x01||(code>=0xd0&&code<=0xd8)){p+=2;continue;}
        const len=(bytes[p+2]<<8)|bytes[p+3];if(len<2||p+2+len>bytes.length)break;const start=p+4;
        if(code===0xe1&&len>=14&&String.fromCharCode(...bytes.subarray(start,start+6))==='Exif\0\0'){
          const tiff=start+6,little=bytes[tiff]===0x49&&bytes[tiff+1]===0x49;if(!little&&!(bytes[tiff]===0x4d&&bytes[tiff+1]===0x4d))return 0;
          const u16=o=>o+2<=bytes.length?view.getUint16(o,little):NaN,u32=o=>o+4<=bytes.length?view.getUint32(o,little):NaN;if(u16(tiff+2)!==42)return 0;
          const ifd=rel=>{const map=new Map(),base=tiff+rel,count=u16(base);if(!Number.isInteger(rel)||rel<0||!Number.isInteger(count)||count>512)return map;for(let i=0;i<count;i++){const e=base+2+i*12;if(e+12>bytes.length)break;map.set(u16(e),e);}return map;};
          const ascii=e=>{if(e===undefined||u16(e+2)!==2)return '';const count=u32(e+4);if(!Number.isInteger(count)||count<1||count>128)return '';const pos=count<=4?e+8:tiff+u32(e+8);if(!Number.isInteger(pos)||pos<0||pos+count>bytes.length)return '';return String.fromCharCode(...bytes.subarray(pos,pos+count)).replace(/\0.*$/u,'').trim();};
          const zero=ifd(u32(tiff+4)),ptr=zero.get(0x8769),exif=ptr===undefined?new Map():ifd(u32(ptr+8));const text=ascii(exif.get(0x9003))||ascii(exif.get(0x9004))||ascii(zero.get(0x0132));
          const m=/^(\d{4}):(\d{2}):(\d{2}) (\d{2}):(\d{2}):(\d{2})$/u.exec(text);if(!m)return 0;const off=ascii(exif.get(0x9011)),zone=/^[+-]\d{2}:\d{2}$/u.test(off)?off:'+09:00',ms=Date.parse(`${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:${m[6]}${zone}`);return Number.isFinite(ms)&&ms>0?Math.floor(ms/1000):0;
        }p+=2+len;
      }
    }catch{}return 0;
  };
  button.addEventListener('click',()=>{if(!busy)input.click();});
  input.addEventListener('change',async()=>{
    selected=input.files?.[0]??null;normalized=null;capturedAt=0;uploadId='';snapshot='';form.dataset.photoDraft=selected?'1':'0';
    if(selected&&selected.size>20*1024*1024){selected=null;input.value='';form.dataset.photoDraft='0';remove.hidden=true;status.textContent='元画像は20 MiB以内を選んでください。';return;}
    remove.hidden=!selected;status.textContent=selected?'画像を選択しました。送信時に最大辺800pxへ調整します。':'';
    if(selected)capturedAt=await exifEpoch(selected);
  });
  remove.addEventListener('click',()=>{if(busy)return;selected=null;normalized=null;capturedAt=0;input.value='';form.dataset.photoDraft='0';remove.hidden=true;status.textContent='';});
  async function normalize(file) {
    const url=URL.createObjectURL(file);
    try {
      const image=new Image();image.src=url;await image.decode();
      const scale=Math.min(1,800/Math.max(image.naturalWidth,image.naturalHeight));
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
      const body=new FormData();body.set('file',normalized,'photo.jpg');body.set('caption',caption);body.set('reminder_at',reminder);body.set('upload_id',uploadId);if(capturedAt>0)body.set('captured_at',String(capturedAt));
      status.textContent='画像を送信しています…';
      const response=await fetch('/api/messages?photo=upload',{method:'POST',credentials:'same-origin',headers:{'x-csrf-token':token},body});
      const payload=await response.json();if(!response.ok||!payload.ok)throw new Error();
      if(csrf()===token)location.href='/app/messages.php';
    } catch {status.textContent='送信を確認できませんでした。画像と入力は保持しています。同じ内容で再試行できます。';}
    finally {busy=false;remove.disabled=false;button.disabled=false;}
  },true);
})();
