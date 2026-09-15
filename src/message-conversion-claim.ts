export type MessageConversionType='shopping'|'task';
export type MessageConversionMode='shopping'|'existing'|'new';

type Row=Record<string,unknown>;
export type MessageConversionClaim=
  |{state:'acquired';token:string;targetId:number|null;mode:MessageConversionMode}
  |{state:'done';targetId:number|null;mode:MessageConversionMode}
  |{state:'busy';targetId:number|null;mode:MessageConversionMode}
  |{state:'mismatch';targetId:number|null;mode:MessageConversionMode};

const changed=(result:{meta:any})=>Number(result?.meta?.changes||0)>0;
const asMode=(value:unknown):MessageConversionMode=>value==='existing'||value==='new'?value:'shopping';
const asTarget=(value:unknown)=>{const id=Number(value||0);return Number.isInteger(id)&&id>0?id:null;};

export async function acquireMessageConversionClaim(db:D1Database,familyId:number,messageId:number,type:MessageConversionType,mode:MessageConversionMode,sourceUpdatedAt:string,initialTargetId:number|null=null):Promise<MessageConversionClaim>{
  const token=crypto.randomUUID();
  const inserted=await db.prepare(`INSERT OR IGNORE INTO message_conversion_claims(message_id,family_id,conversion_type,conversion_mode,source_updated_at,target_id,status,lease_token,lease_expires_at,created_at,updated_at)
    VALUES(?,?,?,?,?,?,'PROCESSING',?,datetime('now','+5 minutes'),datetime('now'),datetime('now'))`).bind(messageId,familyId,type,mode,sourceUpdatedAt,initialTargetId,token).run();
  if(changed(inserted))return{state:'acquired',token,targetId:initialTargetId,mode};

  const existing=await db.prepare('SELECT conversion_mode,source_updated_at,target_id,status,lease_expires_at FROM message_conversion_claims WHERE message_id=? AND family_id=? AND conversion_type=? LIMIT 1').bind(messageId,familyId,type).first<Row>();
  if(!existing)return{state:'busy',targetId:null,mode};
  const storedMode=asMode(existing.conversion_mode),targetId=asTarget(existing.target_id);
  if(String(existing.status||'')==='DONE')return{state:'done',targetId,mode:storedMode};
  if(storedMode!==mode||String(existing.source_updated_at||'')!==sourceUpdatedAt)return{state:'mismatch',targetId,mode:storedMode};

  const reclaimed=await db.prepare(`UPDATE message_conversion_claims SET lease_token=?,lease_expires_at=datetime('now','+5 minutes'),updated_at=datetime('now')
    WHERE message_id=? AND family_id=? AND conversion_type=? AND status='PROCESSING' AND source_updated_at=? AND COALESCE(lease_expires_at,'')<datetime('now')
    RETURNING target_id,conversion_mode`).bind(token,messageId,familyId,type,sourceUpdatedAt).first<Row>();
  if(reclaimed)return{state:'acquired',token,targetId:asTarget(reclaimed.target_id),mode:asMode(reclaimed.conversion_mode)};
  return{state:'busy',targetId,mode:storedMode};
}

export async function attachMessageConversionTarget(db:D1Database,familyId:number,messageId:number,type:MessageConversionType,token:string,targetId:number):Promise<boolean>{
  const result=await db.prepare("UPDATE message_conversion_claims SET target_id=?,updated_at=datetime('now') WHERE message_id=? AND family_id=? AND conversion_type=? AND status='PROCESSING' AND lease_token=?").bind(targetId,messageId,familyId,type,token).run();
  return changed(result);
}

export function finalizeMessageConversionClaimStatement(db:D1Database,familyId:number,messageId:number,type:MessageConversionType,token:string,targetId:number){
  return db.prepare("UPDATE message_conversion_claims SET target_id=?,status='DONE',lease_token=NULL,lease_expires_at=NULL,updated_at=datetime('now') WHERE message_id=? AND family_id=? AND conversion_type=? AND status='PROCESSING' AND lease_token=?").bind(targetId,messageId,familyId,type,token);
}
