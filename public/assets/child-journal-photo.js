(()=>{
  'use strict';
  const form=document.getElementById('familyLogForm'),panel=document.getElementById('journalPhotoPanel');
  if(!form||!panel)return;
  // Retrieve only visible thumbnails through the existing authenticated media API.
  // Photo failure leaves the ordinary attachment button usable.
  const loadThumbnail=async button=>{
    const id=Number(button.dataset.journalPhoto);
    if(!Number.isSafeInteger(id)||id<=0)return;
    const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),8000);
    try{
      const response=await fetch(`/api/family-log-media?log=${id}`,{credentials:'same-origin',cache:'no-store',headers:{accept:'application/json'},signal:controller.signal});
      if(!response.ok)return;
      const data=await response.json(),mediaId=Number(data?.media?.id);
      if(!data?.ok||!Number.isSafeInteger(mediaId)||mediaId<=0)return;
      const image=document.createElement('img');image.alt='日記の写真';image.src=`/api/family-log-media?media=${mediaId}`;
      image.addEventListener('load',()=>button.replaceChildren(image),{once:true});
    }catch{/* The existing photo button remains the fallback. */}finally{clearTimeout(timer);}
  };
  if('IntersectionObserver' in window){
    const observer=new IntersectionObserver(entries=>{
      entries.forEach(entry=>{if(entry.isIntersecting){observer.unobserve(entry.target);void loadThumbnail(entry.target);}});
    });
    document.querySelectorAll('[data-journal-photo]').forEach(button=>observer.observe(button));
    window.addEventListener('pagehide',()=>observer.disconnect(),{once:true});
  }
  document.querySelectorAll('[data-journal-photo]').forEach(button=>button.addEventListener('click',()=>{
    if(form.querySelector('button[type="submit"]')?.disabled)return;
    form.reset();
    form.elements.namedItem('id').value=button.dataset.journalPhoto;
    document.getElementById('journalPhotoTitle').textContent=button.getAttribute('aria-label');
    panel.hidden=false;
    form.dispatchEvent(new Event('family-log-fields-ready'));
    panel.scrollIntoView({block:'start'});
    document.getElementById('familyLogMediaInput')?.focus({preventScroll:true});
  }));
  document.getElementById('journalPhotoClose')?.addEventListener('click',()=>{
    if(form.querySelector('button[type="submit"]')?.disabled)return;
    const id=form.elements.namedItem('id').value;
    form.reset();panel.hidden=true;
    document.querySelector(`[data-journal-photo="${id}"]`)?.focus();
  });
})();
