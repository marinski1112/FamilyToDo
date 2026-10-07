import type {AppContext} from './app-context';
import {layout} from './app-shell';
import {html,redirect} from './response';
import {commitSession} from './session';
import {validateLiffNext} from './liff-target';
import {mealEnabled} from './meal-domain';
import {familyDate,DEFAULT_FAMILY_TIMEZONE} from './timezone';
export async function mealPage(ctx:AppContext):Promise<Response>{
 if(!ctx.member){const url=new URL(ctx.request?.url||'https://local.invalid/app/meals.php');const next=validateLiffNext(url.pathname+url.search)||'/app/meals.php';return redirect('/login.php?next='+encodeURIComponent(next));}
 if(!mealEnabled(ctx.env))return html(layout('ごはん','<div class="card"><h1>🍚 ごはん</h1><p>献立管理を準備しています。</p><a class="btn" href="/app/index.php">ホームへ</a></div>','/app/index.php'),503);
 if(!ctx.session.csrfToken)ctx.session.csrfToken=crypto.randomUUID();
 const payload=JSON.stringify({csrf:ctx.session.csrfToken,admin:['OWNER','ADMIN'].includes(String(ctx.member.role||'').toUpperCase()),liffId:String(ctx.env.LINE_LIFF_ID||''),today:familyDate(String(ctx.member.family_timezone||ctx.env.APP_TIMEZONE||DEFAULT_FAMILY_TIMEZONE))}).replaceAll('<','\\u003c').replaceAll('>','\\u003e').replaceAll('&','\\u0026');
 const body=`<link rel="stylesheet" href="/assets/meals.css?v=meal24"><div class="meal-app"><header class="page-head"><div><div class="small">毎日のごはんを、家族で</div><h1>🍚 ごはん</h1></div><a class="btn gray" href="/app/settings.php" aria-label="管理">⚙️</a></header><nav class="meal-tabs" aria-label="ごはんメニュー"><a href="/app/meals.php">今日</a><a href="/app/meals.php?view=week">今週の献立</a><a href="/app/meals.php?view=recipes">レシピ</a><a href="/app/meals.php?view=wishlist">食べたい</a><a href="/app/meals.php?view=inventory">在庫</a><a href="/app/meals.php?view=receipts">レシート</a><a href="/app/meals.php?view=baby">離乳食</a><a href="/app/meals.php?view=inbox">受信箱</a></nav><p id="mealStatus" role="status" aria-live="polite"></p><section id="mealContent" aria-busy="true"><p>ごはんの予定を読み込んでいます…</p></section><footer class="meal-footer">${['OWNER','ADMIN'].includes(String(ctx.member.role||'').toUpperCase())?'<a href="/app/meals.php?view=ai-check">AI接続診断</a>':''}<a href="/app/tasks.php#shopping-checklist">🛒 買い物リスト</a><a href="/app/home.php">🏠 家族の状況・日誌</a></footer></div><script id="mealPayload" type="application/json">${payload}</script><script defer src="/assets/meals-cooking.js?v=meal23"></script><script defer src="/assets/meals-live.js?v=meal23"></script><script defer src="/assets/meals.js?v=meal29"></script>`;
 const response=html(layout('ごはん',body,'/app/index.php'));response.headers.set('Cache-Control','private, no-store');return commitSession(response,ctx.session,ctx.env.APP_SECRET);
}
/** Per-response transformation avoids global feature state shared between requests. */
export async function withMealsNavigation(response:Response,env:Env):Promise<Response>{
 if(!mealEnabled(env)||!response.headers.get('content-type')?.includes('text/html'))return response;
 const text=await response.text(),body=text.replace('<span aria-hidden="true">🏠</span>ホーム</a>','<span aria-hidden="true">🍚</span>ごはん</a>');
 const headers=new Headers(response.headers);headers.delete('content-length');headers.delete('etag');headers.set('Cache-Control','private, no-store');return new Response(body,{status:response.status,headers});
}
