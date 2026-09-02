(()=>{
'use strict';
const load=(src,onload)=>{const s=document.createElement('script');s.src=src;s.defer=true;if(onload)s.addEventListener('load',onload,{once:true});s.addEventListener('error',()=>console.error('[Family TODO] asset load failed',src),{once:true});document.head.appendChild(s);};
// QUICK actions use their dedicated execute_quick_action handler. Remove the generic
// data-log-type route before the core enhancer binds it so one-tap recording never
// opens the detailed record sheet first.
document.querySelectorAll('.family-log-quick-action[data-log-type]').forEach(button=>button.removeAttribute('data-log-type'));
// Wave128's final four-column rule wins the stylesheet cascade on 320px devices.
// Restore the established narrow-screen fallback without changing wider layouts.
const narrowGridStyle=document.createElement('style');
narrowGridStyle.textContent='@media(max-width:340px){.family-log-quick-grid,.family-quick-chore-grid,.family-log-overview-group .family-log-quick-grid{grid-template-columns:repeat(3,minmax(0,1fr))}}.family-log-quick strong.family-log-label-nowrap,.family-quick-chore-record strong.family-log-label-nowrap{white-space:nowrap!important;overflow-wrap:normal!important;word-break:keep-all!important}';
document.head.appendChild(narrowGridStyle);
// Four-character labels such as おしっこ fit the quick-action tile and should stay
// on one line. Mark them as already normalized so the global PWA enhancer does not
// touch them. Longer 5-8 character labels retain the established 4+remainder split.
document.querySelectorAll('.family-log-quick strong,.family-quick-chore-record strong').forEach(label=>{
  if(label.querySelector('br'))return;
  const chars=Array.from(label.textContent||'');
  if(chars.length<4||chars.length>8)return;
  label.dataset.wave128Label='1';
  if(chars.length===4){label.classList.add('family-log-label-nowrap');return;}
  label.replaceChildren(document.createTextNode(chars.slice(0,4).join('')),document.createElement('br'),document.createTextNode(chars.slice(4).join('')));
});
load('/assets/family-log-core.js?v=wave128-fix18',()=>load('/assets/family-log-management-ui.js?v=wave128-fix18'));
})();
