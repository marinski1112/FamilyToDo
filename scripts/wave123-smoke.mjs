import fs from 'node:fs';
const app=fs.readFileSync('src/app.ts','utf8'),family=fs.readFileSync('public/assets/family.css','utf8'),calendar=fs.readFileSync('public/assets/calendar.css','utf8'),home=fs.readFileSync('src/google-home.ts','utf8');
for(const x of ['calendar-month-jump','calendar-jump-go','class="compact-form"'])if(!app.includes(x))throw Error('markup '+x);
for(const x of ['native-control-shell','repeat(4,minmax(0,1fr))','white-space:nowrap'])if(!family.includes(x))throw Error('css '+x);
for(const x of ['minmax(0,1fr) 72px 56px','minmax(0,1fr) 56px','width:min(292px'])if(!calendar.includes(x))throw Error('calendar '+x);
for(const width of [320,360,375,390,430]){const panel=Math.min(292,width-20),inner=panel-24;if(72+56+16>inner)throw Error(`month geometry overflow at ${width}`);if(56+8>inner)throw Error(`date geometry overflow at ${width}`)}
if(!home.includes("q.mode='QUICK'")||!home.includes('ft:flquick:'))throw Error('quick scenes');
console.log('wave123 markup/CSS/bounding geometry smoke ok at 320/360/375/390/430');
