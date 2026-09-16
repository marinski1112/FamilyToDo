import assert from 'node:assert/strict';
import fs from 'node:fs';

const service=fs.readFileSync('src/photo-transfer-service.ts','utf8');
const api=fs.readFileSync('src/photo-transfer-api.ts','utf8');
const index=fs.readFileSync('src/index.ts','utf8');

assert.match(service,/export async function inspectPhotoTransfer[\s\S]*SELECT family_id,member_id,source_kind,source_id,caption,sha256 FROM photo_transfers[\s\S]*expires_at>\?[\s\S]*remaining_reads>0/,'final flow must inspect only an unexpired readable transfer before touching source bytes');
assert.match(service,/export async function consumePhotoTransfer[\s\S]*UPDATE photo_transfers SET remaining_reads=0[\s\S]*expires_at>\?[\s\S]*remaining_reads>0[\s\S]*RETURNING family_id,member_id,source_kind,source_id,caption,sha256/,'final consume must atomically burn all remaining reads and return the immutable binding');
assert.ok(service.includes('.bind(await hash(token),now)'), 'transfer lookup/consume must use the token hash, never the raw capability as the DB key');
assert.ok(!/INSERT INTO photo_transfers\([\s\S]*\.bind\(token[,)]/.test(service),'raw transfer token must never be persisted');

for(const marker of [
  'const member=await memberById(env,row.member_id);',
  'member.family_id!==row.family_id',
  'const photo=await sourcePhoto(ctx,row.source_kind,row.source_id);',
  "!['image/jpeg','image/png','image/webp'].includes(mime)",
  'await photoSha256(bytes)!==row.sha256',
]) assert.ok(api.includes(marker),`source authorization/integrity guard missing: ${marker}`);

const inspectPos=api.indexOf('const inspected=await inspectPhotoTransfer(env.DB,token);');
const resolvePos=api.indexOf('const photo=await resolveTransferPhoto(request,env,inspected);');
const consumePos=api.indexOf('const consumed=await consumePhotoTransfer(env.DB,token);');
const encodePos=api.indexOf('return encodeTransferPhoto(photo);',resolvePos);
assert.ok(inspectPos>=0&&inspectPos<resolvePos&&resolvePos<consumePos&&consumePos<encodePos,'final flow must validate the current source snapshot before atomic consume and return exactly that validated snapshot');
assert.ok(api.includes("if(!sameTransfer(inspected,consumed))return reply({ok:false,error:'TRANSFER_CHANGED'},409);"),'final flow must bind the consumed row to the inspected claim');

const redeemRoute=index.indexOf("if(url.pathname==='/api/photo-transfer/redeem')return redeemPhotoTransfer(request,env);");
const consumeRoute=index.indexOf("if(url.pathname==='/api/photo-transfer/consume')return consumePhotoTransferRequest(request,env);");
const context=index.indexOf('const context=await makeContext(request,env,ctx);');
assert.ok(redeemRoute>=0&&consumeRoute>redeemRoute&&consumeRoute<context,'redeem/consume capability routes must remain isolated before ordinary FamilyToDo session context creation');
assert.ok(!api.includes("role==='admin'")&&!api.includes('role === \'admin\''),'photo transfer capability redemption must not become admin-only');

console.log('photo transfer final-consume contract ok');
