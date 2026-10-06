import type {AppContext} from './app-context';
import {addCalendarDays} from './timezone';
import {taskVisibilitySql} from './task-visibility';
import {mealEnabled,mealWeek} from './meal-domain';
import {readMealPlan} from './meal-repository';
import {FAMILY_LOG_TYPE_META} from './family-log-type-meta';
import {IMPORTED_FAMILY_DIARY_SQL} from './imported-family-diary';

type Row=Record<string,any>;
const esc=(v:unknown)=>String(v??'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&#39;');
const card=(title:string,body:string)=>`<section class="card"><h2>${title}</h2>${body}</section>`;
const empty=(text:string)=>`<p class="small">${text}</p>`;
const limit=50;

export function familyDayHeader(date:string,today:string):string{
  return `<div class="daily-head"><h1>📘 その日の総括</h1><div class="date-nav"><a class="btn gray small" aria-label="前日を表示" href="/app/tasks.php?date=${addCalendarDays(date,-1)}">‹</a><strong>${esc(date)}</strong><a class="btn gray small" aria-label="翌日を表示" href="/app/tasks.php?date=${addCalendarDays(date,1)}">›</a><a class="btn gray small" href="/app/tasks.php?date=${today}">今日</a></div></div><form method="get" class="family-day-picker"><input type="hidden" name="view" value="day"><label>日付 <input type="date" name="date" value="${date}" required></label><button class="btn small">表示</button></form><p class="small">昨日以降はチェックリスト、一昨日以前は総括を表示します。予定と記録を分けて振り返れます。</p>`;
}

/** Read projections only. Never completes, deletes, generates AI, or repairs journals. */
export async function familyDayOverview(ctx:AppContext,date:string,today:string):Promise<string>{
  const m=ctx.member!,familyId=Number(m.family_id),db=ctx.env.DB;
  const tasks=async()=>{
    const rows=await db.prepare(`SELECT t.id,t.title,t.task_kind,t.start_at,t.end_at,t.due_at,t.status,t.visibility_scope
      FROM tasks t WHERE t.family_id=? AND ${taskVisibilitySql('t')}
      AND t.status IN ('pending','completed')
      AND (lower(COALESCE(t.task_kind,'task')) IN ('task','event'))
      AND ((t.start_at IS NOT NULL AND substr(t.start_at,1,10)<=? AND substr(COALESCE(t.end_at,t.start_at),1,10)>=?)
        OR (t.start_at IS NULL AND substr(t.due_at,1,10)=?))
      ORDER BY COALESCE(t.start_at,t.due_at),t.id LIMIT 101`).bind(familyId,m.id,date,date,date).all<Row>();
    const entries=rows.results.slice(0,100),events=entries.filter(x=>String(x.task_kind).toLowerCase()==='event'),pending=entries.filter(x=>String(x.task_kind).toLowerCase()!=='event'&&x.status==='pending');
    const row=(x:Row)=>`<li><a href="/task/view.php?id=${Number(x.id)}">${x.visibility_scope==='PRIVATE'?'🔒 ':''}${esc(x.title)}</a></li>`;
    const truncated=rows.results.length>100?empty('この日の先頭100件を表示しています。'):'';
    return card('📅 予定',empty('現在保存されている予定です。参加・実施の記録ではありません。')+(events.length?`<ul>${events.map(row).join('')}</ul>`:empty('保存された予定はありません。'))+truncated)+card('📝 未完了タスク',empty('現在も未完了の、この日に予定されていたタスクです。自動で完了・削除しません。')+(pending.length?`<ul>${pending.map(row).join('')}</ul>`:empty('該当する未完了タスクはありません。'))+truncated+`<a class="btn gray small" href="/app/tasks.php?date=${today}">今日のチェックリストへ</a>`);
  };
  const meals=async()=>{
    if(!mealEnabled(ctx.env))return card('🍚 献立',empty('献立機能は利用できません。'));
    const mealsDb=ctx.env.MEALS_DB!;
    const loadCooked=async()=>mealsDb.prepare('SELECT plan_revision FROM cooked_events WHERE family_id=? AND meal_date=? LIMIT 101').bind(familyId,date).all<Row>();
    const [plan,cooked]=await Promise.all([readMealPlan(mealsDb,familyId,mealWeek(date)),loadCooked()]);
    const item=plan?.items.find((x:Row)=>x.date===date);
    const matching=cooked.results.some(x=>x.plan_revision===plan?.revision);
    const names=item?[item.recipe,...(item.sides||[])].map((r:Row)=>esc(r.name)).join(' ／ '):'';
    const planned=item?`<p><strong>${names}</strong></p><p class="small">${plan?.status==='CONFIRMED'?'確定した予定':'下書きの予定'}・${Number(item.servings)}人分</p>`:empty('現在の週間献立に、この日の予定はありません。');
    const actual=empty(matching?'現在の献立に対する調理済みの記録があります。':cooked.results.length?'別の版の献立に対する調理済みの記録があります。料理名は現在の献立と一致するとは限りません。':'調理済みの記録はありません。食べた実績を示すものではありません。');
    return card('🍚 献立',planned+actual+`<a class="btn gray small" href="/app/meals.php?view=week&week=${mealWeek(date)}">この週の献立へ</a>`);
  };
  const logs=async()=>{
    const rows=await db.prepare(`SELECT l.occurred_at,l.log_type,l.value_text,l.note,s.name subject_name FROM family_logs l
      LEFT JOIN family_log_subjects s ON s.id=l.subject_id AND s.family_id=l.family_id
      WHERE l.family_id=? AND l.deleted_at IS NULL AND l.occurred_at>=? AND l.occurred_at<? AND NOT ${IMPORTED_FAMILY_DIARY_SQL}
      AND (COALESCE((SELECT show_adult_logs FROM family_log_settings WHERE family_id=l.family_id),1)=1 OR COALESCE(s.subject_kind,'')<>'ADULT')
      ORDER BY l.occurred_at,l.id LIMIT 51`).bind(familyId,`${date} 00:00:00`,`${addCalendarDays(date,1)} 00:00:00`).all<Row>();
    const entries=rows.results.length?`<ul>${rows.results.slice(0,limit).map(x=>{const meta=FAMILY_LOG_TYPE_META[x.log_type];return `<li>${esc(String(x.occurred_at).slice(11,16))} ${esc(meta?.icon||'📝')} ${esc(x.subject_name||'家族')}・${esc(meta?.label||x.log_type)}${x.value_text||x.note?`<p>${esc(String(x.value_text||x.note).slice(0,160))}</p>`:''}</li>`;}).join('')}</ul>${rows.results.length>limit?empty('先頭50件を表示しています。続きは家族ログで確認できます。'):''}`:empty('この日の家族ログはありません。');
    return card('👪 家族ログ',entries+`<a class="btn gray small" href="/app/family_log.php?date=${date}">家族ログの詳細・訂正</a>`);
  };
  const sections=await Promise.allSettled([tasks(),meals(),logs()]);
  return sections.map((result,i)=>result.status==='fulfilled'?result.value:card(['📅 予定・未完了タスク','🍚 献立','👪 家族ログ'][i],'<p role="status">読み込めませんでした。再読み込みして確認してください。</p>')).join('');
}
