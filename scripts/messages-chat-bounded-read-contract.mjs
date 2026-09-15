import fs from 'node:fs';
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
]) if(!page.includes(marker)) throw new Error(`messages chat bounded-read contract lost: ${marker}`);
if(/SELECT[\s\S]{0,300}FROM tasks/i.test(page)) throw new Error('messages chat must not preload tasks');
if(/MEDIA\.(put|get|delete)/.test(page)) throw new Error('message image storage must remain deferred until Mitenya media design is settled');
console.log('messages chat bounded-read/media-hold contract ok');
