(()=>{
'use strict';
const load=(src,onload)=>{const s=document.createElement('script');s.src=src;s.defer=true;if(onload)s.addEventListener('load',onload,{once:true});s.addEventListener('error',()=>console.error('[Family TODO] asset load failed',src),{once:true});document.head.appendChild(s);};
// QUICK actions use their dedicated execute_quick_action handler. Remove the generic
// data-log-type route before the core enhancer binds it so one-tap recording never
// opens the detailed record sheet first.
document.querySelectorAll('.family-log-quick-action[data-log-type]').forEach(button=>button.removeAttribute('data-log-type'));
// Four-character quick labels were outside the legacy Wave128 5-8 character split.
// Normalize 4-8 character labels here before/after the global PWA enhancer without
// double-splitting labels that already contain the intended line break.
document.querySelectorAll('.family-log-quick strong,.family-quick-chore-record strong').forEach(label=>{
  if(label.querySelector('br'))return;
  const chars=Array.from(label.textContent||'');
  if(chars.length<4||chars.length>8)return;
  const splitAt=chars.length===4?2:4;
  label.replaceChildren(document.createTextNode(chars.slice(0,splitAt).join('')),document.createElement('br'),document.createTextNode(chars.slice(splitAt).join('')));
  label.dataset.wave128Label='1';
});
load('/assets/family-log-core.js?v=wave128-fix17',()=>load('/assets/family-log-management-ui.js?v=wave128-fix17'));
})();
