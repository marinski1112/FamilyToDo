import fs from 'node:fs';

const boundary=fs.readFileSync('src/task-visibility.ts','utf8');
for(const marker of ['taskVisibilitySql','taskChildVisibilitySql','activityLogVisibilitySql','canAccessTask',"from './app'"]){
  if(!boundary.includes(marker)) throw new Error(`task visibility boundary lost marker: ${marker}`);
}

const expectations=[
  ['src/task-api.ts',['taskVisibilitySql']],
  ['src/item-api.ts',['taskVisibilitySql']],
  ['src/new-entry-pages.ts',['taskVisibilitySql','taskChildVisibilitySql']],
  ['src/activity-log-page.ts',['activityLogVisibilitySql']],
];
for(const [file,names] of expectations){
  const source=fs.readFileSync(file,'utf8');
  if(!source.includes("from './task-visibility'")) throw new Error(`${file} must consume the retained task visibility boundary`);
  for(const name of names){
    if(!source.includes(name)) throw new Error(`${file} lost visibility behavior marker: ${name}`);
  }
  const directAppImport=source.split('\n').find(line=>line.includes("from './app'")&&names.some(name=>line.includes(name)));
  if(directAppImport) throw new Error(`${file} must not reach into app.ts directly for task visibility: ${directAppImport}`);
}

console.log('task visibility retained boundary contract ok');
