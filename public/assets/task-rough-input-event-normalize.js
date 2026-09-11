(() => {
'use strict';
try{
  const form=document.getElementById('taskForm'),button=document.getElementById('roughPreviewButton'),input=document.getElementById('roughMainInput');
  if(!form||!button||!input)return;
  const dateOnly=/^(?:\d{4}[\/.\-])?\d{1,2}[\/.\-]\d{1,2}$|^\d{1,2}\s*月\s*\d{1,2}\s*日$/u;
  const normalizeEventText=text=>{
    const lines=String(text||'').replace(/\r\n?/g,'\n').split('\n'),out=[];
    let changed=false;
    for(let i=0;i<lines.length;i++){
      const current=lines[i].trim(),next=i+1<lines.length?lines[i+1].trim():'';
      if(current&&dateOnly.test(current)&&next&&!dateOnly.test(next)){
        out.push(next,`期限: ${current}`);i++;changed=true;continue;
      }
      out.push(lines[i]);
    }
    return changed?out.join('\n'):String(text||'');
  };
  button.addEventListener('click',()=>{
    const primary=String(form.querySelector('[name=rough_primary_type]:checked')?.value||'task');
    if(primary!=='event')return;
    const original=input.value,normalized=normalizeEventText(original);
    if(normalized===original)return;
    input.value=normalized;
    input.dispatchEvent(new Event('input',{bubbles:true}));
    const restore=()=>{if(input.value===normalized){input.value=original;input.dispatchEvent(new Event('input',{bubbles:true}));}};
    const observer=new MutationObserver(()=>{if(!button.disabled){observer.disconnect();restore();}});
    observer.observe(button,{attributes:true,attributeFilter:['disabled']});
    setTimeout(()=>{observer.disconnect();if(!button.disabled)restore();},50000);
  },true);
  document.documentElement.dataset.taskRoughEventNormalize='ready';
}catch{document.documentElement.dataset.taskRoughEventNormalize='error';}
})();