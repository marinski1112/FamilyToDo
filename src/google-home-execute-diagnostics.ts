import type { AppContext } from './app-context';
import { googleFulfillment, googleHomeSettings } from './google-home';

type Row=Record<string,unknown>;
type SafeExecuteEnvelope={
  intent:string;
  commandCount:number;
  sceneIdCount:number;
  commandNames:string[];
  paramKeys:string[];
  deactivateTrue:boolean;
  scalarArgumentPresent:boolean;
  utteranceLikeFieldPresent:boolean;
};

const UTTERANCE_KEYS=new Set(['utterance','utterancetext','query','transcript','speechtext','recognizedtext','recognisedtext']);
const MAX_COMMANDS=20;
const MAX_KEYS=12;
const nowText=()=>new Date().toISOString().slice(0,19).replace('T',' ');
const esc=(value:unknown)=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]!));

function hasUtteranceLikeField(value:unknown,depth=0):boolean{
  if(depth>5||value==null)return false;
  if(Array.isArray(value))return value.slice(0,20).some(item=>hasUtteranceLikeField(item,depth+1));
  if(typeof value!=='object')return false;
  for(const [key,child] of Object.entries(value as Record<string,unknown>).slice(0,40)){
    const normalized=key.replace(/[^a-z]/gi,'').toLowerCase();
    if(UTTERANCE_KEYS.has(normalized))return true;
    if(hasUtteranceLikeField(child,depth+1))return true;
  }
  return false;
}

export function summarizeGoogleHomeExecute(body:unknown):SafeExecuteEnvelope{
  const root=body&&typeof body==='object'&&!Array.isArray(body)?body as Record<string,any>:{};
  const input=Array.isArray(root.inputs)?root.inputs[0]:null;
  const intent=String(input?.intent||'');
  const groups=Array.isArray(input?.payload?.commands)?input.payload.commands.slice(0,MAX_COMMANDS):[];
  const commandNames=new Set<string>(),paramKeys=new Set<string>();
  let commandCount=0,sceneIdCount=0,deactivateTrue=false,scalarArgumentPresent=false;
  for(const group of groups){
    const devices=Array.isArray(group?.devices)?group.devices:[];
    sceneIdCount+=devices.filter((device:any)=>typeof device?.id==='string'&&device.id).length;
    for(const execution of Array.isArray(group?.execution)?group.execution.slice(0,MAX_COMMANDS):[]){
      commandCount++;
      const command=String(execution?.command||'');
      if(command&&commandNames.size<6)commandNames.add(command.slice(0,120));
      const params=execution?.params&&typeof execution.params==='object'&&!Array.isArray(execution.params)?execution.params as Record<string,unknown>:{};
      for(const [key,value] of Object.entries(params)){
        if(paramKeys.size<MAX_KEYS)paramKeys.add(String(key).slice(0,80));
        if(key==='deactivate'&&value===true)deactivateTrue=true;
        if(key!=='deactivate'&&['string','number','boolean'].includes(typeof value))scalarArgumentPresent=true;
      }
    }
  }
  return {
    intent,
    commandCount,
    sceneIdCount,
    commandNames:[...commandNames],
    paramKeys:[...paramKeys],
    deactivateTrue,
    scalarArgumentPresent,
    utteranceLikeFieldPresent:hasUtteranceLikeField(root),
  };
}

async function persistExecuteEnvelope(env:Env,body:unknown):Promise<void>{
  const root=body&&typeof body==='object'&&!Array.isArray(body)?body as Record<string,any>:{};
  const requestId=String(root.requestId||'').trim();
  if(!requestId)return;
  const receipt=await env.DB.prepare("SELECT family_id,member_id FROM external_command_receipts WHERE provider='GOOGLE_HOME' AND request_id=? ORDER BY id DESC LIMIT 1").bind(requestId).first<Row>().catch(()=>null);
  if(!receipt?.family_id||!receipt?.member_id)return;
  const metadata=JSON.stringify(summarizeGoogleHomeExecute(root));
  await env.DB.prepare("INSERT INTO activity_logs(family_id,member_id,action,target_type,target_id,metadata,occurred_at) VALUES(?,?,?,?,?,?,?)")
    .bind(receipt.family_id,receipt.member_id,'GOOGLE_HOME_EXECUTE_ENVELOPE','google_home',null,metadata,nowText()).run().catch(()=>{});
}

export async function googleFulfillmentWithExecuteDiagnostics(request:Request,env:Env):Promise<Response>{
  const diagnosticBody=request.method==='POST'?await request.clone().json().catch(()=>null):null;
  const response=await googleFulfillment(request,env);
  const intent=diagnosticBody&&typeof diagnosticBody==='object'?String((diagnosticBody as any)?.inputs?.[0]?.intent||''):'';
  if(intent==='action.devices.EXECUTE'&&response.status!==401)await persistExecuteEnvelope(env,diagnosticBody);
  return response;
}

function readSafeMetadata(row:Row|null):SafeExecuteEnvelope|null{
  if(!row?.metadata)return null;
  try{
    const raw=JSON.parse(String(row.metadata));
    return {
      intent:String(raw.intent||''),
      commandCount:Number(raw.commandCount||0),
      sceneIdCount:Number(raw.sceneIdCount||0),
      commandNames:Array.isArray(raw.commandNames)?raw.commandNames.map(String).slice(0,6):[],
      paramKeys:Array.isArray(raw.paramKeys)?raw.paramKeys.map(String).slice(0,MAX_KEYS):[],
      deactivateTrue:raw.deactivateTrue===true,
      scalarArgumentPresent:raw.scalarArgumentPresent===true,
      utteranceLikeFieldPresent:raw.utteranceLikeFieldPresent===true,
    };
  }catch{return null;}
}

export async function googleHomeSettingsWithExecuteDiagnostics(request:Request,ctx:AppContext):Promise<Response>{
  const base=await googleHomeSettings(request,ctx);
  if(request.method!=='GET'||!ctx.member||!['OWNER','ADMIN'].includes(String(ctx.member.role||'').toUpperCase())||!base.ok)return base;
  const latest=await ctx.env.DB.prepare("SELECT occurred_at,metadata FROM activity_logs WHERE family_id=? AND action='GOOGLE_HOME_EXECUTE_ENVELOPE' ORDER BY occurred_at DESC,id DESC LIMIT 1").bind(ctx.member.family_id).first<Row>().catch(()=>null);
  const diagnostic=readSafeMetadata(latest);
  const card=`<div class="card"><h2>Google Home受信内容診断</h2>${diagnostic?`<dl class="status-list"><dt>最終受信</dt><dd>${esc(latest?.occurred_at||'—')}</dd><dt>Intent</dt><dd>${esc(diagnostic.intent||'—')}</dd><dt>Command</dt><dd>${esc(diagnostic.commandNames.join(' / ')||'—')}</dd><dt>Scene ID数</dt><dd>${esc(diagnostic.sceneIdCount)}</dd><dt>params keys</dt><dd>${esc(diagnostic.paramKeys.join(', ')||'なし')}</dd><dt>deactivate=true</dt><dd>${diagnostic.deactivateTrue?'あり':'なし'}</dd><dt>値付き引数</dt><dd>${diagnostic.scalarArgumentPresent?'あり':'なし'}</dd><dt>発話テキスト系field</dt><dd>${diagnostic.utteranceLikeFieldPresent?'あり':'なし'}</dd></dl>`:'<p>まだ診断対象のGoogle Home EXECUTEを受信していません。</p>'}<p class="small">受信payload本文・発話文・Scene ID本体・params値・OAuth token・stateは保存/表示しません。ここではGoogleから自由文や「240」のような値がFamilyToDoまで届いているかを、fieldの存在だけで確認します。</p></div>`;
  const html=await base.text();
  const marker='</main>';
  const body=html.includes(marker)?html.replace(marker,`${card}${marker}`):html.replace('</body>',`${card}</body>`);
  const headers=new Headers(base.headers);headers.delete('content-length');headers.set('cache-control','no-store');
  return new Response(body,{status:base.status,statusText:base.statusText,headers});
}
