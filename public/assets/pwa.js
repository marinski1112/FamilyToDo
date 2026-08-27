(()=>{
  if(!('serviceWorker' in navigator))return;
  window.addEventListener('load',()=>{
    navigator.serviceWorker.register('/sw.js',{scope:'/'}).catch(err=>console.warn('[Family TODO] service worker registration failed',err));
  },{once:true});
})();
