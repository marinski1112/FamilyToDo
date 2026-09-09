import type { AppContext } from './app-context';
import { json } from './response';
import { settingsDiagnosticsDetail } from './settings-diagnostics';
import { safeDigestAttempts, type DigestAttempt } from './line-digest-generation';

type Row=Record<string,unknown>;
type SafeMorningGeneration={status:'AI'|'FALLBACK';reason:string;model?:string;attempts?:DigestAttempt[]};

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
    return {...(model?{model}:{}),status,reason,attempts:safeDigestAttempts(generation.attempts)};
  }catch{return {status:'FALLBACK',reason:'LEGACY'};}
}

function morningItem(row:Row){
  const generation=safeGeneration(row.frame_json);
  const requestCount=boundedRequestCount(row.request_count);
  const attempts=(generation.attempts||[]).map((x,i)=>({ordinal:i+1,model:x.model,http_status:x.httpStatus,failure_stage:x.stage,reason_code:x.reason,duration_ms:x.durationMs}));
  const last=attempts.at(-1);
  const aiCalled=requestCount!==null&&requestCount>0?true:generation.status==='AI'?true:PROVIDER_CALLED_REASONS.has(generation.reason)?true:NO_PROVIDER_CALL_REASONS.has(generation.reason)?false:requestCount===0?false:null;
  return {
    feature:'MORNING_DIGEST',
    final_status:generation.status==='AI'?'AI_OK':'FALLBACK_DETERMINISTIC',
    ai_called:aiCalled,
    model:last?.model??null,
    http_status:last?.http_status??null,
    last_attempt_status:generation.status==='AI'?'AI_OK':null,
    last_reason_code:last?.reason_code??generation.reason,
    generation_reason:generation.reason,
    finalized:Number(row.finalized)===1,
    last_failure_stage:last?.failure_stage??null,
    last_item_ordinal:null,
    last_source_index:null,
    last_expected_count:null,
    last_actual_count:null,
    attempt_count:requestCount,
    attempts,
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
    if(new URL(request.url).searchParams.get('format')==='html'){
      const esc=(value:unknown)=>String(value??'—').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));
      const cards=items.map((raw:any)=>`<article><h2>${esc(raw.feature)}</h2><p>${esc(raw.local_date||raw.created_at)} · ${esc(raw.final_status)}</p><p>AI呼出: ${esc(raw.ai_called)} / 回数: ${esc(raw.attempt_count)} / 確定: ${esc(raw.finalized)}</p><p>生成判定: ${esc(raw.generation_reason||raw.last_reason_code)}</p><p>段階: ${esc(raw.last_failure_stage)} / 理由: ${esc(raw.last_reason_code)} / HTTP: ${esc(raw.http_status)}</p><p>モデル: ${esc(raw.model)}</p><details><summary>試行ごとの診断</summary><pre>${esc(JSON.stringify(raw.attempts||[],null,2))}</pre></details></article>`).join('');
      return new Response(`<!doctype html><html lang="ja"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>AI実行履歴</title><style>body{font:16px system-ui;margin:16px;background:#f4f5f9;color:#243044}article{background:white;padding:16px;margin:12px 0;border-radius:16px;overflow-wrap:anywhere}h2{font-size:18px}pre{white-space:pre-wrap}p{margin:8px 0}</style><a href="/app/settings_diagnostics.php">管理の診断へ戻る</a><h1>AI実行履歴</h1><p>朝まとめは当日の確定結果です。再表示ではAIを呼びません。変更前の履歴には試行詳細がありません。</p>${cards||'<p>記録はありません。</p>'}</html>`,{headers:{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store'}});
    }
    return json({ok:true,issue:'ai_generation',items,limited:20});
  }catch{return baseResponse;}
}
