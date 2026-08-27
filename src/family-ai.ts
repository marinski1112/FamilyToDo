import { json } from './response';
import type { AppContext } from './app';

export const GEMINI_MODEL_DEFAULT='gemini-2.0-flash-lite';
const FAILURE='AI解析を利用できません';
const LOG_TYPES=['MILK','SLEEP','DIAPER','HOUSEWORK','TIMER','VACCINE','MEAL','MEDICINE','TEMPERATURE','WEIGHT','HEIGHT','MEMO'] as const;
const TOOLS=['daily_family_log_aggregate','quick_chore_stats','task_stats','schedule_lookup','family_log_latest'] as const;
type ToolName=typeof TOOLS[number]; type Args=Record<string,unknown>; type Row=Record<string,unknown>;
const dateOk=(v:unknown)=>v===undefined||/^\d{4}-\d{2}-\d{2}$/.test(String(v));
const jstNow=()=>new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Tokyo',dateStyle:'short',timeStyle:'medium',hourCycle:'h23'}).format(new Date());

export const FAMILY_AI_FUNCTIONS=[
 {name:'daily_family_log_aggregate',description:'Family LogをJST日単位で集計',parameters:{type:'OBJECT',properties:{subject_ref:{type:'STRING'},log_type:{type:'STRING',enum:[...LOG_TYPES]},date_from:{type:'STRING'},date_to:{type:'STRING'},metric:{type:'STRING',enum:['SUM_AMOUNT','COUNT','SUM_DURATION','AVG_AMOUNT']},threshold:{type:'NUMBER'},comparison:{type:'STRING',enum:['GTE','GT','LTE','LT','EQ']},order:{type:'STRING',enum:['ASC','DESC']},limit:{type:'INTEGER'}},required:['log_type','metric']}},
 {name:'quick_chore_stats',description:'ちょこっと家事を実行者(created_by)で集計',parameters:{type:'OBJECT',properties:{member_ref:{type:'STRING'},chore_id:{type:'INTEGER'},date_from:{type:'STRING'},date_to:{type:'STRING'},group_by:{type:'STRING',enum:['NONE','DAY','CHORE','MEMBER']}},required:['date_from','date_to','group_by']}},
 {name:'task_stats',description:'共有タスクの件数または一覧',parameters:{type:'OBJECT',properties:{member_ref:{type:'STRING'},date_from:{type:'STRING'},date_to:{type:'STRING'},status:{type:'STRING',enum:['PENDING','COMPLETED','ALL']},task_kind:{type:'STRING',enum:['TASK','EVENT','ALL']},count_only:{type:'BOOLEAN'}},required:['status','task_kind','count_only']}},
 {name:'schedule_lookup',description:'共有予定を期間検索',parameters:{type:'OBJECT',properties:{date_from:{type:'STRING'},date_to:{type:'STRING'},member_ref:{type:'STRING'}},required:['date_from','date_to']}},
 {name:'family_log_latest',description:'指定対象・種類の最新Family Log',parameters:{type:'OBJECT',properties:{subject_ref:{type:'STRING'},log_type:{type:'STRING',enum:[...LOG_TYPES]},date_from:{type:'STRING'},date_to:{type:'STRING'}},required:['subject_ref','log_type']}}
];

async function tokenize(db:D1Database,familyId:number,question:string){
 const [members,subjects]=await Promise.all([db.prepare('SELECT id,name FROM members WHERE family_id=? AND active=1 AND deleted_at IS NULL ORDER BY id').bind(familyId).all<Row>(),db.prepare('SELECT id,name FROM family_log_subjects WHERE family_id=? AND active=1 ORDER BY id').bind(familyId).all<Row>()]);
 const refs=new Map<string,number>(), duplicate:string[]=[]; let q=question;
 for(const [kind,rows] of [['MEMBER',members.results],['SUBJECT',subjects.results]] as const){
  const counts=new Map<string,number>(); for(const r of rows)counts.set(String(r.name),(counts.get(String(r.name))||0)+1);
  for(let i=0;i<rows.length;i++){const name=String(rows[i].name),ref=`${kind}_${i+1}`;refs.set(ref,Number(rows[i].id));if(q.includes(name)){if((counts.get(name)||0)>1)duplicate.push(name);else q=q.split(name).join(ref);}}
 }
 return {question:q,refs,duplicate:[...new Set(duplicate)]};
}
function validate(name:string,args:Args){
 if(!TOOLS.includes(name as ToolName))throw new Error('invalid tool');
 if(Object.values(args).some(v=>typeof v==='string'&&/\b(SELECT|INSERT|UPDATE|DELETE|DROP|ALTER)\b/i.test(v)))throw new Error('SQL is forbidden');
 if(!dateOk(args.date_from)||!dateOk(args.date_to))throw new Error('invalid date');
 if(args.log_type&&!LOG_TYPES.includes(String(args.log_type) as any))throw new Error('invalid log type');
}
function resolve(refs:Map<string,number>,ref:unknown,kind:'MEMBER'|'SUBJECT'){if(ref===undefined)return null;const key=String(ref);if(!key.startsWith(kind+'_')||!refs.has(key))throw new Error('invalid reference');return refs.get(key)!;}
const range=(a:Args)=>({from:String(a.date_from||'0001-01-01'),to:String(a.date_to||'9999-12-31')});

export async function executeFamilyAiTool(db:D1Database,familyId:number,name:string,a:Args,refs=new Map<string,number>()){
 validate(name,a); const {from,to}=range(a);
 if(name==='daily_family_log_aggregate'){
  const sid=resolve(refs,a.subject_ref,'SUBJECT'),metric=String(a.metric),expr=metric==='COUNT'?'COUNT(*)':metric==='SUM_DURATION'?'COALESCE(SUM(duration_minutes),0)':metric==='AVG_AMOUNT'?'ROUND(AVG(amount),2)':'COALESCE(SUM(amount),0)';
  const cmp:{[k:string]:string}={GTE:'>=',GT:'>',LTE:'<=',LT:'<',EQ:'='},having=a.threshold===undefined?'':` HAVING ${expr} ${cmp[String(a.comparison||'GTE')]} ?`; const binds:any[]=[familyId,String(a.log_type),from,to];if(sid)binds.splice(2,0,sid);if(a.threshold!==undefined)binds.push(Number(a.threshold));binds.push(Math.min(100,Math.max(1,Number(a.limit||31))));
  const sql=`SELECT substr(datetime(occurred_at,'+9 hours'),1,10) day,${expr} value FROM family_logs WHERE family_id=? AND log_type=? ${sid?'AND subject_id=?':''} AND deleted_at IS NULL AND substr(datetime(occurred_at,'+9 hours'),1,10) BETWEEN ? AND ? GROUP BY day${having} ORDER BY day ${String(a.order)==='ASC'?'ASC':'DESC'} LIMIT ?`;
  return (await db.prepare(sql).bind(...binds).all<Row>()).results;
 }
 if(name==='quick_chore_stats'){
  const mid=resolve(refs,a.member_ref,'MEMBER'),group=String(a.group_by),select=group==='DAY'?"substr(datetime(l.occurred_at,'+9 hours'),1,10) label":group==='CHORE'?'COALESCE(c.name,\'未設定\') label':group==='MEMBER'?'COALESCE(m.name,\'不明\') label':"'合計' label";const binds:any[]=[familyId,from,to];if(mid)binds.push(mid);if(a.chore_id)binds.push(Number(a.chore_id));
  return (await db.prepare(`SELECT ${select},COUNT(*) value FROM family_logs l LEFT JOIN family_quick_chores c ON c.id=l.quick_chore_id AND c.family_id=l.family_id LEFT JOIN members m ON m.id=l.created_by AND m.family_id=l.family_id WHERE l.family_id=? AND l.log_type='HOUSEWORK' AND l.deleted_at IS NULL AND substr(datetime(l.occurred_at,'+9 hours'),1,10) BETWEEN ? AND ? ${mid?'AND l.created_by=?':''} ${a.chore_id?'AND l.quick_chore_id=?':''} GROUP BY label ORDER BY value DESC`).bind(...binds).all<Row>()).results;
 }
 const mid=resolve(refs,a.member_ref,'MEMBER'); const binds:any[]=[familyId,from,to];if(mid)binds.push(mid);
 const conditions=`t.family_id=? AND COALESCE(t.visibility_scope,'FAMILY')='FAMILY' AND substr(COALESCE(t.start_at,t.due_at),1,10) BETWEEN ? AND ? ${mid?'AND EXISTS(SELECT 1 FROM task_assignees ta WHERE ta.task_id=t.id AND ta.member_id=?)':''}`;
 if(name==='schedule_lookup')return (await db.prepare(`SELECT t.title,t.task_kind,t.start_at,t.end_at,t.due_at,t.location FROM tasks t WHERE ${conditions} AND t.calendar_visible=1 ORDER BY COALESCE(t.start_at,t.due_at) LIMIT 50`).bind(...binds).all<Row>()).results;
 if(name==='task_stats'){const status=String(a.status||'ALL'),kind=String(a.task_kind||'ALL'),extra=`${status==='ALL'?'':' AND t.status=?'}${kind==='ALL'?'':' AND upper(t.task_kind)=?'}`;if(status!=='ALL')binds.push(status.toLowerCase());if(kind!=='ALL')binds.push(kind);const cols=a.count_only?'COUNT(*) value':'t.title,t.status,t.task_kind,t.due_at,t.start_at';return (await db.prepare(`SELECT ${cols} FROM tasks t WHERE ${conditions}${extra}${a.count_only?'':' ORDER BY COALESCE(t.start_at,t.due_at) LIMIT 50'}`).bind(...binds).all<Row>()).results;}
 const sid=resolve(refs,a.subject_ref,'SUBJECT');return (await db.prepare("SELECT occurred_at,amount,unit,duration_minutes,value_text FROM family_logs WHERE family_id=? AND subject_id=? AND log_type=? AND deleted_at IS NULL AND substr(datetime(occurred_at,'+9 hours'),1,10) BETWEEN ? AND ? ORDER BY occurred_at DESC LIMIT 1").bind(familyId,sid,String(a.log_type),from,to).all<Row>()).results;
}
function answer(name:string,rows:Row[],args:Args){if(!rows.length)return '該当する記録はありません。';if(name==='schedule_lookup')return rows.map(r=>`${String(r.start_at||r.due_at).slice(0,16)} ${r.title}`).join('\n');const unit=name==='quick_chore_stats'||name==='task_stats'||args.metric==='COUNT'?'件':args.metric==='SUM_DURATION'?'分':args.log_type==='MILK'?'ml':'';if(rows.length===1&&'value' in rows[0])return `${rows[0].day?`${rows[0].day}: `:''}${rows[0].value}${unit}`;return rows.map(r=>`${r.day||r.label||String(r.occurred_at||'').slice(0,16)}: ${r.value??r.amount??r.value_text??''}${'value' in r?unit:''}`).join('\n');}
export async function familyAiQuery(request:Request,ctx:AppContext){
 if(!ctx.member)return json({ok:false,error:'ログインが必要です。'},401);if(request.method!=='POST')return json({ok:false,error:'POST only'},405);
 const body=await request.json().catch(()=>null) as any,q=String(body?.question||'').trim();if(!q||q.length>500)return json({ok:false,error:'質問を入力してください。'},400);if(!ctx.env.GEMINI_API_KEY)return json({ok:false,error:FAILURE},503);
 try{const tok=await tokenize(ctx.env.DB,ctx.member.family_id,q);if(tok.duplicate.length)return json({ok:true,clarification:true,answer:`${tok.duplicate[0]}が2件あります。どちらですか？`});
  const model=ctx.env.GEMINI_MODEL||GEMINI_MODEL_DEFAULT,res=await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(ctx.env.GEMINI_API_KEY)}`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({systemInstruction:{parts:[{text:`JST現在: ${jstNow()}。必ず指定されたread-only functionを1つ呼ぶ。SQLや自然文回答を生成しない。名前tokenをそのままrefへ使う。`} ]},contents:[{role:'user',parts:[{text:tok.question}]}],tools:[{functionDeclarations:FAMILY_AI_FUNCTIONS}],toolConfig:{functionCallingConfig:{mode:'ANY',allowedFunctionNames:[...TOOLS]}}})});if(!res.ok)throw new Error('gemini unavailable');const data=await res.json() as any,call=data?.candidates?.[0]?.content?.parts?.find((p:any)=>p.functionCall)?.functionCall;if(!call)throw new Error('no function');const rows=await executeFamilyAiTool(ctx.env.DB,ctx.member.family_id,String(call.name),call.args||{},tok.refs);return json({ok:true,answer:answer(String(call.name),rows,call.args||{}),tool:String(call.name)});
 }catch{return json({ok:false,error:FAILURE},503);}
}
