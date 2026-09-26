import fs from 'node:fs';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
const api=fs.readFileSync('src/message-chat-sync-api.ts','utf8'),routes=fs.readFileSync('src/context-api-routes.ts','utf8'),client=fs.readFileSync('public/assets/messages-chat.js','utf8'),migration=fs.readFileSync('migrations/0096_message_chat_sync_indexes.sql','utf8');
for(const marker of ["const PAGE_SIZE=40;","WHERE msg.family_id=? AND msg.id>? AND (msg.target_member_id IS NULL OR msg.target_member_id IN (?,msg.sender_id)) AND (msg.reminder_at IS NULL OR msg.reminder_at<=? OR msg.sender_id=?)","WHERE msg.family_id=? AND msg.sender_id<>? AND msg.reminder_at IS NOT NULL","(msg.reminder_at>? OR (msg.reminder_at=? AND msg.id>?)) AND msg.reminder_at<=?","ORDER BY msg.id ASC LIMIT ${PAGE_SIZE}","ORDER BY msg.reminder_at ASC,msg.id ASC LIMIT ${PAGE_SIZE}","released_after_id","const releasedStatement=releasedAfter&&(releasedAfter<now||(releasedAfter===now&&releasedAfterId>0))","ctx.env.DB.batch(statements)","const newRows=","const releasedRows=","const byId=new Map<number,SyncRow>();","nextAfter","releasedAfter:nextReleasedAfter","releasedAfterId:nextReleasedAfterId","serverNow:now"]){if(!api.includes(marker))throw new Error(`message chat sync API lost: ${marker}`);}
for(const forbidden of ['family_id='+"${","WHERE msg.family_id=? AND (\n      (msg.id>?"]){if(api.includes(forbidden))throw new Error(`message chat sync unsafe/unbounded query shape: ${forbidden}`);}
for(const marker of ['CREATE INDEX IF NOT EXISTS idx_messages_family_id_seek','ON messages (family_id, id)','CREATE INDEX IF NOT EXISTS idx_messages_release_seek','ON messages (family_id, reminder_at, id)','WHERE reminder_at IS NOT NULL'])if(!migration.includes(marker))throw new Error(`message chat sync migration lost: ${marker}`);
if(!routes.includes("import { messageChatSyncApi } from './message-chat-sync-api';")||!routes.includes("if(url.pathname==='/api/message-chat-sync') return await messageChatSyncApi(request,context);"))throw new Error('message chat sync route wiring lost');
for(const marker of ["u.searchParams.set('after',String(cursor))","u.searchParams.set('released_after',releasedAfter)","u.searchParams.set('released_after_id',String(releasedAfterId))","const nextAfter=Number(d.nextAfter)","releasedAfter=nextReleasedAfter;releasedAfterId=nextReleasedAfterId","now=serverNow","if(archiveMode||syncBusy||document.hidden)return","setInterval(()=>{if(!document.hidden)syncMessages(false);},2500)","document.addEventListener('visibilitychange'",'appendMessages(d.messages||[],forceScroll)'])if(!client.includes(marker))throw new Error(`message chat client sync lost: ${marker}`);
if(api.includes("const rows=[...byId.values()].sort((a,b)=>Number(a.id)-Number(b.id)).slice(0,PAGE_SIZE)"))throw new Error('combined streams must not be truncated after their cursors advance');
if(client.includes('cursor=Math.max(cursor,id)'))throw new Error('scheduled release rows must not advance the normal message ID cursor');

const db=new DatabaseSync(':memory:');
db.exec('CREATE TABLE released(id INTEGER PRIMARY KEY, reminder_at TEXT NOT NULL)');
const insert=db.prepare('INSERT INTO released(id,reminder_at) VALUES(?,?)');
for(let id=1;id<=45;id++)insert.run(id,'2026-09-26 18:00:00');
const page=db.prepare('SELECT id,reminder_at FROM released WHERE (reminder_at>? OR (reminder_at=? AND id>?)) AND reminder_at<=? ORDER BY reminder_at ASC,id ASC LIMIT 40');
const first=page.all('2026-09-26 17:00:00','2026-09-26 17:00:00',0,'2026-09-26 18:00:00');
assert.equal(first.length,40,'first release page must stay bounded');
const last=first.at(-1);
const second=page.all(String(last.reminder_at),String(last.reminder_at),Number(last.id),'2026-09-26 18:00:00');
assert.deepEqual(second.map(row=>Number(row.id)),[41,42,43,44,45],'same-timestamp releases beyond 40 must remain reachable by the id tie-breaker');
db.close();

console.log('message chat incremental sync contract ok');