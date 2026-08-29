const STATIC_CACHE='familytodo-static-wave128-fix21';
const STATIC_ASSETS=['/manifest.webmanifest','/assets/pwa-192.png','/assets/pwa-512.png','/assets/apple-touch-icon.png'];
self.addEventListener('install',event=>{
  event.waitUntil(caches.open(STATIC_CACHE).then(cache=>cache.addAll(STATIC_ASSETS)).catch(()=>{}));
  self.skipWaiting();
});
self.addEventListener('activate',event=>{
  event.waitUntil((async()=>{
    const names=await caches.keys();
    await Promise.all(names.filter(name=>name.startsWith('familytodo-static-')&&name!==STATIC_CACHE).map(name=>caches.delete(name)));
    await self.clients.claim();
  })());
});
self.addEventListener('fetch',event=>{
  const url=new URL(event.request.url);
  if(event.request.method!=='GET'||url.origin!==self.location.origin)return;
  if(url.pathname.startsWith('/assets/')||url.pathname==='/manifest.webmanifest'){
    event.respondWith((async()=>{
      const cached=await caches.match(event.request);
      const network=fetch(event.request).then(async response=>{
        if(response.ok){const cache=await caches.open(STATIC_CACHE);await cache.put(event.request,response.clone()).catch(()=>{});}
        return response;
      });
      if(cached){event.waitUntil(network.catch(()=>null));return cached;}
      return await network.catch(()=>new Response('',{status:503}));
    })());
  }
});
self.addEventListener('push',event=>{
  let data={};
  try{data=event.data?event.data.json():{};}catch{data={body:event.data?.text?.()||''};}
  const title=String(data.title||'Family TODO LINE');
  const options={
    body:String(data.body||''),
    tag:String(data.tag||'familytodo'),
    icon:'/assets/pwa-192.png',
    badge:'/assets/pwa-192.png',
    data:{url:String(data.url||'/app/tasks.php')}
  };
  event.waitUntil(self.registration.showNotification(title,options));
});
self.addEventListener('notificationclick',event=>{
  event.notification.close();
  const target=new URL(String(event.notification.data?.url||'/app/tasks.php'),self.location.origin).href;
  event.waitUntil((async()=>{
    const windows=await self.clients.matchAll({type:'window',includeUncontrolled:true});
    for(const client of windows){
      if('focus' in client){await client.navigate(target).catch(()=>{});return client.focus();}
    }
    return self.clients.openWindow(target);
  })());
});
