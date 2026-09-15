import type {AppContext} from './app-context';
import {createMessagePhoto,drainDeletedMessagePhotos,MESSAGE_PHOTO_MAX_BYTES,MessagePhotoError} from './message-photo-service';
const reply=(body:unknown,status=200)=>Response.json(body,{status,headers:{'cache-control':'private, no-store'}});
async function boundedForm(request:Request):Promise<FormData> {
  const limit=MESSAGE_PHOTO_MAX_BYTES+16384;
  if(Number(request.headers.get('content-length'))>limit)throw new MessagePhotoError('PHOTO_TOO_LARGE');
  const reader=request.body?.getReader();if(!reader)throw new MessagePhotoError('INVALID_PHOTO');
  const chunks:Uint8Array[]=[];let size=0;
  try {while(true){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>limit){await reader.cancel();throw new MessagePhotoError('PHOTO_TOO_LARGE');}chunks.push(value);}}
  finally{reader.releaseLock();}
  const bytes=new Uint8Array(size);let offset=0;for(const part of chunks){bytes.set(part,offset);offset+=part.length;}
  return new Request(request.url,{method:'POST',headers:{'content-type':request.headers.get('content-type')??''},body:bytes}).formData();
}
export async function messagePhotoApi(request:Request,ctx:AppContext):Promise<Response> {
  const m=ctx.member;
  if(!m || !await ctx.env.DB.prepare('SELECT 1 FROM members WHERE id=? AND family_id=? AND active=1').bind(m.id,m.family_id).first())return reply({ok:false,error:'AUTH_REQUIRED'},401);
  const value=new URL(request.url).searchParams.get('photo')??'';
  try {
    await drainDeletedMessagePhotos(ctx.env.DB,ctx.env.MEDIA,m.family_id);
    if(request.method==='GET'&&/^[1-9]\d*$/u.test(value)) {
      const now=new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Tokyo',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'}).format(new Date());
      const row=await ctx.env.DB.prepare(`SELECT p.object_key,p.mime_type FROM message_photos p
        JOIN messages msg ON msg.image_upload_id=p.upload_id AND msg.family_id=p.family_id
        WHERE msg.id=? AND msg.family_id=? AND p.state='ready'
          AND (msg.reminder_at IS NULL OR msg.reminder_at<=? OR msg.sender_id=?)`)
        .bind(Number(value),m.family_id,now,m.id).first<{object_key:string;mime_type:string}>();
      if(!row)return reply({ok:false,error:'PHOTO_NOT_FOUND'},404);
      const object=await ctx.env.MEDIA.get(row.object_key);if(!object)return reply({ok:false,error:'PHOTO_NOT_FOUND'},404);
      return new Response(object.body,{headers:{'content-type':row.mime_type,'cache-control':'private, no-store','x-content-type-options':'nosniff'}});
    }
    if(request.method!=='POST'||value!=='upload')return reply({ok:false,error:'INVALID_REQUEST'},400);
    const csrf=request.headers.get('x-csrf-token');if(!csrf||csrf!==ctx.session.csrfToken)return reply({ok:false,error:'CSRF_FAILED'},403);
    const form=await boundedForm(request),file=form.get('file');
    if(!(file instanceof File)||file.size>MESSAGE_PHOTO_MAX_BYTES)throw new MessagePhotoError('INVALID_PHOTO');
    const caption=String(form.get('caption')??'').trim(),reminderRaw=String(form.get('reminder_at')??'').trim();
    const now=new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Tokyo',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'}).format(new Date());
    const reminderAt=reminderRaw&&/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/u.test(reminderRaw)?reminderRaw.replace('T',' ')+':00':null;
    if(reminderRaw&&(!reminderAt||reminderAt<=now))throw new MessagePhotoError('INVALID_REMINDER');
    const id=await createMessagePhoto(ctx.env.DB,ctx.env.MEDIA,{uploadId:String(form.get('upload_id')??''),familyId:m.family_id,memberId:m.id,
      bytes:await file.arrayBuffer(),mime:file.type,caption,reminderAt,now});
    return reply({ok:true,id},201);
  } catch(error) {
    if(error instanceof MessagePhotoError)return reply({ok:false,error:error.code},error.code==='PHOTO_TOO_LARGE'?413:error.code==='UPLOAD_CONFLICT'?409:400);
    return reply({ok:false,error:'PHOTO_RETRY_REQUIRED'},503);
  }
}
