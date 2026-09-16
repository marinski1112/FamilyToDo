/** Imported diary routing only. Canonical rows and authenticated photo IDs stay intact. */
export const IMPORTED_FAMILY_DIARY_SQL=`(l.log_type='MEMO' AND l.detail_code='JOURNAL_MEMO' AND EXISTS (
 SELECT 1 FROM family_log_import_batches ib JOIN family_log_journal_entries ij ON ij.log_id=l.id AND ij.family_id=l.family_id AND ij.subject_id=l.subject_id
 WHERE ib.id=l.import_batch_id AND ib.family_id=l.family_id AND ib.subject_id=l.subject_id AND lower(ib.source)='piyolog'
 AND ij.journal_kind='CHILD' AND ij.entry_kind='MEMO'))`;
type Row=Record<string,unknown>;
const esc=(v:unknown)=>String(v??'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&#39;');
export async function importedFamilyDiary(db:D1Database,familyId:number,month:string,to:string,date:string,page:number){
 const from=`${month}-01`,limit=100;
 const counts=await db.prepare(`SELECT substr(l.occurred_at,1,10) day,COUNT(*) count FROM family_logs l WHERE l.family_id=? AND l.deleted_at IS NULL AND l.occurred_at>=? AND l.occurred_at<? AND ${IMPORTED_FAMILY_DIARY_SQL} GROUP BY substr(l.occurred_at,1,10)`).bind(familyId,from,to).all<Row>();
 const rows=await db.prepare(`SELECT l.id,l.occurred_at,l.value_text,l.note,s.name subject_name,fm.id media_id FROM family_logs l
 JOIN family_log_subjects s ON s.id=l.subject_id AND s.family_id=l.family_id
 LEFT JOIN family_log_media fm ON fm.log_id=l.id AND fm.family_id=l.family_id AND fm.subject_id=l.subject_id
 WHERE l.family_id=? AND l.deleted_at IS NULL AND l.occurred_at>=? AND l.occurred_at<? AND (?='' OR substr(l.occurred_at,1,10)=?) AND ${IMPORTED_FAMILY_DIARY_SQL}
 ORDER BY l.occurred_at DESC,l.id DESC LIMIT ? OFFSET ?`).bind(familyId,from,to,date,date,limit+1,(page-1)*limit).all<Row>();
 const entries=rows.results.slice(0,limit).map(r=>{const day=String(r.occurred_at).slice(0,10),mediaId=Number(r.media_id),photo=Number.isSafeInteger(mediaId)&&mediaId>0?`<a href="/api/family-log-media?media=${mediaId}" target="_blank" rel="noopener" aria-label="写真を開く"><img src="/api/family-log-media?media=${mediaId}" loading="lazy" width="96" height="96" style="object-fit:cover;border-radius:10px" alt="育児日記の写真"></a>`:'';return `<article class="imported-diary-entry" data-mitenya-log="${Number(r.id)}"><div><small>${esc(day)}・${esc(r.subject_name)}</small><h3>${esc(r.value_text)}</h3>${r.note?`<p style="white-space:pre-wrap">${esc(r.note)}</p>`:''}</div>${photo}</article>`;}).join('');
 const url=`?month=${month}${date?`&date=${date}`:''}`;
 const nav=`${page>1?`<a class="btn gray small" href="${url}&diary_page=${page-1}#imported-diaries">前の100件</a>`:''}${rows.results.length>limit?`<a class="btn gray small" href="${url}&diary_page=${page+1}#imported-diaries">次の100件</a>`:''}`;
 return {counts:new Map(counts.results.map(r=>[String(r.day),Number(r.count)])),html:`<section class="card" id="imported-diaries"><h2>📖 育児日記</h2><p class="small">${esc(date||month)}の取り込んだ日記。原文・写真を保持し、自動総括では上書きしません。</p>${entries||'<p class="small">この期間の育児日記はありません。</p>'}<div class="actions">${nav}</div></section><style>.imported-diary-entry{display:flex;align-items:flex-start;gap:12px;padding:12px 0;border-top:1px solid #eee}.imported-diary-entry>div{flex:1;min-width:0;overflow-wrap:anywhere}.imported-diary-entry h3{margin:4px 0}.imported-diary-entry>a{flex-shrink:0}</style>`};
}
