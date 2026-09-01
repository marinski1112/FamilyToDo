import assert from 'node:assert/strict';
import fs from 'node:fs';

const messages=fs.readFileSync('public/assets/messages.js','utf8');
const serviceWorker=fs.readFileSync('public/sw.js','utf8');

assert.match(messages,/document\.querySelectorAll\('\.delete-message'\).*b\.disabled=true/s,'message delete must prevent duplicate destructive submits while the request is in flight');
assert.match(messages,/const d=await r\.json\(\)\.catch\(\(\)=>null\)/,'message delete must tolerate non-JSON transport responses');
assert.match(messages,/if\(!r\.ok\|\|!d\?\.ok\)throw new Error\('削除に失敗しました'\)/,'message delete must treat HTTP/API failures as failures without surfacing arbitrary server detail');
assert.match(messages,/catch\([^)]*\)\{alert\('削除に失敗しました'\);b\.disabled=false;/,'message delete failure must restore the action and surface fixed browser-safe error text');
assert.match(messages,/location\.reload\(\);\}catch/,'message delete success must preserve the existing reload behavior');
assert.doesNotMatch(messages,/throw new Error\(d\?\.error|alert\([^\n]*\.message/,'message delete must not forward raw API or exception detail to the browser');
assert.match(serviceWorker,/const STATIC_CACHE='familytodo-static-[^']+'/,'message delete asset delivery must remain under the rotating Family TODO static-cache namespace');
assert.match(serviceWorker,/name\.startsWith\('familytodo-static-'\)&&name!==STATIC_CACHE/,'service worker must retire superseded Family TODO static caches so updated assets are delivered');

console.log('message delete error contract: transport errors are contained, retry remains possible, browser detail is fixed, and static cache rotation remains active');
