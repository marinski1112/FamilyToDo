(()=>{
'use strict';
const load=(src,onload)=>{const s=document.createElement('script');s.src=src;s.defer=true;if(onload)s.addEventListener('load',onload,{once:true});s.addEventListener('error',()=>console.error('[Family TODO] asset load failed',src),{once:true});document.head.appendChild(s);};
load('/assets/family-log-core.js?v=wave128-fix17',()=>load('/assets/family-log-management-ui.js?v=wave128-fix17'));
})();
