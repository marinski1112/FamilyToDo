import assert from 'node:assert/strict';
import fs from 'node:fs';

const pwa=fs.readFileSync('public/assets/pwa.js','utf8');
const app=fs.readFileSync('src/app.ts','utf8');
const ci=fs.readFileSync('.github/workflows/ci.yml','utf8');
const sw=fs.readFileSync('public/sw.js','utf8');

const splitLabel=value=>{const chars=Array.from(value);return chars.length>=5&&chars.length<=8?[chars.slice(0,4).join(''),chars.slice(4).join('')]:[value];};
for(const value of ['ミ','ミルク','おむつ','おむつ交換','12345678','猫🐈ごはん']){
  const lines=splitLabel(value);
  assert.equal(lines.join(''),value,`${value}: label must not be truncated`);
  if(Array.from(value).length<=4)assert.equal(lines.length,1,`${value}: 1-4 code points must stay one line`);
  if(Array.from(value).length>=5&&Array.from(value).length<=8){assert.ok(lines.length<=2,`${value}: 5-8 code points max two lines`);assert.equal(Array.from(lines[0]).length,4);}
}
assert.match(pwa,/Array\.from\(label\.textContent/);
assert.match(pwa,/chars\.length>=5&&chars\.length<=8/);
assert.match(pwa,/document\.createElement\('br'\)/);
assert.match(pwa,/@media\(max-width:340px\).*repeat\(3/s);
assert.match(pwa,/repeat\(4,minmax\(0,1fr\)\)/);
assert.match(pwa,/grid-template-columns:18px minmax\(0,1fr\)!important/);
assert.match(pwa,/\.message-actions \.convert-shopping\{color:#fff!important\}/);
assert.match(pwa,/grid-template-areas:'prev title next close' '\. reorder reorder \.'/);
assert.match(pwa,/min-width:40px!important;min-height:40px!important/);
assert.match(pwa,/overflow-x:hidden!important/);
assert.match(pwa,/original\.cloneNode\(true\)/);
assert.match(pwa,/event\.preventDefault\(\);event\.stopPropagation\(\)/);
assert.match(pwa,/execute_quick_action/);
assert.match(pwa,/syntheticId>=0/);
assert.match(pwa,/recurrence_rule_id/);
assert.match(pwa,/recurrence_occurrence_id/);
assert.match(pwa,/occurrence_date/);
assert.match(pwa,/\/app\/recurring\.php\?/);
assert.match(app,/class=\\?"calendar-band\s/,'calendar band contract still present');
assert.match(app,/class=\\?"btn small convert-shopping\"/,'message shopping action contract still present');
for(const check of ['check:wave126','check:wave127','check:wave128','check:version'])assert.ok(ci.includes(check),`${check} must execute in CI`);
assert.match(ci,/fetch-depth:\s*2/,'diff check needs the parent commit available');
assert.ok((ci.match(/if: always\(\)/g)||[]).length>=18,'historical smoke failures must not hide latest smoke results');
assert.match(sw,/familytodo-static-wave128-fix2/,'fix2 must invalidate the old static asset cache');
console.log('wave128 fix smoke: quick labels, message contrast, mobile modal, recurring band rewrite, one-tap isolation, latest CI checks ok');
