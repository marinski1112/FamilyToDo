import type { AppContext } from './app-context';
import { json } from './response';
import { settingsDiagnosticsDetail } from './settings-diagnostics';

type Row=Record<string,unknown>;
type SafeMorningGeneration={status:'AI'|'FALLBACK';reason:string;model?:string};

const ALLOWED_REASONS=new Set(['OK','NOT_CONFIGURED','DISABLED','BUDGET_OR_CIRCUIT','STORAGE','RATE_LIMIT','UPSTREAM','INVALID_OUTPUT','LEGACY']);
const PROVIDER_CALLED_REASONS=new Set(['RATE_LIMIT','UPSTREAM','INVALID_OUTPUT']);
const NO_PROVIDER_CALL_REASONS=new Set(['NOT_CONFIGURED','DISABLED']);
const safeModel=(value:unknown)=>{
  const model=String(value??'').trim();
  return model&&model.length<=120&&/^[A-Za-z0-9._-]+$/.test(model)?model:null;
};
const boundedRequestCount=(value:unknown)=>{
  const n=Number(value);
  return Number.isInteger(n)&&n>=0&&n<=2?n:null;
};

function safeGeneration(frameJson:unknown):SafeMorningGeneration{
  if(typeof frameJson!=='string'||!frameJson)return {status:'FALLBACK',reason:'LEGACY'};
  try{
    const frame=JSON.parse(frameJson) as Record<string,unknown>;
    const raw=frame.generation;
    if(!raw||typeof raw!=='object'||Array.isArray(raw))return {status:'FALLBACK',reason:'LEGACY'};
    const generation=raw as Record<string,unknown>;
    const status=generation.status==='AI'?'AI':'FALLBACK';
    const reason=ALLOWED_REASONS.has(String(generation.reason||''))?String(generation.reason):'LEGACY';
    const model=safeModel(generation.model);
    return {...(model?{model}:{}),status,reason};
  }catch{return {status:'FALLBACK',reason:'LEGACY'};}
}

function morningItem(row:Row){
  const generation=safeGeneration(row.frame_json);
  const requestCount=boundedRequestCount(row.request_count);
  const aiCalled=requestCount!==null&&requestCount>0?true:generation.status==='AI'?true:PROVIDER_CALLED_REASONS.has(generation.reason)?true:NO_PROVIDER_CALL_REASONS.has(generation.reason)?false:requestCount===0?false:null;
  return {
    feature:'MORNING_DIGEST',
    final_status:generation.status==='AI'?'AI_OK':'FALLBACK_DETERMINISTIC',
    ai_called:aiCalled,
    model:generation.model??null,
    http_status:null,
    last_attempt_status:generation.status==='AI'?'AI_OK':null,
    last_reason_code:generation.reason,
    last_failure_stage:null,
    last_item_ordinal:null,
    last_source_index:null,
    last_expected_count:null,
    last_actual_count:null,
    attempt_count:requestCount,
    attempts:[],
    item_count:null,
    local_date:String(row.local_date||''),
    created_at:String(row.updated_at||row.created_at||''),
  };
}

export async function settingsDiagnosticsDetailWithMorningAi(request:Request,ctx:AppContext):Promise<Response>{
  const issue=new URL(request.url).searchParams.get('issue')||'';
  if(issue!=='ai_generation')return settingsDiagnosticsDetail(request,ctx);

  const baseResponse=await settingsDiagnosticsDetail(request,ctx);
  if(!baseResponse.ok)return baseResponse;
  const base=await baseResponse.clone().json().catch(()=>null) as {ok?:boolean;issue?:string;items?:unknown[]}|null;
  if(!base?.ok||!ctx.member)return baseResponse;

  try{
    const rows=await ctx.env.DB.prepare('SELECT local_date,request_count,finalized,frame_json,created_at,updated_at FROM line_daily_digest_ai_family_daily WHERE family_id=? AND finalized=1 ORDER BY local_date DESC LIMIT 20').bind(ctx.member.family_id).all<Row>();
    const morning=rows.results.map(morningItem);
    const existing=Array.isArray(base.items)?base.items:[];
    const items=[...morning,...existing].sort((a:any,b:any)=>String(b?.created_at||'').localeCompare(String(a?.created_at||''))).slice(0,20);
    return json({ok:true,issue:'ai_generation',items,limited:20});
  }catch{return baseResponse;}
}
