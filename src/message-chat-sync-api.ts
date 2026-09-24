import type {AppContext} from './app-context';
import {bodyJson} from './request-body';

type SyncRow={
  id:number;
  sender_id:number;
  text:string;
  reminder_at:string|null;
  created_at:string;
  updated_at:string;
  image_upload_id:string|null;
  sender_name:string;
  line_picture_url:string|null;
  read_count:number;
};

const PAGE_SIZE=40;
const reply=(body:unknown,status=200)=>Response.json(body,{status,headers:{'cache-control':'private, no-store'}});
const nowJst=()=>new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Tokyo',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'}).format(new Date());
const validJst=(value:string)=>/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/u.test(value);

/** Bounded, family-scoped incremental chat read for the latest Messages page. */
export async function messageChatSyncApi(request:Request,ctx:AppContext):Promise<Response>{
  const m=ctx.member;
  if(!m)return reply({ok:false,error:'AUTH_REQUIRED'},401);
  if(request.method==='POST'){
    const body=await bodyJson(request).catch(()=>null);
    if(!body||!ctx.session.csrfToken||body.csrf!==ctx.session.csrfToken)return reply({ok:false,error:'FORBIDDEN'},403);
    const ids=Array.isArray(body.ids)?[...new Set(body.ids.map(Number))].filter(id=>Number.isSafeInteger(id)&&id>0).slice(0,40):[];
    if(!ids.length)return reply({ok:true,counts:[]});
    const now=nowJst();
    await ctx.env.DB.batch(ids.map(id=>ctx.env.DB.prepare(`INSERT OR IGNORE INTO message_reads(family_id,message_id,member_id,read_at)
      SELECT msg.family_id,msg.id,?,? FROM messages msg
      WHERE msg.family_id=? AND msg.id=? AND msg.sender_id<>? AND (msg.target_member_id IS NULL OR msg.target_member_id=?)
        AND (msg.reminder_at IS NULL OR msg.reminder_at<=?)`).bind(m.id,now,m.family_id,id,m.id,m.id,now)));
    const counts=await ctx.env.DB.prepare(`SELECT r.message_id id,COUNT(*) count FROM message_reads r
      JOIN members reader ON reader.id=r.member_id AND reader.family_id=r.family_id AND reader.active=1 AND reader.deleted_at IS NULL
      JOIN messages msg ON msg.id=r.message_id AND msg.family_id=r.family_id AND msg.sender_id=?
      WHERE r.family_id=? AND r.message_id IN (${ids.map(()=>'?').join(',')}) GROUP BY r.message_id`).bind(m.id,m.family_id,...ids).all<{id:number;count:number}>();
    return reply({ok:true,counts:counts.results});
  }
  if(request.method!=='GET')return reply({ok:false,error:'GET or POST only'},405);
  const url=new URL(request.url),after=Number(url.searchParams.get('after')||0),before=Number(url.searchParams.get('before')||0),releasedAfter=String(url.searchParams.get('released_after')||'');
  if(!Number.isSafeInteger(after)||after<0)return reply({ok:false,error:'INVALID_CURSOR'},400);
  if(!Number.isSafeInteger(before)||before<0)return reply({ok:false,error:'INVALID_CURSOR'},400);
  if(releasedAfter&&!validJst(releasedAfter))return reply({ok:false,error:'INVALID_CURSOR'},400);
  const now=nowJst();
  const projection=`SELECT msg.id,msg.sender_id,msg.text,msg.reminder_at,msg.created_at,msg.updated_at,msg.image_upload_id,s.name sender_name,s.line_picture_url,
    (SELECT COUNT(*) FROM message_reads r JOIN members reader ON reader.id=r.member_id AND reader.family_id=r.family_id AND reader.active=1 AND reader.deleted_at IS NULL WHERE r.family_id=msg.family_id AND r.message_id=msg.id) read_count`;
  if(before){
    const older=await ctx.env.DB.prepare(`${projection} FROM messages msg JOIN members s ON s.id=msg.sender_id AND s.family_id=msg.family_id
      WHERE msg.family_id=? AND msg.id<? AND (msg.target_member_id IS NULL OR msg.target_member_id IN (?,msg.sender_id))
        AND (msg.reminder_at IS NULL OR msg.reminder_at<=? OR msg.sender_id=?) ORDER BY msg.id DESC LIMIT ${PAGE_SIZE+1}`)
      .bind(m.family_id,before,m.id,now,m.id).all<SyncRow>();
    const rows=older.results.slice(0,PAGE_SIZE).reverse();
    return reply({ok:true,messages:rows.map(mapRow),hasOlder:older.results.length>PAGE_SIZE});
  }
  const newStatement=ctx.env.DB.prepare(`${projection}
    FROM messages msg JOIN members s ON s.id=msg.sender_id AND s.family_id=msg.family_id
    WHERE msg.family_id=? AND msg.id>? AND (msg.target_member_id IS NULL OR msg.target_member_id IN (?,msg.sender_id)) AND (msg.reminder_at IS NULL OR msg.reminder_at<=? OR msg.sender_id=?)
    ORDER BY msg.id ASC LIMIT ${PAGE_SIZE}`)
    .bind(m.family_id,after,m.id,now,m.id);
  const releasedStatement=releasedAfter&&releasedAfter<now
    ?ctx.env.DB.prepare(`${projection}
      FROM messages msg JOIN members s ON s.id=msg.sender_id AND s.family_id=msg.family_id
      WHERE msg.family_id=? AND msg.sender_id<>? AND msg.reminder_at IS NOT NULL
        AND (msg.target_member_id IS NULL OR msg.target_member_id=?) AND msg.reminder_at>? AND msg.reminder_at<=?
      ORDER BY msg.id ASC LIMIT ${PAGE_SIZE}`)
      .bind(m.family_id,m.id,m.id,releasedAfter,now)
    :null;
  const statements=[newStatement];
  if(releasedStatement)statements.push(releasedStatement);
  const results=await ctx.env.DB.batch(statements);
  const byId=new Map<number,SyncRow>();
  for(const row of results.flatMap(result=>result.results))byId.set(Number(row.id),row as SyncRow);
  const rows=[...byId.values()].sort((a,b)=>Number(a.id)-Number(b.id)).slice(0,PAGE_SIZE);
  const readIds=String(url.searchParams.get('read_ids')||'').split(',').map(Number).filter(id=>Number.isSafeInteger(id)&&id>0).slice(0,40);
  const counts=readIds.length?await ctx.env.DB.prepare(`SELECT r.message_id id,COUNT(*) count FROM message_reads r
    JOIN members reader ON reader.id=r.member_id AND reader.family_id=r.family_id AND reader.active=1 AND reader.deleted_at IS NULL
    JOIN messages msg ON msg.id=r.message_id AND msg.family_id=r.family_id AND msg.sender_id=?
    WHERE r.family_id=? AND r.message_id IN (${readIds.map(()=>'?').join(',')}) GROUP BY r.message_id`).bind(m.id,m.family_id,...readIds).all<{id:number;count:number}>():null;
  return reply({
    ok:true,
    serverNow:now,
    messages:rows.map(mapRow),
    counts:counts?.results||[],
  });
}

function mapRow(row:SyncRow){return {
      id:Number(row.id),
      senderId:Number(row.sender_id),
      senderName:String(row.sender_name||''),
      avatarUrl:String(row.line_picture_url||''),
      readCount:Number(row.read_count||0),
      text:String(row.text||''),
      reminderAt:row.reminder_at?String(row.reminder_at):'',
      createdAt:String(row.created_at||''),
      updatedAt:String(row.updated_at||''),
      hasImage:Boolean(row.image_upload_id),
    };}
