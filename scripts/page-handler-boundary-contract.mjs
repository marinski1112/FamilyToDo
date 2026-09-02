import fs from 'node:fs';

const routes=fs.readFileSync('src/page-routes.ts','utf8');
if(routes.includes("from './app'")) throw new Error('page-routes.ts must not import page handlers directly from giant app.ts');

const boundaries={
  'src/core-pages.ts':['loginPage','createFamilyPage','invitePage','home','today','tomorrow'],
  'src/task-pages.ts':['taskEvents','recurring','taskView','taskEdit','itemEdit'],
  'src/calendar-page.ts':['calendar'],
  'src/messages-pages.ts':['messages','messageNew'],
  'src/shopping-pages.ts':['shopping','shoppingNew','shoppingEdit'],
  'src/family-log-page.ts':['familyLog'],
  'src/settings-pages.ts':['settings','settingsContent','settingsDiagnostics','settingsMembers','settingsNotifications'],
};
for(const [file,names] of Object.entries(boundaries)){
  const source=fs.readFileSync(file,'utf8');
  if(!source.includes("from './app'")) throw new Error(`${file} must remain an explicit transitional app.ts boundary until its domain implementation is extracted`);
  for(const name of names){
    if(!source.includes(name)) throw new Error(`${file} lost page handler ${name}`);
  }
}

for(const module of ['./core-pages','./task-pages','./calendar-page','./messages-pages','./shopping-pages','./family-log-page','./settings-pages']){
  if(!routes.includes(`from '${module}'`)) throw new Error(`page-routes.ts missing domain boundary ${module}`);
}

console.log('page handler domain boundary contract ok');
