import fs from 'node:fs';
import {spawnSync} from 'node:child_process';
const page=fs.readFileSync('src/messages-chat-page.ts','utf8');
for(const marker of [
  'const PAGE_SIZE=40;',
  'ORDER BY msg.id DESC LIMIT ${PAGE_SIZE+1}',
  "url.searchParams.get('before')",
  "AND msg.id<?",
  "rows.results.slice(0,PAGE_SIZE).reverse()",
  'さらに以前のメッセージ',
  '最新のメッセージに戻る',
  'id="chatImage" disabled',
  'みてにゃとのメディア保存設計を確定するまで保留',
  'data-updated-at="${esc(r.updated_at)}"',
  '/assets/messages-chat-diagnostics.js',
]) if(!page.includes(marker)) throw new Error(`messages chat bounded-read contract lost: ${marker}`);
if(page.indexOf('/assets/messages-chat-diagnostics.js')>page.indexOf('/assets/messages-chat.js'))throw new Error('message diagnostics must load before the chat runtime');
if(/SELECT[\s\S]{0,300}FROM tasks/i.test(page)) throw new Error('messages chat must not preload tasks');
if(/MEDIA\.(put|get|delete)/.test(page)) throw new Error('message image storage must remain deferred until Mitenya media design is settled');
const client=fs.readFileSync('public/assets/messages-chat.js','utf8');
for(const marker of [
  "post('/api/task-rough-input'",
  "primaryType:'shopping'",
  "draft?.requiresConfirmation!==true",
  "message_updated_at:String(row.dataset.updatedAt||'')",
  "message_original_text:text",
  "item.dueDate",
  "item.dueTime",
  "AIでタスクに追加",
  "diag?.mark('OUTSIDE_TAP')",
  "'CYCLE_2_DONE'",
  "diag?.mark('THUMBNAIL_RESTORED')",
  "stampTimers.set(img,setTimeout(()=>{stampTimers.delete(img);img.src=stamp.thumbnailUrl||frames[0].url;diag?.mark('THUMBNAIL_RESTORED');},duration))",
]) if(!client.includes(marker)) throw new Error(`messages chat AI/diagnostic contract lost: ${marker}`);
if(client.includes("action:'convert_shopping',id:Number(row.dataset.messageId),name:String(row.dataset.text||'')")) throw new Error('shopping conversion must not bypass the rough-input draft');
if(/const convertTask=async[\s\S]*?await post\('\/api\/messages',\{action:'convert_task'[\s\S]*?requireConfirmation\(draft\)/.test(client)) throw new Error('task conversion must confirm the draft before mutation');
const diagnostic=fs.readFileSync('public/assets/messages-chat-diagnostics.js','utf8');
for(const marker of [
  "KEY='message-chat-one-shot-v1'",
  "MODES=new Set(['stamp','dismiss'])",
  "STAMP_FETCH_START",
  "FIRST_FRAME_LOADED",
  "CYCLE_2_DONE",
  "OUTSIDE_TAP",
  "FOCUS_RELEASED",
  "TEXT_WAS_PRESENT",
  "TOOLS_WAS_OPEN",
  "SCHEDULE_VALUE_WAS_PRESENT",
  '伝言本文、スタンプID/URL、画像、token、位置情報は保存しません',
]) if(!diagnostic.includes(marker)) throw new Error(`message chat diagnostic marker lost: ${marker}`);
if(/fetch\s*\(|XMLHttpRequest|indexedDB|sendBeacon/.test(diagnostic))throw new Error('message chat device diagnostics must not transmit or persist outside short-lived web storage');
if(/latitude|longitude|authorization|bearer|messageId|stampId|thumbnailUrl|fullUrl/i.test(diagnostic))throw new Error('message chat diagnostics must not capture identifiers, URLs, auth or coordinates');
for(const file of ['public/assets/messages-chat.js','public/assets/messages-chat-diagnostics.js']){
  const syntax=spawnSync(process.execPath,['--check',file],{encoding:'utf8'});if(syntax.status!==0)throw new Error(syntax.stderr||`${file} syntax check failed`);
}
console.log('messages chat bounded-read/media-hold/AI-confirmation/LIFF-diagnostic contract ok');