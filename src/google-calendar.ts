export * from './google-calendar-core';

import { json } from './response';
import type { AppContext } from './app-context';
import { utcNow } from './timezone';
import {
  calendarBackfill as coreCalendarBackfill,
  integrationsSettings as coreIntegrationsSettings,
  processCalendarOutbox as coreProcessCalendarOutbox,
} from './google-calendar-core';

type Row = Record<string, unknown>;
const PROVIDER = 'GOOGLE_CALENDAR';
const OUTBOX_LIMIT = 20;
const now = () => utcNow();

async function eventResetStats(db: D1Database, familyId: number) {
  const [events, rules, dependencies] = await Promise.all([
    db.prepare("SELECT COUNT(*) c FROM tasks WHERE family_id=? AND upper(COALESCE(task_kind,'TASK'))='EVENT'").bind(familyId).first<Row>(),
    db.prepare("SELECT COUNT(*) c FROM recurrence_rules r JOIN tasks t ON t.id=r.task_id AND t.family_id=r.family_id WHERE r.family_id=? AND upper(COALESCE(t.task_kind,'TASK'))='EVENT'").bind(familyId).first<Row>(),
    db.prepare(`SELECT
      (SELECT COUNT(*) FROM task_assignees x JOIN tasks t ON t.id=x.task_id WHERE t.family_id=? AND upper(COALESCE(t.task_kind,'TASK'))='EVENT')+
      (SELECT COUNT(*) FROM task_completions x JOIN tasks t ON t.id=x.task_id WHERE t.family_id=? AND upper(COALESCE(t.task_kind,'TASK'))='EVENT')+
      (SELECT COUNT(*) FROM items x JOIN tasks t ON t.id=x.task_id WHERE t.family_id=? AND upper(COALESCE(t.task_kind,'TASK'))='EVENT')+
      (SELECT COUNT(*) FROM shopping_items x JOIN tasks t ON t.id=x.task_id WHERE t.family_id=? AND upper(COALESCE(t.task_kind,'TASK'))='EVENT') c`).bind(familyId,familyId,familyId,familyId).first<Row>(),
  ]);
  return { event_count:Number(events?.c||0), recurring_rule_count:Number(rules?.c||0), dependency_count:Number(dependencies?.c||0) };
}

export async function processCalendarOutbox(env: Env, limit = 10, familyId?: number) {
  return coreProcessCalendarOutbox(env, Math.min(Math.max(1, limit), OUTBOX_LIMIT), familyId);
}

export async function calendarBackfill(request: Request, ctx: AppContext) {
  const forwarded = request.clone();
  if (!ctx.member) return json({ ok: false }, 401);
  const role = String(ctx.member.role || '').toUpperCase();
  if (!['OWNER', 'ADMIN'].includes(role)) return json({ ok: false }, 403);
  if (request.method !== 'POST') return json({ ok: false }, 405);
  const body = await request.json().catch(() => ({})) as Record<string, unknown>;
  if (String(body.csrf || '') !== String(ctx.session.csrfToken || '')) return json({ ok: false }, 403);
  const action = String(body.action || 'preview');
  const familyId = ctx.member.family_id;

  if (action === 'preview_event_reset') {
    return json({ok:true,...await eventResetStats(ctx.env.DB,familyId)});
  }

  if (action === 'reset_event_data') {
    if (String(body.confirm || '') !== 'RESET_ALL_EVENTS') return json({ok:false,error:'確認文字列が一致しません'},400);
    const stats = await eventResetStats(ctx.env.DB,familyId);
    if (stats.dependency_count > 0) return json({ok:false,error:`EVENTに担当・完了・買い物・持ち物の関連データが${stats.dependency_count}件あります。先に関連データを整理してください。`,...stats},409);
    if (!stats.event_count) return json({ok:true,deleted_events:0,deleted_rules:0,reset_import_entries:0});
    const eventIds = "SELECT id FROM tasks WHERE family_id=? AND upper(COALESCE(task_kind,'TASK'))='EVENT'";
    const ruleIds = `SELECT r.id FROM recurrence_rules r JOIN tasks t ON t.id=r.task_id AND t.family_id=r.family_id WHERE r.family_id=? AND upper(COALESCE(t.task_kind,'TASK'))='EVENT'`;
    const n = now();
    const results = await ctx.env.DB.batch([
      ctx.env.DB.prepare(`DELETE FROM recurrence_occurrences WHERE family_id=? AND recurrence_rule_id IN (${ruleIds})`).bind(familyId,familyId),
      ctx.env.DB.prepare(`DELETE FROM recurrence_rules WHERE family_id=? AND task_id IN (${eventIds})`).bind(familyId,familyId),
      ctx.env.DB.prepare(`DELETE FROM external_calendar_links WHERE family_id=? AND task_id IN (${eventIds})`).bind(familyId,familyId),
      ctx.env.DB.prepare(`DELETE FROM calendar_sync_outbox WHERE family_id=? AND task_id IN (${eventIds})`).bind(familyId,familyId),
      ctx.env.DB.prepare(`UPDATE calendar_import_entries SET status='ROLLED_BACK',task_id=NULL,recurrence_rule_id=NULL WHERE family_id=? AND source_format='ICS' AND task_id IN (${eventIds})`).bind(familyId,familyId),
      ctx.env.DB.prepare("DELETE FROM tasks WHERE family_id=? AND upper(COALESCE(task_kind,'TASK'))='EVENT'").bind(familyId),
      ctx.env.DB.prepare("INSERT INTO activity_logs(family_id,member_id,action,target_type,target_id,metadata,occurred_at) VALUES(?,?,'CALENDAR_EVENT_RESET','calendar',NULL,?,?)").bind(familyId,ctx.member.id,JSON.stringify(stats),n),
    ]);
    return json({ok:true,deleted_events:stats.event_count,deleted_rules:stats.recurring_rule_count,reset_import_entries:Number(results[4]?.meta?.changes||0),next:'新しい同期用カレンダーを作成してからICSを再インポートしてください'});
  }

  if (action === 'diagnose_projection' || action === 'rebind_projection' || String(body.scope || 'normal') !== 'event_history') {
    return coreCalendarBackfill(forwarded, ctx);
  }

  const count = Number((await ctx.env.DB.prepare("SELECT COUNT(*) c FROM tasks WHERE family_id=? AND task_kind='EVENT' AND visibility_scope='FAMILY' AND calendar_visible=1 AND recurrence_rule IS NULL AND (start_at IS NOT NULL OR due_at IS NOT NULL)")
    .bind(familyId).first<Row>())?.c || 0);
  if (action !== 'enqueue') return json({ ok: true, target_count: count, enqueued: 0, scope: 'event_history', paged: true, policy: '全履歴のFAMILY EVENT（PRIVATEは除外）' });

  const n = now();
  const result = await ctx.env.DB.prepare(`INSERT INTO calendar_sync_outbox(family_id,task_id,provider,operation,status,next_retry_at,created_at,updated_at)
    SELECT t.family_id,t.id,?,
      CASE WHEN EXISTS(SELECT 1 FROM external_calendar_links l WHERE l.family_id=t.family_id AND l.provider=? AND l.task_id=t.id AND l.deleted_at IS NULL) THEN 'UPDATE' ELSE 'CREATE' END,
      'PENDING',?,?,?
    FROM tasks t
    WHERE t.family_id=? AND t.task_kind='EVENT' AND t.visibility_scope='FAMILY' AND t.calendar_visible=1 AND t.recurrence_rule IS NULL AND (t.start_at IS NOT NULL OR t.due_at IS NOT NULL)
    ON CONFLICT(provider,task_id) DO UPDATE SET
      operation=CASE WHEN calendar_sync_outbox.operation='CREATE' THEN 'CREATE' ELSE excluded.operation END,
      status='PENDING',retry_count=0,next_retry_at=excluded.next_retry_at,last_error=NULL,updated_at=excluded.updated_at`)
    .bind(PROVIDER, PROVIDER, n, n, n, familyId).run();
  return json({ ok: true, target_count: count, enqueued: Number(result.meta.changes || 0), scope: 'event_history', paged: true, policy: '全履歴のFAMILY EVENT（PRIVATEは除外）' });
}

export async function integrationsSettings(request: Request, ctx: AppContext) {
  const response = await coreIntegrationsSettings(request, ctx);
  const type = response.headers.get('content-type') || '';
  if (!type.includes('text/html')) return response;
  let source = await response.text();
  const enhancement = `<style>.calendar-backfill-limit{display:none!important}.calendar-event-tools{display:flex;gap:6px;flex-wrap:wrap;margin-top:8px}</style><script>(()=>{const clean=()=>document.querySelectorAll('.calendar-backfill-limit').forEach(el=>el.remove());clean();new MutationObserver(clean).observe(document.body,{childList:true,subtree:true});const history=document.getElementById('calendarHistoryBackfill');if(history&&!document.getElementById('calendarBatchNote')){const note=document.createElement('div');note.id='calendarBatchNote';note.className='small';note.textContent='全履歴EVENTは全件キュー登録できます。Google APIへの送信はWorker上限を避けるため小分けで処理します。';history.insertAdjacentElement('afterend',note);const tools=document.createElement('div');tools.className='calendar-event-tools';tools.innerHTML='<button type="button" class="btn danger" id="calendarEventReset">EVENTを全クリア</button>';note.insertAdjacentElement('afterend',tools);const result=document.getElementById('calendarResult');const call=async(action,extra={})=>{const r=await fetch('/api/google-calendar/backfill',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({csrf,action,...extra})});const d=await r.json();if(!r.ok||d.ok===false)throw new Error(d.error||('HTTP '+r.status));return d};tools.querySelector('#calendarEventReset').addEventListener('click',async e=>{const b=e.currentTarget;b.disabled=true;try{const p=await call('preview_event_reset');if(p.dependency_count){result.textContent='EVENT全クリア不可: 関連データ '+p.dependency_count+'件があります。';return}if(!confirm('Family TODOのEVENT '+p.event_count+'件'+(p.recurring_rule_count?'（定期rule '+p.recurring_rule_count+'件を含む）':'')+'を全削除します。TASKは削除しません。続行しますか？'))return;const d=await call('reset_event_data',{confirm:'RESET_ALL_EVENTS'});result.textContent='EVENT全クリア完了: '+d.deleted_events+'件 / 定期rule '+d.deleted_rules+'件。次に「新しい同期用カレンダーを作成」→ ICS再インポートの順で進めてください。';}catch(error){result.textContent='EVENT全クリア失敗: '+(error instanceof Error?error.message:String(error));}finally{b.disabled=false}})}const old=document.getElementById('calendarSync');if(old){const button=old.cloneNode(true);old.replaceWith(button);button.addEventListener('click',async()=>{const out=document.getElementById('calendarResult');button.disabled=true;try{const r=await fetch('/api/google-calendar/sync',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({csrf})});const d=await r.json().catch(()=>({ok:false,error:'応答を解析できません'}));if(!r.ok||d.ok===false)throw new Error(d.error||('HTTP '+r.status));out.textContent=d.unchanged?'変更はありません':('送信 '+d.sent+'件 / エラー '+d.errors+'件'+(d.more?' / 続きあり（もう一度押してください）':''));}catch(error){out.textContent='同期失敗: '+(error instanceof Error?error.message:String(error));}finally{button.disabled=false}})}})();</script>`;
  source = source.replace('</body>', `${enhancement}</body>`);
  const headers = new Headers(response.headers);
  headers.delete('content-length');
  return new Response(source, { status: response.status, statusText: response.statusText, headers });
}
