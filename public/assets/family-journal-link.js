(()=>{
  'use strict';
  const head=document.querySelector('.family-log-head');
  if(!head||head.querySelector('a[href="/app/family_journal.php"]'))return;
  const link=document.createElement('a');
  link.className='family-log-journal-link';
  link.href='/app/family_journal.php';
  link.textContent='📘 家族日記';
  const growth=head.querySelector('a[href="/app/child_journal.php"]');
  if(growth)growth.insertAdjacentElement('afterend',link);else head.append(link);
})();
