import { json } from './response';
import type { AppContext } from './app-context';
import { DEFAULT_CALENDAR_COLOR } from './calendar-colors';
import { googleCalendarInboundPreview } from './google-calendar-inbound-preview';
import { DEFAULT_FAMILY_TIMEZONE, familyNow, utcNow, validateTimezone } from './timezone';

type JsonObject=Record<string,unknown>;
type PreviewEvent={
  event_id?:unknown;
  ical_uid?:unknown;
  title?:unknown;
  description?:unknown;
  location?:unknown;
  start_at?:unknown;
  end_at?:unknown;
  all_day?:unknown;
  task_kind?:unknown;
  calendar_visible?:unknown;
  visibility_scope?:unknown;
  classification?:unknown;
};
type PreviewPayload={
  ok?:unknown;
  read_only?:unknown;
  calendar_id?:unknown;
  from_date?:unknown;
  to_date?:unknown;
  events?:unknown;
  error?:unknown;
  reason?:unknown;
};

export const GOOGLE_CALENDAR_INBOUND_APPLY_MAX_EVENTS=15;
const PROVIDER='GOOGLE_CALENDAR';

class InboundApplyError extends Error{
  constructor(public code:string,public status:number=400){super(code);}
}

const roleAllowed=(value:unknown)=>['OWNER','ADMIN'].includes(String(value||'').toUpperCase());

async function readBody(request:Request){
  if(request.method!=='POST')throw new InboundApplyError('POST_ONLY',405);
  const body=await request.json().catch(()=>null);
  if(!body||typeof body!=='object'||Array.isArray(body))throw new InboundApplyError('INVALID_JSON');
  return body as JsonObject;
}

function authorize(ctx:AppContext,body:JsonObject){
  if(!ctx.member)throw new InboundApplyError('AUTH_REQUIRED',401);
  if(!roleAllowed(ctx.member.role))throw new InboundApplyError('FORBIDDEN',403);
  if(String(body.csrf||'')!==String(ctx.session.csrfToken||''))throw new InboundApplyError('CSRF_FAILED',403);
}

function errorResponse(error:unknown){
  const known=error instanceof InboundApplyError?error:new InboundApplyError('APPLY_FAILED',500);
  const messages:Record<string,string>={
    POST_ONLY:'POSTのみ利用できます。',
    INVALID_JSON:'入力を確認してください。',
    AUTH_REQUIRED:'ログインが必要です。',
    FORBIDDEN:'OWNER / ADMINのみ利用できます。',
    CSRF_FAILED:'CSRF検証に失敗しました。',
    EVENT_SELECTION_REQUIRED:'取り込む新規候補を選択してください。',
    TOO_MANY_EVENTS:`一度に取り込める予定は${GOOGLE_CALENDAR_INBOUND_APPLY_MAX_EVENTS}件までです。`,
    INVALID_EVENT_SELECTION:'予定の選択情報が不正です。',
    STALE_PREVIEW:'プレビュー後に予定または重複状態が変わりました。もう一度プレビューしてください。',
    APPLY_FAILED:'FamilyToDoへの取り込みに失敗しました。Google Calendar側は変更していません。',
  };
  return json({ok:false,error:messages[known.code]||messages.APPLY_FAILED,reason:known.code},known.status);
}

function selectedEventIds(value:unknown){
  if(!Array.isArray(value)||value.length===0)throw new InboundApplyError('EVENT_SELECTION_REQUIRED');
  if(value.length>GOOGLE_CALENDAR_INBOUND_APPLY_MAX_EVENTS)throw new InboundApplyError('TOO_MANY_EVENTS');
  const ids=value.map(v=>String(v||'').trim());
  if(ids.some(id=>!id||id.length>1024||id.includes('\0')))throw new InboundApplyError('INVALID_EVENT_SELECTION');
  const unique=[...new Set(ids)];
  if(unique.length!==ids.length)throw new InboundApplyError('INVALID_EVENT_SELECTION');
  return unique;
}

function replayPreviewRequest(request:Request,ctx:AppContext,body:JsonObject){
  return new Request(request.url,{
    method:'POST',
    headers:{'content-type':'application/json'},
    body:JSON.stringify({
      csrf:String(ctx.session.csrfToken||''),
      calendar_id:String(body.calendar_id||''),
      from_date:String(body.from_date||''),
      to_date:String(body.to_date||''),
    }),
  });
}

function validServerCandidate(value:PreviewEvent){
  return String(value.classification||'')==='NEW_CANDIDATE'
    && String(value.task_kind||'')==='EVENT'
    && String(value.visibility_scope||'')==='FAMILY'
    && Number(value.calendar_visible||0)===1
    && Boolean(String(value.event_id||'').trim())
    && Boolean(String(value.start_at||'').trim());
}

function identityConflict(error:unknown){
  const text=String(error instanceof Error?error.message:error||'').toLowerCase();
  return text.includes('unique')&&text.includes('google_calendar_inbound_links');
}

export async function googleCalendarInboundApply(request:Request,ctx:AppContext){
  try{
    const body=await readBody(request);authorize(ctx,body);
    const ids=selectedEventIds(body.event_ids);

    // Re-read Google and recompute every classifier signal at apply time. Client preview rows are
    // display-only and are never accepted as task input.
    const previewResponse=await googleCalendarInboundPreview(replayPreviewRequest(request,ctx,body),ctx);
    const preview=await previewResponse.json() as PreviewPayload;
    if(!previewResponse.ok||preview.ok!==true){
      return json(preview,previewResponse.status);
    }
    const calendarId=String(preview.calendar_id||'');
    if(!calendarId||calendarId!==String(body.calendar_id||'').trim())throw new InboundApplyError('STALE_PREVIEW',409);
    const rows=Array.isArray(preview.events)?preview.events as PreviewEvent[]:[];
    const byId=new Map(rows.map(row=>[String(row.event_id||'').trim(),row]));
    const selected=ids.map(id=>byId.get(id));
    if(selected.some(row=>!row||!validServerCandidate(row)))throw new InboundApplyError('STALE_PREVIEW',409);

    const familyId=Number(ctx.member!.family_id),memberId=Number(ctx.member!.id);
    const zone=validateTimezone(ctx.member!.family_timezone)?String(ctx.member!.family_timezone):DEFAULT_FAMILY_TIMEZONE;
    const taskNow=familyNow(zone),identityNow=utcNow();
    const statements:D1PreparedStatement[]=[];
    for(const row of selected as PreviewEvent[]){
      statements.push(
        ctx.env.DB.prepare("INSERT INTO tasks(family_id,title,description,due_at,status,completion_mode,created_by,created_at,updated_at,start_at,end_at,location,all_day,calendar_visible,calendar_color,task_kind,sort_order,visibility_scope,private_owner_id) VALUES(?,?,?,NULL,'pending','ANY',?,?,?,?,?,?,?,1,?,'EVENT',0,'FAMILY',NULL)")
          .bind(familyId,String(row.title||'').slice(0,255),String(row.description||'')||null,memberId,taskNow,taskNow,String(row.start_at||''),String(row.end_at||'')||null,String(row.location||'')||null,row.all_day===true?1:0,DEFAULT_CALENDAR_COLOR),
        // D1 batch() is a transaction. The immediately preceding task INSERT owns
        // last_insert_rowid(); an identity collision aborts and rolls back the whole batch.
        ctx.env.DB.prepare('INSERT INTO google_calendar_inbound_links(family_id,account_id,calendar_id,external_event_id,ical_uid,task_id,external_etag,created_at,updated_at) VALUES(?,NULL,?,?,?,last_insert_rowid(),NULL,?,?)')
          .bind(familyId,calendarId,String(row.event_id||''),String(row.ical_uid||'')||null,identityNow,identityNow),
      );
    }

    let results:any[];
    try{
      results=await ctx.env.DB.batch(statements);
    }catch(error){
      if(identityConflict(error))throw new InboundApplyError('STALE_PREVIEW',409);
      throw error;
    }
    const taskIds=(selected as PreviewEvent[]).map((_,index)=>Number(results[index*2]?.meta?.last_row_id||0));
    if(taskIds.some(id=>!Number.isSafeInteger(id)||id<=0))throw new InboundApplyError('APPLY_FAILED',500);

    await ctx.env.DB.prepare("INSERT INTO activity_logs(family_id,member_id,action,target_type,target_id,metadata,occurred_at) VALUES(?,?,'GOOGLE_CALENDAR_INBOUND_IMPORT','google_calendar',NULL,?,?)")
      .bind(familyId,memberId,JSON.stringify({created_count:taskIds.length,provider:PROVIDER}),identityNow).run().catch(()=>{});

    return json({
      ok:true,
      created_count:taskIds.length,
      created_task_ids:taskIds,
      calendar_id:calendarId,
      source_preview:{read_only:preview.read_only===true,from_date:preview.from_date,to_date:preview.to_date},
      google_mutation:'none',
      outbound_projection:'blocked_for_inbound_identity',
      recurrence_import:'unsupported',
    });
  }catch(error){return errorResponse(error);}
}
