import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

// Exercise the real gesture, viewport, polling and history handlers with a
// deterministic clock and Maps adapter. No location or provider calls are made.
class Target{
  listeners=new Map();style={setProperty(k,v){this[k]=v;}};attributes={};open=false;offsetHeight=54;clientHeight=600;
  addEventListener(name,fn){this.listeners.set(name,[...(this.listeners.get(name)||[]),fn]);}
  async emit(name,event={}){for(const fn of this.listeners.get(name)||[])await fn(event);}
  setAttribute(k,v){this.attributes[k]=v;}
  getBoundingClientRect(){return {top:0,height:this.open?400:54};}
  setPointerCapture(){}focus(){this.focused=true;}
}
const root=new Target(),sheet=new Target(),handle=new Target(),win=new Target(),doc=new Target(),refresh=new Target(),home=new Target();
root.querySelector=()=>sheet;sheet.querySelector=()=>handle;
const nav={getBoundingClientRect:()=>({top:600})};doc.querySelector=()=>nav;doc.hidden=false;
win.innerHeight=700;win.visualViewport=new Target();win.visualViewport.height=700;win.visualViewport.offsetTop=0;
let timerId=0,requests=[],lines=[],mapLoads=0;
const timers=new Map();
const maps={Map:class{fitBounds(){this.fitted=true;}},LatLngBounds:class{extend(){}},Polyline:class{constructor(value){lines.push(value);}setMap(){}}};
const context=vm.createContext({root,sheet,window:win,document:doc,navigator:{onLine:true},refreshEl:refresh,homeEtaEl:home,
  refreshTimer:null,currentSharedMembers:new Set([1]),historyMemberId:0,historyGeneration:0,historyLines:[],mapsKey:'fixture',mapsMapId:'',map:null,mapEl:{hidden:true},mapStateEl:{hidden:false},
  load:async refocus=>{requests.push(refocus);},requestHomeEta:async()=>{},setStatus:()=>{},
  loadGoogleMaps:async()=>{mapLoads++;return maps;},validPoint:p=>({lat:p.latitude,lng:p.longitude}),
  setTimeout:(fn,delay)=>{timers.set(++timerId,{fn,delay});return timerId;},clearTimeout:id=>timers.delete(id),
});
context.clearHistory=()=>{context.historyGeneration++;context.historyMemberId=0;context.historyLines=[];};
const source=fs.readFileSync('public/assets/location.js','utf8');
vm.runInContext(source.slice(source.indexOf("  const sheet=root.querySelector(")).replace(/\}\)\(\);\s*$/,''),context);
assert.equal(root.style['--location-viewport-height'],'600px');
assert.equal(handle.attributes['aria-expanded'],'false');
await handle.emit('pointerdown',{button:0,pointerId:1,clientY:560});
await handle.emit('pointermove',{pointerId:1,clientY:380});
assert.equal(sheet.open,true);assert.equal(sheet.style.height,'234px','sheet follows the drag');
await handle.emit('pointerup',{pointerId:1,clientY:380});
let prevented=false;await handle.emit('click',{preventDefault(){prevented=true;}});
assert.equal(prevented,true);assert.equal(sheet.open,true);assert.equal(sheet.style.height,'');
await handle.emit('pointerdown',{button:0,pointerId:2,clientY:250});
await handle.emit('pointerup',{pointerId:2,clientY:360});
assert.equal(sheet.open,false);assert.equal(handle.attributes['aria-expanded'],'false');
await handle.emit('pointerdown',{button:0,pointerId:3,clientY:550});
await handle.emit('pointermove',{pointerId:3,clientY:300});await handle.emit('pointercancel');assert.equal(sheet.open,false);
sheet.open=true;await sheet.emit('keydown',{key:'Escape'});assert.equal(sheet.open,false);assert.equal(handle.focused,true);
await win.emit('pageshow');assert.equal(timers.size,1);assert.equal([...timers.values()][0].delay,60000);
doc.hidden=true;await doc.emit('visibilitychange');assert.equal(timers.size,0);
doc.hidden=false;const before=requests.length;await doc.emit('visibilitychange');assert.equal(requests.length,before+1);
await win.emit('pageshow');await win.emit('offline');assert.equal(timers.size,0);
await refresh.emit('click');assert.equal(requests.at(-1),true,'manual refresh refocuses the map');
await win.emit('pagehide');assert.equal(timers.size,0);
const points=[{latitude:35,longitude:139,recordedAt:'2026-09-06T01:00:00Z'},{latitude:35.1,longitude:139,recordedAt:'2026-09-06T01:10:00Z'},{latitude:35.2,longitude:139,recordedAt:'2026-09-06T05:00:00Z'}];
await root.emit('family-location-history',{detail:{memberId:2,points}});assert.equal(mapLoads,0,'unshared members cannot render history');
await root.emit('family-location-history',{detail:{memberId:1,points}});assert.equal(lines.length,1);assert.equal(lines[0].path.length,2,'do not connect long recording gaps');
let release;context.loadGoogleMaps=()=>new Promise(resolve=>{release=()=>resolve(maps);});
const pending=root.emit('family-location-history',{detail:{memberId:1,points}});
await root.emit('family-location-history',{detail:{memberId:0,points:[]}});release();await pending;
assert.equal(lines.length,1,'clearing during Maps loading must not revive a trail');
context.loadGoogleMaps=async()=>maps;
await root.emit('family-location-members',{detail:{members:[{memberId:2,sharingEnabled:true}]}});
await root.emit('family-location-history',{detail:{memberId:2,points}});
assert.equal(lines.length,2,'history own member lookup must synchronize authorization before drawing');
await root.emit('family-location-members',{detail:{members:[]}});
assert.equal(context.historyMemberId,0,'sharing revocation still clears history');
console.log('location sheet: drag/cancel/Escape, viewport, visible polling and shared-history race contracts passed');
