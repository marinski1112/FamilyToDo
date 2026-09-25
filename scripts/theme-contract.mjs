import assert from 'node:assert/strict';
import fs from 'node:fs';
import {Window} from 'happy-dom';
import {loadTs,database,context} from './goods-category-test-support.mjs';

const db=database(),ctx=context(db),{settings}=loadTs('src/settings-root.ts');
const page=async role=>{
  ctx.member={id:1,family_id:1,name:'A',role};
  return (await settings(new Request('https://familytodo.test/app/settings.php'),ctx)).text();
};
const member=await page('MEMBER');
assert.match(member,/id="appearanceTheme"/);
assert.doesNotMatch(member,/href="\/app\/settings_diagnostics.php"/);
assert.doesNotMatch(member,/href="\/app\/logs.php"/);
const admin=await page('OWNER');
assert.match(admin,/href="\/app\/settings_diagnostics.php"/);
assert.match(admin,/href="\/app\/logs.php"/);
assert.match(admin,/id="appearanceTheme"/);

const window=new Window({url:'https://familytodo.test/app/settings.php'});
window.document.body.innerHTML='<select id="appearanceTheme"><option value="LIGHT">ライト</option><option value="DARK">ダーク</option></select><p id="appearanceThemeStatus"></p><meta name="color-scheme" content="light"><meta name="theme-color" content="#4f46e5">';
window.eval(fs.readFileSync('public/assets/theme.js','utf8'));
const control=window.document.getElementById('appearanceTheme');
assert.equal(control.value,'LIGHT');
control.value='DARK';control.dispatchEvent(new window.Event('change'));
assert.equal(window.document.documentElement.dataset.theme,'dark');
assert.equal(window.localStorage.getItem('familytodo.theme'),'DARK');
assert.equal(window.document.querySelector('meta[name="color-scheme"]').content,'dark');
control.value='LIGHT';control.dispatchEvent(new window.Event('change'));
assert.equal(window.localStorage.getItem('familytodo.theme'),'LIGHT');
assert.equal(window.document.documentElement.dataset.theme,'light');
db.close();await window.close();
console.log('light/dark appearance and ordinary member diagnostic visibility: ok');
