import fs from 'node:fs';
import {spawnSync} from 'node:child_process';
const page=fs.readFileSync('src/messages-chat-page.ts','utf8');
for(const marker of [
  'const PAGE_SIZE=40;',
  'ORDER BY msg.id DESC LIMIT ${PAGE_SIZE+1}',
  "url.searchParams.get('before')",
  "AND msg.id<?",
  "visible=rows.results.slice(0,PAGE_SIZE)",
  'さらに以前のメッセージ',
  '最新のメッセージに戻る',
  'id="chatImage"',
  'id="chatToolImage"',
  '/assets/message-photo-upload.js?v=${APP_VERSION}-photo3',
  '/assets/messages-composer-ui.js',
  'data-updated-at="${esc(r.updated_at)}"',
  'class="chat-photo"',
  'data-photo-share="1"',
  '/assets/messages-chat-diagnostics.js',
  '/assets/messages-chat.js?v=${APP_VERSION}-chat10',
  "${back}${messages||",
]) if(!page.includes(marker)) throw new Error(`messages chat bounded-read contract lost: ${marker}`);
if(page.indexOf('/assets/messages-chat-diagnostics.js')>page.indexOf('/assets/messages-chat.js'))throw new Error('message diagnostics must load before the chat runtime');
if(/performance\.getEntriesByType\('resource'\)[\s\S]{0,300}message-stamps/.test(page))throw new Error('message opening must not wait for stamp hydration before reveal');
if(/SELECT[\s\S]{0,300}FROM tasks/i.test(page)) throw new Error('messages chat must not preload tasks');
if(/MEDIA\.(put|get|delete)/.test(page)) throw new Error('message page must not access R2 directly');
const client=fs.readFileSync('public/assets/messages-chat.js','utf8');
for(const marker of ["post('/api/task-rough-input'","primaryType:'shopping'","draft?.requiresConfirmation!==true","message_updated_at:String(row.dataset.updatedAt||'')","message_original_text:text","item.dueDate","item.dueTime","AIでタスクに追加","diag?.mark('OUTSIDE_TAP')","'CYCLE_2_DONE'","diag?.mark('THUMBNAIL_RESTORED')","await syncMessages(true)","new URL('/api/message-chat-sync',location.origin)","setInterval(()=>{if(!document.hidden)syncMessages(false);},2500)","'IntersectionObserver'in window","stampObserver.unobserve(entry.target)","className='chat-photo-overlay'","className='chat-photo-large'","window.addEventListener('familytodo:message-created'","img.className='chat-photo'","img.dataset.photoShare='1'"]) if(!client.includes(marker)) throw new Error(`messages chat realtime/lazy/media contract lost: ${marker}`);
for(const marker of ["const READ_RETRY_LIMIT=5,READ_RETRY_BASE_MS=2500,READ_RETRY_MAX_MS=30000;","readRetryCount+=1;if(readRetryCount>=READ_RETRY_LIMIT)return;","Math.min(READ_RETRY_MAX_MS,READ_RETRY_BASE_MS*(2**(readRetryCount-1)))","window.addEventListener('online',resumeReadFlush)","if(!document.hidden)resumeReadFlush()","ids.forEach(id=>pendingReads.add(id))"]) if(!client.includes(marker)) throw new Error('message read retry budget contract lost: '+marker);
if(/catch\{ids\.forEach\(id=>pendingReads\.add\(id\)\);\}if\(pendingReads\.size\)readTimer=setTimeout\(flushReads,2500\)/.test(client))throw new Error('message read failures must not retry forever every 2.5 seconds');
if(client.includes("location.href='/app/messages.php'"))throw new Error('message send must not reload the whole chat page');
if(client.includes('preloadFirstFrame')||client.includes('firstFramePreloads'))throw new Error('message stamp runtime must not eagerly preload animation frames');
if(client.includes("action:'convert_shopping',id:Number(row.dataset.messageId),name:String(row.dataset.text||'')")) throw new Error('shopping conversion must not bypass the rough-input draft');
if(/const convertTask=async[\s\S]*?await post\('\/api\/messages',\{action:'convert_task'[\s\S]*?requireConfirmation\(draft\)/.test(client)) throw new Error('task conversion must confirm the draft before mutation');
if(/for\s*\([^)]*frames[^)]*\)[\s\S]{0,200}new Image/.test(client))throw new Error('message stamp optimization must not preload every animation frame');
const syncApi=fs.readFileSync('src/message-chat-sync-api.ts','utf8'),routes=fs.readFileSync('src/context-api-routes.ts','utf8');
for(const marker of ["WHERE msg.family_id=? AND msg.id>? AND (msg.target_member_id IS NULL OR msg.target_member_id IN (?,msg.sender_id)) AND (msg.reminder_at IS NULL OR msg.reminder_at<=? OR msg.sender_id=?)","WHERE msg.family_id=? AND msg.sender_id<>? AND msg.reminder_at IS NOT NULL","AND msg.reminder_at>? AND msg.reminder_at<=?","const byId=new Map<number,SyncRow>();","ORDER BY msg.id ASC LIMIT ${PAGE_SIZE}","cache-control':'private, no-store"]){if(!syncApi.includes(marker))throw new Error(`message sync API contract lost: ${marker}`);}
if(!routes.includes("if(url.pathname==='/api/message-chat-sync') return await messageChatSyncApi(request,context);"))throw new Error('message sync API route wiring lost');
const diagnostic=fs.readFileSync('public/assets/messages-chat-diagnostics.js','utf8');
for(const marker of ["KEY='message-chat-one-shot-v1'","MODES=new Set(['stamp','dismiss'])","STAMP_FETCH_START","FIRST_FRAME_LOADED","CYCLE_2_DONE","OUTSIDE_TAP","FOCUS_RELEASED","TEXT_WAS_PRESENT","TOOLS_WAS_OPEN","SCHEDULE_VALUE_WAS_PRESENT",'伝言本文、スタンプID/URL、画像、token、位置情報は保存しません']) if(!diagnostic.includes(marker)) throw new Error(`message chat diagnostic marker lost: ${marker}`);
if(/fetch\s*\(|XMLHttpRequest|indexedDB|sendBeacon/.test(diagnostic))throw new Error('message chat device diagnostics must not transmit or persist outside short-lived web storage');
if(/latitude|longitude|authorization|bearer|messageId|stampId|thumbnailUrl|fullUrl/i.test(diagnostic))throw new Error('message chat diagnostics must not capture identifiers, URLs, auth or coordinates');
const stampApi=fs.readFileSync('src/message-stamp-api.ts','utf8'),sharedStamps=fs.readFileSync('src/calendar-stamps.ts','utf8');
for(const marker of ["import {calendarStampFramesForAuthorizedAssets} from './calendar-stamps';","const animatedAssetIds=rows.results.filter(row=>row.asset_kind==='ANIMATED'&&row.mime_type==='image/png').map(row=>Number(row.asset_id));",'calendarStampFramesForAuthorizedAssets(context.env,s.familyId,animatedAssetIds)']) if(!stampApi.includes(marker))throw new Error(`message stamp bounded-read optimization lost: ${marker}`);
if(stampApi.includes('calendarStampFramesForAssets(context.env,s.familyId,s.memberId'))throw new Error('message stamp GET must not repeat the active-member D1 read inside frame lookup');
for(const marker of ['export async function calendarStampFramesForAuthorizedAssets(','return readCalendarStampFramesForAuthorizedAssets(env,familyId,assetIds);','export async function calendarStampFramesForAssets(','await assertActiveMember(env,familyId,memberId);','return readCalendarStampFramesForAuthorizedAssets(env,familyId,assetIds);']) if(!sharedStamps.includes(marker))throw new Error(`shared stamp authorization boundary lost: ${marker}`);
const legacyFrameReader=sharedStamps.slice(sharedStamps.indexOf('export async function calendarStampFramesForAssets('));if(!legacyFrameReader.includes('await assertActiveMember(env,familyId,memberId);'))throw new Error('general stamp frame reader must retain active-member authorization');
for(const file of ['public/assets/messages-chat.js','public/assets/messages-chat-diagnostics.js','public/assets/messages-composer-ui.js','public/assets/message-photo-upload.js']){const syntax=spawnSync(process.execPath,['--check',file],{encoding:'utf8'});if(syntax.status!==0)throw new Error(syntax.stderr||`${file} syntax check failed`);}
const composerUi=fs.readFileSync('public/assets/messages-composer-ui.js','utf8');if(!composerUi.includes("classList.toggle('has-text'"))throw new Error('composer send/media state contract lost');
const photoUi=fs.readFileSync('public/assets/message-photo-upload.js','utf8');for(const marker of ["Math.min(1,800/Math.max(image.naturalWidth,image.naturalHeight))","crypto.subtle.digest('SHA-256',await file.arrayBuffer())","body.set('source_sha256',sourceSha256)","window.dispatchEvent(new CustomEvent('familytodo:message-created'"]){if(!photoUi.includes(marker))throw new Error(`photo normalize/hash/no-reload contract lost: ${marker}`);}if(photoUi.includes("location.href='/app/messages.php'"))throw new Error('photo send must not reload the whole chat page');if(photoUi.includes('画像の選択を取り消す'))throw new Error('photo draft must not expose a dedicated cancel button');if(!photoUi.includes("document.addEventListener('pointerdown'"))throw new Error('photo draft outside-tap cancellation contract lost');
const photoApi=fs.readFileSync('src/message-photo-api.ts','utf8'),photoService=fs.readFileSync('src/message-photo-service.ts','utf8');for(const marker of ["form.get('source_sha256')","sourceSha256"]){if(!photoApi.includes(marker))throw new Error(`photo API source hash contract lost: ${marker}`);}for(const marker of ['sourceSha256?:string|null',"customMetadata.sourceSha256=sourceSha256"]){if(!photoService.includes(marker))throw new Error(`photo service source hash contract lost: ${marker}`);}
console.log('messages chat bounded-read/realtime/media/LINE-composer/AI-confirmation/diagnostic/lazy-stamp contract ok');
await import('./message-chat-sync-contract.mjs');
await import('./message-photos-contract.mjs');
await import('./photo-transfer-contract.mjs');
await import('./photo-share-ui-contract.mjs');
const css=fs.readFileSync('public/assets/messages-chat.css','utf8');
if(!css.includes('flex-direction:column-reverse')||page.includes('box.scrollTop=box.scrollHeight')||client.includes('scrollToLatest(true);syncMessages(false)'))throw new Error('chat must start at newest without a delayed initial scroll');

const syncSource=fs.readFileSync('src/message-chat-sync-api.ts','utf8'),style=fs.readFileSync('public/assets/messages-chat.css','utf8');
for(const marker of ['message_stamp_attachments a JOIN calendar_stamp_assets asset','has_stamp'])if(!page.includes(marker)||!syncSource.includes(marker))throw Error('initial and incremental stamp classification diverged');
if(!style.includes('.chat-message.has-stamp .chat-bubble')||!style.includes('.chat-photo{box-sizing:border-box;width:min(56vw,240px)')||!client.includes('item.hasStamp'))throw Error('media hydration changes chat geometry');
