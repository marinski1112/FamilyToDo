import type { AppContext } from './app-context';
import { layout } from './app-shell';
import { dailyFortune } from './daily-fortune';
import { loadHomeDashboard } from './home-dashboard';
import { html, redirect } from './response';

const esc=(v:unknown)=>String(v??'')
  .replaceAll('&','&amp;')
  .replaceAll('<','&lt;')
  .replaceAll('>','&gt;')
  .replaceAll('"','&quot;')
  .replaceAll("'",'&#39;');
const dateOnly=(d=new Date())=>new Intl.DateTimeFormat('sv-SE',{
  timeZone:'Asia/Tokyo',year:'numeric',month:'2-digit',day:'2-digit',
}).format(d);

/** Canonical FamilyToDo home/dashboard page. */
export async function home(ctx:AppContext):Promise<Response>{
  const m=ctx.member;if(!m)return redirect('/liff?next=%2Fapp%2Findex.php');
  const today=dateOnly(),dashboard=await loadHomeDashboard(ctx,today),journal=dashboard.yesterdayJournal;
  const fortune=dailyFortune(Number(m.family_id),Number(m.id),today);
  const stars='★'.repeat(fortune.stars)+'☆'.repeat(5-fortune.stars);

  const alertLinks=[
    dashboard.overdueTasks>0?`<a class="home-alert danger" href="/app/tasks.php?date=${dashboard.today}"><span>⚠️</span><strong>期限切れタスク ${dashboard.overdueTasks}件</strong><small>確認する</small></a>`:'',
    dashboard.overdueShopping>0?`<a class="home-alert danger" href="/app/tasks.php?date=${dashboard.today}"><span>🛒</span><strong>期限切れ買い物 ${dashboard.overdueShopping}件</strong><small>確認する</small></a>`:'',
    dashboard.todayTasks>0?`<a class="home-alert" href="/app/tasks.php?date=${dashboard.today}"><span>✅</span><strong>今日の未完了タスク ${dashboard.todayTasks}件</strong><small>今日中</small></a>`:'',
    dashboard.unorganizedTasks>0?`<a class="home-alert muted-alert" href="/app/tasks.php?date=${dashboard.today}"><span>📋</span><strong>期限なし未整理 ${dashboard.unorganizedTasks}件</strong><small>整理する</small></a>`:'',
  ].filter(Boolean).join('');
  const alerts=alertLinks||'<div class="home-all-clear"><span>✓</span><div><strong>いま要対応の項目はありません</strong><small>期限切れや今日の未完了タスクが出るとここに表示します。</small></div></div>';

  const journalHref=`/app/family_journal.php?month=${dashboard.yesterday.slice(0,7)}&date=${dashboard.yesterday}`;
  const journalCard=journal?`<section class="card home-journal-card"><div class="section-head"><div><div class="eyebrow">YESTERDAY</div><h2>${journal.isAi?'✨ 昨日のAI日誌':'📖 昨日の家族日誌'}</h2></div><a class="home-text-link" href="${journalHref}">詳しく見る ›</a></div><p class="home-journal-text">${esc(journal.text)}</p><div class="home-journal-stats"><span>✅ 完了 ${journal.taskCount}</span><span>🧹 家事 ${journal.houseworkCount}</span><span>📍 滞在 ${journal.stayCount}</span></div></section>`:`<section class="card home-journal-card"><div class="section-head"><div><div class="eyebrow">YESTERDAY</div><h2>📖 昨日の家族日誌</h2></div><a class="home-text-link" href="/app/family_journal.php">日誌を開く ›</a></div><p class="small">昨日分の日誌はまだありません。日次集計後にここへ表示されます。</p></section>`;

  const fortuneCard=`<details class="card home-fortune"><summary>🔮 今日の占い <span aria-label="運勢 ${fortune.stars} / 5">${stars}</span></summary><p><strong>${esc(m.name)}さんの今日</strong></p><p>${esc(fortune.headline)}</p><p class="small">🍀 ${esc(fortune.luckyAction)} ・ 🎨 ${esc(fortune.luckyColor)}</p><p class="small">※ 娯楽用の占いです。健康・お金・仕事など大事な判断には使わないでください。</p><p class="small">プロフィール情報や予定・位置情報は占いの計算に使っていません。</p></details>`;

  const style=`<style>
.home-dashboard{display:grid;gap:14px}.home-dashboard .card{margin:0}.home-dashboard-hero{position:relative;padding:18px 52px 16px 2px}.home-dashboard-hero h1{margin:2px 0 5px;font-size:25px;line-height:1.2}.home-dashboard-hero p{margin:0;color:#64748b}.home-dashboard-hero .eyebrow,.home-journal-card .eyebrow{font-size:11px;font-weight:800;letter-spacing:.12em;color:#6366f1}.home-gear{position:absolute;right:0;top:10px;width:44px;height:44px;border-radius:14px;background:#fff;box-shadow:0 4px 18px #0f172a14;display:grid;place-items:center;text-decoration:none;font-size:21px}.home-section-title{display:flex;align-items:end;justify-content:space-between;gap:8px;margin:0 2px}.home-section-title h2{font-size:18px;margin:0}.home-section-title small{color:#64748b}.home-alert-list{display:grid;gap:8px}.home-alert{display:grid;grid-template-columns:28px 1fr auto;align-items:center;gap:8px;padding:12px 13px;border-radius:14px;background:#fff7ed;color:#7c2d12;text-decoration:none;border:1px solid #fed7aa}.home-alert.danger{background:#fff1f2;color:#9f1239;border-color:#fecdd3}.home-alert.muted-alert{background:#f8fafc;color:#475569;border-color:#e2e8f0}.home-alert small{font-size:11px;white-space:nowrap;opacity:.75}.home-all-clear{display:flex;gap:10px;align-items:center;padding:13px 14px;background:#f0fdf4;border:1px solid #bbf7d0;border-radius:14px;color:#166534}.home-all-clear>span{font-size:22px}.home-all-clear small{display:block;margin-top:2px;color:#64748b}.home-today-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:9px}.home-stat{display:flex;flex-direction:column;gap:3px;padding:13px;border-radius:15px;background:#fff;text-decoration:none;color:inherit;box-shadow:0 3px 16px #0f172a0d}.home-stat strong{font-size:23px}.home-stat span{font-size:13px;color:#475569}.home-journal-card .section-head{align-items:flex-start}.home-journal-card h2{margin:2px 0 0;font-size:18px}.home-text-link{font-size:12px;text-decoration:none;white-space:nowrap}.home-journal-text{font-size:15px;line-height:1.7;margin:12px 0}.home-journal-stats{display:flex;flex-wrap:wrap;gap:7px}.home-journal-stats span{background:#f8fafc;border-radius:999px;padding:5px 9px;font-size:12px;color:#475569}.home-shortcuts{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px}.home-shortcuts a{display:flex;min-height:64px;flex-direction:column;align-items:center;justify-content:center;gap:3px;background:#fff;border-radius:14px;text-decoration:none;color:inherit;font-size:12px;box-shadow:0 2px 12px #0f172a0a}.home-shortcuts a span{font-size:21px}.home-quick-actions{display:grid;grid-template-columns:1fr 1fr;gap:8px}.home-quick-actions .btn:first-child{grid-column:1/-1}.home-fortune summary{cursor:pointer;font-weight:700}.home-fortune[open] summary{margin-bottom:10px}@media(min-width:680px){.home-today-grid{grid-template-columns:repeat(4,minmax(0,1fr))}.home-shortcuts{grid-template-columns:repeat(6,minmax(0,1fr))}}
</style>`;

  const body=`${style}<div class="home-dashboard"><header class="home-dashboard-hero"><div class="eyebrow">FAMILY DASHBOARD</div><h1>🏠 ${esc(dashboard.familyName)}</h1><p>${esc(m.name)}さん、今日と昨日の家族の様子です。</p><a class="home-gear" href="/app/settings.php" aria-label="管理を開く" title="管理">⚙️</a></header><div class="home-section-title"><h2>要対応</h2><small>${esc(dashboard.today)}</small></div><section class="home-alert-list">${alerts}</section><div class="home-section-title"><h2>今日</h2><small>いまの状況</small></div><section class="home-today-grid"><a class="home-stat" href="/app/tasks.php?date=${dashboard.today}"><strong>${dashboard.todayTasks}</strong><span>✅ 未完了タスク</span></a><a class="home-stat" href="/app/calendar.php"><strong>${dashboard.todayEvents}</strong><span>📅 イベント</span></a><a class="home-stat" href="/app/shopping.php"><strong>${dashboard.shoppingRemaining}</strong><span>🛒 買い物残り</span></a><a class="home-stat" href="/app/family_log.php"><strong>${dashboard.familyLogToday}</strong><span>🐣 今日の家族ログ</span></a></section>${journalCard}<section><div class="home-section-title"><h2>ショートカット</h2><small>詳しく見る</small></div><div class="home-shortcuts"><a href="/app/tasks.php"><span>✅</span>チェックリスト</a><a href="/app/shopping.php"><span>🛒</span>買い物</a><a href="/app/family_journal.php"><span>📖</span>家族日誌</a><a href="/app/location.php"><span>📍</span>位置情報</a><a href="/app/family_log.php"><span>🐣</span>家族ログ</a><a href="/app/messages.php"><span>💬</span>伝言</a></div></section><section class="card"><div class="section-head"><h2>クイック追加</h2></div><div class="home-quick-actions"><a class="btn" href="/task/new.php?date=${today}&return=tasks">＋ タスク・イベント</a><a class="btn secondary" href="/item/new.php?date=${today}">＋ 持ち物</a><a class="btn secondary" href="/app/shopping_new.php?date=${today}">＋ 買い物</a></div></section>${fortuneCard}</div>`;
  return html(layout('ホーム',body,'/app/index.php'));
}
