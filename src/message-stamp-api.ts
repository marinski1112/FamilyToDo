import type {AppContext} from './app-context';
import {calendarStampFramesForAssets} from './calendar-stamps';
import {calendarStampAssetUrl,calendarStampStorageKeyUrl} from './calendar-stamp-asset-url';
import {bodyJson,RequestBodyParseError} from './request-body';

type StampRow={
  message_id:number;
  asset_id:number;
  asset_kind:'ANIMATED'|'STATIC';
  mime_type:'image/gif'|'image/webp'|'image/png';
  storage_provider:'ASSETS'|'UPLOAD';
  storage_key:string;
  thumbnail_storage_key:string|null;
  width:number|null;
  height:number|null;
};

const nowJst=()=>new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Tokyo',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'}).format(new Date()).replace(' ','T').replace('T',' ');

function scope(context:AppContext):{familyId:number;memberId:number}|null{
  const familyId=Number(context.member?.family_id||0),memberId=Number(context.member?.id||0);
  return Number.isSafeInteger(familyId)&&familyId>0&&Number.isSafeInteger(memberId)&&memberId>0?{familyId,memberId}:null;
}

function response(value:unknown,status=200):Response{
  return new Response(JSON.stringify(value),{status,headers:{'content-type':'application/json; charset=utf-8','cache-control':'private, no-store'}});
}

async function activeActor(env:Env,familyId:number,memberId:number):Promise<boolean>{
  const actor=await env.DB.prepare('SELECT id FROM members WHERE id=? AND family_id=? AND active=1 LIMIT 1').bind(memberId,familyId).first<{id:number}>();
  return Boolean(actor);
}

/** Shared Calendar-stamp catalog attachment boundary for Messages/伝言. */
export async function messageStampApi(request:Request,context:AppContext):Promise<Response>{
  const s=scope(context);if(!s)return response({ok:false,error:'AUTH_REQUIRED'},401);
  if(!(await activeActor(context.env,s.familyId,s.memberId)))return response({ok:false,error:'AUTH_REQUIRED'},401);

  if(request.method==='GET'){
    try{
      const rows=await context.env.DB.prepare(`SELECT attachment.message_id,asset.id asset_id,asset.asset_kind,asset.mime_type,
          asset.storage_provider,asset.storage_key,asset.thumbnail_storage_key,asset.width,asset.height
        FROM message_stamp_attachments attachment
        JOIN messages msg ON msg.id=attachment.message_id AND msg.family_id=attachment.family_id
        JOIN calendar_stamp_assets asset ON asset.id=attachment.asset_id AND asset.family_id=attachment.family_id AND asset.active=1
        WHERE attachment.family_id=?
        ORDER BY attachment.message_id DESC
        LIMIT 100`).bind(s.familyId).all<StampRow>();
      const frameRead=await calendarStampFramesForAssets(context.env,s.familyId,s.memberId,rows.results.map(row=>Number(row.asset_id)));
      const invalidFrameAssets=new Set(frameRead.invalidAssetIds);
      const framesByAsset=new Map<number,typeof frameRead.frames>();
      for(const frame of frameRead.frames){const list=framesByAsset.get(frame.asset_id)||[];list.push(frame);framesByAsset.set(frame.asset_id,list);}
      const stamps=rows.results.flatMap(row=>{
        const thumbnailUrl=calendarStampAssetUrl(row,'thumbnail'),fullUrl=calendarStampAssetUrl(row,'full');
        if(!thumbnailUrl||!fullUrl)return [];
        let frames:{url:string;durationMs:number}[]=[];
        if(row.asset_kind==='ANIMATED'&&row.mime_type==='image/png'){
          if(invalidFrameAssets.has(row.asset_id))return [];
          const sequence=framesByAsset.get(row.asset_id)||[];
          if(sequence.length<2||sequence.some((frame,index)=>frame.frame_index!==index))return [];
          frames=sequence.flatMap(frame=>{const url=calendarStampStorageKeyUrl(row.storage_provider,frame.storage_key);return url?[{url,durationMs:frame.duration_ms}]:[];});
          if(frames.length!==sequence.length)return [];
        }
        return [{messageId:Number(row.message_id),kind:row.asset_kind,mimeType:row.mime_type,thumbnailUrl,fullUrl,frames,width:row.width,height:row.height}];
      });
      return response({ok:true,stamps});
    }catch{
      return response({ok:false,error:'MESSAGE_STAMP_READ_FAILED'},500);
    }
  }

  if(request.method!=='POST')return response({ok:false,error:'GET or POST only'},405);
  let body:Record<string,unknown>;
  try{body=await bodyJson(request);}catch(error){if(error instanceof RequestBodyParseError)return response({ok:false,error:'INVALID_BODY'},400);throw error;}
  const csrf=String(body.csrf||''),expected=String(context.session?.csrfToken||'');
  if(!csrf||!expected||csrf!==expected)return response({ok:false,error:'CSRF_FAILED'},403);
  const assetId=Number(body.assetId||0),target=Number(body.target_member_id||0)||null;
  if(!Number.isSafeInteger(assetId)||assetId<=0)return response({ok:false,error:'INVALID_STAMP'},400);
  const rawText=String(body.text??'').trim();
  if(Array.from(rawText).length>5000)return response({ok:false,error:'INVALID_MESSAGE'},400);
  const text=rawText||'スタンプ';
  const reminderRaw=String(body.reminder_at??'').trim();
  const reminderAt=reminderRaw&&/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(reminderRaw)?reminderRaw.replace('T',' ')+':00':null;
  if(reminderRaw&&!reminderAt)return response({ok:false,error:'INVALID_REMINDER'},400);
  const now=nowJst();
  if(reminderAt&&reminderAt<=now)return response({ok:false,error:'INVALID_REMINDER'},400);
  if(target){
    const recipient=await context.env.DB.prepare('SELECT id FROM members WHERE id=? AND family_id=? AND active=1 LIMIT 1').bind(target,s.familyId).first<{id:number}>();
    if(!recipient)return response({ok:false,error:'INVALID_RECIPIENT'},400);
  }
  const asset=await context.env.DB.prepare(`SELECT id FROM calendar_stamp_assets
    WHERE id=? AND family_id=? AND active=1
      AND EXISTS(SELECT 1 FROM members actor WHERE actor.id=? AND actor.family_id=? AND actor.active=1)
    LIMIT 1`).bind(assetId,s.familyId,s.memberId,s.familyId).first<{id:number}>();
  if(!asset)return response({ok:false,error:'STAMP_UNAVAILABLE'},400);

  let messageId=0;
  try{
    const inserted=await context.env.DB.prepare('INSERT INTO messages(family_id,sender_id,target_member_id,text,reminder_at,created_at,updated_at) VALUES(?,?,?,?,?,?,?)')
      .bind(s.familyId,s.memberId,target,text,reminderAt,now,now).run();
    messageId=Number(inserted.meta.last_row_id||0);
    if(!Number.isSafeInteger(messageId)||messageId<=0)throw new Error('message insert failed');
    const attached=await context.env.DB.prepare(`INSERT INTO message_stamp_attachments(family_id,message_id,asset_id,created_by,created_at)
      SELECT ?,?,?,?,?
      WHERE EXISTS(SELECT 1 FROM messages WHERE id=? AND family_id=? AND sender_id=?)
        AND EXISTS(SELECT 1 FROM calendar_stamp_assets WHERE id=? AND family_id=? AND active=1)
        AND EXISTS(SELECT 1 FROM members WHERE id=? AND family_id=? AND active=1)`)
      .bind(s.familyId,messageId,assetId,s.memberId,now,messageId,s.familyId,s.memberId,assetId,s.familyId,s.memberId,s.familyId).run();
    if(Number(attached.meta.changes||0)!==1)throw new Error('attachment insert failed');
    if(reminderAt){
      const recipients=target
        ?await context.env.DB.prepare('SELECT id FROM members WHERE id=? AND family_id=? AND active=1').bind(target,s.familyId).all<{id:number}>()
        :await context.env.DB.prepare('SELECT id FROM members WHERE family_id=? AND active=1 AND id<>?').bind(s.familyId,s.memberId).all<{id:number}>();
      if(recipients.results.length)await context.env.DB.batch(recipients.results.map(recipient=>context.env.DB.prepare('INSERT OR IGNORE INTO notifications(family_id,member_id,type,target_type,target_id,notify_at,status,message,created_at) VALUES(?,?,?,?,?,?,?,?,?)').bind(s.familyId,Number(recipient.id),'message_reminder','message',messageId,reminderAt,'pending',`【伝言】\n${text}`,now)));
    }
    return response({ok:true},201);
  }catch{
    if(messageId>0){try{await context.env.DB.prepare('DELETE FROM messages WHERE id=? AND family_id=? AND sender_id=?').bind(messageId,s.familyId,s.memberId).run();}catch{/* best-effort rollback */}}
    return response({ok:false,error:'MESSAGE_STAMP_CREATE_FAILED'},500);
  }
}
