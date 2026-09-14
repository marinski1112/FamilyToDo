(()=>{
'use strict';
const paths=new Set(['/app/family_log.php','/app/child_journal.php','/app/family_journal.php','/app/child_foods.php']);
if(!paths.has(location.pathname))return;

const esc=value=>String(value??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
const links=[
  ['/app/child_journal.php','📓 成長日記'],
  ['/app/family_journal.php','📘 家族日記'],
  ['/app/child_foods.php','🥕 食材リスト'],
  ['/app/family_log.php?dashboard=1#familyLogSummary','📊 まとめ'],
];

const page=document.querySelector('.family-log-page');
const head=document.querySelector('.family-log-head')||page?.querySelector('.family-log-subject-head');
if(head&&!head.querySelector('a[href="/app/family_journal.php"]')){
  const link=document.createElement('a');
  link.className='family-log-journal-link';
  link.dataset.journalKind='family';
  link.href='/app/family_journal.php';
  link.textContent='📘 家族日記';
  const growth=head.querySelector('a[href="/app/child_journal.php"]');
  const settings=head.querySelector('a[href="/app/settings_family_log.php"]');
  if(growth)growth.insertAdjacentElement('afterend',link);else if(settings)head.insertBefore(link,settings);else head.appendChild(link);
}

const ensureNav=()=>{
  let nav=document.querySelector('.family-log-bottom-journal');
  if(!nav){
    nav=document.createElement('nav');
    nav.className='family-log-bottom-journal family-log-persistent-journal';
    nav.setAttribute('aria-label','家族ログメニュー');
    document.body.appendChild(nav);
  }
  nav.classList.add('family-log-persistent-journal');
  const existing=new Map([...nav.querySelectorAll('a[href]')].map(a=>[new URL(a.href,location.origin).pathname,a]));
  for(const [href,label] of links){
    const target=new URL(href,location.origin);
    let anchor=existing.get(target.pathname);
    if(!anchor){anchor=document.createElement('a');nav.appendChild(anchor);existing.set(target.pathname,anchor);}
    anchor.href=href;anchor.textContent=label;
    const active=target.pathname===location.pathname&&(target.pathname!=='/app/family_log.php'||target.searchParams.has('dashboard'));
    anchor.classList.toggle('active',active);
    if(active)anchor.setAttribute('aria-current','page');else anchor.removeAttribute('aria-current');
  }
  document.documentElement.classList.add('family-log-persistent-nav-ready');
};

const style=document.createElement('style');
style.textContent=`
.family-log-persistent-journal{display:grid!important;grid-template-columns:repeat(4,minmax(0,1fr));gap:0;background:rgba(255,255,255,.96);border-top:1px solid #e5e7eb;box-shadow:0 -2px 12px rgba(0,0,0,.06);z-index:95}
.family-log-persistent-journal>a{display:flex!important;align-items:center;justify-content:center;min-width:0;padding:9px 4px;color:#6b7280;text-decoration:none;font-size:12px;font-weight:700;white-space:nowrap}
.family-log-persistent-journal>a.active,.family-log-persistent-journal>a[aria-current="page"]{color:#4f46e5}
.family-log-growth-day{margin-top:14px!important;padding:12px!important}
.family-log-growth-day h2{margin:0 0 8px;font-size:17px}
.family-log-growth-entry{display:grid;grid-template-columns:minmax(0,1fr) 84px;gap:10px;padding:10px 0;border-top:1px solid #e5e7eb}
.family-log-growth-entry:first-of-type{border-top:0}
.family-log-growth-copy{min-width:0;overflow-wrap:anywhere}
.family-log-growth-copy strong{display:block;margin-bottom:4px}
.family-log-growth-copy p{margin:0;white-space:pre-wrap;font-size:14px;color:#4b5563}
.family-log-growth-photo{width:84px;height:84px;object-fit:cover;border-radius:10px;background:#f3f4f6}
.family-log-growth-subject{font-size:12px;color:#6b7280;margin-bottom:4px}
@media(max-width:720px){
  .family-log-persistent-journal{position:fixed!important;left:0;right:0;bottom:var(--nav-box-h,72px);height:40px;padding:0 env(safe-area-inset-right,0) 0 env(safe-area-inset-left,0)}
  .family-log-persistent-nav-ready .wrap{padding-bottom:calc(var(--nav-box-h,72px) + 58px)!important}
  .family-log-persistent-journal>a{padding:5px 2px;font-size:11px}
}
`;
document.head.appendChild(style);
setTimeout(ensureNav,0);setTimeout(ensureNav,250);setTimeout(ensureNav,700);

const loadMedia=async logId=>{
  try{
    const response=await fetch(`/api/family-log-media?log=${encodeURIComponent(logId)}`,{credentials:'same-origin',cache:'no-store',headers:{accept:'application/json'}});
    if(!response.ok)return 0;
    const data=await response.json();const id=Number(data?.media?.id||0);
    return data?.ok&&Number.isSafeInteger(id)&&id>0?id:0;
  }catch{return 0;}
};

const appendGrowthForSelectedDay=async()=>{
  if(location.pathname!=='/app/family_log.php'||!page||page.querySelector('.family-log-growth-day'))return;
  let payload={};try{payload=JSON.parse(document.getElementById('familyLogPayload')?.textContent||'{}');}catch{return;}
  const date=String(payload.selectedDate||'');if(!/^\d{4}-\d{2}-\d{2}$/.test(date))return;
  const allSubjects=Array.isArray(payload.subjects)?payload.subjects:[];const selectedId=Number(payload.selectedSubject||0);
  const subjects=allSubjects.filter(subject=>{const kind=String(subject?.subject_kind||'').toUpperCase(),id=Number(subject?.id||0);return id>0&&(kind==='BABY'||kind==='CHILD')&&(!selectedId||id===selectedId);});
  if(!subjects.length)return;
  const found=[];
  await Promise.all(subjects.map(async subject=>{
    try{
      const response=await fetch(`/app/child_journal.php?month=${encodeURIComponent(date.slice(0,7))}&subject_id=${encodeURIComponent(Number(subject.id))}`,{credentials:'same-origin',cache:'no-store',headers:{accept:'text/html'}});
      if(!response.ok)return;const doc=new DOMParser().parseFromString(await response.text(),'text/html');
      for(const article of doc.querySelectorAll('.journal-photo-row')){
        if(article.querySelector('time')?.getAttribute('datetime')!==date)continue;
        const button=article.querySelector('[data-journal-photo]');const logId=Number(button?.getAttribute('data-journal-photo')||0);
        const title=String(article.querySelector('.journal-entry-text strong')?.textContent||'成長記録').trim();const note=String(article.querySelector('.journal-entry-text p')?.textContent||'').trim();
        const mediaId=logId>0?await loadMedia(logId):0;found.push({subject:String(subject.name||''),title,note,mediaId});
      }
    }catch{/* ordinary Family Log remains available */}
  }));
  if(!found.length)return;
  const section=document.createElement('section');section.className='card family-log-growth-day';section.setAttribute('aria-label','この日の成長記録');
  section.innerHTML=`<h2>📓 この日の成長記録</h2>${found.map(item=>`<article class="family-log-growth-entry"><div class="family-log-growth-copy">${item.subject?`<div class="family-log-growth-subject">${esc(item.subject)}</div>`:''}<strong>${esc(item.title)}</strong>${item.note?`<p>${esc(item.note)}</p>`:''}</div>${item.mediaId?`<img class="family-log-growth-photo" src="/api/family-log-media?media=${item.mediaId}" alt="${esc(item.subject||'成長記録')}の写真" loading="lazy">`:'<span></span>'}</article>`).join('')}`;
  const nav=document.querySelector('.family-log-bottom-journal');if(nav&&nav.parentElement===page)page.insertBefore(section,nav);else page.appendChild(section);
};
void appendGrowthForSelectedDay();
})();