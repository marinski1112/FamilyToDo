import assert from 'node:assert/strict';
import fs from 'node:fs';

const messages=fs.readFileSync('public/assets/messages.js','utf8');
const serviceWorker=fs.readFileSync('public/sw.js','utf8');

assert.match(messages,/document\.querySelectorAll\('\.delete-message'\).*b\.disabled=true/s,'message delete must prevent duplicate destructive submits while the request is in flight');
assert.match(messages,/const d=await r\.json\(\)\.catch\(\(\)=>null\)/,'message delete must tolerate non-JSON transport responses');
assert.match(messages,/if\(!r\.ok\|\|!d\?\.ok\)throw new Error\(d\?\.error\|\|'削除に失敗しました'\)/,'message delete must treat HTTP/API failures as failures');
assert.match(messages,/catch\(err\)\{alert\(err instanceof Error&&err\.message\?err\.message:'削除に失敗しました'\);b\.disabled=false;/,'message delete failure must restore the action and surface a useful error');
assert.match(messages,/location\.reload\(\);\}catch/,'message delete success must preserve the existing reload behavior');
assert.match(serviceWorker,/const STATIC_CACHE='familytodo-static-message-delete-error-handling'/,'message delete asset changes must rotate the static cache so the fix is delivered on the first post-deploy visit');

console.log('message delete error contract: transport errors are contained, retry remains possible, and the updated asset is not hidden by the previous cache namespace');
