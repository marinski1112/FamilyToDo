import type {AppContext} from './app-context';
import {BadRequest,Forbidden} from './errors';
import {json} from './response';
import {parseChildFood} from './child-food-list';
import {familyDate,familyNow,DEFAULT_FAMILY_TIMEZONE} from './timezone';

type Row=Record<string,unknown>;
/** Called only behind the canonical importer POST/admin/nonempty-CSRF gate. */
export async function importExtras(ctx:AppContext,b:Row):Promise<Response>{
  const m=ctx.member;if(!m||!['OWNER','ADMIN'].includes(String(m.role).toUpperCase()))throw new Forbidden('管理者のみ操作できます。');
  const subjectId=Number(b.subject_id),action=String(b.action);
  if(!Number.isSafeInteger(subjectId)||subjectId<=0)throw new BadRequest('対象を選択してください。');
  const subject=await ctx.env.DB.prepare("SELECT id,name FROM family_log_subjects WHERE id=? AND family_id=? AND active=1 AND subject_kind IN ('BABY','CHILD')").bind(subjectId,m.family_id).first<Row>();
  if(!subject)throw new BadRequest('対象が見つかりません。');
  const tz=String(m.family_timezone||ctx.env.APP_TIMEZONE||DEFAULT_FAMILY_TIMEZONE),now=familyNow(tz);
  if(action==='foods_preview'||action==='foods_apply'){
    if(!Array.isArray(b.foods)||b.foods.length>100)throw new BadRequest('食材は1ファイル100件以内です。');
    const ready=await ctx.env.DB.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='child_food_entries'").first();
    if(!ready)throw new BadRequest('食材リストのDB更新が必要です（0081）。');
    const names=new Set<string>();
    const inputs=b.foods.map((raw:unknown)=>{
      if(!raw||typeof raw!=='object'||Array.isArray(raw))throw new BadRequest('食材の形式が不正です。');
      const f=raw as Row,form=new FormData();
      if(typeof f.name!=='string'||f.category!=null&&typeof f.category!=='string'||f.first_tried_on!=null&&typeof f.first_tried_on!=='string'||!Array.isArray(f.stages)||f.stages.some(x=>!['INITIAL','MIDDLE','LATE','COMPLETE'].includes(String(x))))throw new BadRequest('食材名・日付・段階を確認してください。');
      form.set('name',f.name);form.set('category',String(f.category||'OTHER'));form.set('first_tried_on',String(f.first_tried_on||''));
      for(const stage of f.stages)form.append('stage',String({INITIAL:1,MIDDLE:2,LATE:4,COMPLETE:8}[String(stage)]));
      const input=parseChildFood(form,familyDate(tz));if(!input||names.has(input.key))throw new BadRequest('食材の入力が不正、または同名食材が重複しています。');names.add(input.key);return input;
    });
    const existing=await ctx.env.DB.prepare('SELECT name_key FROM child_food_entries WHERE family_id=? AND subject_id=?').bind(m.family_id,subjectId).all<{name_key:string}>();
    const keys=new Set(existing.results.map(x=>x.name_key)),fresh=inputs.filter(x=>!keys.has(x.key));
    if(action==='foods_preview')return json({ok:true,total:inputs.length,new_count:fresh.length,existing_count:inputs.length-fresh.length});
    const statements=fresh.map(x=>ctx.env.DB.prepare('INSERT OR IGNORE INTO child_food_entries(family_id,subject_id,name,name_key,category,first_tried_on,stage_mask,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?)').bind(m.family_id,subjectId,x.name,x.key,x.category,x.date,x.mask,now,now));
    const results=statements.length?await ctx.env.DB.batch(statements):[];const added=results.reduce((n,r)=>n+Number(r.meta.changes||0),0);
    return json({ok:true,added,existing:inputs.length-added});
  }
  if(action==='reset_preview'){
    if(!await ctx.env.DB.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='child_food_entries'").first())throw new BadRequest('食材リストのDB更新が必要です（0081）。');
    const photos=await ctx.env.DB.prepare('SELECT COUNT(*) count FROM family_log_media fm JOIN family_logs l ON l.id=fm.log_id AND l.family_id=fm.family_id WHERE l.family_id=? AND l.subject_id=? AND l.deleted_at IS NULL').bind(m.family_id,subjectId).first<Row>();
    const logs=await ctx.env.DB.prepare('SELECT COUNT(*) count,COALESCE(MAX(id),0) cutoff FROM family_logs WHERE family_id=? AND subject_id=? AND deleted_at IS NULL').bind(m.family_id,subjectId).first<Row>();
    const batches=await ctx.env.DB.prepare('SELECT COALESCE(MAX(id),0) cutoff FROM family_log_import_batches WHERE family_id=? AND subject_id=?').bind(m.family_id,subjectId).first<Row>();
    const foods=await ctx.env.DB.prepare('SELECT COUNT(*) count,COALESCE(MAX(id),0) cutoff FROM child_food_entries WHERE family_id=? AND subject_id=?').bind(m.family_id,subjectId).first<Row>();
    return json({ok:true,subject_name:subject.name,photo_count:Number(photos?.count||0),log_count:Number(logs?.count||0),cutoff:Number(logs?.cutoff||0),batch_cutoff:Number(batches?.cutoff||0),food_count:Number(foods?.count||0),food_cutoff:Number(foods?.cutoff||0)});
  }
  if(action!=='reset_apply')throw new BadRequest('操作が不正です。');
  if(b.confirmation!==`${subject.name}の全ログを削除`)throw new BadRequest('確認文字が一致しません。');
  const cutoff=Number(b.cutoff),batchCutoff=Number(b.batch_cutoff),foodCutoff=Number(b.food_cutoff);
  if([cutoff,batchCutoff,foodCutoff].some(x=>!Number.isSafeInteger(x)||x<0)||typeof b.delete_foods!=='boolean')throw new BadRequest('削除範囲を再確認してください。');
  const selection='SELECT id FROM family_logs WHERE family_id=? AND subject_id=? AND id<=? AND deleted_at IS NULL ORDER BY id LIMIT 100';
  const statements=[
    ctx.env.DB.prepare(`UPDATE family_log_import_batches SET status='ROLLING_BACK' WHERE family_id=? AND subject_id=? AND id<=? AND (rolled_back_at IS NULL OR EXISTS(SELECT 1 FROM family_logs l WHERE l.import_batch_id=family_log_import_batches.id AND l.family_id=? AND l.subject_id=? AND l.id<=? AND l.deleted_at IS NULL))`).bind(m.family_id,subjectId,batchCutoff,m.family_id,subjectId,cutoff),
    ctx.env.DB.prepare(`UPDATE family_log_media SET reconcile_pending=1 WHERE family_id=? AND log_id IN (${selection})`).bind(m.family_id,m.family_id,subjectId,cutoff),
    ctx.env.DB.prepare(`UPDATE family_logs SET deleted_at=?,updated_at=? WHERE family_id=? AND subject_id=? AND id IN (${selection})`).bind(now,now,m.family_id,subjectId,m.family_id,subjectId,cutoff),
  ];
  if(b.delete_foods)statements.push(ctx.env.DB.prepare('DELETE FROM child_food_entries WHERE family_id=? AND subject_id=? AND id<=?').bind(m.family_id,subjectId,foodCutoff));
  await ctx.env.DB.batch(statements);
  const remaining=await ctx.env.DB.prepare('SELECT COUNT(*) count FROM family_logs WHERE family_id=? AND subject_id=? AND id<=? AND deleted_at IS NULL').bind(m.family_id,subjectId,cutoff).first<Row>();
  const remainingCount=Number(remaining?.count||0);
  if(remainingCount===0)await ctx.env.DB.prepare(`UPDATE family_log_import_batches SET status='ROLLED_BACK',rolled_back_by=CASE WHEN rolled_back_at IS NULL THEN ? ELSE rolled_back_by END,rolled_back_at=COALESCE(rolled_back_at,?) WHERE family_id=? AND subject_id=? AND id<=? AND status='ROLLING_BACK'`).bind(m.id,now,m.family_id,subjectId,batchCutoff).run();
  return json({ok:true,remaining:remainingCount});
}
