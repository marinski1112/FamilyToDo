import assert from 'node:assert/strict';
import fs from 'node:fs';

const service=fs.readFileSync('src/photo-transfer-service.ts','utf8');
const api=fs.readFileSync('src/photo-transfer-api.ts','utf8');
const index=fs.readFileSync('src/index.ts','utf8');
const recoveryMigration=fs.readFileSync('migrations/0088_photo_transfer_recovery.sql','utf8');

assert.match(service,/export async function inspectPhotoTransfer[\s\S]*SELECT family_id,member_id,source_kind,source_id,caption,sha256 FROM photo_transfers[\s\S]*expires_at>\?[\s\S]*remaining_reads>0/,'final flow must inspect only an unexpired readable transfer before touching source bytes');
assert.match(service,/export async function consumePhotoTransfer[\s\S]*UPDATE photo_transfers SET remaining_reads=0[\s\S]*expires_at>\?[\s\S]*remaining_reads>0[\s\S]*RETURNING family_id,member_id,source_kind,source_id,caption,sha256/,'legacy final consume must atomically burn all remaining reads and return the immutable binding');
assert.match(service,/export async function consumePhotoTransferWithRecovery[\s\S]*SET remaining_reads=0,recovery_token_hash=\?,recovery_expires_at=MIN\(expires_at,\?\),recovery_reads=1[\s\S]*expires_at>\?[\s\S]*remaining_reads>0[\s\S]*RETURNING family_id,member_id,source_kind,source_id,caption,sha256/,'recovery-enabled final consume must atomically burn the original token and bind one bounded recovery read');
assert.match(service,/export async function inspectPhotoTransferRecovery[\s\S]*recovery_token_hash=\?[\s\S]*recovery_expires_at>\?[\s\S]*recovery_reads>0[\s\S]*remaining_reads=0/,'recovery inspection must require an unexpired one-shot recovery bound to an already-consumed transfer');
assert.match(service,/export async function consumePhotoTransferRecovery[\s\S]*SET recovery_reads=0,recovery_token_hash=NULL[\s\S]*recovery_expires_at>\?[\s\S]*recovery_reads>0[\s\S]*remaining_reads=0[\s\S]*RETURNING family_id,member_id,source_kind,source_id,caption,sha256/,'recovery consume must atomically burn the recovery capability and return the immutable binding');
assert.ok(service.includes('const RECOVERY_TTL_SECONDS=120;'),'recovery capability must stay short-lived');
assert.ok(service.includes('.bind(await hash(token),now)'), 'transfer lookup/consume must use the token hash, never the raw capability as the DB key');
assert.ok(service.includes('.bind(await hash(recoveryToken),now)'), 'recovery lookup/consume must hash the raw recovery capability before DB lookup');
assert.ok(!/INSERT INTO photo_transfers\([\s\S]*\.bind\(token[,)]/.test(service),'raw transfer token must never be persisted');
assert.match(recoveryMigration,/recovery_token_hash TEXT/,'recovery state must persist only a token hash');
assert.match(recoveryMigration,/recovery_reads INTEGER NOT NULL DEFAULT 0 CHECK\(recovery_reads BETWEEN 0 AND 1\)/,'recovery state must remain single-use');

for(const marker of [
  'const member=await memberById(env,row.member_id);',
  'member.family_id!==row.family_id',
  'const photo=await sourcePhoto(ctx,row.source_kind,row.source_id);',
  "!['image/jpeg','image/png','image/webp'].includes(mime)",
  'await photoSha256(bytes)!==row.sha256',
]) assert.ok(api.includes(marker),`source authorization/integrity guard missing: ${marker}`);

const finalFlowStart=api.indexOf("if(capability.kind==='recovery'){");
const initialInspectPos=api.indexOf('const inspected=await inspectPhotoTransfer(env.DB,capability.token);',finalFlowStart);
const initialResolvePos=api.indexOf('const photo=await resolveTransferPhoto(request,env,inspected);',initialInspectPos);
const initialConsumePos=api.indexOf('const consumed=capability.recoveryHash',initialResolvePos);
const initialSamePos=api.indexOf("if(!sameTransfer(inspected,consumed))return reply({ok:false,error:'TRANSFER_CHANGED'},409);",initialConsumePos);
const initialEncodePos=api.indexOf('return encodeTransferPhoto(photo,consumed.sha256);',initialSamePos);
assert.ok(initialInspectPos>=0&&initialInspectPos<initialResolvePos&&initialResolvePos<initialConsumePos&&initialConsumePos<initialSamePos&&initialSamePos<initialEncodePos,'final flow must validate the current source snapshot before atomic consume and return exactly that validated snapshot');
assert.ok(api.slice(initialConsumePos,initialSamePos).includes('consumePhotoTransferWithRecovery(env.DB,capability.token,capability.recoveryHash)'),'recovery-enabled final flow must bind the supplied recovery hash during original-token consume');
assert.ok(api.slice(initialConsumePos,initialSamePos).includes('consumePhotoTransfer(env.DB,capability.token)'),'legacy final flow must remain deployment-compatible');

const recoveryInspectPos=api.indexOf('const inspected=await inspectPhotoTransferRecovery(env.DB,capability.recoveryToken);',finalFlowStart);
const recoveryResolvePos=api.indexOf('const photo=await resolveTransferPhoto(request,env,inspected);',recoveryInspectPos);
const recoveryConsumePos=api.indexOf('const consumed=await consumePhotoTransferRecovery(env.DB,capability.recoveryToken);',recoveryResolvePos);
const recoverySamePos=api.indexOf("if(!sameTransfer(inspected,consumed))return reply({ok:false,error:'TRANSFER_CHANGED'},409);",recoveryConsumePos);
const recoveryEncodePos=api.indexOf('return encodeTransferPhoto(photo,consumed.sha256);',recoverySamePos);
assert.ok(recoveryInspectPos>=0&&recoveryInspectPos<recoveryResolvePos&&recoveryResolvePos<recoveryConsumePos&&recoveryConsumePos<recoverySamePos&&recoverySamePos<recoveryEncodePos,'recovery flow must revalidate the exact current source snapshot before atomically burning recovery and returning that snapshot');
assert.ok(api.includes("return reply({ok:true,mime:photo.mime,base64:btoa(binary),caption:photo.caption,capturedAt:photo.capturedAt,...(sourceSha256?{sourceSha256}:{})});"),'final/recovery response must expose the verified immutable source SHA for downstream idempotency');

const redeemRoute=index.indexOf("if(url.pathname==='/api/photo-transfer/redeem')return await redeemPhotoTransfer(request,env);");
const consumeRoute=index.indexOf("if(url.pathname==='/api/photo-transfer/consume')return await consumePhotoTransferRequest(request,env);");
const context=index.indexOf('const context=await makeContext(request,env,ctx);');
assert.ok(redeemRoute>=0&&consumeRoute>redeemRoute&&consumeRoute<context,'redeem/consume capability routes must remain isolated before ordinary FamilyToDo session context creation');
assert.ok(!api.includes("role==='admin'")&&!api.includes('role === \'admin\''),'photo transfer capability redemption must not become admin-only');

console.log('photo transfer final-consume contract ok');
