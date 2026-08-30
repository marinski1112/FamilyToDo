import fs from 'node:fs';import path from 'node:path';
const files=[];function walk(dir){for(const e of fs.readdirSync(dir,{withFileTypes:true})){const p=path.join(dir,e.name);if(e.isDirectory())walk(p);else if(/\.(ts|js|html)$/.test(e.name))files.push(p)}}walk('src');
let count=0;for(const file of files){const text=fs.readFileSync(file,'utf8');count+=(text.match(/type=["'](?:date|time|datetime-local)["']/g)||[]).length}
const app=fs.readFileSync('src/app.ts','utf8'),index=fs.readFileSync('src/index.ts','utf8'),css=fs.readFileSync('public/assets/family.css','utf8');
if(!app.includes('const compactBody=body.replace')||!app.includes('native-control-shell'))throw Error('layout must wrap every temporal input');
for(const rule of ['padding:0!important','min-width:0!important','::-webkit-date-and-time-value'])if(!css.includes(rule))throw Error('missing canonical rule '+rule);
for(const primitive of ['.field-pair','.date-range-grid','.compact-actions'])if(!css.includes(primitive))throw Error('missing shared compact form primitive '+primitive);
for(const rule of ['height:40px;min-height:40px','font-size:16px','grid-template-columns:repeat(4,minmax(0,1fr))','@media(max-width:340px)','repeat(3,minmax(0,1fr))'])if(!css.includes(rule))throw Error('missing compact form layout rule '+rule);
if(!index.includes('date-option-row date-range-grid task-date-row')||!app.includes('date-option-row date-range-grid'))throw Error('task new/edit date pair missing');
if(!count)throw Error('audit found no temporal controls');console.log(`form control contract ok: ${count} date/time/datetime-local inputs across ${files.length} source files`);
