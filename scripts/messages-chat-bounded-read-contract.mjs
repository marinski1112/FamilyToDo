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
]) if(!page.includes(marker)) throw new Error(`messages chat bounded-read contract lost: ${marker}`);
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
]) if(!client.includes(marker)) throw new Error(`messages chat AI confirmation contract lost: ${marker}`);
if(client.includes("action:'convert_shopping',id:Number(row.dataset.messageId),name:String(row.dataset.text||'')")) throw new Error('shopping conversion must not bypass the rough-input draft');
if(/const convertTask=async[\s\S]*?await post\('\/api\/messages',\{action:'convert_task'[\s\S]*?requireConfirmation\(draft\)/.test(client)) throw new Error('task conversion must confirm the draft before mutation');
const syntax=spawnSync(process.execPath,['--check','public/assets/messages-chat.js'],{encoding:'utf8'});if(syntax.status!==0)throw new Error(syntax.stderr||'messages-chat.js syntax check failed');
console.log('messages chat bounded-read/media-hold/AI-confirmation contract ok');