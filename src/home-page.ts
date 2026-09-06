import type { AppContext } from './app-context';
import { layout } from './app-shell';
import { recurringForDate } from './recurrence-projection';
import { html, redirect } from './response';
import { taskChildVisibilitySql, taskVisibilitySql } from './task-visibility';
import { dailyFortune } from './daily-fortune';

type Row=Record<string,unknown>;

const esc=(v:unknown)=>String(v??'')
  .replaceAll('&','&amp;')
  .replaceAll('<','&lt;')
  .replaceAll('>','&gt;')
  .replaceAll('"','&quot;')
  .replaceAll("'",'&#39;');
const dateOnly=(d=new Date())=>new Intl.DateTimeFormat('sv-SE',{
  timeZone:'Asia/Tokyo',year:'numeric',month:'2-digit',day:'2-digit',
}).format(d);

/** Canonical retained FamilyToDo home/dashboard page. */
export async function home(ctx:AppContext):Promise<Response>{
  const m=ctx.member;if(!m)return redirect('/liff?next=%2Fapp%2Findex.php');
  const family=await ctx.env.DB.prepare('SELECT * FROM families WHERE id=? LIMIT 1').bind(m.family_id).first<Row>();
  const today=dateOnly();const td=new Date(`${today}T12:00:00Z`);td.setUTCDate(td.getUTCDate()+1);const tomorrowDate=td.toISOString().slice(0,10);
  const taskRowsForDate=(date:string)=>ctx.env.DB.prepare(`SELECT id,status,task_kind FROM tasks t WHERE family_id=? AND ${taskVisibilitySql('t')} AND status IN ('pending','completed') AND (task_kind IS NULL OR lower(task_kind) NOT IN ('recurring','recurrence_template')) AND ((start_at IS NOT NULL AND date(start_at)<=date(?) AND (end_at IS NULL OR date(end_at)>=date(?))) OR (start_at IS NULL AND due_at IS NOT NULL AND date(due_at)=date(?)))`).bind(m.family_id,m.id,date,date,date).all<Row>();
  const [todayPhysical,tomorrowPhysical,todayRecurring,tomorrowRecurring,shoppingCount,messageCount,familyLogCount]=await Promise.all([
    taskRowsForDate(today),taskRowsForDate(tomorrowDate),recurringForDate(ctx,today),recurringForDate(ctx,tomorrowDate),
    ctx.env.DB.prepare(`SELECT count(*) c FROM shopping_items s WHERE s.family_id=? AND s.status='pending' AND ${taskChildVisibilitySql('s')}`).bind(m.family_id,m.id).first<Row>(),
    ctx.env.DB.prepare("SELECT count(*) c FROM messages WHERE family_id=?").bind(m.family_id).first<Row>(),
    ctx.env.DB.prepare("SELECT count(*) c FROM family_logs WHERE family_id=? AND deleted_at IS NULL AND date(occurred_at)=date(?)").bind(m.family_id,today).first<Row>()
  ]);
  const summarize=(physical:Row[],recurring:Row[])=>({
    tasks:physical.filter(r=>String(r.task_kind||'').toLowerCase()!=='event'&&String(r.status||'pending')==='pending').length+recurring.filter(r=>String(r.status||'pending')==='pending').length,
    events:physical.filter(r=>String(r.task_kind||'').toLowerCase()==='event').length
  });
  const todaySummary=summarize(todayPhysical.results,todayRecurring),tomorrowSummary=summarize(tomorrowPhysical.results,tomorrowRecurring);
  const fortune=dailyFortune(Number(m.family_id),Number(m.id),today);
  const stars='★'.repeat(fortune.stars)+'☆'.repeat(5-fortune.stars);
  const fortuneCard=`<div class="card"><div class="section-head"><h2>🔮 今日の占い</h2></div><p><strong>${esc(m.name)}さんの今日</strong> <span aria-label="運勢 ${fortune.stars} / 5">${stars}</span></p><p>${esc(fortune.headline)}</p><p class="small">🍀 ラッキーアクション：${esc(fortune.luckyAction)}<br>🎨 ラッキーカラー：${esc(fortune.luckyColor)}</p><p class="small">※ 娯楽用の占いです。健康・お金・仕事など大事な判断には使わないでください。プロフィール情報や予定・位置情報は占いの計算に使っていません。</p></div>`;
  const body=`<div class="home-hero"><div class="eyebrow">Family TODO LINE</div><h1>🏠 ${esc(family?.name||'家族')}</h1><p>${esc(m.name)} さん、今日の家族予定を確認しましょう。</p></div>${fortuneCard}<div class="menu home-menu"><a class="task-events" href="/app/tasks.php"><span class="menu-icon">✅</span><strong>タスク・イベント</strong><small>今日: タスク ${todaySummary.tasks}件${todaySummary.events?` / イベント ${todaySummary.events}件`:''} ・ 明日: タスク ${tomorrowSummary.tasks}件${tomorrowSummary.events?` / イベント ${tomorrowSummary.events}件`:''}</small></a><a class="calendar" href="/app/calendar.php"><span class="menu-icon">📅</span><strong>カレンダー</strong><small>タスク・イベント・祝日</small></a><a class="shopping" href="/app/shopping.php"><span class="menu-icon">🛒</span><strong>買い物</strong><small>${Number(shoppingCount?.c||0)}件</small></a><a class="family-log" href="/app/family_log.php"><span class="menu-icon">🐣</span><strong>家族ログ</strong><small>今日 ${Number(familyLogCount?.c||0)}件</small></a><a class="message" href="/app/messages.php"><span class="menu-icon">💬</span><strong>伝言</strong><small>${Number(messageCount?.c||0)}件</small></a><a class="settings" href="/app/settings.php"><span class="menu-icon">⚙️</span><strong>管理</strong><small>家族・通知・定期タスク</small></a></div><div class="card quick-card"><div class="section-head"><h2>クイック操作</h2></div><div class="quick-actions"><a class="btn" href="/task/new.php?date=${today}&return=tasks">＋ タスク・イベント</a><a class="btn secondary" href="/item/new.php?date=${today}">＋ 持ち物</a><a class="btn secondary" href="/app/shopping_new.php?date=${today}">＋ 買い物</a></div></div>`;
  return html(layout('Family TODO LINE',body,'/app/index.php'));
}
