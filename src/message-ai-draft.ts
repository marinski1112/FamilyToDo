import type { AppContext } from './app-context';
import { analyzeTaskRoughInput, type RoughTaskCandidate } from './task-rough-input-api';
import { json } from './response';
import { familyDate, DEFAULT_FAMILY_TIMEZONE } from './timezone';

type Row=Record<string,unknown>;
const words=(text:string)=>text.normalize('NFKC').toLowerCase().replace(/[ァ-ヶ]/g,c=>String.fromCharCode(c.charCodeAt(0)-0x60)).replace(/(?:お願いします|お願い|ください|よろしく|明後日|明日|今日|来週|今週|までに|しておいて|して|[\d\s\p{P}\p{S}])/gu,'');
export function messageTaskSimilarity(a:string,b:string):number{
  const left=words(a),right=words(b);if(left.length<2||right.length<2)return 0;
  if(left===right)return 1;
  if(left.includes(right)||right.includes(left))return Math.min(left.length,right.length)>=4?.8:.35;
  const pairs=(text:string)=>new Set(Array.from({length:text.length-1},(_,i)=>text.slice(i,i+2)));
  const x=pairs(left),y=pairs(right),common=[...x].filter(pair=>y.has(pair)).length;
  return common<2?0:2*common/(x.size+y.size);
}

/** Read-only draft; mutation continues through the existing confirmed conversion. */
export async function messageAiDraft(ctx:AppContext,messageId:number):Promise<Response>{
  const member=ctx.member;if(!member)return json({ok:false,error:'ログインが必要です。'},401);
  if(!Number.isSafeInteger(messageId)||messageId<=0)return json({ok:false,error:'伝言を選択してください。'},400);
  const message=await ctx.env.DB.prepare('SELECT id,text,created_at,updated_at,converted_to_task_id FROM messages WHERE id=? AND family_id=? LIMIT 1').bind(messageId,member.family_id).first<Row>();
  if(!message)return json({ok:false,error:'伝言が見つかりません。'},404);
  if(message.converted_to_task_id)return json({ok:true,already:true,taskId:Number(message.converted_to_task_id)});
  const text=String(message.text||'').trim();
  if(!text||text==='スタンプ')return json({ok:false,error:'文章のある伝言から下書きを作れます。'},400);
  if(text.length>4000)return json({ok:false,error:'AI入力は4,000文字までです。伝言を短くして再度お試しください。'},400);
  const timezone=String(member.family_timezone||ctx.env.APP_TIMEZONE||DEFAULT_FAMILY_TIMEZONE);
  const referenceDate=/^\d{4}-\d{2}-\d{2}/.test(String(message.created_at))?String(message.created_at).slice(0,10):familyDate(timezone);
  const rows=await ctx.env.DB.prepare(`SELECT t.id,t.title,date(COALESCE(t.start_at,t.due_at)) task_date FROM tasks t
    WHERE t.family_id=? AND t.visibility_scope='FAMILY' AND lower(COALESCE(t.status,''))<>'completed'
      AND upper(COALESCE(t.task_kind,'TASK')) IN ('TASK','EVENT')
      AND NOT EXISTS (SELECT 1 FROM recurrence_rules r WHERE r.task_id=t.id AND r.family_id=t.family_id)
      AND ((COALESCE(t.start_at,t.due_at) IS NULL AND date(t.created_at)>=date(?,'-30 days'))
        OR (date(COALESCE(t.start_at,t.due_at))<=date(?,'+45 days') AND date(COALESCE(t.end_at,t.due_at,t.start_at))>=date(?,'-14 days')))
    ORDER BY CASE WHEN COALESCE(t.start_at,t.due_at) IS NULL THEN 1 ELSE 0 END,abs(julianday(COALESCE(t.start_at,t.due_at))-julianday(?)),t.id DESC LIMIT 40`)
    .bind(member.family_id,referenceDate,referenceDate,referenceDate,referenceDate).all<Row>();
  const candidates:RoughTaskCandidate[]=rows.results.map(row=>({id:Number(row.id),title:String(row.title).slice(0,200),date:row.task_date?String(row.task_date):null}));
  const response=await analyzeTaskRoughInput(ctx,{primaryType:'task',fields:[{destination:'task',text}],summarize:true},{referenceDate,taskCandidates:candidates});
  const draft=await response.json() as any;if(!response.ok||!draft?.ok)return json(draft,response.status);
  const title=String(draft.items?.[0]?.title||'');
  const ranked=candidates.map(candidate=>({...candidate,score:Math.max(messageTaskSimilarity(title,candidate.title),messageTaskSimilarity(text,candidate.title))})).sort((a,b)=>b.score-a.score);
  const modelChoice=candidates.find(candidate=>candidate.id===draft.suggestedTaskId);
  const strong=ranked[0]?.score>=.6&&ranked[0].score-(ranked[1]?.score||0)>=.15?ranked[0]:null;
  const selected=modelChoice||strong;
  const suggestions=[...(selected?[selected]:[]),...ranked.filter(candidate=>candidate.score>=.25&&candidate.id!==selected?.id)].slice(0,3).map(({id,title,date})=>({id,title,date}));
  return json({ok:true,source:draft.source,reason:draft.reason,referenceDate,messageUpdatedAt:String(message.updated_at||''),originalText:text,
    item:draft.items[0],suggestedTaskId:selected?.id||null,suggestions,requiresConfirmation:true},200,{'cache-control':'no-store'});
}
