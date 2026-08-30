import assert from 'node:assert/strict';
import fs from 'node:fs';

const messages=fs.readFileSync('public/assets/messages.js','utf8');

assert.match(messages,/document\.querySelectorAll\('\.delete-message'\).*b\.disabled=true/s,'message delete must prevent duplicate destructive submits while the request is in flight');
assert.match(messages,/const d=await r\.json\(\)\.catch\(\(\)=>null\)/,'message delete must tolerate non-JSON transport responses');
assert.match(messages,/if\(!r\.ok\|\|!d\?\.ok\)throw new Error\(d\?\.error\|\|'削除に失敗しました'\)/,'message delete must treat HTTP/API failures as failures');
assert.match(messages,/catch\(err\)\{alert\(err instanceof Error&&err\.message\?err\.message:'削除に失敗しました'\);b\.disabled=false;/,'message delete failure must restore the action and surface a useful error');
assert.match(messages,/location\.reload\(\);\}catch/,'message delete success must preserve the existing reload behavior');

console.log('message delete error contract: transport errors are contained and retry remains possible');
