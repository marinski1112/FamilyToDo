export const MESSAGE_PHOTO_MAX_BYTES=4*1024*1024;
export type MessagePhotoInput={uploadId:string;familyId:number;memberId:number;bytes:ArrayBuffer;mime:string;caption:string;reminderAt:string|null;now:string};
type Photo={upload_id:string;family_id:number;member_id:number;object_key:string;sha256:string;mime_type:string;byte_size:number;caption:string;reminder_at:string|null;state:string};
export class MessagePhotoError extends Error { constructor(readonly code:string){super(code);} }
const digest=async(bytes:ArrayBuffer)=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),b=>b.toString(16).padStart(2,'0')).join('');
function validImage(bytes:Uint8Array,mime:string) {
  if(mime==='image/jpeg')return bytes.length>=3&&bytes[0]===255&&bytes[1]===216&&bytes[2]===255;
  if(mime==='image/png')return bytes.length>=8&&[137,80,78,71,13,10,26,10].every((b,i)=>bytes[i]===b);
  if(mime==='image/webp')return bytes.length>=12&&String.fromCharCode(...bytes.slice(0,4))==='RIFF'&&String.fromCharCode(...bytes.slice(8,12))==='WEBP';
  return false;
}
export async function createMessagePhoto(db:D1Database,bucket:R2Bucket,input:MessagePhotoInput):Promise<number> {
  const {uploadId,familyId,memberId,bytes,mime,caption,reminderAt,now}=input;
  if(!/^[a-f0-9-]{36}$/u.test(uploadId)||!Number.isSafeInteger(familyId)||familyId<1||!Number.isSafeInteger(memberId)||memberId<1||caption.length>2000)throw new MessagePhotoError('INVALID_PHOTO');
  if(bytes.byteLength<1||bytes.byteLength>MESSAGE_PHOTO_MAX_BYTES)throw new MessagePhotoError('PHOTO_TOO_LARGE');
  if(!validImage(new Uint8Array(bytes),mime))throw new MessagePhotoError('INVALID_IMAGE');
  const sha=await digest(bytes),key=`families/${familyId}/message-photos/${uploadId}`;
  await db.prepare(`INSERT INTO message_photos(upload_id,family_id,member_id,object_key,sha256,mime_type,byte_size,caption,reminder_at,created_at)
    VALUES(?,?,?,?,?,?,?,?,?,?) ON CONFLICT(upload_id) DO NOTHING`)
    .bind(uploadId,familyId,memberId,key,sha,mime,bytes.byteLength,caption,reminderAt,now).run();
  const row=await db.prepare('SELECT * FROM message_photos WHERE upload_id=?').bind(uploadId).first<Photo>();
  if(!row||row.family_id!==familyId||row.member_id!==memberId||row.sha256!==sha||row.mime_type!==mime||row.caption!==caption||row.reminder_at!==reminderAt)throw new MessagePhotoError('UPLOAD_CONFLICT');
  if(row.state==='delete_pending'||row.state==='deleted')throw new MessagePhotoError('PHOTO_DELETED');
  const existing=await db.prepare('SELECT id FROM messages WHERE image_upload_id=? AND family_id=?').bind(uploadId,familyId).first<{id:number}>();
  if(existing)return Number(existing.id);
  // The durable object record precedes R2. Failed/unknown uploads keep the same
  // identity for retry; parallel deliveries can only write identical bytes.
  const admitted=await db.prepare("UPDATE message_photos SET writers=writers+1 WHERE upload_id=? AND state IN ('staging','ready') RETURNING upload_id").bind(uploadId).first();
  if(!admitted)throw new MessagePhotoError('PHOTO_DELETED');
  try {
  await bucket.put(key,bytes,{httpMetadata:{contentType:mime}});
  await db.batch([
    db.prepare(`INSERT OR IGNORE INTO messages(family_id,sender_id,target_member_id,text,reminder_at,created_at,updated_at,image_upload_id)
      SELECT family_id,member_id,NULL,CASE WHEN caption='' THEN '画像' ELSE caption END,reminder_at,?, ?,upload_id
      FROM message_photos WHERE upload_id=? AND state IN ('staging','ready')`).bind(now,now,uploadId),
    db.prepare(`UPDATE message_photos SET state='ready' WHERE upload_id=? AND state IN ('staging','ready')
      AND EXISTS(SELECT 1 FROM messages WHERE image_upload_id=?)`).bind(uploadId,uploadId),
    db.prepare(`INSERT INTO notifications(family_id,member_id,type,target_type,target_id,notify_at,status,message,created_at)
      SELECT msg.family_id,m.id,'message_reminder','message',msg.id,COALESCE(msg.reminder_at,?),'pending','【伝言・写真】' || char(10) || msg.text,?
      FROM messages msg JOIN members m ON m.family_id=msg.family_id AND m.active=1 AND m.id<>msg.sender_id
      WHERE msg.image_upload_id=? AND NOT EXISTS(SELECT 1 FROM notifications n WHERE n.family_id=msg.family_id AND n.member_id=m.id AND n.target_type='message' AND n.target_id=msg.id)`)
      .bind(now,now,uploadId),
  ]);
  const saved=await db.prepare('SELECT id FROM messages WHERE image_upload_id=? AND family_id=?').bind(uploadId,familyId).first<{id:number}>();
  if(!saved)throw new MessagePhotoError('PHOTO_RETRY_REQUIRED');
  return Number(saved.id);
  } finally {
    await db.prepare('UPDATE message_photos SET writers=writers-1 WHERE upload_id=? AND writers>0').bind(uploadId).run();
    await drainDeletedMessagePhotos(db,bucket,familyId).catch(()=>{});
  }
}

export async function drainDeletedMessagePhotos(db:D1Database,bucket:R2Bucket,familyId:number) {
  const rows=await db.prepare("SELECT upload_id,object_key FROM message_photos WHERE family_id=? AND state='delete_pending' AND writers=0 ORDER BY created_at LIMIT 8")
    .bind(familyId).all<{upload_id:string;object_key:string}>();
  for(const row of rows.results) {
    if(row.object_key!==`families/${familyId}/message-photos/${row.upload_id}`)continue;
    try {await bucket.delete(row.object_key);
      await db.prepare("UPDATE message_photos SET state='deleted',caption='' WHERE upload_id=? AND state='delete_pending' AND writers=0").bind(row.upload_id).run();
      // Keep the upload ID tombstone against replay. No staging timeout.
    } catch { /* Durable marker survives for a later bounded retry. */ }
  }
}
