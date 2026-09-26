import type {AppContext} from './app-context';
import {bodyJson} from './request-body';

const DEFAULT_EMOJIS=['❤️','😆','😭','👏','😍'];
const reply=(data:unknown,status=200)=>Response.json(data,{status,headers:{'cache-control':'private, no-store'}});
const nowJst=()=>new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Tokyo',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'}).format(new Date());
type ReactionRow={message_id:number;emoji:string;count:number;mine:number};

async function configured(ctx:AppContext,familyId:number){
  const row=await ctx.env.DB.prepare('SELECT emojis_json FROM message_reaction_settings WHERE family_id=?').bind(familyId).first<{emojis_json:string}>();
  if(!row)return DEFAULT_EMOJIS;
  try{const parsed=JSON.parse(row.emojis_json);return Array.isArray(parsed)?parsed.filter(v=>typeof v==='string').slice(0,20) as string[]:DEFAULT_EMOJIS;}
  catch{return DEFAULT_EMOJIS;}
}

export async function messageReactionsApi(request:Request,ctx:AppContext):Promise<Response>{
  const member=ctx.member;
  if(!member)return reply({ok:false,error:'AUTH_REQUIRED'},401);
  const familyId=Number(member.family_id),memberId=Number(member.id);
  if(request.method==='GET'){
    const emojis=await configured(ctx,familyId);
    const ids=[...new Set((new URL(request.url).searchParams.get('ids')||'').split(',').map(Number))]
      .filter(id=>Number.isSafeInteger(id)&&id>0).slice(0,40);
    if(!ids.length)return reply({ok:true,emojis,reactions:[]});
    const rows=await ctx.env.DB.prepare(`SELECT r.message_id,r.emoji,COUNT(*) count,MAX(CASE WHEN r.member_id=? THEN 1 ELSE 0 END) mine
      FROM message_reactions r JOIN messages msg ON msg.id=r.message_id AND msg.family_id=r.family_id
      WHERE r.family_id=? AND r.message_id IN (${ids.map(()=>'?').join(',')})
        AND (msg.target_member_id IS NULL OR msg.target_member_id IN (?,msg.sender_id))
        AND (msg.reminder_at IS NULL OR msg.reminder_at<=?)
      GROUP BY r.message_id,r.emoji ORDER BY r.message_id,r.emoji LIMIT 800`)
      .bind(memberId,familyId,...ids,memberId,nowJst()).all<ReactionRow>();
    return reply({ok:true,emojis,reactions:rows.results.map(r=>({messageId:Number(r.message_id),emoji:String(r.emoji),count:Number(r.count),mine:Boolean(r.mine)}))});
  }
  if(request.method!=='POST'&&request.method!=='PUT')return reply({ok:false,error:'METHOD_NOT_ALLOWED'},405);
  const body=await bodyJson(request).catch(()=>null);
  if(!body||!ctx.session.csrfToken||body.csrf!==ctx.session.csrfToken)return reply({ok:false,error:'FORBIDDEN'},403);
  if(request.method==='PUT'){
    const role=String(member.role||'').toUpperCase();
    if(role!=='OWNER'&&role!=='ADMIN')return reply({ok:false,error:'ADMIN_REQUIRED'},403);
    if(!Array.isArray(body.emojis)||body.emojis.length<1||body.emojis.length>20)return reply({ok:false,error:'INVALID_EMOJIS'},400);
    const emojis=body.emojis.map(v=>typeof v==='string'?v.trim():'');
    if(emojis.some(v=>!v||Array.from(v).length>32||/[\u0000-\u001f,、]/u.test(v))||new Set(emojis).size!==emojis.length)return reply({ok:false,error:'INVALID_EMOJIS'},400);
    await ctx.env.DB.prepare(`INSERT INTO message_reaction_settings(family_id,emojis_json,updated_at) VALUES(?,?,?)
      ON CONFLICT(family_id) DO UPDATE SET emojis_json=excluded.emojis_json,updated_at=excluded.updated_at`)
      .bind(familyId,JSON.stringify(emojis),nowJst()).run();
    return reply({ok:true,emojis});
  }
  const messageId=Number(body.messageId),emoji=String(body.emoji||'');
  if(!Number.isSafeInteger(messageId)||messageId<=0||!emoji||Array.from(emoji).length>32)return reply({ok:false,error:'INVALID_REACTION'},400);
  const message=await ctx.env.DB.prepare(`SELECT id FROM messages WHERE id=? AND family_id=?
    AND (target_member_id IS NULL OR target_member_id IN (?,sender_id))
    AND (reminder_at IS NULL OR reminder_at<=?) LIMIT 1`).bind(messageId,familyId,memberId,nowJst()).first();
  if(!message)return reply({ok:false,error:'MESSAGE_NOT_FOUND'},404);
  const previous=await ctx.env.DB.prepare('SELECT 1 FROM message_reactions WHERE family_id=? AND message_id=? AND member_id=? AND emoji=? LIMIT 1')
    .bind(familyId,messageId,memberId,emoji).first();
  if(!previous&&!(await configured(ctx,familyId)).includes(emoji))return reply({ok:false,error:'INVALID_REACTION'},400);
  if(previous)await ctx.env.DB.prepare('DELETE FROM message_reactions WHERE family_id=? AND message_id=? AND member_id=? AND emoji=?')
    .bind(familyId,messageId,memberId,emoji).run();
  else await ctx.env.DB.prepare('INSERT OR IGNORE INTO message_reactions(family_id,message_id,member_id,emoji,created_at) VALUES(?,?,?,?,?)')
    .bind(familyId,messageId,memberId,emoji,nowJst()).run();
  return reply({ok:true});
}
