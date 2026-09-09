(()=>{
  'use strict';
  const form=document.getElementById('familyLogForm'),panel=document.getElementById('journalPhotoPanel');
  if(!form||!panel)return;
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
