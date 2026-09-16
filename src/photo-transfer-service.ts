const hash=async(token:string)=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(token))),b=>b.toString(16).padStart(2,'0')).join('');
const validToken=(token:string)=>/^[a-f0-9]{64}$/u.test(token);
export type PhotoTransfer={family_id:number;member_id:number;source_kind:string;source_id:number;caption:string;sha256:string};
export async function createPhotoTransfer(db:D1Database,input:{familyId:number;memberId:number;kind:string;id:number;caption:string;sha256:string},now=Math.floor(Date.now()/1000)) {
 const token=Array.from(crypto.getRandomValues(new Uint8Array(32)),b=>b.toString(16).padStart(2,'0')).join('');
 await db.prepare('DELETE FROM photo_transfers WHERE token_hash IN (SELECT token_hash FROM photo_transfers WHERE expires_at<=? ORDER BY expires_at LIMIT 100)').bind(now).run();
 await db.prepare('INSERT INTO photo_transfers(token_hash,family_id,member_id,source_kind,source_id,caption,sha256,expires_at) VALUES(?,?,?,?,?,?,?,?)')
  .bind(await hash(token),input.familyId,input.memberId,input.kind,input.id,input.caption,input.sha256,now+300).run();
 return token;
}
export async function inspectPhotoTransfer(db:D1Database,token:string,now=Math.floor(Date.now()/1000)):Promise<PhotoTransfer|null> {
 if(!validToken(token))return null;
 return db.prepare(`SELECT family_id,member_id,source_kind,source_id,caption,sha256 FROM photo_transfers
  WHERE token_hash=? AND expires_at>? AND remaining_reads>0`).bind(await hash(token),now).first<PhotoTransfer>();
}
export async function claimPhotoTransfer(db:D1Database,token:string,now=Math.floor(Date.now()/1000)):Promise<PhotoTransfer|null> {
 if(!validToken(token))return null;
 return db.prepare(`UPDATE photo_transfers SET remaining_reads=remaining_reads-1
  WHERE token_hash=? AND expires_at>? AND remaining_reads>0
  RETURNING family_id,member_id,source_kind,source_id,caption,sha256`).bind(await hash(token),now).first<PhotoTransfer>();
}
export async function consumePhotoTransfer(db:D1Database,token:string,now=Math.floor(Date.now()/1000)):Promise<PhotoTransfer|null> {
 if(!validToken(token))return null;
 return db.prepare(`UPDATE photo_transfers SET remaining_reads=0
  WHERE token_hash=? AND expires_at>? AND remaining_reads>0
  RETURNING family_id,member_id,source_kind,source_id,caption,sha256`).bind(await hash(token),now).first<PhotoTransfer>();
}

export async function photoSha256(bytes:Uint8Array):Promise<string> {return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new Uint8Array(bytes).buffer)),b=>b.toString(16).padStart(2,'0')).join('');}
