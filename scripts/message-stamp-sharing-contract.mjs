import assert from 'node:assert/strict';
import fs from 'node:fs';

const migration=fs.readFileSync('migrations/0050_message_stamp_attachments.sql','utf8');
const api=fs.readFileSync('src/message-stamp-api.ts','utf8');
const routes=fs.readFileSync('src/context-api-routes.ts','utf8');
const compose=fs.readFileSync('public/assets/message-new.js','utf8');
const messages=fs.readFileSync('public/assets/messages.js','utf8');

for(const token of [
  'CREATE TABLE message_stamp_attachments',
  'message_id INTEGER NOT NULL UNIQUE',
  'FOREIGN KEY(message_id) REFERENCES messages(id) ON DELETE CASCADE',
  'FOREIGN KEY(asset_id) REFERENCES calendar_stamp_assets(id)',
  'message_stamp_attachments_family_insert',
  'message stamp message family mismatch',
  'message stamp asset family mismatch',
  'message stamp creator family mismatch',
]) assert.ok(migration.includes(token),`message stamp attachment schema missing: ${token}`);
assert.doesNotMatch(migration,/CREATE TABLE\s+.*stamp.*asset/i,'Messages must reference the canonical Calendar stamp asset catalog rather than creating another asset catalog');

for(const token of [
  "import {calendarStampFramesForAssets} from './calendar-stamps'",
  "import {calendarStampAssetUrl,calendarStampFrameUrl} from './calendar-stamp-asset-url'",
  'export async function messageStampApi',
  'SELECT id FROM members WHERE id=? AND family_id=? AND active=1 LIMIT 1',
  'JOIN calendar_stamp_assets asset ON asset.id=attachment.asset_id AND asset.family_id=attachment.family_id AND asset.active=1',
  'calendarStampFramesForAssets(context.env,s.familyId,s.memberId',
  "calendarStampAssetUrl(row,'thumbnail')",
  "calendarStampAssetUrl(row,'full')",
  'calendarStampFrameUrl(row.storage_provider,row.asset_id,frame.frame_index,frame.storage_key)',
  "const csrf=String(body.csrf||''),expected=String(context.session?.csrfToken||'')",
  'WHERE id=? AND family_id=? AND active=1',
  'INSERT INTO messages(family_id,sender_id,target_member_id,text,reminder_at,created_at,updated_at)',
  'INSERT INTO message_stamp_attachments(family_id,message_id,asset_id,created_by,created_at)',
  "const text=rawText||'スタンプ'",
  "'cache-control':'private, no-store'",
]) assert.ok(api.includes(token),`message stamp API boundary missing: ${token}`);
const projectionStart=api.indexOf('return [{messageId:Number(row.message_id)');
const projectionEnd=projectionStart>=0?api.indexOf('}];',projectionStart):-1;
assert.ok(projectionStart>=0&&projectionEnd>projectionStart,'message stamp projection marker missing');
const projection=api.slice(projectionStart,projectionEnd+3);
for(const field of ['messageId:','kind:','mimeType:','thumbnailUrl','fullUrl','frames','width:','height:'])assert.ok(projection.includes(field),`message stamp projection missing field: ${field}`);
for(const sensitive of ['familyId','memberId','storage_key','thumbnail_storage_key','created_by','target_member_id'])assert.ok(!projection.includes(sensitive),`message stamp projection exposes internal field: ${sensitive}`);
assert.doesNotMatch(api,/https?:\/\//i,'message stamp API must not embed remote asset URLs');
assert.doesNotMatch(api,/R2Bucket|env\.[A-Za-z0-9_]*R2|\.MEDIA\./i,'message stamp attachment API must stay independent of the physical R2 binding; transport remains behind the shared resolver/media endpoint');

for(const token of [
  "import { messageStampApi } from './message-stamp-api';",
  "if(url.pathname==='/api/message-stamps') return await messageStampApi(request,context);",
]) assert.ok(routes.includes(token),`message stamp route missing: ${token}`);

for(const [name,source] of [['message-new',compose],['messages',messages]]){
  for(const token of [
    "fetch('/api/calendar-stamp-options'",
    "'/api/message-stamps':'/api/messages'",
    'b.assetId=',
    "textarea.required=selectedStampId<=0",
    "credentials:'same-origin'",
    'loaded=false',
    'loaded=true',
    'もう一度押すと再試行します。',
  ]) assert.ok(source.includes(token),`${name} shared stamp picker missing: ${token}`);
  assert.doesNotMatch(source,/storage_key|thumbnail_storage_key|authorization|cookie|signed[_-]?url/i,`${name} stamp UI must not depend on raw storage or credential details`);
}

for(const token of [
  "fetch('/api/message-stamps'",
  'const normalizedFrames=stamp=>',
  'frames.length>=2',
  "matchMedia('(prefers-reduced-motion: reduce)').matches",
  "url.searchParams.set('stamp_play',String(Date.now()))",
  "if(text&&text.textContent.trim()==='スタンプ')text.hidden=true",
  "image.className='message-stamp-attached'",
]) assert.ok(messages.includes(token),`Messages stamp rendering/playback missing: ${token}`);
assert.ok(messages.includes('catch{/* stamp enhancement is optional; normal Messages stay usable */}'),'stamp read enhancement must fail closed without breaking normal Messages');
assert.doesNotMatch(messages,/row\.querySelectorAll\('\.convert-shopping,\.convert-task,\.edit-message'\).*hidden=true/,'stamp enhancement must not create a client-only action restriction that can be bypassed while attachment state is loading');

console.log('message stamp sharing contract: Messages reuse the tenant-safe canonical Calendar stamp catalog with bounded attachment, retryable compose, ASSETS/R2 rendering and sequential-PNG playback semantics');
