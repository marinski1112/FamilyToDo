import {readFileSync} from 'node:fs';

const source=readFileSync('public/assets/calendar-mobile-ui.js','utf8');
const requireText=(needle,label)=>{if(!source.includes(needle))throw new Error(`calendar mobile detail activation missing ${label}: ${needle}`);};
const forbidText=(needle,label)=>{if(source.includes(needle))throw new Error(`calendar mobile detail activation forbids ${label}: ${needle}`);};

requireText("if(el.tagName==='A'&&matchMedia('(max-width:600px)').matches&&el.hasAttribute('href'))",'mobile schedule anchor handling');
requireText("el.setAttribute('aria-label',text);",'schedule accessible label');
requireText("showPreview(schedule,touch||null);",'touch press preview');
requireText("showPreview(schedule,event);",'pointer press preview');
requireText("document.addEventListener('touchend',event=>{",'touch completion');
requireText("if(!preview&&!scheduleTarget(event.target))return;\n    event.stopPropagation();\n    clearPreview();",'schedule touch completion isolation');
requireText("document.addEventListener('click',event=>{",'click completion');
forbidText("el.removeAttribute('href')",'schedule href removal');
forbidText("el.setAttribute('role','button')",'anchor role replacement');
forbidText("event.preventDefault();event.stopPropagation();clearPreview();",'touch navigation suppression');
forbidText("event.preventDefault();\n    event.stopPropagation();\n    clearPreview();",'touch default suppression');
forbidText("event.preventDefault();event.stopPropagation();\n  },{capture:true});",'click navigation suppression');
console.log('calendar mobile detail activation contract: ok');
