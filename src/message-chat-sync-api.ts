import type {AppContext} from './app-context';

type SyncRow={
  id:number;
  sender_id:number;
  text:string;
  reminder_at:string|null;
  created_at:string;
  updated_at:string;
  image_upload_id:string|null;
  sender_name:string;
};

const PAGE_SIZE=40;
const reply=(body:unknown,status=200)=>Response.json(body,{status,headers:{'cache-control':'private, no-store'}});
const nowJst=()=>new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Tokyo',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'}).format(new Date());
const validJst=(value:string)=>/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/u.test(value);

/** Bounded, family-scoped incremental chat read for the latest Messages page. */
export async function messageChatSyncApi(request:Request,ctx:AppContext):Promise<Response>{
  const m=ctx.member;
  if(!m)return reply({ok:false,error:'AUTH_REQUIRED'},401);
  if(request.method!=='GET')return reply({ok:false,error:'GET only'},405);
  const url=new URL(request.url),after=Number(url.searchParams.get('after')||0),releasedAfter=String(url.searchParams.get('released_after')||'');
  if(!Number.isSafeInteger(after)||after<0)return reply({ok:false,error:'INVALID_CURSOR'},400);
  if(releasedAfter&&!validJst(releasedAfter))return reply({ok:false,error:'INVALID_CURSOR'},400);
  const now=nowJst();
  const newStatement=ctx.env.DB.prepare(`SELECT msg.id,msg.sender_id,msg.text,msg.reminder_at,msg.created_at,msg.updated_at,msg.image_upload_id,s.name sender_name
    FROM messages msg JOIN members s ON s.id=msg.sender_id AND s.family_id=msg.family_id
    WHERE msg.family_id=? AND msg.id>? AND (msg.reminder_at IS NULL OR msg.reminder_at<=? OR msg.sender_id=?)
    ORDER BY msg.id ASC LIMIT ${PAGE_SIZE}`)
    .bind(m.family_id,after,now,m.id);
  const releasedStatement=releasedAfter&&releasedAfter<now
    ?ctx.env.DB.prepare(`SELECT msg.id,msg.sender_id,msg.text,msg.reminder_at,msg.created_at,msg.updated_at,msg.image_upload_id,s.name sender_name
      FROM messages msg JOIN members s ON s.id=msg.sender_id AND s.family_id=msg.family_id
      WHERE msg.family_id=? AND msg.sender_id<>? AND msg.reminder_at IS NOT NULL
        AND msg.reminder_at>? AND msg.reminder_at<=?
      ORDER BY msg.id ASC LIMIT ${PAGE_SIZE}`)
      .bind(m.family_id,m.id,releasedAfter,now)
    :null;
  const statements=[newStatement];
  if(releasedStatement)statements.push(releasedStatement);
  const results=await ctx.env.DB.batch<SyncRow>(statements);
  const byId=new Map<number,SyncRow>();
  for(const row of results.flatMap(result=>result.results))byId.set(Number(row.id),row);
  const rows=[...byId.values()].sort((a,b)=>Number(a.id)-Number(b.id)).slice(0,PAGE_SIZE);
  return reply({
    ok:true,
    serverNow:now,
    messages:rows.map(row=>({
      id:Number(row.id),
      senderId:Number(row.sender_id),
      senderName:String(row.sender_name||''),
      text:String(row.text||''),
      reminderAt:row.reminder_at?String(row.reminder_at):'',
      createdAt:String(row.created_at||''),
      updatedAt:String(row.updated_at||''),
      hasImage:Boolean(row.image_upload_id),
    })),
  });
}