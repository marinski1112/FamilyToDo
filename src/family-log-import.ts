import { json, html } from './response';
import { layout, type AppContext, AuthRequired, BadRequest, Forbidden } from './app';

type Row=Record<string,unknown>;
type ImportRecord=Record<string,unknown>;
const FORMAT='familytodo-family-log-import-v1';
const TYPES:Record<string,{icon:string;label:string;units:string[]}>= {
  MILK:{icon:'🍼',label:'ミルク',units:['ml']},BREASTFEED:{icon:'🤱',label:'母乳',units:[]},MEAL:{icon:'🍚',label:'食事',units:[]},DIAPER:{icon:'🧷',label:'おむつ',units:[]},SLEEP:{icon:'😴',label:'睡眠',units:[]},BATH:{icon:'🛁',label:'お風呂',units:[]},TEMPERATURE:{icon:'🌡️',label:'体温',units:['°C','℃']},MEDICINE:{icon:'💊',label:'薬',units:[]},CONDITION:{icon:'🙂',label:'体調',units:[]},WEIGHT:{icon:'⚖️',label:'体重',units:['kg']},HEIGHT:{icon:'📏',label:'身長',units:['cm']},BLOOD_PRESSURE:{icon:'🫀',label:'血圧',units:[]},EXERCISE:{icon:'🏃',label:'運動',units:[]},WATER:{icon:'💧',label:'水分',units:['ml']},TOILET:{icon:'🚻',label:'トイレ',units:[]},WALK:{icon:'🐕',label:'散歩',units:[]},MEMO:{icon:'📝',label:'メモ',units:[]}
};
const esc=(v:unknown)=>String(v??'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;');
const nowJst=()=>new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Tokyo',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'}).format(new Date());
const member=(ctx:AppContext)=>{if(!ctx.member)throw new AuthRequired();return ctx.member;};
const admin=(m:unknown)=>['OWNER','ADMIN'].includes(String((m as Row)?.role||'').toUpperCase());
async function body(request:Request){const x=await request.json().catch(()=>null);if(!x||typeof x!=='object'||Array.isArray(x))throw new BadRequest('JSONが不正です。');return x as Record<string,unknown>;}
async function hash(value:string){const bytes=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value));return [...new Uint8Array(bytes)].map(x=>x.toString(16).padStart(2,'0')).join('');}
function text(v:unknown,max:number){if(v===null||v===undefined)return null;const x=String(v).trim();if(x.length>max)throw new Error(`${max}文字を超えています`);return x||null;}
function normalize(r:ImportRecord){
  const type=String(r.log_type||'').toUpperCase();if(type==='UNSUPPORTED'||!TYPES[type])throw new Error(type==='UNSUPPORTED'?'未対応':'未対応の種類');
  const d=new Date(String(r.occurred_at||''));if(!r.occurred_at||!Number.isFinite(d.getTime()))throw new Error('日時が不正です');
  const occurredAt=d.toISOString().slice(0,19).replace('T',' ');
  const amount=r.amount===null||r.amount===undefined?null:Number(r.amount);if(amount!==null&&!Number.isFinite(amount))throw new Error('数値が不正です');
  const duration=r.duration_minutes===null||r.duration_minutes===undefined?null:Number(r.duration_minutes);if(duration!==null&&(!Number.isInteger(duration)||duration<0||duration>10080))throw new Error('時間が不正です');
  const unit=text(r.unit,40);if(unit&&TYPES[type].units.length&&!TYPES[type].units.includes(unit))throw new Error('単位が種類に適合しません');
  if(unit&&!TYPES[type].units.length)throw new Error('この種類に単位は指定できません');
  const detail=text(r.detail_code,40),value=text(r.value_text,255),note=text(r.note,2000),sourceText=text(r.source_text,4000);
  const page=r.source_page===null||r.source_page===undefined?null:Number(r.source_page);if(page!==null&&(!Number.isInteger(page)||page<1))throw new Error('ページ番号が不正です');
  return {external_id:text(r.external_id,255),occurred_at:occurredAt,log_type:type,detail_code:detail,amount,unit,duration_minutes:duration,value_text:value,note,source_text:sourceText,source_page:page};
}
async function inspect(ctx:AppContext,subjectId:number,doc:Record<string,unknown>){
  const m=member(ctx);if(String(doc.format||'')!==FORMAT)throw new BadRequest('対応していないimport formatです。');
  const source=String(doc.source||'').trim().slice(0,80);if(!source)throw new BadRequest('sourceは必須です。');
  const records=doc.records;if(!Array.isArray(records)||records.length>5000)throw new BadRequest('recordsは5000件以内の配列にしてください。');
  const subject=await ctx.env.DB.prepare("SELECT id,name,subject_kind FROM family_log_subjects WHERE id=? AND family_id=? AND active=1 AND subject_kind IN ('BABY','CHILD','ADULT','PET','OTHER')").bind(subjectId,m.family_id).first<Row>();if(!subject)throw new BadRequest('取り込み先が見つかりません。');
  const rows=[] as any[],seen=new Set<string>(),typeCounts:Record<string,number>={};let fresh=0,duplicate=0,errors=0;
  for(let i=0;i<records.length;i++){try{const value=normalize(records[i] as ImportRecord);typeCounts[value.log_type]=(typeCounts[value.log_type]||0)+1;const canonical=JSON.stringify([m.family_id,subjectId,source,value.occurred_at,value.log_type,value.detail_code,value.amount,value.unit,value.duration_minutes,value.value_text,value.source_text]);const key=await hash(canonical);let exists=seen.has(key);if(!exists)exists=Boolean(await ctx.env.DB.prepare('SELECT 1 FROM family_logs WHERE family_id=? AND subject_id=? AND import_source_key=? AND deleted_at IS NULL LIMIT 1').bind(m.family_id,subjectId,key).first());seen.add(key);if(exists)duplicate++;else fresh++;rows.push({index:i,key,value,status:exists?'duplicate':'new'});}catch(e:any){errors++;rows.push({index:i,status:'error',error:String(e?.message||e),raw:records[i]});}}
  const sourceHash=await hash(JSON.stringify(doc));return {format:FORMAT,source,source_exported_at:text(doc.source_exported_at,80),source_hash:sourceHash,subject,record_count:records.length,new_count:fresh,duplicate_count:duplicate,error_count:errors,type_counts:typeCounts,rows};
}

export async function familyLogImportApi(request:Request,ctx:AppContext):Promise<Response>{
  const m=member(ctx);if(!admin(m))throw new Forbidden('インポートはOWNER / ADMINのみ行えます。');if(request.method!=='POST')return json({ok:false,error:'POST only'},405);
  const b=await body(request);if(String(b.csrf||'')!==String(ctx.session.csrfToken||''))throw new Forbidden('CSRF検証に失敗しました。');const action=String(b.action||'preview');
  if(action==='rollback'){
    const batchId=Number(b.batch_id||0),batch=await ctx.env.DB.prepare('SELECT * FROM family_log_import_batches WHERE id=? AND family_id=?').bind(batchId,m.family_id).first<Row>();if(!batch)throw new BadRequest('インポート履歴が見つかりません。');if(batch.rolled_back_at)return json({ok:true,already_rolled_back:true,deleted_count:0,edited_count:0});
    const edited=await ctx.env.DB.prepare('SELECT COUNT(*) c FROM family_logs WHERE import_batch_id=? AND family_id=? AND deleted_at IS NULL AND updated_at<>created_at').bind(batchId,m.family_id).first<Row>();const now=nowJst();
    const result=await ctx.env.DB.prepare('UPDATE family_logs SET deleted_at=?,updated_at=? WHERE import_batch_id=? AND family_id=? AND deleted_at IS NULL AND updated_at=created_at').bind(now,now,batchId,m.family_id).run();
    await ctx.env.DB.prepare('UPDATE family_log_import_batches SET rolled_back_at=?,rolled_back_by=? WHERE id=? AND family_id=? AND rolled_back_at IS NULL').bind(now,m.id,batchId,m.family_id).run();return json({ok:true,deleted_count:Number(result.meta.changes||0),edited_count:Number(edited?.c||0)});
  }
  const subjectId=Number(b.subject_id||0),doc=b.document;if(!doc||typeof doc!=='object'||Array.isArray(doc))throw new BadRequest('import documentが不正です。');const preview=await inspect(ctx,subjectId,doc as Record<string,unknown>);if(action==='preview')return json({ok:true,...preview,rows:preview.rows.slice(0,50)});if(action!=='confirm')throw new BadRequest('操作が不正です。');
  const filename=text(b.source_filename,255),now=nowJst();const batchResult=await ctx.env.DB.prepare('INSERT INTO family_log_import_batches(family_id,subject_id,source,source_filename,source_hash,record_count,imported_count,skipped_count,error_count,created_by,created_at) VALUES(?,?,?,?,?,?,0,?,?,?,?)').bind(m.family_id,subjectId,preview.source,filename,preview.source_hash,preview.record_count,preview.duplicate_count,preview.error_count,m.id,now).run();const batchId=Number(batchResult.meta.last_row_id);let imported=0,skipped=preview.duplicate_count;
  for(const row of preview.rows.filter(x=>x.status==='new')){const v=row.value;const result=await ctx.env.DB.prepare('INSERT OR IGNORE INTO family_logs(family_id,subject_id,log_type,occurred_at,detail_code,amount,unit,duration_minutes,value_text,note,linked_task_id,linked_occurrence_id,created_by,created_at,updated_at,import_batch_id,import_source_key,import_source_text,import_source_page,import_external_id) VALUES(?,?,?,?,?,?,?,?,?,?,NULL,NULL,?,?,?,?,?,?,?,?)').bind(m.family_id,subjectId,v.log_type,v.occurred_at,v.detail_code,v.amount,v.unit,v.duration_minutes,v.value_text,v.note,m.id,now,now,batchId,row.key,v.source_text,v.source_page,v.external_id).run();if(result.meta.changes)imported++;else skipped++;}
  await ctx.env.DB.prepare('UPDATE family_log_import_batches SET imported_count=?,skipped_count=? WHERE id=?').bind(imported,skipped,batchId).run();return json({ok:true,batch_id:batchId,imported_count:imported,skipped_count:skipped,error_count:preview.error_count});
}

export async function familyLogImportPage(ctx:AppContext):Promise<Response>{
  const m=member(ctx);if(!admin(m))throw new Forbidden('インポートはOWNER / ADMINのみ行えます。');const [subjects,batches]=await Promise.all([ctx.env.DB.prepare("SELECT id,name,subject_kind FROM family_log_subjects WHERE family_id=? AND active=1 AND subject_kind IN ('BABY','CHILD','ADULT','PET','OTHER') ORDER BY id").bind(m.family_id).all<Row>(),ctx.env.DB.prepare('SELECT b.*,s.name subject_name,c.name creator_name FROM family_log_import_batches b LEFT JOIN family_log_subjects s ON s.id=b.subject_id LEFT JOIN members c ON c.id=b.created_by WHERE b.family_id=? ORDER BY b.id DESC LIMIT 50').bind(m.family_id).all<Row>()]);
  const payload=JSON.stringify({csrf:ctx.session.csrfToken||'',types:TYPES}).replaceAll('<','\\u003c');const history=batches.results.map(b=>`<div class="import-history-row"><div><strong>${esc(b.source)} → ${esc(b.subject_name)}</strong><div class="meta">${esc(b.created_at)} / ${esc(b.creator_name)}${b.source_filename?` / ${esc(b.source_filename)}`:''}</div><div class="small">全${b.record_count}・取込${b.imported_count}・重複${b.skipped_count}・エラー${b.error_count} ${b.rolled_back_at?'（取消済み）':''}</div></div>${b.rolled_back_at?'':`<button class="btn danger small import-rollback" data-id="${b.id}">このインポートを取り消す</button>`}</div>`).join('');
  const bodyHtml=`<div class="page-head"><div><div class="eyebrow">Family Log</div><h1>📥 データをインポート</h1></div><a class="btn gray" href="/app/family_log.php">戻る</a></div><div class="notice">標準JSON（<code>${FORMAT}</code>）だけを受け付けます。PDF・OCR解析は行いません。</div><div class="card import-wizard"><ol><li>対象を選択</li><li>JSONファイル選択</li><li>解析</li><li>プレビュー</li><li>インポート確定</li></ol><label>取り込み先</label><select id="importSubject"><option value="">選択してください</option>${subjects.results.map(s=>`<option value="${s.id}">${esc(s.name)} (${esc(s.subject_kind)})</option>`).join('')}</select><label>JSONファイル</label><input id="importFile" type="file" accept="application/json,.json"><button id="importPreview" type="button">解析してプレビュー</button><div id="importStatus" class="small"></div><div id="importPreviewOut"></div></div><div class="card"><h2>インポート履歴</h2>${history||'<p class="empty">履歴はありません。</p>'}</div><script type="application/json" id="familyLogImportPayload">${payload}</script><script src="/assets/family-log-import.js?v=12.107-wave88"></script>`;return html(layout('Family Logインポート',bodyHtml,'/app/family_log.php'));
}
