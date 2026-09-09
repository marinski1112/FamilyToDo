import type { AppContext } from './app-context';
import { AuthRequired, BadRequest, Forbidden } from './errors';
import { json } from './response';

const STAGES = new Set(['SERVER_ENTRY','AUTH_OK','BODY_PARSE','BODY_PARSED','PERMISSION_LOOKUP','CSRF_CHECK','CSRF_OK','VALIDATION','DB_WRITE','DB_OK','ACTIVITY_LOG','RESPONSE_READY','SERVER_ERROR']);
const REASONS = new Set(['AUTH_DENIED','CSRF_DENIED','VALIDATION_DENIED','FORBIDDEN','EXCEPTION']);
type Evidence = {stage:string;ms:number;status?:number;reason?:string};
type Trace = {id:string;started:number;events:Evidence[]};
const traces = new WeakMap<AppContext,Trace>();
const ID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

export function safeFamilyLogEvidence(value:unknown):Evidence[]{
  if(!Array.isArray(value))return [];
  return value.slice(0,24).flatMap(e=>{
    if(!e||!STAGES.has(e.stage)||!Number.isInteger(e.ms)||e.ms<0||e.ms>600000)return [];
    return [{stage:e.stage,ms:e.ms,...(Number.isInteger(e.status)&&e.status>=100&&e.status<=599?{status:e.status}:{}),...(REASONS.has(e.reason)?{reason:e.reason}:{})}];
  });
}

/** Observational only. Never await a diagnostic write in the canonical save path. */
export function familyLogStage(ctx:AppContext,stage:string,status?:number,reason?:string):void{
  try{
    const trace=traces.get(ctx),familyId=ctx.member?.family_id;
    if(!trace||!familyId||!ctx.executionContext||trace.events.length>=24||!STAGES.has(stage))return;
    trace.events.push(...safeFamilyLogEvidence([{stage,ms:Math.min(600000,Math.max(0,Date.now()-trace.started)),status,reason}]));
    const revision=trace.events.length,events=JSON.stringify(trace.events);
    const write=ctx.env.DB.prepare(`INSERT INTO family_log_diagnostics(family_id,correlation_id,revision,events_json) VALUES(?,?,?,?)
      ON CONFLICT(family_id,correlation_id) DO UPDATE SET revision=excluded.revision,events_json=excluded.events_json WHERE excluded.revision>family_log_diagnostics.revision`)
      .bind(familyId,trace.id,revision,events).run().then(async()=>{
        if(revision===1)await ctx.env.DB.prepare('DELETE FROM family_log_diagnostics WHERE family_id=? AND (created_at<datetime(\'now\',\'-1 day\') OR correlation_id NOT IN (SELECT correlation_id FROM family_log_diagnostics WHERE family_id=? ORDER BY created_at DESC,correlation_id DESC LIMIT 20))').bind(familyId,familyId).run();
      }).catch(()=>{});
    ctx.executionContext.waitUntil(write);
  }catch{/* Diagnostics must not affect mutations, including missing migration/storage. */}
}

export async function withFamilyLogDiagnostic(request:Request,ctx:AppContext,run:()=>Promise<Response>):Promise<Response>{
  // Admin-only opt-in header; tenant derives exclusively from authenticated context.
  // No body is captured and missing authentication cannot be attributed to a tenant.
  const id=request.headers.get('X-Family-Log-Trace')||'';
  if(request.method!=='POST'||!ctx.executionContext||!ctx.member||!['OWNER','ADMIN'].includes(String(ctx.member.role).toUpperCase())||!ID.test(id))return run();
  traces.set(ctx,{id,started:Date.now(),events:[]});
  familyLogStage(ctx,'SERVER_ENTRY');familyLogStage(ctx,'AUTH_OK');
  try{
    const response=await run();
    familyLogStage(ctx,'RESPONSE_READY',response.status);
    return response;
  }catch(error){
    const previous=traces.get(ctx)?.events.at(-1)?.stage;
    const reason=error instanceof AuthRequired?'AUTH_DENIED':error instanceof Forbidden?(previous==='CSRF_CHECK'?'CSRF_DENIED':'FORBIDDEN'):error instanceof BadRequest?'VALIDATION_DENIED':'EXCEPTION';
    familyLogStage(ctx,'SERVER_ERROR',error instanceof AuthRequired?401:error instanceof Forbidden?403:error instanceof BadRequest?400:undefined,reason);
    throw error;
  }finally{traces.delete(ctx);}
}

export async function cleanupFamilyLogDiagnostics(env:Env):Promise<void>{
  try{await env.DB.prepare("DELETE FROM family_log_diagnostics WHERE created_at<datetime('now','-1 day')").run();}catch{/* Best effort; never log raw errors. */}
}

export async function readFamilyLogDiagnostics(request:Request,ctx:AppContext):Promise<Response>{
  if(!ctx.member)return json({ok:false,code:'AUTH_REQUIRED'},401);
  if(!['OWNER','ADMIN'].includes(String(ctx.member.role).toUpperCase()))return json({ok:false,code:'FORBIDDEN'},403);
  if(request.method!=='GET')return json({ok:false,code:'METHOD_NOT_ALLOWED'},405);
  try{
    const rows=await ctx.env.DB.prepare("SELECT correlation_id,created_at,events_json FROM family_log_diagnostics WHERE family_id=? AND created_at>=datetime('now','-1 day') ORDER BY created_at DESC,correlation_id DESC LIMIT 20").bind(ctx.member.family_id).all<{correlation_id:string;created_at:string;events_json:string}>();
    return json({ok:true,feature:'FAMILY_LOG_QUICK',items:rows.results.filter(r=>ID.test(r.correlation_id)).map(r=>{
      let events:Evidence[]=[];try{events=safeFamilyLogEvidence(JSON.parse(r.events_json));}catch{}
      return {id:r.correlation_id,time:/^\d{4}-\d\d-\d\d \d\d:\d\d:\d\d$/.test(r.created_at)?r.created_at:null,events};
    })},200,{'Cache-Control':'private, no-store'});
  }catch{return json({ok:false,code:'DIAGNOSTIC_STORAGE_UNAVAILABLE'},503);}
}

export function familyLogDiagnosticCard(ctx:AppContext):string{
  return `<section class="card" id="familyLogDiagnosticAdmin" data-family="${Number(ctx.member?.family_id||0)}"><h2>子供クイックの診断</h2><p class="small">このLINE内ブラウザで診断開始後、クイックを1回押し、ここへ戻って結果を表示してください。本文・写真・位置・認証情報は記録しません。端末の証拠はこのタブだけで10分、サーバーは最新20件・24時間（削除は毎時）。</p><div class="actions"><button type="button" id="familyLogDiagnosticArm">診断を開始</button><button type="button" class="btn gray" id="familyLogDiagnosticRead">結果を表示</button></div><p id="familyLogDiagnosticStatus" role="status"></p><div id="familyLogDiagnosticResult"></div></section><script src="/assets/family-log-diagnostics.js?v=quick-diag1" data-family="${Number(ctx.member?.family_id||0)}"></script>`;
}
